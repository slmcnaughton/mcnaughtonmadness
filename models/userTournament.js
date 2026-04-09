var mongoose = require("mongoose");

var tournamentGroupRefSchema = new mongoose.Schema({
  id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TournamentGroup",
  },
  groupName: String,
}, { _id: false, id: false });

var userRefSchema = new mongoose.Schema({
  id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  username: String,
  firstName: String,
  lastName: String,
}, { _id: false, id: false });

var tournamentRefSchema = new mongoose.Schema({
  id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Tournament",
  },
  year: Number,
}, { _id: false, id: false });

var userTournamentSchema = new mongoose.Schema({
  score: Number,

  //Round 7 is final four
  //Round 8 is champion

  tournamentGroup: tournamentGroupRefSchema,

  user: userRefSchema,
  tournamentReference: tournamentRefSchema,
  userRounds: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserRound",
    },
  ],
});

module.exports = mongoose.model("UserTournament", userTournamentSchema);
