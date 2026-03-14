// Pure scoring logic — no DB, no Mongoose.
// Extracted from middleware/index.js for testability.
//
// Scoring rule:
//   Rounds 1-6: winnerSeed/loserSeed × round (reward scales with upset magnitude)
//               losingScore: -1 × round if you picked the underdog and it lost,
//               otherwise -(yourPickSeed/winnerSeed) × round
//   Round 7 (Final Four): 5 for correct, 0 for wrong
//   Round 8 (Championship): 10 for correct, 0 for wrong

/**
 * Calculate the winning and losing scores for a completed match.
 * @param {number} topSeed - seed of the top team
 * @param {number} bottomSeed - seed of the bottom team
 * @param {boolean} winnerIsTop - true if top team won
 * @param {number} round - round number (1-8)
 * @returns {{ winningScore: number, losingScore: number }}
 */
function calculateMatchScores(topSeed, bottomSeed, winnerIsTop, round) {
  if (round === 7) return { winningScore: 5, losingScore: 0 };
  if (round === 8) return { winningScore: 10, losingScore: 0 };

  var winningSeed = winnerIsTop ? topSeed : bottomSeed;
  var losingSeed = winnerIsTop ? bottomSeed : topSeed;

  var winningScore = (winningSeed / losingSeed) * round;
  var losingScore = winningSeed < losingSeed ? -1 * round : -(losingSeed / winningSeed) * round;

  return { winningScore: winningScore, losingScore: losingScore };
}

/**
 * Calculate a single user's prediction score for a match.
 * @param {number} topSeed
 * @param {number} bottomSeed
 * @param {boolean} winnerIsTop - true if top team won
 * @param {boolean} pickedTop - true if user picked top team
 * @param {number} round - round number (1-8)
 * @returns {number} score (positive if correct, negative/zero if wrong)
 */
function calculatePredictionScore(
  topSeed,
  bottomSeed,
  winnerIsTop,
  pickedTop,
  round,
) {
  var scores = calculateMatchScores(topSeed, bottomSeed, winnerIsTop, round);
  return winnerIsTop === pickedTop ? scores.winningScore : scores.losingScore;
}

/**
 * Pre-calculate all 4 possible win/loss scores for a match (used by UserMatchAggregate).
 * @param {number} topSeed
 * @param {number} bottomSeed
 * @param {number} round
 * @returns {{ topWinScore, topLossScore, bottomWinScore, bottomLossScore }}
 */
function calculateAggregateScores(topSeed, bottomSeed, round) {
  var topWins = calculateMatchScores(topSeed, bottomSeed, true, round);
  var bottomWins = calculateMatchScores(topSeed, bottomSeed, false, round);

  return {
    topWinScore: topWins.winningScore,
    topLossScore: bottomWins.losingScore,
    bottomWinScore: bottomWins.winningScore,
    bottomLossScore: topWins.losingScore,
  };
}

module.exports = {
  calculateMatchScores: calculateMatchScores,
  calculatePredictionScore: calculatePredictionScore,
  calculateAggregateScores: calculateAggregateScores,
};
