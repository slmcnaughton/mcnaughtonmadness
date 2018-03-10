var request = require('request');
var cheerio = require('cheerio');
var async = require("async");
var middleware = require("./middleware");
var Tournament = require("./models/tournament");
var TournamentGroup = require("./models/tournamentGroup");
var Match = require("./models/match");
var UserMatchPrediction = require("./models/userMatchPrediction");
var UserMatchAggregate = require("./models/userMatchAggregate");

// Inspiration from https://www.digitalocean.com/community/tutorials/how-to-use-node-js-request-and-cheerio-to-set-up-simple-web-scraping

// request('https://www.cbssports.com/college-basketball/scoreboard', function (error, response, html) {
function scrape() {
    request('https://www.cbssports.com/college-basketball/scoreboard', function (error, response, html) {
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
                 
                var winner = (score1 > score2) ? team1 : team2;
               
                var metadata = {
                    team1: team1,
                    team2: team2,
                    winner: winner
                };
                if(final.indexOf("FINAL") > -1)
                    //   Push meta-data into parsedResults array
                    parsedResults.push(metadata);
            });
           
            
            var matchUpdates = [];
            
           Tournament.findOne({year: new Date().getFullYear() })
                .populate({path: "rounds", populate: { path: "matches", populate:{ path: "topTeam" } }})
                .populate({path: "rounds", populate: { path: "matches", populate: { path: "bottomTeam" } }})
                .exec(function (err, foundTournament){
                    if(err) {
                        console.log(err);
                    } else if (!foundTournament) {
                        console.log("bummer");
                    } else {
                        var round = foundTournament.rounds[foundTournament.currentRound - 1];
                        var roundMatchIndex = 0;
                        async.forEach(round.matches, function(match, next) {
                            async.forEach(parsedResults, function(result, next){
                                
                                
                                if (!match.winner && (match.topTeam.name === result.team1 && match.bottomTeam.name === result.team2 
                                                    || match.topTeam.name === result.team2 && match.bottomTeam.name === result.team1 )) {
                                    var winningTeam;
                                    if(result.winner === match.topTeam.name)
                                        winningTeam = match.topTeam;
                                    else 
                                        winningTeam = match.bottomTeam;
                                    var tempMatch = {
                                        roundMatchIndex: roundMatchIndex,
                                        tournament: foundTournament,
                                        matchNumber: match.matchNumber,
                                        matchId: match.id,
                                        winningTeam: winningTeam
                                    };
                                    matchUpdates.push(tempMatch);
                                    next();
                                } else {
                                    next();
                                }
                            }, function(err) {
                                if(err) console.log(err);
                                else {
                                    roundMatchIndex++;
                                    next();
                                }
                                
                            });
                        }, function(err) {
                            if(err) console.log(err);
                            if(matchUpdates.length > 0) {
                                async.series([
                                    function(callback) {
                                        advanceWinners(matchUpdates);
                                        callback();
                                    },
                                    function(callback) {
                                        scoreUserMatchPredictions(matchUpdates, callback);
                                        // callback();
                                    },
                                    function(callback) {
                                        updateTournamentGroupScores(matchUpdates, callback);
                                        // callback();
                                    },
                                    function(callback) {
                                        isRoundComplete(matchUpdates, callback);
                                    }
                                ]);
                            }
                        });
                    }
                });
            
        }
    });
}

// Req. Params:
// roundMatchIndex: roundMatchIndex,
// tournament: foundTournament,
// matchNumber: match.matchNumber,
// matchId: match.id,
// winningTeam: winningTeam
var advanceWinners =  function(matchUpdates) {
    var nextRoundIndex = matchUpdates[0].tournament.currentRound;
    var nextRound = matchUpdates[0].tournament.rounds[nextRoundIndex];
    // console.log("here");
    async.forEachOf(matchUpdates, function(matchUpdate, i) {
    // for (var i = 0; i < matchUpdates.length; i++) {
        Match.findByIdAndUpdate(matchUpdate.matchId, {winner: matchUpdate.winningTeam}, function(err, updatedMatch) {
            if(err || !updatedMatch)
                console.log("oh no!");
            else {
                updatedMatch.save();
            }
        });
        
        var currIndex = matchUpdates[i].roundMatchIndex;
        var nextMatchIndex = Math.floor(currIndex / 2);
        var nextRoundMatch = nextRound.matches[nextMatchIndex];
        if (currIndex % 2 === 0) {
            console.log(matchUpdates[i].winningTeam.name + " moved on" );
            nextRoundMatch.topTeam = matchUpdates[i].winningTeam;
        }
        else {
            console.log(matchUpdates[i].winningTeam.name + " moved on" );
            nextRoundMatch.bottomTeam = matchUpdates[i].winningTeam;
        }
        nextRound.matches[nextMatchIndex].save();
    });
    
};

// Req. Params:
// roundMatchIndex: roundMatchIndex,
// tournament: foundTournament,
// matchNumber: match.matchNumber,
// matchId: match.id,
// winningTeam: winningTeam
var scoreUserMatchPredictions = function(updatedMatches, next) {
    async.forEachSeries(updatedMatches, function(match, next) {
        //find the match, get the seeds, calculate winning/losing score
        async.series([
            function(callback) {
                Match.findById(match.matchId).populate("topTeam").populate("bottomTeam").exec(function(err, foundMatch) {
                    if(err) console.log(err);
                    else {
                        var ts = foundMatch.topTeam.seed;   //ts = topseed
                        var bs = foundMatch.bottomTeam.seed;    //bs = bottomseed
                        var winner = match.winner;
                        var winningScore = 0;
                        var losingScore = 0;
                        if (winner === String(foundMatch.topTeam._id)) {
                            winningScore = ts / bs;
                            losingScore = (ts < bs) ? -1 : -bs / ts ;
                        } else {
                            winningScore = bs / ts;
                            losingScore = (bs < ts) ? -1 :  -ts / bs ;
                        }
                        winningScore *= match.tournament.currentRound;
                        losingScore *=  match.tournament.currentRound;
                        
                        //=============================================
                        //Find all userMatchPredictions and update their score attribute
                        //=============================================
                        UserMatchPrediction.find( {"match.id" : match.matchId}).exec(function(err, foundUserMatchPredictions) {
                            if(err) console.log(err);
                            else {
                                async.forEachSeries(foundUserMatchPredictions, function(prediction, next){
                                    var userPick = String(prediction.winner);
                                    if (prediction.numRound === 7){
                                        prediction.score = (userPick === winner) ? 5 : 0;
                                    }
                                    else if (prediction.numRound === 8){
                                        prediction.score = (userPick === winner) ? 10 : 0;
                                    }
                                    else {
                                         prediction.score = (userPick === winner) ? winningScore : losingScore;
                                    }
                                    prediction.save();
                                    next();
                                }, function(err) {
                                    if(err) console.log(err);
                                    callback();
                                });
                            }
                        });
                    }
                }); //end of Match.findById
            },
        ], function(err) {
            if(err) console.log(err);
            else next();
        });
    }, function(err) {
        if(err) console.log(err);
        else {
            next();
        }
    });
};


// Req. Params:
// roundMatchIndex: roundMatchIndex,
// tournament: foundTournament,
// matchNumber: match.matchNumber,
// matchId: match.id,
// winningTeam: winningTeam
var updateTournamentGroupScores = function(updatedMatches, next) {
    TournamentGroup.find( {"tournamentReference.id" : updatedMatches[0].tournament.id})
        .populate({path: "userTournaments", populate: {path: "userRounds", populate: {path: "userMatchPredictions"}}})
        .exec(function(err, foundTournamentGroups) {
        if(err) console.log(err);
        else {
            async.forEachSeries(foundTournamentGroups, function(group, next){
                async.forEachSeries(group.userTournaments, function(userTournament, next){
                    userTournament.score = 0;
                    async.forEachSeries(userTournament.userRounds, function(userRound, next){
                        async.series([
                            function(callback){
                                //if rounds is the current round, or if the round matches a bonus round
                                 if (userRound.round.numRound === group.currentRound || (userRound.round.numRound === 7 && group.currentRound === 4) 
                                                                || (userRound.round.numRound === 8 && group.currentRound === 6)) { 
                                    userRound.roundScore = 0;
                                    async.forEachSeries(userRound.userMatchPredictions, function(userPrediction, next) {
                                        if(userPrediction)
                                        {
                                            userRound.roundScore += userPrediction.score;
                                        }
                                        next();
                                    }, function(err) {
                                        if(err) console.log(err);
                                        else {
                                            userRound.save();
                                            callback();
                                        }
                                    });
                                } else {
                                    callback();
                                }
                            },
                            function(callback) {
                                userTournament.score += userRound.roundScore;
                                callback();
                            }
                        ], function(err) {
                            if(err) console.log(err);
                            else {
                                next();
                            }
                        });
                    }, function(err) {
                        if(err) console.log(err);
                        else {
                            userTournament.save();
                            next();
                        }
                    });
                }, function(err) {
                    if (err) console.log(err);
                    else next();
                });
            }, function(err){
                if(err) console.log(err);
                else { 
                    next();
                }
            });
        }
    });
    
};

// Req. Params:
// roundMatchIndex: roundMatchIndex,
// tournament: foundTournament,
// matchNumber: match.matchNumber,
// matchId: match.id,
// winningTeam: winningTeam
var isRoundComplete = function (updatedMatches, next) {
     TournamentGroup.findOne( {"tournamentReference.id" : updatedMatches[0].tournament.id})
    .populate({path: "tournamentReference.id", populate: { path: "rounds", populate: {path: "matches"  }}})
    .exec(function(err, foundTournamentGroup) {
        if(err) console.log(err);
        else {
            var currRound = foundTournamentGroup.currentRound;
            var numUnfinished = 0;

            async.forEachSeries(foundTournamentGroup.tournamentReference.id.rounds[currRound-1].matches, function(match, next){
                if(!match.winner) {
                    numUnfinished++;
                    next();
                } else next();
            }, function(err) {
                if (err) console.log(err);
                else if (numUnfinished === 0) {
                    foundTournamentGroup.tournamentReference.id.currentRound++;
                    foundTournamentGroup.currentRound++;
                    foundTournamentGroup.save();
                    next();
                } 
                else {
                    next();
                }
            });
        }
    });
};


module.exports = scrape;