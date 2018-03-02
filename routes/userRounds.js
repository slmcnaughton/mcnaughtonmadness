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
    TournamentGroup.findOne({groupName: req.params.groupName})
        .exec(function (err, foundTournamentGroup){
        if(err || !foundTournamentGroup) {
            req.flash("error", "tournament combination not found");
            res.redirect("back");
        } else {
            var numRound = Number(req.params.numRound);
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
                            username: req.params.username
                        });
                    } else if (numRound === 7) {
                        res.render("userRounds/editFinalFour.ejs", {
                            tournament: foundTournament, 
                            numRound: numRound, 
                            tournamentGroup: foundTournamentGroup,
                            username: req.params.username
                        });
                    } else {
                        res.render("userRounds/editChamp.ejs", {
                            tournament: foundTournament, 
                            numRound: Number(numRound), 
                            tournamentGroup: foundTournamentGroup,
                            username: req.params.username
                        });
                    }
                });
        }
    });
});


//UPDATE - UserRound of Tournament
// middleware.checkCommentOwnership,
router.put("/:numRound", middleware.checkTipoffTime, middleware.userRoundCreation, middleware.updateUserMatchAggregates, function(req, res){
    
    var round = Number(req.params.numRound);
    if(round === 1) {
        req.flash('success', 'Round 1 picks submitted!');
        res.redirect("/tournamentGroups/" + req.params.groupName + "/userTournaments/" + req.params.username + "/7/edit");
    } else if (round ===7 ) {
        req.flash('success', 'Final Four picks submitted!');
        res.redirect("/tournamentGroups/" + req.params.groupName + "/userTournaments/" + req.params.username + "/8/edit");
    } else if (round === 8 ) {
        req.flash('success', 'Championship pick submitted!');
        res.redirect("/tournamentGroups/" + req.params.groupName + "/userTournaments/" + req.params.username);
    } else {
        req.flash('success', 'Round ' + round + ' picks submitted!');
        res.redirect("/tournamentGroups/" + req.params.groupName + "/userTournaments/" + req.params.username);
    }


});


module.exports = router;