var harness = require("./harness");
var scoring = require("../helpers/scoring");

var test = harness.test;
var approxEqual = harness.approxEqual;
var assert = harness.assert;

var calculateMatchScores = scoring.calculateMatchScores;
var calculatePredictionScore = scoring.calculatePredictionScore;
var calculateAggregateScores = scoring.calculateAggregateScores;

// ─── calculateMatchScores() ─────────────────────────────────────────────────

console.log("\ncalculateMatchScores()");

test("R1: #1 beats #16 — favorite wins, flat -1 penalty", function () {
  var s = calculateMatchScores(1, 16, true, 1);
  approxEqual(s.winningScore, 1 / 16); // 0.0625 — tiny reward (expected result)
  approxEqual(s.losingScore, -1); // flat -1 (you picked the underdog, it lost)
});

test("R1: #16 beats #1 — massive upset!", function () {
  var s = calculateMatchScores(1, 16, false, 1);
  approxEqual(s.winningScore, 16); // 16/1 — huge reward for calling the upset
  approxEqual(s.losingScore, -(1 / 16)); // -0.0625 — tiny penalty (everyone picked #1)
});

test("R1: #8 beats #9 — favorite wins by seed", function () {
  var s = calculateMatchScores(8, 9, true, 1);
  approxEqual(s.winningScore, 8 / 9); // ~0.889
  approxEqual(s.losingScore, -1); // flat -1 (8 < 9, so 8-seed is the "favorite")
});

test("R1: #9 beats #8 — slight upset", function () {
  var s = calculateMatchScores(8, 9, false, 1);
  approxEqual(s.winningScore, 9 / 8); // 1.125
  approxEqual(s.losingScore, -(8 / 9)); // ~-0.889 (upset, penalty = loserSeed/winnerSeed)
});

test("R1: #5 vs #12 — 5 wins (favorite)", function () {
  var s = calculateMatchScores(5, 12, true, 1);
  approxEqual(s.winningScore, 5 / 12); // ~0.417
  approxEqual(s.losingScore, -1); // flat -1 (favorite won)
});

test("R1: #5 vs #12 — 12 wins (classic upset)", function () {
  var s = calculateMatchScores(5, 12, false, 1);
  approxEqual(s.winningScore, 12 / 5); // 2.4 — big reward
  approxEqual(s.losingScore, -(5 / 12)); // ~-0.417 (you picked #5, mild penalty)
});

test("round multiplier — R3: #1 beats #16", function () {
  var s = calculateMatchScores(1, 16, true, 3);
  approxEqual(s.winningScore, (1 / 16) * 3); // 0.1875
  approxEqual(s.losingScore, -3); // -1 * 3 (favorite won)
});

test("round multiplier — R4: #8 beats #9", function () {
  var s = calculateMatchScores(8, 9, true, 4);
  approxEqual(s.winningScore, (8 / 9) * 4); // ~3.556
  approxEqual(s.losingScore, -4); // -1 * 4 (8 < 9, favorite won)
});

console.log("\ncalculateMatchScores() — bonus rounds");

test("R7 (Final Four): always 5/0", function () {
  var s = calculateMatchScores(1, 4, true, 7);
  assert.strictEqual(s.winningScore, 5);
  assert.strictEqual(s.losingScore, 0);
});

test("R8 (Championship): always 10/0", function () {
  var s = calculateMatchScores(3, 11, false, 8);
  assert.strictEqual(s.winningScore, 10);
  assert.strictEqual(s.losingScore, 0);
});

// ─── calculatePredictionScore() ─────────────────────────────────────────────

console.log("\ncalculatePredictionScore()");

test("correct pick gets winningScore", function () {
  approxEqual(
    calculatePredictionScore(1, 16, true, true, 1),
    1 / 16,
  );
});

test("wrong pick — picked underdog, favorite won", function () {
  approxEqual(
    calculatePredictionScore(1, 16, true, false, 1),
    -1, // flat -1 (you gambled on the underdog)
  );
});

test("correct upset pick rewarded big", function () {
  approxEqual(
    calculatePredictionScore(1, 16, false, false, 1),
    16, // 16/1 — huge reward for calling #16 over #1
  );
});

test("wrong pick — picked favorite, upset happened", function () {
  approxEqual(
    calculatePredictionScore(1, 16, false, true, 1),
    -(1 / 16), // -0.0625 — tiny penalty (everyone picked the favorite)
  );
});

test("R7 correct = 5", function () {
  assert.strictEqual(calculatePredictionScore(2, 3, true, true, 7), 5);
});

test("R7 wrong = 0", function () {
  assert.strictEqual(calculatePredictionScore(2, 3, true, false, 7), 0);
});

test("R8 correct = 10", function () {
  assert.strictEqual(calculatePredictionScore(1, 2, false, false, 8), 10);
});

test("R8 wrong = 0", function () {
  assert.strictEqual(calculatePredictionScore(1, 2, false, true, 8), 0);
});

// ─── calculateAggregateScores() ─────────────────────────────────────────────

console.log("\ncalculateAggregateScores()");

test("R1: #1 vs #16 aggregate scores", function () {
  var s = calculateAggregateScores(1, 16, 1);
  approxEqual(s.topWinScore, 1 / 16);
  approxEqual(s.topLossScore, -(1 / 16)); // top is favorite (lower seed), loss = -seed ratio
  approxEqual(s.bottomWinScore, 16 / 1);
  approxEqual(s.bottomLossScore, -1); // bottom is underdog, loss = -round
});

test("R1: #8 vs #9 aggregate scores", function () {
  var s = calculateAggregateScores(8, 9, 1);
  approxEqual(s.topWinScore, 8 / 9);
  approxEqual(s.topLossScore, -(8 / 9)); // 8 < 9 → -(8/9)*round
  approxEqual(s.bottomWinScore, 9 / 8);
  approxEqual(s.bottomLossScore, -1); // 9 > 8 → -round
});

test("R2: #3 vs #6 aggregate with multiplier", function () {
  var s = calculateAggregateScores(3, 6, 2);
  approxEqual(s.topWinScore, (3 / 6) * 2);
  approxEqual(s.topLossScore, -(3 / 6) * 2);
  approxEqual(s.bottomWinScore, (6 / 3) * 2);
  approxEqual(s.bottomLossScore, -2);
});

test("aggregate matches prediction scores — top wins", function () {
  var agg = calculateAggregateScores(5, 12, 1);
  var predWin = calculatePredictionScore(5, 12, true, true, 1);
  var predLose = calculatePredictionScore(5, 12, true, false, 1);
  approxEqual(agg.topWinScore, predWin);
  approxEqual(agg.bottomLossScore, predLose);
});

test("aggregate matches prediction scores — bottom wins", function () {
  var agg = calculateAggregateScores(5, 12, 1);
  var predWin = calculatePredictionScore(5, 12, false, false, 1);
  var predLose = calculatePredictionScore(5, 12, false, true, 1);
  approxEqual(agg.bottomWinScore, predWin);
  approxEqual(agg.topLossScore, predLose);
});

test("R7 aggregate returns 5/0 for both sides", function () {
  var s = calculateAggregateScores(2, 3, 7);
  assert.strictEqual(s.topWinScore, 5);
  assert.strictEqual(s.topLossScore, 0);
  assert.strictEqual(s.bottomWinScore, 5);
  assert.strictEqual(s.bottomLossScore, 0);
});

test("R8 aggregate returns 10/0 for both sides", function () {
  var s = calculateAggregateScores(1, 4, 8);
  assert.strictEqual(s.topWinScore, 10);
  assert.strictEqual(s.topLossScore, 0);
  assert.strictEqual(s.bottomWinScore, 10);
  assert.strictEqual(s.bottomLossScore, 0);
});

// ─── Summary ────────────────────────────────────────────────────────────────

harness.summary();
