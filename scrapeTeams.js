var request = require('request');
var cheerio = require('cheerio');
var async = require("async");
var TeamImage = require("./models/teamImage");

function scrapeTeams() {
    async.timesSeries(28, function(day, next) {
        var extension = "201902"; 
            if(day < 10)
                extension += "0" + day;
            else
                extension += day;
        var link = "https://www.cbssports.com/college-basketball/scoreboard/all/" + extension + "/";
        request(link, function (error, response, html) {
            if (!error && response.statusCode == 200) {
                var $ = cheerio.load(html);
                var parsedResults = [];
                
                $('div.live-update').each(function(i, element){
                    var a = $(this);
                    
                    var team1 = a.find('.in-progress-table').find('a.team').first().text();
                    var image1 = a.find('.in-progress-table').find('td.team').first().find('img').attr('src');
                    if(image1){
                        image1 = image1.replace(/90/g,"100");
                        var metadata = {
                            name: team1,
                            image: image1,
                        };
                        parsedResults.push(metadata);
                    }
                    
                    var team2 = a.find('.in-progress-table').find('a.team').last().text();
                    var image2 = a.find('.in-progress-table').find('td.team').last().find('img').attr('src');
                    if(image2) {
                        image2 = image2.replace(/90/g,"100");
                        var metadata2 = {
                            name: team2,
                            image: image2
                        };
                        parsedResults.push(metadata2);
                    }
                });
                
                async.forEachSeries(parsedResults, function(result, next) {
                    TeamImage.findOne({name: result.name}).exec(function(err, foundTeamImage) {
                        if(err) console.log(err);
                        else if (!foundTeamImage){
                            TeamImage.create(result, function(err, createdTeamImage) {
                                if(err) console.log(err);
                                console.log(result.name + " added");
                                next();
                            });
                        }
                        else {
                            next();
                        }
                    });
                }, function(err) {
                    if(err) console.log(err);
                    next();
                });
            }
        });
    });
    
}

module.exports = scrapeTeams;