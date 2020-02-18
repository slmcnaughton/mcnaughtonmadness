var mongoose = require("mongoose");

var scrapeSchema = new mongoose.Schema({
    date: {
        type: {Date, default: Date.now }
    },
    start: { 
        type: {Date, default: Date.now }
    },
    end: { 
        type: {Date, default: Date.now }
    },
    rule: String

});


module.exports = mongoose.model("Scrape", scrapeSchema);