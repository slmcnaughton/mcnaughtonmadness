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
var BonusAggregate = require("../models/bonusAggregate");
var Comment = require("../models/comment");
var Trophy = require("../models/trophy");
var TournamentStanding = require("../models/tournamentStanding");
var moment = require("moment-timezone");
var Feedback = require("../models/feedback");
var FamilyMember = require("../models/familyMember");
var FamilyRelationship = require("../models/familyRelationship");
var scrape = require("../scrape");
var EmailLog = require("../models/emailLog");

// Lazy-load so the app still starts if packages aren't installed
var upload;
try {
  var cloudinaryConfig = require("../config/cloudinary");
  upload = cloudinaryConfig.upload;
} catch (e) {
  console.log("[WARN] Cloudinary packages not installed. Photo uploads disabled.");
  upload = { single: function () { return function (req, res, next) { next(); }; } };
}

// All admin routes require isAdmin
router.use(middleware.isAdmin);

// ─── Dashboard ──────────────────────────────────────────────────────────────

router.get("/", async function (req, res) {
  try {
    var year = new Date().getFullYear();

    var results = await Promise.all([
      User.find({}).sort({ lastName: 1, firstName: 1 }),
      TournamentGroup.find({ year: year }).populate("userTournaments"),
      TournamentGroup.find({}).select("groupName year isOfficial").sort({ year: -1, groupName: 1 }),
      Feedback.find({}).sort({ createdAt: -1 }),
      EmailLog.find({}).sort({ createdAt: -1 }).limit(50),
    ]);

    var allUsers = results[0];
    var groups = results[1];
    var allGroups = results[2];
    var allFeedback = results[3];
    var emailLogs = results[4];

    // Pick status is now built per-group on the manage page
    var pickStatus = {};

    res.render("admin/dashboard", {
      page: "admin",
      users: allUsers,
      groups: groups,
      allGroups: allGroups,
      pickStatus: pickStatus,
      year: year,
      feedback: allFeedback,
      emailLogs: emailLogs,
      moment: moment,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Error loading dashboard.");
    res.redirect("/");
  }
});

// ─── Feedback Status Update ──────────────────────────────────────────────────

router.post("/feedback/:feedbackId/status", async function (req, res) {
  try {
    var newStatus = req.body.status;
    var adminNotes = (req.body.adminNotes || "").trim();

    if (["new", "read", "resolved"].indexOf(newStatus) === -1) {
      req.flash("error", "Invalid status.");
      return res.redirect("/admin");
    }

    var update = { status: newStatus };
    if (adminNotes) update.adminNotes = adminNotes;

    await Feedback.findByIdAndUpdate(req.params.feedbackId, { $set: update });
    req.flash("success", "Feedback marked as " + newStatus + ".");
    res.redirect("/admin");
  } catch (err) {
    console.log(err);
    req.flash("error", "Error updating feedback.");
    res.redirect("/admin");
  }
});

// ─── Feedback Delete ────────────────────────────────────────────────────────

router.delete("/feedback/:feedbackId", async function (req, res) {
  try {
    await Feedback.findByIdAndDelete(req.params.feedbackId);
    req.flash("success", "Feedback deleted.");
    res.redirect("/admin");
  } catch (err) {
    console.log(err);
    req.flash("error", "Error deleting feedback.");
    res.redirect("/admin");
  }
});


// ─── Password Reset ─────────────────────────────────────────────────────────

router.post("/users/:username/resetPassword", async function (req, res) {
  try {
    var newPassword = req.body.newPassword;

    if (!newPassword || newPassword.length < 6) {
      req.flash("error", "Password must be at least 6 characters.");
      return res.redirect("/admin");
    }

    var user = await User.findOne({ username: req.params.username });
    if (!user) {
      req.flash("error", "User not found.");
      return res.redirect("/admin");
    }

    // passport-local-mongoose setPassword() — still callback-based
    user.setPassword(newPassword, async function (err) {
      if (err) {
        console.log(err);
        req.flash("error", "Error resetting password.");
        return res.redirect("/admin");
      }
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();
      req.flash(
        "success",
        "Password for " + req.params.username + " has been reset.",
      );
      res.redirect("/admin");
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Error resetting password.");
    res.redirect("/admin");
  }
});

// ─── Update User Profile (Admin) ─────────────────────────────────────────────

router.post("/users/:userId/update-profile", upload.single("image"), async function (req, res) {
  try {
    var newEmail = (req.body.email || "").trim();
    var newFirstName = (req.body.firstName || "").trim();
    var newLastName = (req.body.lastName || "").trim();

    if (!newEmail || !newFirstName || !newLastName) {
      req.flash("error", "All fields are required.");
      return res.redirect("/admin");
    }

    var user = await User.findById(req.params.userId);
    if (!user) {
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

    // If admin uploaded a new photo
    if (req.file) {
      user.image = req.file.path;
    }

    await user.save();

    // Sync photo to linked FamilyMember if applicable
    if (req.file && user.familyTreeId) {
      try {
        await FamilyMember.findByIdAndUpdate(
          user.familyTreeId,
          { $set: { image: req.file.path } },
        );
      } catch (syncErr) {
        console.log("Error syncing photo to family member:", syncErr);
      }
    }

    if (nameChanged) {
      try {
        await propagateNameChange(user._id, newFirstName, newLastName);
      } catch (propErr) {
        console.log("Error propagating name change:", propErr);
      }
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
    } else {
      req.flash(
        "success",
        "Updated profile for " + newFirstName + " " + newLastName + ".",
      );
      res.redirect("/admin");
    }
  } catch (err) {
    console.log(err);
    req.flash("error", "Error saving user.");
    res.redirect("/admin");
  }
});

// ─── Propagate Name Change Helper ────────────────────────────────────────────
// Updates all denormalized copies of a user's name across collections.

async function propagateNameChange(userId, newFirstName, newLastName) {
  await Promise.all([
    UserTournament.updateMany(
      { "user.id": userId },
      { $set: { "user.firstName": newFirstName, "user.lastName": newLastName } },
    ),
    UserRound.updateMany(
      { "user.id": userId },
      { $set: { "user.name": newFirstName } },
    ),
    UserMatchAggregate.updateMany(
      { "topTeamPickers.id": userId },
      { $set: { "topTeamPickers.$.firstName": newFirstName } },
    ),
    UserMatchAggregate.updateMany(
      { "bottomTeamPickers.id": userId },
      { $set: { "bottomTeamPickers.$.firstName": newFirstName } },
    ),
    Comment.updateMany(
      { "author.id": userId },
      { $set: { "author.firstName": newFirstName } },
    ),
    TournamentGroup.updateMany(
      { "commissioner.id": userId },
      { $set: { "commissioner.name": newFirstName } },
    ),
    Feedback.updateMany(
      { "author.id": userId },
      { $set: { "author.firstName": newFirstName, "author.lastName": newLastName } },
    ),
    FamilyMember.updateMany(
      { user: userId },
      { $set: { firstName: newFirstName, lastName: newLastName } },
    ),
  ]);
}

// ─── Approve Name Change ─────────────────────────────────────────────────────

router.post("/users/:userId/approve-name", async function (req, res) {
  try {
    var user = await User.findById(req.params.userId);
    if (!user) {
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

    await user.save();

    try {
      await propagateNameChange(user._id, user.firstName, user.lastName);
    } catch (propErr) {
      console.log("Error propagating name change:", propErr);
    }
    console.log(
      "[ADMIN] Approved name change: " + oldName +
      " → " + user.firstName + " " + user.lastName,
    );
    req.flash(
      "success",
      "Approved: " + oldName + " → " + user.firstName + " " + user.lastName,
    );
    res.redirect("/admin");
  } catch (err) {
    console.log(err);
    req.flash("error", "Error saving user.");
    res.redirect("/admin");
  }
});

// ─── Reject Name Change ─────────────────────────────────────────────────────

router.post("/users/:userId/reject-name", async function (req, res) {
  try {
    var user = await User.findById(req.params.userId);
    if (!user) {
      req.flash("error", "User not found.");
      return res.redirect("/admin");
    }

    var requestedName = (user.pendingFirstName || "") + " " + (user.pendingLastName || "");
    user.pendingFirstName = undefined;
    user.pendingLastName = undefined;
    user.nameChangeRequestedAt = undefined;

    await user.save();
    console.log("[ADMIN] Rejected name change request: " + requestedName + " for " + user.firstName + " " + user.lastName);
    req.flash("success", "Rejected name change request from " + user.firstName + " " + user.lastName + ".");
    res.redirect("/admin");
  } catch (err) {
    console.log(err);
    req.flash("error", "Error rejecting name change.");
    res.redirect("/admin");
  }
});

// ─── Delete User (helper) ────────────────────────────────────────────────────
// Cascades through all related records for a single user.

async function deleteUserCascade(userId) {
  var userTournaments = await UserTournament.find({ "user.id": userId });

  var utIds = (userTournaments || []).map(function (ut) { return ut._id; });
  var urIds = [];
  (userTournaments || []).forEach(function (ut) {
    if (ut.userRounds) {
      ut.userRounds.forEach(function (urId) { urIds.push(urId); });
    }
  });

  var userRounds = await UserRound.find({ _id: { $in: urIds } });

  var umpIds = [];
  (userRounds || []).forEach(function (ur) {
    if (ur.userMatchPredictions) {
      ur.userMatchPredictions.forEach(function (id) { umpIds.push(id); });
    }
  });

  await UserMatchPrediction.deleteMany({ _id: { $in: umpIds } });
  await UserRound.deleteMany({ _id: { $in: urIds } });
  await UserTournament.deleteMany({ "user.id": userId });
  await TournamentGroup.updateMany(
    { userTournaments: { $in: utIds } },
    { $pull: { userTournaments: { $in: utIds } } },
  );
  await UserMatchAggregate.updateMany(
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
  );
  await Comment.deleteMany({ "author.id": userId });
  await Feedback.deleteMany({ "author.id": userId });

  // Unlink FamilyMember instead of deleting (preserve tree structure)
  await FamilyMember.updateMany(
    { user: userId },
    { $unset: { user: "" } },
  );

  await User.deleteOne({ _id: userId });
}

// ─── Bulk Delete Users ──────────────────────────────────────────────────────

router.post("/users/bulk-delete", async function (req, res) {
  try {
    // userIds comes as a single string or array from checkboxes
    var userIds = req.body.userIds || [];
    if (typeof userIds === "string") userIds = [userIds];

    if (userIds.length === 0) {
      req.flash("error", "No users selected.");
      return res.redirect("/admin");
    }

    // Fetch selected users, filter out admins
    var users = await User.find({ _id: { $in: userIds } });

    var toDelete = users.filter(function (u) { return !u.isAdmin; });
    if (toDelete.length === 0) {
      req.flash("error", "No deletable users selected (admin accounts are protected).");
      return res.redirect("/admin");
    }

    var deleted = [];

    for (var i = 0; i < toDelete.length; i++) {
      var user = toDelete[i];
      try {
        await deleteUserCascade(user._id);
        deleted.push(user.firstName + " " + user.lastName);
      } catch (delErr) {
        console.log("Error deleting " + user.username + ":", delErr);
      }
    }

    console.log("[ADMIN] Bulk deleted " + deleted.length + " users: " + deleted.join(", "));
    req.flash("success", "Deleted " + deleted.length + " user(s): " + deleted.join(", "));
    res.redirect("/admin");
  } catch (err) {
    console.log(err);
    req.flash("error", "Error finding users.");
    res.redirect("/admin");
  }
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

router.get("/teams", async function (req, res) {
  try {
    var year = new Date().getFullYear();

    var tournament = await Tournament.findOne({ year: year }, { rounds: { $slice: 1 } })
      .populate({
        path: "rounds",
        populate: {
          path: "matches",
          populate: [
            { path: "topTeam", model: "Team" },
            { path: "bottomTeam", model: "Team" },
          ],
        },
      });

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
  } catch (err) {
    console.log(err);
    req.flash("error", "Error loading tournament.");
    res.redirect("/admin");
  }
});

router.post("/teams/:teamId", async function (req, res) {
  try {
    var TeamImage = require("../models/teamImage");
    var teamAliases = require("../helpers/teamAliases");

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

    // If the name changed, look up the correct team image
    if (update.name) {
      var allTeamImages = await TeamImage.find({});
      allTeamImages = allTeamImages || [];
      var matched = allTeamImages.find(function (ti) {
        return teamAliases.teamsMatch(update.name, ti.name, update.aliases);
      });
      if (matched) {
        update.image = matched.image;
        console.log("[ADMIN] Team renamed to " + update.name + " — matched image from " + matched.name);
      } else {
        console.log("[ADMIN] Team renamed to " + update.name + " — no matching TeamImage found");
      }
    }

    await Team.findByIdAndUpdate(
      req.params.teamId,
      { $set: update },
    );

    // Cascade name/image changes to embedded BonusAggregate team snapshots
    var bonusUpdate = {};
    if (update.name) bonusUpdate["team.name"] = update.name;
    if (update.image) bonusUpdate["team.image"] = update.image;
    if (Object.keys(bonusUpdate).length > 0) {
      var cascadeResult = await BonusAggregate.updateMany(
        { "team.id": req.params.teamId },
        { $set: bonusUpdate }
      );
      if (cascadeResult.modifiedCount > 0) {
        console.log("[ADMIN] Cascaded team update to " + cascadeResult.modifiedCount + " BonusAggregate(s) for teamId " + req.params.teamId);
      }
    }

    req.flash("success", "Updated " + (update.name || "team") + ".");
    res.redirect("/admin/teams");
  } catch (err) {
    console.log(err);
    req.flash("error", "Error updating team.");
    res.redirect("/admin/teams");
  }
});

// ─── Toggle Official Group ──────────────────────────────────────────────────

router.post("/groups/:groupName/toggle-official", async function (req, res) {
  try {
    var group = await TournamentGroup.findOne({ groupName: req.params.groupName });
    if (!group) {
      req.flash("error", "Group not found.");
      return res.redirect("/admin");
    }
    group.isOfficial = !group.isOfficial;
    await group.save();

    // Backfill: update isOfficial on every user's embedded tournamentGroups entry
    // that references this group (by matching the group's _id)
    try {
      var users = await User.find({ "tournamentGroups.id": group._id });
      var count = 0;
      for (var i = 0; i < users.length; i++) {
        var user = users[i];
        var changed = false;
        user.tournamentGroups.forEach(function (tg) {
          if (tg.id && tg.id.toString() === group._id.toString()) {
            tg.isOfficial = group.isOfficial;
            changed = true;
          }
        });
        if (changed) {
          await user.save();
          count++;
        }
      }
      console.log("[OFFICIAL TOGGLE] Backfilled isOfficial=" + group.isOfficial + " for " + count + " users in " + group.groupName);
    } catch (backfillErr) {
      console.log("Error backfilling isOfficial:", backfillErr);
    }

    req.flash(
      "success",
      group.groupName +
        " is now " +
        (group.isOfficial ? "official" : "unofficial") +
        ". Updated all members.",
    );
    res.redirect("/admin");
  } catch (err) {
    console.log(err);
    req.flash("error", "Error toggling official status.");
    res.redirect("/admin");
  }
});

// ─── Finalize Tournament (Create Trophies) ──────────────────────────────────

router.post("/finalize-tournament", async function (req, res) {
  try {
    var year = new Date().getFullYear();

    console.log(
      "[ADMIN] Finalizing " + year + " tournament — building standings and awarding per-group trophies.",
    );

    // 1. Build & save TournamentStanding from official groups + email admin
    await middleware.buildAndSaveTournamentStanding(year);

    // 2. Award per-group trophies for ALL groups
    await middleware.awardGroupTrophies(year);

    req.flash(
      "success",
      "Tournament finalized! Per-group trophies awarded for all " + year + " groups. Final standings emailed.",
    );
    res.redirect("/admin");
  } catch (err) {
    console.log(err);
    req.flash("error", "Error finalizing tournament: " + (err.message || err));
    res.redirect("/admin");
  }
});

// ─── Account Merge ──────────────────────────────────────────────────────────

router.get("/merge", async function (req, res) {
  try {
    var allUsers = await User.find({})
      .sort({ lastName: 1, firstName: 1 })
      .populate("trophies");
    res.render("admin/merge", { page: "admin", users: allUsers });
  } catch (err) {
    console.log(err);
    req.flash("error", "Error loading users.");
    res.redirect("/admin");
  }
});

router.post("/merge", async function (req, res) {
  try {
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

    var results = await Promise.all([
      User.findById(sourceId).populate("trophies"),
      User.findById(targetId).populate("trophies"),
    ]);

    var source = results[0];
    var target = results[1];

    if (!source || !target) {
      req.flash("error", "One or both users not found.");
      return res.redirect("/admin/merge");
    }

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

    // Step 1: Transfer trophies from source to target (skip duplicates by year + groupId)
    var targetTrophyKeys = {};
    target.trophies.forEach(function (t) {
      var key = t.year + "|" + (t.groupId ? String(t.groupId) : "null");
      targetTrophyKeys[key] = true;
    });
    source.trophies.forEach(function (trophy) {
      var key = trophy.year + "|" + (trophy.groupId ? String(trophy.groupId) : "null");
      if (!targetTrophyKeys[key]) {
        target.trophies.addToSet(trophy._id || trophy);
      } else {
        console.log("[MERGE] Skipping duplicate trophy for year " + trophy.year + " group " + (trophy.groupName || "legacy"));
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

    await target.save();

    // Step 3: Check for duplicate UserTournaments in same group
    var sourceUTs = await UserTournament.find({ "user.id": sourceId });
    var targetUTs = await UserTournament.find({ "user.id": targetId });

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
    for (var i = 0; i < toDelete.length; i++) {
      var ut = toDelete[i];
      var urIds = ut.userRounds || [];
      var rounds = await UserRound.find({ _id: { $in: urIds } });
      var umpIds = [];
      (rounds || []).forEach(function (ur) {
        (ur.userMatchPredictions || []).forEach(function (id) {
          umpIds.push(id);
        });
      });
      await UserMatchPrediction.deleteMany({ _id: { $in: umpIds } });
      await UserRound.deleteMany({ _id: { $in: urIds } });
      await TournamentGroup.updateMany(
        { userTournaments: ut._id },
        { $pull: { userTournaments: ut._id } },
      );
      await UserTournament.deleteOne({ _id: ut._id });
    }

    // Step 4-8: Re-point transferable records to target
    var transferIds = toTransfer.map(function (ut) { return ut._id; });

    await Promise.all([
      transferIds.length > 0
        ? UserTournament.updateMany(
            { _id: { $in: transferIds } },
            {
              $set: {
                "user.id": target._id,
                "user.username": target.username,
                "user.firstName": target.firstName,
                "user.lastName": target.lastName,
              },
            },
          )
        : Promise.resolve(),
      // Step 5: Re-point UserRounds
      UserRound.updateMany(
        { "user.id": sourceId },
        { $set: { "user.id": target._id, "user.name": target.firstName } },
      ),
      // Step 6: Re-point UserMatchAggregate picker arrays
      UserMatchAggregate.updateMany(
        { "topTeamPickers.id": sourceId },
        {
          $set: {
            "topTeamPickers.$.id": target._id,
            "topTeamPickers.$.firstName": target.firstName,
          },
        },
      ),
      UserMatchAggregate.updateMany(
        { "bottomTeamPickers.id": sourceId },
        {
          $set: {
            "bottomTeamPickers.$.id": target._id,
            "bottomTeamPickers.$.firstName": target.firstName,
          },
        },
      ),
      // Step 7: Re-point Comments
      Comment.updateMany(
        { "author.id": sourceId },
        {
          $set: {
            "author.id": target._id,
            "author.username": target.username,
            "author.firstName": target.firstName,
          },
        },
      ),
      // Step 8: Re-point TournamentGroup commissioner
      TournamentGroup.updateMany(
        { "commissioner.id": sourceId },
        {
          $set: {
            "commissioner.id": target._id,
            "commissioner.name": target.firstName,
          },
        },
      ),
      // Step 8b: Re-point Feedback
      Feedback.updateMany(
        { "author.id": sourceId },
        {
          $set: {
            "author.id": target._id,
            "author.username": target.username,
            "author.firstName": target.firstName,
            "author.lastName": target.lastName,
          },
        },
      ),
      // Step 8c: Re-point FamilyMember
      (async function () {
        await FamilyMember.updateMany(
          { user: sourceId },
          { $set: { user: target._id } },
        );
        // Update target's familyTreeId if source had a family member
        var fm = await FamilyMember.findOne({ user: target._id });
        if (fm) {
          target.familyTreeId = fm._id;
          await target.save();
        }
      })(),
    ]);

    // Step 9: Clean up orphaned source trophies (duplicate years that weren't transferred)
    var orphanedTrophyIds = source.trophies
      .filter(function (t) { return targetTrophyKeys[t.year]; })
      .map(function (t) { return t._id || t; });
    await Trophy.deleteMany({ _id: { $in: orphanedTrophyIds } });

    // Step 10: Delete source user
    await User.deleteOne({ _id: sourceId });

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
  } catch (err) {
    console.log(err);
    req.flash("error", "Error during merge.");
    res.redirect("/admin/merge");
  }
});

module.exports = router;
