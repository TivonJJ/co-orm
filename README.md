
> Recommend a better framework [‘sequelize’](https://github.com/sequelize/sequelize);
> Based promise,you can use yiled or callback，Quick update, quick reply，Strongly recommended!

# co-orm
co-based wrapper for node-orm2

This lib supplies yiled methods for your habitual node-orm2 objects:

##install##
`npm install co-orm`
##useage##

```js
var orm = require('orm');
var coOrm = require('co-orm');
coOrm.coConnect("mysql://username:password@host/database", function (err, db) {
	if (err)
		console.error('mysql connection', err);
	else {
		demo(db);
	}

});

function demo(db){
	var Person = db.coDefine("User", {
        name      : String,
        surname   : String,
        age       : Number,
        male      : Boolean,
        continent : [ "Europe", "America", "Asia", "Africa", "Australia", "Antartica" ], // ENUM type
        photo     : Buffer, // BLOB/BINARY
        data      : Object // JSON encoded
    }

	var Animal = db.coDefine("Animal",{
		name:String,
		age:Number
	})

	var personList = yield Person.coAll();

	var jack = yield Person.coFind({name:"jack"});
	jack.name = "new name";
	yield jack.coSave();
	
	yield Person.find({male:true}).order("id").offset(1).coRun();

	Animal.coHasOne("owner",Person);

	var tom = yield Animal.coGet(123);
	var owner = yield tom.coGetOwner()
});
}
```

#Supported methods#

coOrm.coConnect
db.coDefine, db.coExecQuery
Model.coCreate, Model.coGet, Model.coOne, Model.coAll, Model.coCount, Model.coHasOne, Model.coHasMany,Model.coRun,Model.coFind
instance.coSave, instance.coRemove, instance.coValidate

> more ORM2 API [https://github.com/dresende/node-orm2](https://github.com/dresende/node-orm2)

#other#
use [Pagination](http://dresende.github.io/node-orm-paging/)

```
var page = yield Person.page(1).coRun();
```
