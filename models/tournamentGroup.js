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
    tournamentReference: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tournament"
        },
        year: Number
    },
    submissionDeadline: [
        { 
            type: Date 
        },  //moment js... , default: Date.now
    ],
    commissioner: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        name: String
    },
});


module.exports = mongoose.model("TournamentGroup", tournamentGroupSchema);