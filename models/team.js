var mongoose = require("mongoose");

var teamSchema = new mongoose.Schema({
  name: String,
  seed: Number,
  region: String,
  firstMatchNum: Number,
  image: {
    type: String,
    default: "/imgs/basketball-default.svg",
  },
  lost: Number,
  aliases: [String],
});

module.exports = mongoose.model("Team", teamSchema);
