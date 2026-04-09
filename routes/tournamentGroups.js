var express = require("express");
var router = express.Router();
var moment = require("moment-timezone");
var middleware = require("../middleware");
var Tournament = require("../models/tournament");
var TournamentGroup = require("../models/tournamentGroup");
var UserTournament = require("../models/userTournament");
var Team = require("../models/team");
var Match = require("../models/match");
var EmailLog = require("../models/emailLog");
var emailHelper = require("../middleware/emailHelper");

//SendRoundSummaryTest — always sends only to the logged-in user's email
router.post("/:groupName/testRoundSummary", middleware.isCommissionerOrAdmin, async function (req, res) {
  try {
    var groupName = req.params.groupName;
    var foundTournamentGroup = await TournamentGroup.findOne({ groupName: groupName })
      .populate({
        path: "userTournaments",
        populate: { path: "userRounds", populate: "round" },
      });
    emailHelper.sendRoundSummary(foundTournamentGroup, req.user.email);
    req.flash("success", "Test email sent to " + req.user.email);
    res.redirect("back");
  } catch (err) {
    console.log(err);
    res.redirect("/tournamentGroups");
  }
});

router.post("/:groupName/testPickReminder", middleware.isCommissionerOrAdmin, async function (req, res) {
  try {
    var groupName = req.params.groupName;
    await TournamentGroup.findOne({ groupName: groupName })
      .populate({
        path: "userTournaments",
        populate: { path: "userRounds", populate: "round" },
      });
    emailHelper.sendPickReminderEmail();
    res.redirect("back");
  } catch (err) {
    console.log(err);
    res.redirect("/tournamentGroups");
  }
});

router.get("/:groupName/json-score-report", async function (req, res) {
  try {
    var groupName = req.params.groupName;
    var foundTournamentGroup = await TournamentGroup.findOne({ groupName: groupName })
      .populate("userTournaments");

    console.log(`year: ${foundTournamentGroup.year},`);
    console.log(`\tstandings: [`);

    foundTournamentGroup.userTournaments.forEach(function (userTournament) {
      console.log("\t    {");
      console.log(`\t\tfirstName: "${userTournament.user.firstName}",`);
      console.log(`\t\tlastName: "${userTournament.user.lastName}",`);
      console.log(
        `\t\tscore: ${Math.round(userTournament.score * 1000) / 1000}`,
      );
      console.log("\t    },");
    });

    console.log(`\t]`);
    res.redirect("/tournamentGroups/" + foundTournamentGroup.groupName);
  } catch (err) {
    console.log(err);
    res.redirect("/tournamentGroups");
  }
});

//INDEX - show all current Tournament Groups
router.get("/", async function (req, res) {
  try {
    var allTournamentGroups = await TournamentGroup.find({ year: new Date().getFullYear() });
    res.render("tournamentGroups/index", {
      tournamentGroups: allTournamentGroups,
      page: "tournamentGroups",
    });
  } catch (err) {
    console.log(err);
    res.redirect("/");
  }
});

//NEW - show form to create new tournament Group
router.get("/new", middleware.isLoggedIn, async function (req, res) {
  try {
    var allTournaments = await Tournament.find({});
    allTournaments.sort(compare);
    res.render("tournamentGroups/new", {
      tournaments: allTournaments,
      page: "tournamentGroups",
    });
  } catch (err) {
    console.log(err);
    res.redirect("/tournamentGroups");
  }
});

//CREATE -
router.post("/", middleware.isLoggedIn, async function (req, res) {
  try {
    var foundTournament = await Tournament.findOne({ year: new Date().getFullYear() });
    var newTournamentGroup = {
      year: new Date().getFullYear(),
      groupName: req.body.groupName,
      commissioner: {
        id: req.user._id,
        name: req.user.firstName,
      },
      groupMotto: req.body.groupMotto,
      secretCode: req.body.secretCode,
      publicGroup: req.body.groupType,
      tournamentReference: {
        id: foundTournament.id,
        year: foundTournament.year,
      },
      userMatchAggregates: [],
      bonusAggregates: [],
      currentRound: 1,
      comments: [],
      isOfficial: req.user.isAdmin && req.body.isOfficial === "true",
    };
    var newlyCreated = await TournamentGroup.create(newTournamentGroup);
    res.redirect("/tournamentGroups/" + newlyCreated.groupName);
  } catch (err) {
    console.log(err);
    if (err.code === 11000) {
      req.flash("error", "Group name already exists!");
      return res.redirect("back");
    } else {
      req.flash("error", "Error creating tournament group.");
      return res.redirect("back");
    }
  }
});

// MANAGE - commissioner/admin management page for a group
router.get("/:groupName/manage", middleware.isCommissionerOrAdmin, async function (req, res) {
  try {
    var groupName = req.params.groupName;
    var group = await TournamentGroup.findOne({ groupName: groupName })
      .populate({
        path: "userTournaments",
        populate: {
          path: "userRounds",
          populate: { path: "userMatchPredictions" },
        },
      });

    if (!group) {
      req.flash("error", "Tournament Group not found");
      return res.redirect("/tournamentGroups");
    }

    var emailLogs;
    try {
      emailLogs = await EmailLog.find({ groupName: groupName })
        .sort({ createdAt: -1 })
        .limit(50);
    } catch (e) {
      emailLogs = [];
    }

    res.render("tournamentGroups/manage", {
      group: group,
      emailLogs: emailLogs,
      moment: moment,
      page: "tournamentGroups",
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Tournament Group not found");
    res.redirect("/tournamentGroups");
  }
});

//Note: this must be below the /tournaments/new route
//SHOW - shows more information about a particular tournament Group
router.get("/:groupName", async function (req, res) {
  try {
    var groupName = req.params.groupName;
    var foundTournamentGroup = await TournamentGroup.findOne({ groupName: groupName })
      .populate({
        path: "userTournaments",
        populate: { path: "userRounds", populate: "round" },
      })
      .populate("comments")
      .populate({ path: "tournamentReference.id", populate: { path: "rounds" } });

    if (!foundTournamentGroup) {
      req.flash("error", "Tournament Group not found");
      return res.redirect("/tournamentGroups");
    }

    var isInGroup = false;
    var picksNeeded = true;
    var finalFourPicksNeeded = false;
    var championshipPicksNeeded = false;

    if (res.locals.currentUser) {
      for (var i = 0; i < res.locals.currentUser.tournamentGroups.length; i++) {
        var tournamentGroup = res.locals.currentUser.tournamentGroups[i];
        if (tournamentGroup.id.equals(foundTournamentGroup._id)) {
          isInGroup = true;
          var foundUserTournament = await UserTournament.findOne({
            "user.id": res.locals.currentUser._id,
            "tournamentGroup.groupName": foundTournamentGroup.groupName,
          })
            .populate({
              path: "userRounds",
              populate: { path: "round.id" },
            });

          if (foundUserTournament) {
            for (var j = 0; j < foundUserTournament.userRounds.length; j++) {
              var userRound = foundUserTournament.userRounds[j];
              if (
                userRound.round.numRound ===
                foundTournamentGroup.currentRound
              ) {
                picksNeeded = false;
                if (
                  foundTournamentGroup.currentRound == 1 &&
                  foundUserTournament.userRounds.length === 1
                ) {
                  finalFourPicksNeeded = true;
                }
                if (
                  foundTournamentGroup.currentRound == 1 &&
                  foundUserTournament.userRounds.length === 2
                ) {
                  championshipPicksNeeded = true;
                }
              }
            }
          }
          break;
        }
      }
    }

    foundTournamentGroup.userTournaments.sort(compareUserTournaments);
    res.render("tournamentGroups/show", {
      tournamentGroup: foundTournamentGroup,
      isInGroup: isInGroup,
      picksNeeded: picksNeeded,
      finalFourPicksNeeded: finalFourPicksNeeded,
      championshipPicksNeeded: championshipPicksNeeded,
      page: "tournamentGroups",
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Tournament Group not found");
    res.redirect("/tournamentGroups");
  }
});

//Note: this must be below the /tournaments/new route
//SHOW - shows more information about a particular tournament roup
router.get("/:groupName/bracket", async function (req, res) {
  try {
    var groupName = req.params.groupName;
    var foundTournamentGroup = await TournamentGroup.findOne({ groupName: groupName })
      .populate({
        path: "tournamentReference.id",
        populate: { path: "champion" },
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
      })
      .populate("userMatchAggregates")
      .populate("bonusAggregates")
      .populate("userTournaments");

    if (!foundTournamentGroup) {
      req.flash("error", "Tournament Group not found");
      return res.redirect("/tournamentGroups");
    }

    foundTournamentGroup.bonusAggregates.sort(compareBonusAggregates);

    var bonusAggregates;
    if (foundTournamentGroup.bonusAggregates.length > 0) {
      bonusAggregates = [[], [], [], [], []];

      for (
        var i = 0;
        i < foundTournamentGroup.bonusAggregates.length;
        i++
      ) {
        var agg = foundTournamentGroup.bonusAggregates[i];
        if (agg.matchNumber !== 63)
          bonusAggregates[agg.matchNumber - 57].push(agg);
        else bonusAggregates[4].push(agg);
      }
    }

    // Build team lost lookup (team.id populate doesn't work due to
    // Mongoose "id" virtual conflict, so query Teams directly)
    var teamIds = foundTournamentGroup.bonusAggregates.map(function (a) {
      return a.team.id;
    });
    // Build match winner lookup for bonus aggregate win/loss coloring
    var matchRefIds = foundTournamentGroup.bonusAggregates.map(function (a) {
      return a.matchReference;
    });

    var results = await Promise.all([
      Team.find({ _id: { $in: teamIds } }),
      Match.find({ _id: { $in: matchRefIds } }),
    ]);

    var teams = results[0];
    var matches = results[1];

    var teamLostMap = {};
    if (teams) {
      teams.forEach(function (t) {
        teamLostMap[String(t._id)] = t.lost || 0;
      });
    }

    var matchWinnerMap = {};
    if (matches) {
      matches.forEach(function (m) {
        if (m.winner) matchWinnerMap[String(m._id)] = String(m.winner);
      });
    }

    // Build rank lookup: userId → standings position (for sorting pickers on bracket)
    var sortedUTs = foundTournamentGroup.userTournaments.slice().sort(function (a, b) {
      return b.score - a.score;
    });
    var rankMap = {};
    var rankByName = {};
    sortedUTs.forEach(function (ut, idx) {
      rankMap[String(ut.user.id)] = idx + 1;
      // Also key by firstName as fallback for bonus aggregates
      // (older picker entries may store a different id format)
      if (!rankByName[ut.user.firstName]) {
        rankByName[ut.user.firstName] = idx + 1;
      }
    });

    // Check if current user should see picker names
    var currentUser = res.locals.currentUser;
    if (!currentUser) {
      // Not logged in — hide picker names
      res.render("tournamentGroups/showBracket", {
        tournamentGroup: foundTournamentGroup,
        bonAgg: bonusAggregates,
        teamLostMap: teamLostMap,
        rankMap: rankMap,
        rankByName: rankByName,
        matchWinnerMap: matchWinnerMap,
        hidePickerNames: true,
        page: "tournamentGroups",
      });
    } else if (currentUser.isAdmin) {
      // Admin — always show
      res.render("tournamentGroups/showBracket", {
        tournamentGroup: foundTournamentGroup,
        bonAgg: bonusAggregates,
        teamLostMap: teamLostMap,
        rankMap: rankMap,
        rankByName: rankByName,
        matchWinnerMap: matchWinnerMap,
        hidePickerNames: false,
        page: "tournamentGroups",
      });
    } else {
      middleware.checkUserPickStatus(
        currentUser._id,
        groupName,
        function (err, result) {
          res.render("tournamentGroups/showBracket", {
            tournamentGroup: foundTournamentGroup,
            bonAgg: bonusAggregates,
            teamLostMap: teamLostMap,
            rankMap: rankMap,
            rankByName: rankByName,
            matchWinnerMap: matchWinnerMap,
            hidePickerNames: result ? result.shouldHide : false,
            page: "tournamentGroups",
          });
        },
      );
    }
  } catch (err) {
    console.log(err);
    req.flash("error", "Tournament Group not found");
    res.redirect("/tournamentGroups");
  }
});

//Note: this must be below the /tournaments/new route
//SHOW - shows more information about a particular tournament Group
router.get("/:groupName/messageboard", async function (req, res) {
  try {
    var groupName = req.params.groupName;
    var foundTournamentGroup = await TournamentGroup.findOne({ groupName: groupName })
      .populate({
        path: "userTournaments",
        populate: { path: "userRounds", populate: "round" },
      })
      .populate("comments")
      .populate({ path: "tournamentReference.id", populate: { path: "rounds" } });

    if (!foundTournamentGroup) {
      req.flash("error", "Tournament Group not found");
      return res.redirect("/tournamentGroups");
    }

    foundTournamentGroup.userTournaments.sort(compareUserTournaments);
    res.render("tournamentGroups/messageboard", {
      tournamentGroup: foundTournamentGroup,
      page: "tournamentGroups",
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Tournament Group not found");
    res.redirect("/tournamentGroups");
  }
});

router.get("/:groupName/emailaddresslist", async function (req, res) {
  try {
    var groupName = req.params.groupName;
    var foundTournamentGroup = await TournamentGroup.findOne({ groupName: groupName })
      .populate({ path: "userTournaments", populate: { path: "user.id" } });

    if (!foundTournamentGroup) {
      req.flash("error", "Tournament Group not found");
      return res.redirect("/tournamentGroups");
    }

    foundTournamentGroup.userTournaments.forEach(function (userTournament) {
      console.log(userTournament.user.id.email);
    });
    req.flash("error", "Page Not Found");
    return res.redirect("back");
  } catch (err) {
    console.log(err);
    req.flash("error", "Tournament Group not found");
    res.redirect("/tournamentGroups");
  }
});

// //Note: this must be below the /tournaments/new route
// //SHOW - shows more information about a particular tournament
// router.get("/:year", function(req, res){
//     var year = req.params.year;
//     Tournament.findOne({year: year})
//         .populate({path: "rounds", populate: { path: "matches",populate:{ path: "topTeam" } }})
//         .populate({path: "rounds", populate: { path: "matches", populate: { path: "bottomTeam" } }})
//         .populate("champion")
//         .exec(function(err, foundTournament){
//          if (err || !foundTournament){
//             req.flash("error", "Tournament not found");
//             return res.redirect("/tournaments");
//         } else {
//             res.render("tournaments/show", {tournament: foundTournament});
//         }
//     });
// });

//EDIT Tournament Route
router.get(
  "/:id/edit",
  middleware.checkTournamentGroupOwnership,
  async function (req, res) {
    try {
      var foundCampground = await Campground.findById(req.params.id);
      res.render("campgrounds/edit", { campground: foundCampground });
    } catch (err) {
      console.log(err);
      res.redirect("/tournamentGroups");
    }
  },
);

// UPDATE Tournament Route
router.put(
  "/:id",
  middleware.checkTournamentGroupOwnership,
  async function (req, res) {
    try {
      //find and update the correct campground
      await Campground.findByIdAndUpdate(
        req.params.id,
        req.body.campground,
      );
      res.redirect("/campgrounds/" + req.params.id);
    } catch (err) {
      console.log(err);
      res.redirect("/campgrounds");
    }
  },
);

//DESTROY Tournament Route
router.delete(
  "/:id",
  middleware.checkTournamentGroupOwnership,
  async function (req, res) {
    try {
      await Campground.findByIdAndDelete(req.params.id);
      req.flash("success", "Campground deleted");
      res.redirect("/campgrounds");
    } catch (err) {
      console.log(err);
      res.redirect("/campgrounds");
    }
  },
);

function compareUserTournaments(a, b) {
  if (a.score > b.score) return -1;
  else if (a.score < b.score) return 1;
  else return 0;
}

function compareBonusAggregates(a, b) {
  if (a.matchNumber < b.matchNumber) return -1;
  else if (a.matchNumber > b.matchNumber) return 1;
  else {
    if (a.team.id.seed < b.team.id.seed) return -1;
    else if (a.team.id.seed > b.team.id.seed) return 1;
  }
  return 0;
}

function compare(a, b) {
  if (a.year > b.year) return -1;
  else if (a.year < b.year) return 1;
  return 0;
}

module.exports = router;
