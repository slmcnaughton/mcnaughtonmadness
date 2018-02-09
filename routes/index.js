var express = require("express");
var router = express.Router();
var passport = require("passport");
var async = require("async");
var User = require("../models/user");
var TournamentStanding = require("../models/tournamentStanding");
var Trophy = require("../models/trophy");

//Root Route
router.get("/", function(req, res) {
   res.render("landing");
});


//INDEX - show all campgrounds
router.get("/tournamentStandings", function(req, res) {
    //get all campgrounds from db
    TournamentStanding.find({}, function(err, allTournaments) {
        if(err) {
            console.log(err)
        } else {
            res.render("tournamentStandings/index", {tournaments: allTournaments});
        }
    });
});

//=============
// Auth Routes
//=============

//show register form
router.get("/register", function(req, res){
    
   res.render("register", {page: "register"}); 
});

//handle sign up logic
router.post("/register", function(req, res){
    // var newUser = new User( {username: req.body.username} );
    var newUser = new User( 
        {
            username: req.body.username,
            firstName: req.body.firstName,
            lastName: req.body.lastName,
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
            req.flash("success", "Welcome to McNaughton March Madness " + user.username);
            res.redirect("/users");
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
router.post("/login", passport.authenticate("local", 
    {
        successRedirect: "/users",
        failureRedirect: "/login"
    }), function(req, res){

});

//logout route
router.get("/logout", function(req, res){
    req.logout();
    req.flash("success", "Logged you out!");
    res.redirect("/campgrounds");
});

//INDEX - show all users
router.get("/users", function(req, res) {
    //get all users from db
    User.find({}, function(err, allUsers) {
        if(err) {
            console.log(err)
        } else {
            res.render("users/index", {users: allUsers, page: "users"});
        }
    });
});

//USER PROFILE
router.get("/users/:id", function(req, res) {
    
   User.findById(req.params.id).populate("trophies").exec(function(err, foundUser) {
       if(err){
           req.flash("error", "User not found");
           return res.redirect("/");
       } else {
            // console.log(foundUser.trophies.length);
            // foundUser.trophies = newarr(foundUser.trophies);
            foundUser.trophies.sort(compare);
            // console.log(foundUser.trophies.length);
            res.render("users/show", {user: foundUser});
       }
   })
});

function compare(a,b) {
    if (a.year > b.year)
        return -1;
    else if (a.year < b.year)
        return 1;
    return 0;
}

var newarr = function(arr){
    var map = {};
    var newarr = [];
    for (var i = 0; i < arr.length; i++) {
        var value = arr[i];
        console.log(value.year);
        if (!map[value]) {
            newarr.push(value);
            map[value] = true;
        }
    }
    return newarr;
}


 var addPastTrophies = function(user){
    //find tournaments the user has participated in
    TournamentStanding.find({"standings.firstName" : user.firstName, "standings.lastName" : user.lastName}).exec(function(err, tournamentYears) {
        // console.log(user.firstName + " has participated for " + tournamentYears.length + " years");
        if (err) {
            console.log(err);
        } else {
            
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
                        // console.log("created new trophy " + trophy.year);
                        
                        user.trophies.addToSet(trophy._id);
                        user.save(callback);
                    }
                });
            }, function(err){
                if(err) {
                    console.log(err);
                } else {
                    // console.log("trophies were added");
                }
            } )
            
        };
     });
 }

module.exports = router;