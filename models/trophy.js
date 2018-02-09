var mongoose = require("mongoose");

var trophySchema = new mongoose.Schema({
    year: Number,
    userRank: Number,
    totalPlayers: Number,
    score: Number
});

module.exports = mongoose.model("Trophy", trophySchema);