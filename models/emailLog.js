var mongoose = require("mongoose");

var emailLogSchema = new mongoose.Schema({
  emailType: {
    type: String,
    enum: [
      "roundSummary",
      "pickReminder",
      "passwordRecovery",
      "usernameRecovery",
      "passwordConfirmation",
      "nameChangeNotification",
      "finalStandings",
      "lateBonusPicks",
      "bonusPicksApproved",
      "bonusPicksRejected",
      "other",
    ],
    default: "other",
  },
  groupName: String,
  subject: String,
  recipients: [String],
  recipientCount: Number,
  status: {
    type: String,
    enum: ["sent", "failed"],
    default: "sent",
  },
  error: String,
  providerMessageId: String,
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("EmailLog", emailLogSchema);
