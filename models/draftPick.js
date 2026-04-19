var mongoose = require("mongoose");

var draftPickEntrySchema = new mongoose.Schema({
  matchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Match",
  },
  matchNumber: Number,
  winner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Team",
  },
  comment: String,
}, { _id: false });

var draftPickSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  tournamentGroup: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TournamentGroup",
  },
  numRound: Number,
  picks: [draftPickEntrySchema],
  updatedAt: { type: Date, default: Date.now },
  autoSubmitted: { type: Boolean, default: false },
});

// Compound index for efficient lookups and upserts
draftPickSchema.index({ user: 1, tournamentGroup: 1, numRound: 1 }, { unique: true });

module.exports = mongoose.model("DraftPick", draftPickSchema);
