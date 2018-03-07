var mongoose = require("mongoose");

var scrapeSchema = new mongoose.Schema({
    
    start: { 
        type: {Date, default: Date.now }
    },
    end: { 
        type: {Date, default: Date.now }
    },
    rule: String

});


module.exports = mongoose.model("Scrape", scrapeSchema);