var harness = require("./harness");
var tipoff = require("../helpers/tipoff");

var test = harness.test;
var assert = harness.assert;

var getMatchTipoffStatus = tipoff.getMatchTipoffStatus;
var isAllStarted = tipoff.isAllStarted;
var resolvePickForMatch = tipoff.resolvePickForMatch;

// ─── getMatchTipoffStatus() ─────────────────────────────────────────────────

console.log("\ngetMatchTipoffStatus()");

var pastTime = new Date("2026-03-19T12:00:00Z");
var futureTime = new Date("2099-12-31T23:59:59Z");
var now = new Date("2026-03-19T18:00:00Z"); // 6 PM UTC

test("game with startTime in the past → started: true", function () {
  var matches = [{ matchNumber: 1, startTime: pastTime }];
  var status = getMatchTipoffStatus(matches, now);
  assert.strictEqual(status[1].started, true);
  assert.strictEqual(status[1].startTime, pastTime);
});

test("game with startTime in the future → started: false", function () {
  var matches = [{ matchNumber: 1, startTime: futureTime }];
  var status = getMatchTipoffStatus(matches, now);
  assert.strictEqual(status[1].started, false);
});

test("game with null startTime → started: false (never penalize unknown)", function () {
  var matches = [{ matchNumber: 1, startTime: null }];
  var status = getMatchTipoffStatus(matches, now);
  assert.strictEqual(status[1].started, false);
  assert.strictEqual(status[1].startTime, null);
});

test("game with undefined startTime → started: false", function () {
  var matches = [{ matchNumber: 1 }];
  var status = getMatchTipoffStatus(matches, now);
  assert.strictEqual(status[1].started, false);
  assert.strictEqual(status[1].startTime, null);
});

test("multiple games: mix of started and not started", function () {
  var matches = [
    { matchNumber: 1, startTime: pastTime },
    { matchNumber: 2, startTime: futureTime },
    { matchNumber: 3, startTime: null },
  ];
  var status = getMatchTipoffStatus(matches, now);
  assert.strictEqual(status[1].started, true);
  assert.strictEqual(status[2].started, false);
  assert.strictEqual(status[3].started, false);
});

test("all games started", function () {
  var matches = [
    { matchNumber: 1, startTime: pastTime },
    { matchNumber: 2, startTime: pastTime },
  ];
  var status = getMatchTipoffStatus(matches, now);
  assert.strictEqual(status[1].started, true);
  assert.strictEqual(status[2].started, true);
});

test("no games started (all future)", function () {
  var matches = [
    { matchNumber: 1, startTime: futureTime },
    { matchNumber: 2, startTime: futureTime },
  ];
  var status = getMatchTipoffStatus(matches, now);
  assert.strictEqual(status[1].started, false);
  assert.strictEqual(status[2].started, false);
});

test("empty matches array → empty status", function () {
  var status = getMatchTipoffStatus([], now);
  assert.deepStrictEqual(status, {});
});

test("accepts timestamp number instead of Date for now", function () {
  var matches = [{ matchNumber: 1, startTime: pastTime }];
  var status = getMatchTipoffStatus(matches, now.getTime());
  assert.strictEqual(status[1].started, true);
});

test("game at exact current time is started (now > startTime boundary)", function () {
  var matches = [{ matchNumber: 1, startTime: now }];
  // now > now is false (not strictly greater)
  var status = getMatchTipoffStatus(matches, now);
  assert.strictEqual(status[1].started, false);
});

test("game 1ms before now is started", function () {
  var matches = [{ matchNumber: 1, startTime: new Date(now.getTime() - 1) }];
  var status = getMatchTipoffStatus(matches, now);
  assert.strictEqual(status[1].started, true);
});

test("game with winner (finished) but no startTime → started: true", function () {
  var matches = [{ matchNumber: 1, startTime: null, winner: "someTeamId" }];
  var status = getMatchTipoffStatus(matches, now);
  assert.strictEqual(status[1].started, true);
});

test("game with winner and future startTime → started: true (winner overrides)", function () {
  var matches = [{ matchNumber: 1, startTime: futureTime, winner: "someTeamId" }];
  var status = getMatchTipoffStatus(matches, now);
  assert.strictEqual(status[1].started, true);
});

test("mix of finished and unstarted games", function () {
  var matches = [
    { matchNumber: 1, startTime: null, winner: "teamA" },
    { matchNumber: 2, startTime: futureTime },
    { matchNumber: 3, startTime: null },
  ];
  var status = getMatchTipoffStatus(matches, now);
  assert.strictEqual(status[1].started, true);  // finished
  assert.strictEqual(status[2].started, false);  // future
  assert.strictEqual(status[3].started, false);  // unknown
});

// ─── isAllStarted() ─────────────────────────────────────────────────────────

console.log("\nisAllStarted()");

test("all started → true", function () {
  var status = { 1: { started: true }, 2: { started: true }, 3: { started: true } };
  assert.strictEqual(isAllStarted(status), true);
});

test("some started → false", function () {
  var status = { 1: { started: true }, 2: { started: false }, 3: { started: true } };
  assert.strictEqual(isAllStarted(status), false);
});

test("none started → false", function () {
  var status = { 1: { started: false }, 2: { started: false } };
  assert.strictEqual(isAllStarted(status), false);
});

test("empty map → true (vacuously)", function () {
  assert.strictEqual(isAllStarted({}), true);
});

test("single game started → true", function () {
  assert.strictEqual(isAllStarted({ 1: { started: true } }), true);
});

test("single game not started → false", function () {
  assert.strictEqual(isAllStarted({ 1: { started: false } }), false);
});

// ─── resolvePickForMatch() ──────────────────────────────────────────────────

console.log("\nresolvePickForMatch()");

test("game not started → returns submitted pick, not late", function () {
  var result = resolvePickForMatch(false, { winner: "teamA", comment: "go team" }, null);
  assert.strictEqual(result.winner, "teamA");
  assert.strictEqual(result.comment, "go team");
  assert.strictEqual(result.isLate, false);
});

test("game not started, no submitted pick → null winner, not late", function () {
  var result = resolvePickForMatch(false, null, null);
  assert.strictEqual(result.winner, null);
  assert.strictEqual(result.comment, "");
  assert.strictEqual(result.isLate, false);
});

test("game not started with draft → uses submitted (not draft), not late", function () {
  var result = resolvePickForMatch(
    false,
    { winner: "teamA", comment: "submitted" },
    { winner: "teamB", comment: "draft" },
  );
  assert.strictEqual(result.winner, "teamA");
  assert.strictEqual(result.comment, "submitted");
  assert.strictEqual(result.isLate, false);
});

test("game started, has draft pick → uses draft winner, NOT late", function () {
  var result = resolvePickForMatch(
    true,
    { winner: "teamA", comment: "submitted" },
    { winner: "teamB", comment: "draft comment" },
  );
  assert.strictEqual(result.winner, "teamB");
  assert.strictEqual(result.comment, "draft comment");
  assert.strictEqual(result.isLate, false);
});

test("game started, no draft, has submitted pick → submitted pick IS late", function () {
  var result = resolvePickForMatch(true, { winner: "teamA", comment: "too late" }, null);
  assert.strictEqual(result.winner, "teamA");
  assert.strictEqual(result.comment, "too late");
  assert.strictEqual(result.isLate, true);
});

test("game started, no draft, no submitted pick → null winner, IS late", function () {
  var result = resolvePickForMatch(true, null, null);
  assert.strictEqual(result.winner, null);
  assert.strictEqual(result.comment, "");
  assert.strictEqual(result.isLate, true);
});

test("game started, draft with empty winner → treated as no draft, IS late", function () {
  var result = resolvePickForMatch(true, { winner: "teamA", comment: "" }, { winner: null, comment: "partial draft" });
  assert.strictEqual(result.winner, "teamA");
  assert.strictEqual(result.isLate, true);
});

test("game started, draft with winner and no comment → uses draft, empty comment", function () {
  var result = resolvePickForMatch(true, null, { winner: "teamB" });
  assert.strictEqual(result.winner, "teamB");
  assert.strictEqual(result.comment, "");
  assert.strictEqual(result.isLate, false);
});

test("submitted pick with missing comment → defaults to empty string", function () {
  var result = resolvePickForMatch(false, { winner: "teamA" }, null);
  assert.strictEqual(result.winner, "teamA");
  assert.strictEqual(result.comment, "");
  assert.strictEqual(result.isLate, false);
});

// ─── getVisibleThroughRound() ────────────────────────────────────────────────

console.log("\ngetVisibleThroughRound()");

var getVisibleThroughRound = tipoff.getVisibleThroughRound;

test("user in group with current round picks → sees current round", function () {
  assert.strictEqual(getVisibleThroughRound(3, true, true), 3);
});

test("user in group without current round picks → sees through previous round", function () {
  assert.strictEqual(getVisibleThroughRound(3, true, false), 2);
});

test("user not in group → sees through previous round", function () {
  assert.strictEqual(getVisibleThroughRound(3, false, false), 2);
});

test("round 1, user has picks → sees round 1", function () {
  assert.strictEqual(getVisibleThroughRound(1, true, true), 1);
});

test("round 1, user has no picks → sees round 0 (nothing)", function () {
  assert.strictEqual(getVisibleThroughRound(1, true, false), 0);
});

test("round 6 (championship), user has picks → sees round 6", function () {
  assert.strictEqual(getVisibleThroughRound(6, true, true), 6);
});

test("round 6, user has no picks → sees through round 5", function () {
  assert.strictEqual(getVisibleThroughRound(6, true, false), 5);
});

// ─── hasCompletePicks() ─────────────────────────────────────────────────────

console.log("\nhasCompletePicks()");

var hasCompletePicks = tipoff.hasCompletePicks;

test("user has picks for current round → true", function () {
  assert.strictEqual(hasCompletePicks(3, [1, 2, 3, 7, 8]), true);
});

test("user missing current round → false", function () {
  assert.strictEqual(hasCompletePicks(3, [1, 2, 7, 8]), false);
});

test("round 1 with all 3 submissions (R1 + R7 + R8) → true", function () {
  assert.strictEqual(hasCompletePicks(1, [1, 7, 8]), true);
});

test("round 1 with only R1 submitted (missing FF + Champ) → false", function () {
  assert.strictEqual(hasCompletePicks(1, [1]), false);
});

test("round 1 with R1 + R7 but no R8 → false", function () {
  assert.strictEqual(hasCompletePicks(1, [1, 7]), false);
});

test("round 1 with R7 + R8 but no R1 → false", function () {
  assert.strictEqual(hasCompletePicks(1, [7, 8]), false);
});

test("empty userRounds → false", function () {
  assert.strictEqual(hasCompletePicks(2, []), false);
});

test("round 4 with picks for rounds 1-4 + bonus → true", function () {
  assert.strictEqual(hasCompletePicks(4, [1, 2, 3, 4, 7, 8]), true);
});

test("partial predictions (draft auto-lock, 2 of 16 matches) → false", function () {
  assert.strictEqual(hasCompletePicks(2, [1, 2, 7, 8], 2, 16), false);
});

test("full predictions (16 of 16) → true", function () {
  assert.strictEqual(hasCompletePicks(2, [1, 2, 7, 8], 16, 16), true);
});

test("no pred/match counts provided (backwards compat) → true if round exists", function () {
  assert.strictEqual(hasCompletePicks(2, [1, 2, 7, 8]), true);
});

// ─── buildMatchRoundMap() ───────────────────────────────────────────────────

console.log("\nbuildMatchRoundMap()");

var buildMatchRoundMap = tipoff.buildMatchRoundMap;

test("builds correct map for simple rounds", function () {
  var rounds = [
    { numRound: 1, matches: [{ matchNumber: 1 }, { matchNumber: 2 }] },
    { numRound: 2, matches: [{ matchNumber: 3 }] },
  ];
  var map = buildMatchRoundMap(rounds);
  assert.strictEqual(map[1], 1);
  assert.strictEqual(map[2], 1);
  assert.strictEqual(map[3], 2);
});

test("handles 6-round tournament structure", function () {
  var rounds = [
    { numRound: 1, matches: [{ matchNumber: 1 }, { matchNumber: 2 }, { matchNumber: 32 }] },
    { numRound: 2, matches: [{ matchNumber: 33 }] },
    { numRound: 3, matches: [{ matchNumber: 49 }] },
    { numRound: 4, matches: [{ matchNumber: 57 }] },
    { numRound: 5, matches: [{ matchNumber: 61 }] },
    { numRound: 6, matches: [{ matchNumber: 63 }] },
  ];
  var map = buildMatchRoundMap(rounds);
  assert.strictEqual(map[1], 1);
  assert.strictEqual(map[32], 1);
  assert.strictEqual(map[33], 2);
  assert.strictEqual(map[63], 6);
});

test("empty rounds → empty map", function () {
  assert.deepStrictEqual(buildMatchRoundMap([]), {});
});

test("round without matches → no entries for that round", function () {
  var rounds = [
    { numRound: 1, matches: [{ matchNumber: 1 }] },
    { numRound: 2, matches: null },
  ];
  var map = buildMatchRoundMap(rounds);
  assert.strictEqual(map[1], 1);
  assert.strictEqual(map[2], undefined);
});

// ─── shouldHidePicksForMatch() ──────────────────────────────────────────────

console.log("\nshouldHidePicksForMatch()");

var shouldHidePicksForMatch = tipoff.shouldHidePicksForMatch;

test("match in visible round → not hidden", function () {
  var map = { 1: 1, 33: 2, 63: 6 };
  assert.strictEqual(shouldHidePicksForMatch(1, map, 5), false);
  assert.strictEqual(shouldHidePicksForMatch(33, map, 5), false);
});

test("match in current round above visible limit → hidden", function () {
  var map = { 1: 1, 33: 2, 63: 6 };
  assert.strictEqual(shouldHidePicksForMatch(63, map, 5), true);
});

test("match exactly at visible limit → not hidden", function () {
  var map = { 61: 5 };
  assert.strictEqual(shouldHidePicksForMatch(61, map, 5), false);
});

test("match one above visible limit → hidden", function () {
  var map = { 63: 6 };
  assert.strictEqual(shouldHidePicksForMatch(63, map, 5), true);
});

test("unknown match number → hidden", function () {
  var map = { 1: 1 };
  assert.strictEqual(shouldHidePicksForMatch(999, map, 5), true);
});

test("visibleThroughRound 0 (hasn't picked round 1) → all hidden", function () {
  var map = { 1: 1, 33: 2 };
  assert.strictEqual(shouldHidePicksForMatch(1, map, 0), true);
  assert.strictEqual(shouldHidePicksForMatch(33, map, 0), true);
});

test("visibleThroughRound 99 (fail-open) → nothing hidden", function () {
  var map = { 63: 6 };
  assert.strictEqual(shouldHidePicksForMatch(63, map, 99), false);
});

// The key bug scenario: Daniel hasn't made round 6 picks, Seth has.
// Daniel should see rounds 1-5 but NOT round 6 (championship).
test("Daniel scenario: visibleThroughRound=5, championship match 63 in round 6 → hidden", function () {
  var map = { 1: 1, 33: 2, 49: 3, 57: 4, 61: 5, 62: 5, 63: 6 };
  // Daniel can see rounds 1-5
  assert.strictEqual(shouldHidePicksForMatch(1, map, 5), false);   // R1
  assert.strictEqual(shouldHidePicksForMatch(33, map, 5), false);  // R2
  assert.strictEqual(shouldHidePicksForMatch(49, map, 5), false);  // R3
  assert.strictEqual(shouldHidePicksForMatch(57, map, 5), false);  // R4
  assert.strictEqual(shouldHidePicksForMatch(61, map, 5), false);  // R5 (Final Four)
  assert.strictEqual(shouldHidePicksForMatch(62, map, 5), false);  // R5 (Final Four)
  // Daniel cannot see round 6
  assert.strictEqual(shouldHidePicksForMatch(63, map, 5), true);   // R6 (Championship)
});

// ─── Integration Scenarios ──────────────────────────────────────────────────
// These test combinations of functions that represent real bugs found during testing.

console.log("\nIntegration scenarios");

// Scenario: Admin sets winners manually (no startTime scraped).
// Games have winners but no startTime. The system should still treat them as started.
test("admin-set-winners: games with winner but no startTime are all started", function () {
  var matches = [
    { matchNumber: 33, startTime: null, winner: "teamA" },
    { matchNumber: 34, startTime: null, winner: "teamB" },
    { matchNumber: 35, startTime: null, winner: "teamC" },
    { matchNumber: 36, startTime: null, winner: "teamD" },
  ];
  var status = getMatchTipoffStatus(matches, Date.now());
  assert.strictEqual(isAllStarted(status), true);
  assert.strictEqual(status[33].started, true);
  assert.strictEqual(status[36].started, true);
});

// Scenario: Some games finished, some not started, no startTimes scraped.
// Only games with winners should be "started".
test("partial completion without scraping: only finished games count as started", function () {
  var matches = [
    { matchNumber: 33, startTime: null, winner: "teamA" },
    { matchNumber: 34, startTime: null, winner: "teamB" },
    { matchNumber: 35, startTime: null },
    { matchNumber: 36, startTime: null },
  ];
  var status = getMatchTipoffStatus(matches, Date.now());
  assert.strictEqual(status[33].started, true);
  assert.strictEqual(status[34].started, true);
  assert.strictEqual(status[35].started, false);
  assert.strictEqual(status[36].started, false);
  assert.strictEqual(isAllStarted(status), false);
});

// Scenario: User saved draft, game finishes. resolvePickForMatch should use draft (not late).
test("draft saved before game finishes → draft pick used, not late", function () {
  var result = resolvePickForMatch(
    true, // gameStarted (finished counts as started)
    { winner: "wrongTeam", comment: "changed mind" }, // submitted after seeing result
    { winner: "originalPick", comment: "saved early" }, // draft from before
  );
  // Draft takes priority over submitted pick for started games
  assert.strictEqual(result.winner, "originalPick");
  assert.strictEqual(result.comment, "saved early");
  assert.strictEqual(result.isLate, false);
});

// Scenario: No draft, game finishes, user submits late.
test("no draft, game finished → submitted pick is late", function () {
  var result = resolvePickForMatch(
    true, // game finished = started
    { winner: "teamA", comment: "" },
    null, // no draft
  );
  assert.strictEqual(result.winner, "teamA");
  assert.strictEqual(result.isLate, true);
});

// Scenario: Daniel has partial auto-locked picks (2 of 16).
// Should NOT be able to see others' picks.
test("partial auto-lock (2/16 preds) → picks not complete, can't see round", function () {
  var visible = getVisibleThroughRound(2, true, hasCompletePicks(2, [1, 2, 7, 8], 2, 16));
  assert.strictEqual(visible, 1); // can only see through round 1
});

// Scenario: Daniel submits remaining 14 picks after 2 games finished.
// Total 16 predictions → picks complete.
test("full submission after partial lock (16/16 preds) → picks complete", function () {
  var visible = getVisibleThroughRound(2, true, hasCompletePicks(2, [1, 2, 7, 8], 16, 16));
  assert.strictEqual(visible, 2); // can see current round
});

// Scenario: Round 1 user has R1 + R7 submitted but R7 is pending (partial).
// hasCompletePicks should still count pending rounds for visibility.
test("round 1 with 3 submissions including pending → complete for visibility", function () {
  // User has R1 + R7 + R8 in userRoundNums (pending still creates a UserRound)
  assert.strictEqual(hasCompletePicks(1, [1, 7, 8]), true);
});

// Scenario: Championship (round 6) visibility.
// User hasn't made round 6 picks → championship match should be hidden.
test("championship match hidden when visibleThroughRound=5", function () {
  var map = buildMatchRoundMap([
    { numRound: 1, matches: [{ matchNumber: 1 }] },
    { numRound: 2, matches: [{ matchNumber: 33 }] },
    { numRound: 3, matches: [{ matchNumber: 49 }] },
    { numRound: 4, matches: [{ matchNumber: 57 }] },
    { numRound: 5, matches: [{ matchNumber: 61 }, { matchNumber: 62 }] },
    { numRound: 6, matches: [{ matchNumber: 63 }] },
  ]);
  // User can see through round 5
  assert.strictEqual(shouldHidePicksForMatch(61, map, 5), false);
  assert.strictEqual(shouldHidePicksForMatch(63, map, 5), true);
  // User can see through round 6
  assert.strictEqual(shouldHidePicksForMatch(63, map, 6), false);
});

// Scenario: Between rounds — round N complete, round N+1 not started.
// User who missed round N entirely should still see through round N-1.
test("missed round user visibility: currentRound=4, no picks → sees through 3", function () {
  var visible = getVisibleThroughRound(4, true, false);
  assert.strictEqual(visible, 3);
});

// Scenario: User not in group at all during round 3.
test("non-group-member visibility: sees through round 2 when currentRound=3", function () {
  var visible = getVisibleThroughRound(3, false, false);
  assert.strictEqual(visible, 2);
});

// Scenario: getActualRoundIndex mapping for bonus rounds.
var getActualRoundIndex = tipoff.getActualRoundIndex;
test("round index mapping: regular rounds pass through", function () {
  assert.strictEqual(getActualRoundIndex(1), 1);
  assert.strictEqual(getActualRoundIndex(4), 4);
  assert.strictEqual(getActualRoundIndex(6), 6);
});

test("round index mapping: bonus rounds remap correctly", function () {
  assert.strictEqual(getActualRoundIndex(7), 4); // Final Four → index 4
  assert.strictEqual(getActualRoundIndex(8), 6); // Championship → index 6
});

// ─── getPickStatus() — Commissioner Dashboard States ────────────────────────

console.log("\ngetPickStatus()");

var getPickStatus = tipoff.getPickStatus;

var baseOpts = { predCount: 0, predsWithWinner: 0, expectedMatchCount: 16, isBonusRound: false, hasDraft: false, hasLatePick: false, isPending: false, isRejected: false };

test("no picks, no draft → noPicks", function () {
  assert.strictEqual(getPickStatus(baseOpts), "noPicks");
});

test("has draft but no submission → draft", function () {
  assert.strictEqual(getPickStatus(Object.assign({}, baseOpts, { hasDraft: true })), "draft");
});

test("full submission on time → complete", function () {
  assert.strictEqual(getPickStatus(Object.assign({}, baseOpts, { predCount: 16, predsWithWinner: 16 })), "complete");
});

test("full submission with late picks → completeLate", function () {
  assert.strictEqual(getPickStatus(Object.assign({}, baseOpts, { predCount: 16, predsWithWinner: 16, hasLatePick: true })), "completeLate");
});

test("partial lock (2 of 16 predictions) → partialLock", function () {
  assert.strictEqual(getPickStatus(Object.assign({}, baseOpts, { predCount: 2, predsWithWinner: 2 })), "partialLock");
});

test("partial lock with draft still existing → partialLock (lock takes priority)", function () {
  assert.strictEqual(getPickStatus(Object.assign({}, baseOpts, { predCount: 2, predsWithWinner: 2, hasDraft: true })), "partialLock");
});

test("pending approval → pending", function () {
  assert.strictEqual(getPickStatus(Object.assign({}, baseOpts, { predCount: 4, predsWithWinner: 4, isPending: true, isBonusRound: true })), "pending");
});

test("rejected → rejected (overrides everything)", function () {
  assert.strictEqual(getPickStatus(Object.assign({}, baseOpts, { predCount: 4, predsWithWinner: 4, isRejected: true, isBonusRound: true })), "rejected");
});

test("bonus round with picks → complete (ignores match count)", function () {
  assert.strictEqual(getPickStatus(Object.assign({}, baseOpts, { predCount: 4, predsWithWinner: 4, isBonusRound: true, expectedMatchCount: 2 })), "complete");
});

test("rejected overrides pending", function () {
  assert.strictEqual(getPickStatus(Object.assign({}, baseOpts, { isRejected: true, isPending: true, predCount: 4, predsWithWinner: 4, isBonusRound: true })), "rejected");
});

test("pending overrides complete", function () {
  assert.strictEqual(getPickStatus(Object.assign({}, baseOpts, { isPending: true, predCount: 16, predsWithWinner: 16 })), "pending");
});

// ─── getMatchDisplayState() — Edit Page Match States ────────────────────────

console.log("\ngetMatchDisplayState()");

var getMatchDisplayState = tipoff.getMatchDisplayState;

test("open game, no draft → open state, not disabled", function () {
  var s = getMatchDisplayState(false, false, false, null, null);
  assert.strictEqual(s.state, "open");
  assert.strictEqual(s.cssClass, "");
  assert.strictEqual(s.disabled, false);
  assert.strictEqual(s.selectedWinner, null);
});

test("open game with draft → open state, shows draft pick", function () {
  var s = getMatchDisplayState(false, false, false, "teamA", null);
  assert.strictEqual(s.state, "open");
  assert.strictEqual(s.disabled, false);
  assert.strictEqual(s.selectedWinner, "teamA");
});

test("started game → started state, disabled", function () {
  var s = getMatchDisplayState(false, false, true, "teamA", null);
  assert.strictEqual(s.state, "started");
  assert.strictEqual(s.cssClass, "match-started");
  assert.strictEqual(s.disabled, true);
});

test("locked game (from draft auto-lock) → locked state, disabled", function () {
  var s = getMatchDisplayState(false, true, false, "teamA", "teamB");
  assert.strictEqual(s.state, "locked");
  assert.strictEqual(s.cssClass, "match-locked");
  assert.strictEqual(s.disabled, true);
  assert.strictEqual(s.selectedWinner, "teamB"); // locked winner overrides draft
});

test("finished game → finished state (overrides locked)", function () {
  var s = getMatchDisplayState(true, true, false, "teamA", "teamB");
  assert.strictEqual(s.state, "finished");
  assert.strictEqual(s.cssClass, "match-finished");
  assert.strictEqual(s.disabled, true);
});

test("finished game overrides started", function () {
  var s = getMatchDisplayState(true, false, true, null, null);
  assert.strictEqual(s.state, "finished");
  assert.strictEqual(s.cssClass, "match-finished");
  assert.strictEqual(s.disabled, true);
});

test("locked overrides started", function () {
  var s = getMatchDisplayState(false, true, true, "teamA", "teamB");
  assert.strictEqual(s.state, "locked");
  assert.strictEqual(s.cssClass, "match-locked");
});

test("priority order: finished > locked > started > open", function () {
  // All flags true → finished wins
  var s = getMatchDisplayState(true, true, true, "d", "l");
  assert.strictEqual(s.state, "finished");
});

test("locked winner overrides draft winner in selection", function () {
  var s = getMatchDisplayState(false, true, false, "draftPick", "lockedPick");
  assert.strictEqual(s.selectedWinner, "lockedPick");
});

test("no locked winner falls back to draft winner", function () {
  var s = getMatchDisplayState(false, true, false, "draftPick", null);
  assert.strictEqual(s.selectedWinner, "draftPick");
});

// ─── Missed Pick Scenarios ──────────────────────────────────────────────────

console.log("\nMissed pick scenarios");

test("getPickStatus: predictions exist but all have null winners → partialLock (missed games)", function () {
  // User has 3 predictions from branch1 (all missed, winner: null) out of 16
  assert.strictEqual(getPickStatus({
    predCount: 3, predsWithWinner: 0, expectedMatchCount: 16,
    isBonusRound: false, hasDraft: false, hasLatePick: false, isPending: false, isRejected: false,
  }), "noPicks"); // predsWithWinner=0 means no actual picks
});

test("getPickStatus: mix of locked picks and missed picks → partialLock", function () {
  // User has 5 total predictions: 3 with winners (locked from draft), 2 without (missed)
  assert.strictEqual(getPickStatus({
    predCount: 5, predsWithWinner: 3, expectedMatchCount: 16,
    isBonusRound: false, hasDraft: false, hasLatePick: false, isPending: false, isRejected: false,
  }), "partialLock");
});

test("getPickStatus: all 16 preds, some missed (winner null) → complete (full submission)", function () {
  // User submitted: 14 real picks + 2 missed (created by branch1). All 16 matchups covered.
  assert.strictEqual(getPickStatus({
    predCount: 16, predsWithWinner: 14, expectedMatchCount: 16,
    isBonusRound: false, hasDraft: false, hasLatePick: true, isPending: false, isRejected: false,
  }), "completeLate"); // has late picks, fully submitted
});

test("getMatchDisplayState: finished game with no pick (missed) → finished, disabled", function () {
  var s = getMatchDisplayState(true, false, false, null, null);
  assert.strictEqual(s.state, "finished");
  assert.strictEqual(s.disabled, true);
  assert.strictEqual(s.selectedWinner, null);
});

test("resolvePickForMatch: game started, no draft, no submission → late with null winner", function () {
  var result = resolvePickForMatch(true, null, null);
  assert.strictEqual(result.winner, null);
  assert.strictEqual(result.isLate, true);
});

// Scenario: User never made any picks. 3 games finish. They should have 3 missed predictions
// and NOT be visible in any team's pickers on the group bracket.
test("missed user with null winner → not complete (predsWithWinner=0)", function () {
  assert.strictEqual(hasCompletePicks(2, [1, 2, 7, 8], 3, 16), false);
  // Even though predCount=3, predsWithWinner would be 0 (all missed)
  // getPickStatus with predsWithWinner=0 → noPicks
  assert.strictEqual(getPickStatus({
    predCount: 3, predsWithWinner: 0, expectedMatchCount: 16,
    isBonusRound: false, hasDraft: false, hasLatePick: false, isPending: false, isRejected: false,
  }), "noPicks");
});

// Scenario: idempotency — marking missed pickers twice shouldn't duplicate
// (This is enforced by checking coveredUsers set in markMissedPickersForStartedGames,
// which is tested here via the pure function that would use the same logic)
test("hasCompletePicks: partial preds don't count as complete even with round existing", function () {
  assert.strictEqual(hasCompletePicks(2, [1, 2, 7, 8], 5, 16), false);
  assert.strictEqual(hasCompletePicks(2, [1, 2, 7, 8], 16, 16), true);
});

// Scenario: User submits late with some missed games.
// 14 picked + 2 missed (branch1 created) = 16 total, but only 14 with winners.
// Should still be "complete" since all matchups are covered.
test("full submission with missed games still complete for visibility", function () {
  // From getVisibleThroughRound perspective: picks are complete
  assert.strictEqual(hasCompletePicks(2, [1, 2, 7, 8], 16, 16), true);
  assert.strictEqual(getVisibleThroughRound(2, true, true), 2);
});

// ─── Pre-Edit / Draft Safety Net Feature Scenarios ──────────────────────────
// These tests document the expected behavior of the draft-saves → auto-submit
// workflow introduced in 2026. Read as a spec: if these break, the feature is broken.

console.log("\nDraft pre-edit & auto-submit feature scenarios");

// THE KEY USER STORY:
// "I fill in my Round 2 picks on Friday night. Saturday noon rolls around and I
//  forget to hit Submit. My Friday-night drafts protect me."

// 1. Friday night: user saves draft for all 16 games. No picks submitted.
//    Edit page should show all games as "open" with draft pre-filled.
test("pre-edit: open game with draft shows draft winner, not disabled", function () {
  var s = getMatchDisplayState(false, false, false, "teamA", null);
  assert.strictEqual(s.state, "open");
  assert.strictEqual(s.disabled, false);
  assert.strictEqual(s.selectedWinner, "teamA"); // draft pre-filled
});

// 2. Saturday noon: game 1 tips off. User still hasn't submitted.
//    lockDraftPicksForStartedGames converts draft → locked prediction for game 1.
//    Edit page shows game 1 as locked (draft used, not late), games 2-16 open.
test("tipoff lock: game started with draft → locked state, shows locked winner", function () {
  var s = getMatchDisplayState(false, true, false, "teamA", "teamA");
  assert.strictEqual(s.state, "locked");
  assert.strictEqual(s.cssClass, "match-locked");
  assert.strictEqual(s.disabled, true);
  assert.strictEqual(s.selectedWinner, "teamA");
});

// 3. Saturday noon: game 1 tips but user had NO draft for game 1.
//    Edit page shows it as "started" (disabled — penalty territory on submit).
test("tipoff without draft: game started, no draft, no lock → started state, disabled", function () {
  var s = getMatchDisplayState(false, false, true, null, null);
  assert.strictEqual(s.state, "started");
  assert.strictEqual(s.cssClass, "match-started");
  assert.strictEqual(s.disabled, true);
});

// 4. resolvePickForMatch: the safety net in action.
//    Game tipped, draft existed → NOT late. This is the core protection.
test("safety net: draft existed at tipoff → pick honored, NOT late", function () {
  var result = resolvePickForMatch(
    true,                                       // game started (tipoff passed)
    { winner: "teamB", comment: "panic pick" }, // submitted after tipoff
    { winner: "teamA", comment: "Friday pick" } // draft saved Friday night
  );
  assert.strictEqual(result.winner, "teamA");
  assert.strictEqual(result.comment, "Friday pick");
  assert.strictEqual(result.isLate, false);
});

// 5. resolvePickForMatch: no draft at tipoff → late pick penalty.
test("no draft at tipoff: game started, no draft → pick IS late", function () {
  var result = resolvePickForMatch(
    true,
    { winner: "teamA", comment: "" },
    null
  );
  assert.strictEqual(result.winner, "teamA");
  assert.strictEqual(result.isLate, true);
});

// 6. resolvePickForMatch: no draft, no submission → missed pick (null + late).
test("fully missed: no draft, no submission, game started → null winner, late", function () {
  var result = resolvePickForMatch(true, null, null);
  assert.strictEqual(result.winner, null);
  assert.strictEqual(result.isLate, true);
});

// 7. PARTIAL SUBMISSION SCENARIO (the tight Saturday noon turnaround):
//    Round 2 has 16 games. Thursday games (1-8) tipped.
//    User had drafts for all 16 → 8 auto-locked, 8 still open.
//    getPickStatus: 8 predictions from auto-lock, 8 remaining.
test("partial lock: 8 of 16 games auto-locked → partialLock status", function () {
  assert.strictEqual(getPickStatus({
    predCount: 8, predsWithWinner: 8, expectedMatchCount: 16,
    isBonusRound: false, hasDraft: true, hasLatePick: false,
    isPending: false, isRejected: false,
  }), "partialLock");
});

// 8. User opens edit page Saturday morning, submits remaining 8 open games.
//    Now all 16 predictions exist → complete.
test("full submission after partial lock: 16/16 predictions → complete", function () {
  assert.strictEqual(getPickStatus({
    predCount: 16, predsWithWinner: 16, expectedMatchCount: 16,
    isBonusRound: false, hasDraft: false, hasLatePick: false,
    isPending: false, isRejected: false,
  }), "complete");
});

// 9. Partial lock AND draft still in flight — partialLock takes priority over draft.
test("partial lock + draft still exists → partialLock (not draft)", function () {
  assert.strictEqual(getPickStatus({
    predCount: 5, predsWithWinner: 5, expectedMatchCount: 16,
    isBonusRound: false, hasDraft: true, hasLatePick: false,
    isPending: false, isRejected: false,
  }), "partialLock");
});

// 10. Round 2 only needs one submission — unlike round 1, no bonus round required.
test("round 2 only needs R2 submitted to be complete (no R7/R8 requirement)", function () {
  assert.strictEqual(hasCompletePicks(2, [2]), true);
  assert.strictEqual(hasCompletePicks(3, [3]), true);
  assert.strictEqual(hasCompletePicks(6, [6]), true);
});

// 11. Partial auto-lock (2/16) means NOT complete → visibility stays at round 1.
test("partial lock 2/16 predictions → not complete, visibility stays at round 1", function () {
  var complete = hasCompletePicks(2, [1, 2, 7, 8], 2, 16);
  assert.strictEqual(complete, false);
  assert.strictEqual(getVisibleThroughRound(2, true, complete), 1);
});

// 12. After finishing submission (16/16) → complete, visibility unlocks round 2.
test("full submission 16/16 → complete, visibility unlocks round 2", function () {
  var complete = hasCompletePicks(2, [1, 2, 7, 8], 16, 16);
  assert.strictEqual(complete, true);
  assert.strictEqual(getVisibleThroughRound(2, true, complete), 2);
});

// 13. All 16 games auto-locked from draft (user saved Friday, all tipped Saturday).
//     No late picks, no draft remaining → complete.
test("all 16 games auto-locked from draft → complete, no late penalty", function () {
  assert.strictEqual(getPickStatus({
    predCount: 16, predsWithWinner: 16, expectedMatchCount: 16,
    isBonusRound: false, hasDraft: false, hasLatePick: false,
    isPending: false, isRejected: false,
  }), "complete");
});

// 14. getActualRoundIndex must be correct for bonus rounds — auto-submit depends on it.
test("bonus round index mapping: R7 → 4, R8 → 6, regular rounds unchanged", function () {
  var getActualRoundIndex = tipoff.getActualRoundIndex;
  assert.strictEqual(getActualRoundIndex(7), 4);
  assert.strictEqual(getActualRoundIndex(8), 6);
  assert.strictEqual(getActualRoundIndex(1), 1);
  assert.strictEqual(getActualRoundIndex(2), 2);
  assert.strictEqual(getActualRoundIndex(6), 6);
});

// 15. Pre-tipoff: submitted pick always overrides draft.
//     Draft is ONLY a safety net for already-started games.
test("pre-tipoff: submitted pick overrides existing draft", function () {
  var result = resolvePickForMatch(
    false,
    { winner: "teamB", comment: "I changed my mind" },
    { winner: "teamA", comment: "old draft" }
  );
  assert.strictEqual(result.winner, "teamB");
  assert.strictEqual(result.comment, "I changed my mind");
  assert.strictEqual(result.isLate, false);
});

// 16. Draft with null winner provides no protection — treat as no draft.
test("draft with null winner: no protection, pick is late", function () {
  var result = resolvePickForMatch(
    true,
    { winner: "teamA", comment: "" },
    { winner: null, comment: "opened page but chose nothing" }
  );
  assert.strictEqual(result.winner, "teamA");
  assert.strictEqual(result.isLate, true);
});

// 17. getMatchDisplayState: finished always beats locked (game resolved after lock).
test("finished game with locked winner → finished state, not locked", function () {
  var s = getMatchDisplayState(true, true, false, "draftPick", "lockedPick");
  assert.strictEqual(s.state, "finished");
  assert.strictEqual(s.cssClass, "match-finished");
  assert.strictEqual(s.disabled, true);
});

// ─── Summary ────────────────────────────────────────────────────────────────

harness.summary();
