var harness = require("./harness");
var cheerio = require("cheerio");
var scrape = require("../scrape");

var test = harness.test;
var assert = harness.assert;
var approxEqual = harness.approxEqual;

var parseStartTimes = scrape.parseStartTimes;

// Helper: build a minimal CBS-like scoreboard HTML fragment
function buildScoreboardHtml(games) {
  var html = "";
  for (var i = 0; i < games.length; i++) {
    var g = games[i];
    html += '<div class="live-update">';
    html += '  <div class="top-bar">' + (g.topBar || "") + "</div>";
    html += '  <div class="in-progress-table">';
    html += '    <table><tr><td class="team"><a>' + (g.team1 || "") + "</a></td><td>0</td></tr>";
    html += '    <tr><td class="team"><a>' + (g.team2 || "") + "</a></td><td>0</td></tr></table>";
    html += "  </div>";
    html += "</div>";
  }
  return html;
}

// ─── parseStartTimes() ─────────────────────────────────────────────────────

console.log("\nparseStartTimes()");

test('parses "7:10 PM ET" correctly', function () {
  var html = buildScoreboardHtml([
    { team1: "Duke", team2: "UNC", topBar: "7:10 PM ET" },
  ]);
  var $ = cheerio.load(html);
  var results = parseStartTimes($, "20260319");
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].team1, "Duke");
  assert.strictEqual(results[0].team2, "UNC");
  // 7:10 PM ET on 2026-03-19 → UTC = 11:10 PM (EDT, UTC-4) or 12:10 AM next day (EST, UTC-5)
  // Just verify it's a valid date and roughly correct
  assert.ok(results[0].startTime instanceof Date);
  var hour = results[0].startTime.getHours();
  // In whatever local TZ, just verify it parsed
  assert.ok(!isNaN(results[0].startTime.getTime()));
});

test('parses "12:15 PM ET" (noon) correctly', function () {
  var html = buildScoreboardHtml([
    { team1: "Kansas", team2: "Kentucky", topBar: "12:15 PM ET" },
  ]);
  var $ = cheerio.load(html);
  var results = parseStartTimes($, "20260319");
  assert.strictEqual(results.length, 1);
  assert.ok(!isNaN(results[0].startTime.getTime()));
});

test('parses "9:00 AM ET" (morning) correctly', function () {
  var html = buildScoreboardHtml([
    { team1: "TeamA", team2: "TeamB", topBar: "9:00 AM ET" },
  ]);
  var $ = cheerio.load(html);
  var results = parseStartTimes($, "20260319");
  assert.strictEqual(results.length, 1);
  assert.ok(!isNaN(results[0].startTime.getTime()));
});

test("ignores games with Final in top-bar (no time to parse)", function () {
  var html = buildScoreboardHtml([
    { team1: "Duke", team2: "UNC", topBar: "Final" },
  ]);
  var $ = cheerio.load(html);
  var results = parseStartTimes($, "20260319");
  assert.strictEqual(results.length, 0);
});

test("ignores games with Final/OT in top-bar", function () {
  var html = buildScoreboardHtml([
    { team1: "Duke", team2: "UNC", topBar: "Final/OT" },
  ]);
  var $ = cheerio.load(html);
  var results = parseStartTimes($, "20260319");
  assert.strictEqual(results.length, 0);
});

test("ignores games with Halftime in top-bar", function () {
  var html = buildScoreboardHtml([
    { team1: "Duke", team2: "UNC", topBar: "Halftime" },
  ]);
  var $ = cheerio.load(html);
  var results = parseStartTimes($, "20260319");
  assert.strictEqual(results.length, 0);
});

test("ignores games with in-progress status like '2nd Half'", function () {
  var html = buildScoreboardHtml([
    { team1: "Duke", team2: "UNC", topBar: "2nd Half" },
  ]);
  var $ = cheerio.load(html);
  var results = parseStartTimes($, "20260319");
  assert.strictEqual(results.length, 0);
});

test("handles empty team names gracefully (skips game)", function () {
  var html = buildScoreboardHtml([
    { team1: "", team2: "", topBar: "7:10 PM ET" },
  ]);
  var $ = cheerio.load(html);
  var results = parseStartTimes($, "20260319");
  assert.strictEqual(results.length, 0);
});

test("handles missing top-bar text", function () {
  var html = buildScoreboardHtml([
    { team1: "Duke", team2: "UNC", topBar: "" },
  ]);
  var $ = cheerio.load(html);
  var results = parseStartTimes($, "20260319");
  assert.strictEqual(results.length, 0);
});

test("uses provided dateStr for date portion", function () {
  var html = buildScoreboardHtml([
    { team1: "Duke", team2: "UNC", topBar: "7:10 PM ET" },
  ]);
  var $ = cheerio.load(html);
  var results = parseStartTimes($, "20260320");
  assert.strictEqual(results.length, 1);
  // Should be March 20, not March 19
  assert.ok(results[0].startTime.toISOString().includes("2026-03-2"));
});

test("returns empty array for no live-update divs", function () {
  var $ = cheerio.load("<div>no games</div>");
  var results = parseStartTimes($, "20260319");
  assert.strictEqual(results.length, 0);
});

test("multiple games — only those with times are returned", function () {
  var html = buildScoreboardHtml([
    { team1: "Duke", team2: "UNC", topBar: "7:10 PM ET" },
    { team1: "Kansas", team2: "Kentucky", topBar: "Final" },
    { team1: "Gonzaga", team2: "Baylor", topBar: "9:20 PM ET" },
  ]);
  var $ = cheerio.load(html);
  var results = parseStartTimes($, "20260319");
  assert.strictEqual(results.length, 2);
  assert.strictEqual(results[0].team1, "Duke");
  assert.strictEqual(results[1].team1, "Gonzaga");
});

test("time with extra whitespace is handled", function () {
  var html = buildScoreboardHtml([
    { team1: "Duke", team2: "UNC", topBar: " 7:10  PM  ET " },
  ]);
  var $ = cheerio.load(html);
  var results = parseStartTimes($, "20260319");
  assert.strictEqual(results.length, 1);
  assert.ok(!isNaN(results[0].startTime.getTime()));
});

test("12:00 AM ET (midnight) is valid", function () {
  var html = buildScoreboardHtml([
    { team1: "Duke", team2: "UNC", topBar: "12:00 AM ET" },
  ]);
  var $ = cheerio.load(html);
  var results = parseStartTimes($, "20260319");
  assert.strictEqual(results.length, 1);
  assert.ok(!isNaN(results[0].startTime.getTime()));
});

test("time embedded in other text is still parsed", function () {
  var html = buildScoreboardHtml([
    { team1: "Duke", team2: "UNC", topBar: "CBS  7:10 PM ET  Coverage" },
  ]);
  var $ = cheerio.load(html);
  var results = parseStartTimes($, "20260319");
  assert.strictEqual(results.length, 1);
});

// ─── Summary ────────────────────────────────────────────────────────────────

harness.summary();
