var request = require('request');
var cheerio = require('cheerio');
var middleware = require("./middleware");

// Inspiration from https://www.digitalocean.com/community/tutorials/how-to-use-node-js-request-and-cheerio-to-set-up-simple-web-scraping
function scrape() {
    logTimeToConsole();
    request('https://www.cbssports.com/college-basketball/scoreboard/', function (error, response, html) {
    // request('https://www.cbssports.com/college-basketball/scoreboard/FBS/20240316/', function (error, response, html) {
        if (!error && response.statusCode == 200) {
            var $ = cheerio.load(html);
            var parsedResults = [];

            $('div.live-update').each(function (i, element) {
                var a = $(this);
                var final = a.find('.top-bar').text().trim();
                var team1 = a.find('.in-progress-table').find('td.team').first().find('a').text();
                var score1 = a.find('.in-progress-table').find('td.team').first().parent().children().last().text();

                var team2 = a.find('.in-progress-table').find('td.team').last().find('a').text();
                var score2 = a.find('.in-progress-table').find('td.team').last().parent().children().last().text();

                var winner = (Number(score1) > Number(score2)) ? team1 : team2;

                var metadata = {
                    team1: team1,
                    team2: team2,
                    winner: winner
                };
                if (final.toLowerCase().includes("final"))
                    parsedResults.push(metadata);
            });

            middleware.scrapeUpdateResults(parsedResults);
        }
    });
}

function logTimeToConsole() {
    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
    const formattedTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    // Get timezone offset in hours and minutes
    const timezoneOffsetHours = Math.abs(Math.floor(now.getTimezoneOffset() / 60)).toString().padStart(2, '0');
    const timezoneOffsetMinutes = Math.abs(now.getTimezoneOffset() % 60).toString().padStart(2, '0');
    const timezoneOffsetSign = now.getTimezoneOffset() > 0 ? '-' : '+';

    const timezoneString = `${timezoneOffsetSign}${timezoneOffsetHours}:${timezoneOffsetMinutes}`;

    console.log("Scraping: " + formattedDate + " " + formattedTime + " " + timezoneString);
}

module.exports = scrape;