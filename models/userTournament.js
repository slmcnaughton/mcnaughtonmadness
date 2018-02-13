var mongoose = require("mongoose");

var userTournamentSchema = new mongoose.Schema({
    
    player: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        firstName: String,
        lastName: String,
    },
    
    rounds: {
       id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "UserRound"
        },
        firstName: String, 
    }
    
    
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