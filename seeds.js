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

    // Fast-forward seed: creates tournament + group + picks for seth & daniel
    // Uncomment the line below to auto-run on startup:
    // await seedFastForward();
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

// ─── Fast-Forward Seed ──────────────────────────────────────────────────────
// Wipes tournament data, creates a tournament, group, and has Seth + Daniel
// make all R1 + Final Four + Champion picks with random selections.
// After running, the app is in a "ready for round 1 games" state.

var moment = require("moment-timezone");
var DraftPick = require("./models/draftPick");
var scoring = require("./helpers/scoring");

async function seedFastForward() {
  // 1. Wipe tournament data (same as normal seedDB)
  await Promise.all([
    deleteAllTournamentGroups(),
    deleteAllUserTournaments(),
    deleteAllUserRounds(),
    deleteAllUserMatchPredictions(),
    deleteAllUserMatchAggregates(),
    deleteAllBonusMatchAggregates(),
    deleteAllTeams(),
    deleteAllMatches(),
    deleteAllRounds(),
    deleteAllTournaments(),
    deleteAllScrapes(),
    deleteAllFeedback(),
    DraftPick.deleteMany({}),
  ]);

  // 2. Find Seth and Daniel
  var seth = await User.findOne({ username: "seth" });
  var daniel = await User.findOne({ username: "daniel" });
  if (!seth || !daniel) {
    console.log("[SEED-FF] ERROR: Need users 'seth' and 'daniel' to exist. Run addTwoUsers first.");
    return;
  }

  // 3. Create tournament (replicating tournaments.js POST route logic)
  var year = new Date().getFullYear();
  var regions = ["East", "South", "West", "Midwest"];
  var startDay = moment.tz([year, 2, 19], "America/New_York");
  var order = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15];

  var teamNames = [
    "Duke","Siena","Ohio St.","TCU","St. John's","N. Iowa","Kansas","Cal Baptist",
    "Louisville","South Florida","Michigan St.","N. Dakota St.","UCLA","UCF","UConn","Furman",
    "Florida","Prairie View/Lehigh","Clemson","Iowa","Vanderbilt","Troy","N. Carolina","Illinois",
    "Saint Mary's","Houston","Villanova","Vanderbilt","Nebraska","UC Irvine","Texas A&M","Oregon",
    "Arizona","LIU","Utah St.","Villanova","Wisconsin","High Point","Arkansas","Hawaii",
    "BYU","Texas/NC St.","Gonzaga","Kennesaw St.","Miami","Missouri","Purdue","Queens",
    "Michigan","UMBC/Howard","Georgia","Saint Louis","Tennessee","Virginia","Kentucky","Tennessee St.",
    "Alabama","Akron","Texas Tech","Hofstra","McNeese","Montana","Marquette","Grand Canyon",
  ];

  var numRounds = Math.log(teamNames.length) / Math.log(2);
  var allTeamImages = await TeamImage.find({});

  var tournament = await Tournament.create({
    year: year,
    numTeams: teamNames.length,
    rounds: [],
    regions: regions,
    currentRound: 1,
    scrapes: [],
    emailPickReminderJobs: [],
  });

  // Create Round 1 with teams and matches
  var round1 = await Round.create({
    numRound: 1,
    matches: [],
    startTime: moment(startDay).add({ hours: 12, minutes: 15 }).toDate(),
  });

  var teams = [];
  for (var ti = 0; ti < teamNames.length; ti++) {
    var matched = allTeamImages.find(function (img) { return img.name === teamNames[ti]; });
    var team = await Team.create({
      region: regions[Math.floor(ti / order.length)],
      name: teamNames[ti],
      seed: order[ti % order.length],
      firstMatchNum: Math.floor(ti / 2) + 1,
      lost: 0,
      image: matched ? matched.image : "",
    });
    teams.push(team);
  }

  // Create R1 matches
  for (var mi = 0; mi < teams.length; mi += 2) {
    var matchNumber = Math.floor(mi / 2) + 1;
    var match = await Match.create({
      matchNumber: matchNumber,
      topTeam: teams[mi],
      bottomTeam: teams[mi + 1],
      nextMatch: Math.floor(0.5 * (matchNumber + teams.length + 1)),
    });
    round1.matches.addToSet(match);
  }
  await round1.save();
  tournament.rounds.push(round1);

  // Create remaining rounds (2-6) with empty matches
  var roundStartOffsets = [
    { days: 2, hours: 12, minutes: 10 },
    { days: 7, hours: 19, minutes: 9 },
    { days: 9, hours: 18, minutes: 9 },
    { days: 16, hours: 18, minutes: 9 },
    { days: 18, hours: 21, minutes: 20 },
  ];

  for (var ri = 0; ri < numRounds - 1; ri++) {
    var roundStart = moment(startDay).add(roundStartOffsets[ri]);
    var round = await Round.create({
      numRound: ri + 2,
      matches: [],
      startTime: roundStart.toDate(),
    });

    var matchNumStart = Math.pow(2, numRounds) - Math.pow(2, numRounds - (ri + 1));
    var matchesThisRound = Math.pow(2, numRounds - (ri + 2));
    for (var mj = 0; mj < matchesThisRound; mj++) {
      var mn = matchNumStart + mj + 1;
      var newMatch = await Match.create({
        matchNumber: mn,
        topTeam: null,
        bottomTeam: null,
        nextMatch: Math.floor(0.5 * (mn + teamNames.length + 1)),
      });
      round.matches.addToSet(newMatch);
    }
    await round.save();
    tournament.rounds.push(round);
  }

  tournament.rounds.sort(function (a, b) { return a.numRound - b.numRound; });
  await tournament.save();
  console.log("[SEED-FF] Tournament created with " + teams.length + " teams, " + tournament.rounds.length + " rounds");

  // 4. Create tournament group (Seth as commissioner)
  var group = await TournamentGroup.create({
    year: year,
    groupName: "McNaughton Family Group " + year,
    commissioner: { id: seth._id, name: seth.firstName },
    groupMotto: "Seeded test group",
    secretCode: "test",
    publicGroup: false,
    tournamentReference: { id: tournament._id, year: year },
    userMatchAggregates: [],
    bonusAggregates: [],
    currentRound: 1,
    comments: [],
    isOfficial: true,
  });
  console.log("[SEED-FF] Group created: " + group.groupName);

  // 5. Join both users to the group and make random picks
  var populatedTournament = await Tournament.findById(tournament._id)
    .populate({ path: "rounds", populate: { path: "matches", populate: [{ path: "topTeam" }, { path: "bottomTeam" }] } });

  for (var user of [seth, daniel]) {
    // Create UserTournament
    var ut = await UserTournament.create({
      score: 0,
      tournamentGroup: { id: group._id, groupName: group.groupName },
      user: { id: user._id, firstName: user.firstName, lastName: user.lastName, username: user.username },
      tournamentReference: { id: tournament._id, year: year },
      userRounds: [],
    });
    group.userTournaments.addToSet(ut);
    user.tournamentGroups.push({ id: group._id, groupName: group.groupName, year: year, isOfficial: true });
    await user.save();

    // Make R1 picks (random)
    var r1 = populatedTournament.rounds[0];
    var r1Preds = [];
    for (var match of r1.matches) {
      var pick = Math.random() < 0.5 ? match.topTeam : match.bottomTeam;
      r1Preds.push({
        score: 0,
        numRound: 1,
        winner: pick._id,
        match: { id: match._id, matchNumber: match.matchNumber },
        comment: "",
      });
    }
    var createdR1Preds = await UserMatchPrediction.insertMany(r1Preds);
    var r1UserRound = await UserRound.create({
      roundScore: 0,
      round: { id: r1._id, numRound: 1 },
      userMatchPredictions: createdR1Preds.map(function (p) { return p._id; }),
    });
    ut.userRounds.push(r1UserRound);

    // Make Final Four picks (R7) — one team per region (random from R1 teams)
    var ffPreds = [];
    for (var reg = 0; reg < 4; reg++) {
      var regionTeams = teams.slice(reg * 16, (reg + 1) * 16);
      var ffPick = regionTeams[Math.floor(Math.random() * regionTeams.length)];
      var ffMatchNum = 57 + reg; // matches 57-60 are the Elite 8 matches that feed Final Four
      ffPreds.push({
        score: 0,
        numRound: 7,
        winner: ffPick._id,
        match: { id: r1.matches[reg * 8]._id, matchNumber: ffMatchNum },
        comment: "",
      });
    }
    var createdFFPreds = await UserMatchPrediction.insertMany(ffPreds);
    var ffUserRound = await UserRound.create({
      roundScore: 0,
      round: { id: r1._id, numRound: 7 },
      userMatchPredictions: createdFFPreds.map(function (p) { return p._id; }),
    });
    ut.userRounds.push(ffUserRound);

    // Make Champion pick (R8) — one of the Final Four picks
    var champPick = ffPreds[Math.floor(Math.random() * ffPreds.length)];
    var champPred = await UserMatchPrediction.create({
      score: 0,
      numRound: 8,
      winner: champPick.winner,
      match: { id: r1.matches[0]._id, matchNumber: 63 },
      comment: "",
    });
    var champUserRound = await UserRound.create({
      roundScore: 0,
      round: { id: r1._id, numRound: 8 },
      userMatchPredictions: [champPred._id],
    });
    ut.userRounds.push(champUserRound);

    await ut.save();

    // Create UserMatchAggregates for R1 picks
    for (var pi = 0; pi < createdR1Preds.length; pi++) {
      var pred = createdR1Preds[pi];
      var match = r1.matches[pi];
      var aggScores = scoring.calculateAggregateScores(match.topTeam.seed, match.bottomTeam.seed, 1);

      var agg = await UserMatchAggregate.findOne({ matchReference: match._id, tournamentGroup: group._id });
      if (!agg) {
        agg = await UserMatchAggregate.create({
          matchNumber: match.matchNumber,
          matchReference: match._id,
          tournamentGroup: group._id,
          topTeamPickers: [],
          bottomTeamPickers: [],
          topWinScore: aggScores.topWinScore,
          topLossScore: aggScores.topLossScore,
          bottomWinScore: aggScores.bottomWinScore,
          bottomLossScore: aggScores.bottomLossScore,
        });
        group.userMatchAggregates.push(agg);
      }

      var pickerEntry = { id: user._id, firstName: user.firstName, comment: "" };
      if (pred.winner.equals(match.topTeam._id)) {
        agg.topTeamPickers.push(pickerEntry);
      } else {
        agg.bottomTeamPickers.push(pickerEntry);
      }
      await agg.save();
    }

    // Create BonusAggregates for FF + Champ picks
    var allBonusPreds = createdFFPreds.concat([champPred]);
    for (var bp of allBonusPreds) {
      var pickedTeam = await Team.findById(bp.winner);
      if (!pickedTeam) continue;

      var bonusAgg = await BonusAggregate.findOne({
        "team.id": pickedTeam._id,
        matchReference: bp.match.id,
        tournamentGroup: group._id,
      });
      if (!bonusAgg) {
        bonusAgg = await BonusAggregate.create({
          matchNumber: bp.match.matchNumber,
          matchReference: bp.match.id,
          tournamentGroup: group._id,
          team: { id: pickedTeam._id, name: pickedTeam.name, image: pickedTeam.image },
          teamPickers: [],
        });
        group.bonusAggregates.push(bonusAgg);
      }
      bonusAgg.teamPickers.push({ id: user._id, firstName: user.firstName, comment: "" });
      await bonusAgg.save();
    }

    console.log("[SEED-FF] " + user.firstName + ": R1 (32 picks) + FF (4 picks) + Champ (1 pick) created");
  }

  await group.save();
  console.log("[SEED-FF] Done! Tournament is ready for Round 1 games.");
}

module.exports = seedDB;
module.exports.seedFastForward = seedFastForward;
