var mongoose = require("mongoose");

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
  team: {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
    },
    name: String,
    image: String,
  },
  teamPickers: [
    {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      firstName: String,
      comment: String,
    },
  ],
});

module.exports = mongoose.model("BonusAggregate", bonusAggregateSchema);
