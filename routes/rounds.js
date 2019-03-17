var express = require("express");
var router = express.Router({mergeParams: true});   //pass {} merges the parameters from the campground.js to this comments.js...allows us to access :id of the campground
var async = require("async");
var Tournament = require("../models/tournament");
var Round = require("../models/round");
var Team = require("../models/team");
var middleware = require("../middleware");


//EDIT - render edit round form
// middleware.checkCommentOwnership, 
router.get("/:numRound/edit", function(req, res){
     Tournament.findOne({year: req.params.year})
        .populate({path: "rounds", populate: { path: "matches",populate:{ path: "topTeam" } }})
        .populate({path: "rounds", populate: { path: "matches", populate: { path: "bottomTeam" } }})
        .exec(function (err, foundTournament){
        if(err || !foundTournament) {
            req.flash("error", "tournament combination not found");
            res.redirect("back");
        } else {
            res.render("rounds/edit.ejs", {tournament: foundTournament, round: foundTournament.rounds[req.params.numRound-1]});
        }
    });
});

//UPDATE - Round of Tournament
// middleware.checkCommentOwnership,
// router.put("/:numRound", middleware.updateTournamentRound, middleware.scoreUserMatchPredictions, 
//                         middleware.updateTournamentGroupScores, middleware.isRoundComplete, function(req, res){

//     res.redirect("back");
// });
router.put("/:numRound", middleware.updateResults, function(req, res){
    var currentYear = new Date().getFullYear();
    res.redirect("/tournaments/" + currentYear);
});

//order teams correctly by matchNum from lowest to highest
function compareTeams(a,b) {
    // console.log(a.firstMatchNum + " " + b.firstMatchNum);
    if (a.firstMatchNum < b.firstMatchNum)
        return -1;
    else if (a.firstMatchNum > b.firstMatchNum)
        return 1;
    return 0;
}

module.exports = router;