var mongoose = require("mongoose");

var tournamentGroupSchema = new mongoose.Schema({
    
    year: Number,
    groupName: 
        {
            type: String,
        },
    groupMotto: String,
    commissioner: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        name: String
    },
    publicGroup: Boolean,
    secretCode: String,
    currentRound: Number,
    comments: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Comment"
        }
    ],
    tournamentReference: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tournament"
        },
        year: Number
    },
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
    ]
   
});


module.exports = mongoose.model("TournamentGroup", tournamentGroupSchema);