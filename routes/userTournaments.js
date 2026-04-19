var express = require("express");
// var router = express.Router();   //pass {} merges the parameters from the tournamentGroup.js to this userTournament.js...allows us to access :id of the tournamentGroup
var router = express.Router({ mergeParams: true }); //pass {} merges the parameters from the tournamentGroup.js to this userTournament.js...allows us to access :id of the tournamentGroup
var middleware = require("../middleware");
var UserTournament = require("../models/userTournament");
var TournamentGroup = require("../models/tournamentGroup");
var Round = require("../models/round");
var Match = require("../models/match");
var Team = require("../models/team");
var emailHelper = require("../middleware/emailHelper");

//New - show form to create new userTournament
router.get("/new", middleware.isLoggedIn, async function (req, res) {
  try {
    var groupName = req.params.groupName;
    var foundTournamentGroup = await TournamentGroup.findOne({
      groupName: groupName,
    });
    if (!foundTournamentGroup) {
      req.flash("error", "Something went wrong");
      return res.redirect("/tournamentGroups");
    }
    var foundUserTournament = await UserTournament.findOne({
      "user.id": req.user._id,
      "tournamentGroup.groupName": req.params.groupName,
    });
    if (!foundUserTournament) {
      res.render("userTournaments/new", {
        tournamentGroup: foundTournamentGroup,
        page: "tournamentGroups",
      });
    } else {
      req.flash(
        "error",
        "You've already created picks for this tournament!",
      );
      return res.redirect("/tournamentGroups/" + req.params.groupName);
    }
  } catch (err) {
    console.log(err);
    req.flash("error", "Something went wrong");
    res.redirect("back");
  }
});

//Create
router.post("/", middleware.isLoggedIn, async function (req, res) {
  try {
    var groupName = req.params.groupName;
    var foundTournamentGroup = await TournamentGroup.findOne({
      groupName: groupName,
    });
    if (!foundTournamentGroup) {
      req.flash("error", "Something went wrong");
      return res.redirect("/tournamentGroups");
    }
    if (
      foundTournamentGroup.publicGroup ||
      (!foundTournamentGroup.publicGroup &&
        foundTournamentGroup.secretCode === req.body.secretCode)
    ) {
      var foundUserTournament = await UserTournament.findOne({
        "user.id": req.user._id,
        "tournamentGroup.groupName": req.params.groupName,
      });
      if (foundUserTournament) {
        req.flash(
          "error",
          "You've already created picks for this tournament!",
        );
        return res.redirect("/tournamentGroups/" + req.params.groupName);
      }
      var newUserTournament = {
        score: 0,
        tournamentGroup: {
          id: foundTournamentGroup.id,
          groupName: foundTournamentGroup.groupName,
        },
        user: {
          id: req.user._id,
          firstName: req.user.firstName,
          lastName: req.user.lastName,
          username: req.user.username,
        },
        tournamentReference: {
          id: foundTournamentGroup.tournamentReference.id,
          year: foundTournamentGroup.tournamentReference.year,
        },
        userRounds: [],
      };
      var userTournament = await UserTournament.create(newUserTournament);
      foundTournamentGroup.userTournaments.addToSet(userTournament);
      await foundTournamentGroup.save();
      req.user.tournamentGroups.push({
        id: foundTournamentGroup._id,
        groupName: foundTournamentGroup.groupName,
        year: userTournament.tournamentReference.year,
        isOfficial: !!foundTournamentGroup.isOfficial,
      });
      req.user.tournamentGroups.sort(compareUserTournaments);
      await req.user.save();
      req.flash("success", "Entry started!");
      res.redirect(
        "/tournamentGroups/" +
          foundTournamentGroup.groupName +
          "/userTournaments/" +
          userTournament.user.username +
          "/1/edit",
      );
    } else {
      req.flash("error", "Cannot join group: secret code does not match!");
      return res.redirect("back");
    }
  } catch (err) {
    console.log(err);
    req.flash("error", "Something went wrong");
    res.redirect("back");
  }
});

//SHOW - shows more information about a particular userTournament
router.get("/:username", middleware.isLoggedIn, async function (req, res) {
  try {
    // Allow viewing your own bracket or if admin; otherwise check pick status
    var isOwnBracket = req.user.username === req.params.username;
    var isAdmin = req.user.isAdmin;

    var visibleThroughRound = 99; // default: see everything
    if (!isOwnBracket && !isAdmin) {
      var pickStatus = await middleware.checkUserPickStatus(req.user._id, req.params.groupName);
      if (pickStatus && pickStatus.shouldHide) {
        req.flash(
          "error",
          "Make your picks before viewing others' brackets!",
        );
        return res.redirect(
          "/tournamentGroups/" + req.params.groupName,
        );
      }
      if (pickStatus && typeof pickStatus.visibleThroughRound === "number") {
        visibleThroughRound = pickStatus.visibleThroughRound;
      }
    }

    var foundUserTournament = await UserTournament.findOne({
      "user.username": req.params.username,
      "tournamentGroup.groupName": req.params.groupName,
    })
      .populate({ path: "userRounds", populate: { path: "round.id" } })
      .populate({
        path: "userRounds",
        populate: {
          path: "userMatchPredictions",
          populate: { path: "winner" },
        },
      })
      .populate({
        path: "userRounds",
        populate: {
          path: "userMatchPredictions",
          populate: { path: "match.id" },
        },
      })
      .populate({
        path: "tournamentReference.id",
        populate: {
          path: "rounds",
          populate: { path: "matches", populate: { path: "topTeam" } },
        },
      })
      .populate({
        path: "tournamentReference.id",
        populate: {
          path: "rounds",
          populate: { path: "matches", populate: { path: "bottomTeam" } },
        },
      });
    if (!foundUserTournament) {
      req.flash("error", "User Tournament not found");
      return res.redirect("/tournamentGroups");
    }
    // Convert to plain object to allow safe array manipulation
    // (Mongoose documents can resist property reassignment on populated arrays)
    var utData = foundUserTournament.toObject({ virtuals: true });
    utData.userRounds.sort(function (a, b) {
      return (a.round.numRound || 0) - (b.round.numRound || 0);
    });

    // Build map of matchNumber → started/finished for showing "Missed" on null predictions
    var matchStartedMap = {};
    var now = Date.now();
    for (var rd of utData.tournamentReference.id.rounds) {
      if (rd.matches) {
        for (var mt of rd.matches) {
          if (mt.winner || (mt.startTime && now > new Date(mt.startTime).getTime())) {
            matchStartedMap[mt.matchNumber] = true;
          }
        }
      }
    }

    // Rebuild each round's prediction array in bracket order (by matchNumber).
    // Draft auto-lock creates predictions out of order and may have gaps.
    // The bracket template uses index-based access, so missing picks need null placeholders.
    for (var urIdx = 0; urIdx < utData.userRounds.length; urIdx++) {
      var ur = utData.userRounds[urIdx];
      if (!ur.userMatchPredictions || ur.userMatchPredictions.length === 0) continue;

      // Build a map of matchNumber → prediction
      var predMap = {};
      for (var p = 0; p < ur.userMatchPredictions.length; p++) {
        var pred = ur.userMatchPredictions[p];
        if (pred.match && pred.match.matchNumber) {
          predMap[pred.match.matchNumber] = pred;
        }
      }

      // Find the round in the tournament to get the expected match order
      var roundNum = ur.round.numRound;
      var actualIdx = roundNum <= 6 ? roundNum - 1 : (roundNum === 7 ? 3 : 5);
      var tournRound = utData.tournamentReference.id.rounds[actualIdx];
      if (tournRound && tournRound.matches) {
        var ordered = [];
        for (var m = 0; m < tournRound.matches.length; m++) {
          var matchNum = tournRound.matches[m].matchNumber;
          var pred = predMap[matchNum] || null;
          if (!pred && matchStartedMap[matchNum]) {
            // Create a placeholder that the template can identify as "missed"
            pred = { _placeholder: true, missed: true, score: 0 };
          }
          ordered.push(pred);
        }
        ur.userMatchPredictions = ordered;
      }
    }
    res.render("userTournaments/show", {
      userTournament: utData,
      visibleThroughRound: visibleThroughRound,
      matchStartedMap: matchStartedMap,
      page: "tournamentGroups",
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Something went wrong");
    res.redirect("back");
  }
});

function compare(a, b) {
  if (a.round.numRound < b.round.numRound) return -1;
  else if (a.round.numRound > b.round.numRound) return 1;
  return 0;
}

function compareUserTournaments(a, b) {
  if (a.year < b.year) return 1;
  else if (a.year > b.year) return -1;
  return 0;
}

module.exports = router;
