var express = require("express");
var router = express.Router();
var TournamentStanding = require("../models/tournamentStanding");

//INDEX - show all tournamentStandings
router.get("/", function (req, res) {
  //get all tournamentStandings from db
  TournamentStanding.find({}, function (err, allTournaments) {
    if (err) {
      console.log(err);
    } else {
      allTournaments.sort(compare);
      res.render("tournamentStandings/index", {
        tournaments: allTournaments,
        page: "about",
      });
    }
  });
});

//SHOW - shows more information about a particular Tournament Standing
router.get("/:id", function (req, res) {
  //find the TournamentStanding with provided ID, populate the comments array
  TournamentStanding.findById(
    req.params.id,
    function (err, foundTournamentStanding) {
      if (err || !foundTournamentStanding) {
        req.flash("error", "Tournament standings not found");
        res.redirect("back");
      } else {
        //render the show template with that Tournament Standing
        res.render("tournamentStandings/show", {
          tournament: foundTournamentStanding,
          page: "about",
        });
      }
    },
  );
});

function compare(a, b) {
  if (a.year > b.year) return -1;
  else if (a.year < b.year) return 1;
  return 0;
}

module.exports = router;
