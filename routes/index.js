var express = require("express");
var router = express.Router();
var passport = require("passport");
var middleware = require("../middleware");
var async = require("async");
var User = require("../models/user");
var TournamentStanding = require("../models/tournamentStanding");
var Trophy = require("../models/trophy");
var crypto = require("crypto");
var TeamImage = require("../models/teamImage");
var emailHelper = require("../middleware/emailHelper");

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

router.get("/team-names", function (req, res) {
  TeamImage.find()
    .sort("name")
    .exec(function (err, foundTeamImages) {
      // foundTeamImages.forEach(function(foundTeamImage) {
      //     console.log(foundTeamImage.name + " " + foundTeamImage.image);
      // });

      res.render("test", { teamImages: foundTeamImages });
    });
});

//=============
// Auth Routes
//=============

//show register form
router.get("/register", function (req, res) {
  res.render("register", { page: "register" });
});

//handle sign up logic
router.post("/register", function (req, res) {
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
  User.findOne({ email: email }, function (err, existingUser) {
    if (err) console.log(err);
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

    var newUser = new User({
      username: username,
      firstName: firstName,
      lastName: lastName,
      email: email,
    });

    User.register(newUser, req.body.password, function (err, user) {
      if (err) {
        req.flash("error", err.message);
        return res.redirect("/register");
      }
      addPastTrophies(user);
      //once the user is registered, log them in
      passport.authenticate("local")(req, res, function () {
        req.flash(
          "success",
          "Welcome to McNaughton Madness, " + user.firstName + "!",
        );
        res.redirect("/users/" + user.username);
      });
    });
  });
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
router.get("/users", function (req, res) {
  //get all users from db
  User.find({}, function (err, allUsers) {
    if (err) {
      console.log(err);
    } else {
      res.render("users/index", { users: allUsers, page: "users" });
    }
  });
});

router.get("/users/:username", function (req, res) {
  var username = req.params.username;

  User.findOne({ username: username })
    .populate("trophies")
    .exec(function (err, foundUser) {
      if (err || !foundUser) {
        req.flash("error", "User not found");
        return res.redirect("/users");
      } else {
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
      }
    });
});

// ─── Edit Profile ──────────────────────────────────────────────────────────

router.get("/users/:username/edit", middleware.isLoggedIn, function (req, res) {
  if (req.user.username !== req.params.username) {
    req.flash("error", "You can only edit your own profile.");
    return res.redirect("/users/" + req.params.username);
  }
  res.render("users/edit", { user: req.user, page: "profile" });
});

router.put("/users/:username", middleware.isLoggedIn, function (req, res) {
  if (req.user.username !== req.params.username) {
    req.flash("error", "You can only edit your own profile.");
    return res.redirect("/users/" + req.params.username);
  }

  User.findById(req.user._id, function (err, user) {
    if (err || !user) {
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

    user.save(function (err) {
      if (err) {
        console.log(err);
        req.flash("error", "Error saving profile.");
        return res.redirect("/users/" + req.params.username + "/edit");
      }

      var messages = [];
      if (emailChanged) messages.push("Email updated!");
      if (nameChanged) {
        emailHelper.sendNameChangeNotification(user);
        messages.push("Name change request submitted for admin approval.");
      }

      req.flash("success", messages.length > 0 ? messages.join(" ") : "No changes detected.");
      res.redirect("/users/" + req.params.username);
    });
  });
});

router.get("/forgotPassword", function (req, res) {
  res.render("forgotPassword", { user: req.user, page: "login" });
});

// http://sahatyalkabov.com/how-to-implement-password-reset-in-nodejs/
router.post("/forgotPassword", function (req, res, next) {
  async.waterfall(
    [
      function (done) {
        crypto.randomBytes(20, function (err, buf) {
          var token = buf.toString("hex");
          if (err) console.log(err);
          done(err, token);
        });
      },
      function (token, done) {
        User.findOne(
          {
            email: req.body.email,
            firstName: req.body.firstName,
            lastName: req.body.lastName,
          },
          function (err, user) {
            if (err || !user) {
              req.flash(
                "error",
                "No account with that name/email address combination exists.",
              );
              return res.redirect("/forgotPassword");
            }

            user.resetPasswordToken = token;
            user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

            user.save(function (err) {
              done(err, token, user);
            });
          },
        );
      },
      async function (token, user) {
        emailHelper.sendPasswordRecovery(req, token, user);
      },
    ],
    function (err) {
      if (err) return next(err);
      res.redirect("/forgotPassword");
    },
  );
});

router.get("/forgotUsername", function (req, res) {
  res.render("forgotUsername", { user: req.user, page: "login" });
});

router.post("/forgotUsername", function (req, res, next) {
  User.findOne(
    {
      email: req.body.email,
      firstName: req.body.firstName,
      lastName: req.body.lastName,
    },
    function (err, user) {
      if (err || !user) {
        req.flash(
          "error",
          "No account with that name/email address combination exists.",
        );
        return res.redirect("/forgotUsername");
      } else {
        emailHelper.sendUsernameRecovery(req, user, err);
        if (err) return next(err);
        res.redirect("/login");
      }
    },
  );
});

router.get("/reset/:token", function (req, res) {
  User.findOne(
    {
      resetPasswordToken: req.params.token,
      resetPasswordExpires: { $gt: Date.now() },
    },
    function (err, user) {
      if (err || !user) {
        req.flash("error", "Password reset token is invalid or has expired.");
        return res.redirect("/forgotPassword");
      }
      res.render("reset", {
        user: req.user,
        token: req.params.token,
        page: "login",
      });
    },
  );
});

router.post("/reset/:token", function (req, res) {
  async.waterfall(
    [
      function (done) {
        User.findOne(
          {
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() },
          },
          function (err, user) {
            if (err || !user) {
              req.flash(
                "error",
                "Password reset token is invalid or has expired.",
              );
              return res.redirect("back");
            }

            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
            user.setPassword(req.body.password, function () {
              user.save(function (err) {
                if (err) console.log(err);
                req.logIn(user, function (err) {
                  if (err) console.log(err);
                  done(err, user);
                });
              });
            });
          },
        );
      },

      async function (user) {
        emailHelper.confirmPasswordChange(req, user);
      },
    ],
    function (err) {
      if (err) console.log(err);
      res.redirect("/users/" + req.user.username);
    },
  );
});

//order trophies from newest year
function compare(a, b) {
  if (a.year > b.year) return -1;
  else if (a.year < b.year) return 1;
  return 0;
}

var addPastTrophies = function (user) {
  //find tournaments the user has participated in
  TournamentStanding.find({
    "standings.firstName": user.firstName,
    "standings.lastName": user.lastName,
  }).exec(function (err, tournamentYears) {
    if (err) {
      console.log(err);
    } else {
      //for each tournament year, add the correct trophy
      async.forEachSeries(
        tournamentYears,
        function (tournamentYear, callback) {
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
            Trophy.create(newTrophy, function (err, trophy) {
              if (err) {
                console.log(err);
              } else {
                user.trophies.addToSet(trophy._id);
                user.save(callback);
              }
            });
          }
        },
        function (err) {
          if (err) {
            console.log(err);
          }
        },
      ); //end of async.forEachSeries
    }
  }); //end of TournamentStanding.find()
};

module.exports = router;
