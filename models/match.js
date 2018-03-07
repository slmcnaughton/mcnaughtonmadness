var mongoose = require("mongoose");

var matchSchema = new mongoose.Schema({
    
    matchNumber: Number,
    topTeam: 
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Team"
        },
    bottomTeam:
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Team"
        },
    winner: 
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Team"
        },
    nextMatch: Number
    
});

module.exports = mongoose.model("Match", matchSchema);