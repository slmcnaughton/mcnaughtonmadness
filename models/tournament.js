var mongoose = require("mongoose");

var tournamentSchema = new mongoose.Schema({
    
    year: Number,
    numTeams: Number,
    rounds: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Round"
        }
    ],
    champion: 
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Team"
        },
    regions: [String]

});


module.exports = mongoose.model("Tournament", tournamentSchema);