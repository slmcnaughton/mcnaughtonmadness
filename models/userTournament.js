var mongoose = require("mongoose");

var userTournamentSchema = new mongoose.Schema({
    
    score: Number,
    
    //Round 7 is final four
    //Round 8 is champion
    
    user: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        firstName: String,
        lastName: String,
    },
    tournamentReference: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Tournament"
        },
        year: Number
    },
    userRounds: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "UserRound"
        }
    ],
    

});


module.exports = mongoose.model("UserTournament", userTournamentSchema);