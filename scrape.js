var request = require('request');
var cheerio = require('cheerio');
var async = require("async");
// var middleware = require("./middleware");
var Tournament = require("./models/tournament");
var TournamentGroup = require("./models/tournamentGroup");
var UserRound = require("./models/userRound");
var UserTournament = require("./models/userTournament");
var Match = require("./models/match");
var UserMatchPrediction = require("./models/userMatchPrediction");
var UserMatchAggregate = require("./models/userMatchAggregate");

// Inspiration from https://www.digitalocean.com/community/tutorials/how-to-use-node-js-request-and-cheerio-to-set-up-simple-web-scraping

// request('https://www.cbssports.com/college-basketball/scoreboard', function (error, response, html) {
function scrape() {
    // console.log("scraping....scraping...scraping...");
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
                                
                                // if(match.topTeam.name === result.team1) {
                                //     console.log('====================');
                                //     console.log(match.topTeam.name);
                                //     console.log(match.bottomTeam.name);
                                //     console.log(result.team2);
                                    
                                // }
                                
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
                console.log(err);
            else {
                updatedMatch.save();
            }
        });
        
        var currIndex = matchUpdates[i].roundMatchIndex;
        var nextMatchIndex = Math.floor(currIndex / 2);
        var nextRoundMatch = nextRound.matches[nextMatchIndex];
        if (currIndex % 2 === 0) {
            // console.log(matchUpdates[i].winningTeam.name + " moved on" );
            nextRoundMatch.topTeam = matchUpdates[i].winningTeam;
        }
        else {
            // console.log(matchUpdates[i].winningTeam.name + " moved on" );
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
        Match.findById(match.matchId).populate("topTeam").populate("bottomTeam").exec(function(err, foundMatch) {
            if(err) console.log(err);
            else {
                var ts = foundMatch.topTeam.seed;   //ts = topseed
                var bs = foundMatch.bottomTeam.seed;    //bs = bottomseed
                var winner = match.winningTeam;
                var winningScore = 0;
                var losingScore = 0;
                if (winner.equals(foundMatch.topTeam._id)) {
                    winningScore = ts / bs;
                    losingScore = (ts < bs) ? -1 : -bs / ts ;
                } else {
                    winningScore = bs / ts;
                    losingScore = (bs < ts) ? -1 :  -ts / bs ;
                }
                winningScore *= match.tournament.currentRound;
                losingScore *=  match.tournament.currentRound;
                
                //=============================================
                // a) Find all userMatchPredictions and update their score attribute
                // b) If UserMatchPrediction doesn't exist (i.e., they forgot to make picks), create the round and subtract the loser score
                //=============================================
                UserMatchPrediction.find( {"match.id" : match.matchId}).exec(function(err, foundUserMatchPredictions) {
                    if(err) console.log(err);
                    else {
                        // Find all user tournaments who reference this tournament but do not have a userRound.userMatchPrediction.match.id matching this match.matchId
                        async.parallel([
                        function(callback) {
                            // Map the docs into an array of just the _ids
                            var userMPids = foundUserMatchPredictions.map(function(doc) { return doc._id; });
                            //find the user rounds that reference user match prediction ids (and are in the current round to avoid bonus round picks interfering with rounds 4 and 6
                            UserRound.find( {"userMatchPredictions" : {$in: userMPids}, "round.numRound" : match.tournament.currentRound}).exec(function(err, foundUserRound) {
                                if(err) console.log(err);
                                else {
                                    var userRids = foundUserRound.map(function(doc) { return doc._id; });
                                    //find all tournaments that don't have a user round in the list of rounds that match the prediction
                                    //  a) these may not have the particular round at all (we need to create the round)
                                    //  b) they may have the round, but no pick (i.e., we created the round for them with no picks and just need to subtract the score)
                                    UserTournament.find({"tournamentReference.id" : updatedMatches[0].tournament, "userRounds" : {$nin: userRids} })
                                        .populate("userRounds").exec(function(err, foundUserTournaments){
                                            if(err) console.log(err);
                                            else {
                                                //found userTournaments holds all tournaments without a round, or a round with a reference to the updated match
                                                async.forEachSeries(foundUserTournaments, function(foundUserTournament, next) {
                                                    if(err) console.log(err);
                                                    else {
                                                        //does this user tournament have the user round to reference?
                                                        var foundRound = -1;    //index
                                                        async.series([
                                                            function(callback) {
                                                                for (var j = 0; j < foundUserTournament.userRounds.length; j++) {
                                                                    if(foundUserTournament.userRounds[j].round.numRound === Number(match.tournament.currentRound) ) {
                                                                        foundRound = j;
                                                                    }
                                                                }
                                                                callback();
                                                            },
                                                            function(callback) {
                                                                //we've looped through, and a userRound referencing the current round does not exist...create the round
                                                                if(foundRound === -1) {
                                                                    var newUserRound = {
                                                                        roundScore : losingScore,
                                                                        user: {
                                                                            id: foundUserTournament.user.id,
                                                                            name: foundUserTournament.user.firstName
                                                                        },
                                                                        round: {
                                                                            id: match.tournament.rounds[match.tournament.currentRound-1],
                                                                            numRound: match.tournament.currentRound
                                                                        }
                                                                    };
                                                                    UserRound.create(newUserRound, function(err, newUserRound){
                                                                        if(err) console.log(err);
                                                                        foundUserTournament.userRounds.push(newUserRound);
                                                                        callback();
                                                                    });
                                                                }
                                                                //we found a userRound without a reference to the actual match
                                                                else {
                                                                    foundUserTournament.userRounds[foundRound].roundScore += losingScore;
                                                                    foundUserTournament.userRounds[foundRound].save();
                                                                    callback();
                                                                }
                                                            }
                                                        ], function(err){
                                                            if(err) console.log(err);
                                                            else{
                                                                foundUserTournament.save();
                                                                next();
                                                            } 
                                                        });
                                                    }   
                                                }, function(err){
                                                    if(err) console.log(err);
                                                    else callback();
                                                });
                                                //end of async.forEachSeries(foundUserTournaments)
                                            }
                                        });
                                    }
                            });
                
                        },
            
                        function(callback) {
                            async.forEachSeries(foundUserMatchPredictions, function(prediction, next){

                                if (prediction.numRound === 7){
                                    prediction.score = (prediction.winner.equals(winner._id)) ? 5 : 0;
                                }
                                else if (prediction.numRound === 8){
                                    prediction.score = (prediction.winner.equals(winner._id)) ? 10 : 0;
                                }
                                else {
                                     prediction.score = (prediction.winner.equals(winner._id)) ? winningScore : losingScore;
                                }
                                prediction.save();
                                next();
                            }, function(err) {
                                if(err) console.log(err);
                                callback();
                            });
                        }
                    ], function(err) {
                        if(err) console.log(err);
                        else next();
                    });
                    }
                });
            }
        }); //end of Match.findById
    }, function(err) {
        if(err) console.log(err);
        else next();
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
                                 if ( (userRound.round.numRound === group.currentRound && userRound.userMatchPredictions.length > 0) || (userRound.round.numRound === 7 && group.currentRound === 4) 
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
                    foundTournamentGroup.tournamentReference.id.save();
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