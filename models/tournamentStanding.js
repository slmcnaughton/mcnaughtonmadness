var mongoose = require("mongoose");

var tournamentStandingSchema = new mongoose.Schema({
    year: Number,
    standings: [
        {
            firstName: String,
            lastName: String,
            score: Number
        }
    ]
});

module.exports = mongoose.model("tournamentStanding", tournamentStandingSchema);