//all the middleware goes here
var Comment = require("../models/comment");
var moment = require("moment-timezone");
var Tournament = require("../models/tournament");
var Round = require("../models/round");
var Match = require("../models/match");
var Team = require("../models/team");
var TournamentGroup = require("../models/tournamentGroup");
var UserTournament = require("../models/userTournament");
var UserRound = require("../models/userRound");
var UserMatchPrediction = require("../models/userMatchPrediction");
var UserMatchAggregate = require("../models/userMatchAggregate");
var BonusAggregate = require("../models/bonusAggregate");
var emailHelper = require("./emailHelper");
var teamAliases = require("../helpers/teamAliases");
var scoring = require("../helpers/scoring");
var tipoff = require("../helpers/tipoff");
var Trophy = require("../models/trophy");
var User = require("../models/user");
var DraftPick = require("../models/draftPick");

var middlewareObj = {};

// Shared helper: recalculate a UserTournament's total score from its userRounds
async function recalculateUserTournamentScore(userTournamentId) {
  var refreshed = await UserTournament.findById(userTournamentId).populate("userRounds");
  if (refreshed) {
    refreshed.score = 0;
    refreshed.userRounds.forEach(function (ur) { refreshed.score += ur.roundScore; });
    await refreshed.save();
  }
}

middlewareObj.checkTournamentGroupOwnership = async function (req, res, next) {
  if (req.isAuthenticated()) {
    try {
      var foundTournamentGroup = await TournamentGroup.findOne({ groupName: req.params.groupName });
      if (!foundTournamentGroup) {
        req.flash("error", "Tournament Group not found");
        return res.redirect("back");
      }
      //does user own the tournament group?
      if (foundTournamentGroup.commissioner.id.equals(req.user.id)) {
        next();
      } else {
        req.flash("error", "You don't have permission to do that");
        res.redirect("back");
      }
    } catch (err) {
      req.flash("error", "Tournament Group not found");
      res.redirect("back");
    }
  } else {
    req.flash("error", "You need to be logged in to do that");
    res.redirect("back");
  }
};

middlewareObj.isCommissionerOrAdmin = async function (req, res, next) {
  if (req.isAuthenticated()) {
    if (req.user.isAdmin) {
      return next();
    }
    try {
      var foundTournamentGroup = await TournamentGroup.findOne({ groupName: req.params.groupName });
      if (!foundTournamentGroup) {
        req.flash("error", "Tournament Group not found");
        return res.redirect("back");
      }
      if (foundTournamentGroup.commissioner.id.equals(req.user.id)) {
        return next();
      }
      req.flash("error", "You don't have permission to do that");
      res.redirect("back");
    } catch (err) {
      req.flash("error", "Tournament Group not found");
      return res.redirect("back");
    }
  } else {
    req.flash("error", "You need to be logged in to do that");
    res.redirect("/login");
  }
};

middlewareObj.checkUserTournamentOwnership = async function (req, res, next) {
  if (req.isAuthenticated()) {
    try {
      var foundUserTournament = await UserTournament.findOne({
        "user.username": req.params.username,
        "tournamentGroup.groupName": req.params.groupName,
      });
      if (!foundUserTournament) {
        req.flash("error", "User Tournament not found");
        return res.redirect("back");
      }
      //does user own the User Tournament, or is the requester admin/commissioner?
      if (
        foundUserTournament.user.id.equals(req.user.id) ||
        req.user.isAdmin
      ) {
        req.targetUserFirstName = foundUserTournament.user.firstName;
        next();
      } else {
        // Check if current user is commissioner of this group
        var group = await TournamentGroup.findOne({ groupName: req.params.groupName });
        if (group && group.commissioner.id.equals(req.user.id)) {
          req.targetUserFirstName = foundUserTournament.user.firstName;
          return next();
        }
        req.flash("error", "You don't have permission to do that");
        res.redirect("back");
      }
    } catch (err) {
      req.flash("error", "User Tournament not found");
      res.redirect("back");
    }
  } else {
    req.flash("error", "You need to be logged in to do that");
    res.redirect("back");
  }
};

middlewareObj.checkCommentOwnership = async function (req, res, next) {
  if (req.isAuthenticated()) {
    try {
      var foundComment = await Comment.findById(req.params.comment_id);
      if (!foundComment) {
        req.flash("error", "Comment not found");
        return res.redirect("back");
      }
      //does user own the comment?
      if (foundComment.author.id.equals(req.user.id)) {
        next();
      } else {
        req.flash("error", "You don't have permission to do that");
        res.redirect("back");
      }
    } catch (err) {
      req.flash("error", "Comment not found");
      res.redirect("back");
    }
  } else {
    req.flash("error", "You need to be logged in to do that");
    res.redirect("back");
  }
};

middlewareObj.isLoggedIn = function (req, res, next) {
  //Middleware: determines whether user is logged in
  if (req.isAuthenticated()) {
    return next();
  }
  req.session.returnTo = req.originalUrl;
  req.flash("error", "You need to be logged in to do that");
  res.redirect("/login");
};

middlewareObj.manuallyUpdateResults = async function (req, res, next) {
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
      return res.redirect("back");
    }

    var round = foundTournament.rounds[foundTournament.currentRound - 1];
    var roundFirstMatch = round.matches[0].matchNumber;

    var matchUpdates = [];

    var roundMatchIndex = 0;
    for (var match of round.matches) {
      var bodyIndex = roundFirstMatch + roundMatchIndex;

      if (req.body[bodyIndex]) {
        var winner = await Team.findById(req.body[bodyIndex]);
        var tempMatch = {
          roundMatchIndex: roundMatchIndex,
          tournamentId: foundTournament._id,
          currentRound: foundTournament.currentRound,
          currentRoundId: foundTournament.rounds[foundTournament.currentRound - 1]._id,
          nextRoundId: foundTournament.currentRound < foundTournament.rounds.length
            ? foundTournament.rounds[foundTournament.currentRound]._id : null,
          totalRounds: foundTournament.rounds.length,
          matchNumber: bodyIndex,
          matchId: round.matches[roundMatchIndex].id,
          winningTeam: winner,
        };
        matchUpdates.push(tempMatch);
      }
      roundMatchIndex++;
    }

    if (matchUpdates.length > 0) {
      await updateResults(matchUpdates);
      next();
    }
  } catch (err) {
    console.log(err);
    res.redirect("back");
  }
};

var scrapeInProgress = false;

middlewareObj.scrapeUpdateResults = async function (parsedResults) {
  if (scrapeInProgress) {
    console.log("[SCRAPE] Skipping — previous scrape still in progress");
    return;
  }
  scrapeInProgress = true;

  try {
    var matchUpdates = [];

    var foundTournament = await Tournament.findOne({ year: new Date().getFullYear() })
      .populate({
        path: "rounds",
        populate: { path: "matches", populate: { path: "topTeam" } },
      })
      .populate({
        path: "rounds",
        populate: { path: "matches", populate: { path: "bottomTeam" } },
      });

    if (!foundTournament) {
      console.log("no tournament found");
      scrapeInProgress = false;
      return;
    }

    // Tournament is complete — no more rounds to process
    if (foundTournament.currentRound > foundTournament.rounds.length) {
      scrapeInProgress = false;
      return;
    }

    // Extract only the lightweight fields we need, so the fully-populated
    // tournament can be garbage-collected once matching is done
    var currentRound = foundTournament.currentRound;
    var tournamentId = foundTournament._id;
    var currentRoundId = foundTournament.rounds[currentRound - 1]._id;
    var nextRoundId = currentRound < foundTournament.rounds.length
      ? foundTournament.rounds[currentRound]._id : null;
    var totalRounds = foundTournament.rounds.length;

    var round = foundTournament.rounds[currentRound - 1];
    var roundMatchIndex = 0;
    for (var match of round.matches) {
      for (var result of parsedResults) {
        // Skip matches where teams haven't been set yet (e.g. later rounds)
        if (!match.topTeam || !match.bottomTeam) continue;

        var topAliases = match.topTeam.aliases || [];
        var bottomAliases = match.bottomTeam.aliases || [];

        var topMatchesTeam1 = teamAliases.teamsMatch(match.topTeam.name, result.team1, topAliases);
        var topMatchesTeam2 = teamAliases.teamsMatch(match.topTeam.name, result.team2, topAliases);
        var bottomMatchesTeam1 = teamAliases.teamsMatch(match.bottomTeam.name, result.team1, bottomAliases);
        var bottomMatchesTeam2 = teamAliases.teamsMatch(match.bottomTeam.name, result.team2, bottomAliases);

        var matchFound =
          !match.winner &&
          ((topMatchesTeam1 && bottomMatchesTeam2) ||
            (topMatchesTeam2 && bottomMatchesTeam1));

        if (matchFound) {
          var winningTeam;
          if (teamAliases.teamsMatch(match.topTeam.name, result.winner, topAliases)) {
            console.log(match.topTeam.name + " defeated " + match.bottomTeam.name);
            winningTeam = match.topTeam;
          } else {
            console.log(match.bottomTeam.name + " defeated " + match.topTeam.name);
            winningTeam = match.bottomTeam;
          }
          var tempMatch = {
            roundMatchIndex: roundMatchIndex,
            tournamentId: tournamentId,
            currentRound: currentRound,
            currentRoundId: currentRoundId,
            nextRoundId: nextRoundId,
            totalRounds: totalRounds,
            matchNumber: match.matchNumber,
            matchId: match.id,
            winningTeam: winningTeam,
          };
          matchUpdates.push(tempMatch);
        }
      }
      roundMatchIndex++;
    }

    logUnmatchedResults(parsedResults, round);
    if (matchUpdates.length > 0) {
      await updateResults(matchUpdates);
    } else {
      // No finished games this scrape, but lock drafts for games that have started
      await middlewareObj.lockDraftPicksForStartedGames();
      scrapeInProgress = false;
    }
  } catch (err) {
    console.log(err);
    scrapeInProgress = false;
  }
};

// Log any scraped results that didn't match a DB team so Seth can spot problems
function logUnmatchedResults(parsedResults, round) {
  parsedResults.forEach(function (result) {
    var matched = false;
    for (var i = 0; i < round.matches.length; i++) {
      var match = round.matches[i];
      if (!match.topTeam || !match.bottomTeam) continue;
      var topAliases = match.topTeam.aliases || [];
      var bottomAliases = match.bottomTeam.aliases || [];
      if (
        teamAliases.teamsMatch(match.topTeam.name, result.team1, topAliases) ||
        teamAliases.teamsMatch(match.topTeam.name, result.team2, topAliases) ||
        teamAliases.teamsMatch(match.bottomTeam.name, result.team1, bottomAliases) ||
        teamAliases.teamsMatch(match.bottomTeam.name, result.team2, bottomAliases)
      ) {
        matched = true;
        break;
      }
    }
    if (!matched) {
      console.log("[UNMATCHED] CBS result not matched to any DB team: " + result.team1 + " vs " + result.team2);
    }
  });
}

// ─── Update Match Start Times from CBS Scrape ──────────────────────────────
// Matches scraped team names to DB matches and sets match.startTime.
// Also updates round.startTime to the earliest game time if earlier.
middlewareObj.updateMatchStartTimes = async function (parsedTimes) {
  try {
    var foundTournament = await Tournament.findOne({ year: new Date().getFullYear() })
      .populate({
        path: "rounds",
        populate: { path: "matches", populate: [{ path: "topTeam" }, { path: "bottomTeam" }] },
      });

    if (!foundTournament) return;
    if (foundTournament.currentRound > foundTournament.rounds.length) return;

    var round = foundTournament.rounds[foundTournament.currentRound - 1];
    var updatedCount = 0;
    var earliestStartTime = null;

    for (var match of round.matches) {
      if (!match.topTeam || !match.bottomTeam) continue;

      // If match already has a startTime, track it for round update but don't overwrite
      if (match.startTime) {
        if (!earliestStartTime || match.startTime < earliestStartTime) {
          earliestStartTime = match.startTime;
        }
        continue;
      }

      var topAliases = match.topTeam.aliases || [];
      var bottomAliases = match.bottomTeam.aliases || [];

      for (var result of parsedTimes) {
        var topMatchesTeam1 = teamAliases.teamsMatch(match.topTeam.name, result.team1, topAliases);
        var topMatchesTeam2 = teamAliases.teamsMatch(match.topTeam.name, result.team2, topAliases);
        var bottomMatchesTeam1 = teamAliases.teamsMatch(match.bottomTeam.name, result.team1, bottomAliases);
        var bottomMatchesTeam2 = teamAliases.teamsMatch(match.bottomTeam.name, result.team2, bottomAliases);

        var matchFound =
          (topMatchesTeam1 && bottomMatchesTeam2) ||
          (topMatchesTeam2 && bottomMatchesTeam1);

        if (matchFound && result.startTime) {
          match.startTime = result.startTime;
          await match.save();
          updatedCount++;
          console.log("[START TIME] " + match.topTeam.name + " vs " + match.bottomTeam.name + " → " + result.startTime);

          if (!earliestStartTime || result.startTime < earliestStartTime) {
            earliestStartTime = result.startTime;
          }
          break;
        }
      }
    }

    // Update round.startTime to the earliest game time if earlier
    if (earliestStartTime && earliestStartTime < round.startTime) {
      console.log("[START TIME] Updating round " + round.numRound + " startTime from " + round.startTime + " to " + earliestStartTime);
      round.startTime = earliestStartTime;
      await round.save();
    }

    if (updatedCount > 0) {
      console.log("[START TIME] Updated " + updatedCount + " match start times for round " + round.numRound);
    }
  } catch (err) {
    console.log("[START TIME] Error updating match start times:", err);
  }
};

async function updateResults(matchUpdates) {
  try {
    await advanceWinners(matchUpdates);
    // Lock draft picks after winners are set but BEFORE scoring —
    // ensures locked predictions exist so branch1 won't create duplicate penalties
    await middlewareObj.lockDraftPicksForStartedGames();
    await scoreUserMatchPredictions(matchUpdates);
    await updateTournamentGroupScores(matchUpdates);
    await isRoundComplete(matchUpdates);
  } catch (err) {
    console.log(err);
  } finally {
    scrapeInProgress = false;
  }
}

// Req. Params:
// roundMatchIndex, tournamentId, currentRound, currentRoundId,
// nextRoundId, totalRounds, matchNumber, matchId, winningTeam
async function advanceWinners(matchUpdates) {
  var currentRound = matchUpdates[0].currentRound;
  var nextRoundId = matchUpdates[0].nextRoundId;

  // Fetch the next round's matches fresh (lightweight — just match docs, no team populates)
  // so we don't need to hold the entire populated tournament in memory
  var nextRound = null;
  if (currentRound < matchUpdates[0].totalRounds) {
    try {
      nextRound = await Round.findById(nextRoundId).populate("matches");
    } catch (err) {
      console.log("Error fetching next round:", err);
      return;
    }
  }

  for (var i = 0; i < matchUpdates.length; i++) {
    var matchUpdate = matchUpdates[i];
    var updatedMatch = await Match.findById(matchUpdate.matchId)
      .populate("topTeam")
      .populate("bottomTeam");

    if (!updatedMatch) {
      console.log("Match not found: " + matchUpdate.matchId);
      continue;
    }

    // Set winner and mark losing team
    updatedMatch.winner = matchUpdate.winningTeam;
    var losingTeam;
    if (matchUpdate.winningTeam._id.equals(updatedMatch.topTeam._id)) {
      losingTeam = updatedMatch.bottomTeam;
    } else {
      losingTeam = updatedMatch.topTeam;
    }
    losingTeam.lost++;

    // Save losingTeam, then match, then advance — all sequentially
    // Each save MUST complete before the next starts to avoid ParallelSaveError
    // (two R1 matches can feed the same R2 match)
    try {
      await losingTeam.save();
    } catch (err) {
      console.log("Error saving losing team:", err);
    }
    try {
      await updatedMatch.save();
    } catch (err) {
      console.log("Error saving match:", err);
    }

    // Advance winner to next round
    if (nextRound) {
      var currIndex = Number(matchUpdates[i].roundMatchIndex);
      var nextMatchIndex = Math.floor(currIndex / 2);
      var nextRoundMatch = nextRound.matches[nextMatchIndex];
      if (currIndex % 2 === 0) {
        nextRoundMatch.topTeam = matchUpdates[i].winningTeam;
      } else {
        nextRoundMatch.bottomTeam = matchUpdates[i].winningTeam;
      }
      // Must save the Match doc — Round only stores ObjectId refs
      try {
        await nextRoundMatch.save();
      } catch (err) {
        console.log("Error saving next round match:", err);
      }
    } else {
      // Championship game — update tournament champion without holding full doc
      try {
        await Tournament.findByIdAndUpdate(
          matchUpdates[0].tournamentId,
          { champion: matchUpdates[i].winningTeam._id }
        );
      } catch (err) {
        console.log("Error saving tournament champion:", err);
      }
    }
  }
}

// Req. Params:
// roundMatchIndex, tournamentId, currentRound, currentRoundId,
// nextRoundId, totalRounds, matchNumber, matchId, winningTeam
async function scoreUserMatchPredictions(updatedMatches) {
  for (var match of updatedMatches) {
    //find the match, get the seeds, calculate winning/losing score
    var foundMatch = await Match.findById(match.matchId)
      .populate("topTeam")
      .populate("bottomTeam");

    if (!foundMatch) continue;

    var winner = match.winningTeam;
    var winnerIsTop = winner.equals(foundMatch.topTeam._id);
    var matchScores = scoring.calculateMatchScores(
      foundMatch.topTeam.seed,
      foundMatch.bottomTeam.seed,
      winnerIsTop,
      match.currentRound,
    );
    var winningScore = matchScores.winningScore;
    var losingScore = matchScores.losingScore;

    //=============================================
    // a) Find all userMatchPredictions and update their score attribute
    // b) If UserMatchPrediction doesn't exist (i.e., they forgot to make picks), create the round and subtract the loser score
    //=============================================
    var foundUserMatchPredictions = await UserMatchPrediction.find({ "match.id": match.matchId });

    // Find all user tournaments who reference this tournament but do not have a userRound.userMatchPrediction.match.id matching this match.matchId
    // Parallel branch 1: handle missing picks
    var branch1 = async function () {
      // Map the docs into an array of just the _ids
      var userMPids = foundUserMatchPredictions.map(function (doc) {
        return doc._id;
      });
      //find the user rounds that reference user match prediction ids (and are in the current round to avoid bonus round picks interfering with rounds 4 and 6
      var foundUserRound = await UserRound.find({
        userMatchPredictions: { $in: userMPids },
        "round.numRound": match.currentRound,
      });

      var userRids = foundUserRound.map(function (doc) {
        return doc._id;
      });
      //find all tournaments that don't have a user round in the list of rounds that match the prediction
      //  a) these may not have the particular round at all (we need to create the round)
      //  b) they may have the round, but no pick (i.e., we created the round for them with no picks and just need to subtract the score)
      var foundUserTournaments = await UserTournament.find({
        "tournamentReference.id": updatedMatches[0].tournamentId,
        userRounds: { $nin: userRids },
      }).populate("userRounds");

      //found userTournaments holds all tournaments without a round, or a round with a reference to the updated match
      for (var foundUserTournament of foundUserTournaments) {
        //does this user tournament have the user round to reference?
        var foundRoundIdx = -1; //index
        for (
          var j = 0;
          j < foundUserTournament.userRounds.length;
          j++
        ) {
          if (
            foundUserTournament.userRounds[j].round.numRound ===
            Number(match.currentRound)
          ) {
            foundRoundIdx = j;
          }
        }

        // Create a "missed" prediction so the bracket can show it
        var missedPred = await UserMatchPrediction.create({
          score: losingScore,
          numRound: match.currentRound,
          winner: null,
          match: { id: match.matchId, matchNumber: match.matchNumber },
          comment: "",
          late: true,
        });

        //we've looped through, and a userRound referencing the current round does not exist...create the round
        if (foundRoundIdx === -1) {
          var newUserRound = {
            roundScore: losingScore,
            user: {
              id: foundUserTournament.user.id,
              name: foundUserTournament.user.firstName,
            },
            round: {
              id: match.currentRoundId,
              numRound: match.currentRound,
            },
            userMatchPredictions: [missedPred._id],
          };
          var createdUserRound = await UserRound.create(newUserRound);
          foundUserTournament.userRounds.push(createdUserRound);
        }
        //we found a userRound without a reference to the actual match
        else {
          foundUserTournament.userRounds[foundRoundIdx].roundScore += losingScore;
          foundUserTournament.userRounds[foundRoundIdx].userMatchPredictions.push(missedPred._id);
          await foundUserTournament.userRounds[foundRoundIdx].save();
        }

        await foundUserTournament.save();

        // Add to the aggregate's missedPickers so the group bracket shows it
        if (foundUserTournament.tournamentGroup && foundUserTournament.tournamentGroup.id) {
          var missedAgg = await UserMatchAggregate.findOne({
            matchReference: match.matchId,
            tournamentGroup: foundUserTournament.tournamentGroup.id,
          });
          if (missedAgg) {
            // Dedup: markMissedPickersForStartedGames may have already added this user
            // at tipoff. Only push if not already present.
            var alreadyMissed = missedAgg.missedPickers.some(function (mp) {
              return String(mp.id) === String(foundUserTournament.user.id);
            });
            if (!alreadyMissed) {
              missedAgg.missedPickers.push({
                id: foundUserTournament.user.id,
                firstName: foundUserTournament.user.firstName,
              });
              await missedAgg.save();
            }
          }
        }
      }
    };

    // Parallel branch 2: score existing predictions
    var branch2 = async function () {
      // Find which predictions belong to rejected UserRounds (should stay at 0)
      var predIds = foundUserMatchPredictions.map(function (p) { return p._id; });
      var rejectedPredIds = new Set();
      var parentRounds = await UserRound.find({
        userMatchPredictions: { $in: predIds },
        rejected: true,
      });
      for (var pr of parentRounds) {
        for (var pid of pr.userMatchPredictions) {
          rejectedPredIds.add(pid.toString());
        }
      }

      for (var prediction of foundUserMatchPredictions) {
        // Rejected predictions always stay at 0
        if (rejectedPredIds.has(prediction._id.toString())) {
          prediction.score = 0;
        // Late picks always get the loser score regardless of correctness
        } else if (prediction.late) {
          prediction.score = losingScore;
        } else if (prediction.numRound === 7) {
          prediction.score = prediction.winner.equals(winner._id) ? 5 : 0;
        } else if (prediction.numRound === 8) {
          prediction.score = prediction.winner.equals(winner._id) ? 10 : 0;
        } else {
          prediction.score = prediction.winner.equals(winner._id)
            ? winningScore
            : losingScore;
        }
        await prediction.save();
      }
    };

    await Promise.all([branch1(), branch2()]);
  }
}

// Req. Params:
// roundMatchIndex, tournamentId, currentRound, currentRoundId,
// nextRoundId, totalRounds, matchNumber, matchId, winningTeam
async function updateTournamentGroupScores(updatedMatches) {
  var foundTournamentGroups = await TournamentGroup.find({
    "tournamentReference.id": updatedMatches[0].tournamentId,
  }).populate({
    path: "userTournaments",
    populate: {
      path: "userRounds",
      populate: { path: "userMatchPredictions" },
    },
  });

  for (var group of foundTournamentGroups) {
    for (var userTournament of group.userTournaments) {
      userTournament.score = 0;
      for (var userRound of userTournament.userRounds) {
        //if rounds is the current round, or if the round matches a bonus round
        if (
          (userRound.round.numRound === group.currentRound &&
            userRound.userMatchPredictions.length > 0) ||
          (userRound.round.numRound === 7 &&
            group.currentRound === 4) ||
          (userRound.round.numRound === 8 &&
            group.currentRound === 6)
        ) {
          userRound.roundScore = 0;
          for (var userPrediction of userRound.userMatchPredictions) {
            if (userPrediction) {
              userRound.roundScore += userPrediction.score;
            }
          }
          await userRound.save();
        }

        userTournament.score += userRound.roundScore;
      }
      await userTournament.save();
    }
  }
}

// Req. Params:
// roundMatchIndex, tournamentId, currentRound, currentRoundId,
// nextRoundId, totalRounds, matchNumber, matchId, winningTeam
async function isRoundComplete(updatedMatches) {
  var foundTournament = await Tournament.findById(updatedMatches[0].tournamentId)
    .populate({ path: "rounds", populate: { path: "matches" } });

  if (!foundTournament) {
    console.log("Problems Finding Tournament");
    return;
  }

  var currRound = foundTournament.currentRound;
  var numUnfinished = 0;

  for (var match of foundTournament.rounds[currRound - 1].matches) {
    if (!match.winner) {
      numUnfinished++;
    }
  }

  if (numUnfinished === 0) {
    foundTournament.currentRound++;
    await foundTournament.save();

    //find all tournamentGroups, update their currentRounds, and send out email
    var foundTournamentGroup = await TournamentGroup.find({
      "tournamentReference.id": updatedMatches[0].tournamentId,
    })
      .populate({
        path: "userTournaments",
        populate: { path: "userRounds", populate: "round" },
      });

    if (!foundTournamentGroup) {
      console.log("No tournament groups found");
      return;
    }

    for (var group of foundTournamentGroup) {
      group.currentRound++;
      try {
        await group.save();
      } catch (err) {
        console.log("[ROUND] Error saving group round:", err);
      }
      emailHelper.sendRoundSummary(group);
    }

    // Check if tournament is complete (currentRound exceeded rounds array)
    if (foundTournament.currentRound > foundTournament.rounds.length) {
      console.log("[TOURNAMENT] Tournament " + foundTournament.year + " complete! Auto-awarding trophies...");
      try {
        await awardGroupTrophies(foundTournament.year);
      } catch (err) {
        console.log("[TROPHY] Error during auto-award:", err);
      }
    }
  }
}

//=========================================================================
// MIDDDLEWARE FOR:
//                 UPDATE - UserRound (userRounds.js route)
//                  router.put("/:numRound")
//  *1) checkTipoffTime
//  2) userRoundCreation
//  3) updateUserMatchAggregates
//=========================================================================
middlewareObj.checkTipoffTime = async function (req, res, next) {
  try {
    var foundUserTournament = await UserTournament.findOne({
      "user.username": req.params.username,
      "tournamentGroup.groupName": req.params.groupName,
    }).populate({ path: "tournamentReference.id", populate: "rounds" });

    if (!foundUserTournament) {
      req.flash("error", "User Tournament not found");
      return res.redirect("back");
    }

    res.locals.userFirstName = foundUserTournament.user.firstName;
    var numRound = Number(req.params.numRound);

    // Guard: prevent submission for rounds more than 1 ahead of tournament's current round
    var tournamentCurrentRound = foundUserTournament.tournamentReference.id.currentRound || 1;
    if (numRound < 7 && numRound > tournamentCurrentRound + 1 && !req.user.isAdmin) {
      req.flash("error", "That round isn't available for picks yet.");
      return res.redirect("/tournamentGroups/" + req.params.groupName);
    }

    // Rounds 7 (Final Four) and 8 (Championship) use Round 1's startTime
    var roundIndexForTipoff = numRound;
    if (roundIndexForTipoff === 7 || roundIndexForTipoff === 8) roundIndexForTipoff = 1;

    // Find the tournament round and populate matches (including winner for finished-game detection)
    var foundRound = await Round.findById(
      foundUserTournament.tournamentReference.id.rounds[roundIndexForTipoff - 1],
    ).populate({
      path: "matches",
      populate: [{ path: "topTeam" }, { path: "bottomTeam" }, { path: "winner" }],
    });

    if (!foundRound) {
      req.flash("error", "Round not found");
      return res.redirect("back");
    }

    // Admin always passes through
    if (req.user.isAdmin) {
      res.locals.matchTipoffStatus = {};
      return next();
    }

    // For rounds 7/8 (bonus picks), allow late submission with pending approval
    if (numRound === 7 || numRound === 8) {
      if (moment().isBefore(moment(foundRound.startTime))) {
        res.locals.matchTipoffStatus = {};
        res.locals.bonusPicksAreLate = false;
        return next();
      } else {
        // After tipoff: allow submission but flag as late (will require commissioner approval)
        res.locals.matchTipoffStatus = {};
        res.locals.bonusPicksAreLate = true;
        return next();
      }
    }

    // Per-game tipoff logic: build status map using pure helper
    var matchTipoffStatus = tipoff.getMatchTipoffStatus(foundRound.matches, Date.now());

    // If ALL games have started, reject entirely
    if (tipoff.isAllStarted(matchTipoffStatus)) {
      req.flash("error", "Too late! All games in the round have already started.");
      return res.redirect("/tournamentGroups/" + req.params.groupName);
    }

    // Otherwise, pass through — userRoundCreation will handle per-game logic
    res.locals.matchTipoffStatus = matchTipoffStatus;
    next();
  } catch (err) {
    console.log(err);
    req.flash("error", "User Tournament not found");
    res.redirect("back");
  }
};

//=========================================================================
// MIDDDLEWARE FOR:
//                 UPDATE - UserRound (userRounds.js route)
//                  router.put("/:numRound")
//  1) checkTipoffTime
//  *2) userRoundCreation
//  3) updateUserMatchAggregates
//=========================================================================
//req.body[matchNum][0] -> winningTeamId
//req.body[matchNum][1] -> comments
//req.params
//      groupName -> March Madness 2012
//      id -> 5a8b0a650e17ab1749702c4b
//      numRound -> 1
middlewareObj.userRoundCreation = async function (req, res, next) {
  try {
    //find the correct userTournament
    var foundUserTournament = await UserTournament.findOne({
      "user.username": req.params.username,
      "tournamentGroup.groupName": req.params.groupName,
    }).populate({ path: "tournamentReference.id", populate: "rounds" });

    if (!foundUserTournament) {
      req.flash("error", "User Tournament not found");
      return res.redirect("back");
    }

    res.locals.userFirstName = foundUserTournament.user.firstName;
    res.locals.targetUserId = foundUserTournament.user.id;
    var numRound = Number(req.params.numRound);
    var actualRoundIndex = tipoff.getActualRoundIndex(numRound);

    // Clean up any existing UserRound for this numRound (handles pick edits)
    var oldUserRoundIds = [];
    var oldPredictionIds = [];

    var oldUserRounds = await UserRound.find({
      _id: { $in: foundUserTournament.userRounds },
      $or: [
        { "round.numRound": req.params.numRound },
        { "round.numRound": Number(req.params.numRound) },
      ],
    });

    // Track locked predictions (from draft auto-lock) to preserve during cleanup
    var lockedPredictionIds = new Set();
    var lockedMatchNums = new Set();

    if (oldUserRounds && oldUserRounds.length > 0) {
      // Batch-load all predictions and their matches to detect locked picks
      var allOldPredIds = [];
      for (var oldUR of oldUserRounds) {
        if (oldUR.userMatchPredictions) {
          for (var pid of oldUR.userMatchPredictions) { allOldPredIds.push(pid); }
        }
      }
      var allOldPreds = await UserMatchPrediction.find({ _id: { $in: allOldPredIds } });
      var matchIdsToCheck = allOldPreds.map(function (p) { return p.match.id; }).filter(Boolean);
      var matchDocs = await Match.find({ _id: { $in: matchIdsToCheck } });
      var matchDocMap = {};
      for (var md of matchDocs) { matchDocMap[md._id.toString()] = md; }

      var nowMs = Date.now();
      for (var pred of allOldPreds) {
        var matchDoc = pred.match.id ? matchDocMap[pred.match.id.toString()] : null;
        if (matchDoc) {
          var gameStarted = matchDoc.startTime && nowMs > new Date(matchDoc.startTime).getTime();
          var gameFinished = !!matchDoc.winner;
          if (gameStarted || gameFinished) {
            lockedPredictionIds.add(pred._id.toString());
            lockedMatchNums.add(pred.match.matchNumber);
          }
        }
      }

      // Collect IDs to delete (excluding locked predictions)
      oldUserRounds.forEach(function (oldUR) {
        oldUserRoundIds.push(oldUR._id);
        oldUR.userMatchPredictions.forEach(function (pId) {
          if (!lockedPredictionIds.has(pId.toString())) {
            oldPredictionIds.push(pId);
          }
        });
      });

      // Remove old UserRound refs from the UserTournament
      oldUserRoundIds.forEach(function (oldId) {
        foundUserTournament.userRounds.pull(oldId);
      });

      // Delete non-locked UserMatchPredictions and old UserRounds
      console.log("[EDIT CLEANUP] Removing " + oldUserRoundIds.length + " old UserRound(s) for round " + req.params.numRound + " (preserving " + lockedPredictionIds.size + " locked prediction(s))");
      await Promise.all([
        oldPredictionIds.length > 0 ? UserMatchPrediction.deleteMany({ _id: { $in: oldPredictionIds } }).catch(function (err) {
          console.log("[EDIT CLEANUP] Error deleting old predictions:", err);
        }) : Promise.resolve(),
        UserRound.deleteMany({ _id: { $in: oldUserRoundIds } }).catch(function (err) {
          console.log("[EDIT CLEANUP] Error deleting old user rounds:", err);
        }),
      ]);
    }

    // createNewUserRound logic (inlined)
    //find the tournament round associated with this userRound
    var foundRound = await Round.findById(
      foundUserTournament.tournamentReference.id.rounds[actualRoundIndex - 1],
    )
      .populate({
        path: "matches",
        populate: [
          { path: "topTeam" },
          { path: "bottomTeam" },
          { path: "winner" },
        ],
      });

    if (!foundRound) {
      console.log("Round not found");
      return res.redirect("back");
    }

    var isBonusLate = res.locals.bonusPicksAreLate && (numRound === 7 || numRound === 8);

    var newUserRound = {
      roundScore: 0,
      possiblePointsRemaining: 0,
      pendingApproval: isBonusLate,
      pendingApprovalAt: isBonusLate ? new Date() : null,
      round: {
        id: foundRound.id,
        numRound: req.params.numRound,
      },
      userMatchPredictions: [],
    };
    var createdUserRound = await UserRound.create(newUserRound);

    //============================================================================================
    // userRound Created -> now fill with the userMatchPredictions
    //============================================================================================

    // Load draft picks for this user/group/round (used for started games)
    var matchTipoffStatus = res.locals.matchTipoffStatus || {};
    var draftPick = await DraftPick.findOne({
      user: foundUserTournament.user.id,
      tournamentGroup: foundUserTournament.tournamentGroup.id,
      numRound: Number(req.params.numRound),
    });
    var draftPickMap = {};
    if (draftPick) {
      for (var dp of draftPick.picks) {
        draftPickMap[dp.matchNumber] = dp;
      }
    }

    // Block submission if not all matchups are known (early next-round access)
    // Skip this check for bonus rounds (7/8) — they pick from R1 teams, not match slots
    if (numRound < 7) {
      var hasAnyTBD = false;
      for (var m of foundRound.matches) {
        if (!m.topTeam || !m.bottomTeam) { hasAnyTBD = true; break; }
      }
      if (hasAnyTBD && !req.user.isAdmin) {
        req.flash("error", "Cannot submit picks until all matchups are known. Save a draft instead.");
        return res.redirect("back");
      }
    }

    var cumulativeScore = 0;
    var predictionsToInsert = [];
    var latePickCount = 0;

    // Re-add locked predictions to the new UserRound and account for their scores
    var lockedPreds = await UserMatchPrediction.find({ _id: { $in: Array.from(lockedPredictionIds) } });
    for (var lp of lockedPreds) {
      createdUserRound.userMatchPredictions.addToSet(lp);
      cumulativeScore += lp.score || 0;
    }

    for (var match of foundRound.matches) {
      // Skip matches with locked predictions (already preserved)
      if (lockedMatchNums.has(match.matchNumber)) continue;

      var gameStatus = matchTipoffStatus[match.matchNumber];
      var gameStarted = gameStatus && gameStatus.started && !req.user.isAdmin;

      // Build submitted pick and draft pick objects for the pure resolver
      var submittedPick = null;
      if (req.body[match.matchNumber]) {
        submittedPick = {
          winner: req.body[match.matchNumber][0],
          comment: req.body[match.matchNumber][1] || "",
        };
      }
      var draftEntry = draftPickMap[match.matchNumber] || null;

      // Use pure helper to resolve which pick to use
      var resolved = tipoff.resolvePickForMatch(gameStarted, submittedPick, draftEntry);
      var winner = resolved.winner;
      var comment = resolved.comment;
      var isLate = resolved.isLate;
      if (isLate) latePickCount++;

      // Pre-score predictions for already-finished games
      // (the scraper won't re-run for these)
      var predictionScore = 0;
      if (match.winner && match.topTeam && match.bottomTeam) {
        var winnerIsTop = match.winner._id.equals(match.topTeam._id);
        var matchScores = scoring.calculateMatchScores(
          match.topTeam.seed,
          match.bottomTeam.seed,
          winnerIsTop,
          numRound,
        );
        if (isLate) {
          // Late picks always get the loser score
          predictionScore = matchScores.losingScore;
        } else if (winner && winner.toString() === match.winner._id.toString()) {
          predictionScore = matchScores.winningScore;
        } else {
          predictionScore = matchScores.losingScore;
        }
      }
      cumulativeScore += predictionScore;

      predictionsToInsert.push({
        score: predictionScore,
        numRound: createdUserRound.round.numRound,
        winner: winner,
        match: {
          id: match.id,
          matchNumber: match.matchNumber,
        },
        comment: comment,
        late: isLate,
      });
    }
    // Batch insert all predictions in one DB call instead of 32 sequential creates
    var createdPredictions = await UserMatchPrediction.insertMany(predictionsToInsert);
    for (var pred of createdPredictions) {
      createdUserRound.userMatchPredictions.addToSet(pred);
    }

    res.locals.newUserRound = createdUserRound;
    createdUserRound.roundScore = cumulativeScore;
    foundUserTournament.userRounds.push(createdUserRound);

    // Save both in parallel, then recalculate total score
    await Promise.all([createdUserRound.save(), foundUserTournament.save()]);
    await recalculateUserTournamentScore(foundUserTournament._id);

    // Delete the draft now that picks have been submitted
    if (draftPick) {
      await DraftPick.deleteOne({ _id: draftPick._id });
    }
    // Also clean up any draft the current user (e.g., admin) might have for this round/group
    // (handles the case where an admin auto-saved while on another user's edit page)
    if (req.user._id.toString() !== foundUserTournament.user.id.toString()) {
      await DraftPick.deleteOne({
        user: req.user._id,
        tournamentGroup: foundUserTournament.tournamentGroup.id,
        numRound: Number(req.params.numRound),
      });
    }

    // Flash a message if some picks were late
    if (latePickCount > 0) {
      req.flash("warning", latePickCount + " pick(s) were submitted after the game started and will be scored as a loss.");
    }

    next();
  } catch (err) {
    console.log(err);
    req.flash("error", "User Tournament not found");
    res.redirect("back");
  }
};

//=========================================================================
// MIDDDLEWARE FOR:
//                 UPDATE - UserRound (userRounds.js route)
//                  router.put("/:numRound")
//  1) checkTipoffTime
//  2) userRoundCreation
//  *3) updateUserMatchAggregates
//=========================================================================
//req.body[matchNum][0] -> winningTeamId
//req.body[matchNum][1] -> comments
//req.params
//      groupName -> March Madness 2012
//      id -> 5a8b0a650e17ab1749702c4b
//      numRound -> 1
//res.locals.newUserRound.userMatchPrediction
//      score: 0,
//      numRound: newUserRound.round.numRound,
//      winner: winner, (type: team)...(req.body[match.matchNumber][0])
//      match: {
//          id: match.id,
//          matchNumber: match.matchNumber
//      },
//      comment: comment    (req.body[match.matchNumber][1])

middlewareObj.updateUserMatchAggregates = async function (req, res, next) {
  try {
    // Skip aggregates for pending-approval bonus picks (they shouldn't be visible until approved)
    if (res.locals.bonusPicksAreLate) {
      return next();
    }

    var foundTournamentGroup = await TournamentGroup.findOne({ groupName: req.params.groupName });
    if (!foundTournamentGroup) {
      console.log("Tournament group not found");
      return next();
    }

    // Clean up stale picker entries before adding new ones (handles pick edits)
    // Use targetUserId (the user whose picks are being created/edited), NOT currentUser
    // (currentUser could be an admin editing on behalf of someone else)
    var userId = res.locals.targetUserId || res.locals.currentUser._id;
    var groupId = foundTournamentGroup.id;

    // Determine which matches are being updated, then remove user from those aggregates first
    var matchIds = res.locals.newUserRound.userMatchPredictions.map(function (p) {
      return p.match.id;
    });

    if (req.params.numRound < 7) {
      // Regular rounds: remove user from topTeamPickers and bottomTeamPickers
      try {
        await UserMatchAggregate.updateMany(
          { tournamentGroup: groupId, matchReference: { $in: matchIds } },
          {
            $pull: {
              topTeamPickers: { id: userId },
              bottomTeamPickers: { id: userId },
              missedPickers: { id: userId },
            },
          }
        );
      } catch (err) {
        console.log("[AGG CLEANUP] Error cleaning regular aggregates:", err);
      }
    } else if (Number(req.params.numRound) === 7 || Number(req.params.numRound) === 8) {
      // Bonus rounds: remove user from all BonusAggregate teamPickers for this group's matches
      try {
        await BonusAggregate.updateMany(
          { tournamentGroup: groupId, matchReference: { $in: matchIds } },
          {
            $pull: {
              teamPickers: { id: userId },
            },
          }
        );
      } catch (err) {
        console.log("[AGG CLEANUP] Error cleaning bonus aggregates:", err);
      }
    }

    // Pre-fetch all matches in one query instead of N sequential lookups
    var allMatchIds = res.locals.newUserRound.userMatchPredictions.map(function (p) { return p.match.id; });
    var allMatches = await Match.find({ _id: { $in: allMatchIds } })
      .populate("topTeam")
      .populate("bottomTeam");
    var matchMap = {};
    allMatches.forEach(function (m) { matchMap[String(m._id)] = m; });

    // Pre-fetch all existing aggregates for this group in one query (for regular rounds)
    var aggMap = {};
    if (req.params.numRound < 7) {
      var existingAggs = await UserMatchAggregate.find({
        tournamentGroup: foundTournamentGroup.id,
        matchReference: { $in: allMatchIds },
      });
      existingAggs.forEach(function (a) { aggMap[String(a.matchReference)] = a; });
    }

    // cleanupThenProcess logic (inlined)
    var aggsToSave = [];
    for (var userPrediction of res.locals.newUserRound.userMatchPredictions) {
      var userPredictionMatch = matchMap[String(userPrediction.match.id)];

      if (!userPredictionMatch) continue;

      //Find or create a userMatchAggregate whose matchReference is the same as this userMatchPrediction's matchReference
      if (req.params.numRound < 7) {
        var foundUserMatchAggregate = aggMap[String(userPrediction.match.id)];

        // if none exist, create a userMatchAggregate for the userMatchPrediction:
        if (!foundUserMatchAggregate) {
          var aggScores = scoring.calculateAggregateScores(
            userPredictionMatch.topTeam.seed,
            userPredictionMatch.bottomTeam.seed,
            req.params.numRound,
          );

          var newUserMatchAggregate = {
            matchNumber: userPredictionMatch.matchNumber,
            matchReference: userPredictionMatch.id,
            tournamentGroup: foundTournamentGroup.id,
            topTeamPickers: [],
            topWinScore: aggScores.topWinScore,
            topLossScore: aggScores.topLossScore,
            bottomTeamPickers: [],
            bottomWinScore: aggScores.bottomWinScore,
            bottomLossScore: aggScores.bottomLossScore,
          };
          foundUserMatchAggregate = await UserMatchAggregate.create(newUserMatchAggregate);
          foundTournamentGroup.userMatchAggregates.push(foundUserMatchAggregate);
          aggMap[String(userPrediction.match.id)] = foundUserMatchAggregate;
        }

        var packedPrediction = {
          id: userId,
          firstName: res.locals.userFirstName,
          comment: userPrediction.comment,
        };

        // Missed picks (winner: null) go to missedPickers, not a team
        if (!userPrediction.winner) {
          foundUserMatchAggregate.missedPickers.push(packedPrediction);
        } else if (
          String(userPrediction.winner) ===
          userPredictionMatch.topTeam.id
        ) {
          foundUserMatchAggregate.topTeamPickers.push(packedPrediction);
        } else {
          foundUserMatchAggregate.bottomTeamPickers.push(packedPrediction);
        }

        if (aggsToSave.indexOf(foundUserMatchAggregate) === -1) {
          aggsToSave.push(foundUserMatchAggregate);
        }
      }
      // Find or create a final four bonusAggregate whose matchReference is the same as this userMatchPrediction's matchReference
      else if (
        Number(req.params.numRound) === 7 ||
        Number(req.params.numRound) === 8
      ) {
        var foundTeam = await Team.findById(userPrediction.winner);
        if (!foundTeam) continue;

        var foundBonusAggregate = await BonusAggregate.findOne({
          "team.id": foundTeam.id,
          matchReference: userPrediction.match.id,
          tournamentGroup: foundTournamentGroup.id,
        });

        // if none exist, create a foundBonusAggregate for the userMatchPrediction:
        if (!foundBonusAggregate) {
          var team = {
            id: foundTeam.id,
            name: foundTeam.name,
            image: foundTeam.image,
          };

          var newBonusAggregate = {
            matchNumber: userPredictionMatch.matchNumber,
            matchReference: userPredictionMatch.id,
            tournamentGroup: foundTournamentGroup.id,
            team: team,
            teamPickers: [],
          };
          foundBonusAggregate = await BonusAggregate.create(newBonusAggregate);
          foundTournamentGroup.bonusAggregates.push(foundBonusAggregate);
        }

        //  Assign name and comments to teamPickers array
        var packedPrediction = {
          id: userId,
          firstName: res.locals.userFirstName,
          comment: userPrediction.comment,
        };
        foundBonusAggregate.teamPickers.push(packedPrediction);

        await foundBonusAggregate.save();
      }
    }

    // Save all modified aggregates and the tournament group in parallel
    var savePromises = aggsToSave.map(function (agg) { return agg.save(); });
    savePromises.push(foundTournamentGroup.save());
    await Promise.all(savePromises);
    next();
  } catch (err) {
    console.log(err);
    next();
  }
};

// ─── Admin Guard ──────────────────────────────────────────────────────────────
// Reusable middleware: requires authenticated user with isAdmin flag.

middlewareObj.isAdmin = function (req, res, next) {
  if (req.isAuthenticated() && req.user.isAdmin) {
    return next();
  }
  req.flash("error", "You don't have permission to do that.");
  res.redirect("/");
};

// ─── Pick Visibility Helper ──────────────────────────────────────────────────
// Checks whether a user should be blocked from seeing others' picks.
// Returns { shouldHide: bool }
// shouldHide = true when the user hasn't made their picks AND tipoff hasn't passed.

middlewareObj.checkUserPickStatus = async function (userId, groupName) {
  try {
    var group = await TournamentGroup.findOne({ groupName: groupName })
      .populate({ path: "tournamentReference.id", populate: "rounds" });

    if (!group) return { shouldHide: false, visibleThroughRound: 99 }; // fail open

    var currentRound = group.currentRound;
    var tournament = group.tournamentReference.id;

    // Find the user's UserTournament in this group
    var userTournament = await UserTournament.findOne({
      "user.id": userId,
      "tournamentGroup.groupName": groupName,
    }).populate({ path: "userRounds", populate: "round.id" });

    if (!userTournament) {
      return { shouldHide: false, visibleThroughRound: tipoff.getVisibleThroughRound(currentRound, false, false) };
    }

    var userRoundNums = userTournament.userRounds.map(function (ur) { return ur.round.numRound; });

    // Count predictions for the current round to detect partial submissions (from draft auto-lock)
    var currentRoundPredCount = 0;
    for (var j = 0; j < userTournament.userRounds.length; j++) {
      if (userTournament.userRounds[j].round.numRound === currentRound) {
        currentRoundPredCount = userTournament.userRounds[j].userMatchPredictions
          ? userTournament.userRounds[j].userMatchPredictions.length : 0;
        break;
      }
    }

    // Get total match count for the current round
    var currentRoundMatchCount = 0;
    if (tournament && tournament.rounds && tournament.rounds[currentRound - 1]) {
      var roundDoc = await Round.findById(tournament.rounds[currentRound - 1]);
      if (roundDoc) {
        currentRoundMatchCount = roundDoc.matches ? roundDoc.matches.length : 0;
      }
    }

    var hasPicks = tipoff.hasCompletePicks(currentRound, userRoundNums, currentRoundPredCount, currentRoundMatchCount);

    return {
      shouldHide: false,
      visibleThroughRound: tipoff.getVisibleThroughRound(currentRound, true, hasPicks),
    };
  } catch (err) {
    return { shouldHide: false, visibleThroughRound: 99 }; // fail open
  }
};

// ─── Award Per-Group Trophies ────────────────────────────────────────────────
// Creates one trophy per user per group they belong to, ranked within each group.
// Idempotent: deletes all trophies for the year before re-creating.
// Called automatically when tournament ends (isRoundComplete) and manually via admin finalize.
// Guarded against concurrent execution (e.g., auto-trigger + admin click at the same time).

var _awardingInProgress = {};

var awardGroupTrophies = async function (year) {
  if (_awardingInProgress[year]) {
    console.log("[TROPHY] Award already in progress for " + year + ", skipping duplicate call.");
    return 0;
  }
  _awardingInProgress[year] = true;

  try {
    console.log("[TROPHY] Starting per-group trophy award for " + year);

    var allGroups = await TournamentGroup.find({ year: year })
      .populate({
        path: "userTournaments",
        populate: [
          { path: "user.id" },
          { path: "userRounds" },
        ],
      });

    if (!allGroups || allGroups.length === 0) {
      console.log("[TROPHY] No groups found for " + year);
      return 0;
    }

    // Step A: Delete existing trophies for this year (idempotent re-run)
    var oldTrophies = await Trophy.find({ year: year });
    var oldTrophyIds = (oldTrophies || []).map(function (t) { return t._id; });

    if (oldTrophyIds.length > 0) {
      try {
        await User.updateMany(
          { trophies: { $in: oldTrophyIds } },
          { $pull: { trophies: { $in: oldTrophyIds } } }
        );
      } catch (err) {
        console.log("[TROPHY] Error removing old trophy refs:", err);
      }
      try {
        await Trophy.deleteMany({ year: year });
      } catch (err) {
        console.log("[TROPHY] Error deleting old trophies:", err);
      }
    }

    // Step B: For each group, calculate standings and create trophies
    var totalCreated = 0;

    for (var group of allGroups) {
      if (!group.userTournaments || group.userTournaments.length === 0) {
        continue;
      }

      // Sort by score descending
      var participants = group.userTournaments.slice().sort(function (a, b) {
        return b.score - a.score;
      });

      var totalPlayers = participants.length;

      // Determine max rounds for madeAllPicks calculation
      var maxRounds = 0;
      participants.forEach(function (ut) {
        var roundCount = ut.userRounds ? ut.userRounds.length : 0;
        if (roundCount > maxRounds) maxRounds = roundCount;
      });

      for (var ut of participants) {
        // Calculate rank (1-based, ties share same rank)
        var score = Math.round(ut.score * 1000) / 1000;
        var rank = 1;
        participants.forEach(function (other) {
          if (Math.round(other.score * 1000) / 1000 > score) rank++;
        });

        var roundCount = ut.userRounds ? ut.userRounds.length : 0;

        // ut.user.id is populated to the full User document
        var popUserId = ut.user.id._id || ut.user.id;
        var user = await User.findById(popUserId);
        if (!user) {
          console.log("[TROPHY] No user found for " + (ut.user.firstName || "unknown"));
          continue;
        }

        var trophy = await Trophy.create({
          year: year,
          userRank: rank,
          totalPlayers: totalPlayers,
          score: score,
          madeAllPicks: roundCount >= maxRounds,
          groupId: group._id,
          groupName: group.groupName,
        });

        user.trophies.addToSet(trophy._id);
        try {
          await user.save();
        } catch (err) {
          console.log("[TROPHY] Error saving user trophy:", err);
        }
        totalCreated++;
      }

      console.log("[TROPHY] Completed group: " + group.groupName + " (" + totalPlayers + " players)");
    }

    console.log("[TROPHY] Finished! Created " + totalCreated + " trophies across " + allGroups.length + " groups for " + year);
    return totalCreated;
  } finally {
    _awardingInProgress[year] = false;
  }
};

middlewareObj.awardGroupTrophies = awardGroupTrophies;

// ─── Lock Draft Picks for Started Games ──────────────────────────────────
// Called during each scrape cycle. For each draft pick where the game has
// started, converts it to a real UserMatchPrediction (not marked late).
// Also updates UserMatchAggregates so the pick appears on the group bracket.
middlewareObj.lockDraftPicksForStartedGames = async function () {
  try {
    var drafts = await DraftPick.find({ autoSubmitted: false });
    if (drafts.length === 0) {
      await markMissedPickersForStartedGames();
      return;
    }

    var now = Date.now();
    var lockedTotal = 0;

    for (var draft of drafts) {
      try {
        // Find the user's tournament entry
        var userTournament = await UserTournament.findOne({
          "user.id": draft.user,
          "tournamentGroup.id": draft.tournamentGroup,
        })
          .populate("userRounds")
          .populate({ path: "tournamentReference.id", populate: "rounds" });

        if (!userTournament) continue;

        var tournament = userTournament.tournamentReference.id;
        var actualRoundIndex = tipoff.getActualRoundIndex(draft.numRound);

        if (!tournament.rounds[actualRoundIndex - 1]) continue;

        var foundRound = await Round.findById(tournament.rounds[actualRoundIndex - 1])
          .populate({ path: "matches", populate: [{ path: "topTeam" }, { path: "bottomTeam" }, { path: "winner" }] });

        if (!foundRound) continue;

        // Find or create the UserRound for this user/round
        var existingUserRound = null;
        for (var ur of userTournament.userRounds) {
          if (ur.round && ur.round.numRound === draft.numRound) {
            existingUserRound = await UserRound.findById(ur._id).populate("userMatchPredictions");
            break;
          }
        }

        // Build a set of matches that already have predictions
        var existingPredMatchNums = new Set();
        if (existingUserRound) {
          for (var ep of existingUserRound.userMatchPredictions) {
            existingPredMatchNums.add(ep.match.matchNumber);
          }
        }

        // Check each draft pick to see if the game has started
        var picksToLock = [];
        var remainingPicks = [];

        for (var dp of draft.picks) {
          if (existingPredMatchNums.has(dp.matchNumber)) {
            // Already has a prediction — skip
            continue;
          }

          // Find the match
          var match = null;
          for (var m of foundRound.matches) {
            if (m.matchNumber === dp.matchNumber) { match = m; break; }
          }

          if (!match || !match.topTeam || !match.bottomTeam) {
            remainingPicks.push(dp);
            continue;
          }

          var gameStarted = match.startTime && now > new Date(match.startTime).getTime();
          var gameFinished = !!match.winner;

          if (gameStarted || gameFinished) {
            picksToLock.push({ draftPick: dp, match: match });
          } else {
            remainingPicks.push(dp);
          }
        }

        if (picksToLock.length === 0) continue;

        // Create the UserRound if it doesn't exist
        if (!existingUserRound) {
          existingUserRound = await UserRound.create({
            roundScore: 0,
            possiblePointsRemaining: 0,
            round: { id: foundRound.id, numRound: draft.numRound },
            user: { id: draft.user },
            userMatchPredictions: [],
          });
          userTournament.userRounds.push(existingUserRound);
          await userTournament.save();
        }

        // Batch-create predictions for locked picks
        var cumulativeScore = 0;
        var predsToInsert = [];
        for (var lock of picksToLock) {
          var predictionScore = 0;
          if (lock.match.winner && lock.match.topTeam && lock.match.bottomTeam) {
            var winnerIsTop = lock.match.winner._id.equals(lock.match.topTeam._id);
            var matchScores = scoring.calculateMatchScores(
              lock.match.topTeam.seed, lock.match.bottomTeam.seed, winnerIsTop, draft.numRound);
            if (lock.draftPick.winner && lock.draftPick.winner.toString() === lock.match.winner._id.toString()) {
              predictionScore = matchScores.winningScore;
            } else {
              predictionScore = matchScores.losingScore;
            }
          }
          cumulativeScore += predictionScore;
          predsToInsert.push({
            score: predictionScore,
            numRound: draft.numRound,
            winner: lock.draftPick.winner,
            match: { id: lock.match.id, matchNumber: lock.match.matchNumber },
            comment: lock.draftPick.comment || "",
            late: false,
          });
        }

        var createdPreds = await UserMatchPrediction.insertMany(predsToInsert);
        for (var cp of createdPreds) {
          existingUserRound.userMatchPredictions.addToSet(cp._id);
        }

        // Batch-update aggregates: load group + user once, then process all picks
        var foundGroup = await TournamentGroup.findById(draft.tournamentGroup);
        var foundUser = await User.findById(draft.user);
        if (foundGroup && foundUser) {
          var lockMatchIds = picksToLock.map(function (l) { return l.match._id; });
          var existingAggs = await UserMatchAggregate.find({
            tournamentGroup: draft.tournamentGroup,
            matchReference: { $in: lockMatchIds },
          });
          var aggMap = {};
          for (var ea of existingAggs) { aggMap[ea.matchReference.toString()] = ea; }

          var aggsToSave = [];
          for (var pi = 0; pi < picksToLock.length; pi++) {
            var lockItem = picksToLock[pi];
            var pred = createdPreds[pi];
            var agg = aggMap[lockItem.match._id.toString()];

            if (!agg) {
              var aggScores = scoring.calculateAggregateScores(
                lockItem.match.topTeam.seed, lockItem.match.bottomTeam.seed, draft.numRound);
              agg = await UserMatchAggregate.create({
                matchNumber: lockItem.match.matchNumber,
                matchReference: lockItem.match._id,
                tournamentGroup: draft.tournamentGroup,
                topTeamPickers: [],
                bottomTeamPickers: [],
                topWinScore: aggScores.topWinScore,
                topLossScore: aggScores.topLossScore,
                bottomWinScore: aggScores.bottomWinScore,
                bottomLossScore: aggScores.bottomLossScore,
              });
              foundGroup.userMatchAggregates.push(agg);
              aggMap[lockItem.match._id.toString()] = agg;
            }

            var pickerEntry = { id: draft.user, firstName: foundUser.firstName, comment: pred.comment || "" };
            if (lockItem.match.topTeam && pred.winner && pred.winner.equals(lockItem.match.topTeam._id)) {
              agg.topTeamPickers.push(pickerEntry);
            } else if (lockItem.match.bottomTeam && pred.winner && pred.winner.equals(lockItem.match.bottomTeam._id)) {
              agg.bottomTeamPickers.push(pickerEntry);
            }
            if (aggsToSave.indexOf(agg) === -1) aggsToSave.push(agg);
          }
          await Promise.all(aggsToSave.map(function (a) { return a.save(); }));
          await foundGroup.save();
        }

        existingUserRound.roundScore += cumulativeScore;
        await existingUserRound.save();
        await recalculateUserTournamentScore(userTournament._id);

        // Update the draft — remove locked picks, keep remaining
        if (remainingPicks.length === 0) {
          await DraftPick.deleteOne({ _id: draft._id });
        } else {
          draft.picks = remainingPicks;
          draft.updatedAt = new Date();
          await draft.save();
        }

        lockedTotal += picksToLock.length;
        console.log("[DRAFT LOCK] Locked " + picksToLock.length + " pick(s) for user " + draft.user + " round " + draft.numRound);
      } catch (innerErr) {
        console.log("[DRAFT LOCK] Error processing draft " + draft._id + ":", innerErr);
      }
    }

    if (lockedTotal > 0) {
      console.log("[DRAFT LOCK] Total locked: " + lockedTotal + " pick(s)");
    }

    // Second pass: mark users who missed started/finished games on group bracket aggregates.
    // This catches users with NO draft at all (the loop above only handles users WITH drafts).
    await markMissedPickersForStartedGames();
  } catch (err) {
    console.log("[DRAFT LOCK] Error:", err);
  }
};

// Find started/finished games where users have no prediction and add them to missedPickers
async function markMissedPickersForStartedGames() {
  try {
    var foundTournament = await Tournament.findOne({ year: new Date().getFullYear() });
    if (!foundTournament || foundTournament.currentRound > foundTournament.rounds.length) return;

    var currentRound = await Round.findById(foundTournament.rounds[foundTournament.currentRound - 1])
      .populate({ path: "matches", populate: [{ path: "topTeam" }, { path: "bottomTeam" }, { path: "winner" }] });
    if (!currentRound) return;

    var now = Date.now();
    var startedMatches = currentRound.matches.filter(function (m) {
      if (!m.topTeam || !m.bottomTeam) return false;
      if (m.winner) return true;
      if (m.startTime && now > new Date(m.startTime).getTime()) return true;
      return false;
    });
    console.log("[MISSED] Round " + foundTournament.currentRound + ": " + startedMatches.length + " started/finished match(es) out of " + currentRound.matches.length + " total");
    if (startedMatches.length === 0) return;

    // Find all groups for this tournament
    var groups = await TournamentGroup.find({ "tournamentReference.id": foundTournament._id })
      .populate({ path: "userTournaments", populate: { path: "userRounds", populate: "userMatchPredictions" } });

    for (var group of groups) {
      for (var sm of startedMatches) {
        var agg = await UserMatchAggregate.findOne({
          matchReference: sm._id,
          tournamentGroup: group._id,
        });
        if (!agg) {
          // Create the aggregate if it doesn't exist yet (for started games with no submissions)
          var aggScores = scoring.calculateAggregateScores(sm.topTeam.seed, sm.bottomTeam.seed, foundTournament.currentRound);
          agg = await UserMatchAggregate.create({
            matchNumber: sm.matchNumber,
            matchReference: sm._id,
            tournamentGroup: group._id,
            topTeamPickers: [],
            bottomTeamPickers: [],
            missedPickers: [],
            topWinScore: aggScores.topWinScore,
            topLossScore: aggScores.topLossScore,
            bottomWinScore: aggScores.bottomWinScore,
            bottomLossScore: aggScores.bottomLossScore,
          });
          group.userMatchAggregates.push(agg);
          await group.save();
        }

        // Self-heal: dedupe existing missedPickers in case a prior bug produced duplicates
        if (agg.missedPickers && agg.missedPickers.length > 0) {
          var seenMissed = new Set();
          var dedupedMissed = [];
          for (var existingMp of agg.missedPickers) {
            var mpKey = String(existingMp.id);
            if (!seenMissed.has(mpKey)) {
              seenMissed.add(mpKey);
              dedupedMissed.push(existingMp);
            }
          }
          if (dedupedMissed.length !== agg.missedPickers.length) {
            agg.missedPickers = dedupedMissed;
            await agg.save();
          }
        }

        // Build set of user IDs who already have a prediction or are already in missedPickers
        var coveredUsers = new Set();
        for (var tp of agg.topTeamPickers) { coveredUsers.add(tp.id.toString()); }
        for (var bp of agg.bottomTeamPickers) { coveredUsers.add(bp.id.toString()); }
        if (agg.missedPickers) {
          for (var mp of agg.missedPickers) { coveredUsers.add(mp.id.toString()); }
        }

        // Check each user in the group
        var needsSave = false;
        for (var ut of group.userTournaments) {
          var userId = ut.user.id.toString();
          if (coveredUsers.has(userId)) continue;

          // Check if user has a non-missed pick for this match in their UserRounds.
          // winner:null predictions represent missed picks and should be shown in missedPickers.
          var hasNonMissedPred = false;
          var hasMissedPred = false;
          for (var ur of ut.userRounds) {
            if (ur.round.numRound !== foundTournament.currentRound) continue;
            if (ur.userMatchPredictions) {
              for (var pred of ur.userMatchPredictions) {
                if (pred.match && pred.match.matchNumber === sm.matchNumber) {
                  if (pred.winner) {
                    hasNonMissedPred = true;
                  } else {
                    hasMissedPred = true;
                  }
                  break;
                }
              }
            }
            if (hasNonMissedPred || hasMissedPred) break;
          }

          if (!hasNonMissedPred) {
            agg.missedPickers.push({ id: ut.user.id, firstName: ut.user.firstName });
            coveredUsers.add(userId);
            needsSave = true;
          }
        }

        if (needsSave) await agg.save();
      }
    }
  } catch (err) {
    console.log("[MISSED] Error marking missed pickers:", err);
  }
}

// Helper: update UserMatchAggregate for a single locked pick
async function updateAggregateForPick(prediction, match, userId, tournamentGroupId) {
  try {
    var foundGroup = await TournamentGroup.findById(tournamentGroupId);
    if (!foundGroup) return;

    var foundUser = await User.findById(userId);
    if (!foundUser) return;

    // Find or create the aggregate
    var agg = await UserMatchAggregate.findOne({
      matchReference: match._id,
      tournamentGroup: tournamentGroupId,
    });

    if (!agg) {
      agg = await UserMatchAggregate.create({
        matchNumber: match.matchNumber,
        matchReference: match._id,
        tournamentGroup: tournamentGroupId,
        topTeamPickers: [],
        bottomTeamPickers: [],
      });
      foundGroup.userMatchAggregates.push(agg);
      await foundGroup.save();
    }

    var pickerEntry = {
      id: userId,
      firstName: foundUser.firstName,
      comment: prediction.comment || "",
    };

    // Add to appropriate team's pickers
    if (match.topTeam && prediction.winner && prediction.winner.equals(match.topTeam._id)) {
      agg.topTeamPickers.push(pickerEntry);
    } else if (match.bottomTeam && prediction.winner && prediction.winner.equals(match.bottomTeam._id)) {
      agg.bottomTeamPickers.push(pickerEntry);
    }
    await agg.save();
  } catch (err) {
    console.log("[DRAFT LOCK] Error updating aggregate:", err);
  }
}

// ─── Auto-Submit Draft Picks ──────────────────────────────────────────────
// Called by a scheduled job at each round's tipoff.
// Finds all unsubmitted drafts and auto-submits them as picks.
middlewareObj.autoSubmitDrafts = async function () {
  try {
    console.log("[AUTO-SUBMIT] Checking for drafts to auto-submit...");
    var drafts = await DraftPick.find({ autoSubmitted: false })
      .populate("user")
      .populate("tournamentGroup");

    if (drafts.length === 0) {
      console.log("[AUTO-SUBMIT] No drafts to auto-submit");
      return;
    }

    var submittedCount = 0;

    for (var draft of drafts) {
      try {
        // Find the user's tournament in this group
        var userTournament = await UserTournament.findOne({
          "user.id": draft.user._id,
          "tournamentGroup.id": draft.tournamentGroup._id,
        }).populate({ path: "tournamentReference.id", populate: "rounds" });

        if (!userTournament) continue;

        // Check if user already has picks for this round (manual submission won the race)
        var existingRound = await UserRound.findOne({
          _id: { $in: userTournament.userRounds },
          "round.numRound": draft.numRound,
        });

        if (existingRound) {
          // User already submitted — just delete the draft
          await DraftPick.deleteOne({ _id: draft._id });
          continue;
        }

        // Determine actual round index
        var actualRoundIndex = tipoff.getActualRoundIndex(draft.numRound);

        var foundRound = await Round.findById(
          userTournament.tournamentReference.id.rounds[actualRoundIndex - 1],
        ).populate({
          path: "matches",
          populate: [{ path: "topTeam" }, { path: "bottomTeam" }, { path: "winner" }],
        });

        if (!foundRound) continue;

        // Build picks map from draft
        var draftPickMap = {};
        for (var dp of draft.picks) {
          draftPickMap[dp.matchNumber] = dp;
        }

        // Create UserRound and predictions
        var newUserRound = {
          roundScore: 0,
          possiblePointsRemaining: 0,
          round: {
            id: foundRound.id,
            numRound: draft.numRound,
          },
          user: {
            id: draft.user._id,
            name: draft.user.firstName,
          },
          userMatchPredictions: [],
        };
        var createdUserRound = await UserRound.create(newUserRound);

        var cumulativeScore = 0;
        var predictionsToInsert = [];
        var now = moment();

        for (var match of foundRound.matches) {
          var winner = null;
          var comment = "";
          var isLate = false;
          var draftEntry = draftPickMap[match.matchNumber];

          // Check if game has started or finished
          var gameStarted = (match.startTime && now.isAfter(moment(match.startTime))) || !!match.winner;

          if (draftEntry && draftEntry.winner) {
            // User had a draft pick — use it (not late, since they saved it)
            winner = draftEntry.winner;
            comment = draftEntry.comment || "";
            isLate = false;
          } else if (gameStarted) {
            // No draft pick and game started — late
            isLate = true;
          }

          // Pre-score if game is already finished
          var predictionScore = 0;
          if (match.winner && match.topTeam && match.bottomTeam) {
            var winnerIsTop = match.winner._id.equals(match.topTeam._id);
            var matchScores = scoring.calculateMatchScores(
              match.topTeam.seed,
              match.bottomTeam.seed,
              winnerIsTop,
              draft.numRound,
            );
            if (isLate) {
              predictionScore = matchScores.losingScore;
            } else if (winner && winner.toString() === match.winner._id.toString()) {
              predictionScore = matchScores.winningScore;
            } else {
              predictionScore = matchScores.losingScore;
            }
          }
          cumulativeScore += predictionScore;

          predictionsToInsert.push({
            score: predictionScore,
            numRound: draft.numRound,
            winner: winner,
            match: { id: match.id, matchNumber: match.matchNumber },
            comment: comment,
            late: isLate,
          });
        }

        var createdPredictions = await UserMatchPrediction.insertMany(predictionsToInsert);
        for (var pred of createdPredictions) {
          createdUserRound.userMatchPredictions.addToSet(pred);
        }
        createdUserRound.roundScore = cumulativeScore;
        userTournament.userRounds.push(createdUserRound);

        await Promise.all([createdUserRound.save(), userTournament.save()]);
        await recalculateUserTournamentScore(userTournament._id);

        // Delete the draft now that it's been auto-submitted
        await DraftPick.deleteOne({ _id: draft._id });
        submittedCount++;
        console.log("[AUTO-SUBMIT] Auto-submitted draft for " + draft.user.username + " round " + draft.numRound);
      } catch (innerErr) {
        console.log("[AUTO-SUBMIT] Error processing draft " + draft._id + ":", innerErr);
      }
    }

    console.log("[AUTO-SUBMIT] Done. Auto-submitted " + submittedCount + " draft(s)");
  } catch (err) {
    console.log("[AUTO-SUBMIT] Error:", err);
  }
};

module.exports = middlewareObj;
