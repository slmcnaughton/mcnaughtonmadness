/**
 * CBS Name Discovery Script
 *
 * Scrapes CBS Sports scoreboard pages and collects all unique team names.
 * Cross-references each name against the alias map to find unresolved names
 * that would cause scoring mismatches during the tournament.
 *
 * Run standalone:  node helpers/scrapeCbsNames.js
 *
 * Optional: pass a comma-separated list of team names to test against:
 *   node helpers/scrapeCbsNames.js "UConn,Michigan St.,N. Carolina,Duke"
 */

var request = require("request");
var cheerio = require("cheerio");
var teamAliases = require("./teamAliases");

// ─── Configuration ──────────────────────────────────────────────────────────

// Scrape February + March of current year (covers conference + tournament play)
var year = new Date().getFullYear();
var months = [
  { year: year, month: "02", days: 28 },
  { year: year, month: "03", days: 31 },
];

// If team names are passed via CLI, use those as the reference list
var cliTeamNames = process.argv[2]
  ? process.argv[2].split(",").map(function (n) { return n.trim(); })
  : null;

// ─── Scraping ───────────────────────────────────────────────────────────────

var allCbsNames = {};  // name → count of appearances
var completed = 0;
var total = 0;

// Build list of URLs to scrape
var urls = [];
months.forEach(function (m) {
  for (var day = 1; day <= m.days; day++) {
    var dayStr = day < 10 ? "0" + day : "" + day;
    var extension = m.year + m.month + dayStr;
    urls.push(
      "https://www.cbssports.com/college-basketball/scoreboard/all/" +
        extension +
        "/"
    );
  }
});

total = urls.length;
console.log("Scraping " + total + " CBS scoreboard pages...\n");

// Process URLs sequentially to avoid rate limiting
var urlIndex = 0;

function scrapeNext() {
  if (urlIndex >= urls.length) {
    reportResults();
    return;
  }

  var url = urls[urlIndex];
  urlIndex++;

  request(url, function (error, response, html) {
    completed++;
    if (completed % 10 === 0) {
      process.stdout.write("  " + completed + "/" + total + " pages scraped\r");
    }

    if (!error && response && response.statusCode === 200) {
      var $ = cheerio.load(html);

      $("div.live-update").each(function () {
        var a = $(this);
        var team1 = a
          .find(".in-progress-table")
          .find("td.team")
          .first()
          .find("a")
          .text()
          .trim();
        var team2 = a
          .find(".in-progress-table")
          .find("td.team")
          .last()
          .find("a")
          .text()
          .trim();

        if (team1) allCbsNames[team1] = (allCbsNames[team1] || 0) + 1;
        if (team2) allCbsNames[team2] = (allCbsNames[team2] || 0) + 1;
      });
    }

    // Small delay to be polite to CBS servers
    setTimeout(scrapeNext, 200);
  });
}

scrapeNext();

// ─── Reporting ──────────────────────────────────────────────────────────────

function reportResults() {
  var names = Object.keys(allCbsNames).sort();
  console.log("\n\nFound " + names.length + " unique team names on CBS.\n");

  // Resolve each name through the alias map
  var resolved = {};   // canonical → [original CBS names]
  var unresolved = []; // names not in the alias map (still might match via normalize)

  names.forEach(function (name) {
    var norm = teamAliases.normalize(name);
    var canonical = teamAliases.aliasMap[norm];
    if (canonical) {
      if (!resolved[canonical]) resolved[canonical] = [];
      resolved[canonical].push(name);
    } else {
      unresolved.push(name);
    }
  });

  // If reference team names were provided, test each one
  if (cliTeamNames) {
    console.log("═══════════════════════════════════════════════════════════");
    console.log("  TESTING AGAINST PROVIDED TEAM NAMES (" + cliTeamNames.length + " teams)");
    console.log("═══════════════════════════════════════════════════════════\n");

    var matched = [];
    var unmatched = [];

    cliTeamNames.forEach(function (dbName) {
      var foundMatch = false;
      for (var i = 0; i < names.length; i++) {
        if (teamAliases.teamsMatch(dbName, names[i])) {
          matched.push({ db: dbName, cbs: names[i] });
          foundMatch = true;
          break;
        }
      }
      if (!foundMatch) {
        unmatched.push(dbName);
      }
    });

    console.log("MATCHED (" + matched.length + "/" + cliTeamNames.length + "):");
    matched.forEach(function (m) {
      if (teamAliases.normalize(m.db) === teamAliases.normalize(m.cbs)) {
        console.log("  " + m.db + "  (exact)");
      } else {
        console.log("  " + m.db + "  <-->  " + m.cbs + "  (via alias)");
      }
    });

    if (unmatched.length > 0) {
      console.log("\n!! UNMATCHED (" + unmatched.length + ") — these need aliases:");
      unmatched.forEach(function (name) {
        console.log("  " + name + "  (resolves to: " + teamAliases.resolveTeamName(name) + ")");
      });
    } else {
      console.log("\nAll team names matched!");
    }
  }

  // Always show the full CBS name report
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  ALL CBS TEAM NAMES (" + names.length + " unique)");
  console.log("═══════════════════════════════════════════════════════════\n");

  console.log("IN ALIAS MAP (" + Object.keys(resolved).length + " canonical groups):");
  Object.keys(resolved).sort().forEach(function (canonical) {
    console.log("  " + canonical + ":  " + resolved[canonical].join(", "));
  });

  if (unresolved.length > 0) {
    console.log("\nNOT IN ALIAS MAP (" + unresolved.length + " names):");
    console.log("  (These use their normalized form for matching — fine if DB uses the same name)");
    unresolved.forEach(function (name) {
      console.log("  " + name + "  →  \"" + teamAliases.normalize(name) + "\"  (seen " + allCbsNames[name] + "x)");
    });
  }

  console.log("\nDone.");
}
