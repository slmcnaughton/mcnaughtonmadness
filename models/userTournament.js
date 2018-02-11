var mongoose = require("mongoose");

var userTournamentSchema = new mongoose.Schema({
    
    // year: Number,
    // numTeams: Number,
    // rounds: [
    //     {
    //         type: mongoose.Schema.Types.ObjectId,
    //         ref: "Round"
    //     }
    // ]
    

});


module.exports = mongoose.model("UserTournament", userTournamentSchema);