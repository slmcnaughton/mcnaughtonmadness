var mongoose = require("mongoose");

var roundSchema = new mongoose.Schema({

    numRound: Number,
    
    
    matches: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Match"
        }
    ]
    
});

module.exports = mongoose.model("Round", roundSchema);