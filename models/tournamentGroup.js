var mongoose = require("mongoose");

var commissionerSchema = new mongoose.Schema({
  id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  name: String,
}, { _id: false, id: false });

var tournamentReferenceSchema = new mongoose.Schema({
  id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Tournament",
  },
  year: Number,
}, { _id: false, id: false });

var tournamentGroupSchema = new mongoose.Schema({
  year: Number,
  groupName: {
    type: String,
  },
  groupMotto: String,
  commissioner: commissionerSchema,
  publicGroup: Boolean,
  isOfficial: { type: Boolean, default: false },
  secretCode: String,
  currentRound: Number,
  comments: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Comment",
    },
  ],
  tournamentReference: tournamentReferenceSchema,
  userTournaments: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserTournament",
    },
  ],
  userMatchAggregates: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserMatchAggregate",
    },
  ],
  bonusAggregates: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BonusAggregate",
    },
  ],
});

module.exports = mongoose.model("TournamentGroup", tournamentGroupSchema);
