var mongoose = require("mongoose");

var userTournamentSchema = new mongoose.Schema({
  score: Number,

  //Round 7 is final four
  //Round 8 is champion

  tournamentGroup: {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TournamentGroup",
    },
    groupName: String,
  },

  user: {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    username: String,
    firstName: String,
    lastName: String,
  },
  tournamentReference: {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
    },
    year: Number,
  },
  userRounds: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserRound",
    },
  ],
});

module.exports = mongoose.model("UserTournament", userTournamentSchema);
