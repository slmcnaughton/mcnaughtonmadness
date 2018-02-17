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
    
    // var year = 2017;
    var regions = ["East", "West", "Midwest", "South"];
    var year = Math.floor((Math.random()*100+2000));
    // var year = 2000;
    //   teamNames sample data below
     
    // var regions = req.body.regions;
    // var year = req.body.year;
    // var teamNames = req.body.teams;
    // console.log(req.body.teams);
   
    var order = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15];
    var numRounds = Math.log(teamNames.length)/Math.log(2); //the number of rounds needed for a 64 team tournament is logbase2(64) = 6
    // var numRounds = 20;
    
   Tournament.create(
        {
            year: year,
            numTeams: teamNames.length,
            rounds: []
        }, function (err, createdTournament) {
            if(err) console.log(err);
            else {
                // ====================================================
                // Parallel:
                //      1) Steps 1 & 2: Create Round 1, Matches, and Teams
                //      2) Steps 3 % 4: Create remaining (5) rounds and matches
                // Afterwards: Save Tournament to database
                async.parallel([
                    //PART 1)
                    function(callback){
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
                                    // 1) Use array of teamNames and order of seeds to create array of teams
                                    //==========================================================
                                    function(callback) {
                                        var i = 0;
                                        
                                        async.forEachSeries(teamNames, function(teamName, next){
                                            var team = {
                                                region: regions[Math.floor(i / order.length)],
                                                name: teamName,
                                                seed: order[i % order.length],
                                            };
                                            Team.create(team, function(err, newTeam){
                                                if(err) console.log(err);
                                                else {
                                                    teams.push(newTeam);
                                                    i++;
                                                    next();
                                                }
                                            });
                                        }, function(err) {
                                            if (err) console.log(err);
                                            else callback();
                                        });
                                    },
                                    //==========================================================
                                    // 2) Create and fill matches with teams array
                                    //==========================================================
                                    function(callback) {
                                        var i = 1;
                                        async.forEachSeries(teams, function(team, next){
                                            if (i % 2 === 1) {
                                                var matchNumber =  Math.floor((i-1)/2) + 1;
                                                Match.create({
                                                    matchNumber: matchNumber,
                                                    teams: [],
                                                    nextMatch: Math.floor(0.5*(matchNumber + teams.length + 1))
                                                }, function(err, newMatch){
                                                    if (err) console.log(err);
                                                    else {
                                                        newMatch.teams.push(team);
                                                        createdRound.matches.addToSet(newMatch);
                                                        createdRound.save();
                                                        i++;
                                                        next();
                                                    }
                                                });
                                            }
                                            else {
                                                var location = Math.floor((i-1)/2);
                                                createdRound.matches[location].teams.push(team);
                                                createdRound.matches[location].save();
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
                                        });
                                    },
                                ],  function(err) { 
                                    if(err) console.log(err);
                                    else callback();
                                    });
                                }
                            });
                    },
                    //PART 2)
                    function(callback) {
                         async.series([
                            //==========================================================
                            // 3) Create remaining rounds
                            //==========================================================
                             function(callback) {
                                async.timesSeries(numRounds-1, 
                                    function(i, next){
                                        Round.create(
                                        {
                                            numRound: i+2,  //i = 0 should be round 2
                                            matches: []
                                        }, function(err, newRound){
                                            if(err) console.log(err);
                                            else {
                                                createdTournament.rounds.addToSet(newRound);
                                                next();
                                            }
                                        });
                                    },
                                    function(err){
                                        if(err) console.log(err);
                                        else callback();    //finished adding extra rounds
                                    }
                                );
                            },
                            //==========================================================
                            // 4) Create remaining matches with correct matchNumbers and nextMatch references...no teams yet
                            //==========================================================
                            function(callback) {
                                async.forEachSeries(createdTournament.rounds, 
                                    function(round, next){
                                        if (round.numRound !== 1) {
                                            var matchNumStart = Math.pow(2, numRounds)-Math.pow(2, numRounds + 1 - round.numRound) + 1; //1, 33, 49, 57, 61, 63
                                            var matchesThisRound = Math.pow(2, numRounds - round.numRound);
                                            async.timesSeries(matchesThisRound, 
                                                function(j, next){
                                                    Match.create(
                                                    {
                                                        matchNumber: matchNumStart + j,
                                                        teams: [],
                                                        nextMatch: Math.floor(0.5*((matchNumStart + j) + teamNames.length + 1))
                                                    }, function(err, newMatch){
                                                        if (err) console.log(err);
                                                        else {
                                                            round.matches.addToSet(newMatch);
                                                            next();
                                                        }
                                                    });
                                                }, 
                                                function(err) {
                                                    if(err) console.log(err);
                                                    else {
                                                        round.save();
                                                        next(); //go create the next round
                                                    }
                                                }
                                            );
                                        } else {    //we're looking at the is the first round...no need to add blank matches
                                            next();
                                        }
                                    }, 
                                    function(err) {
                                        if (err) console.log(err);
                                        else callback();    //finished adding blank matches
                                    }   
                                );
                            }  
                        ], function (err) {
                            if (err) console.log(err);
                            else callback();    //finished adding the remaining rounds/matches
                        });
                    }
                ], function (err) {
                    if(err) console.log(err);
                    else {  
                        createdTournament.rounds.sort(compare);
                        createdTournament.save();
                        res.redirect("/tournaments");
                    }
                }
            )}
        }
    );
});
    
  


//Note: this must be below the /tournaments/new route
//SHOW - shows more information about a particular tournament
router.get("/:year", function(req, res){
    var year = req.params.year;
    Tournament.findOne({year: year}).populate({
        path: "rounds",
        populate: {
            path: "matches",
            populate: {
                path: "teams",
                }
            }
    }).populate("champion").exec(function(err, foundTournament){
         if (err || !foundTournament){
            req.flash("error", "Tournament not found");
            return res.redirect("/tournaments");
        } else {
            // for(var i = 0; i < foundTournament.rounds[0].matches.length; i++) {
            //     console.log(foundTournament.rounds[0].matches[i]);
            // }
            
            res.render("tournaments/show", {tournament: foundTournament});
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


//order tournament rounds lowest to highest
function compare(a,b) {
    if (a.numRound < b.numRound)
        return -1;
    else if (a.numRound > b.numRound)
        return 1;
    return 0;
}

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