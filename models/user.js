var mongoose = require("mongoose");
var passportLocalMongoose = require("passport-local-mongoose");

var UserSchema = new mongoose.Schema({
    username: String,
    password: String,
    isAdmin: {type: Boolean, default: false},
    //Other things we can add
    image: String,
    firstName: String,
    lastName: String,
    email: String,
    trophies: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Trophy"
        }
    ]
    //newUser.isAdmin = true;
    //use something like: || currentUser && currentUser.isAdmin
});



UserSchema.plugin(passportLocalMongoose);   //gives some methods to our user

module.exports = mongoose.model("User", UserSchema);