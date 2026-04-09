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
var Trophy = require("../models/trophy");
var User = require("../models/user");

var middlewareObj = {};

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

async function updateResults(matchUpdates) {
  try {
    await advanceWinners(matchUpdates);
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
        var foundRound = -1; //index
        for (
          var j = 0;
          j < foundUserTournament.userRounds.length;
          j++
        ) {
          if (
            foundUserTournament.userRounds[j].round.numRound ===
            Number(match.currentRound)
          ) {
            foundRound = j;
          }
        }

        //we've looped through, and a userRound referencing the current round does not exist...create the round
        if (foundRound === -1) {
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
          };
          var createdUserRound = await UserRound.create(newUserRound);
          foundUserTournament.userRounds.push(createdUserRound);
        }
        //we found a userRound without a reference to the actual match
        else {
          foundUserTournament.userRounds[foundRound].roundScore += losingScore;
          await foundUserTournament.userRounds[foundRound].save();
        }

        await foundUserTournament.save();
      }
    };

    // Parallel branch 2: score existing predictions
    var branch2 = async function () {
      for (var prediction of foundUserMatchPredictions) {
        if (prediction.numRound === 7) {
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
    if (numRound === 7 || numRound === 8) numRound = 1;
    //find the tournament round associated with this userRound
    var foundRound = await Round.findById(
      foundUserTournament.tournamentReference.id.rounds[numRound - 1],
    );

    if (!foundRound) {
      req.flash("error", "Round not found");
      return res.redirect("back");
    }

    if (moment().isBefore(moment(foundRound.startTime)) ||
      req.user.isAdmin) {
      next();
    } else {
      req.flash(
        "error",
        "Too late! Tipoff for the round has already started.",
      );
      res.redirect("/tournamentGroups/" + req.params.groupName);
    }
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
    var actualRoundIndex = numRound;
    if (actualRoundIndex === 7) {
      actualRoundIndex = 4;
    } else if (actualRoundIndex === 8) {
      actualRoundIndex = 6;
    }

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

    if (oldUserRounds && oldUserRounds.length > 0) {
      oldUserRounds.forEach(function (oldUR) {
        oldUserRoundIds.push(oldUR._id);
        oldUR.userMatchPredictions.forEach(function (pId) {
          oldPredictionIds.push(pId);
        });
      });

      // Remove old UserRound refs from the UserTournament
      oldUserRoundIds.forEach(function (oldId) {
        foundUserTournament.userRounds.pull(oldId);
      });

      // Delete old UserMatchPredictions and UserRounds in parallel
      console.log("[EDIT CLEANUP] Removing " + oldUserRoundIds.length + " old UserRound(s) for round " + req.params.numRound);
      await Promise.all([
        UserMatchPrediction.deleteMany({ _id: { $in: oldPredictionIds } }).catch(function (err) {
          console.log("[EDIT CLEANUP] Error deleting old predictions:", err);
        }),
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

    var newUserRound = {
      roundScore: 0,
      possiblePointsRemaining: 0,
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
    var cumulativeScore = 0;
    var predictionsToInsert = [];
    for (var match of foundRound.matches) {
      var winner;
      var comment;
      if (req.body[match.matchNumber]) {
        winner = req.body[match.matchNumber][0];
        comment = req.body[match.matchNumber][1];
      }

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
        if (winner && winner.toString() === match.winner._id.toString()) {
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

    // Save both in parallel, then re-fetch to recalculate total score
    await Promise.all([createdUserRound.save(), foundUserTournament.save()]);
    var refreshed = await UserTournament.findById(foundUserTournament._id)
      .populate("userRounds");

    if (refreshed) {
      refreshed.score = 0;
      refreshed.userRounds.forEach(function (ur) {
        refreshed.score += ur.roundScore;
      });
      await refreshed.save();
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

        // If userMatchPrediction picks the topTeam…assign name and comments to topTeamPickerArray
        // Otherwise assign name and comments to BottomPickerArray
        var packedPrediction = {
          id: userId,
          firstName: res.locals.userFirstName,
          comment: userPrediction.comment,
        };
        if (
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

    if (!group) return { shouldHide: false }; // fail open

    var currentRound = group.currentRound;
    var tournament = group.tournamentReference.id;

    // Find the round's startTime to check if tipoff has passed
    var roundForTipoff = null;
    if (tournament && tournament.rounds) {
      for (var i = 0; i < tournament.rounds.length; i++) {
        var r = tournament.rounds[i];
        var rNum = r.numRound || (i + 1);
        if (rNum === currentRound) {
          roundForTipoff = r;
          break;
        }
      }
    }

    // If tipoff has passed, no need to hide — picks are locked
    if (roundForTipoff && moment().isAfter(moment(roundForTipoff.startTime))) {
      return { shouldHide: false };
    }

    // Find the user's UserTournament in this group
    var userTournament = await UserTournament.findOne({
      "user.id": userId,
      "tournamentGroup.groupName": groupName,
    }).populate({ path: "userRounds", populate: "round.id" });

    // User isn't in the group at all — hide picks
    if (!userTournament) return { shouldHide: true };

    // Check if user has made picks for the current round
    var hasCurrentRoundPicks = false;
    for (var j = 0; j < userTournament.userRounds.length; j++) {
      if (userTournament.userRounds[j].round.numRound === currentRound) {
        hasCurrentRoundPicks = true;
        break;
      }
    }

    // Special case: Round 1 requires R1 + FF (R7) + Champ (R8) = 3 submissions
    if (currentRound === 1 && userTournament.userRounds.length < 3) {
      hasCurrentRoundPicks = false;
    }

    return { shouldHide: !hasCurrentRoundPicks };
  } catch (err) {
    return { shouldHide: false }; // fail open
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

module.exports = middlewareObj;
