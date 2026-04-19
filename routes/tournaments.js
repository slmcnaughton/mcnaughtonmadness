var express = require("express");
var router = express.Router();
var moment = require("moment-timezone");
var middleware = require("../middleware");
var Tournament = require("../models/tournament");
var Round = require("../models/round");
var Match = require("../models/match");
var Team = require("../models/team");
var TeamImage = require("../models/teamImage");
var Scrape = require("../models/scrape");
var scrape = require("../scrape");
var schedule = require("node-schedule");
var emailHelper = require("../middleware/emailHelper");
var teamAliases = require("../helpers/teamAliases");

//Page:  /tournaments

//INDEX - show all Tournaments
router.get("/", async function (req, res) {
  try {
    //get all tournaments from db
    var allTournaments = await Tournament.find({});
    res.render("tournaments/index", {
      tournaments: allTournaments,
      moment: moment,
      page: "tournaments",
    }); //rename the page when I do the navbar
  } catch (err) {
    console.log(err);
  }
});

//NEW - show form to create new tournament
router.get("/new", middleware.isLoggedIn, function (req, res) {
  res.render("tournaments/new", { page: "tournaments" });
});

//CREATE -
router.post("/", middleware.isLoggedIn, async function (req, res) {
  try {
    var year = 2026;

    var regions = ["East", "South", "West", "Midwest"];
    // ── TEST MODE: round 1 starts 10 min from now ──────────────────────
    // var startDay = moment().add(10, "minutes");
    // ── PRODUCTION: uncomment for actual tournament start ──────────────
    // the month of March is actually 2
    var startDay = moment.tz([2026, 2, 19], "America/New_York");
    var order = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15];
    var numRounds = Math.log(teamNames.length) / Math.log(2); //the number of rounds needed for a 64 team tournament is logbase2(64) = 6

    var createdTournament = await Tournament.create({
      year: year,
      numTeams: teamNames.length,
      rounds: [],
      regions: regions,
      currentRound: 1,
      scrapes: [],
      emailPickReminderJobs: [],
    });

    // ====================================================
    // PART 1: Create Round 1, Matches, and Teams
    // ====================================================
    var createdRound = await Round.create({
      numRound: 1,
      matches: [],
      // TEST MODE: use startDay directly (10 min from now)
      // startTime: startDay.toDate(),
      // PRODUCTION: uncomment for actual tournament start
      startTime: moment.tz(
        [startDay.year(), startDay.month(), startDay.date(), 12, 15],
        "America/New_York",
      ),
    });

    //Schedule email reminders for the round
    var emailSendTime = moment(createdRound.startTime).add({
      hours: -2,
    });
    var k = schedule.scheduleJob(
      emailSendTime,
      emailHelper.sendPickReminderEmail,
    );
    var createdJob = await Scrape.create({ date: emailSendTime });
    createdTournament.emailPickReminderJobs.push(createdJob);

    //Add two days of round 1 scrape listener
    for (var i = 0; i < 2; i++) {
      var startTime = new moment(createdRound.startTime).add({
        d: i,
        h: 0,
        m: 0,
      });
      var endTime = new moment(startTime).add(15, "h");
      var job = {
        start: startTime,
        end: endTime,
        rule: "0 */1 * * * *",
      };
      var j = schedule.scheduleJob(job, function () {
        scrape();
      });
      var createdScrapeJob = await Scrape.create(job);
      createdTournament.scrapes.push(createdScrapeJob);
    }

    // ==========================================================
    // 1) Use array of teamNames and order of seeds to create array of teams
    // ==========================================================
    var teams = [];
    var allTeamImages = await TeamImage.find({});
    allTeamImages = allTeamImages || [];

    var i = 0;
    for (var teamName of teamNames) {
      var matched = allTeamImages.find(function (ti) {
        return teamAliases.teamsMatch(teamName, ti.name, []);
      });
      var team = {
        region: regions[Math.floor(i / order.length)],
        name: teamName,
        seed: order[i % order.length],
        firstMatchNum: Math.floor(i / 2) + 1,
        lost: 0,
      };
      if (matched) {
        team.image = matched.image;
      }
      var newTeam = await Team.create(team);
      teams.push(newTeam);
      i++;
    }

    // ==========================================================
    // 2) Create and fill matches with teams array
    // ==========================================================
    var i = 1;
    for (var team of teams) {
      if (i % 2 === 1) {
        var matchNumber = Math.floor((i - 1) / 2) + 1;
        var newMatch = await Match.create({
          matchNumber: matchNumber,
          topTeam: team,
          bottomTeam: null,
          nextMatch: Math.floor(
            0.5 * (matchNumber + teams.length + 1),
          ),
        });
        createdRound.matches.addToSet(newMatch);
        i++;
      } else {
        var location = Math.floor((i - 1) / 2);
        createdRound.matches[location].bottomTeam = team;
        await createdRound.matches[location].save();
        i++;
      }
    }
    createdTournament.rounds.push(createdRound);
    await createdRound.save();

    // ====================================================
    // PART 2: Create remaining rounds and matches
    // ====================================================

    // ==========================================================
    // 3) Create remaining rounds
    // ==========================================================
    for (var i = 0; i < numRounds - 1; i++) {
      var startTime;
      // year         month           day      hour  min
      // Regular Year (2021 had a weird schedule)
      if (i == 0)
        startTime = moment(startDay).add(
          { days: 2, hours: 12, minutes: 10 },
          "America/New_York",
        );
      else if (i == 1)
        startTime = moment(startDay).add(
          { days: 7, hours: 19, minutes: 9 },
          "America/New_York",
        );
      else if (i == 2)
        startTime = moment(startDay).add(
          { days: 9, hours: 18, minutes: 9 },
          "America/New_York",
        );
      else if (i == 3)
        startTime = moment(startDay).add(
          { days: 16, hours: 18, minutes: 9 },
          "America/New_York",
        );
      else if (i == 4)
        startTime = moment(startDay).add(
          { days: 18, hours: 21, minutes: 20 },
          "America/New_York",
        );

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

      var createdRound = await Round.create({
        numRound: i + 2, //i = 0 should be round 2
        matches: [],
        startTime: startTime,
      });

      //Schedule email reminders for the round
      var emailSendTime = moment(createdRound.startTime).add({ hours: -2 });
      var k = schedule.scheduleJob(
        emailSendTime,
        emailHelper.sendPickReminderEmail,
      );
      var createdJob = await Scrape.create({ date: emailSendTime });
      createdTournament.emailPickReminderJobs.push(createdJob);

      //Add round scrape listeners
      for (var j = 0; j < 2; j++) {
        var scrapeStartTime;
        if ((i === 1 || i === 2) && j === 1)
          //Second day of Sweet 16/Elite 8 starts earlier than day 1 (games often tip off around noon)
          scrapeStartTime = new moment(createdRound.startTime).add({
            d: 1,
            h: -4,
            m: 0,
          });
        else
          scrapeStartTime = new moment(createdRound.startTime).add({
            d: j,
            h: 0,
            m: 0,
          });

        var endTime;
        if (i === 0) {
          //Round 2
          endTime = new moment(scrapeStartTime).add(15, "h");
        } else if (i < 3) {
          //Sweet 16, Elite 8; (2 time slots)
          endTime = new moment(scrapeStartTime).add(12, "h");
        }

        //2 final four matchups
        else if (i === 3) {
          endTime = new moment(scrapeStartTime).add(12, "h");
          j++; //only 1 day of final four
        }
        //championship match
        else {
          endTime = new moment(scrapeStartTime).add(5, "h"); //Ends 1 + 3  = 4 hours after roundStart
          j++;
        }

        var job = {
          start: scrapeStartTime,
          end: endTime,
          rule: "0 */1 * * * *",
        };

        //create the job
        var k = schedule.scheduleJob(job, function () {
          scrape();
        });
        //save the scrape-job information to the database for persistence; called to reschedule the job in app.js when the app is restarted
        var createdScrapeJob = await Scrape.create(job);
        createdTournament.scrapes.push(createdScrapeJob);
      }

      createdTournament.rounds.addToSet(createdRound);
    }

    // ==========================================================
    // 4) Create remaining matches with correct matchNumbers and nextMatch references...no teams yet
    // ==========================================================
    for (var round of createdTournament.rounds) {
      if (round.numRound !== 1) {
        var matchNumStart =
          Math.pow(2, numRounds) -
          Math.pow(2, numRounds + 1 - round.numRound) +
          1; //1, 33, 49, 57, 61, 63
        var matchesThisRound = Math.pow(
          2,
          numRounds - round.numRound,
        );
        for (var j = 0; j < matchesThisRound; j++) {
          var newMatch = await Match.create({
            matchNumber: matchNumStart + j,
            topTeam: null,
            bottomTeam: null,
            nextMatch: Math.floor(
              0.5 *
                (matchNumStart +
                  j +
                  teamNames.length +
                  1),
            ),
          });
          round.matches.addToSet(newMatch);
        }
        await round.save();
      }
    }

    createdTournament.rounds.sort(compare);

    // ==========================================================
    // 5) Schedule pre-tipoff start time scrapes and auto-submit jobs for each round
    // ==========================================================
    for (var round of createdTournament.rounds) {
      var roundStart = moment(round.startTime);

      // Pre-tipoff scrape: Day 1 (2-3 hours before round starts)
      var day1ScrapeTime = moment(roundStart).subtract(3, "hours");
      var day1DateStr = roundStart.format("YYYYMMDD");
      var day2DateStr = moment(roundStart).add(1, "days").format("YYYYMMDD");

      // Schedule Day 1 pre-tipoff scrape
      schedule.scheduleJob(day1ScrapeTime.toDate(), function () {
        var d1 = day1DateStr;
        var d2 = day2DateStr;
        scrape.scrapeStartTimes(d1);
        scrape.scrapeStartTimes(d2); // Attempt Day 2 (may not be available yet)
      });
      var day1Job = await Scrape.create({ date: day1ScrapeTime.toDate() });
      createdTournament.startTimeScrapeJobs.push(day1Job);

      // Pre-tipoff scrape: Day 2 (8 AM ET on Day 2)
      // Only for multi-day rounds (rounds 1-4)
      if (round.numRound <= 4) {
        var day2ScrapeTime = moment(roundStart).add(1, "days").startOf("day").add(8, "hours");
        schedule.scheduleJob(day2ScrapeTime.toDate(), function () {
          var d2 = day2DateStr;
          scrape.scrapeStartTimes(d2);
        });
        var day2Job = await Scrape.create({ date: day2ScrapeTime.toDate() });
        createdTournament.startTimeScrapeJobs.push(day2Job);
      }

      // Auto-submit drafts: runs 5 minutes after each round's startTime
      var autoSubmitTime = moment(roundStart).add(5, "minutes");
      schedule.scheduleJob(autoSubmitTime.toDate(), function () {
        middleware.autoSubmitDrafts();
      });
      var autoSubmitJob = await Scrape.create({ date: autoSubmitTime.toDate() });
      createdTournament.autoSubmitJobs.push(autoSubmitJob);
    }

    await createdTournament.save();
    res.redirect("/tournaments");
  } catch (err) {
    console.log(err);
  }
});

//Note: this must be below the /tournaments/new route
//SHOW - shows more information about a particular tournament
router.get("/:year", async function (req, res) {
  try {
    var year = req.params.year;
    var foundTournament = await Tournament.findOne({ year: year })
      .populate({
        path: "rounds",
        populate: { path: "matches", populate: { path: "topTeam" } },
      })
      .populate({
        path: "rounds",
        populate: { path: "matches", populate: { path: "bottomTeam" } },
      })
      .populate("champion");

    if (!foundTournament) {
      req.flash("error", "Tournament not found");
      return res.redirect("/tournaments");
    }
    res.render("tournaments/show", {
      tournament: foundTournament,
      page: "tournaments",
    });
  } catch (err) {
    req.flash("error", "Tournament not found");
    return res.redirect("/tournaments");
  }
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
function compare(a, b) {
  if (a.numRound < b.numRound) return -1;
  else if (a.numRound > b.numRound) return 1;
  return 0;
}

//order teams correctly by matchNum from lowest to highest
function compareTeams(a, b) {
  // console.log(a.firstMatchNum + " " + b.firstMatchNum);
  if (a.firstMatchNum < b.firstMatchNum) return -1;
  else if (a.firstMatchNum > b.firstMatchNum) return 1;
  return 0;
}

var teamNames = [
  // ── East (1v16, 8v9, 5v12, 4v13, 6v11, 3v14, 7v10, 2v15) ──
  "Duke",
  "Siena",
  "Ohio St.",
  "TCU",
  "St. John's",
  "N. Iowa",
  "Kansas",
  "Cal Baptist",
  "Louisville",
  "South Florida",
  "Michigan St.",
  "N. Dakota St.",
  "UCLA",
  "UCF",
  "UConn",
  "Furman",

  // ── South ──
  "Florida",
  "Prairie View/Lehigh",
  "Clemson",
  "Iowa",
  "Vanderbilt",
  "McNeese",
  "Nebraska",
  "Troy",
  "N. Carolina",
  "VCU",
  "Illinois",
  "Penn",
  "Saint Mary's",
  "Texas A&M",
  "Houston",
  "Idaho",

  // ── West ──
  "Arizona",
  "LIU",
  "Villanova",
  "Utah St.",
  "Wisconsin",
  "High Point",
  "Arkansas",
  "Hawaii",
  "BYU",
  "Texas/NC State",
  "Gonzaga",
  "Kennesaw St.",
  "Miami",
  "Missouri",
  "Purdue",
  "Queens",

  // ── Midwest ──
  "Michigan",
  "UMBC/Howard",
  "Georgia",
  "Saint Louis",
  "Texas Tech",
  "Akron",
  "Alabama",
  "Hofstra",
  "Tennessee",
  "Miami (Ohio)/SMU",
  "Virginia",
  "Wright St.",
  "Kentucky",
  "Santa Clara",
  "Iowa St.",
  "Tennessee St.",
];

module.exports = router;
