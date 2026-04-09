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

    if (!isOwnBracket && !isAdmin) {
      var pickStatus = await new Promise(function (resolve, reject) {
        middleware.checkUserPickStatus(
          req.user._id,
          req.params.groupName,
          function (err, result) {
            if (err) return reject(err);
            resolve(result);
          },
        );
      });
      if (pickStatus && pickStatus.shouldHide) {
        req.flash(
          "error",
          "Make your picks before viewing others' brackets!",
        );
        return res.redirect(
          "/tournamentGroups/" + req.params.groupName,
        );
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
    foundUserTournament.userRounds.sort(compare);
    res.render("userTournaments/show", {
      userTournament: foundUserTournament,
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
