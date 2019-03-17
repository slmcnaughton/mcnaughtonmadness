var request = require('request');
var cheerio = require('cheerio');
var middleware = require("./middleware");

// Inspiration from https://www.digitalocean.com/community/tutorials/how-to-use-node-js-request-and-cheerio-to-set-up-simple-web-scraping
function scrape() {
    // console.log("scraping....scraping...scraping...");
    request('https://www.cbssports.com/college-basketball/scoreboard/', function (error, response, html) {
    // request('https://www.cbssports.com/college-basketball/scoreboard/all/20190316/', function (error, response, html) {
        if (!error && response.statusCode == 200) {
            var $ = cheerio.load(html);
            var parsedResults = [];
            
            $('div.live-update').each(function(i, element){
                var a = $(this);
                var final = a.find('.top-bar').text().trim();
                var team1 = a.find('.in-progress-table').find('a.team').first().text();
                var score1 = a.find('.in-progress-table').find('td.team').first().parent().children().last().text();
                
                var team2 = a.find('.in-progress-table').find('a.team').last().text();
                var score2 = a.find('.in-progress-table').find('td.team').last().parent().children().last().text();
                 
                var winner = (Number(score1) > Number(score2)) ? team1 : team2;
                
                var metadata = {
                    team1: team1,
                    team2: team2,
                    winner: winner
                };
                if(final.indexOf("FINAL") > -1)
                    parsedResults.push(metadata);
            });
            
            middleware.scrapeUpdateResults(parsedResults);
        }
    });
}

module.exports = scrape;