//all the middleware goes here
var Campground = require("../models/campground");
var Comment = require("../models/comment");
var async = require("async");
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
            
            // console.log(round.matches[0]);
            // console.log(req.body);
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
    // console.log("the length is ....................." + res.locals.updatedMatches.length);
    var updatedMatches = res.locals.updatedMatches;
    console.log("Updated matches: " + updatedMatches);
    async.forEachSeries(updatedMatches, function(match, next) {
        // console.log(match.matchId);
         //find the match, get the seeds, calculate winning/losing score
        async.series([
            function(callback) {
                Match.findById(match.matchId).populate("topTeam").populate("bottomTeam").exec(function(err, foundMatch) {
                    // console.log("==========found match here ========" + foundMatch);
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
                                //  var i = 0;
                                async.forEachSeries(foundUserMatchPredictions, function(prediction, next){
                                    console.log(prediction.numRound + " " + typeof(prediction.numRound));
                                    var userPick = String(prediction.winner);
                                    if (prediction.numRound === 7){
                                        prediction.score = (userPick === winner) ? 5 : 0;
                                        console.log("winningScore:" + 5 + ", LS: " + 0);
                                    }
                                    else if (prediction.numRound === 8){
                                        prediction.score = (userPick === winner) ? 10 : 0;
                                        console.log("winningScore:" + 10 + ", LS: " + 0);
                                    }
                                    else {
                                        console.log("winningScore:" + winningScore + ", LS: " + losingScore);
                                    
                                         prediction.score = (userPick === winner) ? winningScore : losingScore;
                                    }
                                    
                                    // if (userPick === winner) //winner is a string
                                    // {
                                    //     prediction.score = winningScore;
                                    //   console.log("Player " + i + " won " + winningScore);
                                    // } else {
                                    //     prediction.score = losingScore;
                                    //     console.log("Player " + i + " lost " + losingScore);
                                    // }
                                    // i++;
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
            // console.log("a) # of tournament groups:" + foundTournamentGroups.length);
            async.forEachSeries(foundTournamentGroups, function(group, next){
                // console.log("b) # of players: " + group.userTournaments.length);
                // var j = 1;
                async.forEachSeries(group.userTournaments, function(userTournament, next){
                    // console.log("c) player " + j + "'s cumulative score:" + userTournament.score);
                    userTournament.score = 0;
                    // var i = 1;
                    async.forEachSeries(userTournament.userRounds, function(userRound, next){
                        // console.log("d) round " + userRound.round.numRound + " score: " + userRound.roundScore);
                        async.series([
                            function(callback){
                                //if rounds is the current round, or if the round matches a bonus round
                                 if (userRound.round.numRound === group.currentRound || (userRound.round.numRound === 7 && group.currentRound === 4) 
                                                                || (userRound.round.numRound === 8 && group.currentRound === 6)) { 
                                    userRound.roundScore = 0;
                                    async.forEachSeries(userRound.userMatchPredictions, function(userPrediction, next) {
                                        if(userPrediction)
                                        {
                                            // console.log("=============" + userPrediction.score);
                                            userRound.roundScore += userPrediction.score;
                                            // console.log(userRound.roundScore);
                                        }
                                        next();
                                    }, function(err) {
                                        if(err) console.log(err);
                                        else {
                                            // console.log("d, 2.0)" + " round " + i + " score after update: " + userRound.roundScore);
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
                               
                                // i++;
                                
                                next();
                            }
                        });
                    }, function(err) {
                        if(err) console.log(err);
                        else {
                            // console.log("c, 2.0) new tournament score: " + userTournament.score);
                            // j++;
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
    // .populate({path: "userTournaments", populate: {path: "userRounds", populate: {path: "userMatchPredictions"}}})
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
//  *1) userRoundCreation
//  2) updateUserMatchAggregates
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
//  1) userRoundCreation
//  *2) updateUserMatchAggregates
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
            console.log(foundTournamentGroup.userMatchAggregates);
            async.forEachSeries(res.locals.newUserRound.userMatchPredictions, function(userPrediction, next){
                Match.findOne({_id : userPrediction.match.id}).populate("topTeam").populate("bottomTeam").exec(function(err, userPredictionMatch) {
                    if(err) console.log(err);
                    else {
                        //Try to find a userMatchAggregate whose matchReference is the same as athis userMatchPrediction's matchReference
                        // {_id: {$in: [req.body.data]}, 
                        UserMatchAggregate.findOne({matchReference : userPrediction.match.id}).exec(function(err, foundUserMatchAggregate) {
                            if(err) console.log(err);
                            else {
                                if (req.params.numRound < 7) {
                                    async.series([
                                        function(callback) {
                                            // if none exist, create a userMatchAggregate for the userMatchPrediction:
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
                                            console.log(foundUserMatchAggregate);
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