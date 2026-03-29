//all the middleware goes here
var Comment = require("../models/comment");
var async = require("async");
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

middlewareObj.checkTournamentGroupOwnership = function (req, res, next) {
  if (req.isAuthenticated()) {
    TournamentGroup.findOne({ groupName: req.params.groupName }).exec(
      function (err, foundTournamentGroup) {
        if (err || !foundTournamentGroup) {
          req.flash("error", "Tournament Group not found");
          res.redirect("back");
        } else {
          //does user own the tournament group?
          if (foundTournamentGroup.commissioner.id.equals(req.user.id)) {
            next();
          } else {
            req.flash("error", "You don't have permission to do that");
            res.redirect("back");
          }
        }
      },
    );
  } else {
    req.flash("error", "You need to be logged in to do that");
    res.redirect("back");
  }
};

middlewareObj.isCommissionerOrAdmin = function (req, res, next) {
  if (req.isAuthenticated()) {
    if (req.user.isAdmin) {
      return next();
    }
    TournamentGroup.findOne({ groupName: req.params.groupName }).exec(
      function (err, foundTournamentGroup) {
        if (err || !foundTournamentGroup) {
          req.flash("error", "Tournament Group not found");
          return res.redirect("back");
        }
        if (foundTournamentGroup.commissioner.id.equals(req.user.id)) {
          return next();
        }
        req.flash("error", "You don't have permission to do that");
        res.redirect("back");
      }
    );
  } else {
    req.flash("error", "You need to be logged in to do that");
    res.redirect("/login");
  }
};

middlewareObj.checkUserTournamentOwnership = function (req, res, next) {
  if (req.isAuthenticated()) {
    UserTournament.findOne({
      "user.username": req.params.username,
      "tournamentGroup.groupName": req.params.groupName,
    }).exec(function (err, foundUserTournament) {
      if (err || !foundUserTournament) {
        req.flash("error", "User Tournament not found");
        res.redirect("back");
      } else {
        //does user own the User Tournament, or is the requester admin/commissioner?
        if (
          foundUserTournament.user.id.equals(req.user.id) ||
          req.user.isAdmin
        ) {
          req.targetUserFirstName = foundUserTournament.user.firstName;
          next();
        } else {
          // Check if current user is commissioner of this group
          TournamentGroup.findOne({ groupName: req.params.groupName }).exec(
            function (err, group) {
              if (!err && group && group.commissioner.id.equals(req.user.id)) {
                req.targetUserFirstName = foundUserTournament.user.firstName;
                return next();
              }
              req.flash("error", "You don't have permission to do that");
              res.redirect("back");
            }
          );
        }
      }
    });
  } else {
    req.flash("error", "You need to be logged in to do that");
    res.redirect("back");
  }
};

middlewareObj.checkCommentOwnership = function (req, res, next) {
  if (req.isAuthenticated()) {
    Comment.findById(req.params.comment_id, function (err, foundComment) {
      if (err || !foundComment) {
        req.flash("error", "Comment not found");
        res.redirect("back");
      } else {
        //does user own the comment?
        if (foundComment.author.id.equals(req.user.id)) {
          next();
        } else {
          req.flash("error", "You don't have permission to do that");
          res.redirect("back");
        }
      }
    });
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

middlewareObj.manuallyUpdateResults = function (req, res, next) {
  Tournament.findOne({ year: req.params.year })
    .populate({
      path: "rounds",
      populate: { path: "matches", populate: { path: "topTeam" } },
    })
    .populate({
      path: "rounds",
      populate: { path: "matches", populate: { path: "bottomTeam" } },
    })
    .exec(function (err, foundTournament) {
      if (err) {
        console.log(err);
        res.redirect("back");
      } else {
        var round = foundTournament.rounds[foundTournament.currentRound - 1];
        var roundFirstMatch = round.matches[0].matchNumber;

        var matchUpdates = [];

        var roundMatchIndex = 0;
        async.forEachSeries(
          round.matches,
          function (match, next) {
            var bodyIndex = roundFirstMatch + roundMatchIndex;

            if (req.body[bodyIndex]) {
              Team.findById(req.body[bodyIndex]).exec(function (err, winner) {
                if (err) console.log(err);
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
                roundMatchIndex++;
                next();
              });
            } else {
              roundMatchIndex++;
              next();
            }
          },
          function (err) {
            if (err) console.log(err);
            if (matchUpdates.length > 0) {
              updateResults(matchUpdates, next);
            }
          },
        );
      }
    });
};

var scrapeInProgress = false;

middlewareObj.scrapeUpdateResults = function (parsedResults) {
  if (scrapeInProgress) {
    console.log("[SCRAPE] Skipping — previous scrape still in progress");
    return;
  }
  scrapeInProgress = true;

  var matchUpdates = [];

  Tournament.findOne({ year: new Date().getFullYear() })
    .populate({
      path: "rounds",
      populate: { path: "matches", populate: { path: "topTeam" } },
    })
    .populate({
      path: "rounds",
      populate: { path: "matches", populate: { path: "bottomTeam" } },
    })
    .exec(function (err, foundTournament) {
      if (err) {
        console.log(err);
        scrapeInProgress = false;
        return;
      } else if (!foundTournament) {
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
      async.forEach(
        round.matches,
        function (match, next) {
          async.forEach(
            parsedResults,
            function (result, next) {
              // Skip matches where teams haven't been set yet (e.g. later rounds)
              if (!match.topTeam || !match.bottomTeam) return next();

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
                next();
              } else {
                next();
              }
            },
            function (err) {
              if (err) console.log(err);
              else {
                roundMatchIndex++;
                next();
              }
            },
          );
        },
        function (err) {
          if (err) console.log(err);
          logUnmatchedResults(parsedResults, round);
          if (matchUpdates.length > 0) {
            updateResults(matchUpdates);
          } else {
            scrapeInProgress = false;
          }
        },
      );
    });
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

var updateResults = function (matchUpdates, next) {
  async.series(
    [
      function (callback) {
        advanceWinners(matchUpdates, callback);
      },
      function (callback) {
        scoreUserMatchPredictions(matchUpdates, callback);
      },
      function (callback) {
        updateTournamentGroupScores(matchUpdates, callback);
      },
      function (callback) {
        isRoundComplete(matchUpdates, callback);
      },
    ],
    function (err) {
      if (err) console.log(err);
      scrapeInProgress = false;
      try {
        next();
      } catch (err) {}
    },
  );
};

// Req. Params:
// roundMatchIndex, tournamentId, currentRound, currentRoundId,
// nextRoundId, totalRounds, matchNumber, matchId, winningTeam
var advanceWinners = function (matchUpdates, done) {
  var currentRound = matchUpdates[0].currentRound;
  var nextRoundId = matchUpdates[0].nextRoundId;

  // Fetch the next round's matches fresh (lightweight — just match docs, no team populates)
  // so we don't need to hold the entire populated tournament in memory
  var fetchNextRound = function (callback) {
    if (currentRound >= matchUpdates[0].totalRounds) {
      // Championship round — no next round to fetch
      return callback(null, null);
    }
    Round.findById(nextRoundId)
      .populate("matches")
      .exec(function (err, round) {
        if (err) console.log("Error fetching next round:", err);
        callback(err, round);
      });
  };

  fetchNextRound(function (err, nextRound) {
    if (err) return done();

    async.forEachOfSeries(
      matchUpdates,
      function (matchUpdate, i, next) {
        Match.findById(matchUpdate.matchId)
          .populate("topTeam")
          .populate("bottomTeam")
          .exec(function (err, updatedMatch) {
            if (err || !updatedMatch) {
              console.log(err);
              return next();
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
            losingTeam.save(function (err) {
              if (err) console.log("Error saving losing team:", err);
              updatedMatch.save(function (err) {
                if (err) console.log("Error saving match:", err);

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
                  nextRoundMatch.save(function (err) {
                    if (err) console.log("Error saving next round match:", err);
                    next();
                  });
                } else {
                  // Championship game — update tournament champion without holding full doc
                  Tournament.findByIdAndUpdate(
                    matchUpdates[0].tournamentId,
                    { champion: matchUpdates[i].winningTeam._id },
                    function (err) {
                      if (err) console.log("Error saving tournament champion:", err);
                      next();
                    }
                  );
                }
              });
            });
          });
      },
      function (err) {
        if (err) console.log(err);
        done();
      },
    );
  });
};

// Req. Params:
// roundMatchIndex, tournamentId, currentRound, currentRoundId,
// nextRoundId, totalRounds, matchNumber, matchId, winningTeam
var scoreUserMatchPredictions = function (updatedMatches, next) {
  async.forEachSeries(
    updatedMatches,
    function (match, next) {
      //find the match, get the seeds, calculate winning/losing score
      Match.findById(match.matchId)
        .populate("topTeam")
        .populate("bottomTeam")
        .exec(function (err, foundMatch) {
          if (err) console.log(err);
          else {
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
            UserMatchPrediction.find({ "match.id": match.matchId }).exec(
              function (err, foundUserMatchPredictions) {
                if (err) console.log(err);
                else {
                  // Find all user tournaments who reference this tournament but do not have a userRound.userMatchPrediction.match.id matching this match.matchId
                  async.parallel(
                    [
                      function (callback) {
                        // Map the docs into an array of just the _ids
                        var userMPids = foundUserMatchPredictions.map(
                          function (doc) {
                            return doc._id;
                          },
                        );
                        //find the user rounds that reference user match prediction ids (and are in the current round to avoid bonus round picks interfering with rounds 4 and 6
                        UserRound.find({
                          userMatchPredictions: { $in: userMPids },
                          "round.numRound": match.currentRound,
                        }).exec(function (err, foundUserRound) {
                          if (err) console.log(err);
                          else {
                            var userRids = foundUserRound.map(function (doc) {
                              return doc._id;
                            });
                            //find all tournaments that don't have a user round in the list of rounds that match the prediction
                            //  a) these may not have the particular round at all (we need to create the round)
                            //  b) they may have the round, but no pick (i.e., we created the round for them with no picks and just need to subtract the score)
                            UserTournament.find({
                              "tournamentReference.id":
                                updatedMatches[0].tournamentId,
                              userRounds: { $nin: userRids },
                            })
                              .populate("userRounds")
                              .exec(function (err, foundUserTournaments) {
                                if (err) console.log(err);
                                else {
                                  //found userTournaments holds all tournaments without a round, or a round with a reference to the updated match
                                  async.forEachSeries(
                                    foundUserTournaments,
                                    function (foundUserTournament, next) {
                                      if (err) console.log(err);
                                      else {
                                        //does this user tournament have the user round to reference?
                                        var foundRound = -1; //index
                                        async.series(
                                          [
                                            function (callback) {
                                              for (
                                                var j = 0;
                                                j <
                                                foundUserTournament.userRounds
                                                  .length;
                                                j++
                                              ) {
                                                if (
                                                  foundUserTournament
                                                    .userRounds[j].round
                                                    .numRound ===
                                                  Number(
                                                    match.currentRound,
                                                  )
                                                ) {
                                                  foundRound = j;
                                                }
                                              }
                                              callback();
                                            },
                                            function (callback) {
                                              //we've looped through, and a userRound referencing the current round does not exist...create the round
                                              if (foundRound === -1) {
                                                var newUserRound = {
                                                  roundScore: losingScore,
                                                  user: {
                                                    id: foundUserTournament.user
                                                      .id,
                                                    name: foundUserTournament
                                                      .user.firstName,
                                                  },
                                                  round: {
                                                    id: match.currentRoundId,
                                                    numRound:
                                                      match.currentRound,
                                                  },
                                                };
                                                UserRound.create(
                                                  newUserRound,
                                                  function (err, newUserRound) {
                                                    if (err) console.log(err);
                                                    foundUserTournament.userRounds.push(
                                                      newUserRound,
                                                    );
                                                    callback();
                                                  },
                                                );
                                              }
                                              //we found a userRound without a reference to the actual match
                                              else {
                                                foundUserTournament.userRounds[
                                                  foundRound
                                                ].roundScore += losingScore;
                                                foundUserTournament.userRounds[
                                                  foundRound
                                                ].save();
                                                callback();
                                              }
                                            },
                                          ],
                                          function (err) {
                                            if (err) console.log(err);
                                            else {
                                              foundUserTournament.save();
                                              next();
                                            }
                                          },
                                        );
                                      }
                                    },
                                    function (err) {
                                      if (err) console.log(err);
                                      else callback();
                                    },
                                  );
                                  //end of async.forEachSeries(foundUserTournaments)
                                }
                              });
                          }
                        });
                      },

                      function (callback) {
                        async.forEachSeries(
                          foundUserMatchPredictions,
                          function (prediction, next) {
                            if (prediction.numRound === 7) {
                              prediction.score = prediction.winner.equals(
                                winner._id,
                              )
                                ? 5
                                : 0;
                            } else if (prediction.numRound === 8) {
                              prediction.score = prediction.winner.equals(
                                winner._id,
                              )
                                ? 10
                                : 0;
                            } else {
                              prediction.score = prediction.winner.equals(
                                winner._id,
                              )
                                ? winningScore
                                : losingScore;
                            }
                            prediction.save();
                            next();
                          },
                          function (err) {
                            if (err) console.log(err);
                            callback();
                          },
                        );
                      },
                    ],
                    function (err) {
                      if (err) console.log(err);
                      else next();
                    },
                  );
                }
              },
            );
          }
        }); //end of Match.findById
    },
    function (err) {
      if (err) console.log(err);
      else next();
    },
  );
};

// Req. Params:
// roundMatchIndex, tournamentId, currentRound, currentRoundId,
// nextRoundId, totalRounds, matchNumber, matchId, winningTeam
var updateTournamentGroupScores = function (updatedMatches, next) {
  TournamentGroup.find({
    "tournamentReference.id": updatedMatches[0].tournamentId,
  })
    .populate({
      path: "userTournaments",
      populate: {
        path: "userRounds",
        populate: { path: "userMatchPredictions" },
      },
    })
    .exec(function (err, foundTournamentGroups) {
      if (err) console.log(err);
      else {
        async.forEachSeries(
          foundTournamentGroups,
          function (group, next) {
            async.forEachSeries(
              group.userTournaments,
              function (userTournament, next) {
                userTournament.score = 0;
                async.forEachSeries(
                  userTournament.userRounds,
                  function (userRound, next) {
                    async.series(
                      [
                        function (callback) {
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
                            async.forEachSeries(
                              userRound.userMatchPredictions,
                              function (userPrediction, next) {
                                if (userPrediction) {
                                  userRound.roundScore += userPrediction.score;
                                }
                                next();
                              },
                              function (err) {
                                if (err) console.log(err);
                                else {
                                  userRound.save();
                                  callback();
                                }
                              },
                            );
                          } else {
                            callback();
                          }
                        },
                        function (callback) {
                          userTournament.score += userRound.roundScore;
                          callback();
                        },
                      ],
                      function (err) {
                        if (err) console.log(err);
                        else {
                          next();
                        }
                      },
                    );
                  },
                  function (err) {
                    if (err) console.log(err);
                    else {
                      userTournament.save();
                      next();
                    }
                  },
                );
              },
              function (err) {
                if (err) console.log(err);
                else next();
              },
            );
          },
          function (err) {
            if (err) console.log(err);
            else {
              next();
            }
          },
        );
      }
    });
};

// Req. Params:
// roundMatchIndex, tournamentId, currentRound, currentRoundId,
// nextRoundId, totalRounds, matchNumber, matchId, winningTeam
var isRoundComplete = function (updatedMatches, done) {
  Tournament.findById(updatedMatches[0].tournamentId)
    .populate({ path: "rounds", populate: { path: "matches" } })
    .exec(function (err, foundTournament) {
      if (err || !foundTournament) {
        console.log(err);
        console.log("Problems Finding Tournament");
      } else {
        var currRound = foundTournament.currentRound;
        var numUnfinished = 0;

        async.forEachSeries(
          foundTournament.rounds[currRound - 1].matches,
          function (match, next) {
            if (!match.winner) {
              numUnfinished++;
              next();
            } else next();
          },
          function (err) {
            if (err) {
              console.log(err);
            } else if (numUnfinished === 0) {
              foundTournament.currentRound++;
              foundTournament.save();

              //find all tournamentGroups, update their currentRounds, and send out email
              TournamentGroup.find({
                "tournamentReference.id": updatedMatches[0].tournamentId,
              })
                .populate({
                  path: "userTournaments",
                  populate: { path: "userRounds", populate: "round" },
                })
                .exec(function (err, foundTournamentGroup) {
                  if (err || !foundTournamentGroup) {
                    console.log(err);
                  } else {
                    async.forEachSeries(
                      foundTournamentGroup,
                      function (group, next) {
                        group.currentRound++;
                        group.save(function (err) {
                          if (err) console.log("[ROUND] Error saving group round:", err);
                          emailHelper.sendRoundSummary(group);
                          next();
                        });
                      },
                      function (err) {
                        if (err) console.log(err);

                        // Check if tournament is complete (currentRound exceeded rounds array)
                        if (foundTournament.currentRound > foundTournament.rounds.length) {
                          console.log("[TOURNAMENT] Tournament " + foundTournament.year + " complete! Auto-awarding trophies...");
                          awardGroupTrophies(foundTournament.year, function (err) {
                            if (err) console.log("[TROPHY] Error during auto-award:", err);
                            done();
                          });
                        } else {
                          done();
                        }
                      },
                    );
                  }
                });
            } else {
              done();
            }
          },
        );
      }
    });
};

//=========================================================================
// MIDDDLEWARE FOR:
//                 UPDATE - UserRound (userRounds.js route)
//                  router.put("/:numRound")
//  *1) checkTipoffTime
//  2) userRoundCreation
//  3) updateUserMatchAggregates
//=========================================================================
middlewareObj.checkTipoffTime = function (req, res, next) {
  UserTournament.findOne({
    "user.username": req.params.username,
    "tournamentGroup.groupName": req.params.groupName,
  })
    .populate({ path: "tournamentReference.id", populate: "rounds" })
    .exec(function (err, foundUserTournament) {
      if (err) {
        console.log(err);
        req.flash("error", "User Tournament not found");
        res.redirect("back");
      } else {
        res.locals.userFirstName = foundUserTournament.user.firstName;
        var numRound = Number(req.params.numRound);
        if (numRound === 7 || numRound === 8) numRound = 1;
        //find the tournament round associated with this userRound
        Round.findById(
          foundUserTournament.tournamentReference.id.rounds[numRound - 1],
        ).exec(function (err, foundRound) {
          if (err || !foundRound) {
            console.log(err);
            req.flash("error", "Round not found");
            res.redirect("back");
          } else {
            if (moment().isBefore(moment(foundRound.startTime)) ||
              req.user.isAdmin ){
              next();
            } else {
              req.flash(
                "error",
                "Too late! Tipoff for the round has already started.",
              );
              res.redirect("/tournamentGroups/" + req.params.groupName);
            }
          }
        });
      }
    });
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
middlewareObj.userRoundCreation = function (req, res, next) {
  //find the correct userTournament
  UserTournament.findOne({
    "user.username": req.params.username,
    "tournamentGroup.groupName": req.params.groupName,
  })
    .populate({ path: "tournamentReference.id", populate: "rounds" })
    .exec(function (err, foundUserTournament) {
      if (err || !foundUserTournament) {
        req.flash("error", "User Tournament not found");
        res.redirect("back");
      } else {
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

        UserRound.find({
          _id: { $in: foundUserTournament.userRounds },
          $or: [
            { "round.numRound": req.params.numRound },
            { "round.numRound": Number(req.params.numRound) },
          ],
        }).exec(function (err, oldUserRounds) {
          if (err) console.log("[EDIT CLEANUP] Error finding old user rounds:", err);

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

            // Delete old UserMatchPredictions and UserRounds, then create new one
            console.log("[EDIT CLEANUP] Removing " + oldUserRoundIds.length + " old UserRound(s) for round " + req.params.numRound);
            UserMatchPrediction.deleteMany({ _id: { $in: oldPredictionIds } }, function (err) {
              if (err) console.log("[EDIT CLEANUP] Error deleting old predictions:", err);
              UserRound.deleteMany({ _id: { $in: oldUserRoundIds } }, function (err) {
                if (err) console.log("[EDIT CLEANUP] Error deleting old user rounds:", err);
                createNewUserRound();
              });
            });
          } else {
            createNewUserRound();
          }
        });

        function createNewUserRound() {
        //find the tournament round associated with this userRound
        Round.findById(
          foundUserTournament.tournamentReference.id.rounds[actualRoundIndex - 1],
        )
          .populate({
            path: "matches",
            populate: [
              { path: "topTeam" },
              { path: "bottomTeam" },
              { path: "winner" },
            ],
          })
          .exec(function (err, foundRound) {
            if (err) console.log(err);
            else {
              var newUserRound = {
                roundScore: 0,
                possiblePointsRemaining: 0,
                // user: {
                //     id: ,
                //     name:
                // }
                round: {
                  id: foundRound.id,
                  numRound: req.params.numRound,
                },
                userMatchPredictions: [],
              };
              UserRound.create(newUserRound, function (err, newUserRound) {
                if (err) console.log(err);
                else {
                  //============================================================================================
                  // userRound Created -> now fill with the userMatchPredictions
                  //============================================================================================
                  var cumulativeScore = 0;
                  async.forEachSeries(
                    foundRound.matches,
                    function (match, next) {
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

                      var newUserMatchPrediction = {
                        score: predictionScore,
                        numRound: newUserRound.round.numRound,
                        winner: winner,
                        match: {
                          id: match.id,
                          matchNumber: match.matchNumber,
                        },
                        comment: comment,
                      };
                      UserMatchPrediction.create(
                        newUserMatchPrediction,
                        function (err, newUserMatchPrediction) {
                          if (err) console.log(err);
                          else {
                            newUserRound.userMatchPredictions.addToSet(
                              newUserMatchPrediction,
                            );
                            next();
                          }
                        },
                      );
                    },
                    function (err) {
                      if (err) console.log(err);
                      else {
                        res.locals.newUserRound = newUserRound;
                        newUserRound.roundScore = cumulativeScore;
                        foundUserTournament.userRounds.push(newUserRound);
                        newUserRound.save();

                        // Save the UserTournament first (with the new UserRound ref),
                        // then re-fetch to recalculate total score from all rounds
                        foundUserTournament.save(function (err) {
                          if (err) console.log(err);
                          UserTournament.findById(foundUserTournament._id)
                            .populate("userRounds")
                            .exec(function (err, refreshed) {
                              if (err || !refreshed) {
                                console.log(err);
                                next();
                              } else {
                                refreshed.score = 0;
                                refreshed.userRounds.forEach(function (ur) {
                                  refreshed.score += ur.roundScore;
                                });
                                refreshed.save();
                                next();
                              }
                            });
                        });
                      }
                    },
                  );
                }
              });
            }
          });
        } // end createNewUserRound
      }
    });
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

middlewareObj.updateUserMatchAggregates = function (req, res, next) {
  TournamentGroup.findOne({ groupName: req.params.groupName }).exec(
    function (err, foundTournamentGroup) {
      if (err) console.log(err);
      else {
        // Clean up stale picker entries before adding new ones (handles pick edits)
        // Use targetUserId (the user whose picks are being created/edited), NOT currentUser
        // (currentUser could be an admin editing on behalf of someone else)
        var userId = res.locals.targetUserId || res.locals.currentUser._id;
        var groupId = foundTournamentGroup.id;

        function cleanupThenProcess() {
          async.forEachSeries(
            res.locals.newUserRound.userMatchPredictions,
          function (userPrediction, next) {
            Match.findOne({ _id: userPrediction.match.id })
              .populate("topTeam")
              .populate("bottomTeam")
              .exec(function (err, userPredictionMatch) {
                if (err) console.log(err);
                else {
                  //Find or create a userMatchAggregate whose matchReference is the same as this userMatchPrediction's matchReference
                  if (req.params.numRound < 7) {
                    UserMatchAggregate.findOne({
                      matchReference: userPrediction.match.id,
                      tournamentGroup: foundTournamentGroup.id,
                    }).exec(function (err, foundUserMatchAggregate) {
                      if (err) console.log(err);
                      else {
                        async.series(
                          [
                            // if none exist, create a userMatchAggregate for the userMatchPrediction:
                            function (callback) {
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
                                UserMatchAggregate.create(
                                  newUserMatchAggregate,
                                  function (err, newUserMatchAggregate) {
                                    if (err) console.log(err);
                                    else {
                                      foundUserMatchAggregate =
                                        newUserMatchAggregate;
                                      foundTournamentGroup.userMatchAggregates.push(
                                        foundUserMatchAggregate,
                                      );
                                      callback();
                                    }
                                  },
                                );
                              } else callback();
                            },
                            function (callback) {
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
                                foundUserMatchAggregate.topTeamPickers.push(
                                  packedPrediction,
                                );
                              } else {
                                foundUserMatchAggregate.bottomTeamPickers.push(
                                  packedPrediction,
                                );
                              }
                              callback();
                            },
                          ],
                          function (err) {
                            if (err) console.log(err);
                            else {
                              foundUserMatchAggregate.save();
                              next();
                            }
                          },
                        );
                      }
                    });
                  }
                  // Find or create a final four bonusAggregate whose matchReference is the same as this userMatchPrediction's matchReference
                  else if (
                    Number(req.params.numRound) === 7 ||
                    Number(req.params.numRound) === 8
                  ) {
                    Team.findById(
                      userPrediction.winner,
                      function (err, foundTeam) {
                        if (err) console.log(err);
                        else {
                          BonusAggregate.findOne({
                            "team.id": foundTeam.id,
                            matchReference: userPrediction.match.id,
                            tournamentGroup: foundTournamentGroup.id,
                          }).exec(function (err, foundBonusAggregate) {
                            if (err) console.log(err);
                            else {
                              async.series(
                                [
                                  // if none exist, create a foundBonusAggregate for the userMatchPrediction:
                                  function (callback) {
                                    if (!foundBonusAggregate) {
                                      var team = {
                                        id: foundTeam.id,
                                        name: foundTeam.name,
                                        image: foundTeam.image,
                                      };

                                      var newBonusAggregate = {
                                        matchNumber:
                                          userPredictionMatch.matchNumber,
                                        matchReference: userPredictionMatch.id,
                                        tournamentGroup:
                                          foundTournamentGroup.id,
                                        team: team,
                                        teamPickers: [],
                                      };
                                      BonusAggregate.create(
                                        newBonusAggregate,
                                        function (err, newBonusAggregate) {
                                          if (err) console.log(err);
                                          else {
                                            foundBonusAggregate =
                                              newBonusAggregate;
                                            foundTournamentGroup.bonusAggregates.push(
                                              foundBonusAggregate,
                                            );
                                            callback();
                                          }
                                        },
                                      );
                                    } else callback();
                                  },
                                  function (callback) {
                                    //  Assign name and comments to teamPickers array
                                    var packedPrediction = {
                                      id: userId,
                                      firstName: res.locals.userFirstName,
                                      comment: userPrediction.comment,
                                    };
                                    foundBonusAggregate.teamPickers.push(
                                      packedPrediction,
                                    );

                                    callback();
                                  },
                                ],
                                function (err) {
                                  if (err) console.log(err);
                                  else {
                                    foundBonusAggregate.save();
                                    next();
                                  }
                                },
                              );
                            }
                          });
                        }
                      },
                    );
                  }
                }
              });
          },
          function (err) {
            if (err) console.log(err);
            else {
              foundTournamentGroup.save();
              next();
            }
          },
        );
        } // end cleanupThenProcess

        // Determine which matches are being updated, then remove user from those aggregates first
        var matchIds = res.locals.newUserRound.userMatchPredictions.map(function (p) {
          return p.match.id;
        });

        if (req.params.numRound < 7) {
          // Regular rounds: remove user from topTeamPickers and bottomTeamPickers
          UserMatchAggregate.updateMany(
            { tournamentGroup: groupId, matchReference: { $in: matchIds } },
            {
              $pull: {
                topTeamPickers: { id: userId },
                bottomTeamPickers: { id: userId },
              },
            },
            function (err) {
              if (err) console.log("[AGG CLEANUP] Error cleaning regular aggregates:", err);
              cleanupThenProcess();
            }
          );
        } else if (Number(req.params.numRound) === 7 || Number(req.params.numRound) === 8) {
          // Bonus rounds: remove user from all BonusAggregate teamPickers for this group's matches
          BonusAggregate.updateMany(
            { tournamentGroup: groupId, matchReference: { $in: matchIds } },
            {
              $pull: {
                teamPickers: { id: userId },
              },
            },
            function (err) {
              if (err) console.log("[AGG CLEANUP] Error cleaning bonus aggregates:", err);
              cleanupThenProcess();
            }
          );
        } else {
          cleanupThenProcess();
        }
      }
    },
  );
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
// callback(err, { shouldHide: bool })
// shouldHide = true when the user hasn't made their picks AND tipoff hasn't passed.

middlewareObj.checkUserPickStatus = function (userId, groupName, callback) {
  TournamentGroup.findOne({ groupName: groupName })
    .populate({ path: "tournamentReference.id", populate: "rounds" })
    .exec(function (err, group) {
      if (err || !group) return callback(err, { shouldHide: false }); // fail open

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
        return callback(null, { shouldHide: false });
      }

      // Find the user's UserTournament in this group
      UserTournament.findOne({
        "user.id": userId,
        "tournamentGroup.groupName": groupName,
      })
        .populate({ path: "userRounds", populate: "round.id" })
        .exec(function (err, userTournament) {
          if (err) return callback(err, { shouldHide: false }); // fail open

          // User isn't in the group at all — hide picks
          if (!userTournament) return callback(null, { shouldHide: true });

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

          return callback(null, { shouldHide: !hasCurrentRoundPicks });
        });
    });
};

// ─── Award Per-Group Trophies ────────────────────────────────────────────────
// Creates one trophy per user per group they belong to, ranked within each group.
// Idempotent: deletes all trophies for the year before re-creating.
// Called automatically when tournament ends (isRoundComplete) and manually via admin finalize.
// Guarded against concurrent execution (e.g., auto-trigger + admin click at the same time).

var _awardingInProgress = {};

var awardGroupTrophies = function (year, done) {
  if (_awardingInProgress[year]) {
    console.log("[TROPHY] Award already in progress for " + year + ", skipping duplicate call.");
    return done(null, 0);
  }
  _awardingInProgress[year] = true;

  console.log("[TROPHY] Starting per-group trophy award for " + year);

  TournamentGroup.find({ year: year })
    .populate({
      path: "userTournaments",
      populate: [
        { path: "user.id" },
        { path: "userRounds" },
      ],
    })
    .exec(function (err, allGroups) {
      if (err || !allGroups || allGroups.length === 0) {
        console.log("[TROPHY] Error or no groups found:", err);
        _awardingInProgress[year] = false;
        return done(err);
      }

      // Step A: Delete existing trophies for this year (idempotent re-run)
      Trophy.find({ year: year }, function (err, oldTrophies) {
        if (err) console.log("[TROPHY] Error finding old trophies:", err);

        var oldTrophyIds = (oldTrophies || []).map(function (t) { return t._id; });

        if (oldTrophyIds.length > 0) {
          User.updateMany(
            { trophies: { $in: oldTrophyIds } },
            { $pull: { trophies: { $in: oldTrophyIds } } },
            function (err) {
              if (err) console.log("[TROPHY] Error removing old trophy refs:", err);
              Trophy.deleteMany({ year: year }, function (err) {
                if (err) console.log("[TROPHY] Error deleting old trophies:", err);
                createGroupTrophies();
              });
            }
          );
        } else {
          createGroupTrophies();
        }

        // Step B: For each group, calculate standings and create trophies
        function createGroupTrophies() {
          var totalCreated = 0;

          async.eachSeries(allGroups, function (group, nextGroup) {
            if (!group.userTournaments || group.userTournaments.length === 0) {
              return nextGroup();
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

            async.eachSeries(participants, function (ut, nextParticipant) {
              // Calculate rank (1-based, ties share same rank)
              var score = Math.round(ut.score * 1000) / 1000;
              var rank = 1;
              participants.forEach(function (other) {
                if (Math.round(other.score * 1000) / 1000 > score) rank++;
              });

              var roundCount = ut.userRounds ? ut.userRounds.length : 0;

              // ut.user.id is populated to the full User document
              var userId = ut.user.id._id || ut.user.id;
              User.findById(userId, function (err, user) {
                if (err || !user) {
                  console.log("[TROPHY] No user found for " + (ut.user.firstName || "unknown"));
                  return nextParticipant();
                }

                Trophy.create({
                  year: year,
                  userRank: rank,
                  totalPlayers: totalPlayers,
                  score: score,
                  madeAllPicks: roundCount >= maxRounds,
                  groupId: group._id,
                  groupName: group.groupName,
                }, function (err, trophy) {
                  if (err) {
                    console.log("[TROPHY] Error creating trophy:", err);
                    return nextParticipant();
                  }

                  user.trophies.addToSet(trophy._id);
                  user.save(function (err) {
                    if (err) console.log("[TROPHY] Error saving user trophy:", err);
                    totalCreated++;
                    nextParticipant();
                  });
                });
              });
            }, function (err) {
              if (err) console.log("[TROPHY] Error in group " + group.groupName + ":", err);
              console.log("[TROPHY] Completed group: " + group.groupName + " (" + totalPlayers + " players)");
              nextGroup();
            });
          }, function (err) {
            if (err) console.log("[TROPHY] Error:", err);
            console.log("[TROPHY] Finished! Created " + totalCreated + " trophies across " + allGroups.length + " groups for " + year);
            _awardingInProgress[year] = false;
            done(null, totalCreated);
          });
        }
      });
    });
};

middlewareObj.awardGroupTrophies = awardGroupTrophies;

module.exports = middlewareObj;
