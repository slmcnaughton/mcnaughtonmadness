var mongoose = require("mongoose");

var teamImageSchema = new mongoose.Schema({
  name: String,
  image: String,
});

module.exports = mongoose.model("TeamImage", teamImageSchema);
