var mongoose = require("mongoose");

var teamSchema = new mongoose.Schema({
  id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Team",
  },
  name: String,
  image: String,
}, { _id: false, id: false });

var teamPickerSchema = new mongoose.Schema({
  id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  firstName: String,
  comment: String,
}, { _id: false, id: false });

var bonusAggregateSchema = new mongoose.Schema({
  matchNumber: Number,
  matchReference: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Match",
  },
  tournamentGroup: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TournamentGroup",
  },
  team: teamSchema,
  teamPickers: [teamPickerSchema],
});

module.exports = mongoose.model("BonusAggregate", bonusAggregateSchema);
