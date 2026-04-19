var cheerio = require("cheerio");
var moment = require("moment-timezone");
var middleware = require("./middleware");

// Inspiration from https://www.digitalocean.com/community/tutorials/how-to-use-node-js-request-and-cheerio-to-set-up-simple-web-scraping
async function scrape(dateStr) {
  logTimeToConsole();
  var url = dateStr
    ? "https://www.cbssports.com/college-basketball/scoreboard/FBS/" + dateStr + "/"
    : "https://www.cbssports.com/college-basketball/scoreboard/";

  try {
    var response = await fetch(url);
    if (!response.ok) return;

    var html = await response.text();
    var $ = cheerio.load(html);
    var parsedResults = [];

    $("div.live-update").each(function (i, element) {
      var a = $(this);
      var final = a.find(".top-bar").text().trim();
      var team1 = a
        .find(".in-progress-table")
        .find("td.team")
        .first()
        .find("a")
        .text();
      var score1 = a
        .find(".in-progress-table")
        .find("td.team")
        .first()
        .parent()
        .children()
        .last()
        .text();

      var team2 = a
        .find(".in-progress-table")
        .find("td.team")
        .last()
        .find("a")
        .text();
      var score2 = a
        .find(".in-progress-table")
        .find("td.team")
        .last()
        .parent()
        .children()
        .last()
        .text();

      var winner = Number(score1) > Number(score2) ? team1 : team2;

      var metadata = {
        team1: team1,
        team2: team2,
        winner: winner,
      };
      if (final.toLowerCase().includes("final"))
        parsedResults.push(metadata);
    });

    await middleware.scrapeUpdateResults(parsedResults);

    // Also scrape start times for games that haven't finished yet
    var startTimes = parseStartTimes($, dateStr);
    if (startTimes.length > 0) {
      await middleware.updateMatchStartTimes(startTimes);
    }

    // lockDraftPicksForStartedGames is called inside scrapeUpdateResults:
    // - When games finish: runs inside updateResults (between advance and scoring)
    // - When no games finish: runs in the else branch (for start-time-only locks)
  } catch (err) {
    console.log("[SCRAPE] Error fetching:", err.message);
  }
}

// Scrape only start times (used for pre-tipoff scrapes before games begin)
async function scrapeStartTimes(dateStr) {
  logTimeToConsole();
  console.log("[SCRAPE] Fetching start times for " + (dateStr || "today"));
  var url = dateStr
    ? "https://www.cbssports.com/college-basketball/scoreboard/FBS/" + dateStr + "/"
    : "https://www.cbssports.com/college-basketball/scoreboard/";

  try {
    var response = await fetch(url);
    if (!response.ok) return;

    var html = await response.text();
    var $ = cheerio.load(html);
    var startTimes = parseStartTimes($, dateStr);

    if (startTimes.length > 0) {
      middleware.updateMatchStartTimes(startTimes);
    }
  } catch (err) {
    console.log("[SCRAPE] Error fetching start times:", err.message);
  }
}

// Parse start times from CBS scoreboard HTML
// CBS shows upcoming games with times like "7:10 PM ET" in the .top-bar
// Games in progress show "Halftime", "2nd Half", etc.
// Completed games show "Final", "Final/OT", etc.
function parseStartTimes($, dateStr) {
  var results = [];

  $("div.live-update").each(function () {
    var a = $(this);
    var topBarText = a.find(".top-bar").text().trim();

    var team1 = a
      .find(".in-progress-table")
      .find("td.team")
      .first()
      .find("a")
      .text();
    var team2 = a
      .find(".in-progress-table")
      .find("td.team")
      .last()
      .find("a")
      .text();

    if (!team1 || !team2) return;

    // Try to parse a time like "7:10 PM ET" or "12:15 PM ET"
    var timeMatch = topBarText.match(/(\d{1,2}:\d{2}\s*(AM|PM)\s*ET)/i);
    if (timeMatch) {
      var timeStr = timeMatch[1].replace(/\s+/g, " ").trim();
      // Build a full datetime from the date + time
      var dateBase = dateStr || moment().tz("America/New_York").format("YYYYMMDD");
      var year = dateBase.substring(0, 4);
      var month = dateBase.substring(4, 6);
      var day = dateBase.substring(6, 8);
      var fullTimeStr = year + "-" + month + "-" + day + " " + timeStr;
      var parsed = moment.tz(fullTimeStr, "YYYY-MM-DD h:mm A", "America/New_York");

      if (parsed.isValid()) {
        results.push({
          team1: team1,
          team2: team2,
          startTime: parsed.toDate(),
        });
      }
    }
  });

  console.log("[SCRAPE] Found " + results.length + " game start times");
  return results;
}

function logTimeToConsole() {
  const now = new Date();
  const formattedDate = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")}`;
  const formattedTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

  // Get timezone offset in hours and minutes
  const timezoneOffsetHours = Math.abs(Math.floor(now.getTimezoneOffset() / 60))
    .toString()
    .padStart(2, "0");
  const timezoneOffsetMinutes = Math.abs(now.getTimezoneOffset() % 60)
    .toString()
    .padStart(2, "0");
  const timezoneOffsetSign = now.getTimezoneOffset() > 0 ? "-" : "+";

  const timezoneString = `${timezoneOffsetSign}${timezoneOffsetHours}:${timezoneOffsetMinutes}`;

  console.log(
    "Scraping: " + formattedDate + " " + formattedTime + " " + timezoneString,
  );
}

module.exports = scrape;
module.exports.scrapeStartTimes = scrapeStartTimes;
module.exports.parseStartTimes = parseStartTimes;
