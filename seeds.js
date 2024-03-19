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
var data = require("./historicalStandings");

function seedDB() {
  // removeAndAddTournamentStandings(data);
  // removeAndAddTrophies();
  // removeBots();

  async.parallel(
    [
      // deleteAllTournamentGroups,
      // deleteAllUserTournaments,
      // deleteAllUserRounds,
      // deleteAllUserMatchPredictions,
      // deleteAllUserMatchAggregates,
      // deleteAllBonusMatchAggregates,
      // deleteAllTeams,
      // deleteAllMatches,
      // deleteAllRounds,
      // deleteAllTournaments,
      // deleteAllScrapes,
      // deleteAllUsers,
    ],
    function (err) {
      if (err) console.log(err);
      // addTwoUsers();
    },
  );
}

function deleteAllTournamentGroups(callback) {
  TournamentGroup.deleteMany({}, function (err) {
    if (err) console.log(err);
    else console.log("removed all tournament groups");
    callback();
  });
}

function deleteAllUserTournaments(callback) {
  UserTournament.deleteMany({}, function (err) {
    if (err) console.log(err);
    else console.log("removed all userTournaments");
    callback();
  });
}

function deleteAllUserRounds(callback) {
  UserRound.deleteMany({}, function (err) {
    if (err) console.log(err);
    else console.log("removed all user rounds");
    callback();
  });
}

function deleteAllUserMatchPredictions(callback) {
  UserMatchPrediction.deleteMany({}, function (err) {
    if (err) console.log(err);
    else console.log("removed all user match predictions");
    callback();
  });
}

function deleteAllUserMatchAggregates(callback) {
  UserMatchAggregate.deleteMany({}, function (err) {
    if (err) console.log(err);
    else console.log("removed all user match aggregates");
    callback();
  });
}

function deleteAllBonusMatchAggregates(callback) {
  BonusAggregate.deleteMany({}, function (err) {
    if (err) console.log(err);
    else console.log("removed all bonus match aggregates");
    callback();
  });
}

function deleteAllTeams(callback) {
  Team.deleteMany({}, function (err) {
    if (err) console.log(err);
    else console.log("removed all teams");
    callback();
  });
}

function deleteAllMatches(callback) {
  Match.deleteMany({}, function (err) {
    if (err) console.log(err);
    else console.log("removed all matches");
    callback();
  });
}

function deleteAllRounds(callback) {
  Round.deleteMany({}, function (err) {
    if (err) console.log(err);
    else console.log("removed all rounds");
    callback();
  });
}

function deleteAllTournaments(callback) {
  Tournament.deleteMany({}, function (err) {
    if (err) console.log(err);
    else console.log("removed all tournaments");
    callback();
  });
}

function deleteAllScrapes(callback) {
  Scrape.deleteMany({}, function (err) {
    if (err) console.log(err);
    else console.log("removed all scrapes");
    callback();
  });
}

function deleteAllUsers(callback) {
  User.deleteMany({}, function (err) {
    if (err) console.log(err);
    else console.log("removed all users");
    callback();
  });
}

function addTwoUsers(callback) {
  var users = [
    new User({
      username: "seth",
      firstName: "Seth",
      lastName: "McNaughton",
      email: "slmcnaughton@yahoo.com",
    }),
    new User({
      username: "daniel",
      firstName: "Daniel",
      lastName: "McNaughton",
      email: "sethingtonmac@gmail.com",
    }),
  ];

  users.forEach(function (user) {
    User.register(user, "password", function (err, newUser) {
      if (err) console.log(err);
      else {
        addPastTrophies(newUser);
        console.log("Added " + newUser.firstName);
      }
    });
  }, callback);
}

// remove all bots that found this site
var removeBots = function () {
  User.deleteMany(
    { tournamentGroups: { $exists: true, $size: 0 } },
    function (err) {
      if (err) {
        console.log("oops");
      } else {
        console.log("removed all users not in a tournament group");
      }
    },
  );
};

var removeAndAddTrophies = function () {
  removeAllTrophies(addTrophiesToAllExistingUsers);
};

var removeAllTrophies = function (callback) {
  Trophy.deleteMany({}, function (err) {
    if (err) {
      console.log(err);
    } else {
      console.log("removed all trophies");
      callback();
    }
  });
};

var addTrophiesToAllExistingUsers = function () {
  User.find({}, function (err, foundUsers) {
    if (err) console.log(err);
    else {
      async.each(foundUsers, function (user, callback) {
        addPastTrophies(user, callback);
      });
    }
  });
  console.log("Added all trophies to existing users!");
};

var addPastTrophies = function (user, done) {
  //find tournaments the user has participated in
  TournamentStanding.find({
    "standings.firstName": user.firstName,
    "standings.lastName": user.lastName,
  }).exec(function (err, tournamentYears) {
    if (err) {
      console.log(err);
    } else {
      //for each tournament year, add the correct trophy
      async.each(
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
                callback();
              }
            });
          } else {
            console.log(
              "No tournament entry found for + " +
                user.firstName +
                " in year " +
                tournamentYear.Year,
            );
            console.log(tournamentYear);
          }
        },
        function (err) {
          if (err) {
            console.log(err);
          } else {
            user.save(done);
          }
        },
      ); //end of async.each
    }
  }); //end of TournamentStanding.find()
};

var removeAndAddTournamentStandings = function (data) {
  TournamentStanding.deleteMany({}, function (err) {
    if (err) {
      console.log(err);
    } else {
      console.log("removed all tournament standings, added new ones!");
      //add a few tournaments
      data.forEach(function (seed) {
        TournamentStanding.create(seed, function (err, tournament) {
          if (err) {
            console.log(err);
          } else {
            //   console.log("added a tournament");
          }
        });
      });
    }
  });
};

function deleteTeamImages() {
  TeamImage.deleteMany({}, function (err) {
    if (err) {
      console.log(err);
    } else {
      console.log("removed all team images");
    }
  });
}

module.exports = seedDB;
