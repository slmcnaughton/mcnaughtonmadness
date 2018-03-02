//all the middleware goes here
var Campground = require("../models/campground");
var Comment = require("../models/comment");
var async = require("async");
var moment = require('moment');
var Tournament = require("../models/tournament");
var Round = require("../models/round");
var Match = require("../models/match");
var Team = require("../models/team");
var TournamentGroup = require("../models/tournamentGroup");
var UserTournament = require("../models/userTournament");
var UserRound = require("../models/userRound");
var UserMatchPrediction = require("../models/userMatchPrediction");
var UserMatchAggregate = require("../models/userMatchAggregate");



var middlewareObj = {};

middlewareObj.checkCampgroundOwnership = function(req, res, next) {
    if(req.isAuthenticated()){
        Campground.findById(req.params.id, function(err, foundCampground){
            if(err || !foundCampground) {
                req.flash("error", "Campground not found");
                res.redirect("back");
            } else {
                //does user own the campground?
                if(foundCampground.author.id.equals(req.user.id)){
                    next();
                } else {
                    req.flash("error", "You don't have permission to do that");
                    res.redirect("back");
                }
            }
       });
    } else {
        req.flash("error", "You need to be logged in to do that");
        res.redirect("back");
    }
};

middlewareObj.checkCommentOwnership = function(req, res, next) {
    if(req.isAuthenticated()){
        Comment.findById(req.params.comment_id, function(err, foundComment){
            if(err || !foundComment) {
                req.flash("error", "Comment not found");
                res.redirect("back");
            } else {
                //does user own the comment?
                if(foundComment.author.id.equals(req.user.id)){
                    next();
                } else {
                    req.flash("error", "You don't have permission to do that");
                    res.redirect("back");
                }
            }
       });
    } else {
        req.flash("error", "You need to be logged in to do that");
        res.redirect("back");
    }
};

middlewareObj.isLoggedIn = function(req, res, next){
    //Middleware: determines whether user is logged in
    if(req.isAuthenticated()){
        return next();
    }
    req.flash("error", "You need to be logged in to do that");
    res.redirect("/login");
};



//=========================================================================
// MIDDDLEWARE FOR:
//                 UPDATE - Round of Tournament (rounds.js route)
//                  router.put("/:numRound")
//  *1) updateTournamentRound
//  2) scoreUserMatchPredictions
//  3) updateTournamentGroupScores
//  4) isRoundComplete
//=========================================================================
middlewareObj.updateTournamentRound = function(req, res, next) {
    res.locals.updatedMatches = [];
    Tournament.findOne({year: req.params.year})
        .populate({path: "rounds", populate: { path: "matches", populate:{ path: "topTeam" } }})
        .populate({path: "rounds", populate: { path: "matches", populate: { path: "bottomTeam" } }})
        .exec(function (err, foundTournament){
        if(err) {
          res.redirect("back");
        }
        else {
            res.locals.tournamentId = foundTournament;
            var round = foundTournament.rounds[req.params.numRound-1];
            var roundFirstMatch = round.matches[0].matchNumber;
 
        //===========================================================
        // Handle championship game
        //===========================================================
        async.series([
            function(callback) {
                if (round.numRound === foundTournament.rounds.length)
                {
                    //roundFirstMatch will be match number 63 for a 64 team tournament
                    Team.findById(req.body[roundFirstMatch]).exec(function(err, winner) {
                        if(err) console.log(err);
                        else{
                            res.locals.updatedMatches.push(
                                {
                                    matchId: round.matches[0].id, 
                                    winner: req.body[63]
                                });
                            round.matches[0].winner = winner;
                            round.matches[0].save();
                            foundTournament.champion = winner;
                            foundTournament.save();
                            callback();
                        }
                    });
                } else{
                    //===========================================================
                    // Find the correct match and move the winner along
                    //===========================================================
                    var nextRound = foundTournament.rounds[req.params.numRound];
                    var numMatches = round.matches.length;
                    
                    async.times(numMatches, function(i, next){
                            //need to look for body[matchNumber]
                            var bodyIndex = roundFirstMatch + i;
                            
                            if(req.body[bodyIndex]) {
                                
                                res.locals.updatedMatches.push(
                                    {
                                        matchId: round.matches[i].id, 
                                        winner: req.body[bodyIndex]
                                    });
                                
                                Team.findById(req.body[bodyIndex]).exec(function(err, winner) {
                                    if(err) console.log(err);
                                    round.matches[i].winner = winner;
                                    
                                    round.matches[i].save();
                                    
                                    var nextMatchIndex = Math.floor(i / 2);
                                    var nextRoundMatch = nextRound.matches[nextMatchIndex];
                                    
                                    if (i % 2 === 0) {
                                        nextRoundMatch.topTeam = winner;
                                    }
                                    else {
                                        nextRoundMatch.bottomTeam = winner;
                                    }
                                    nextRound.matches[nextMatchIndex].save();
                                });
                            }
                            next();
                            
                        }, function(err){
                            if(err) console.log(err);
                            else {
                                callback();
                            }
                        });
                    }
                }
            ], function(err) {
                if(err) console.log(err);
                else {
                    foundTournament.save();
                    next();
                }
            });
        }
      
    });
};

//=========================================================================
// MIDDDLEWARE FOR:
//                 UPDATE - Round of Tournament (rounds.js route)
//                  router.put("/:numRound")
//  1) updateTournamentRound
//  *2) scoreUserMatchPredictions
//  3) updateTournamentGroupScores
//  4) isRoundComplete
//=========================================================================
middlewareObj.scoreUserMatchPredictions = function(req, res, next) {
    var updatedMatches = res.locals.updatedMatches;
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
                        winningScore *= req.params.numRound;
                        losingScore *= req.params.numRound;
                        
                        //=============================================
                        //Find all userMatchPredictions and update their score attribute
                        //=============================================
                        UserMatchPrediction.find( {"match.id" : match.matchId}).exec(function(err, foundUserMatchPredictions) {
                            if(err) console.log(err);
                            else {
                                async.forEachSeries(foundUserMatchPredictions, function(prediction, next){
                                    // console.log(prediction.numRound + " " + typeof(prediction.numRound));
                                    var userPick = String(prediction.winner);
                                    if (prediction.numRound === 7){
                                        prediction.score = (userPick === winner) ? 5 : 0;
                                        // console.log("winningScore:" + 5 + ", LS: " + 0);
                                    }
                                    else if (prediction.numRound === 8){
                                        prediction.score = (userPick === winner) ? 10 : 0;
                                        console.log("winningScore:" + 10 + ", LS: " + 0);
                                    }
                                    else {
                                        // console.log("winningScore:" + winningScore + ", LS: " + losingScore);
                                    
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
        else next();
    });
    
};

//=========================================================================
// MIDDDLEWARE FOR:
//                 UPDATE - Round of Tournament (rounds.js route)
//                  router.put("/:numRound")
//  1) updateTournamentRound
//  2) scoreUserMatchPredictions
//  *3) updateTournamentGroupScores
//  4) isRoundComplete
//=========================================================================
middlewareObj.updateTournamentGroupScores = function(req, res, next) {
    TournamentGroup.find( {"tournamentReference.id" : res.locals.tournamentId._id})
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
                else next();
            });
        }
    });
    
};


//=========================================================================
// MIDDDLEWARE FOR:
//                 UPDATE - Round of Tournament (rounds.js route)
//                  router.put("/:numRound")
//  1) updateTournamentRound
//  2) scoreUserMatchPredictions
//  3) updateTournamentGroupScores
// *4) isRoundComplete
//=========================================================================
middlewareObj.isRoundComplete = function(req, res, next) {
   TournamentGroup.findOne( {"tournamentReference.id" : res.locals.tournamentId._id})
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
                    foundTournamentGroup.currentRound++;
                    foundTournamentGroup.save();
                } 
                else {
                    next();
                }
                
            });
            next();
        }
    });
   
};


//=========================================================================
// MIDDDLEWARE FOR:
//                 UPDATE - UserRound (userRounds.js route)
//                  router.put("/:numRound")
//  *1) checkTipoffTime
//  2) userRoundCreation
//  3) updateUserMatchAggregates
//=========================================================================
middlewareObj.checkTipoffTime = function(req, res, next) {
     UserTournament.findById(req.params.id).populate({path: "tournamentReference.id", populate: "rounds"}).exec(function(err, foundUserTournament){
        if(err) {
            console.log(err);
            req.flash("error", "UserTournament not found");
            res.redirect("back");
        }
        else {
            res.locals.userFirstName = foundUserTournament.user.firstName;
            var numRound = Number(req.params.numRound);
            if (numRound === 7 || numRound === 8)
                numRound = 1;
            //find the tournament round associated with this userRound
            Round.findById(foundUserTournament.tournamentReference.id.rounds[numRound-1]).exec(function(err, foundRound){
                if(err || !foundRound) {
                    console.log(err);
                    req.flash("error", "Round not found");
                    res.redirect("back");
                }
                else {
                    if (moment().isBefore( moment(foundRound.startTime) ) ) {
                        next();
                    } else {
                        req.flash("error", "Too late! Tipoff for the round has already started.");
                        res.redirect("/tournamentGroups/" + req.params.groupName + "/userTournaments/" + req.params.id);
                    }
                }
            });
        }
     });
            
};


//=========================================================================
// MIDDDLEWARE FOR:
//                 UPDATE - UserRound (userRounds.js route)
//                  router.put("/:numRound")
//  1) checkTipoffTime
//  *2) userRoundCreation
//  3) updateUserMatchAggregates
//=========================================================================
    //req.body[matchNum][0] -> winningTeamId
    //req.body[matchNum][1] -> comments
    //req.params 
    //      groupName -> March Madness 2012
    //      id -> 5a8b0a650e17ab1749702c4b
    //      numRound -> 1
middlewareObj.userRoundCreation = function(req, res, next) {
    //find the correct userTournament
    UserTournament.findById(req.params.id).populate({path: "tournamentReference.id", populate: "rounds"}).exec(function(err, foundUserTournament){
        if(err) console.log(err);
        else {
            res.locals.userFirstName = foundUserTournament.user.firstName;
            var numRound = Number(req.params.numRound);
            if (numRound === 7) {
                numRound = 4;
            } else if (numRound === 8)
            {
                numRound = 6;
            }
            //find the tournament round associated with this userRound
            Round.findById(foundUserTournament.tournamentReference.id.rounds[numRound-1]).populate("matches").exec(function(err, foundRound){
                if(err) console.log(err);
                else {
                    var newUserRound = {
                        roundScore: 0,
                        possiblePointsRemaining: 0,
                        // user: {
                        //     id: ,
                        //     name:
                        // }
                        round: {
                            id: foundRound.id,
                            numRound: req.params.numRound
                        },
                        userMatchPredictions: [],
                        // submissionDeadline: { type: Date },  //moment js... , default: Date.now
                    };
                    UserRound.create(newUserRound, function(err, newUserRound){
                        if(err) console.log(err);
                        else {
                            //============================================================================================
                            // userRound Created -> now fill with the userMatchPredictions
                            //============================================================================================
                            async.forEachSeries(foundRound.matches, function(match, next){
                                var newUserMatchPrediction = {
                                     score: 0,
                                     numRound: newUserRound.round.numRound,
                                     winner: req.body[match.matchNumber][0],
                                     match: {
                                         id: match.id,
                                         matchNumber: match.matchNumber
                                     },
                                     comment: req.body[match.matchNumber][1]
                                };
                                UserMatchPrediction.create(newUserMatchPrediction, function(err, newUserMatchPrediction){
                                    if(err) console.log(err);
                                    else {
                                        newUserRound.userMatchPredictions.addToSet(newUserMatchPrediction);
                                        newUserRound.save();
                                        next();
                                    }
                                });
                            }, function(err){
                                if(err) console.log(err);
                                else {
                                    res.locals.newUserRound = newUserRound;
                                    foundUserTournament.userRounds.push(newUserRound);
                                    foundUserTournament.save();
                                    next();
                                }
                            });
                        }
                    });
                }
            });
        }
    });
};


//=========================================================================
// MIDDDLEWARE FOR:
//                 UPDATE - UserRound (userRounds.js route)
//                  router.put("/:numRound")
//  1) checkTipoffTime
//  2) userRoundCreation
//  *3) updateUserMatchAggregates
//=========================================================================
    //req.body[matchNum][0] -> winningTeamId
    //req.body[matchNum][1] -> comments
    //req.params 
    //      groupName -> March Madness 2012
    //      id -> 5a8b0a650e17ab1749702c4b
    //      numRound -> 1
middlewareObj.updateUserMatchAggregates = function(req, res, next) {
    TournamentGroup.findOne({groupName: req.params.groupName}).exec(function(err, foundTournamentGroup) {
        if(err) console.log(err);
        else {
            async.forEachSeries(res.locals.newUserRound.userMatchPredictions, function(userPrediction, next){
                Match.findOne({_id : userPrediction.match.id}).populate("topTeam").populate("bottomTeam").exec(function(err, userPredictionMatch) {
                    if(err) console.log(err);
                    else {
                        //Try to find a userMatchAggregate whose matchReference is the same as this userMatchPrediction's matchReference
                        UserMatchAggregate.findOne({matchReference : userPrediction.match.id}).exec(function(err, foundUserMatchAggregate) {
                            if(err) console.log(err);
                            else {
                                if (req.params.numRound < 7) {
                                    async.series([
                                         // if none exist, create a userMatchAggregate for the userMatchPrediction:
                                        function(callback) {
                                            if (!foundUserMatchAggregate) {
                                                var ts = userPredictionMatch.topTeam.seed;   //ts = topseed
                                                var bs = userPredictionMatch.bottomTeam.seed;    //bs = bottomseed
                                                var nr = req.params.numRound;               //nr = numRound
                                                
                                                var newUserMatchAggregate = {
                                                    matchNumber: userPredictionMatch.matchNumber,
                                                    matchReference: userPredictionMatch.id,
                                                    topTeamPickers: [],
                                                    topWinScore: nr * ts / bs,
                                                    topLossScore: (ts < bs) ? -ts / bs * nr : -nr ,
                                                    bottomTeamPickers: [],
                                                    bottomWinScore:  nr * bs / ts,
                                                    bottomLossScore: (bs < ts) ? -bs / ts * nr : -nr,
                                                };
                                                UserMatchAggregate.create(newUserMatchAggregate, function(err, newUserMatchAggregate){
                                                    if(err) console.log(err);
                                                    else {
                                                        foundUserMatchAggregate = newUserMatchAggregate;
                                                        foundTournamentGroup.userMatchAggregates.push(foundUserMatchAggregate);
                                                        callback();
                                                    }
                                                });
                                            }
                                            else callback();
                                        }, function(callback) {
                                            // If userMatchPrediction picks the topTeam…assign name and comments to topTeamPickerArray
                                            // Otherwise assign name and comments to BottomPickerArray
                                            var packedPrediction = {
                                                id: userPrediction._id,
                                                firstName: res.locals.userFirstName,
                                                comment: userPrediction.comment
                                            };
                                            if (String(userPrediction.winner) === userPredictionMatch.topTeam.id) {
                                                foundUserMatchAggregate.topTeamPickers.push(packedPrediction);
                                            } else {
                                                foundUserMatchAggregate.bottomTeamPickers.push(packedPrediction);
                                            }
                                            callback();
                                        }
                                    ], function(err) {
                                        if(err) console.log(err);
                                        else {
                                            // console.log(foundUserMatchAggregate);
                                            foundUserMatchAggregate.save();
                                            next();
                                        }
                                    });
                                }
                                else next();
                            } 
                        });
                    }
                });
            }, function(err) {
                if(err) console.log(err);
                else {
                    foundTournamentGroup.save();
                    next();
                }
            });
        }
    });
};



module.exports = middlewareObj;