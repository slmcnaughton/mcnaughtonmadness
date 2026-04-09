var mongoose = require("mongoose");

var userRefSchema = new mongoose.Schema({
  id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  name: String,
}, { _id: false, id: false });

var roundRefSchema = new mongoose.Schema({
  id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Round",
  },
  numRound: Number,
}, { _id: false, id: false });

var userRoundSchema = new mongoose.Schema({
  roundScore: Number,
  possiblePointsRemaining: Number,

  user: userRefSchema,

  //reference the actual round
  round: roundRefSchema,
  //reference an array of user predictions
  userMatchPredictions: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserMatchPrediction",
    },
  ],
});

module.exports = mongoose.model("UserRound", userRoundSchema);
