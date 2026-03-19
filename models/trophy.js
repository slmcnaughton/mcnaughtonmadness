var mongoose = require("mongoose");

var trophySchema = new mongoose.Schema({
  year: Number,
  userRank: Number,
  totalPlayers: Number,
  score: Number,
  madeAllPicks: { type: Boolean, default: null }, // null = unknown (historical), true/false = verified
  // Per-group trophy fields (null for legacy/pre-group trophies → displayed as "McNaughton Family Group")
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "TournamentGroup", default: null },
  groupName: { type: String, default: null },
});

module.exports = mongoose.model("Trophy", trophySchema);
