// Pure tipoff resolution logic — no DB, no Mongoose.
// Extracted from middleware/index.js for testability.

/**
 * Determine the tipoff status of each match in a round.
 * A game is "started" only if it has an explicit startTime and that time has passed.
 * Games with null startTime are always treated as "not started" (we don't penalize unknown).
 *
 * @param {Array} matches - Array of match-like objects with { matchNumber, startTime }
 * @param {Date|number} now - Current time (Date object or timestamp)
 * @returns {Object} Map of { [matchNumber]: { started: boolean, startTime: Date|null } }
 */
function getMatchTipoffStatus(matches, now) {
  var nowMs = now instanceof Date ? now.getTime() : now;
  var status = {};

  for (var i = 0; i < matches.length; i++) {
    var match = matches[i];
    var started = false;
    // A game is "started" if: it has a startTime that has passed, OR it already has a winner (finished)
    if (match.winner) {
      started = true;
    } else if (match.startTime) {
      var startMs = match.startTime instanceof Date
        ? match.startTime.getTime()
        : new Date(match.startTime).getTime();
      if (nowMs > startMs) {
        started = true;
      }
    }
    status[match.matchNumber] = {
      started: started,
      startTime: match.startTime || null,
    };
  }

  return status;
}

/**
 * Check if all matches in a tipoff status map have started.
 *
 * @param {Object} matchTipoffStatus - Map from getMatchTipoffStatus()
 * @returns {boolean} true if every match has started: true
 */
function isAllStarted(matchTipoffStatus) {
  var keys = Object.keys(matchTipoffStatus);
  for (var i = 0; i < keys.length; i++) {
    if (!matchTipoffStatus[keys[i]].started) {
      return false;
    }
  }
  return true;
}

/**
 * Resolve which pick to use for a match based on tipoff status, draft, and submission.
 *
 * Rules:
 * - Game NOT started → use submitted pick, not late
 * - Game started + has draft pick → use draft pick, NOT late (safety net)
 * - Game started + no draft pick + has submitted pick → use submitted, IS late
 * - Game started + no draft pick + no submitted pick → null winner, IS late
 *
 * @param {boolean} gameStarted - Whether the game has already started
 * @param {{ winner: string|null, comment: string }} submittedPick - Pick from req.body (may be null)
 * @param {{ winner: string|null, comment: string }} draftPick - Saved draft pick (may be null)
 * @returns {{ winner: string|null, comment: string, isLate: boolean }}
 */
function resolvePickForMatch(gameStarted, submittedPick, draftPick) {
  if (!gameStarted) {
    // Game hasn't started — use submitted pick normally
    return {
      winner: submittedPick ? submittedPick.winner : null,
      comment: submittedPick ? (submittedPick.comment || "") : "",
      isLate: false,
    };
  }

  // Game has started — check for draft pick first
  if (draftPick && draftPick.winner) {
    return {
      winner: draftPick.winner,
      comment: draftPick.comment || "",
      isLate: false,
    };
  }

  // No draft pick — this is a late pick
  return {
    winner: submittedPick ? submittedPick.winner : null,
    comment: submittedPick ? (submittedPick.comment || "") : "",
    isLate: true,
  };
}

/**
 * Map a user-facing round number to the actual tournament rounds array index.
 * Rounds 7 (Final Four) and 8 (Championship) are bonus picks stored separately:
 *   7 → index 4 (the 5th round slot), 8 → index 6 (the 7th round slot).
 * Regular rounds (1-6) map directly.
 *
 * @param {number} numRound - User-facing round number (1-8)
 * @returns {number} 1-based index into tournament.rounds array
 */
function getActualRoundIndex(numRound) {
  if (numRound === 7) return 4;
  if (numRound === 8) return 6;
  return numRound;
}

/**
 * Determine which round a user can see through, based on their pick status.
 * This is the pure decision logic extracted from checkUserPickStatus middleware.
 *
 * @param {number} currentRound - The group's current round (1-based)
 * @param {boolean} userInGroup - Whether the user is enrolled in the group
 * @param {boolean} hasCurrentRoundPicks - Whether user has submitted picks for currentRound
 * @returns {number} The highest round number whose picks are visible
 */
function getVisibleThroughRound(currentRound, userInGroup, hasCurrentRoundPicks) {
  if (!userInGroup) return currentRound - 1;
  if (hasCurrentRoundPicks) return currentRound;
  return currentRound - 1;
}

/**
 * Check whether a user has complete picks for the current round.
 * Round 1 is special: requires 3 submissions (R1 + Final Four R7 + Champion R8).
 * A partial UserRound (from draft auto-lock) doesn't count as complete.
 *
 * @param {number} currentRound - The group's current round
 * @param {Array} userRoundNums - Array of numRound values from user's submitted rounds
 * @param {number} [currentRoundPredCount] - Number of predictions the user has for this round
 * @param {number} [currentRoundMatchCount] - Total matches in this round
 * @returns {boolean}
 */
function hasCompletePicks(currentRound, userRoundNums, currentRoundPredCount, currentRoundMatchCount) {
  var hasRound = false;
  for (var i = 0; i < userRoundNums.length; i++) {
    if (userRoundNums[i] === currentRound) {
      hasRound = true;
      break;
    }
  }
  if (!hasRound) return false;

  // Round 1 requires R1 + FF (R7) + Champ (R8) = 3 submissions
  if (currentRound === 1 && userRoundNums.length < 3) return false;

  // If prediction/match counts provided, check that all matchups have predictions
  // (a partial UserRound from draft auto-lock doesn't count as complete)
  if (typeof currentRoundPredCount === "number" && typeof currentRoundMatchCount === "number") {
    if (currentRoundPredCount < currentRoundMatchCount) return false;
  }

  return true;
}

/**
 * Build a lookup map from matchNumber → round number (1-based).
 * Used by templates to determine which round a match belongs to.
 *
 * @param {Array} rounds - Array of round objects with { numRound, matches: [{ matchNumber }] }
 * @returns {Object} Map of { [matchNumber]: roundNumber }
 */
function buildMatchRoundMap(rounds) {
  var map = {};
  for (var i = 0; i < rounds.length; i++) {
    var rd = rounds[i];
    var roundNum = rd.numRound || (i + 1);
    if (rd.matches) {
      for (var j = 0; j < rd.matches.length; j++) {
        map[rd.matches[j].matchNumber] = roundNum;
      }
    }
  }
  return map;
}

/**
 * Determine if picks should be hidden for a specific match.
 *
 * @param {number} matchNumber - The match number
 * @param {Object} matchRoundMap - Map from buildMatchRoundMap()
 * @param {number} maxVisibleRound - From getVisibleThroughRound()
 * @returns {boolean} true if picks should be hidden
 */
function shouldHidePicksForMatch(matchNumber, matchRoundMap, maxVisibleRound) {
  var roundNum = matchRoundMap[matchNumber];
  if (!roundNum) return true; // unknown match → hide
  return roundNum > maxVisibleRound;
}

/**
 * Determine the pick status for a user's round (for commissioner dashboard).
 *
 * @param {Object} opts
 * @param {number} opts.predCount - Number of predictions in the UserRound
 * @param {number} opts.predsWithWinner - Predictions that have a winner set
 * @param {number} opts.expectedMatchCount - Total matches in the round
 * @param {boolean} opts.isBonusRound - Whether this is round 7 or 8
 * @param {boolean} opts.hasDraft - Whether a DraftPick exists for this user/round
 * @param {boolean} opts.hasLatePick - Whether any prediction is marked late
 * @param {boolean} opts.isPending - Whether the UserRound is pending approval
 * @param {boolean} opts.isRejected - Whether the UserRound was rejected
 * @returns {string} One of: 'rejected', 'pending', 'completeLate', 'complete', 'partialLock', 'draft', 'noPicks'
 */
function getPickStatus(opts) {
  var hasPicks = opts.predsWithWinner > 0;
  var isComplete = hasPicks && (opts.isBonusRound || (opts.predCount >= opts.expectedMatchCount && opts.expectedMatchCount > 0));
  var isPartialLock = hasPicks && !isComplete;

  if (opts.isRejected) return "rejected";
  if (opts.isPending) return "pending";
  if (isComplete && opts.hasLatePick) return "completeLate";
  if (isComplete) return "complete";
  if (isPartialLock) return "partialLock";
  if (opts.hasDraft) return "draft";
  return "noPicks";
}

/**
 * Determine the display state of a match on the edit picks page.
 * Returns mutually exclusive state in priority order: finished > locked > started > open.
 *
 * @param {boolean} isFinished - Match has a winner
 * @param {boolean} isLocked - User has a locked prediction (from draft auto-lock)
 * @param {boolean} gameStarted - Game has started (tipoff passed) but not finished
 * @param {string|null} draftWinner - The winner ID from draft/lock, or null
 * @param {string|null} lockedWinner - The winner ID from locked prediction, or null
 * @returns {{ state: string, cssClass: string, disabled: boolean, selectedWinner: string|null }}
 */
function getMatchDisplayState(isFinished, isLocked, gameStarted, draftWinner, lockedWinner) {
  // Locked winner overrides draft winner
  var selectedWinner = lockedWinner || draftWinner || null;

  if (isFinished) {
    return { state: "finished", cssClass: "match-finished", disabled: true, selectedWinner: selectedWinner };
  }
  if (isLocked) {
    return { state: "locked", cssClass: "match-locked", disabled: true, selectedWinner: selectedWinner };
  }
  if (gameStarted) {
    return { state: "started", cssClass: "match-started", disabled: true, selectedWinner: selectedWinner };
  }
  return { state: "open", cssClass: "", disabled: false, selectedWinner: draftWinner };
}

module.exports = {
  getMatchTipoffStatus: getMatchTipoffStatus,
  isAllStarted: isAllStarted,
  resolvePickForMatch: resolvePickForMatch,
  getActualRoundIndex: getActualRoundIndex,
  getVisibleThroughRound: getVisibleThroughRound,
  hasCompletePicks: hasCompletePicks,
  buildMatchRoundMap: buildMatchRoundMap,
  shouldHidePicksForMatch: shouldHidePicksForMatch,
  getPickStatus: getPickStatus,
  getMatchDisplayState: getMatchDisplayState,
};
