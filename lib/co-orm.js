'use strict';

var thunkify		= require('thunkify'),
	orm		= require('orm'),
	events	= require('events');

var ucfirst = require('./helpers.js').ucfirst;

exports.coConnect = function (configs,callback) {
	var db = orm.connect(configs,callback);
	setupConnectionMethods(db);
	return db;
};

function toThunkify(func,caller,done){
	if(done){
		return thunkify(function(){
			var args = Array.prototype.slice.call(arguments);
			var _done = args[args.length-1];
			args[args.length-1] = function(){
				done.apply(_done,Array.prototype.slice.call(arguments,1,arguments.length));
				_done.apply(_done,arguments);
			};
			func.apply(caller||this,args);
		});
	}else{
		return thunkify(function(){
			func.apply(caller||this,arguments);
		});
	}
}

function setupConnectionMethods(connection) {

	connection.coDefine = defineModel.bind(connection);
	connection.coExecQuery = toThunkify(connection.driver.execQuery,connection.driver);

	return connection;
}

function defineModel(name, properties, opts) {
	var connection = this;

	if (!opts) {
		opts = {};
	}
	var Model = connection.define(name, properties, opts);

	Model.events = new events.EventEmitter();

	Model.oneAssociations = [];
	Model.manyAssociations = [];

	definedCoRunMethod(Model,"find");
	definedCoRunMethod(Model,"all");

	Model.coCreate = toThunkify(Model.create,Model,extendInstance);

	Model.coGet = toThunkify(Model.get,Model,extendInstance);

	Model.coOne = toThunkify(Model.one,Model,extendInstance);

	Model.coAll = toThunkify(Model.all,Model,extendInstance);

	Model.coCount = toThunkify(Model.count,Model);

	Model.coFind = toThunkify(Model.find,Model,extendInstance);

	Model.coHasOne = hasOne.bind(Model);
	Model.coHasMany = hasMany.bind(Model);

	setupOneAssociations(Model, opts.hasOne);
	setupManyAssociations(Model, opts.hasMany);
	
	return Model;

}

function hasOne() {
	var Model = this;

	var opts = {};

	var name;
	var OtherModel = Model;

	for (var i = 0; i < arguments.length; i++) {
		switch (typeof arguments[i]) {
			case "string":
				name = arguments[i];
				break;
			case "function":
				if (arguments[i].table) {
					OtherModel = arguments[i];
				}
				break;
			case "object":
				opts = arguments[i];
				break;
		}
	}

	Model.hasOne(name, OtherModel, opts);

	setUpOneAssociation(name, Model, OtherModel, opts);

	if (opts.reverse) {
		setUpManyAssociation(opts.reverse, OtherModel, Model, {
			accessor: opts.reverseAccessor
		});
	}
}

function hasMany() {
	var Model = this;

	var name;
	var OtherModel = Model;
	var props = null;
	var opts = {};

	for (var i = 0; i < arguments.length; i++) {
		switch (typeof arguments[i]) {
			case "string":
				name = arguments[i];
				break;
			case "function":
				OtherModel = arguments[i];
				break;
			case "object":
				if (props === null) {
					props = arguments[i];
				} else {
					opts = arguments[i];
				}
				break;
		}
	}

	Model.hasMany(name, OtherModel, props, opts);

	setUpManyAssociation(name, Model, OtherModel, opts);

	if (opts.reverse) {
		setUpManyAssociation(opts.reverse, OtherModel, Model, {
			accessor: opts.reverseAccessor
		});
	}
}

function extendInstanceWithAssociation(Instance, association) {

	function extendInstanceForAssociation(instance) {
		return extendInstance(instance, association.model);
	}

	definedCoRunMethod(Instance,association.getAccessor);

	Object.defineProperty(Instance, 'co'+ucfirst(association.hasAccessor), {
		value: toThunkify(Instance[association.hasAccessor],Instance,extendInstanceForAssociation),
		enumerable: false
	});
	Object.defineProperty(Instance, 'co'+ucfirst(association.getAccessor), {
		value: toThunkify(Instance[association.getAccessor],Instance,extendInstanceForAssociation),
		enumerable: false
	});
	Object.defineProperty(Instance, 'co'+ucfirst(association.setAccessor), {
		value: toThunkify(Instance[association.setAccessor],Instance,extendInstanceForAssociation),
		enumerable: false
	});
	if (!association.reversed) {
		Object.defineProperty(Instance, 'co'+ucfirst(association.delAccessor), {
			value:toThunkify(Instance[association.delAccessor],Instance,extendInstanceForAssociation),
			enumerable: false
		});
	}
	if (association.addAccessor) {
		Object.defineProperty(Instance, 'co'+ucfirst(association.addAccessor), {
			value: toThunkify(Instance[association.addAccessor],Instance,extendInstanceForAssociation),
			enumerable: false
		});
	}
}

function extendInstance(instances, MyModel) {

	if (instances === null || instances === []) {
		return null;
	}

	if (Array.isArray(instances)) {
		instances.forEach(function (instance) {
			return extendInstance(instance, MyModel);
		});
        return;
	}

	var instance = instances;

	if(!instance)return instance;

	if (instance.isExtended) {
		return instance;
	}

	if (!MyModel) {
		MyModel = instance.model();
	}

	Object.defineProperty(instance, 'coSave', {
		value: toThunkify(instance.save, instance),
		enumerable: false
	});

	Object.defineProperty(instance, 'coRemove', {
		value: toThunkify(instance.remove, instance),
		enumerable: false
	});

	Object.defineProperty(instance, 'coValidate', {
		value: toThunkify(instance.validate, instance),
		enumerable: false
	});

	var i;
	for (i = 0; MyModel.oneAssociations && (i < MyModel.oneAssociations.length); i++) {
		extendInstanceWithAssociation(instance, MyModel.oneAssociations[i]);
	}

	for (i = 0; MyModel.manyAssociations && (i < MyModel.manyAssociations.length); i++) {
		extendInstanceWithAssociation(instance, MyModel.manyAssociations[i]);
	}

	Object.defineProperty(instance, 'isExtended', {
		value: true,
		enumerable: false
	});

	if (MyModel.coAfterLoad) {
		return MyModel.coAfterLoad.apply(instance);
	}

	return instance;
}

function setUpOneAssociation(name, Model, OtherModel, opts) {
	var assocName = opts.name || ucfirst(name);
	var assocTemplateName = opts.accessor || assocName;

	var association = {
		model		   : OtherModel,
		getAccessor    : opts.getAccessor || ("get" + assocTemplateName),
		setAccessor    : opts.setAccessor || ("set" + assocTemplateName),
		hasAccessor    : opts.hasAccessor || ("has" + assocTemplateName),
		delAccessor    : opts.delAccessor || ("remove" + assocTemplateName)
	};
	Model.oneAssociations.push(association);
	Model["coFindBy" + assocTemplateName] = toThunkify(Model["findBy" + assocTemplateName], Model);
}

function setUpManyAssociation(name, Model, OtherModel, opts) {
	var assocName = opts.name || ucfirst(name);
	var assocTemplateName = opts.accessor || assocName;

	var association = {
		model		   : OtherModel,
		getAccessor    : opts.getAccessor || ("get" + assocTemplateName),
		setAccessor    : opts.setAccessor || ("set" + assocTemplateName),
		hasAccessor    : opts.hasAccessor || ("has" + assocTemplateName),
		delAccessor    : opts.delAccessor || ("remove" + assocTemplateName),
		addAccessor    : opts.addAccessor || ("add" + assocTemplateName)
	};
	Model.manyAssociations.push(association);
}

function setupOneAssociations(Model, hasOne) {
	if (!hasOne) {
		return;
	}

	var assoc;
	for (var name in hasOne) {
		assoc = hasOne[name];
		Model.coHasOne(name, assoc.model, assoc.opts);
	}
}

function setupManyAssociations(Model, hasMany) {
	if (!hasMany) {
		return;
	}

	var assoc;
	for (var name in hasMany) {
		assoc = hasMany[name];
		Model.coHasMany(name, assoc.model, assoc.extra, assoc.opts);
	}
}

function definedCoRunMethod(obj,method){
	var _m = obj[method];
	obj[method] = function(){
		var c = _m.apply(this,arguments);
		c.coRun = toThunkify(c.run,c);
		if(c.remove){
			c.coRemove = thunkify(c.remove,c);
		}
		if(c.save){
			c.coSave = thunkify(c.save,c);
		}
		return c;
	};
}