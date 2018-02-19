var mongoose = require("mongoose");

var tournamentGroupSchema = new mongoose.Schema({
    
    groupName: String,
    currentRound: Number,
    userTournaments: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "UserTournament"
        }
    ],
    userMatchAggregates: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "UserMatchAggregate"
        }
    ],
    tournamentReference: 
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tournament"
        },
    submissionDeadline: [
        { 
            type: Date 
        },  //moment js... , default: Date.now
    ]
});


module.exports = mongoose.model("Tournament", tournamentGroupSchema);