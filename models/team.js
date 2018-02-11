var mongoose = require("mongoose");

var teamSchema = new mongoose.Schema({
    
    name: String,
    seed: Number,
    region: String
    
});

module.exports = mongoose.model("Team", teamSchema);