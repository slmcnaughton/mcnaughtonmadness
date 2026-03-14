/**
 * Team Name Alias System
 *
 * Handles matching between CBS Sports scraped names and internal DB team names.
 * CBS uses inconsistent abbreviations ("UConn" vs "Connecticut", "Mich. St." vs
 * "Michigan State"), so we normalize names and maintain an alias map.
 *
 * Usage:
 *   var aliases = require("../helpers/teamAliases");
 *   aliases.teamsMatch("Michigan St.", "Michigan State")  // true
 *   aliases.teamsMatch("UConn", "Connecticut")            // true
 *   aliases.normalize("S. Dak. St.")                      // "s dak st"
 */

// ─── Alias Groups ───────────────────────────────────────────────────────────
// Each array: [canonical, ...variations]
// Canonical is the fully-expanded form. All entries (including canonical)
// resolve to the canonical when looked up in the alias map.
// Add new entries here as CBS naming mismatches are discovered.

var ALIAS_GROUPS = [
  // --- Abbreviation-only names (CBS may use full or short form) ---
  ["connecticut", "uconn"],
  ["florida atlantic", "fau", "fla atlantic"],
  ["brigham young", "byu"],
  ["texas christian", "tcu"],
  ["southern methodist", "smu"],
  ["central florida", "ucf"],
  ["virginia commonwealth", "vcu"],
  ["southern california", "usc"],
  ["ucla", "california los angeles"],
  ["pittsburgh", "pitt"],
  ["massachusetts", "umass"],
  ["mississippi", "ole miss"],
  ["louisiana state", "lsu"],
  ["alabama birmingham", "uab", "alabama-birmingham"],
  ["long beach state", "lbsu", "long beach st", "cal st long beach"],
  ["virginia military", "vmi"],
  ["east tennessee state", "etsu"],
  ["florida gulf coast", "fgcu"],
  ["florida international", "fiu"],
  ["fairleigh dickinson", "fdu"],
  ["loyola marymount", "lmu"],
  ["long island", "liu"],

  // --- "State" vs "St." patterns ---
  ["north carolina state", "nc state", "nc st", "n carolina st", "n carolina state"],
  ["mississippi state", "miss st", "miss state", "mississippi st"],
  ["michigan state", "michigan st", "mich st", "mich state"],
  ["florida state", "florida st", "fla st", "fla state"],
  ["ohio state", "ohio st"],
  ["iowa state", "iowa st"],
  ["kansas state", "kansas st"],
  ["penn state", "penn st"],
  ["boise state", "boise st"],
  ["utah state", "utah st"],
  ["san diego state", "san diego st", "sdsu"],
  ["colorado state", "colorado st", "colo st"],
  ["montana state", "montana st"],
  ["south dakota state", "south dakota st", "s dak st", "s dakota st"],
  ["north dakota state", "north dakota st", "n dak st", "n dakota st"],
  ["arizona state", "arizona st"],
  ["oregon state", "oregon st"],
  ["fresno state", "fresno st"],
  ["wichita state", "wichita st"],
  ["wright state", "wright st"],
  ["morehead state", "morehead st"],
  ["georgia state", "georgia st"],
  ["norfolk state", "norfolk st"],
  ["kennesaw state", "kennesaw st"],
  ["weber state", "weber st"],
  ["murray state", "murray st"],
  ["sacramento state", "sacramento st"],
  ["appalachian state", "appalachian st", "app state", "app st"],
  ["washington state", "washington st", "wash st", "wazzu"],
  ["cleveland state", "cleveland st", "clev st"],
  ["jacksonville state", "jacksonville st", "jax state"],
  ["grambling state", "grambling st"],
  ["oklahoma state", "oklahoma st", "okla st"],
  ["new mexico state", "new mexico st", "n mex st"],
  ["illinois state", "illinois st"],
  ["indiana state", "indiana st"],
  ["missouri state", "missouri st"],
  ["arkansas state", "arkansas st"],
  ["idaho state", "idaho st"],
  ["tennessee state", "tennessee st"],
  ["delaware state", "delaware st"],
  ["alabama state", "alabama st"],
  ["alcorn state", "alcorn st"],
  ["coppin state", "coppin st"],
  ["jackson state", "jackson st"],
  ["kent state", "kent st"],
  ["morgan state", "morgan st"],
  ["portland state", "portland st"],
  ["san jose state", "san jose st"],
  ["tarleton state", "tarleton st"],
  ["texas state", "texas st"],
  ["youngstown state", "youngstown st"],
  ["chicago state", "chicago st"],
  ["sc state", "south carolina state"],
  ["northwestern state", "northwestern st"],

  // --- "Saint" / "St." patterns ---
  ["saint marys", "st marys"],
  ["saint peters", "st peters"],
  ["saint josephs", "st josephs"],
  ["saint johns", "st johns", "st johns red storm"],
  ["saint louis", "st louis"],
  ["saint bonaventure", "st bonaventure", "st bona"],
  ["saint thomas", "st thomas", "st thomas mn"],
  ["saint francis", "st francis"],
  ["mount st marys", "mt st marys"],

  // --- Directional abbreviations ---
  ["north carolina", "n carolina", "unc"],
  ["south carolina", "s carolina"],
  ["western kentucky", "w kentucky", "wku"],
  ["western michigan", "w michigan"],
  ["eastern washington", "e washington"],
  ["southern illinois", "s illinois"],
  ["northern iowa", "n iowa"],
  ["northern kentucky", "n kentucky", "nku"],
  ["eastern michigan", "e michigan"],
  ["eastern kentucky", "e kentucky"],
  ["southern indiana", "s indiana", "so indiana"],
  ["northern illinois", "n illinois", "niu"],
  ["western carolina", "w carolina"],
  ["north alabama", "n alabama"],
  ["northern arizona", "n arizona"],
  ["northern colorado", "n colorado"],
  ["central michigan", "c michigan"],
  ["coastal carolina", "c carolina"],
  ["eastern illinois", "e illinois"],
  ["western illinois", "w illinois"],
  ["western georgia", "w georgia"],
  ["george washington", "george wash", "geo washington", "geo wash"],

  // --- CBS "Ga."/"Va."/"Okla."/"La."/"So." abbreviations ---
  ["georgia tech", "ga tech", "georgia technology"],
  ["georgia southern", "ga southern"],
  ["virginia tech", "va tech", "virginia technology"],
  ["louisiana tech", "la tech", "louisiana technology"],
  ["southern miss", "so miss", "southern mississippi"],
  ["southern utah", "so utah"],
  ["middle tennessee", "middle tenn"],
  ["tennessee tech", "tenn tech"],
  ["texas southern", "texas so"],
  ["new mexico", "n mex"],
  ["southeast missouri state", "se missouri st"],
  ["southeast louisiana", "se louisiana"],
  ["central arkansas", "cent arkansas"],

  // --- Hyphenated / parenthetical / special ---
  ["loyola chicago", "loyola chi", "loyola-chicago", "loyola-chi"],
  ["loyola maryland", "loyola md", "loyola-md"],
  ["miami florida", "miami fl", "miami fla", "miami"],
  ["miami ohio", "miami oh"],
  ["texas am", "texas a m"],
  ["nc at", "north carolina at"],
  ["cal state fullerton", "csfullerton", "cs fullerton", "cal st fullerton"],
  ["cal state northridge", "csnorthridge", "cs northridge", "cal st northridge"],
  ["uc davis", "california davis"],
  ["uc irvine", "california irvine"],
  ["uc santa barbara", "california santa barbara", "ucsb"],
  ["uc riverside", "california riverside"],
  ["uc san diego", "california san diego"],
  ["unc greensboro", "uncg"],
  ["unc wilmington", "uncw"],
  ["unc asheville", "unc ash"],
  ["arkansas pine bluff", "ark pine bluff"],
  ["mississippi valley state", "miss valley st"],
  ["maryland eastern shore", "md e shore"],
  ["sc upstate", "south carolina upstate"],
  ["ut rio grande valley", "utrgv"],
];

// ─── Build flat lookup map ──────────────────────────────────────────────────

var aliasMap = {};

for (var g = 0; g < ALIAS_GROUPS.length; g++) {
  var group = ALIAS_GROUPS[g];
  var canonical = group[0];
  for (var v = 0; v < group.length; v++) {
    aliasMap[group[v]] = canonical;
  }
}

// ─── Core Functions ─────────────────────────────────────────────────────────

/**
 * Basic name cleanup: lowercase, strip punctuation, collapse whitespace.
 * Does NOT expand abbreviations — that's the alias map's job.
 */
function normalize(name) {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/\./g, "")      // remove periods:  "St." → "St"
    .replace(/'/g, "")       // remove apostrophes: "Mary's" → "Marys"
    .replace(/[()]/g, "")    // remove parens: "Miami (Fla.)" → "Miami Fla"
    .replace(/&/g, "")       // remove ampersand: "A&M" → "AM"
    .replace(/-/g, " ")      // hyphens to spaces: "Loyola-Chi." → "Loyola Chi"
    .replace(/\s+/g, " ")    // collapse whitespace
    .trim();
}

/**
 * Resolve a name to its canonical form via the alias map.
 * Returns canonical if found, otherwise returns the normalized name as-is.
 */
function resolveTeamName(name) {
  var norm = normalize(name);
  return aliasMap[norm] || norm;
}

/**
 * Check if two team names refer to the same team.
 *
 * Matching order:
 *   1. Normalized exact match
 *   2. Both resolve to the same canonical via alias map
 *   3. Check DB aliases (if provided) against the scraped name
 *
 * @param {string} name1 - First team name (typically from DB)
 * @param {string} name2 - Second team name (typically from CBS scrape)
 * @param {string[]} [dbAliases] - Extra aliases stored on the Team document
 * @returns {boolean}
 */
function teamsMatch(name1, name2, dbAliases) {
  if (!name1 || !name2) return false;

  var norm1 = normalize(name1);
  var norm2 = normalize(name2);

  // 1. Direct normalized match
  if (norm1 === norm2) return true;

  // 2. Resolve through alias map
  var resolved1 = aliasMap[norm1] || norm1;
  var resolved2 = aliasMap[norm2] || norm2;
  if (resolved1 === resolved2) return true;

  // 3. Check DB-stored aliases
  if (dbAliases && dbAliases.length > 0) {
    for (var i = 0; i < dbAliases.length; i++) {
      var normAlias = normalize(dbAliases[i]);
      if (normAlias === norm2) return true;
      var resolvedAlias = aliasMap[normAlias] || normAlias;
      if (resolvedAlias === resolved2) return true;
    }
  }

  return false;
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  normalize: normalize,
  resolveTeamName: resolveTeamName,
  teamsMatch: teamsMatch,
  aliasMap: aliasMap,
  ALIAS_GROUPS: ALIAS_GROUPS,
};
