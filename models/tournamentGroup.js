var mongoose = require("mongoose");

var tournamentGroupSchema = new mongoose.Schema({
    
    groupName: 
        {
            type: String,
            // unique: true
        },
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
    bonusAggregates: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "BonusAggregate"
        }
    ],
    tournamentReference: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tournament"
        },
        year: Number
    },
    commissioner: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        name: String
    },
});


module.exports = mongoose.model("TournamentGroup", tournamentGroupSchema);