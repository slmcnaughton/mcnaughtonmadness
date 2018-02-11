var mongoose = require("mongoose");

var userMatchPredictionSchema = new mongoose.Schema({
    
    matchNumber: Number,
    winner: 
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Team"
        },
    comment: String
});

module.exports = mongoose.model("UserMatchPrediction", userMatchPredictionSchema);