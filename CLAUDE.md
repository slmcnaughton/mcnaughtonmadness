# CLAUDE.md

Guidance for Claude working in this codebase. Prioritize this file over general assumptions.

## Project Summary

**McNaughton Madness** — an Express/MongoDB web app for running NCAA tournament bracket pools. Per-matchup picks (not a fill-the-whole-bracket upfront), round-by-round scoring that rewards upsets, auto-scraped results from CBS, per-game tipoff locking with late-pick penalties, draft saves, and a commissioner-approval flow for late bonus picks.

Public scoring rules are documented in `README.md`. Don't duplicate that math here.

## Running / Testing

```bash
npm start        # node app.js (dev uses DATABASE_URL_DEV)
npm test         # runs 4 pure-logic test files in sequence
```

The test harness is **plain Node `assert` scripts** — no Jest/Mocha. Test files live in `test/` and are invoked directly via `node test/xxx.test.js`. When adding tests, extend `test/harness.js` or create a new file and add it to the `npm test` script.

**Only pure-logic helpers have automated tests.** Middleware, routes, and DB code are validated via `test/INTEGRATION_PLAYBOOK.md` — a manual script against the dev DB. There is no CI.

## Architecture at a Glance

```
app.js                     Express bootstrap, session, passport, route mounting, scheduled jobs
scrape.js                  CBS scoreboard scraper (calls middleware.scrapeUpdateResults)
seeds.js                   Dev-only DB seeding (incl. seedFastForward for late-stage testing)

routes/                    HTTP handlers; thin, delegate to middleware
middleware/index.js        2000+ lines — THE core orchestrator (see "Middleware Map" below)
middleware/emailHelper.js  Resend-based transactional email

models/                    Mongoose schemas (~20 models)
helpers/                   Pure, testable logic (scoring, tipoff, teamAliases)
views/                     EJS templates (Bootstrap + bespoke CSS in public/stylesheets/main.css)
```

URL hierarchy (see `app.js`):
- `/tournaments/:year/rounds/:numRound` — admin round editing + dev tipoff tools
- `/tournamentGroups/:groupName` — group pages, bracket, manage dashboard
- `/tournamentGroups/:groupName/userTournaments/:username/:numRound/edit` — user pick entry

## Data Model — The Essential 8

Five models carry most of the domain logic. Internalize these before editing:

| Model | Purpose | Notes |
|---|---|---|
| `Tournament` | The yearly NCAA tournament | Has `rounds[]`, `currentRound`, scheduled job refs |
| `Round` | One of 8 rounds (6 real + FF + Champ) | `numRound` 1–6 for real rounds, 7 = Final Four bonus, 8 = Champion bonus |
| `Match` | A single game | `matchNumber`, `topTeam`, `bottomTeam`, `winner`, **`startTime`** (per-game tipoff) |
| `TournamentGroup` | A pool of users | Owns `userTournaments[]` and `userMatchAggregates[]` |
| `UserTournament` | One user's entry in a group | Owns `userRounds[]`, score roll-up |
| `UserRound` | One user's picks for one round | Has `userMatchPredictions[]`, `pendingApproval`, `rejected` |
| `UserMatchPrediction` | One pick for one match | `winner`, `score`, `late` |
| `UserMatchAggregate` | Group-level picker roll-up per match | `topTeamPickers[]`, `bottomTeamPickers[]`, **`missedPickers[]`** |
| `DraftPick` | In-progress (unsubmitted) picks | Unique on `(user, tournamentGroup, numRound)` |

### Key relationships & quirks

- **Bonus rounds (7, 8) don't use `UserMatchAggregate`**. They use `BonusAggregate` instead. Most bracket code branches on `numRound < 7`.
- **Round numbering is NOT a straight index.** Rounds 7/8 are stored at indices 4 and 6 of `tournament.rounds[]`. Use `tipoff.getActualRoundIndex(numRound)` when mapping.
- **`UserRound.pendingApproval`** — late bonus picks (R7/R8 submitted after R1 tipoff) land here until the commissioner approves on the manage page.
- **`UserRound.rejected`** — rejected late bonus picks stay in the DB but their predictions are never scored.
- **`UserMatchPrediction.winner: null` + `late: true`** is how "missed pick" is represented. These are created by `scoreUserMatchPredictions` branch1.
- **`UserMatchAggregate.missedPickers`** is the picker list that shows on the group bracket popup under the team rows.

## Middleware Map (`middleware/index.js`)

It's long. Here's what lives where:

**Scrape/scoring pipeline** (lines ~213-730):
- `scrapeUpdateResults` → normalizes parsed CBS rows
- `updateResults` → the orchestrator: **`advanceWinners` → `lockDraftPicksForStartedGames` → `scoreUserMatchPredictions` → `updateTournamentGroupScores` → `isRoundComplete`**
- `scoreUserMatchPredictions` — two parallel branches:
  - **branch1** creates "missed" `UserMatchPrediction` docs for users with no pick
  - **branch2** scores existing predictions (respects `rejected` flag)

**Pick submission flow** (lines ~791-1370):
- `checkTipoffTime` → gates R1 submissions by per-game tipoff, allows late R7/R8 with `res.locals.bonusPicksAreLate`
- `userRoundCreation` → builds the `UserRound`, resolves draft vs submitted via `tipoff.resolvePickForMatch`, marks late picks
- `updateUserMatchAggregates` → pre-`$pull`s the user from all three aggregate arrays then re-pushes based on current predictions (handles edits cleanly)

**Visibility & status** (lines ~1373+):
- `checkUserPickStatus` → returns `{ shouldHide, visibleThroughRound }` consumed by per-round visibility checks
- `lockDraftPicksForStartedGames` → runs on scrape, converts draft picks to real predictions for games that started, then calls `markMissedPickersForStartedGames`
- `markMissedPickersForStartedGames` → creates aggregates as needed, populates `missedPickers`, self-heals duplicates
- `autoSubmitDrafts` → scheduled job that promotes drafts to submissions at tipoff

## Late / Missed Pick Conventions

This is the most bug-prone area. The invariants:

1. A **late pick** is a pick submitted AFTER the game's `startTime` where no draft existed. Scoring rule: **always use the loser's loss score**, regardless of what they picked (per-game penalty).
2. A **missed pick** is no pick at all. Represented as a `UserMatchPrediction` with `winner: null, late: true`. Also added to `UserMatchAggregate.missedPickers`.
3. Missed-pick **score equals the active loss score** — the score someone got for picking the actual loser.
   - `winner === topTeam` → loser is bottom → score is `bottomLossScore`
   - `winner === bottomTeam` → loser is top → score is `topLossScore`
   - The group bracket template in `showBracket.ejs` had this inverted before — double-check if touching.
4. Two paths write to `missedPickers` and **must be deduped**: `scoreUserMatchPredictions` branch1 (on finish) and `markMissedPickersForStartedGames` (on tipoff). `markMissedPickersForStartedGames` also contains a self-healing pass.
5. **Late bonus picks (R7/R8 submitted after R1 tipoff)** go to `pendingApproval` state. Commissioner approves/rejects on `manage.ejs`. Rejected rounds stay in DB but are excluded from scoring.

## Visibility / Fog-of-War

The group bracket hides picks the viewer hasn't yet earned. Drive everything through:

```js
var pickStatus = await middleware.checkUserPickStatus(userId, groupName);
// → { shouldHide, visibleThroughRound }
```

`visibleThroughRound` is the **highest round number** the viewer may see. Admins and own-bracket views bypass. In templates, use `shouldHideForMatch(matchNumber)` which combines `matchRoundMap` (from `tipoff.buildMatchRoundMap`) with `visibleThroughRound`.

## Template Gotchas

- **`foundUserTournament.toObject({ virtuals: true })`** — convert Mongoose docs to plain objects **before reassigning nested populated arrays**. Mongoose silently ignores array reassignments on documents; this bit us in `routes/userTournaments.js` when reordering predictions.
- **Aggregate lookup**: never use `tournamentGroup.userMatchAggregates[match.matchNumber - 1]`. Build an `aggByMatch[matchNumber]` map and look up by key. Aggregates can be out of order (especially when created by the draft-lock path).
- **Predictions reordering**: bracket templates use positional/index access. Round handlers reorder `userMatchPredictions` by `matchNumber`, inserting `{ _placeholder: true, missed: true }` for gaps on started matches. Templates must check `if (userMatch && !userMatch._placeholder)` before team-specific rendering.
- **`matchStartedMap`** must be built BEFORE it's read in the reordering loop. A prior bug crashed with "Cannot read properties of undefined" because of `var` hoisting order.
- **Bracket CSS classes**: `.win` (dark blue), `.loss` (mauve), `.noWin` (yellow/unknown), `.aggregate-missed` (dark red) — all share the `.aggregate` base. Missed picks use flexbox on `.teamHeader` (not float: right like team rows) for reliable alignment.

## Scheduled Jobs

Defined in DB collections referenced from `Tournament`:
- `scrapes[]` → `scrape()` (CBS scoreboard scraper)
- `emailPickReminderJobs[]` → `emailHelper.sendPickReminderEmail()`
- `startTimeScrapeJobs[]` → `scrape.scrapeStartTimes()` (pulls tipoff times before games start)
- `autoSubmitJobs[]` → `middleware.autoSubmitDrafts()`

All are rescheduled on server start in `app.js`. A `scrapeInProgress` flag prevents concurrent scrape runs.

## Dev Tools (visible only when `isDev`)

- `views/rounds/edit.ejs` has a **Tipoff Controls** panel: set `startTime` to now or +N minutes, on one match or all. Bulk/per-match buttons use `fetch()` (not a form) because they'd otherwise be nested in the main round form.
- The per-match "Tipoff Now" posts to `POST /tournaments/:year/rounds/:numRound/setStartTimes` with a single `matchNumbers` value — the route normalizes string → array.
- `seeds.seedFastForward()` jumps the DB to late-stage tournament state for UI testing.
- Random-fill buttons on pick-entry pages.

## Conventions

- **`var` everywhere**, function declarations, no destructuring in route handlers. This is intentional — keep it consistent.
- **No TypeScript, no build step.** Served directly.
- **Routes are thin**: validate input, set `res.locals`, delegate to middleware. Middleware does the Mongo work.
- **Tests are written against the helpers**, not the middleware. If you find yourself wanting to test middleware, consider extracting pure logic to `helpers/`.
- **Emails** go through `middleware/emailHelper.js` using Resend. All templates live inside that file.

## Known-Risky Areas (tread carefully)

1. **Double-write to `missedPickers`** — fixed but fragile. Any new path that modifies the array should dedupe.
2. **Aggregate creation happens in 3 places**: `updateUserMatchAggregates`, `markMissedPickersForStartedGames`, `updateAggregateForPick`. All three compute scores via `scoring.calculateAggregateScores(...)`. Keep them consistent.
3. **`lockDraftPicksForStartedGames`** previously ran AFTER `scoreUserMatchPredictions`, causing double penalties. It's now called inside `updateResults` between `advanceWinners` and scoring. Don't reorder without tracing the penalty math.
4. **Admin submitting picks on behalf of another user**: `res.locals.targetUserId` must be used (not `req.user._id`) anywhere that writes. Admin session edits caused several bugs in 2026 testing.
5. **Bracket template round index math**: `numRound - 1` is wrong for rounds 7/8. Always use `tipoff.getActualRoundIndex`.

## Quick File Pointers

- Scoring math → `helpers/scoring.js` (pure, tested)
- Tipoff/lock/visibility decisions → `helpers/tipoff.js` (pure, tested)
- The big orchestrator → `middleware/index.js` (see map above)
- Group bracket rendering → `views/tournamentGroups/showBracket.ejs`
- User bracket rendering → `views/userTournaments/show.ejs`
- Pick entry UI → `views/userRounds/edit.ejs` (+ `editFinalFour.ejs`, `editChamp.ejs`)
- Commissioner dashboard → `views/tournamentGroups/manage.ejs`
- Manual test guide → `test/INTEGRATION_PLAYBOOK.md`
