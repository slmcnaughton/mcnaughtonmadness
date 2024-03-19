var mongoose = require("mongoose");

var teamSchema = new mongoose.Schema({
  name: String,
  seed: Number,
  region: String,
  firstMatchNum: Number,
  image: {
    type: String,
    default:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Basketball.png/170px-Basketball.png",
  },
  lost: Number,
});

module.exports = mongoose.model("Team", teamSchema);
