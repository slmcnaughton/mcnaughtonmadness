var express = require("express");
var router = express.Router();
var asyncNpm = require("async");
var moment = require('moment-timezone');
var middleware = require("../middleware");
var Tournament = require("../models/tournament");
var Round = require("../models/round");
var Match = require("../models/match");
var Team = require("../models/team");
var TeamImage = require("../models/teamImage");
var Scrape = require("../models/scrape");
var scrape         = require("../scrape");
var schedule        = require('node-schedule');
var emailHelper = require('../middleware/emailHelper');

//Page:  /tournaments

//INDEX - show all Tournaments
router.get("/", function(req, res) {
    //get all tournaments from db
    Tournament.find({}, function(err, allTournaments) {
        if(err) {
            console.log(err);
        } else {
            res.render("tournaments/index", {tournaments: allTournaments, moment: moment, page: "tournaments"});        //rename the page when I do the navbar
        }
    });
});


//NEW - show form to create new tournament 
router.get("/new", middleware.isLoggedIn, function(req, res) {
    res.render("tournaments/new", {page: "tournaments"});
});

//CREATE -
router.post("/", middleware.isLoggedIn, function(req, res) {
    
    var year = 2023;
    var regions = ["South", "East", "Midwest", "West"];
    // var year = Math.floor((Math.random()*100+2000));
    
    //march month is actually 2
    var startDay = moment.tz([2023, 02, 16], "America/New_York");

    
    //[year, month, day, hour, minute, second, millisecond]
    // console.log(startDay.format("dddd, MMMM Do YYYY, h:mm:ss a"));

    
    //   teamNames sample data below
     
    // var regions = req.body.regions;
    // var year = req.body.year;
    // var teamNames = req.body.teams;
    // console.log(req.body.teams);
   
    var order = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15];
    var numRounds = Math.log(teamNames.length)/Math.log(2); //the number of rounds needed for a 64 team tournament is logbase2(64) = 6
    
   Tournament.create(
        {
            year: year,
            numTeams: teamNames.length,
            rounds: [],
            regions: regions,
            currentRound: 1,
            scrapes: [],
            emailPickReminderJobs: []
        }, function (err, createdTournament) {
            if(err) console.log(err);
            else {
                // ====================================================
                // Parallel:
                //      1) Steps 1 & 2: Create Round 1, Matches, and Teams
                //      2) Steps 3 & 4: Create remaining (5) rounds and matches
                // Afterwards: Save Tournament to database
                asyncNpm.parallel([
                    //PART 1) 
                    function(callback){
                        Round.create(
                        {
                            numRound: 1,
                            matches: [],
                            startTime: moment.tz([startDay.year(), startDay.month(), startDay.date(), 12, 15], "America/New_York"),

                        }, function(err, createdRound){
                            if(err) console.log(err);
                            else {
                                //Schedule email reminders for the round
                                var emailSendTime = moment(createdRound.startTime).add({hours: -3});
                                var k = schedule.scheduleJob(emailSendTime, 
                                    emailHelper.sendPickReminderEmail);
                                Scrape.create( {date: emailSendTime}, function(err, createdJob) {
                                    if (err) console.log(err);
                                    else {
                                        createdTournament.emailPickReminderJobs.push(createdJob);
                                    }
                                });
                                
                                //Add two days of round 1 scrape listener
                                // console.log("Round 1 begins at " + createdRound.startTime.format('LLLL'));
                                for(var i = 0; i < 2; i++) {
                                    var startTime = new moment(createdRound.startTime).add({'d': i, 'h' : 1, 'm': 30});
                                    var endTime = new moment(startTime).add(13, 'h');
                                    var job = { start: startTime, end: endTime, rule: '0 */1 * * * *' };
                                    var j = schedule.scheduleJob(job, function(){
                                        scrape();
                                    });
                                    Scrape.create( job, function(err, createdJob) {
                                        if(err) console.log(err);
                                        createdTournament.scrapes.push(createdJob);
                                    });
                                }
                               
                                var teams = [];
                                asyncNpm.series([
                                    
                                    //==========================================================
                                    // 1) Use array of teamNames and order of seeds to create array of teams
                                    //==========================================================
                                    function(callback) {
                                        var i = 0;
                                        
                                        asyncNpm.forEachSeries(teamNames, function(teamName, next){
                                            
                                            TeamImage.findOne({name: teamName}).exec(function(err, foundTeamImage) {
                                                if(err) console.log(err);
                                                var image;
                                                if(foundTeamImage) {
                                                    image = foundTeamImage.image;
                                                }
                                                var team = {
                                                    region: regions[Math.floor(i / order.length)],
                                                    name: teamName,
                                                    seed: order[i % order.length],
                                                    firstMatchNum: Math.floor(i / 2) + 1,
                                                    image: image,
                                                    lost: 0
                                                };
                                                Team.create(team, function(err, newTeam){
                                                    if(err) console.log(err);
                                                    else {
                                                        teams.push(newTeam);
                                                        i++;
                                                        next();
                                                    }
                                                });
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
                                        asyncNpm.eachSeries(teams, function(team, next){
                                            if (i % 2 === 1) {
                                                var matchNumber =  Math.floor((i-1)/2) + 1;
                                                Match.create({
                                                    matchNumber: matchNumber,
                                                    topTeam: team,
                                                    bottomTeam: null,
                                                    nextMatch: Math.floor(0.5*(matchNumber + teams.length + 1))
                                                }, function(err, newMatch){
                                                    if (err) console.log(err);
                                                    else {
                                                        createdRound.matches.addToSet(newMatch);
                                                        
                                                        // createdRound.save();
                                                        i++;
                                                        next();
                                                    }
                                                });
                                            }
                                            else {
                                                var location = Math.floor((i-1)/2);
                                                createdRound.matches[location].bottomTeam = team;
                                                
                                                createdRound.matches[location].save();
                                                i++;
                                                next();
                                            }
                                        }, 
                                        function(err) {
                                            if (err) console.log(err);
                                            else {
                                                createdTournament.rounds.push(createdRound);
                                                createdRound.save();
                                                callback();
                                            }
                                        });
                                    },
                                ],  function(err) { 
                                    if(err) console.log(err);
                                    callback();
                                    });
                                }
                            });
                    },
                    //PART 2)
                    function(callback) {
                         asyncNpm.series([
                            //==========================================================
                            // 3) Create remaining rounds
                            //==========================================================
                             function(callback) {
                                asyncNpm.timesSeries(numRounds-1, 
                                    function(i, next){
                                        var startTime;
                                                            // year         month           day      hour  min
                                        // Regular Year (2021 had a weird schedule)                    
                                        if(i == 0)
                                            startTime = moment(startDay).add({days: 2, hours: 12, minutes: 10}, "America/New_York");
                                        else if (i == 1)
                                            startTime = moment(startDay).add({days: 7, hours: 19, minutes: 9}, "America/New_York");
                                        else if (i == 2)
                                            startTime = moment(startDay).add({days: 9, hours: 18, minutes: 9}, "America/New_York");
                                        else if (i == 3)
                                            startTime = moment(startDay).add({days: 16, hours: 18, minutes: 9}, "America/New_York");
                                        else if (i == 4)
                                            startTime = moment(startDay).add({days: 18, hours: 21, minutes: 20}, "America/New_York");

                                        // 2021 Shfited Dates/Times
                                        // if(i == 0)  // Second Round
                                        //     startTime =  moment.tz([2021, 02, 21, 12, 0], "America/New_York");
                                        //     // startTime = moment(startDay).add({days: 2, hours: 12, minutes: 10}, "America/New_York");
                                        // else if (i == 1) //Sweet 16
                                        //     startTime =  moment.tz([2021, 02, 27, 14, 0], "America/New_York");
                                        //     // startTime = moment(startDay).add({days: 8, hours: 14, minutes: 9}, "America/New_York");
                                        // else if (i == 2) //Elite Eight
                                        //     startTime =  moment.tz([2021, 02, 29, 19, 0], "America/New_York");
                                        //     // startTime = moment(startDay).add({days: 10, hours: 19, minutes: 9}, "America/New_York");
                                        // else if (i == 3) //Final Four -  5 p.m. start on Saturday, April 3
                                        //     startTime =  moment.tz([2021, 03, 03, 18, 0], "America/New_York");
                                        //     // startTime = moment(startDay).add({days: 15, hours: 18, minutes: 0}, "America/New_York");
                                        // else if (i == 4) //NCAA Championship Game
                                        //     startTime =  moment.tz([2021, 03, 05, 21, 0], "America/New_York");
                                        //     // startTime = moment(startDay).add({days: 17, hours: 21, minutes: 0}, "America/New_York");
                                            
                                        
                                        Round.create(
                                        {
                                            numRound: i+2,  //i = 0 should be round 2
                                            matches: [],
                                            startTime: startTime
                                        }, function(err, createdRound){
                                            if(err) console.log(err);
                                            else {
                                                //Schedule email reminders for the round
                                                var emailSendTime = moment(createdRound.startTime).add({hours: -3});
                                                var k = schedule.scheduleJob(emailSendTime, 
                                                    emailHelper.sendPickReminderEmail);
                                                Scrape.create( {date: emailSendTime}, function(err, createdJob) {
                                                    if (err) console.log(err);
                                                    else {
                                                        createdTournament.emailPickReminderJobs.push(createdJob);
                                                    }
                                                });
                                                
                                                //Add round scrape listeners
                                                asyncNpm.series([
                                                    function(callback) {
                                                        // console.log("Round " + createdRound.numRound + " begins at " + createdRound.startTime.format('LLLL'));
                                                        for(var j = 0; j < 2; j++) {
                                                            var startTime;
                                                            if( (i === 1 || i === 2) && j === 1)  //Second day of Sweet 16/Elite 8 starts an hour earlier than day 1
                                                                startTime = new moment(createdRound.startTime).add({'d': 1, 'h': 00, 'm': 00});
                                                            else 
                                                                startTime = new moment(createdRound.startTime).add({'d': j, 'h' : 1, 'm': 00});
                                                                
                                                            var endTime;
                                                            if(i === 0 ) {  //Round 2
                                                                endTime = new moment(startTime).add(13, 'h');
                                                            }
                                                            else if (i < 3 ) {  //Sweet 16, Elite 8; (2 time slots)
                                                                endTime = new moment(startTime).add(6, 'h');
                                                            }
                                                            
                                                            //2 final four matchups
                                                            else if (i === 3) {
                                                                endTime = new moment(startTime).add(6, 'h');    
                                                                j++;    //only 1 day of final four
                                                            }
                                                            //championship match
                                                            else {
                                                                endTime = new moment(startTime).add(3, 'h');    //Ends 1 + 3  = 4 hours after roundStart
                                                                j++;
                                                            }
        
                                                            // console.log("Round " + createdRound.numRound + "." + j);
                                                            // console.log("ScrapeStart: " + startTime.format('LLLL'));
                                                            // console.log("ScrapeStop: " + endTime.format('LLLL'));
                                                            
                                                            var job = { start: startTime, end: endTime, rule: '0 */1 * * * *' };
                                                            
                                                            //create the job
                                                            var k = schedule.scheduleJob(job, function(){
                                                                scrape();
                                                            });
                                                            //save the scrape-job information to the database for persistence; called to reschedule the job in app.js when the app is restarted
                                                            Scrape.create( job, function(err, createdJob) {
                                                                if(err) console.log(err);
                                                                createdTournament.scrapes.push(createdJob);
                                                            });
                                                        }
                                                        callback();
                                                    }
                                                
                                                ], function(err) {
                                                    if(err) console.log(err);
                                                    else {
                                                        createdTournament.rounds.addToSet(createdRound);
                                                        next();
                                                    }
                                                });
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
                                asyncNpm.forEachSeries(createdTournament.rounds, 
                                    function(round, next){
                                        if (round.numRound !== 1) {
                                            var matchNumStart = Math.pow(2, numRounds)-Math.pow(2, numRounds + 1 - round.numRound) + 1; //1, 33, 49, 57, 61, 63
                                            var matchesThisRound = Math.pow(2, numRounds - round.numRound);
                                            asyncNpm.timesSeries(matchesThisRound, 
                                                function(j, next){
                                                    Match.create(
                                                    {
                                                        matchNumber: matchNumStart + j,
                                                        topTeam: null,
                                                        bottomTeam: null,
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
    Tournament.findOne({year: year})
        .populate({path: "rounds", populate: { path: "matches",populate:{ path: "topTeam" } }})
        .populate({path: "rounds", populate: { path: "matches", populate: { path: "bottomTeam" } }})
        .populate("champion")
        .exec(function(err, foundTournament){
         if (err || !foundTournament){
            req.flash("error", "Tournament not found");
            return res.redirect("/tournaments");
        } else {
            res.render("tournaments/show", {tournament: foundTournament, page: "tournaments"});
        }
    });
});

// //EDIT Tournament Route
// router.get("/:id/edit", middleware.checkTournamentGroupOwnership, function(req, res){
//     Campground.findById(req.params.id, function(err, foundCampground){
//         res.render("campgrounds/edit", {campground: foundCampground});
//     });
// });

// // UPDATE Tournament Route
// router.put("/:id", middleware.checkTournamentGroupOwnership, function(req, res) {
//   //find and update the correct campground
//   // Campground.findByIdAndUpdate(id, newData, callback)
//   Campground.findByIdAndUpdate(req.params.id, req.body.campground, function(err, updatedCampground){
//       if(err){
//           res.redirect("/campgrounds");
//       } else {
//             res.redirect("/campgrounds/" + req.params.id);     
//       }
//   });
// });

// //DESTROY Tournament Route
// router.delete("/:id", middleware.checkTournamentGroupOwnership, function(req, res){
//   Campground.findByIdAndRemove(req.params.id, function(err){
//       if(err){
//           res.redirect("/campgrounds");
//       } else {
//           req.flash("success", "Campground deleted");
//           res.redirect("/campgrounds");
//       }
//   });
// });


//order tournament rounds lowest to highest
function compare(a,b) {
    if (a.numRound < b.numRound)
        return -1;
    else if (a.numRound > b.numRound)
        return 1;
    return 0;
}

//order teams correctly by matchNum from lowest to highest
function compareTeams(a,b) {
    // console.log(a.firstMatchNum + " " + b.firstMatchNum);
    if (a.firstMatchNum < b.firstMatchNum)
        return -1;
    else if (a.firstMatchNum > b.firstMatchNum)
        return 1;
    return 0;
}

var teamNames = [
        "Alabama",
        "AMCC/SMO",
        "Maryland",
        "West Virginia",
        "San Diego State",
        "Charleston",
        "Virginia",
        "Furman",
        "Creighton",
        "NC State",
        "Baylor",
        "UCSB",
        "Missouri",
        "Utah State",
        "Arizona",
        "Princeton",
        
        "Purdue",
        "TSO/FDU",
        "Memphis",
        "FAU",
        "Duke",
        "Oral Roberts",
        "Tennessee",
        "Louisiana",
        "Kentucky",
        "Providence",
        "Kansas State",
        "Montana St.",
        "Michigan State",
        "USC",
        "Marquette",
        "Vermont",
        
        "Houston",
        "N. Kentucky",
        "Iowa",
        "Auburn",
        "Miami (Fla.)",
        "Drake",
        "Indiana",
        "Kent State",
        "Iowa State",
        "MSST/Pitt",
        "Xavier",
        "Kennesaw St.",
        "Texas A&M",
        "Penn State",
        "Texas",
        "Colgate",
        
        "Kansas",
        "Howard",
        "Arkansas",
        "Illinois",
        "Saint Mary's",
        "VCU",
        "Connecticut",
        "Iona",
        "TCU",
        "ASU/NEV",
        "Gonzaga",
        "Grand Canyon",
        "Northwestern",
        "Boise State",
        "UCLA",
        "UNC-Asheville"
        
        
        
    ];


// var teamNames = [
//         "Virginia",
//         "UMBC",
//         "Creighton",
//         "Kansas State",
//         "Kentucky",
//         "Davidson",
//         "Arizona",
//         "Buffalo",
//         "Miami (Fla.)",
//         "Loyola-Chi.",
//         "Tennessee",
//         "Wright State",
//         "Nevada",
//         "Texas",
//         "Cincinnati",
//         "Georgia State",
        
//         "Xavier",
//         "Texas So.",
//         "Missouri",
//         "Florida State",
//         "Ohio State",
//         "S. Dak. St.",
//         "Gonzaga",
//         "NC-Greensboro",
//         "Houston",
//         "San Diego St",
//         "Michigan",
//         "Montana",
//         "Texas A&M",
//         "Providence",
//         "North Carolina",
//         "Lipscomb",
        
//         "Villanova",
//         "Radford",
//         "Virginia Tech",
//         "Alabama",
//         "West Virginia",
//         "Murray St.",
//         "Wichita State",
//         "Marshall",
//         "Florida",
//         "St. Bona.",
//         "Texas Tech",
//         "SF Austin",
//         "Arkansas",
//         "Butler",
//         "Purdue",
//         "CSFullerton",
        
//         "Kansas",
//         "Pennsylvania",
//         "Seton Hall",
//         "NC State",
//         "Clemson",
//         "New Mex. St.",
//         "Auburn",
//         "Charleston",
//         "TCU",
//         "Syracuse",
//         "Michigan State",
//         "Bucknell",
//         "Rhode Island",
//         "Oklahoma",
//         "Duke",
//         "Iona"
        
        
        
//     ];



module.exports = router;