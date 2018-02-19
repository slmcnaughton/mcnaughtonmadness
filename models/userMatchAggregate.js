var mongoose = require("mongoose");

var userMatchAggregateSchema = new mongoose.Schema({
    
    matchNumber: Number,
    matchReference: 
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Match"
        },
    numTeams: Number,
    
    topTeamPickers: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        }
    ],
    topWinScore: Number,
    topLossScore: Number,
    
    bottomTeamPickers: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        }
    ],
    bottomWinScore: Number,
    bottomLossScore: Number,
    
    

});


module.exports = mongoose.model("Tournament", userMatchAggregateSchema);