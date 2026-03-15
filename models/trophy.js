var mongoose = require("mongoose");

var trophySchema = new mongoose.Schema({
  year: Number,
  userRank: Number,
  totalPlayers: Number,
  score: Number,
  madeAllPicks: { type: Boolean, default: null }, // null = unknown (historical), true/false = verified
});

module.exports = mongoose.model("Trophy", trophySchema);
