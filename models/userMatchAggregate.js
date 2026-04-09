var mongoose = require("mongoose");

var pickerSchema = new mongoose.Schema({
  id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  firstName: String,
  comment: String,
}, { _id: false, id: false });

var userMatchAggregateSchema = new mongoose.Schema({
  tournamentGroup: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TournamentGroup",
  },
  matchNumber: Number,
  matchReference: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Match",
  },
  // numTeams: Number,

  topTeamPickers: [pickerSchema],
  topWinScore: Number,
  topLossScore: Number,

  bottomTeamPickers: [pickerSchema],
  bottomWinScore: Number,
  bottomLossScore: Number,
});

module.exports = mongoose.model("UserMatchAggregate", userMatchAggregateSchema);
