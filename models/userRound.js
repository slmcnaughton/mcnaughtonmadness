var mongoose = require("mongoose");

var userRoundSchema = new mongoose.Schema({
    
    roundScore: Number,
    possiblePointsRemaining: Number,
    
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
    submissionDeadline: { type: Date },  //moment js... , default: Date.now
    
});

module.exports = mongoose.model("UserRound", userRoundSchema);