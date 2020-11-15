var mongoose = require("mongoose");
var TournamentStanding = require("./models/tournamentStanding");
var User = require("./models/user");
var Trophy = require("./models/trophy");
var Tournament = require("./models/tournament");
var TournamentGroup = require("./models/tournamentGroup");
var UserTournament = require("./models/userTournament");
var UserRound = require("./models/userRound");
var UserMatchPrediction = require("./models/userMatchPrediction");
var UserMatchAggregate = require("./models/userMatchAggregate");
var BonusAggregate = require("./models/bonusAggregate");
var Round = require("./models/round");
var Match = require("./models/match");
var Team = require("./models/team");
var TeamImage = require("./models/teamImage");
var Scrape = require("./models/scrape");
var async = require("async");

function seedDB() {
    // addTournamentStandings();
    // addTrophies();
    // removeBots();
    
    // async.parallel([
    //     function(callback) {
    //         TournamentGroup.deleteMany({}, function(err) {
    //             if (err) console.log(err);
    //             else console.log("removed all tournament groups");
    //             callback();
    //         });
    //     },
    //     function(callback) {
    //         UserTournament.deleteMany({}, function(err) {
    //             if (err) console.log(err);
    //             else console.log("removed all userTournaments");
    //             callback();
    //         });
    //     },
    //     function(callback) {
    //         UserRound.deleteMany({}, function(err) {
    //             if (err) console.log(err);
    //             else console.log("removed all user rounds");
    //             callback();
    //         });
    //     },
    //     function(callback) {
    //         UserMatchPrediction.deleteMany({}, function(err) {
    //             if (err) console.log(err);
    //             else console.log("removed all user match predictions");
    //             callback();
    //         });
    //     },
    //     function(callback) {
    //         UserMatchAggregate.deleteMany({}, function(err) {
    //             if (err) console.log(err);
    //             else console.log("removed all user match aggregates");
    //             callback();
    //         });
    //     },
    //     function(callback) {
    //         BonusAggregate.deleteMany({}, function(err) {
    //             if (err) console.log(err);
    //             else console.log("removed all bonus match aggregates");
    //             callback();
    //         });
    //     },
    //     function(callback) {
    //         Team.deleteMany({}, function(err) {
    //             if (err) console.log(err);
    //             else console.log("removed all teams");
    //             callback();
    //         });
    //     },
    //     function(callback) {
    //         Match.deleteMany({}, function(err) {
    //             if (err) console.log(err);
    //             else console.log("removed all matches");
    //             callback();
    //         });
    //     },
    //     function(callback) {
    //         Round.deleteMany({}, function(err) {
    //             if (err) console.log(err);
    //             else console.log("removed all rounds");
    //             callback();
    //         });
    //     },
    //     function(callback) {
    //         Tournament.deleteMany({}, function(err) {
    //             if (err) console.log(err);
    //             else console.log("removed all matches");
    //             callback();
    //         });
    //     },
    //     function(callback) {
    //         Scrape.deleteMany({}, function(err) {
    //             if (err) {
    //                 console.log("oops");
    //             }
    //             else {
    //                 console.log("removed all scrapes");
    //             }
    //             callback();
    //         });
    //     },
    //     function(callback) {
    //         User.deleteMany({}, function(err) {
    //             if (err) {
    //                 console.log("oops");
    //             }
    //             else {
    //                 console.log("removed all users");
    //             }
    //             callback();
    //         });
    //     },
        
    //     // TeamImage.deleteMany({}, function(err){
    //     //   if (err) {
    //     //       console.log("oops");
    //     //   } else {
    //     //       console.log("removed all team images");
    //     //   }
    //     // });
    //     // Trophy.deleteMany({}, function(err){
    //     //   if (err) {
    //     //       console.log("oops");
    //     //   } else {
    //     //       console.log("removed all trophies");
    //     //   }
    //     // });


    // ], function(err) {
    //     if (err) console.log(err);
    //     // async.series([
    //     addTwoUsers();
    //     // addTournament()
    //     // ], function(err) {
    //     //     if(err) console.log(err);
    //     // });

    // });
}

function addTwoUsers() {
    var users = [
        new User({
            username: 'seth',
            firstName: 'Seth',
            lastName: 'McNaughton',
            email: 'slmcnaughton@yahoo.com'
        }), new User({
            username: 'daniel',
            firstName: 'Daniel',
            lastName: 'McNaughton',
            email: 'sethingtonmac@gmail.com'
        })
    ];

    users.forEach(function(user) {
        User.register(user, "password", function(err, newUser) {
            if (err) console.log(err);
            else {
                addPastTrophies(newUser);
                console.log("Added " + newUser.firstName);
            }
        });
    });
}

function compare(a, b) {
    if (a.year > b.year)
        return -1;
    else if (a.year < b.year)
        return 1;
    return 0;
}

var addTrophies = function() {
    Trophy.deleteMany({}, function(err) {
        if (err) {
            console.log(err);
        }
        else {
            console.log("removed all trophies, added new ones!");
            User.find({}, function(err, foundUsers) {
                if (err) console.log(err);
                else {
                    async.forEachSeries(foundUsers, function(user, callback) {
                        //console.logging here allows for the process to be slow enough to run for each user?
                        console.log(user.firstName);
                        addPastTrophies(user, callback);
                    });
                }
            });
        }
    });
};

// remove all bots that found this site
var removeBots = function() {
    User.deleteMany({ "tournamentGroups": {"$exists": true, "$size": 0 } }, function(err) {
        if (err) {
            console.log("oops");
        }
        else {
            console.log("removed all users not in a tournament group");
        }
    });
};

var addPastTrophies = function(user, done) {
    //find tournaments the user has participated in
    TournamentStanding.find({ "standings.firstName": user.firstName, "standings.lastName": user.lastName }).exec(function(err, tournamentYears) {
        if (err) {
            console.log(err);
        }
        else {
            //for each tournament year, add the correct trophy
            async.forEachSeries(tournamentYears, function(tournamentYear, callback) {
                var noTournamentEntryFoundScore = -10000;
                
                var year = tournamentYear.year;
                var totalPlayers = tournamentYear.standings.length;
                var rank = 1;
                var score = noTournamentEntryFoundScore;   

                //find the user's score for this year
                tournamentYear.standings.forEach(function(entry) {
                    if (entry.firstName === user.firstName && entry.lastName === user.lastName) {
                        score = entry.score;
                    }
                });
                //calculate the user's rank by counting how many players scored higher
                tournamentYear.standings.forEach(function(entry) {
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
                        score: score
                    };
                    Trophy.create(newTrophy, function(err, trophy) {
                        if (err) {
                            console.log(err);
                        }
                        else {
                            user.trophies.addToSet(trophy._id);
                            user.save(callback);
                        }
                    });
                }
            }, function(err) {
                if (err) {
                    console.log(err);
                }
                else {
                    done();
                }
            }); //end of async.forEachSeries
        }
    }); //end of TournamentStanding.find()
};


var addTournamentStandings = function() {
    TournamentStanding.deleteMany({}, function(err) {
        if (err) {
            console.log(err);
        }
        else {
            console.log("removed all tournament standings, added new ones!");
            //add a few tournaments
            data.forEach(function(seed) {
                TournamentStanding.create(seed, function(err, tournament) {
                    if (err) {
                        console.log(err);
                    }
                    else {
                        //   console.log("added a tournament");
                    }
                });
            });
        }
    });
};

//Historical Tournament Standings Data
var data = [
    {
        year: 2019,
        standings: [
            {
                firstName: "Seth",
                lastName: "McNaughton",
                score: 49.657
            },
            {
                firstName: "Daniel",
                lastName: "McNaughton",
                score: 36.198
            },
            {
                firstName: "Cherisse",
                lastName: "McNaughton",
                score: 26.32
            },
            {
                firstName: "Sherri",
                lastName: "Stapleton",
                score: 26.241
            },
            {
                firstName: "Amy",
                lastName: "McNaughton",
                score: 23.942
            },
            {
                firstName: "Judd",
                lastName: "McNaughton",
                score: 20.936
            },
            {
                firstName: "James",
                lastName: "Stapleton",
                score: 19.562
            },
            {
                firstName: "David",
                lastName: "Mathias",
                score: 19.07
            },
            {
                firstName: "Gideon",
                lastName: "Mathias",
                score: 18.388
            },
            {
                firstName: "Rachel",
                lastName: "McNaughton",
                score: 17.995
            },
            {
                firstName: "Charles",
                lastName: "Stapleton",
                score: 17.868
            },
            {
                firstName: "Emily",
                lastName: "Stapleton",
                score: 17.801
            },
            {
                firstName: "Dave",
                lastName: "McNaughton",
                score: 16.049
            },
            {
                firstName: "Jim",
                lastName: "Mathias",
                score: 15.656
            },
            {
                firstName: "Micah",
                lastName: "Mathias",
                score: 13.485
            },
            {
                firstName: "Lily",
                lastName: "McNaughton",
                score: 13.202
            },
            {
                firstName: "Naomi",
                lastName: "McNaughton",
                score: 12.618
            },
            {
                firstName: "Keena",
                lastName: "McNaughton",
                score: 12.173
            },
            {
                firstName: "Gabrielle",
                lastName: "McNaughton",
                score: 8.278
            },
            {
                firstName: "Donna",
                lastName: "McNaughton",
                score: 6.699
            },
            {
                firstName: "Ron",
                lastName: "McNaughton",
                score: 6.558
            },
            {
                firstName: "Linnea",
                lastName: "Mathias",
                score: -5.208
            },
            {
                firstName: "Nora",
                lastName: "Mathias",
                score: -6.308
            },
            {
                firstName: "Reuben",
                lastName: "Mathias",
                score: -8.034
            },
            {
                firstName: "Levi",
                lastName: "Mathias",
                score: -13.734
            },
            {
                firstName: "Rhonda",
                lastName: "Mathias",
                score: -14.354
            },
            {
                firstName: "Bethany",
                lastName: "McNaughton",
                score: -14.895
            },
            {
                firstName: "Michael",
                lastName: "Balzano",
                score: -17.5
            },
            {
                firstName: "Ryne",
                lastName: "Deckard",
                score: -18.095
            },
            {
                firstName: "Elizabeth",
                lastName: "Stapleton",
                score: -33.755
            },
            {
                firstName: "Sarah",
                lastName: "McNaughton",
                score: -46.928
            },
            {
                firstName: "Caleb",
                lastName: "McNaughton",
                score: -53.435
            }
        ]
    },
    {
        year: 2018,
        standings: [
            {
                firstName: "Gabrielle",
                lastName: "McNaughton",
                score: 57.51
            },
            {
                firstName: "David",
                lastName: "Mathias",
                score: 57.003
            },
            {
                firstName: "Daniel",
                lastName: "McNaughton",
                score: 43.717
            },
            {
                firstName: "Seth",
                lastName: "McNaughton",
                score: 36.565
            },
            {
                firstName: "Dave",
                lastName: "McNaughton",
                score: 33.696
            },
            {
                firstName: "Nora",
                lastName: "Mathias",
                score: 33.415
            },
            {
                firstName: "Rachel",
                lastName: "McNaughton",
                score: 33.328
            },
            {
                firstName: "Kara",
                lastName: "Deckard",
                score: 33.222
            },
            {
                firstName: "Amy",
                lastName: "McNaughton",
                score: 32.778
            },
            {
                firstName: "Rhonda",
                lastName: "Mathias",
                score: 32.778
            },
            {
                firstName: "Bethany",
                lastName: "McNaughton",
                score: 26.124
            },
            {
                firstName: "James",
                lastName: "Stapleton",
                score: 25.902
            },
            {
                firstName: "Ron",
                lastName: "McNaughton",
                score: 19.232
            },
            {
                firstName: "Courtney",
                lastName: "McNaughton",
                score: 19.154
            },
            {
                firstName: "Jim",
                lastName: "Mathias",
                score: 18.863
            },
            {
                firstName: "Micah",
                lastName: "Mathias",
                score: 18.373
            },
            {
                firstName: "Cherisse",
                lastName: "McNaughton",
                score: 18.075
            },
            {
                firstName: "Emily",
                lastName: "Stapleton",
                score: 16.509
            },
            {
                firstName: "Donna",
                lastName: "McNaughton",
                score: 15.812
            },
            {
                firstName: "Elizabeth",
                lastName: "Stapleton",
                score: 15.657
            },
            {
                firstName: "Gideon",
                lastName: "Mathias",
                score: 14.233
            },
            {
                firstName: "Levi",
                lastName: "Mathias",
                score: 13.76
            },
            {
                firstName: "Naomi",
                lastName: "McNaughton",
                score: 10.218
            },
            {
                firstName: "Reuben",
                lastName: "Mathias",
                score: 7.559
            },
            {
                firstName: "Sherri",
                lastName: "Stapleton",
                score: 6.868
            },
            {
                firstName: "Lily",
                lastName: "McNaughton",
                score: 6.102
            },
            {
                firstName: "Elijah",
                lastName: "Deckard",
                score: 1.957
            },
            {
                firstName: "Judd",
                lastName: "McNaughton",
                score: -0.095
            },
            {
                firstName: "Ryne",
                lastName: "Deckard",
                score: -10.28
            },
            {
                firstName: "Sarah",
                lastName: "McNaughton",
                score: -11.87
            },
            {
                firstName: "Charles",
                lastName: "Stapleton",
                score: -13.17
            },
            {
                firstName: "Caleb",
                lastName: "McNaughton",
                score: -29.07
            },
            {
                firstName: "Keena",
                lastName: "McNaughton",
                score: -30.89
            },
        ]
    },
    {
        year: 2017,
        standings: [{
                firstName: "Charles",
                lastName: "Stapleton",
                score: 54.87438
            },
            {
                firstName: "Micah",
                lastName: "Mathias",
                score: 54.68012
            },
            {
                firstName: "Rhonda",
                lastName: "Mathias",
                score: 43.79625
            },
            {
                firstName: "Ron",
                lastName: "McNaughton",
                score: 35.42557
            },
            {
                firstName: "Amy",
                lastName: "McNaughton",
                score: 30.92062
            },
            {
                firstName: "Seth",
                lastName: "McNaughton",
                score: 29.06843
            },
            {
                firstName: "Nora",
                lastName: "Mathias",
                score: 26.69419
            },
            {
                firstName: "Sarah",
                lastName: "McNaughton",
                score: 22.44104
            },
            {
                firstName: "Lily",
                lastName: "McNaughton",
                score: 22.44104
            },
            {
                firstName: "Emily",
                lastName: "Stapleton",
                score: 21.65122
            },
            {
                firstName: "Rachel",
                lastName: "McNaughton",
                score: 17.88167
            },
            {
                firstName: "James",
                lastName: "Stapleton",
                score: 17.12759
            },
            {
                firstName: "Cherisse",
                lastName: "McNaughton",
                score: 15.68384
            },
            {
                firstName: "Reuben",
                lastName: "Mathias",
                score: 15.32976
            },
            {
                firstName: "David",
                lastName: "Mathias",
                score: 12.71349
            },
            {
                firstName: "Judd",
                lastName: "McNaughton",
                score: 12.12697
            },
            {
                firstName: "Sherri",
                lastName: "Stapleton",
                score: 10.86889
            },
            {
                firstName: "Dave",
                lastName: "McNaughton",
                score: 9.785098
            },
            {
                firstName: "Bethany",
                lastName: "McNaughton",
                score: 9.660892
            },
            {
                firstName: "Gabrielle",
                lastName: "McNaughton",
                score: 9.660892
            },
            {
                firstName: "Daniel",
                lastName: "McNaughton",
                score: 0.712479
            },
            {
                firstName: "Levi",
                lastName: "Mathias",
                score: -0.04698
            },
            {
                firstName: "Jim",
                lastName: "Mathias",
                score: -5.98081
            },
            {
                firstName: "Naomi",
                lastName: "McNaughton",
                score: -17.4882
            },
            {
                firstName: "Donna",
                lastName: "McNaughton",
                score: -19.3579
            }
        ]
    },
    {
        year: 2016,
        standings: [{
                firstName: "Rhonda",
                lastName: "Mathias",
                score: 73.02575
            },
            {
                firstName: "Daniel",
                lastName: "McNaughton",
                score: 70.72866
            },
            {
                firstName: "Emily",
                lastName: "Stapleton",
                score: 64.67329
            },
            {
                firstName: "Sherri",
                lastName: "Stapleton",
                score: 64.09753
            },
            {
                firstName: "Dave",
                lastName: "McNaughton",
                score: 61.1981
            },
            {
                firstName: "Ron",
                lastName: "McNaughton",
                score: 59.42506
            },
            {
                firstName: "Cherisse",
                lastName: "McNaughton",
                score: 55.14857
            },
            {
                firstName: "Rachel",
                lastName: "McNaughton",
                score: 53.72697
            },
            {
                firstName: "Lily",
                lastName: "McNaughton",
                score: 53.34168
            },
            {
                firstName: "David",
                lastName: "Mathias",
                score: 51.16996
            },
            {
                firstName: "Donna",
                lastName: "McNaughton",
                score: 49.6739
            },
            {
                firstName: "Elizabeth",
                lastName: "Stapleton",
                score: 44.9721
            },
            {
                firstName: "Micah",
                lastName: "Mathias",
                score: 40.91897
            },
            {
                firstName: "Levi",
                lastName: "Mathias",
                score: 33.58919
            },
            {
                firstName: "Seth",
                lastName: "McNaughton",
                score: 26.90666
            },
            {
                firstName: "Reuben",
                lastName: "Mathias",
                score: 25.44494
            },
            {
                firstName: "Amy",
                lastName: "McNaughton",
                score: 24.91442
            },
            {
                firstName: "Judd",
                lastName: "McNaughton",
                score: 19.35767
            },
            {
                firstName: "James",
                lastName: "Stapleton",
                score: 16.30943
            },
            {
                firstName: "Charles",
                lastName: "Stapleton",
                score: 13.24811
            },
            {
                firstName: "Bethany",
                lastName: "McNaughton",
                score: 10.62146
            },
            {
                firstName: "Sarah",
                lastName: "McNaughton",
                score: 7.886452
            },
            {
                firstName: "Gabrielle",
                lastName: "McNaughton",
                score: 2.543526
            },
            {
                firstName: "Jim",
                lastName: "Mathias",
                score: -1.19158
            }
        ]
    },
    {
        year: 2015,
        standings: [{
                firstName: "Seth",
                lastName: "McNaughton",
                score: 44.684
            },
            {
                firstName: "Naomi",
                lastName: "McNaughton",
                score: 29.021
            },
            {
                firstName: "Gabrielle",
                lastName: "McNaughton",
                score: 29.021
            },
            {
                firstName: "Bethany",
                lastName: "McNaughton",
                score: 29.021
            },
            {
                firstName: "Lily",
                lastName: "McNaughton",
                score: 29.021
            },
            {
                firstName: "Rachel",
                lastName: "McNaughton",
                score: 28.797
            },
            {
                firstName: "Judd",
                lastName: "McNaughton",
                score: 28.712
            },
            {
                firstName: "Levi",
                lastName: "Mathias",
                score: 26.968
            },
            {
                firstName: "Dave",
                lastName: "McNaughton",
                score: 26.123
            },
            {
                firstName: "Elijah",
                lastName: "McNaughton",
                score: 26.123
            },
            {
                firstName: "Charles",
                lastName: "Stapleton",
                score: 24.365
            },
            {
                firstName: "Daniel",
                lastName: "McNaughton",
                score: 22.951
            },
            {
                firstName: "James",
                lastName: "Stapleton",
                score: 22.284
            },
            {
                firstName: "Emily",
                lastName: "Stapleton",
                score: 22.039
            },
            {
                firstName: "Elizabeth",
                lastName: "Stapleton",
                score: 20.354
            },
            {
                firstName: "Donna",
                lastName: "McNaughton",
                score: 18.604
            },
            {
                firstName: "Sherri",
                lastName: "Stapleton",
                score: 6.703
            },
            {
                firstName: "Ron",
                lastName: "McNaughton",
                score: -3.863
            },
            {
                firstName: "Reuben",
                lastName: "Mathias",
                score: -13.373
            },
            {
                firstName: "Sarah",
                lastName: "McNaughton",
                score: -31.817
            }
        ]
    },
    {
        year: 2014,
        standings: [{
                firstName: "Ron",
                lastName: "McNaughton",
                score: 129.3377
            },
            {
                firstName: "Sarah",
                lastName: "McNaughton",
                score: 89.078
            },
            {
                firstName: "Donna",
                lastName: "McNaughton",
                score: 76.072
            },
            {
                firstName: "Sherri",
                lastName: "Stapleton",
                score: 68.752
            },
            {
                firstName: "Daniel",
                lastName: "McNaughton",
                score: 62.418
            },
            {
                firstName: "Judd",
                lastName: "McNaughton",
                score: 57.323
            },
            {
                firstName: "Seth",
                lastName: "McNaughton",
                score: 57.313
            },
            {
                firstName: "David",
                lastName: "Mathias",
                score: 51.172
            },
            {
                firstName: "Emily",
                lastName: "Stapleton",
                score: 44.719
            },
            {
                firstName: "Dave",
                lastName: "McNaughton",
                score: 42.621
            },
            {
                firstName: "Levi",
                lastName: "Mathias",
                score: 39.175
            },
            {
                firstName: "Naomi",
                lastName: "McNaughton",
                score: 32.840
            },
            {
                firstName: "Gabrielle",
                lastName: "McNaughton",
                score: 32.840
            },
            {
                firstName: "Bethany",
                lastName: "McNaughton",
                score: 32.840
            },
            {
                firstName: "Lily",
                lastName: "McNaughton",
                score: 32.840
            },
            {
                firstName: "Rachel",
                lastName: "McNaughton",
                score: 27.236
            },
            {
                firstName: "Charles",
                lastName: "Stapleton",
                score: 23.380
            },
            {
                firstName: "James",
                lastName: "Stapleton",
                score: 0.68
            },
            {
                firstName: "Elizabeth",
                lastName: "Stapleton",
                score: -2.449
            },
            {
                firstName: "Reuben",
                lastName: "Mathias",
                score: -6.159
            }
        ]
    },
    {
        year: 2013,
        standings: [{
                firstName: "Donna",
                lastName: "McNaughton",
                score: 65.5984
            },
            {
                firstName: "Dave",
                lastName: "McNaughton",
                score: 44.6506
            },
            {
                firstName: "Ron",
                lastName: "McNaughton",
                score: 43.7389
            },
            {
                firstName: "Jim",
                lastName: "Mathias",
                score: 38.8357
            },
            {
                firstName: "Sarah",
                lastName: "McNaughton",
                score: 28.6022
            },
            {
                firstName: "Sherri",
                lastName: "Stapleton",
                score: 13.3465
            },
            {
                firstName: "Elizabeth",
                lastName: "Stapleton",
                score: 13.1974
            },
            {
                firstName: "Charles",
                lastName: "Stapleton",
                score: 12.3329
            },
            {
                firstName: "Judd",
                lastName: "McNaughton",
                score: 10.8946
            },
            {
                firstName: "Seth",
                lastName: "McNaughton",
                score: 10.3875
            },
            {
                firstName: "Emily",
                lastName: "Stapleton",
                score: 5.7154
            },
            {
                firstName: "Daniel",
                lastName: "McNaughton",
                score: 5.1381
            },
            {
                firstName: "Gabrielle",
                lastName: "McNaughton",
                score: 2.0461
            },
            {
                firstName: "James",
                lastName: "Stapleton",
                score: -3.2162
            },
            {
                firstName: "Naomi",
                lastName: "McNaughton",
                score: -7.1622
            }
        ]
    },
    {
        year: 2012,
        standings: [{
                firstName: "Sarah",
                lastName: "McNaughton",
                score: 56.279
            },
            {
                firstName: "Charles",
                lastName: "Stapleton",
                score: 41.750
            },
            {
                firstName: "Ron",
                lastName: "McNaughton",
                score: 40.592
            },
            {
                firstName: "Daniel",
                lastName: "McNaughton",
                score: 40.591
            },
            {
                firstName: "Judd",
                lastName: "McNaughton",
                score: 40.282
            },
            {
                firstName: "Donna",
                lastName: "McNaughton",
                score: 37.282
            },
            {
                firstName: "Seth",
                lastName: "McNaughton",
                score: 34.958
            },
            {
                firstName: "David",
                lastName: "Mathias",
                score: 30.806
            },
            {
                firstName: "Amy",
                lastName: "McNaughton",
                score: 17.955
            },
            {
                firstName: "Naomi",
                lastName: "McNaughton",
                score: 16.721
            },
            {
                firstName: "James",
                lastName: "Stapleton",
                score: 15.289
            },
            {
                firstName: "Sherri",
                lastName: "Stapleton",
                score: 12.810
            },
            {
                firstName: "Dave",
                lastName: "McNaughton",
                score: 6.650
            },
            {
                firstName: "Emily",
                lastName: "Stapleton",
                score: 4.953
            },
            {
                firstName: "Elizabeth",
                lastName: "Stapleton",
                score: 3.397
            }
        ]
    },
    {
        year: 2011,
        standings: [{
                firstName: "Daniel",
                lastName: "McNaughton",
                score: 97.9635
            },
            {
                firstName: "Ryne",
                lastName: "Deckard",
                score: 90.3133
            },
            {
                firstName: "Emily",
                lastName: "Stapleton",
                score: 89.5442
            },
            {
                firstName: "Ron",
                lastName: "McNaughton",
                score: 72.7909
            },
            {
                firstName: "Charles",
                lastName: "Stapleton",
                score: 68.9460
            },
            {
                firstName: "Kara",
                lastName: "Deckard",
                score: 39.2376
            },
            {
                firstName: "Keena",
                lastName: "McNaughton",
                score: 38.4697
            },
            {
                firstName: "Sarah",
                lastName: "McNaughton",
                score: 32.6915
            },
            {
                firstName: "Sherri",
                lastName: "Stapleton",
                score: 32.1865
            },
            {
                firstName: "Judd",
                lastName: "McNaughton",
                score: 27.4725
            },
            {
                firstName: "Dave",
                lastName: "McNaughton",
                score: 26.2019
            },
            {
                firstName: "James",
                lastName: "Stapleton",
                score: 21.4310
            },
            {
                firstName: "Gabrielle",
                lastName: "McNaughton",
                score: 11.8499
            },
            {
                firstName: "Donna",
                lastName: "McNaughton",
                score: 8.9615
            },
            {
                firstName: "Elizabeth",
                lastName: "Stapleton",
                score: 0.6134
            },
            {
                firstName: "Seth",
                lastName: "McNaughton",
                score: -1.4347
            },
            {
                firstName: "Naomi",
                lastName: "McNaughton",
                score: -3.2780
            },
            {
                firstName: "Amy",
                lastName: "McNaughton",
                score: -12.7531
            }
        ]
    },
    {
        year: 2010,
        standings: [{
                firstName: "Emily",
                lastName: "Stapleton",
                score: 56.528
            },
            {
                firstName: "James",
                lastName: "Stapleton",
                score: 42.235
            },
            {
                firstName: "Kara",
                lastName: "Deckard",
                score: 39.936
            },
            {
                firstName: "Seth",
                lastName: "McNaughton",
                score: 38.027
            },
            {
                firstName: "Charles",
                lastName: "Stapleton",
                score: 34.119
            },
            {
                firstName: "Naomi",
                lastName: "McNaughton",
                score: 31.719
            },
            {
                firstName: "Keena",
                lastName: "McNaughton",
                score: 31.495
            },
            {
                firstName: "Courtney",
                lastName: "McNaughton",
                score: 30.104
            },
            {
                firstName: "Elizabeth",
                lastName: "Stapleton",
                score: 24.804
            },
            {
                firstName: "Gabrielle",
                lastName: "McNaughton",
                score: 23.967
            },
            {
                firstName: "Ryne",
                lastName: "Deckard",
                score: 14.365
            },
            {
                firstName: "Jim",
                lastName: "Mathias",
                score: 8.648
            },
            {
                firstName: "Sherri",
                lastName: "Stapleton",
                score: 7.963
            },
            {
                firstName: "Judd",
                lastName: "McNaughton",
                score: 7.606
            },
            {
                firstName: "Dave",
                lastName: "McNaughton",
                score: 5.971
            },
            {
                firstName: "Donna",
                lastName: "McNaughton",
                score: 2.151
            },
            {
                firstName: "Ron",
                lastName: "McNaughton",
                score: -1.506
            },
            {
                firstName: "Daniel",
                lastName: "McNaughton",
                score: -16.581
            },
            {
                firstName: "Sarah",
                lastName: "McNaughton",
                score: -17.353
            }

        ]
    },
    {
        year: 2009,
        standings: [{
                firstName: "Seth",
                lastName: "McNaughton",
                score: 47.3
            },
            {
                firstName: "Daniel",
                lastName: "McNaughton",
                score: 38.29
            },
            {
                firstName: "Charles",
                lastName: "Stapleton",
                score: 36.8
            },
            {
                firstName: "Daniel",
                lastName: "Beach",
                score: 30.11
            },
            {
                firstName: "Naomi",
                lastName: "McNaughton",
                score: 27.59
            },
            {
                firstName: "Judd",
                lastName: "McNaughton",
                score: 23.59
            },
            {
                firstName: "Ryne",
                lastName: "Deckard",
                score: 21.97
            },
            {
                firstName: "Donna",
                lastName: "McNaughton",
                score: 21.97
            },
            {
                firstName: "Sherri",
                lastName: "Stapleton",
                score: 20.56
            },
            {
                firstName: "Dave",
                lastName: "McNaughton",
                score: 15.44
            },
            {
                firstName: "Ben",
                lastName: "Beach",
                score: 14.77
            },
            {
                firstName: "Sarah",
                lastName: "McNaughton",
                score: 5.34
            },
            {
                firstName: "Elizabeth",
                lastName: "Stapleton",
                score: 5.18
            },
            {
                firstName: "James",
                lastName: "Stapleton",
                score: 10.62
            },
            {
                firstName: "Ron",
                lastName: "McNaughton",
                score: -14.95
            },
            {
                firstName: "Emily",
                lastName: "Stapleton",
                score: 25.2
            }
        ]
    },
    {
        year: 2008,
        standings: [{
                firstName: "Donna",
                lastName: "McNaughton",
                score: 51.02
            },
            {
                firstName: "Sherri",
                lastName: "Stapleton",
                score: 34.4931
            },
            {
                firstName: "Ben",
                lastName: "Beach",
                score: 28.9743
            },
            {
                firstName: "Sarah",
                lastName: "McNaughton",
                score: 28.7042
            },
            {
                firstName: "Judd",
                lastName: "McNaughton",
                score: 21.4589
            },
            {
                firstName: "Elizabeth",
                lastName: "Stapleton",
                score: 17.3011
            },
            {
                firstName: "Emily",
                lastName: "Stapleton",
                score: 17.3011
            },
            {
                firstName: "James",
                lastName: "Stapleton",
                score: 17.3011
            },
            {
                firstName: "Dave",
                lastName: "McNaughton",
                score: 9.8288
            },
            {
                firstName: "Ron",
                lastName: "McNaughton",
                score: 9.6465
            },
            {
                firstName: "Daniel",
                lastName: "McNaughton",
                score: 4.0858
            },
            {
                firstName: "Charles",
                lastName: "Stapleton",
                score: 3.449
            },
            {
                firstName: "Daniel",
                lastName: "Beach",
                score: -4.4836
            },
            {
                firstName: "Ryne",
                lastName: "Deckard",
                score: -9.0465
            },
            {
                firstName: "Seth",
                lastName: "McNaughton",
                score: -12.1197
            },
            {
                firstName: "Naomi",
                lastName: "McNaughton",
                score: -24.2798
            }
        ]
    },
    {
        year: 2007,
        standings: [{
                firstName: "Daniel",
                lastName: "McNaughton",
                score: 55.6101
            },
            {
                firstName: "Judd",
                lastName: "McNaughton",
                score: 52.0933
            },
            {
                firstName: "Sarah",
                lastName: "McNaughton",
                score: 47.9738
            },
            {
                firstName: "Ryne",
                lastName: "Deckard",
                score: 42.549
            },
            {
                firstName: "Elizabeth",
                lastName: "Stapleton",
                score: 31.7396
            },
            {
                firstName: "Emily",
                lastName: "Stapleton",
                score: 31.7396
            },
            {
                firstName: "James",
                lastName: "Stapleton",
                score: 31.7396
            },
            {
                firstName: "Donna",
                lastName: "McNaughton",
                score: 30.8096
            },
            {
                firstName: "Dave",
                lastName: "McNaughton",
                score: 20.7292
            },
            {
                firstName: "Sherri",
                lastName: "Stapleton",
                score: 15.3647
            },
            {
                firstName: "Charles",
                lastName: "Stapleton",
                score: 14.4767
            },
            {
                firstName: "Ron",
                lastName: "McNaghton",
                score: -1.9527
            },
            {
                firstName: "Seth",
                lastName: "McNaughton",
                score: -4.1406
            },
            {
                firstName: "Daniel",
                lastName: "Beach",
                score: -12.7039
            },
            {
                firstName: "Naomi",
                lastName: "McNaughton",
                score: -22.7743
            }
        ]
    },
    {
        year: 2006,
        standings: [{
                firstName: "Elizabeth",
                lastName: "Stapleton",
                score: 96.592
            },
            {
                firstName: "Emily",
                lastName: "Stapleton",
                score: 96.592
            },
            {
                firstName: "James",
                lastName: "Stapleton",
                score: 96.592
            },
            {
                firstName: "David",
                lastName: "Mathias",
                score: 89.4270
            },
            {
                firstName: "Ron",
                lastName: "McNaughton",
                score: 70.3076
            },
            {
                firstName: "Daniel",
                lastName: "McNaughton",
                score: 65.6846
            },
            {
                firstName: "Sherri",
                lastName: "Stapleton",
                score: 61.3148
            },
            {
                firstName: "Charles",
                lastName: "Stapleton",
                score: 58.8489
            },
            {
                firstName: "Seth",
                lastName: "McNaughton",
                score: 38.6991
            },
            {
                firstName: "Donna",
                lastName: "McNaughton",
                score: 36.1103
            },
            {
                firstName: "Sarah",
                lastName: "McNaughton",
                score: 23.8246
            },
            {
                firstName: "Judd",
                lastName: "McNaughton",
                score: 5.5202
            },
            {
                firstName: "Dave",
                lastName: "McNaughton",
                score: -8.1815
            },
            {
                firstName: "Caleb",
                lastName: "McNaughton",
                score: -32.8042
            }
        ]
    },
    {
        year: 2005,
        standings: [{
                firstName: "Judd",
                lastName: "McNaughton",
                score: 44.25
            },
            {
                firstName: "Daniel",
                lastName: "McNaughton",
                score: 23.4361
            },
            {
                firstName: "Seth",
                lastName: "McNaughton",
                score: 22.7462
            },
            {
                firstName: "Sarah",
                lastName: "McNaughton",
                score: 8.6224
            },
            {
                firstName: "Dave",
                lastName: "McNaughton",
                score: 3.0692
            },
            {
                firstName: "Jim",
                lastName: "Beach",
                score: -1.8794
            },
            {
                firstName: "Ron",
                lastName: "McNaughton",
                score: -5.8231
            },
            {
                firstName: "Donna",
                lastName: "McNaughton",
                score: -7.435
            },
            {
                firstName: "Sherri",
                lastName: "Stapleton",
                score: -12.3194
            },
            {
                firstName: "Charles",
                lastName: "Stapleton",
                score: -16.6995
            },
            {
                firstName: "Caleb",
                lastName: "McNaughton",
                score: -32.501
            },
            {
                firstName: "Daniel",
                lastName: "Beach",
                score: -39.79411
            }
        ]
    }

];

module.exports = seedDB;
