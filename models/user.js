var mongoose = require("mongoose");
var passportLocalMongoose = require("passport-local-mongoose");

var UserSchema = new mongoose.Schema({
    username: {type: String, required: true, unique: true},
    password: {type: String, required: true},
    isAdmin: {type: Boolean, default: false},
    //Other things we can add
    image: String,
    firstName: String,
    lastName: String,
    email: {type: String, required: true},
    trophies: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Trophy"
        }
    ],
    tournamentGroups: [ {
            id: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "TournamentGroup"
            },
            groupName: String,
            year: Number
        }
    ],
    resetPasswordToken: String,
    resetPasswordExpires: Date
    //newUser.isAdmin = true;
    //use something like: || currentUser && currentUser.isAdmin
});



UserSchema.plugin(passportLocalMongoose);   //gives some methods to our user

module.exports = mongoose.model("User", UserSchema);