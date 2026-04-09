var express = require("express");
var router = express.Router({ mergeParams: true }); //pass {} merges the parameters from the campground.js to this comments.js...allows us to access :id of the campground
var Tournament = require("../models/tournament");
var Round = require("../models/round");
var Team = require("../models/team");
var middleware = require("../middleware");

//EDIT - render edit round form (admin only)
router.get("/:numRound/edit", middleware.isAdmin, async function (req, res) {
  try {
    var foundTournament = await Tournament.findOne({ year: req.params.year })
      .populate({
        path: "rounds",
        populate: { path: "matches", populate: { path: "topTeam" } },
      })
      .populate({
        path: "rounds",
        populate: { path: "matches", populate: { path: "bottomTeam" } },
      });

    if (!foundTournament) {
      req.flash("error", "tournament combination not found");
      return res.redirect("back");
    }
    res.render("rounds/edit.ejs", {
      tournament: foundTournament,
      round: foundTournament.rounds[req.params.numRound - 1],
    });
  } catch (err) {
    req.flash("error", "tournament combination not found");
    res.redirect("back");
  }
});

//UPDATE - Round of Tournament
// middleware.checkCommentOwnership,
// router.put("/:numRound", middleware.updateTournamentRound, middleware.scoreUserMatchPredictions,
//                         middleware.updateTournamentGroupScores, middleware.isRoundComplete, function(req, res){

//     res.redirect("back");
// });
router.put("/:numRound", middleware.isAdmin, middleware.manuallyUpdateResults, function (req, res) {
  var currentYear = new Date().getFullYear();
  res.redirect("/tournaments/" + currentYear);
});

//order teams correctly by matchNum from lowest to highest
function compareTeams(a, b) {
  // console.log(a.firstMatchNum + " " + b.firstMatchNum);
  if (a.firstMatchNum < b.firstMatchNum) return -1;
  else if (a.firstMatchNum > b.firstMatchNum) return 1;
  return 0;
}

module.exports = router;
