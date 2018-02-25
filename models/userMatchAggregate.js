var mongoose = require("mongoose");

var userMatchAggregateSchema = new mongoose.Schema({
    
    matchNumber: Number,
    matchReference: 
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Match"
        },
    // numTeams: Number,
    
    topTeamPickers: [
        {
            id: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User"
            },
            firstName: String,
            comment: String
        }
    ],
    topWinScore: Number,
    topLossScore: Number,
    
    bottomTeamPickers: [
        {
            id: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User"
            },
            firstName: String,
            comment: String
        }
    ],
    bottomWinScore: Number,
    bottomLossScore: Number,
    

});


module.exports = mongoose.model("UserMatchAggregate", userMatchAggregateSchema);