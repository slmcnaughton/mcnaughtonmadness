var mongoose = require("mongoose");

var feedbackAuthorSchema = new mongoose.Schema({
  id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  username: String,
  firstName: String,
  lastName: String,
}, { _id: false, id: false });

var feedbackSchema = new mongoose.Schema({
  category: {
    type: String,
    enum: ["bug", "feature", "general"],
    default: "general",
  },
  message: {
    type: String,
    required: true,
  },
  pageContext: String,
  author: feedbackAuthorSchema,
  status: {
    type: String,
    enum: ["new", "read", "resolved"],
    default: "new",
  },
  adminNotes: String,
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Feedback", feedbackSchema);
