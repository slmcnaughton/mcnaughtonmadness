//all the middleware goes here
var Campground = require("../models/campground");
var Comment = require("../models/comment");
var async = require("async");
var Tournament = require("../models/tournament");
var UserMatchPrediction = require("../models/userMatchPrediction");
// var Round = require("../models/round");
var Team = require("../models/team");
var Match = require("../models/match");

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

middlewareObj.scoreUserMatchPredictions = function(req, res, next) {
    // console.log(res.locals.updatedMatches);
    async.forEachSeries(res.locals.updatedMatches, function(match, next) {
         //find the match, get the seeds, calulate winning/losing score
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
                         var i = 0;
                        async.forEachSeries(foundUserMatchPredictions, function(prediction, next){
                            var userPick = String(foundUserMatchPredictions[i].winner);
                            if (userPick === winner) //winner is a string
                            {
                                prediction.score = winningScore;
                                console.log("Player " + i + " won " + winningScore);
                            } else {
                                prediction.score = losingScore;
                                console.log("Player " + i + " lost " + losingScore);
                            }
                            i++;
                            prediction.save();
                            next();
                        });
                    }
                });
            }
 
        });

    });
    next();
};

middlewareObj.updateTournamentRound = function(req, res, next) {
    res.locals.updatedMatches = [];
    Tournament.findOne({year: req.params.year})
        .populate({path: "rounds", populate: { path: "matches",populate:{ path: "topTeam" } }})
        .populate({path: "rounds", populate: { path: "matches", populate: { path: "bottomTeam" } }})
        .exec(function (err, foundTournament){
        if(err) {
          res.redirect("back");
        }
        else {
            
        
        var round = foundTournament.rounds[req.params.numRound-1];
        var roundFirstMatch = round.matches[0].matchNumber;
        
        //send numRound to scoring middleware
        
        
        //===========================================================
        // Handle championship game
        //===========================================================
        if (round.numRound === foundTournament.rounds.length)
        {
            //roundFirstMatch will be match number 63 for a 64 team tournament
            Team.findById(req.body[roundFirstMatch]).exec(function(err, winner) {
                if(err) console.log(err);
                else{
                    round.matches[0].winner = winner;
                    round.matches[0].save();
                    foundTournament.champion = winner;
                    foundTournament.save();
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
                        
                    }
                });
                
                //   res.redirect("/campgrounds/" + req.params.id);
        }
      }
      
      foundTournament.save();
      next();
    });
};



module.exports = middlewareObj;