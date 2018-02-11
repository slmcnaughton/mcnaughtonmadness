var express = require("express");
var router = express.Router();
var async = require("async");
var Tournament = require("../models/tournament");
var Round = require("../models/round");
var Match = require("../models/match");
var Team = require("../models/team");

//CREATE -
router.get("/", function(req, res) {
    var regions = ["East", "South", "West", "Midwest"];
    var year = 2018;
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
    ];
    var order = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15];
    var numRounds = Math.log(teamNames.length)/Math.log(2); //the number of rounds needed for a 64 team tournament is logbase2(64) = 6
    
    
   var createdRound = Round.create(
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
                                name: teamName,
                                seed: order[i],
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
                               
                                i++;
                                next();
                            }
                        }, 
                        function(err) {
                            if (err) console.log(err);
                            else {
                                callback();
                            }
                        })
                           
                        
                    },
                    function(callback) {
                            // team.name = "Temple"
                            // team.seed = 14;
                            // console.log(team);
                            createdRound.matches.forEach(function(match) {
                            
                                console.log(match.teams.length);
                            })
                            
                            callback();
                        
                    }
                ], function(err) { //This function gets called after the two tasks have called their "task callbacks"
                    // team.name = "Michigan"
                    // team.seed = 7;
                    // console.log(team);
                    res.redirect("/campgrounds");
                });
                
                
            }
        })
    
});    
    
    
    
    
    // var matches = createRoundOfMatches(teams, order);
    // var teams;
    // createAllTeams(teamNames, order, teams);
    // console.log(teams);
    
    




// createRoundOfMatches = function (teams, order) {
//     var matches = [];
//     var i = 1;
//     async.each(teams, function(team, next){
                
//         var newMatch = {
//             matchNumber: i,
//             teams: [],
//             nextMatch: Math.floor(0.5*(i + teams.length + 1))
//         };
// }
    
//     var newRound = {
//         numRound: 1,
//         matches: matches
//     };
    
//   var round =  Round.create(newRound, function(err, round){
//         if(err) {
//             console.log(err);
//         } else {
//             // for (var i = 1; i <= teams.length / 2; i++)
//             var i = 1;
//             async.each(teams, function(team, next){
                
//                 var newMatch = {
//                     matchNumber: i,
//                     teams: [],
//                     nextMatch: Math.floor(0.5*(i + teams.length + 1))
//                 };
                
                
//             }), function(err) {
//                 if (err){
//                     console.log(err);
//                 }
//                 else {
//                     console.log(round);
//                 }
//             }
//         }
        
//     });

//   Match.create(newMatch, function(err, match){
//                     if(err){
//                         console.log(err);
//                     } else {
//                         round.matches.push(match);
//                         var region = regions[(2*i - 2) / order.length];
//                         var seed1 = order[(2*i - 2) % order.length]
//                         var teamName1 = teams[2*i - 2];
//                         var seed2 = order[(2*i - 1) % order.length]
//                         var teamName2 = teams[2*i - 1];
//                         // console.log(seed1+teamName1+seed2+teamName2);
//                         var team1 = {
//                             name: teamName1,
//                             seed: seed1,
//                             region: region
//                         }
//                         var team2 = {
//                             name: teamName2,
//                             seed: seed2,
//                             region: region
//                         }
//                         Team.create(team1, function(err, team){
//                             if(err){
//                                 console.log(err);
//                             } else {
//                                 match.teams.push(team);
//                                 match.save();
//                                 round.save();
//                                 Team.create(team2, function(err, team){
//                                     if(err){
//                                         console.log(err);
//                                     } else {
//                                         match.teams.push(team);
//                                         match.save();
//                                         round.save();
//                                     }
//                                 })
//                             }
//                         })
//                     }
//                 })     
        

    
 



module.exports = router;