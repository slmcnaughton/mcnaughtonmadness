var mongoose = require("mongoose");

var matchSchema = new mongoose.Schema({
    
    matchNumber: Number,
    teams: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Team"
        }
    ],
    winner: 
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Team"
        },
    nextMatch: Number
    
});

module.exports = mongoose.model("Match", matchSchema);