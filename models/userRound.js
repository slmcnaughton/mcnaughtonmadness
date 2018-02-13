var mongoose = require("mongoose");

var userRoundSchema = new mongoose.Schema({
    
    roundScore: Number,
    possiblePointsRemaining: Number,
    
    round: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Round"
        },
        numRound: Number
    },
    userMatchPredictions: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "UserMatchPrediction"
        }
    ],
    submissionDeadline: { type: Date },  //moment js... , default: Date.now
    
});

module.exports = mongoose.model("UserRound", userRoundSchema);