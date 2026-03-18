var mongoose = require("mongoose");

var familyMemberSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  image: String,
  deceased: { type: Boolean, default: false },
  approved: { type: Boolean, default: true },
  notes: String,
  createdAt: { type: Date, default: Date.now },
});

familyMemberSchema.index({ user: 1 });

module.exports = mongoose.model("FamilyMember", familyMemberSchema);
