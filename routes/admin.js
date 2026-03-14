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

module.exports = router;
