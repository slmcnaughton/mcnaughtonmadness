var express = require("express");
var router = express.Router({ mergeParams: true }); //pass {} merges the parameters from the campground.js to this comments.js...allows us to access :id of the campground
var moment = require("moment-timezone");
var Tournament = require("../models/tournament");
var UserTournament = require("../models/userTournament");
var TournamentGroup = require("../models/tournamentGroup");
var Round = require("../models/round");
var UserRound = require("../models/userRound");
var UserMatchPrediction = require("../models/userMatchPrediction");
var DraftPick = require("../models/draftPick");
var Team = require("../models/team");
var middleware = require("../middleware");
var scoring = require("../helpers/scoring");
var tipoff = require("../helpers/tipoff");

//EDIT - render edit userRound form (aka...makePicks)
///tournamentGroups/McNaughton%20Family%20Group%202024/userTournaments/<USERNAME>/2/edit
router.get(
  "/:numRound/edit",
  middleware.checkUserTournamentOwnership,
  async function (req, res) {
    try {
      var foundTournamentGroup = await TournamentGroup.findOne({
        groupName: req.params.groupName,
      });
      if (!foundTournamentGroup) {
        req.flash("error", "tournament combination not found");
        return res.redirect("back");
      }
      var numRound = Number(req.params.numRound);
      var foundTournament = await Tournament.findById(
        foundTournamentGroup.tournamentReference.id,
      ).populate({
        path: "rounds",
        populate: {
          path: "matches",
          populate: [
            { path: "topTeam" },
            { path: "bottomTeam" },
            { path: "winner" },
          ],
        },
      });
      if (!foundTournament) {
        req.flash("error", "tournament combination not found");
        return res.redirect("back");
      }

      // Guard: prevent access to rounds more than 1 ahead of currentRound
      // (Rounds 7/8 are bonus picks tied to Round 1, so they're always allowed when Round 1 is current)
      var currentRound = foundTournamentGroup.currentRound;
      if (numRound < 7 && numRound > currentRound + 1) {
        req.flash("error", "That round isn't available yet.");
        return res.redirect("/tournamentGroups/" + req.params.groupName);
      }

      // Guard: if accessing the next round (currentRound + 1), user must have current round picks
      if (numRound < 7 && numRound === currentRound + 1) {
        var foundUserTournament = await UserTournament.findOne({
          "user.username": req.params.username,
          "tournamentGroup.groupName": req.params.groupName,
        }).populate("userRounds");

        var hasCurrentRoundPicks = false;
        if (foundUserTournament) {
          for (var ur of foundUserTournament.userRounds) {
            if (ur.round.numRound === currentRound) {
              hasCurrentRoundPicks = true;
              break;
            }
          }
          // Special case: Round 1 requires R1 + FF (R7) + Champ (R8) = 3 submissions
          if (currentRound === 1 && foundUserTournament.userRounds.length < 3) {
            hasCurrentRoundPicks = false;
          }
        }

        if (!hasCurrentRoundPicks) {
          req.flash("error", "Make your Round " + currentRound + " picks before starting Round " + numRound + ".");
          return res.redirect("/tournamentGroups/" + req.params.groupName);
        }
      }

      if (numRound < 7) {
        // Load draft picks for pre-population
        var draftPick = await DraftPick.findOne({
          user: req.user._id,
          tournamentGroup: foundTournamentGroup._id,
          numRound: numRound,
        });
        var draftPickMap = {};
        if (draftPick) {
          for (var dp of draftPick.picks) {
            draftPickMap[dp.matchNumber] = { winner: dp.winner, comment: dp.comment };
          }
        }

        // Load locked predictions (from draft auto-lock) for this round
        var lockedPicksMap = {};
        var foundUserTournament = await UserTournament.findOne({
          "user.username": req.params.username,
          "tournamentGroup.groupName": req.params.groupName,
        }).populate({ path: "userRounds", populate: { path: "userMatchPredictions", populate: "winner" } });

        if (foundUserTournament) {
          for (var ur of foundUserTournament.userRounds) {
            if (ur.round.numRound === numRound) {
              for (var pred of ur.userMatchPredictions) {
                lockedPicksMap[pred.match.matchNumber] = {
                  winner: pred.winner ? pred.winner._id : null,
                  winnerName: pred.winner ? pred.winner.name : null,
                  comment: pred.comment || "",
                };
              }
              break;
            }
          }
        }

        // Build per-game tipoff status using shared helper
        var round = foundTournament.rounds[numRound - 1];
        var matchTipoffStatus = tipoff.getMatchTipoffStatus(round.matches, Date.now());

        res.render("userRounds/edit.ejs", {
          tournament: foundTournament,
          round: round,
          tournamentGroup: foundTournamentGroup,
          username: req.params.username,
          targetFirstName: req.targetUserFirstName,
          isAdminOverride: !!(req.user && req.user.isAdmin),
          page: "tournamentGroups",
          calculateScores: scoring.calculateAggregateScores,
          draftPicks: draftPickMap,
          lockedPicks: lockedPicksMap,
          matchTipoffStatus: matchTipoffStatus,
          roundStartTime: round.startTime,
        });
      } else if (numRound === 7) {
        // Check if Round 1's tipoff has passed (bonus picks would be late)
        var r1StartTime = foundTournament.rounds[0] ? foundTournament.rounds[0].startTime : null;
        var bonusIsLate = r1StartTime && moment().isAfter(moment(r1StartTime));
        res.render("userRounds/editFinalFour.ejs", {
          tournament: foundTournament,
          numRound: numRound,
          tournamentGroup: foundTournamentGroup,
          username: req.params.username,
          targetFirstName: req.targetUserFirstName,
          page: "tournamentGroups",
          bonusPicksAreLate: bonusIsLate && !req.user.isAdmin,
        });
      } else {
        // For Champion pick, look up this user's Final Four picks
        // so we can limit champion options to just those 4 teams
        var foundUserTournament = await UserTournament.findOne({
          "tournamentReference.id": foundTournament._id,
          "user.username": req.params.username,
        }).populate({
          path: "userRounds",
          populate: {
            path: "userMatchPredictions",
            populate: "winner",
          },
        });
        var finalFourTeams = [];
        if (foundUserTournament) {
          for (var r = 0; r < foundUserTournament.userRounds.length; r++) {
            if (foundUserTournament.userRounds[r].round.numRound === 7) {
              var preds =
                foundUserTournament.userRounds[r].userMatchPredictions;
              for (var p = 0; p < preds.length; p++) {
                if (preds[p].winner) {
                  finalFourTeams.push(preds[p].winner);
                }
              }
              break;
            }
          }
        }
        var r1StartTime = foundTournament.rounds[0] ? foundTournament.rounds[0].startTime : null;
        var bonusIsLate = r1StartTime && moment().isAfter(moment(r1StartTime));
        res.render("userRounds/editChamp.ejs", {
          tournament: foundTournament,
          numRound: Number(numRound),
          tournamentGroup: foundTournamentGroup,
          username: req.params.username,
          targetFirstName: req.targetUserFirstName,
          page: "tournamentGroups",
          finalFourTeams: finalFourTeams,
          bonusPicksAreLate: bonusIsLate && !req.user.isAdmin,
        });
      }
    } catch (err) {
      console.log(err);
      req.flash("error", "Something went wrong");
      res.redirect("back");
    }
  },
);

//UPDATE - UserRound of Tournament
// router.put("/:numRound", middleware.userRoundCreation,
router.put(
  "/:numRound",
  middleware.checkUserTournamentOwnership,
  middleware.checkTipoffTime,
  middleware.userRoundCreation,
  middleware.updateUserMatchAggregates,
  async function (req, res) {
    var round = Number(req.params.numRound);
    var isLatePending = res.locals.bonusPicksAreLate && (round === 7 || round === 8);

    // Send commissioner notification for late bonus picks — only on R8 (the last one),
    // so the commissioner gets a single email covering both Final Four + Championship
    if (isLatePending && round === 8) {
      try {
        var group = await TournamentGroup.findOne({ groupName: req.params.groupName })
          .populate("commissioner.id");
        if (group && group.commissioner && group.commissioner.id && group.commissioner.id.email) {
          var emailHelper = require("../middleware/emailHelper");
          emailHelper.sendEmail(
            group.commissioner.id.email,
            "[" + group.groupName + "] Late Bonus Picks Submitted by " + (res.locals.userFirstName || req.params.username),
            {
              content: "<h3>Late Bonus Picks Submitted</h3>" +
                "<p><strong>" + (res.locals.userFirstName || req.params.username) + "</strong> submitted their Final Four and Championship picks after tipoff.</p>" +
                "<p>Submitted at: " + new Date().toLocaleString("en-US", { timeZone: "America/New_York" }) + " ET</p>" +
                "<p>Please review and approve or reject from the <a href='" + req.protocol + "://" + req.get("host") + "/tournamentGroups/" + encodeURIComponent(group.groupName) + "/manage'>commissioner dashboard</a>.</p>",
              contentType: "html",
            },
            "lateBonusPicks",
            group.groupName,
          );
        }
      } catch (emailErr) {
        console.log("[LATE BONUS] Error sending commissioner notification:", emailErr);
      }
    }

    if (round === 1) {
      req.flash("success", "Round 1 picks submitted!");
      res.redirect(
        "/tournamentGroups/" +
          req.params.groupName +
          "/userTournaments/" +
          req.params.username +
          "/7/edit",
      );
    } else if (round === 7) {
      if (isLatePending) {
        req.flash("warning", "Final Four picks submitted for commissioner review. They will be scored once approved.");
      } else {
        req.flash("success", "Final Four picks submitted!");
      }
      res.redirect(
        "/tournamentGroups/" +
          req.params.groupName +
          "/userTournaments/" +
          req.params.username +
          "/8/edit",
      );
    } else if (round === 8) {
      if (isLatePending) {
        req.flash("warning", "Championship pick submitted for commissioner review. It will be scored once approved.");
      } else {
        req.flash("success", "Championship pick submitted!");
      }
      res.redirect(
        "/tournamentGroups/" +
          req.params.groupName +
          "/userTournaments/" +
          req.params.username,
      );
    } else {
      req.flash("success", "Round " + round + " picks submitted!");
      res.redirect(
        "/tournamentGroups/" +
          req.params.groupName +
          "/userTournaments/" +
          req.params.username,
      );
    }
  },
);

// ─── Draft Pick Routes ────────────────────────────────────────────────────

// SAVE DRAFT - Save or update draft picks for a round
router.put(
  "/:numRound/draft",
  middleware.checkUserTournamentOwnership,
  async function (req, res) {
    try {
      var foundTournamentGroup = await TournamentGroup.findOne({
        groupName: req.params.groupName,
      });
      if (!foundTournamentGroup) {
        return res.status(404).json({ error: "Tournament group not found" });
      }

      var numRound = Number(req.params.numRound);

      // Save draft for the TARGET user (from URL), not necessarily the logged-in user.
      // This handles the case where an admin is editing another user's picks.
      var targetUserTournament = await UserTournament.findOne({
        "user.username": req.params.username,
        "tournamentGroup.groupName": req.params.groupName,
      });
      var draftUserId = targetUserTournament ? targetUserTournament.user.id : req.user._id;

      var picks = [];

      // Parse picks from request body (same format as regular submission)
      for (var key in req.body) {
        if (req.body.hasOwnProperty(key) && !isNaN(Number(key))) {
          var matchNumber = Number(key);
          var winner = req.body[key][0] || null;
          var comment = req.body[key][1] || "";
          if (winner) {
            picks.push({
              matchNumber: matchNumber,
              winner: winner,
              comment: comment,
            });
          }
        }
      }

      // Upsert the draft pick document
      await DraftPick.findOneAndUpdate(
        {
          user: draftUserId,
          tournamentGroup: foundTournamentGroup._id,
          numRound: numRound,
        },
        {
          user: draftUserId,
          tournamentGroup: foundTournamentGroup._id,
          numRound: numRound,
          picks: picks,
          updatedAt: new Date(),
          autoSubmitted: false,
        },
        { upsert: true, new: true },
      );

      // Check if this is an AJAX request
      if (req.xhr || (req.headers.accept || "").indexOf("json") > -1) {
        return res.json({ success: true, message: "Draft saved", pickCount: picks.length });
      }

      req.flash("success", "Draft saved! Remember to submit before tipoff.");
      res.redirect("back");
    } catch (err) {
      console.log(err);
      if (req.xhr || (req.headers.accept || "").indexOf("json") > -1) {
        return res.status(500).json({ error: "Failed to save draft" });
      }
      req.flash("error", "Failed to save draft");
      res.redirect("back");
    }
  },
);

// LOAD DRAFT - Get draft picks for a round (JSON)
router.get(
  "/:numRound/draft",
  middleware.checkUserTournamentOwnership,
  async function (req, res) {
    try {
      var foundTournamentGroup = await TournamentGroup.findOne({
        groupName: req.params.groupName,
      });
      if (!foundTournamentGroup) {
        return res.status(404).json({ error: "Tournament group not found" });
      }

      var draftPick = await DraftPick.findOne({
        user: req.user._id,
        tournamentGroup: foundTournamentGroup._id,
        numRound: Number(req.params.numRound),
      });

      if (!draftPick) {
        return res.json({ picks: [], updatedAt: null });
      }

      res.json({
        picks: draftPick.picks,
        updatedAt: draftPick.updatedAt,
        autoSubmitted: draftPick.autoSubmitted,
      });
    } catch (err) {
      console.log(err);
      res.status(500).json({ error: "Failed to load draft" });
    }
  },
);

module.exports = router;
