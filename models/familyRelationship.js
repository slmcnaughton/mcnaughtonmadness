var mongoose = require("mongoose");

var familyRelationshipSchema = new mongoose.Schema({
  from: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "FamilyMember",
    required: true,
  },
  to: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "FamilyMember",
    required: true,
  },
  type: {
    type: String,
    enum: ["parent", "spouse", "fiance", "dating", "sibling", "friend", "colleague"],
    required: true,
  },
  // Self-service: a family member can propose changing the relationship type
  pendingType: {
    type: String,
    enum: ["spouse", "fiance", "dating", null],
  },
  pendingRequestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  pendingRequestedAt: Date,
  createdAt: { type: Date, default: Date.now },
});

familyRelationshipSchema.index({ from: 1, to: 1 });
familyRelationshipSchema.index({ from: 1 });
familyRelationshipSchema.index({ to: 1 });

module.exports = mongoose.model("FamilyRelationship", familyRelationshipSchema);
