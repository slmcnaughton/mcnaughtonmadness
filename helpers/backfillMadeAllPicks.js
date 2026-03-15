/**
 * One-time backfill script: sets madeAllPicks on historical trophies.
 *
 * For each trophy year, finds the maximum number of userRounds any participant
 * completed, then marks each user's trophy based on whether they completed
 * that many rounds.
 *
 * Usage:
 *   node helpers/backfillMadeAllPicks.js
 *
 * Requires DATABASEURL environment variable to be set (or .env file).
 * Safe to re-run — only updates trophies where madeAllPicks is null.
 */

require("dotenv").config();
var mongoose = require("mongoose");
var async = require("async");
var Trophy = require("../models/trophy");
var User = require("../models/user");
var UserTournament = require("../models/userTournament");
var TournamentGroup = require("../models/tournamentGroup");

var dbUrl = process.env.DATABASEURL || "mongodb://localhost/mcnaughtonmadness";
console.log("Connecting to:", dbUrl.replace(/\/\/.*@/, "//***@"));

mongoose.connect(dbUrl, { useNewUrlParser: true, useUnifiedTopology: true });

mongoose.connection.on("connected", function () {
  console.log("Connected to MongoDB.\n");
  run();
});

mongoose.connection.on("error", function (err) {
  console.error("MongoDB connection error:", err);
  process.exit(1);
});

function run() {
  // 1. Find all trophies that need backfill (madeAllPicks is null/undefined)
  Trophy.find({ madeAllPicks: null }, function (err, trophies) {
    if (err) {
      console.error("Error finding trophies:", err);
      return process.exit(1);
    }

    if (trophies.length === 0) {
      console.log("No trophies need backfill. All done!");
      return process.exit(0);
    }

    console.log("Found " + trophies.length + " trophies to backfill.\n");

    // 2. Group trophies by year
    var byYear = {};
    trophies.forEach(function (t) {
      if (!byYear[t.year]) byYear[t.year] = [];
      byYear[t.year].push(t);
    });

    var years = Object.keys(byYear).sort();
    console.log("Years to process: " + years.join(", ") + "\n");

    // 3. Process each year
    async.eachSeries(
      years,
      function (year, nextYear) {
        var yearTrophies = byYear[year];
        console.log("── " + year + " (" + yearTrophies.length + " trophies) ──");

        // Find all tournament groups for this year
        TournamentGroup.find({ year: parseInt(year) }, function (err, groups) {
          if (err || !groups || groups.length === 0) {
            console.log("  No tournament groups found for " + year + ". Marking all as unknown (null).");
            return nextYear();
          }

          var groupIds = groups.map(function (g) { return g._id; });

          // Find all userTournaments for these groups, with userRounds populated
          UserTournament.find({ "tournamentGroup.id": { $in: groupIds } })
            .populate("userRounds")
            .populate({ path: "user.id" })
            .exec(function (err, userTournaments) {
              if (err || !userTournaments || userTournaments.length === 0) {
                console.log("  No user tournaments found for " + year + ". Skipping.");
                return nextYear();
              }

              // Find max rounds any participant completed this year
              var maxRounds = 0;
              userTournaments.forEach(function (ut) {
                var roundCount = ut.userRounds ? ut.userRounds.length : 0;
                if (roundCount > maxRounds) maxRounds = roundCount;
              });

              console.log("  Max rounds completed by any participant: " + maxRounds);

              if (maxRounds === 0) {
                console.log("  No round data found. Skipping.");
                return nextYear();
              }

              // Build a lookup: "firstName|lastName" → max round count across all groups
              var userRoundCounts = {};
              userTournaments.forEach(function (ut) {
                var key = ut.user.firstName + "|" + ut.user.lastName;
                var roundCount = ut.userRounds ? ut.userRounds.length : 0;
                if (!userRoundCounts[key] || roundCount > userRoundCounts[key]) {
                  userRoundCounts[key] = roundCount;
                }
              });

              // Update each trophy for this year
              var updated = 0;
              var notFound = 0;

              async.eachSeries(
                yearTrophies,
                function (trophy, nextTrophy) {
                  // Find the user who owns this trophy
                  User.findOne({ trophies: trophy._id }, function (err, user) {
                    if (err || !user) {
                      console.log("  [?] No user found for trophy " + trophy._id);
                      notFound++;
                      return nextTrophy();
                    }

                    var key = user.firstName + "|" + user.lastName;
                    var roundCount = userRoundCounts[key];

                    if (roundCount === undefined) {
                      // User's tournament data not found (maybe deleted account that was merged)
                      console.log("  [?] No round data for " + key + " — leaving as null");
                      return nextTrophy();
                    }

                    var madeAll = roundCount >= maxRounds;
                    trophy.madeAllPicks = madeAll;
                    trophy.save(function (err) {
                      if (err) console.log("  Error saving trophy:", err);
                      else updated++;
                      if (!madeAll) {
                        console.log("  [X] " + user.firstName + " " + user.lastName + " — " + roundCount + "/" + maxRounds + " rounds → MISSED PICKS");
                      }
                      nextTrophy();
                    });
                  });
                },
                function () {
                  console.log("  Updated: " + updated + ", Not found: " + notFound + "\n");
                  nextYear();
                },
              );
            });
        });
      },
      function () {
        console.log("Backfill complete!");
        process.exit(0);
      },
    );
  });
}
