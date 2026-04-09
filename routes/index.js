var express = require("express");
var router = express.Router();
var passport = require("passport");
var middleware = require("../middleware");
var User = require("../models/user");
var TournamentStanding = require("../models/tournamentStanding");
var Trophy = require("../models/trophy");
var crypto = require("crypto");
var TeamImage = require("../models/teamImage");
var emailHelper = require("../middleware/emailHelper");
var FamilyMember = require("../models/familyMember");
var FamilyRelationship = require("../models/familyRelationship");
// Cloudinary — lazy-load so the app still starts if packages aren't installed
var upload;
try {
  var cloudinaryConfig = require("../config/cloudinary");
  upload = cloudinaryConfig.upload;
} catch (e) {
  console.log("[WARN] Cloudinary packages not installed. Profile photo uploads disabled.");
  upload = { single: function () { return function (req, res, next) { next(); }; } };
}

//Root Route
router.get("/", function (req, res) {
  res.render("landing");
});

router.get("/home", function (req, res) {
  res.render("about/home", { page: "home" });
});

router.get("/rules", function (req, res) {
  res.render("about/rules", { page: "about" });
});

router.get("/history", function (req, res) {
  res.render("about/history", { page: "about" });
});

router.get("/website", function (req, res) {
  res.render("about/website", { page: "about" });
});

router.get("/team-names", async function (req, res) {
  try {
    var foundTeamImages = await TeamImage.find().sort("name");
    res.render("test", { teamImages: foundTeamImages });
  } catch (err) {
    console.log(err);
    req.flash("error", "Something went wrong");
    res.redirect("back");
  }
});

//=============
// Auth Routes
//=============

//show register form
router.get("/register", function (req, res) {
  res.render("register", { page: "register" });
});

//handle sign up logic
router.post("/register", async function (req, res) {
  try {
    // Bot detection: honeypot field, JS token, and timing check
    var formLoadedAt = parseInt(req.body._ts, 10) || 0;
    var isBot =
      req.body.message ||
      req.body._token !== "human" ||
      Date.now() - formLoadedAt < 3000;

    if (isBot) {
      req.flash(
        "error",
        "Nonhuman user detected. Please contact us if you feel that this was in error.",
      );
      return res.redirect("/register");
    }

    var username = req.body.username;
    var firstName = req.body.firstName;
    var lastName = req.body.lastName;
    var email = req.body.email;

    // Check if email is already registered
    var existingUser = await User.findOne({ email: email });
    if (existingUser) {
      req.flash(
        "error",
        "An account with email " + email + " already exists " +
        "(registered to " + existingUser.firstName + " " + existingUser.lastName + "). " +
        "Did you mean to reset your password or recover your username? " +
        "Use the links below the sign up form.",
      );
      return res.redirect("/register");
    }

    var connectionType = (req.body.connectionType || "").trim();
    var connectionName = (req.body.connectionName || "").trim();

    var newUser = new User({
      username: username,
      firstName: firstName,
      lastName: lastName,
      email: email,
    });

    // Save optional family connection info for admin review
    if (connectionType && connectionName) {
      newUser.pendingConnectionType = connectionType;
      newUser.pendingConnectionName = connectionName;
    }

    var user = await User.register(newUser, req.body.password);
    addPastTrophies(user);

    // Auto-link: check if there's an unlinked FamilyMember with matching name
    // (Admin may have pre-created a node for this person before they signed up)
    var matchingMember = await FamilyMember.findOne({
      firstName: new RegExp("^" + user.firstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i"),
      lastName: new RegExp("^" + user.lastName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i"),
      user: { $exists: false },
      approved: true,
    });

    if (matchingMember) {
      matchingMember.user = user._id;
      await matchingMember.save();
      var autoLinkUpdate = { familyTreeId: matchingMember._id };
      if (matchingMember.image) {
        autoLinkUpdate.image = matchingMember.image;
      }
      await User.findByIdAndUpdate(user._id, { $set: autoLinkUpdate });
      console.log("[FAMILY TREE] Auto-linked new user " + user.firstName + " " + user.lastName + " to existing family member node");
    }

    //once the user is registered, log them in
    passport.authenticate("local")(req, res, function () {
      var welcomeMsg = "Welcome to McNaughton Madness, " + user.firstName + "!";
      if (matchingMember) {
        welcomeMsg += " We found your spot on the family tree!";
      }
      req.flash("success", welcomeMsg);
      res.redirect("/users/" + user.username);
    });
  } catch (err) {
    console.log(err);
    req.flash("error", err.message || "Something went wrong");
    res.redirect("/register");
  }
});

//show login form
router.get("/login", function (req, res) {
  res.render("login", { page: "login" });
});

//handle login logic
//use passport.authenticate middleware to login
//from the line in app.js: passport.use(new LocalStrategy(User.authenticate()));
router.post(
  "/login",
  passport.authenticate("local", {
    successReturnToOrRedirect: "/profile",
    failureRedirect: "/login",
    failureFlash: true,
    successFlash: "Welcome back to McNaughton Madness!",
  }),
  function (req, res) {
    delete req.session.returnTo;
  },
);

//Used with login post route to send user directly to their profile page upon login
router.get("/profile", middleware.isLoggedIn, function (req, res) {
  res.redirect("/users/" + req.user.username); // get the user out of session and pass to template
});

//logout route
router.get("/logout", function (req, res) {
  req.logout();
  req.flash("success", "Logged you out!");
  res.redirect("/login");
});

//INDEX - show all users
router.get("/users", async function (req, res) {
  try {
    var allUsers = await User.find({})
      .populate("trophies")
      .sort({ lastName: 1, firstName: 1 });
    res.render("users/index", {
      users: allUsers,
      page: "users",
      currentYear: new Date().getFullYear(),
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Something went wrong");
    res.redirect("back");
  }
});

router.get("/users/:username", async function (req, res) {
  try {
    var username = req.params.username;

    var foundUser = await User.findOne({ username: username })
      .populate("trophies");
    if (!foundUser) {
      req.flash("error", "User not found");
      return res.redirect("/users");
    }
    foundUser.trophies.sort(compare);
    if (req.user && req.user.username === foundUser.username)
      res.render("users/show", {
        user: foundUser,
        isUser: true,
        page: "profile",
      });
    else
      res.render("users/show", {
        user: foundUser,
        isUser: false,
        page: "users",
      });
  } catch (err) {
    console.log(err);
    req.flash("error", "Something went wrong");
    res.redirect("back");
  }
});

// ─── Edit Profile ──────────────────────────────────────────────────────────

router.get("/users/:username/edit", middleware.isLoggedIn, async function (req, res) {
  try {
    if (req.user.username !== req.params.username) {
      req.flash("error", "You can only edit your own profile.");
      return res.redirect("/users/" + req.params.username);
    }

    var userFamilyId = req.user.familyTreeId ? req.user.familyTreeId.toString() : null;

    if (userFamilyId) {
      var rels = await FamilyRelationship.find({
        $or: [{ from: req.user.familyTreeId }, { to: req.user.familyTreeId }],
      }).populate("from to");

      var myPartnerRels = rels.filter(function (r) {
        return ["spouse", "fiance", "dating"].indexOf(r.type) !== -1;
      });

      res.render("users/edit", {
        user: req.user,
        page: "profile",
        myRelationships: myPartnerRels,
        userFamilyId: userFamilyId,
      });
    } else {
      res.render("users/edit", {
        user: req.user,
        page: "profile",
        myRelationships: [],
        userFamilyId: null,
      });
    }
  } catch (err) {
    console.log(err);
    req.flash("error", "Something went wrong");
    res.redirect("back");
  }
});

router.put("/users/:username", middleware.isLoggedIn, async function (req, res) {
  try {
    if (req.user.username !== req.params.username) {
      req.flash("error", "You can only edit your own profile.");
      return res.redirect("/users/" + req.params.username);
    }

    var user = await User.findById(req.user._id);
    if (!user) {
      req.flash("error", "User not found.");
      return res.redirect("/users/" + req.params.username);
    }

    var newEmail = (req.body.email || "").trim();
    var requestedFirstName = (req.body.firstName || "").trim();
    var requestedLastName = (req.body.lastName || "").trim();

    // Update email immediately (not visible to other players)
    var emailChanged = newEmail && newEmail !== user.email;
    if (emailChanged) {
      user.email = newEmail;
    }

    // Name changes require admin approval
    var nameChanged =
      (requestedFirstName && requestedFirstName !== user.firstName) ||
      (requestedLastName && requestedLastName !== user.lastName);

    if (nameChanged) {
      user.pendingFirstName = requestedFirstName || user.firstName;
      user.pendingLastName = requestedLastName || user.lastName;
      user.nameChangeRequestedAt = new Date();
    }

    await user.save();

    var messages = [];
    if (emailChanged) messages.push("Email updated!");
    if (nameChanged) {
      emailHelper.sendNameChangeNotification(user);
      messages.push("Name change request submitted for admin approval.");
    }

    req.flash("success", messages.length > 0 ? messages.join(" ") : "No changes detected.");
    res.redirect("/users/" + req.params.username);
  } catch (err) {
    console.log(err);
    req.flash("error", "Something went wrong");
    res.redirect("back");
  }
});

// ─── Profile Photo Upload ──────────────────────────────────────────────────

router.post("/users/:username/photo", middleware.isLoggedIn, upload.single("image"), async function (req, res) {
  try {
    if (req.user.username !== req.params.username) {
      req.flash("error", "You can only edit your own profile.");
      return res.redirect("/users/" + req.params.username);
    }

    if (!req.file) {
      req.flash("error", "No image selected.");
      return res.redirect("/users/" + req.params.username + "/edit");
    }

    var user = await User.findById(req.user._id);
    if (!user) {
      req.flash("error", "User not found.");
      return res.redirect("/users/" + req.params.username + "/edit");
    }

    user.image = req.file.path;
    await user.save();

    // Also update FamilyMember image if linked
    if (user.familyTreeId) {
      var FamilyMember = require("../models/familyMember");
      await FamilyMember.findByIdAndUpdate(
        user.familyTreeId,
        { $set: { image: req.file.path } },
      );
    }

    req.flash("success", "Profile photo updated!");
    res.redirect("/users/" + req.params.username + "/edit");
  } catch (err) {
    console.log(err);
    req.flash("error", "Something went wrong");
    res.redirect("back");
  }
});

router.get("/forgotPassword", function (req, res) {
  res.render("forgotPassword", { user: req.user, page: "login" });
});

// http://sahatyalkabov.com/how-to-implement-password-reset-in-nodejs/
router.post("/forgotPassword", async function (req, res) {
  try {
    var buf = crypto.randomBytes(20);
    var token = buf.toString("hex");

    var user = await User.findOne({
      email: req.body.email,
      firstName: req.body.firstName,
      lastName: req.body.lastName,
    });
    if (!user) {
      req.flash(
        "error",
        "No account with that name/email address combination exists.",
      );
      return res.redirect("/forgotPassword");
    }

    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

    await user.save();

    emailHelper.sendPasswordRecovery(req, token, user);
    res.redirect("/forgotPassword");
  } catch (err) {
    console.log(err);
    req.flash("error", "Something went wrong");
    res.redirect("back");
  }
});

router.get("/forgotUsername", function (req, res) {
  res.render("forgotUsername", { user: req.user, page: "login" });
});

router.post("/forgotUsername", async function (req, res) {
  try {
    var user = await User.findOne({
      email: req.body.email,
      firstName: req.body.firstName,
      lastName: req.body.lastName,
    });
    if (!user) {
      req.flash(
        "error",
        "No account with that name/email address combination exists.",
      );
      return res.redirect("/forgotUsername");
    }
    emailHelper.sendUsernameRecovery(req, user);
    res.redirect("/login");
  } catch (err) {
    console.log(err);
    req.flash("error", "Something went wrong");
    res.redirect("back");
  }
});

router.get("/reset/:token", async function (req, res) {
  try {
    var user = await User.findOne({
      resetPasswordToken: req.params.token,
      resetPasswordExpires: { $gt: Date.now() },
    });
    if (!user) {
      req.flash("error", "Password reset token is invalid or has expired.");
      return res.redirect("/forgotPassword");
    }
    res.render("reset", {
      user: req.user,
      token: req.params.token,
      page: "login",
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Something went wrong");
    res.redirect("back");
  }
});

router.post("/reset/:token", async function (req, res) {
  try {
    var user = await User.findOne({
      resetPasswordToken: req.params.token,
      resetPasswordExpires: { $gt: Date.now() },
    });
    if (!user) {
      req.flash(
        "error",
        "Password reset token is invalid or has expired.",
      );
      return res.redirect("back");
    }

    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.setPassword(req.body.password);
    await user.save();
    await new Promise(function (resolve, reject) {
      req.logIn(user, function (err) {
        if (err) return reject(err);
        resolve();
      });
    });

    emailHelper.confirmPasswordChange(req, user);
    res.redirect("/users/" + req.user.username);
  } catch (err) {
    console.log(err);
    req.flash("error", "Something went wrong");
    res.redirect("back");
  }
});

//order trophies from newest year
function compare(a, b) {
  if (a.year > b.year) return -1;
  else if (a.year < b.year) return 1;
  return 0;
}

var addPastTrophies = async function (user) {
  try {
    //find tournaments the user has participated in
    var tournamentYears = await TournamentStanding.find({
      "standings.firstName": user.firstName,
      "standings.lastName": user.lastName,
    });

    //for each tournament year, add the correct trophy
    for (var i = 0; i < tournamentYears.length; i++) {
      var tournamentYear = tournamentYears[i];
      var noTournamentEntryFoundScore = -10000;

      var year = tournamentYear.year;
      var totalPlayers = tournamentYear.standings.length;
      var rank = 1;
      var score = noTournamentEntryFoundScore;

      //find the user's score for this year
      tournamentYear.standings.forEach(function (entry) {
        if (
          entry.firstName === user.firstName &&
          entry.lastName === user.lastName
        ) {
          score = entry.score;
        }
      });
      //calculate the user's rank by counting how many players scored higher
      tournamentYear.standings.forEach(function (entry) {
        if (entry.score > score) {
          rank++;
        }
      });

      // Ticket MNM-61 (All Gold Trophies)
      if (score != noTournamentEntryFoundScore) {
        var newTrophy = {
          year: year,
          userRank: rank,
          totalPlayers: totalPlayers,
          score: score,
        };
        var trophy = await Trophy.create(newTrophy);
        user.trophies.addToSet(trophy._id);
        await user.save();
      }
    }
  } catch (err) {
    console.log(err);
  }
};

module.exports = router;
