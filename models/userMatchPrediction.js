var mongoose = require("mongoose");

var userMatchPredictionSchema = new mongoose.Schema({
    
    score: Number,
    numRound: Number,
    match: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Match"
        },
        matchNumber: Number
    },
    winner: 
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Team"
        },
    comment: String
});

module.exports = mongoose.model("UserMatchPrediction", userMatchPredictionSchema);