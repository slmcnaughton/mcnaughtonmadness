var express = require("express");
var router = express.Router({mergeParams: true});   //pass {} merges the parameters from the campground.js to this comments.js...allows us to access :id of the campground
var async = require("async");
var Tournament = require("../models/tournament");
var UserTournament = require("../models/userTournament");
var TournamentGroup = require("../models/tournamentGroup");
var Round = require("../models/round");
var UserRound = require("../models/userRound");
var UserMatchPrediction = require("../models/userMatchPrediction");
var Team = require("../models/team");
var middleware = require("../middleware");


//EDIT - render edit userRound form (aka...makePicks)
// middleware.checkCommentOwnership, 
router.get("/:numRound/edit", function(req, res){
    // console.log(req.params.player);
    TournamentGroup.findOne({groupName: req.params.groupName})
        // .populate({path: "tournamentReference.id", populate: {path: "rounds", populate: { path: "matches",populate:{ path: "topTeam" } }}})
        // .populate({path: "tournamentReference.id", populate: {path: "rounds", populate: { path: "matches", populate: { path: "bottomTeam" } }}})
        // .populate({path: "tournamentReference.id", populate: "champion"})
        .exec(function (err, foundTournamentGroup){
        if(err || !foundTournamentGroup) {
            req.flash("error", "tournament combination not found");
            res.redirect("back");
        } else {
            var numRound = Number(req.params.numRound);
            // console.log(foundTournamentGroup.tournamentReference.id);
            Tournament.findById(foundTournamentGroup.tournamentReference.id)
                .populate({path: "rounds", populate: { path: "matches", populate:{ path: "topTeam" } }})
                .populate({path: "rounds", populate: { path: "matches", populate: { path: "bottomTeam" } }})
                .exec(function (err, foundTournament){
                    if(err || !foundTournament) {
                        req.flash("error", "tournament combination not found");
                        res.redirect("back");
                    } else if (numRound < 7){
                        res.render("userRounds/edit.ejs", {
                            tournament: foundTournament, 
                            round: foundTournament.rounds[numRound-1], 
                            tournamentGroup: foundTournamentGroup,
                            userTournamentId: req.params.id
                        });
                    } else if (numRound === 7) {
                        res.render("userRounds/editFinalFour.ejs", {
                            tournament: foundTournament, 
                            numRound: numRound, 
                            tournamentGroup: foundTournamentGroup,
                            userTournamentId: req.params.id
                        });
                    } else {
                        res.render("userRounds/editChamp.ejs", {
                            tournament: foundTournament, 
                            numRound: Number(numRound), 
                            tournamentGroup: foundTournamentGroup,
                            userTournamentId: req.params.id
                        });
                    }
                });
        }
    });
});


    //req.body[matchNum][0] -> winningTeamId
    //req.body[matchNum][1] -> comments
    //req.params 
    //      groupName -> March Madness 2012
    //      id -> 5a8b0a650e17ab1749702c4b
    //      numRound -> 1
    
    //find a user tournament
    //create the round
    //add matches
    //      score: 0
    //      winner: 
    //      match 
    //          id
    //          matchnumber
    //      comment: 
//UPDATE - UserRound of Tournament
// middleware.checkCommentOwnership,
router.put("/:numRound", function(req, res){
    UserTournament.findById(req.params.id).populate({path: "tournamentReference.id", populate: "rounds"}).exec(function(err, foundUserTournament){
        if(err) console.log(err);
        else {
            var numRound = Number(req.params.numRound);
            if (numRound === 7) {
                numRound = 4;
            } else if (numRound === 8)
            {
                numRound = 6;
            }
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
                            // userRound Created -> now fill with userMatchPredictions
                            //============================================================================================
                            async.forEachSeries(foundRound.matches, function(match, next){
                                var newUserMatchPrediction = {
                                     score: 0,
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
                                    foundUserTournament.userRounds.push(newUserRound);
                                    foundUserTournament.save();
                                    var round = newUserRound.round.numRound;
                                    if(round === 1) {
                                        req.flash('success', 'Round 1 picks submitted!');
                                        res.redirect("/tournamentGroups/" + req.params.groupName + "/userTournaments/" + req.params.id + "/7/edit");
                                    } else if (round ===7 ) {
                                        req.flash('success', 'Final Four picks submitted!');
                                        res.redirect("/tournamentGroups/" + req.params.groupName + "/userTournaments/" + req.params.id + "/8/edit");
                                    } else if (newUserRound.round.numRound === 8 ) {
                                        req.flash('success', 'Final Four picks submitted!');
                                        res.redirect("/tournamentGroups/" + req.params.groupName + "/userTournaments/" + req.params.id);
                                    } else {
                                        req.flash('success', 'Round ' + round + ' picks submitted!');
                                        res.redirect("/tournamentGroups/" + req.params.groupName + "/userTournaments/" + req.params.id);
                                    }
                                    
                                   
                                }
                            });
                        }
                    });
                }
            });
        }
    });


});

module.exports = router;