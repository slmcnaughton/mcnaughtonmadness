var express = require("express");
var router = express.Router();
var TournamentStanding = require("../models/tournamentStanding");

//INDEX - show all tournamentStandings
router.get("/", async function (req, res) {
  try {
    var allTournaments = await TournamentStanding.find({});
    allTournaments.sort(compare);
    res.render("tournamentStandings/index", {
      tournaments: allTournaments,
      page: "about",
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Something went wrong");
    res.redirect("back");
  }
});

// SHOW by year — e.g. /tournamentStandings/year/2019
router.get("/year/:year", async function (req, res) {
  try {
    var foundTournamentStanding = await TournamentStanding.findOne({
      year: parseInt(req.params.year),
    });
    if (!foundTournamentStanding) {
      req.flash("error", "Tournament standings not found for " + req.params.year);
      return res.redirect("/tournamentStandings");
    }
    res.render("tournamentStandings/show", {
      tournament: foundTournamentStanding,
      page: "about",
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Tournament standings not found for " + req.params.year);
    res.redirect("/tournamentStandings");
  }
});

//SHOW - shows more information about a particular Tournament Standing
router.get("/:id", async function (req, res) {
  try {
    var foundTournamentStanding = await TournamentStanding.findById(req.params.id);
    if (!foundTournamentStanding) {
      req.flash("error", "Tournament standings not found");
      return res.redirect("back");
    }
    res.render("tournamentStandings/show", {
      tournament: foundTournamentStanding,
      page: "about",
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Tournament standings not found");
    res.redirect("back");
  }
});

function compare(a, b) {
  if (a.year > b.year) return -1;
  else if (a.year < b.year) return 1;
  return 0;
}

module.exports = router;
