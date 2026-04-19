var express = require("express");
var router = express.Router();
var moment = require("moment-timezone");
var middleware = require("../middleware");
var Tournament = require("../models/tournament");
var TournamentGroup = require("../models/tournamentGroup");
var Round = require("../models/round");
var UserTournament = require("../models/userTournament");
var Team = require("../models/team");
var Match = require("../models/match");
var EmailLog = require("../models/emailLog");
var DraftPick = require("../models/draftPick");
var UserRound = require("../models/userRound");
var UserMatchPrediction = require("../models/userMatchPrediction");
var User = require("../models/user");
var BonusAggregate = require("../models/bonusAggregate");
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

    // Load pending-approval bonus picks for this group
    var pendingPicks = [];
    if (group.userTournaments) {
      for (var ut of group.userTournaments) {
        if (ut.userRounds) {
          for (var ur of ut.userRounds) {
            if (ur.pendingApproval) {
              // Populate the predictions with winner details
              var populated = await UserRound.findById(ur._id)
                .populate({ path: "userMatchPredictions", populate: { path: "winner" } });
              if (populated) {
                pendingPicks.push({
                  userRound: populated,
                  userName: ut.user.firstName + " " + ut.user.lastName,
                  username: ut.user.username,
                  userId: ut.user.id,
                  roundLabel: ur.round.numRound === 7 ? "Final Four" : ur.round.numRound === 8 ? "Championship" : "Round " + ur.round.numRound,
                  submittedAt: ur.pendingApprovalAt,
                });
              }
            }
          }
        }
      }
    }

    // Load all drafts for users in this group (keyed by "userId_numRound")
    var allDrafts = await DraftPick.find({ tournamentGroup: group._id });
    var draftMap = {};
    for (var d of allDrafts) {
      draftMap[d.user.toString() + "_" + d.numRound] = true;
    }

    // Load round match counts to detect partial submissions
    var roundMatchCounts = {};
    var populatedGroup = await TournamentGroup.findById(group._id)
      .populate({ path: "tournamentReference.id", populate: { path: "rounds", populate: "matches" } });
    if (populatedGroup && populatedGroup.tournamentReference && populatedGroup.tournamentReference.id) {
      var rounds = populatedGroup.tournamentReference.id.rounds;
      for (var r of rounds) {
        roundMatchCounts[r.numRound] = r.matches ? r.matches.length : 0;
      }
    }

    res.render("tournamentGroups/manage", {
      group: group,
      emailLogs: emailLogs,
      pendingPicks: pendingPicks,
      draftMap: draftMap,
      roundMatchCounts: roundMatchCounts,
      moment: moment,
      page: "tournamentGroups",
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Tournament Group not found");
    res.redirect("/tournamentGroups");
  }
});

// APPROVE late bonus picks (R7 + R8 together) for a user
router.post("/:groupName/approveBonusPicks/:userId", middleware.isCommissionerOrAdmin, async function (req, res) {
  try {
    var groupName = req.params.groupName;
    var foundGroup = await TournamentGroup.findOne({ groupName: groupName });
    if (!foundGroup) {
      req.flash("error", "Group not found");
      return res.redirect("/tournamentGroups/" + groupName + "/manage");
    }

    var userTournament = await UserTournament.findOne({
      "user.id": req.params.userId,
      "tournamentGroup.id": foundGroup._id,
    }).populate({ path: "userRounds", populate: { path: "userMatchPredictions", populate: "winner" } });

    if (!userTournament) {
      req.flash("error", "User tournament not found");
      return res.redirect("/tournamentGroups/" + groupName + "/manage");
    }

    var approvedCount = 0;
    for (var ur of userTournament.userRounds) {
      if (ur.pendingApproval && (ur.round.numRound === 7 || ur.round.numRound === 8)) {
        ur.pendingApproval = false;
        ur.pendingApprovalAt = null;
        await ur.save();

        // Create bonus aggregates for the approved picks
        for (var pred of ur.userMatchPredictions) {
          if (!pred.winner) continue;
          var foundTeam = await Team.findById(pred.winner._id || pred.winner);
          if (!foundTeam) continue;

          var matchDoc = await Match.findById(pred.match.id);
          if (!matchDoc) continue;

          var foundBonusAgg = await BonusAggregate.findOne({
            "team.id": foundTeam.id,
            matchReference: pred.match.id,
            tournamentGroup: foundGroup.id,
          });

          if (!foundBonusAgg) {
            foundBonusAgg = await BonusAggregate.create({
              matchNumber: matchDoc.matchNumber,
              matchReference: matchDoc.id,
              tournamentGroup: foundGroup.id,
              team: { id: foundTeam.id, name: foundTeam.name, image: foundTeam.image },
              teamPickers: [],
            });
            foundGroup.bonusAggregates.push(foundBonusAgg);
          }

          foundBonusAgg.teamPickers.push({
            id: userTournament.user.id,
            firstName: userTournament.user.firstName,
            comment: pred.comment || "",
          });
          await foundBonusAgg.save();
        }
        approvedCount++;
      }
    }
    await foundGroup.save();

    // Send approval email
    var approvedUser = await User.findById(userTournament.user.id);
    if (approvedUser && approvedUser.email) {
      emailHelper.sendEmail(
        approvedUser.email,
        "[" + groupName + "] Your bonus picks have been approved!",
        {
          content: "<h3>Bonus Picks Approved</h3>" +
            "<p>Good news! The commissioner has approved your late Final Four and Championship picks for <strong>" + groupName + "</strong>.</p>" +
            "<p>Your picks will now be scored normally.</p>",
          contentType: "html",
        },
        "bonusPicksApproved",
        groupName,
      );
    }

    req.flash("success", "Approved " + approvedCount + " bonus pick round(s) for " + (userTournament.user.firstName || "user") + ".");
    res.redirect("/tournamentGroups/" + groupName + "/manage");
  } catch (err) {
    console.log(err);
    req.flash("error", "Error approving picks");
    res.redirect("/tournamentGroups/" + req.params.groupName + "/manage");
  }
});

// REJECT late bonus picks (R7 + R8 together) — marks as rejected, keeps picks visible but scored as 0
router.post("/:groupName/rejectBonusPicks/:userId", middleware.isCommissionerOrAdmin, async function (req, res) {
  try {
    var groupName = req.params.groupName;
    var foundGroup = await TournamentGroup.findOne({ groupName: groupName });
    if (!foundGroup) {
      req.flash("error", "Group not found");
      return res.redirect("/tournamentGroups/" + groupName + "/manage");
    }

    var userTournament = await UserTournament.findOne({
      "user.id": req.params.userId,
      "tournamentGroup.id": foundGroup._id,
    }).populate({ path: "userRounds", populate: "userMatchPredictions" });

    if (!userTournament) {
      req.flash("error", "User tournament not found");
      return res.redirect("/tournamentGroups/" + groupName + "/manage");
    }

    var rejectedCount = 0;
    for (var ur of userTournament.userRounds) {
      if (ur.pendingApproval && (ur.round.numRound === 7 || ur.round.numRound === 8)) {
        ur.pendingApproval = false;
        ur.rejected = true;
        ur.roundScore = 0;
        // Zero out all prediction scores
        for (var pred of ur.userMatchPredictions) {
          pred.score = 0;
          await pred.save();
        }
        await ur.save();
        rejectedCount++;
      }
    }

    // Recalculate total score after zeroing out rejected rounds
    var refreshed = await UserTournament.findById(userTournament._id).populate("userRounds");
    if (refreshed) {
      refreshed.score = 0;
      refreshed.userRounds.forEach(function (ur) { refreshed.score += ur.roundScore; });
      await refreshed.save();
    }

    // Send rejection email
    var rejectedUser = await User.findById(userTournament.user.id);
    if (rejectedUser && rejectedUser.email) {
      emailHelper.sendEmail(
        rejectedUser.email,
        "[" + groupName + "] Your bonus picks were not accepted",
        {
          content: "<h3>Bonus Picks Not Accepted</h3>" +
            "<p>The commissioner has decided not to accept your late Final Four and Championship picks for <strong>" + groupName + "</strong>.</p>" +
            "<p>Your picks are still visible but will be scored as 0 points.</p>",
          contentType: "html",
        },
        "bonusPicksRejected",
        groupName,
      );
    }

    req.flash("success", "Rejected " + rejectedCount + " bonus pick round(s) for " + (userTournament.user.firstName || "user") + ".");
    res.redirect("/tournamentGroups/" + groupName + "/manage");
  } catch (err) {
    console.log(err);
    req.flash("error", "Error rejecting picks");
    res.redirect("/tournamentGroups/" + req.params.groupName + "/manage");
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
                // Check if picks are complete — count predictions vs known matchups
                var tournament = foundTournamentGroup.tournamentReference.id;
                var roundIndex = foundTournamentGroup.currentRound - 1;
                if (tournament && tournament.rounds && tournament.rounds[roundIndex]) {
                  var currentRoundDoc = await Round.findById(tournament.rounds[roundIndex])
                    .populate({ path: "matches", populate: [{ path: "topTeam" }, { path: "bottomTeam" }] });
                  if (currentRoundDoc) {
                    var knownMatchups = 0;
                    for (var mk = 0; mk < currentRoundDoc.matches.length; mk++) {
                      if (currentRoundDoc.matches[mk].topTeam && currentRoundDoc.matches[mk].bottomTeam) {
                        knownMatchups++;
                      }
                    }
                    // If user has fewer predictions than known matchups, picks are incomplete
                    var predCount = userRound.userMatchPredictions ? userRound.userMatchPredictions.length : 0;
                    if (predCount < knownMatchups) {
                      // Partial submission — still need to complete picks
                      break;
                    }
                  }
                }

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

    // Check for saved drafts or partial locked picks for the current round
    var hasDraft = false;
    var draftUpdatedAt = null;
    var hasLockedPicks = false;
    var lockedPickCount = 0;
    if (res.locals.currentUser && isInGroup) {
      var draft = await DraftPick.findOne({
        user: res.locals.currentUser._id,
        tournamentGroup: foundTournamentGroup._id,
        numRound: foundTournamentGroup.currentRound,
      });
      if (draft && draft.picks.length > 0) {
        hasDraft = true;
        draftUpdatedAt = draft.updatedAt;
      }

      // Check for partial UserRound (from draft auto-lock) even if draft is gone
      if (!hasDraft && picksNeeded) {
        var userTournForLock = await UserTournament.findOne({
          "user.id": res.locals.currentUser._id,
          "tournamentGroup.groupName": foundTournamentGroup.groupName,
        }).populate("userRounds");
        if (userTournForLock) {
          for (var ur of userTournForLock.userRounds) {
            if (ur.round.numRound === foundTournamentGroup.currentRound) {
              var pCount = ur.userMatchPredictions ? ur.userMatchPredictions.length : 0;
              if (pCount > 0) {
                hasLockedPicks = true;
                lockedPickCount = pCount;
              }
              break;
            }
          }
        }
      }
    }

    // Check if next round has any known matchups (for early drafting)
    var nextRoundAvailable = false;
    var nextRoundKnownMatchups = 0;
    var nextRoundTotalMatchups = 0;
    var nextRoundNum = 0;
    var hasNextRoundDraft = false;
    var nextRoundDraftUpdatedAt = null;

    if (res.locals.currentUser && isInGroup && !picksNeeded && !finalFourPicksNeeded && !championshipPicksNeeded) {
      var tournament = foundTournamentGroup.tournamentReference.id;
      var currentRound = foundTournamentGroup.currentRound;
      // Next round index (0-based): currentRound gives us the next round since rounds are 1-indexed
      if (tournament && tournament.rounds && currentRound < tournament.rounds.length) {
        var nextRound = await Round.findById(tournament.rounds[currentRound])
          .populate({ path: "matches", populate: [{ path: "topTeam" }, { path: "bottomTeam" }] });

        if (nextRound) {
          nextRoundNum = currentRound + 1;
          nextRoundTotalMatchups = nextRound.matches.length;
          for (var m = 0; m < nextRound.matches.length; m++) {
            if (nextRound.matches[m].topTeam && nextRound.matches[m].bottomTeam) {
              nextRoundKnownMatchups++;
            }
          }
          if (nextRoundKnownMatchups > 0) {
            nextRoundAvailable = true;

            // Check for existing draft for next round
            var nextDraft = await DraftPick.findOne({
              user: res.locals.currentUser._id,
              tournamentGroup: foundTournamentGroup._id,
              numRound: nextRoundNum,
            });
            if (nextDraft && nextDraft.picks.length > 0) {
              hasNextRoundDraft = true;
              nextRoundDraftUpdatedAt = nextDraft.updatedAt;
            }
          }
        }
      }
    }

    // Check for pending and rejected bonus picks
    var hasPendingBonusPicks = false;
    var hasRejectedBonusPicks = false;
    var pendingBonusRounds = [];
    if (res.locals.currentUser && isInGroup) {
      var userTournForPending = await UserTournament.findOne({
        "user.id": res.locals.currentUser._id,
        "tournamentGroup.groupName": foundTournamentGroup.groupName,
      }).populate("userRounds");
      if (userTournForPending) {
        for (var ur of userTournForPending.userRounds) {
          if (ur.pendingApproval) {
            hasPendingBonusPicks = true;
            pendingBonusRounds.push(ur.round.numRound === 7 ? "Final Four" : ur.round.numRound === 8 ? "Championship" : "Round " + ur.round.numRound);
          }
          if (ur.rejected) {
            hasRejectedBonusPicks = true;
          }
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
      hasDraft: hasDraft,
      draftUpdatedAt: draftUpdatedAt,
      hasLockedPicks: hasLockedPicks,
      lockedPickCount: lockedPickCount,
      nextRoundAvailable: nextRoundAvailable,
      nextRoundKnownMatchups: nextRoundKnownMatchups,
      nextRoundTotalMatchups: nextRoundTotalMatchups,
      nextRoundNum: nextRoundNum,
      hasNextRoundDraft: hasNextRoundDraft,
      nextRoundDraftUpdatedAt: nextRoundDraftUpdatedAt,
      hasPendingBonusPicks: hasPendingBonusPicks,
      hasRejectedBonusPicks: hasRejectedBonusPicks,
      pendingBonusRounds: pendingBonusRounds,
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
      var pickStatus = await middleware.checkUserPickStatus(currentUser._id, groupName);
      var visibleThroughRound = (pickStatus && typeof pickStatus.visibleThroughRound === "number")
        ? pickStatus.visibleThroughRound : 99;
      res.render("tournamentGroups/showBracket", {
        tournamentGroup: foundTournamentGroup,
        bonAgg: bonusAggregates,
        teamLostMap: teamLostMap,
        rankMap: rankMap,
        rankByName: rankByName,
        matchWinnerMap: matchWinnerMap,
        hidePickerNames: pickStatus ? pickStatus.shouldHide : false,
        visibleThroughRound: visibleThroughRound,
        page: "tournamentGroups",
      });
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
