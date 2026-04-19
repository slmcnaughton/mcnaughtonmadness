var mongoose = require("mongoose");

var matchSchema = new mongoose.Schema({
  id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Match",
  },
  matchNumber: Number,
}, { _id: false, id: false });

var userMatchPredictionSchema = new mongoose.Schema({
  score: Number,
  numRound: Number,
  match: matchSchema,
  winner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Team",
  },
  comment: String,
  late: { type: Boolean, default: false },
});

module.exports = mongoose.model(
  "UserMatchPrediction",
  userMatchPredictionSchema,
);
