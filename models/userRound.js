var mongoose = require("mongoose");

var userRoundSchema = new mongoose.Schema({
    
    roundScore: Number,
    possiblePointsRemaining: Number,
    
    user: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        name: String
    },
    
    //reference the actual round
    round: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Round"
        },
        numRound: Number
    },
    //reference an array of user predictions
    userMatchPredictions: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "UserMatchPrediction"
        }
    ],
});

module.exports = mongoose.model("UserRound", userRoundSchema);