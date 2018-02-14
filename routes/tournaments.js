var express = require("express");
var router = express.Router();
var async = require("async");
var middleware = require("../middleware");
var Tournament = require("../models/tournament");
var Round = require("../models/round");
var Match = require("../models/match");
var Team = require("../models/team");

//Page:  /tournaments

//INDEX - show all Tournaments
router.get("/", function(req, res) {
    //get all tournaments from db
    Tournament.find({}, function(err, allTournaments) {
        if(err) {
            console.log(err)
        } else {
            res.render("tournaments/index", {tournaments: allTournaments, page: "tournaments"});        //rename the page when I do the navbar
        }
    });
});

// middleware.isLoggedIn, 
//NEW - show form to create new tournament 
router.get("/new", function(req, res) {
    res.render("tournaments/new");
});

// middleware.isLoggedIn, 
//CREATE -
router.post("/", function(req, res) {
    // var regions = ["East", "West", "Midwest", "South"];
    var regions = req.body.regions;
    var year = req.body.year;
    var teamNames = req.body.teams;
    console.log(req.body.teams);
    // teamNames sample data below
    var order = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15];
    // var numRounds = Math.log(teamNames.length)/Math.log(2); //the number of rounds needed for a 64 team tournament is logbase2(64) = 6
    
    Tournament.create(
        {
            year: year,
            numTeams: teamNames.length,
            rounds: []
        }, function (err, createdTournament) {
            if(err) console.log(err);
            else {
                Round.create(
                {
                    numRound: 1,
                    matches: []
                }, function(err, createdRound){
                    if(err) console.log(err);
                    else {
                        var teams = [];
                        async.series([
                            
                            //==========================================================
                            // 1) Use teamNames and order to create array of teams
                            //==========================================================
                            function(callback) {
                                var i = 0;
                                
                                async.forEachSeries(teamNames, function(teamName, next){
                                    var team = {
                                        region: regions[Math.floor(i / order.length)],
                                        name: teamName,
                                        seed: order[i % order.length],
                                    }
                                    Team.create(team, function(err, newTeam){
                                        if(err) console.log(err);
                                        else {
                                            teams.push(newTeam);
                                            i++;
                                            next();
                                        }
                                    })
                                }, function(err) {
                                    if (err) console.log(err);
                                    else{
                                        callback();
                                    }
                                });
                            },
                            //==========================================================
                            // 2) Create and fill match teams from teams array
                            //==========================================================
                            function(callback) {
                                var i = 1;
                                async.forEachSeries(teams, function(team, next){
                                    if (i % 2 === 1) {
                                        Match.create({
                                            matchNumber: i,
                                            teams: [],
                                            nextMatch: Math.floor(0.5*(i + teams.length + 1))
                                        }, function(err, newMatch){
                                            if (err) console.log(err);
                                            else {
                                                newMatch.teams.push(team);
                                                createdRound.matches.push(newMatch);
                                                i++;
                                                next();
                                            }
                                        })
                                    }
                                    else {
                                        var location = Math.floor((i-1)/2);
                                        
                                        createdRound.matches[location].teams.push(team);
                                        
                                        //createdRound.matches[location].save();
                                        i++;
                                        next();
                                    }
                                }, 
                                function(err) {
                                    if (err) console.log(err);
                                    else {
                                        createdTournament.rounds.push(createdRound);
                                        callback();
                                    }
                                })
                            },
                            // function(callback) {
                                
                            //         createdTournament.rounds[0].matches.forEach(function(match) {
                            //             console.log(match.teams[0].seed + ") " + match.teams[0].name);
                            //             console.log(match.teams[1].seed + ") " + match.teams[1].name);
                                        
                            //         })
                            //         callback();
                                
                            // }
                        ], function(err) { 
                            if(err) console.log(err);
                            res.redirect("/tournaments");
                        });
                    }
                })
            }
        }
    )
});    
    
    

//Note: this must be below the /tournaments/new route
//SHOW - shows more information about a particular tournament
router.get("/:id", function(req, res){
   //find the campground with provided ID, populate the comments array
    Campground.findById(req.params.id).populate("comments").exec(function(err, foundCampground) {
        if(err || !foundCampground) {
            req.flash("error", "Campground not found");
            res.redirect("back");
        } else {
            //render the show template with that campground
            res.render("campgrounds/show", {campground: foundCampground});
        }
    });
});

//EDIT Tournament Route
router.get("/:id/edit", middleware.checkCampgroundOwnership, function(req, res){
    Campground.findById(req.params.id, function(err, foundCampground){
        res.render("campgrounds/edit", {campground: foundCampground});
    });
});

// UPDATE Tournament Route
router.put("/:id", middleware.checkCampgroundOwnership, function(req, res) {
   //find and update the correct campground
   // Campground.findByIdAndUpdate(id, newData, callback)
   Campground.findByIdAndUpdate(req.params.id, req.body.campground, function(err, updatedCampground){
       if(err){
           res.redirect("/campgrounds");
       } else {
            res.redirect("/campgrounds/" + req.params.id);     
       }
   });
});

//DESTROY Tournament Route
router.delete("/:id", middleware.checkCampgroundOwnership, function(req, res){
   Campground.findByIdAndRemove(req.params.id, function(err){
      if(err){
          res.redirect("/campgrounds");
      } else {
          req.flash("success", "Campground deleted");
          res.redirect("/campgrounds");
      }
   });
});


var teamNames = [
        "Villanova",
        "Mount St Mary's",
        "Wisconsin",
        "Virginia Tech",
        "Virginia",
        "UNC Wilmington",
        "Florida",
        "East Tennessee State",
        "SMU",
        "USC",
        "Baylor",
        "New Mexico State",
        "South Carolina",
        "Marquette",
        "Duke",
        "Troy",
        
        "Gonzaga",
        "South Dakota State",
        "Northwestern",
        "Vanderbilt",
        "Notre Dame",
        "Princeton",
        "West Virginia",
        "Bucknell",
        "Maryland",
        "Xavier",
        "Florida State",
        "Florida Gulf Coast",
        "Saint Mary's",
        "VCU",
        "Arizona",
        "North Dakota",
        
        "Kansas",
        "UC Davis", 
        "Miami",
        "Michigan State",
        "Iowa State",
        "Nevada",
        "Purdue",
        "Vermont",
        "Oregon",
        "Iona",
        "Creighton",
        "Rhode Island",
        "Michigan",
        "Oklahoma State",
        "Louisville",
        "Jacksonville State",
        
        "North Carolina",
        "Texas Southern",
        "Arkansas",
        "Seton Hall",
        "Minnesota",
        "Middle Tennessee",
        "Butler",
        "Winthrop",
        "Cincinnati",
        "Kansas State",
        "UCLA",
        "Kent State",
        "Dayton",
        "Wichita State",
        "Kentucky",
        "Northern Kentucky"
    ];



module.exports = router;