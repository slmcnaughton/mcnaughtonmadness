var express = require("express");
var router = express.Router();
var middleware = require("../middleware");
var User = require("../models/user");
var Team = require("../models/team");
var Tournament = require("../models/tournament");
var TournamentGroup = require("../models/tournamentGroup");
var UserTournament = require("../models/userTournament");
var UserRound = require("../models/userRound");
var UserMatchPrediction = require("../models/userMatchPrediction");
var UserMatchAggregate = require("../models/userMatchAggregate");
var Comment = require("../models/comment");
var Trophy = require("../models/trophy");
var TournamentStanding = require("../models/tournamentStanding");
var async = require("async");
var scrape = require("../scrape");

// All admin routes require isAdmin
router.use(middleware.isAdmin);

// ─── Dashboard ──────────────────────────────────────────────────────────────

router.get("/", function (req, res) {
  var year = new Date().getFullYear();

  User.find({})
    .sort({ lastName: 1, firstName: 1 })
    .exec(function (err, allUsers) {
      if (err) {
        console.log(err);
        req.flash("error", "Error loading users.");
        return res.redirect("/");
      }

      // Find all groups for the current year
      TournamentGroup.find({ year: year })
        .populate({
          path: "userTournaments",
          populate: {
            path: "userRounds",
            populate: { path: "userMatchPredictions" },
          },
        })
        .exec(function (err, groups) {
          if (err) {
            console.log(err);
            req.flash("error", "Error loading groups.");
            return res.redirect("/");
          }

          // Build a pick-status summary per user per group
          // pickStatus[username][groupName] = { joined: true, rounds: { 1: true, 2: false, ... } }
          var pickStatus = {};

          groups.forEach(function (group) {
            if (!group.userTournaments) return;

            group.userTournaments.forEach(function (ut) {
              var username = ut.user.username;
              if (!pickStatus[username]) pickStatus[username] = {};
              pickStatus[username][group.groupName] = {
                joined: true,
                rounds: {},
              };

              if (ut.userRounds) {
                ut.userRounds.forEach(function (ur) {
                  var hasPicks =
                    ur.userMatchPredictions &&
                    ur.userMatchPredictions.length > 0 &&
                    ur.userMatchPredictions.some(function (p) {
                      return !!p.winner;
                    });
                  pickStatus[username][group.groupName].rounds[
                    ur.round.numRound
                  ] = hasPicks;
                });
              }
            });
          });

          res.render("admin/dashboard", {
            page: "admin",
            users: allUsers,
            groups: groups,
            pickStatus: pickStatus,
            year: year,
          });
        });
    });
});

// ─── Password Reset ─────────────────────────────────────────────────────────

router.post("/users/:username/resetPassword", function (req, res) {
  var newPassword = req.body.newPassword;

  if (!newPassword || newPassword.length < 6) {
    req.flash("error", "Password must be at least 6 characters.");
    return res.redirect("/admin");
  }

  User.findOne({ username: req.params.username }, function (err, user) {
    if (err || !user) {
      req.flash("error", "User not found.");
      return res.redirect("/admin");
    }

    // passport-local-mongoose setPassword()
    user.setPassword(newPassword, function (err) {
      if (err) {
        console.log(err);
        req.flash("error", "Error resetting password.");
        return res.redirect("/admin");
      }
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      user.save(function (err) {
        if (err) console.log(err);
        req.flash(
          "success",
          "Password for " + req.params.username + " has been reset.",
        );
        res.redirect("/admin");
      });
    });
  });
});

// ─── Update User Profile (Admin) ─────────────────────────────────────────────

router.post("/users/:userId/update-profile", function (req, res) {
  var newEmail = (req.body.email || "").trim();
  var newFirstName = (req.body.firstName || "").trim();
  var newLastName = (req.body.lastName || "").trim();

  if (!newEmail || !newFirstName || !newLastName) {
    req.flash("error", "All fields are required.");
    return res.redirect("/admin");
  }

  User.findById(req.params.userId, function (err, user) {
    if (err || !user) {
      req.flash("error", "User not found.");
      return res.redirect("/admin");
    }

    var oldFirstName = user.firstName;
    var oldLastName = user.lastName;
    var nameChanged =
      oldFirstName !== newFirstName || oldLastName !== newLastName;

    user.email = newEmail;
    user.firstName = newFirstName;
    user.lastName = newLastName;

    user.save(function (err) {
      if (err) {
        console.log(err);
        req.flash("error", "Error saving user.");
        return res.redirect("/admin");
      }

      if (nameChanged) {
        propagateNameChange(user._id, newFirstName, newLastName, function (err) {
          if (err) console.log("Error propagating name change:", err);
          console.log(
            "[ADMIN] Updated " + oldFirstName + " " + oldLastName +
            " → " + newFirstName + " " + newLastName,
          );
          req.flash(
            "success",
            "Updated profile for " + newFirstName + " " + newLastName +
            " (name change propagated to all records).",
          );
          res.redirect("/admin");
        });
      } else {
        req.flash(
          "success",
          "Updated profile for " + newFirstName + " " + newLastName + ".",
        );
        res.redirect("/admin");
      }
    });
  });
});

// ─── Propagate Name Change Helper ────────────────────────────────────────────
// Updates all denormalized copies of a user's name across collections.

function propagateNameChange(userId, newFirstName, newLastName, done) {
  async.parallel(
    [
      function (cb) {
        UserTournament.updateMany(
          { "user.id": userId },
          { $set: { "user.firstName": newFirstName, "user.lastName": newLastName } },
          cb,
        );
      },
      function (cb) {
        UserRound.updateMany(
          { "user.id": userId },
          { $set: { "user.name": newFirstName } },
          cb,
        );
      },
      function (cb) {
        UserMatchAggregate.updateMany(
          { "topTeamPickers.id": userId },
          { $set: { "topTeamPickers.$.firstName": newFirstName } },
          cb,
        );
      },
      function (cb) {
        UserMatchAggregate.updateMany(
          { "bottomTeamPickers.id": userId },
          { $set: { "bottomTeamPickers.$.firstName": newFirstName } },
          cb,
        );
      },
      function (cb) {
        Comment.updateMany(
          { "author.id": userId },
          { $set: { "author.firstName": newFirstName } },
          cb,
        );
      },
      function (cb) {
        TournamentGroup.updateMany(
          { "commissioner.id": userId },
          { $set: { "commissioner.name": newFirstName } },
          cb,
        );
      },
    ],
    function (err) {
      if (err) console.log("propagateNameChange errors:", err);
      done(err);
    },
  );
}

// ─── Approve Name Change ─────────────────────────────────────────────────────

router.post("/users/:userId/approve-name", function (req, res) {
  User.findById(req.params.userId, function (err, user) {
    if (err || !user) {
      req.flash("error", "User not found.");
      return res.redirect("/admin");
    }

    if (!user.pendingFirstName && !user.pendingLastName) {
      req.flash("error", "No pending name change for this user.");
      return res.redirect("/admin");
    }

    var oldName = user.firstName + " " + user.lastName;
    user.firstName = user.pendingFirstName || user.firstName;
    user.lastName = user.pendingLastName || user.lastName;
    user.pendingFirstName = undefined;
    user.pendingLastName = undefined;
    user.nameChangeRequestedAt = undefined;

    user.save(function (err) {
      if (err) {
        console.log(err);
        req.flash("error", "Error saving user.");
        return res.redirect("/admin");
      }

      propagateNameChange(user._id, user.firstName, user.lastName, function (err) {
        if (err) console.log("Error propagating name change:", err);
        console.log(
          "[ADMIN] Approved name change: " + oldName +
          " → " + user.firstName + " " + user.lastName,
        );
        req.flash(
          "success",
          "Approved: " + oldName + " → " + user.firstName + " " + user.lastName,
        );
        res.redirect("/admin");
      });
    });
  });
});

// ─── Reject Name Change ─────────────────────────────────────────────────────

router.post("/users/:userId/reject-name", function (req, res) {
  User.findById(req.params.userId, function (err, user) {
    if (err || !user) {
      req.flash("error", "User not found.");
      return res.redirect("/admin");
    }

    var requestedName = (user.pendingFirstName || "") + " " + (user.pendingLastName || "");
    user.pendingFirstName = undefined;
    user.pendingLastName = undefined;
    user.nameChangeRequestedAt = undefined;

    user.save(function (err) {
      if (err) console.log(err);
      console.log("[ADMIN] Rejected name change request: " + requestedName + " for " + user.firstName + " " + user.lastName);
      req.flash("success", "Rejected name change request from " + user.firstName + " " + user.lastName + ".");
      res.redirect("/admin");
    });
  });
});

// ─── Delete User (helper) ────────────────────────────────────────────────────
// Cascades through all related records for a single user.
// Calls done(err) when finished.

function deleteUserCascade(userId, done) {
  UserTournament.find({ "user.id": userId }, function (err, userTournaments) {
    if (err) console.log("Error finding user tournaments:", err);

    var utIds = (userTournaments || []).map(function (ut) { return ut._id; });
    var urIds = [];
    (userTournaments || []).forEach(function (ut) {
      if (ut.userRounds) {
        ut.userRounds.forEach(function (urId) { urIds.push(urId); });
      }
    });

    UserRound.find({ _id: { $in: urIds } }, function (err, userRounds) {
      if (err) console.log("Error finding user rounds:", err);

      var umpIds = [];
      (userRounds || []).forEach(function (ur) {
        if (ur.userMatchPredictions) {
          ur.userMatchPredictions.forEach(function (id) { umpIds.push(id); });
        }
      });

      UserMatchPrediction.deleteMany({ _id: { $in: umpIds } }, function (err) {
        if (err) console.log("Error deleting predictions:", err);

        UserRound.deleteMany({ _id: { $in: urIds } }, function (err) {
          if (err) console.log("Error deleting user rounds:", err);

          UserTournament.deleteMany({ "user.id": userId }, function (err) {
            if (err) console.log("Error deleting user tournaments:", err);

            TournamentGroup.updateMany(
              { userTournaments: { $in: utIds } },
              { $pull: { userTournaments: { $in: utIds } } },
              function (err) {
                if (err) console.log("Error updating groups:", err);

                UserMatchAggregate.updateMany(
                  {
                    $or: [
                      { "topTeamPickers.id": userId },
                      { "bottomTeamPickers.id": userId },
                    ],
                  },
                  {
                    $pull: {
                      topTeamPickers: { id: userId },
                      bottomTeamPickers: { id: userId },
                    },
                  },
                  function (err) {
                    if (err) console.log("Error updating aggregates:", err);

                    Comment.deleteMany({ "author.id": userId }, function (err) {
                      if (err) console.log("Error deleting comments:", err);

                      User.deleteOne({ _id: userId }, function (err) {
                        done(err);
                      });
                    });
                  },
                );
              },
            );
          });
        });
      });
    });
  });
}

// ─── Bulk Delete Users ──────────────────────────────────────────────────────

router.post("/users/bulk-delete", function (req, res) {
  // userIds comes as a single string or array from checkboxes
  var userIds = req.body.userIds || [];
  if (typeof userIds === "string") userIds = [userIds];

  if (userIds.length === 0) {
    req.flash("error", "No users selected.");
    return res.redirect("/admin");
  }

  // Fetch selected users, filter out admins
  User.find({ _id: { $in: userIds } }, function (err, users) {
    if (err) {
      console.log(err);
      req.flash("error", "Error finding users.");
      return res.redirect("/admin");
    }

    var toDelete = users.filter(function (u) { return !u.isAdmin; });
    if (toDelete.length === 0) {
      req.flash("error", "No deletable users selected (admin accounts are protected).");
      return res.redirect("/admin");
    }

    var deleted = [];
    var idx = 0;

    function deleteNext() {
      if (idx >= toDelete.length) {
        console.log("[ADMIN] Bulk deleted " + deleted.length + " users: " + deleted.join(", "));
        req.flash("success", "Deleted " + deleted.length + " user(s): " + deleted.join(", "));
        return res.redirect("/admin");
      }

      var user = toDelete[idx];
      idx++;

      deleteUserCascade(user._id, function (err) {
        if (err) {
          console.log("Error deleting " + user.username + ":", err);
        } else {
          deleted.push(user.firstName + " " + user.lastName);
        }
        deleteNext();
      });
    }

    deleteNext();
  });
});

// ─── Scrape Trigger ──────────────────────────────────────────────────────────

router.post("/scrape", function (req, res) {
  var dateStr = (req.body.dateStr || "").trim();
  if (dateStr) {
    console.log("[ADMIN] Manual scrape triggered for date: " + dateStr);
    scrape(dateStr);
  } else {
    console.log("[ADMIN] Manual scrape triggered for today");
    scrape();
  }
  req.flash("success", "Scrape triggered" + (dateStr ? " for " + dateStr : " for today") + ". Check server logs for results.");
  res.redirect("/admin");
});

// ─── Team Management ────────────────────────────────────────────────────────

router.get("/teams", function (req, res) {
  var year = new Date().getFullYear();

  Tournament.findOne({ year: year }, { rounds: { $slice: 1 } })
    .populate({
      path: "rounds",
      populate: {
        path: "matches",
        populate: [
          { path: "topTeam", model: "Team" },
          { path: "bottomTeam", model: "Team" },
        ],
      },
    })
    .exec(function (err, tournament) {
      if (err) {
        console.log(err);
        req.flash("error", "Error loading tournament.");
        return res.redirect("/admin");
      }

      // Collect all unique teams from round 1 matches
      var teams = [];
      var teamIds = {};

      if (tournament && tournament.rounds && tournament.rounds.length > 0) {
        var round1 = tournament.rounds[0];
        if (round1 && round1.matches) {
          round1.matches.forEach(function (match) {
            if (match.topTeam && !teamIds[match.topTeam._id]) {
              teams.push(match.topTeam);
              teamIds[match.topTeam._id] = true;
            }
            if (match.bottomTeam && !teamIds[match.bottomTeam._id]) {
              teams.push(match.bottomTeam);
              teamIds[match.bottomTeam._id] = true;
            }
          });
        }
      }

      // Sort by region, then seed
      teams.sort(function (a, b) {
        if (a.region !== b.region) return a.region < b.region ? -1 : 1;
        return a.seed - b.seed;
      });

      res.render("admin/teams", {
        page: "admin",
        teams: teams,
        tournament: tournament,
        year: year,
      });
    });
});

router.post("/teams/:teamId", function (req, res) {
  var update = {};

  if (req.body.name) {
    update.name = req.body.name.trim();
  }

  // Parse aliases from comma-separated string
  if (typeof req.body.aliases === "string") {
    update.aliases = req.body.aliases
      .split(",")
      .map(function (a) {
        return a.trim();
      })
      .filter(function (a) {
        return a.length > 0;
      });
  } else {
    update.aliases = [];
  }

  Team.findByIdAndUpdate(
    req.params.teamId,
    { $set: update },
    function (err, team) {
      if (err) {
        console.log(err);
        req.flash("error", "Error updating team.");
        return res.redirect("/admin/teams");
      }
      req.flash("success", "Updated " + (update.name || "team") + ".");
      res.redirect("/admin/teams");
    },
  );
});

// ─── Toggle Official Group ──────────────────────────────────────────────────

router.post("/groups/:groupName/toggle-official", function (req, res) {
  TournamentGroup.findOne(
    { groupName: req.params.groupName },
    function (err, group) {
      if (err || !group) {
        req.flash("error", "Group not found.");
        return res.redirect("/admin");
      }
      group.isOfficial = !group.isOfficial;
      group.save(function (err) {
        if (err) console.log(err);
        req.flash(
          "success",
          group.groupName +
            " is now " +
            (group.isOfficial ? "official" : "unofficial") +
            ".",
        );
        res.redirect("/admin");
      });
    },
  );
});

// ─── Finalize Tournament (Create Trophies) ──────────────────────────────────

router.post("/finalize-tournament", function (req, res) {
  var year = new Date().getFullYear();

  // 1. Find all official groups for this year
  TournamentGroup.find({ year: year, isOfficial: true })
    .populate({ path: "userTournaments", populate: "user" })
    .exec(function (err, officialGroups) {
      if (err) {
        console.log(err);
        req.flash("error", "Error finding official groups.");
        return res.redirect("/admin");
      }

      if (!officialGroups || officialGroups.length === 0) {
        req.flash(
          "error",
          "No official groups found for " + year + ". Mark a group as official first.",
        );
        return res.redirect("/admin");
      }

      // 2. Collect standings from all official groups, deduplicate by name
      var standingsMap = {}; // key: "firstName|lastName" → { firstName, lastName, score }

      officialGroups.forEach(function (group) {
        if (!group.userTournaments) return;
        group.userTournaments.forEach(function (ut) {
          var key = ut.user.firstName + "|" + ut.user.lastName;
          var score = Math.round(ut.score * 1000) / 1000;
          if (!standingsMap[key] || score > standingsMap[key].score) {
            standingsMap[key] = {
              firstName: ut.user.firstName,
              lastName: ut.user.lastName,
              score: score,
            };
          }
        });
      });

      var standings = Object.keys(standingsMap).map(function (key) {
        return standingsMap[key];
      });

      if (standings.length === 0) {
        req.flash("error", "No user scores found in official groups.");
        return res.redirect("/admin");
      }

      console.log(
        "[ADMIN] Finalizing " +
          year +
          " tournament with " +
          standings.length +
          " participants from " +
          officialGroups.length +
          " official group(s).",
      );

      // 3. Upsert TournamentStanding for idempotency
      TournamentStanding.findOneAndUpdate(
        { year: year },
        { year: year, standings: standings },
        { upsert: true, new: true },
        function (err) {
          if (err) {
            console.log(err);
            req.flash("error", "Error creating tournament standing.");
            return res.redirect("/admin");
          }

          // 4. Delete any existing trophies for this year (idempotent re-run)
          Trophy.find({ year: year }, function (err, oldTrophies) {
            if (err) console.log("Error finding old trophies:", err);

            var oldTrophyIds = (oldTrophies || []).map(function (t) {
              return t._id;
            });

            // Remove old trophy refs from all users, then delete the trophy docs
            User.updateMany(
              { trophies: { $in: oldTrophyIds } },
              { $pull: { trophies: { $in: oldTrophyIds } } },
              function (err) {
                if (err) console.log("Error removing old trophy refs:", err);

                Trophy.deleteMany({ year: year }, function (err) {
                  if (err) console.log("Error deleting old trophies:", err);

            // 5. For each standing entry, create trophy and assign to user
            var totalPlayers = standings.length;
            var created = 0;

            async.eachSeries(
              standings,
              function (entry, next) {
                // Calculate rank
                var rank = 1;
                standings.forEach(function (other) {
                  if (other.score > entry.score) rank++;
                });

                // Find matching user
                User.findOne(
                  {
                    firstName: entry.firstName,
                    lastName: entry.lastName,
                  },
                  function (err, user) {
                    if (err || !user) {
                      console.log(
                        "[TROPHY] No user found for " +
                          entry.firstName +
                          " " +
                          entry.lastName,
                      );
                      return next();
                    }

                    // Create trophy
                    Trophy.create(
                      {
                        year: year,
                        userRank: rank,
                        totalPlayers: totalPlayers,
                        score: entry.score,
                      },
                      function (err, trophy) {
                        if (err) {
                          console.log("Error creating trophy:", err);
                          return next();
                        }

                        user.trophies.addToSet(trophy._id);
                        user.save(function (err) {
                          if (err) console.log("Error saving user trophy:", err);
                          created++;
                          next();
                        });
                      },
                    );
                  },
                );
              },
              function (err) {
                if (err) console.log(err);
                console.log(
                  "[ADMIN] Finalized! Created " +
                    created +
                    " trophies for " +
                    year +
                    ".",
                );
                req.flash(
                  "success",
                  "Tournament finalized! Created " +
                    created +
                    " trophies for " +
                    totalPlayers +
                    " participants.",
                );
                res.redirect("/admin");
              },
            );
                });
              },
            );
          });
        },
      );
    });
});

// ─── Account Merge ──────────────────────────────────────────────────────────

router.get("/merge", function (req, res) {
  User.find({})
    .sort({ lastName: 1, firstName: 1 })
    .populate("trophies")
    .exec(function (err, allUsers) {
      if (err) {
        console.log(err);
        req.flash("error", "Error loading users.");
        return res.redirect("/admin");
      }
      res.render("admin/merge", { page: "admin", users: allUsers });
    });
});

router.post("/merge", function (req, res) {
  var sourceId = req.body.sourceUserId;
  var targetId = req.body.targetUserId;

  if (!sourceId || !targetId) {
    req.flash("error", "Please select both source and target accounts.");
    return res.redirect("/admin/merge");
  }

  if (sourceId === targetId) {
    req.flash("error", "Source and target cannot be the same account.");
    return res.redirect("/admin/merge");
  }

  async.parallel(
    {
      source: function (cb) {
        User.findById(sourceId).populate("trophies").exec(cb);
      },
      target: function (cb) {
        User.findById(targetId).populate("trophies").exec(cb);
      },
    },
    function (err, results) {
      if (err || !results.source || !results.target) {
        req.flash("error", "One or both users not found.");
        return res.redirect("/admin/merge");
      }

      var source = results.source;
      var target = results.target;

      if (source.isAdmin) {
        req.flash("error", "Cannot merge an admin account as source.");
        return res.redirect("/admin/merge");
      }

      console.log(
        "[ADMIN] Merging " + source.firstName + " " + source.lastName +
        " (" + source.username + ") → " +
        target.firstName + " " + target.lastName +
        " (" + target.username + ")",
      );

      // Step 1: Transfer trophies from source to target (skip years target already has)
      var targetTrophyYears = {};
      target.trophies.forEach(function (t) {
        targetTrophyYears[t.year] = true;
      });
      source.trophies.forEach(function (trophy) {
        if (!targetTrophyYears[trophy.year]) {
          target.trophies.addToSet(trophy._id || trophy);
        } else {
          console.log("[MERGE] Skipping duplicate trophy for year " + trophy.year);
        }
      });

      // Step 2: Transfer tournament groups (skip duplicates by groupName+year)
      source.tournamentGroups.forEach(function (sg) {
        var isDuplicate = target.tournamentGroups.some(function (tg) {
          return tg.groupName === sg.groupName && tg.year === sg.year;
        });
        if (!isDuplicate) {
          target.tournamentGroups.push(sg);
        }
      });

      target.save(function (err) {
        if (err) {
          console.log("Error saving target user:", err);
          req.flash("error", "Error saving target user.");
          return res.redirect("/admin/merge");
        }

        // Step 3: Check for duplicate UserTournaments in same group
        // Find source's UserTournaments and check for conflicts
        UserTournament.find({ "user.id": sourceId }, function (err, sourceUTs) {
          if (err) console.log("Error finding source UTs:", err);

          UserTournament.find({ "user.id": targetId }, function (err, targetUTs) {
            if (err) console.log("Error finding target UTs:", err);

            // Build set of target's group+year combos
            var targetGroupKeys = {};
            (targetUTs || []).forEach(function (ut) {
              var key = String(ut.tournamentGroup.id) + "|" + ut.tournamentGroup.groupName;
              targetGroupKeys[key] = true;
            });

            // Split source UTs into transferable vs conflicting
            var toTransfer = [];
            var toDelete = [];
            (sourceUTs || []).forEach(function (ut) {
              var key = String(ut.tournamentGroup.id) + "|" + ut.tournamentGroup.groupName;
              if (targetGroupKeys[key]) {
                toDelete.push(ut); // Conflict: target already in this group
              } else {
                toTransfer.push(ut);
              }
            });

            // Delete conflicting UTs (and their cascade)
            async.eachSeries(
              toDelete,
              function (ut, next) {
                // Delete this UT's rounds and predictions
                var urIds = ut.userRounds || [];
                UserRound.find({ _id: { $in: urIds } }, function (err, rounds) {
                  var umpIds = [];
                  (rounds || []).forEach(function (ur) {
                    (ur.userMatchPredictions || []).forEach(function (id) {
                      umpIds.push(id);
                    });
                  });
                  UserMatchPrediction.deleteMany({ _id: { $in: umpIds } }, function () {
                    UserRound.deleteMany({ _id: { $in: urIds } }, function () {
                      // Remove UT ref from tournament group
                      TournamentGroup.updateMany(
                        { userTournaments: ut._id },
                        { $pull: { userTournaments: ut._id } },
                        function () {
                          UserTournament.deleteOne({ _id: ut._id }, next);
                        },
                      );
                    });
                  });
                });
              },
              function () {
                // Step 4: Re-point transferable UserTournaments to target
                async.parallel(
                  [
                    function (cb) {
                      if (toTransfer.length === 0) return cb();
                      var transferIds = toTransfer.map(function (ut) { return ut._id; });
                      UserTournament.updateMany(
                        { _id: { $in: transferIds } },
                        {
                          $set: {
                            "user.id": target._id,
                            "user.username": target.username,
                            "user.firstName": target.firstName,
                            "user.lastName": target.lastName,
                          },
                        },
                        cb,
                      );
                    },
                    // Step 5: Re-point UserRounds
                    function (cb) {
                      UserRound.updateMany(
                        { "user.id": sourceId },
                        { $set: { "user.id": target._id, "user.name": target.firstName } },
                        cb,
                      );
                    },
                    // Step 6: Re-point UserMatchAggregate picker arrays
                    function (cb) {
                      UserMatchAggregate.updateMany(
                        { "topTeamPickers.id": sourceId },
                        {
                          $set: {
                            "topTeamPickers.$.id": target._id,
                            "topTeamPickers.$.firstName": target.firstName,
                          },
                        },
                        cb,
                      );
                    },
                    function (cb) {
                      UserMatchAggregate.updateMany(
                        { "bottomTeamPickers.id": sourceId },
                        {
                          $set: {
                            "bottomTeamPickers.$.id": target._id,
                            "bottomTeamPickers.$.firstName": target.firstName,
                          },
                        },
                        cb,
                      );
                    },
                    // Step 7: Re-point Comments
                    function (cb) {
                      Comment.updateMany(
                        { "author.id": sourceId },
                        {
                          $set: {
                            "author.id": target._id,
                            "author.username": target.username,
                            "author.firstName": target.firstName,
                          },
                        },
                        cb,
                      );
                    },
                    // Step 8: Re-point TournamentGroup commissioner
                    function (cb) {
                      TournamentGroup.updateMany(
                        { "commissioner.id": sourceId },
                        {
                          $set: {
                            "commissioner.id": target._id,
                            "commissioner.name": target.firstName,
                          },
                        },
                        cb,
                      );
                    },
                  ],
                  function (err) {
                    if (err) console.log("Error during merge re-pointing:", err);

                    // Step 9: Clean up orphaned source trophies (duplicate years that weren't transferred)
                    var orphanedTrophyIds = source.trophies
                      .filter(function (t) { return targetTrophyYears[t.year]; })
                      .map(function (t) { return t._id || t; });
                    Trophy.deleteMany({ _id: { $in: orphanedTrophyIds } }, function (err) {
                      if (err) console.log("Error cleaning up orphaned trophies:", err);

                      // Step 10: Delete source user
                      User.deleteOne({ _id: sourceId }, function (err) {
                        if (err) console.log("Error deleting source user:", err);

                        var mergeMsg =
                          "Merged " + source.firstName + " " + source.lastName +
                          " (" + source.username + ") into " +
                          target.firstName + " " + target.lastName +
                          " (" + target.username + "). " +
                          toTransfer.length + " tournament(s) transferred, " +
                          toDelete.length + " duplicate(s) removed.";
                        console.log("[ADMIN] " + mergeMsg);
                        req.flash("success", mergeMsg);
                        res.redirect("/admin");
                      });
                    });
                  },
                );
              },
            );
          });
        });
      });
    },
  );
});

module.exports = router;
