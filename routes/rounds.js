var express = require("express");
var router = express.Router({ mergeParams: true }); //pass {} merges the parameters from the campground.js to this comments.js...allows us to access :id of the campground
var Tournament = require("../models/tournament");
var Round = require("../models/round");
var Match = require("../models/match");
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

// DEV: Set start times on matches (tipoff now or in N minutes)
router.post("/:numRound/setStartTimes", middleware.isAdmin, async function (req, res) {
  try {
    var foundTournament = await Tournament.findOne({ year: req.params.year })
      .populate({ path: "rounds", populate: "matches" });
    if (!foundTournament) return res.redirect("back");

    var round = foundTournament.rounds[req.params.numRound - 1];
    if (!round) return res.redirect("back");

    var mode = req.body.mode; // "now", "minutes", or "specific"
    var minutes = parseInt(req.body.minutes, 10) || 0;
    var matchNumbers = req.body.matchNumbers; // array of match numbers, or "all"

    var targetTime;
    if (mode === "now") {
      targetTime = new Date();
    } else if (mode === "minutes") {
      targetTime = new Date(Date.now() + minutes * 60000);
    } else {
      return res.redirect("back");
    }

    // Normalize matchNumbers to an array or "all"
    if (matchNumbers && !Array.isArray(matchNumbers) && matchNumbers !== "all") {
      matchNumbers = [matchNumbers]; // single value → array
    }

    var updated = 0;
    for (var match of round.matches) {
      if (matchNumbers === "all" || (Array.isArray(matchNumbers) && matchNumbers.indexOf(String(match.matchNumber)) !== -1)) {
        if (!match.winner) { // only set start time for unfinished games
          match.startTime = targetTime;
          await match.save();
          updated++;
        }
      }
    }

    // Also update round.startTime if the new time is earlier
    if (targetTime < round.startTime) {
      round.startTime = targetTime;
      await round.save();
    }

    // Auto-trigger scrape effects if tipoff is now or in the past
    if (targetTime <= new Date()) {
      await middleware.lockDraftPicksForStartedGames();
    }

    req.flash("success", "Set start time on " + updated + " match(es)" + (targetTime <= new Date() ? " + ran lock/missed" : ""));
    res.redirect("back");
  } catch (err) {
    console.log(err);
    req.flash("error", "Error setting start times");
    res.redirect("back");
  }
});

// DEV: Trigger scrape side effects (lock drafts, mark missed) without actually scraping CBS
router.post("/:numRound/runScrapeEffects", middleware.isAdmin, async function (req, res) {
  try {
    await middleware.lockDraftPicksForStartedGames();
    req.flash("success", "Scrape effects (lock drafts + mark missed) completed");
    res.redirect("back");
  } catch (err) {
    console.log(err);
    req.flash("error", "Error running scrape effects");
    res.redirect("back");
  }
});

//order teams correctly by matchNum from lowest to highest
function compareTeams(a, b) {
  // console.log(a.firstMatchNum + " " + b.firstMatchNum);
  if (a.firstMatchNum < b.firstMatchNum) return -1;
  else if (a.firstMatchNum > b.firstMatchNum) return 1;
  return 0;
}

module.exports = router;
