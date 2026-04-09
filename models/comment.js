var mongoose = require("mongoose");

var authorSchema = new mongoose.Schema({
  id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  username: String,
  firstName: String,
}, { _id: false, id: false });

var commentSchema = new mongoose.Schema({
  text: "String",
  author: authorSchema,
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Comment", commentSchema);
