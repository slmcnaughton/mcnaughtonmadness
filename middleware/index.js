//all the middleware goes here
var Comment = require("../models/comment");
var async = require("async");
var moment = require('moment-timezone');
var Tournament = require("../models/tournament");
var Round = require("../models/round");
var Match = require("../models/match");
var Team = require("../models/team");
var TournamentGroup = require("../models/tournamentGroup");
var UserTournament = require("../models/userTournament");
var UserRound = require("../models/userRound");
var UserMatchPrediction = require("../models/userMatchPrediction");
var UserMatchAggregate = require("../models/userMatchAggregate");
var BonusAggregate = require("../models/bonusAggregate");



var middlewareObj = {};

middlewareObj.checkTournamentGroupOwnership = function(req, res, next) {
    if(req.isAuthenticated()){
        TournamentGroup.findOne({groupName: req.params.groupName}).exec(function(err,foundTournamentGroup) {
            if(err || !foundTournamentGroup) {
                req.flash("error", "Tournament Group not found");
                res.redirect("back");
            } else {
                //does user own the tournament group?
                if(foundTournamentGroup.commissioner.id.equals(req.user.id)){
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

middlewareObj.checkUserTournamentOwnership = function(req, res, next) {
    if(req.isAuthenticated()){
       UserTournament.findOne({"user.username": req.params.username, "tournamentGroup.groupName" : req.params.groupName}).exec(function(err, foundUserTournament){
            if(err || !foundUserTournament) {
                req.flash("error", "User Tournament not found");
                res.redirect("back");
            } else {
                //does user own the User Tournament?
                if(foundUserTournament.user.id.equals(req.user.id)){
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
    req.session.returnTo = req.originalUrl;
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
            res.locals.updatedRound = foundTournament.rounds[req.params.numRound-1];
            var round = foundTournament.rounds[req.params.numRound-1];
            var roundFirstMatch = round.matches[0].matchNumber;
 
       
        async.series([
            //===========================================================
            // Handle championship game
            //===========================================================
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
                            if(round.matches[0].winner.id === round.matches[0].topTeam.id) {
                                round.matches[0].bottomTeam.lost++;
                                round.matches[0].bottomTeam.save();
                            }
                            else {
                                round.matches[0].topTeam.lost++;
                                round.matches[0].topTeam.save();
                            }
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
                            // i is the ith match of the round
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
                                    
                                    if(round.matches[i].winner.id === round.matches[i].topTeam.id) {
                                        round.matches[i].bottomTeam.lost++;
                                        round.matches[i].bottomTeam.save();
                                    }
                                    else {
                                        round.matches[i].topTeam.lost++;
                                        round.matches[i].topTeam.save();
                                    }
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
                            UserRound.find( {"userMatchPredictions" : {$in: userMPids}, "round.numRound" : req.params.numRound}).exec(function(err, foundUserRound) {
                            if(err) console.log(err);
                            else {
                                var userRids = foundUserRound.map(function(doc) { return doc._id; });
                                //find all tournaments that don't have a user round in the list of rounds that match the prediction
                                //  a) these may not have the particular round at all (we need to create the round)
                                //  b) they may have the round, but no pick (i.e., we created the round for them with no picks and just need to subtract the score)
                                UserTournament.find({"tournamentReference.id" : res.locals.tournamentId, "userRounds" : {$nin: userRids} })
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
                                                                if(foundUserTournament.userRounds[j].round.numRound === Number(req.params.numRound) ) {
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
                                                                        id: res.locals.updatedRound,
                                                                        numRound: req.params.numRound
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
                                //if rounds is the current round and has userMatchPredictions, or if the round matches a bonus round

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
            // var currRound = 2;
            var numUnfinished = 0;

            async.forEachSeries(foundTournamentGroup.tournamentReference.id.rounds[currRound-1].matches, function(match, next){
                if(!match.winner) {
                    // console.log(match);
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


//=========================================================================
// MIDDDLEWARE FOR:
//                 UPDATE - UserRound (userRounds.js route)
//                  router.put("/:numRound")
//  *1) checkTipoffTime
//  2) userRoundCreation
//  3) updateUserMatchAggregates
//=========================================================================
middlewareObj.checkTipoffTime = function(req, res, next) {
    UserTournament.findOne({"user.username": req.params.username, "tournamentGroup.groupName" : req.params.groupName}).populate({path: "tournamentReference.id", populate: "rounds"}).exec(function(err, foundUserTournament){
        if(err) {
            console.log(err);
            req.flash("error", "User Tournament not found");
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
                        res.redirect("/tournamentGroups/" + req.params.groupName);
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
    UserTournament.findOne({"user.username": req.params.username, "tournamentGroup.groupName" : req.params.groupName})
            .populate({path: "tournamentReference.id", populate: "rounds"}).exec(function(err, foundUserTournament){
        if(err || !foundUserTournament){
            req.flash("error", "User Tournament not found");
            res.redirect("back");
        } 
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
                    };
                    UserRound.create(newUserRound, function(err, newUserRound){
                        if(err) console.log(err);
                        else {
                            //============================================================================================
                            // userRound Created -> now fill with the userMatchPredictions
                            //============================================================================================
                            async.forEachSeries(foundRound.matches, function(match, next){
                                var winner;
                                var comment;
                                if (req.body[match.matchNumber]){
                                    winner = req.body[match.matchNumber][0];
                                    comment = req.body[match.matchNumber][1];
                                }
                                var newUserMatchPrediction = {
                                    score: 0,
                                    numRound: newUserRound.round.numRound,
                                    winner: winner,
                                    match: {
                                        id: match.id,
                                        matchNumber: match.matchNumber
                                    },
                                    comment: comment
                                };
                                UserMatchPrediction.create(newUserMatchPrediction, function(err, newUserMatchPrediction){
                                    if(err) console.log(err);
                                    else {
                                        newUserRound.userMatchPredictions.addToSet(newUserMatchPrediction);
                                        next();
                                    }
                                });
                            }, function(err){
                                if(err) console.log(err);
                                else {
                                    res.locals.newUserRound = newUserRound;
                                    foundUserTournament.userRounds.push(newUserRound);
                                    newUserRound.save();
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
    //res.locals.newUserRound.userMatchPrediction
    //      score: 0,
    //      numRound: newUserRound.round.numRound,
    //      winner: winner, (type: team)...(req.body[match.matchNumber][0])
    //      match: {
    //          id: match.id,
    //          matchNumber: match.matchNumber
    //      },
    //      comment: comment    (req.body[match.matchNumber][1])
                
middlewareObj.updateUserMatchAggregates = function(req, res, next) {
    
    TournamentGroup.findOne({groupName: req.params.groupName}).exec(function(err, foundTournamentGroup) {
        if(err) console.log(err);
        else {
            async.forEachSeries(res.locals.newUserRound.userMatchPredictions, function(userPrediction, next){
            
                Match.findOne({_id : userPrediction.match.id}).populate("topTeam").populate("bottomTeam").exec(function(err, userPredictionMatch) {
                    if(err) console.log(err);
                    else {
                        //Find or create a userMatchAggregate whose matchReference is the same as this userMatchPrediction's matchReference
                        if (req.params.numRound < 7) {
                            UserMatchAggregate.findOne({matchReference : userPrediction.match.id, tournamentGroup : foundTournamentGroup.id}).exec(function(err, foundUserMatchAggregate) {
                                if(err) console.log(err);
                                else {
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
                                                    tournamentGroup: foundTournamentGroup.id,
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
                                                id: res.locals.currentUser._id,
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
                                            foundUserMatchAggregate.save();
                                            next();
                                        }
                                    });
                                }
                                
                            });
                        }
                        // Find or create a final four bonusAggregate whose matchReference is the same as this userMatchPrediction's matchReference
                        else if(Number(req.params.numRound) === 7 || Number(req.params.numRound) === 8) {
                            Team.findById(userPrediction.winner, function(err, foundTeam) {
                                if(err) console.log(err);
                                else {
                                    BonusAggregate.findOne({"team.id" : foundTeam.id, matchReference : userPrediction.match.id, tournamentGroup : foundTournamentGroup.id}).exec(function(err, foundBonusAggregate) {
                                        if(err) console.log(err);
                                        else {
                                            async.series([
                                                // if none exist, create a foundBonusAggregate for the userMatchPrediction:
                                                function(callback) {
                                                    if (!foundBonusAggregate) {
                                                        var team = {
                                                            id: foundTeam.id,
                                                            name: foundTeam.name,
                                                            image: foundTeam.image,
                                                        };
                                                    
                                                        var newBonusAggregate = {
                                                            matchNumber: userPredictionMatch.matchNumber,
                                                            matchReference: userPredictionMatch.id,
                                                            tournamentGroup: foundTournamentGroup.id,
                                                            team: team,
                                                            teamPickers: [],
                                                        };
                                                        BonusAggregate.create(newBonusAggregate, function(err, newBonusAggregate){
                                                            if(err) console.log(err);
                                                            else {
                                                                foundBonusAggregate = newBonusAggregate;
                                                                foundTournamentGroup.bonusAggregates.push(foundBonusAggregate);
                                                                callback();
                                                            }
                                                        });
                                                    }
                                                    else callback();
                                                }, function(callback) {
                                                    //  Assign name and comments to teamPickers array
                                                    var packedPrediction = {
                                                        id: userPrediction._id,
                                                        firstName: res.locals.userFirstName,
                                                        comment: userPrediction.comment
                                                    };
                                                    foundBonusAggregate.teamPickers.push(packedPrediction);
                                                    
                                                    callback();
                                                }
                                            ], function(err) {
                                                if(err) console.log(err);
                                                else {
                                                    foundBonusAggregate.save();
                                                    next();
                                                }
                                            });
                                        }
                                        
                                    });
                                                                
                                }
                            });
                        }
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