var mongoose = require("mongoose");
var passportLocalMongoose = require("passport-local-mongoose").default || require("passport-local-mongoose");

var tournamentGroupRefSchema = new mongoose.Schema({
  id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TournamentGroup",
  },
  groupName: String,
  year: Number,
  isOfficial: { type: Boolean, default: false },
}, { _id: false, id: false });

var UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String },
  isAdmin: { type: Boolean, default: false },
  //Other things we can add
  image: String,
  firstName: String,
  lastName: String,
  email: { type: String, required: true },
  trophies: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trophy",
    },
  ],
  tournamentGroups: [tournamentGroupRefSchema],
  familyTreeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "FamilyMember",
  },
  pendingFirstName: String,
  pendingLastName: String,
  nameChangeRequestedAt: Date,
  pendingConnectionType: String,
  pendingConnectionName: String,
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  //newUser.isAdmin = true;
  //use something like: || currentUser && currentUser.isAdmin
});

UserSchema.plugin(passportLocalMongoose); //gives some methods to our user

module.exports = mongoose.model("User", UserSchema);
