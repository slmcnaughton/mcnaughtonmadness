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
var Feedback = require("./models/feedback");
var FamilyMember = require("./models/familyMember");
var FamilyRelationship = require("./models/familyRelationship");
var data = require("./historicalStandings");

async function seedDB() {
  // await removeAndAddTournamentStandings(data);
  // await removeAndAddTrophies();
  // await removeBots();
  // await seedRootCouple();

  try {
    await Promise.all([
      // deleteAllTournamentGroups(),
      // deleteAllUserTournaments(),
      // deleteAllUserRounds(),
      // deleteAllUserMatchPredictions(),
      // deleteAllUserMatchAggregates(),
      // deleteAllBonusMatchAggregates(),
      // deleteAllTeams(),
      // deleteAllMatches(),
      // deleteAllRounds(),
      // deleteAllTournaments(),
      // deleteAllScrapes(),
      // deleteAllFeedback(),
      // deleteAllFamilyData(),
      // deleteAllUsers(),
    ]);
    // await addTwoUsers();
  } catch (err) {
    console.log(err);
  }
}

async function deleteAllTournamentGroups() {
  await TournamentGroup.deleteMany({});
  console.log("removed all tournament groups");
  await User.updateMany({}, { $set: { tournamentGroups: [] } });
  console.log("cleared tournament group refs from all users");
}

async function deleteAllUserTournaments() {
  await UserTournament.deleteMany({});
  console.log("removed all userTournaments");
}

async function deleteAllUserRounds() {
  await UserRound.deleteMany({});
  console.log("removed all user rounds");
}

async function deleteAllUserMatchPredictions() {
  await UserMatchPrediction.deleteMany({});
  console.log("removed all user match predictions");
}

async function deleteAllUserMatchAggregates() {
  await UserMatchAggregate.deleteMany({});
  console.log("removed all user match aggregates");
}

async function deleteAllBonusMatchAggregates() {
  await BonusAggregate.deleteMany({});
  console.log("removed all bonus match aggregates");
}

async function deleteAllTeams() {
  await Team.deleteMany({});
  console.log("removed all teams");
}

async function deleteAllMatches() {
  await Match.deleteMany({});
  console.log("removed all matches");
}

async function deleteAllRounds() {
  await Round.deleteMany({});
  console.log("removed all rounds");
}

async function deleteAllTournaments() {
  await Tournament.deleteMany({});
  console.log("removed all tournaments");
}

async function deleteAllScrapes() {
  await Scrape.deleteMany({});
  console.log("removed all scrapes");
}

async function deleteAllFeedback() {
  await Feedback.deleteMany({});
  console.log("removed all feedback");
}

async function deleteAllUsers() {
  await User.deleteMany({});
  console.log("removed all users");
}

async function addTwoUsers() {
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

  for (var i = 0; i < users.length; i++) {
    var newUser = await User.register(users[i], "password");
    await addPastTrophies(newUser);
    console.log("Added " + newUser.firstName);
  }
}

// remove all bots that found this site
async function removeBots() {
  await User.deleteMany({ tournamentGroups: { $exists: true, $size: 0 } });
  console.log("removed all users not in a tournament group");
}

async function removeAndAddTrophies() {
  await Trophy.deleteMany({});
  console.log("removed all trophies");
  await addTrophiesToAllExistingUsers();
}

async function addTrophiesToAllExistingUsers() {
  var foundUsers = await User.find({});
  for (var i = 0; i < foundUsers.length; i++) {
    await addPastTrophies(foundUsers[i]);
  }
  console.log("Added all trophies to existing users!");
}

async function addPastTrophies(user) {
  var tournamentYears = await TournamentStanding.find({
    "standings.firstName": user.firstName,
    "standings.lastName": user.lastName,
  });

  var noTournamentEntryFoundScore = -10000;

  for (var i = 0; i < tournamentYears.length; i++) {
    var tournamentYear = tournamentYears[i];
    var year = tournamentYear.year;
    var totalPlayers = tournamentYear.standings.length;
    var rank = 1;
    var score = noTournamentEntryFoundScore;

    tournamentYear.standings.forEach(function (entry) {
      if (entry.firstName === user.firstName && entry.lastName === user.lastName) {
        score = entry.score;
      }
    });
    tournamentYear.standings.forEach(function (entry) {
      if (entry.score > score) {
        rank++;
      }
    });

    if (score != noTournamentEntryFoundScore) {
      var trophy = await Trophy.create({
        year: year,
        userRank: rank,
        totalPlayers: totalPlayers,
        score: score,
      });
      user.trophies.addToSet(trophy._id);
    } else {
      console.log("No tournament entry found for " + user.firstName + " in year " + tournamentYear.year);
    }
  }

  await user.save();
}

async function removeAndAddTournamentStandings(data) {
  await TournamentStanding.deleteMany({});
  console.log("removed all tournament standings, adding new ones!");
  for (var i = 0; i < data.length; i++) {
    await TournamentStanding.create(data[i]);
  }
  console.log("added all tournament standings");
}

async function deleteAllFamilyData() {
  await Promise.all([
    FamilyMember.deleteMany({}),
    FamilyRelationship.deleteMany({}),
    User.updateMany({}, { $unset: { familyTreeId: "" } }),
  ]);
  console.log("removed all family members, relationships, and familyTreeId refs");
}

async function seedRootCouple() {
  var savedEldon = await new FamilyMember({
    firstName: "Eldon",
    lastName: "McNaughton",
    deceased: true,
  }).save();

  var savedKatherine = await new FamilyMember({
    firstName: "Katherine",
    lastName: "McNaughton",
    deceased: true,
  }).save();

  await FamilyRelationship.create({
    from: savedEldon._id,
    to: savedKatherine._id,
    type: "spouse",
  });
  console.log("seeded root couple: Eldon & Katherine McNaughton");
}

async function deleteTeamImages() {
  await TeamImage.deleteMany({});
  console.log("removed all team images");
}

module.exports = seedDB;
