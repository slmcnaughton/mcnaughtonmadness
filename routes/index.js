var express = require("express");
var router = express.Router();
var passport = require("passport");
var middleware = require("../middleware");
var async = require("async");
var User = require("../models/user");
var TournamentStanding = require("../models/tournamentStanding");
var Trophy = require("../models/trophy");
var crypto = require('crypto');
var TeamImage = require('../models/teamImage');
const sgMail = require('@sendgrid/mail');

//Root Route
router.get("/", function(req, res) {
   res.render("landing");
});

router.get("/home", function(req, res) {
    res.render("about/home", {page: "home"});
});

router.get("/rules", function(req, res) {
    res.render("about/rules", {page: "about"});
});

router.get("/history", function(req, res) {
    res.render("about/history", {page: "about"});
});

router.get("/website", function(req, res) {
    res.render("about/website", {page: "about"});
});


router.get("/test", function(req, res) {
    TeamImage.find().sort("name").exec(function(err, foundTeamImages) {
        // foundTeamImages.forEach(function(foundTeamImage) {
        //     console.log(foundTeamImage.name + " " + foundTeamImage.image);
        // });
        
        
        res.render("test", {teamImages: foundTeamImages});
    });
    
})


//=============
// Auth Routes
//=============

//show register form
router.get("/register", function(req, res){
    
   res.render("register", {page: "register"}); 
});

//handle sign up logic
router.post("/register", function(req, res){
    var username = req.body.username;
    var firstName = req.body.firstName;
    var lastName = req.body.lastName;
    var newUser = new User( 
        {
            username: username,
            firstName: firstName,
            lastName: lastName,
            image: req.body.image,
            email: req.body.email
        });
   
    User.register(newUser, req.body.password, function(err, user){
        if(err){
            req.flash("error", err.message);
            return res.redirect("/register");
        }
        addPastTrophies(user);
        //once the user is registered, log them in
        passport.authenticate("local")(req, res, function(){
            req.flash("success", "Welcome to McNaughton Madness, " + user.firstName + "!");
            res.redirect("/users/" + user.username);
        });
    });
});

//show login form
router.get("/login", function(req, res){
   res.render("login", {page: "login"}); 
});


//handle login logic
//use passport.authenticate middleware to login 
   //from the line in app.js: passport.use(new LocalStrategy(User.authenticate())); 
router.post("/login", 
    passport.authenticate("local", {
        successReturnToOrRedirect: "/profile",
        failureRedirect: "/login",
        failureFlash: true,
        successFlash: "Welcome back to McNaughton Madness!",
    }), function(req, res) {
        delete req.session.returnTo;
});

//Used with login post route to send user directly to their profile page upon login
router.get('/profile', middleware.isLoggedIn, function(req, res) {
    res.redirect ("/users/" + req.user.username);   // get the user out of session and pass to template
});


//logout route
router.get("/logout", function(req, res){
    req.logout();
    req.flash("success", "Logged you out!");
    res.redirect("/login");
});

//INDEX - show all users
router.get("/users", function(req, res) {
    //get all users from db
    User.find({}, function(err, allUsers) {
        if(err) {
            console.log(err);
        } else {
            res.render("users/index", {users: allUsers, page: "users"});
        }
    });
});


router.get("/users/:username", function(req, res) {
    
    var username = req.params.username;
    
    User.findOne( {username: username}).populate("trophies").exec(function(err, foundUser){
        if (err || !foundUser){
            req.flash("error", "User not found");
            return res.redirect("/users");
        } else {
            foundUser.trophies.sort(compare);
            if (req.user && req.user.username === foundUser.username)
                res.render("users/show", {user: foundUser, isUser: true, page: "profile"});
            else
                res.render("users/show", {user: foundUser, isUser: false, page: "users"});
        }
        
    });
});

router.get('/forgot', function(req, res) {
    res.render('forgot', { user: req.user, page: "login"});
});

// http://sahatyalkabov.com/how-to-implement-password-reset-in-nodejs/
router.post('/forgot', function(req, res, next) {
    async.waterfall([
        function(done) {
            crypto.randomBytes(20, function(err, buf) {
                var token = buf.toString('hex');
                done(err, token);
            });
        },
        function(token, done) {
            User.findOne({ email: req.body.email }, function(err, user) {
                if (err || !user) {
                    req.flash('error', 'No account with that email address exists.');
                    return res.redirect('/forgot');
                }
        
                user.resetPasswordToken = token;
                user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
        
                user.save(function(err) {
                    done(err, token, user);
                });
            });
        },
        function(token, user, done) {
            sgMail.setApiKey(process.env.SENDGRID_API_KEY);
                var mailOptions = {
                to: user.email,
                from: 'no-reply@mcnaughtonmadness.com',
                subject: 'McNaughton Madness Password Reset',
                text: 'Hello ' + user.firstName + ',\n\n' + 'You are receiving this because you have requested the reset of the password for your McNaughton Madness account.\n\n' +
                  'Please click the following link, or paste this into your browser to complete the process:\n\n' +
                  'http://' + req.headers.host + '/reset/' + token + '\n\n' +
                  'If you did not request this, please ignore this email and your password will remain unchanged.\n'
            };
            sgMail.send(mailOptions, function(err) {
                req.flash('info', 'An e-mail has been sent to ' + user.email + ' with further instructions (you may need to check your spam folder!)');
                done(err, 'done');
            });
        }
    ], function(err) {
        if (err) return next(err);
        res.redirect('/forgot');
    });
});


router.get('/reset/:token', function(req, res) {

    User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }, function(err, user) {
        if (err || !user) {
            req.flash('error', 'Password reset token is invalid or has expired.');
            return res.redirect('/forgot');
        }
        res.render('reset', {user: req.user, token: req.params.token, page: "login"});
    });
});

router.post('/reset/:token', function(req, res) {
    async.waterfall([
        function(done) {
            User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }, function(err, user) {
                if (err || !user) {
                    req.flash('error', 'Password reset token is invalid or has expired.');
                    return res.redirect('back');
                }
                
                user.password = req.body.password;
                user.resetPasswordToken = undefined;
                user.resetPasswordExpires = undefined;
                
                user.save(function(err) {
                    if (err) console.log(err);
                    req.logIn(user, function(err) {
                        done(err, user);
                    });
                });
            });
        },
        function(user, done) {
            sgMail.setApiKey(process.env.SENDGRID_API_KEY);
            var mailOptions = {
                to: user.email,
                from: 'no-reply@mcnaughtonmadness.com',
                subject: 'Your password has been changed',
                text: 'Hello ' + user.firstName + ',\n\n' +
                'This is a confirmation that the password for your McNaughton Madness account ' + user.email + ' has just been changed.\n'
            };
            sgMail.send(mailOptions, function(err) {
                req.flash('success', 'Success! Your password has been changed.');
                done(err);
            });
        }
    ], function(err) {
        if (err) console.log(err);
        res.redirect("/users/" + req.user.username);
    });
});



//order trophies from newest year
function compare(a,b) {
    if (a.year > b.year)
        return -1;
    else if (a.year < b.year)
        return 1;
    return 0;
}

var addPastTrophies = function(user){
    //find tournaments the user has participated in
    TournamentStanding.find({"standings.firstName" : user.firstName, "standings.lastName" : user.lastName}).exec(function(err, tournamentYears) {
        if (err) {
            console.log(err);
        } else {
            //for each tournament year, add the correct trophy
            async.forEachSeries(tournamentYears, function(tournamentYear, callback) {
                var year = tournamentYear.year; 
                var totalPlayers = tournamentYear.standings.length;
                var rank = 1;
                var score;
                
                //find the user's score for this year
                tournamentYear.standings.forEach(function(entry){
                    if(entry.firstName === user.firstName && entry.lastName === user.lastName){
                        score = entry.score;
                    }
                });
                //calculate the user's rank by counting how many players scored higher
                tournamentYear.standings.forEach(function(entry){
                    if(entry.score > score){
                        rank++;
                    }
                });
               
                var newTrophy = {
                        year: year,
                        userRank: rank,
                        totalPlayers: totalPlayers,
                        score: score  
                    };
                Trophy.create(newTrophy, function(err, trophy){
                    if(err){
                        console.log(err);
                    } else {
                        user.trophies.addToSet(trophy._id);
                        user.save(callback);
                    }
                });
            }, function(err){
                if(err) {
                    console.log(err);
                } 
            }); //end of async.forEachSeries
        }
    }); //end of TournamentStanding.find()
};

module.exports = router;