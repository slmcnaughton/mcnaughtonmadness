var harness = require("./harness");
var teamAliases = require("../helpers/teamAliases");

var test = harness.test;
var assert = harness.assert;

var normalize = teamAliases.normalize;
var resolveTeamName = teamAliases.resolveTeamName;
var teamsMatch = teamAliases.teamsMatch;

// ─── normalize() ────────────────────────────────────────────────────────────

console.log("\nnormalize()");

test("lowercases", function () {
  assert.strictEqual(normalize("Duke"), "duke");
});

test("removes periods", function () {
  assert.strictEqual(normalize("St."), "st");
});

test("removes apostrophes", function () {
  assert.strictEqual(normalize("St. John's"), "st johns");
});

test("removes parentheses", function () {
  assert.strictEqual(normalize("Loyola (Chicago)"), "loyola chicago");
});

test("removes ampersands", function () {
  assert.strictEqual(normalize("Texas A&M"), "texas am");
});

test("converts hyphens to spaces", function () {
  assert.strictEqual(normalize("UNC-Greensboro"), "unc greensboro");
});

test("collapses multiple spaces", function () {
  assert.strictEqual(normalize("New   Mexico   State"), "new mexico state");
});

test("handles empty string", function () {
  assert.strictEqual(normalize(""), "");
});

test("handles null", function () {
  assert.strictEqual(normalize(null), "");
});

// ─── resolveTeamName() ─────────────────────────────────────────────────────

console.log("\nresolveTeamName()");

test("resolves UConn to canonical", function () {
  assert.strictEqual(resolveTeamName("UConn"), resolveTeamName("Connecticut"));
});

test("resolves Michigan St. to Michigan State", function () {
  assert.strictEqual(
    resolveTeamName("Michigan St."),
    resolveTeamName("Michigan State"),
  );
});

test("unknown name returns normalized form", function () {
  assert.strictEqual(resolveTeamName("FakeTeam"), "faketeam");
});

// ─── teamsMatch() ───────────────────────────────────────────────────────────

console.log("\nteamsMatch() — exact matches");

test("identical names match", function () {
  assert.ok(teamsMatch("Duke", "Duke", []));
});

test("case-insensitive match", function () {
  assert.ok(teamsMatch("duke", "Duke", []));
});

test("period-insensitive match", function () {
  assert.ok(teamsMatch("St. Johns", "St Johns", []));
});

console.log("\nteamsMatch() — alias map matches");

test("UConn ↔ Connecticut", function () {
  assert.ok(teamsMatch("UConn", "Connecticut", []));
});

test("Connecticut ↔ UConn", function () {
  assert.ok(teamsMatch("Connecticut", "UConn", []));
});

test("Michigan St. ↔ Michigan State", function () {
  assert.ok(teamsMatch("Michigan St.", "Michigan State", []));
});

test("Mich. St. ↔ Michigan State", function () {
  assert.ok(teamsMatch("Mich. St.", "Michigan State", []));
});

test("Wash. St. ↔ Washington State", function () {
  assert.ok(teamsMatch("Wash. St.", "Washington State", []));
});

test("Okla. St. ↔ Oklahoma State", function () {
  assert.ok(teamsMatch("Okla. St.", "Oklahoma State", []));
});

test("Va. Tech ↔ Virginia Tech", function () {
  assert.ok(teamsMatch("Va. Tech", "Virginia Tech", []));
});

test("Ga. Tech ↔ Georgia Tech", function () {
  assert.ok(teamsMatch("Ga. Tech", "Georgia Tech", []));
});

test("N. Carolina ↔ North Carolina", function () {
  assert.ok(teamsMatch("N. Carolina", "North Carolina", []));
});

test("S. Carolina ↔ South Carolina", function () {
  assert.ok(teamsMatch("S. Carolina", "South Carolina", []));
});

test("SMU ↔ Southern Methodist", function () {
  assert.ok(teamsMatch("SMU", "Southern Methodist", []));
});

test("UCF ↔ Central Florida", function () {
  assert.ok(teamsMatch("UCF", "Central Florida", []));
});

test("BYU ↔ Brigham Young", function () {
  assert.ok(teamsMatch("BYU", "Brigham Young", []));
});

test("St. Bona. ↔ St. Bonaventure", function () {
  assert.ok(teamsMatch("St. Bona.", "St. Bonaventure", []));
});

test("UCSB ↔ UC Santa Barbara", function () {
  assert.ok(teamsMatch("UCSB", "UC Santa Barbara", []));
});

console.log("\nteamsMatch() — non-matches");

test("Duke does NOT match North Carolina", function () {
  assert.ok(!teamsMatch("Duke", "North Carolina", []));
});

test("Miami (FL) does NOT match Miami (OH)", function () {
  assert.ok(!teamsMatch("Miami Florida", "Miami Ohio", []));
});

test("Michigan does NOT match Michigan State", function () {
  assert.ok(!teamsMatch("Michigan", "Michigan State", []));
});

test("Indiana does NOT match Indiana State", function () {
  assert.ok(!teamsMatch("Indiana", "Indiana State", []));
});

console.log("\nteamsMatch() — DB alias overrides");

test("DB alias matches when static map doesn't", function () {
  assert.ok(teamsMatch("Duke", "Blue Devils", ["Blue Devils"]));
});

test("DB alias is case insensitive", function () {
  assert.ok(teamsMatch("Duke", "blue devils", ["Blue Devils"]));
});

test("DB alias doesn't create false positives", function () {
  assert.ok(!teamsMatch("Duke", "Blue Devils", []));
});

// ─── Summary ────────────────────────────────────────────────────────────────

harness.summary();
