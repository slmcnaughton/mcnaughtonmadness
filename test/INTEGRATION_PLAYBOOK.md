# Integration Test Playbook

Manual integration tests for McNaughton Madness. Run against the **dev database**.
These scenarios are language-agnostic — they survive the .NET rewrite.

---

## Pre-Tournament: Alias Verification

1. Run `node helpers/scrapeCbsNames.js` (scrapes ~59 days of CBS scoreboards)
2. Verify 0 unmatched names for your 64 tournament teams
3. If any unmatched: add to `ALIAS_GROUPS` in `helpers/teamAliases.js` or via admin teams page

---

## Full Scoring Flow

### Prerequisites
- Connected to dev DB (`DATABASE_URL_DEV` in `.env`)
- 2 test user accounts (e.g., `testUser1`, `testUser2`), both non-admin
- 1 admin account

### 1. Create Tournament
- Log in as admin
- Go to `/tournaments/new` and create the tournament
- **Important:** The `startDay` in `routes/tournaments.js` determines round start times.
  For testing, temporarily change the start date so Round 1 begins ~10 minutes from now.

### 2. Create Group + Join
- Log in as `testUser1` → create a tournament group
- Log in as `testUser2` → join the same group

### 3. Make Picks (before tipoff)
- As `testUser1`: go to the group → make Round 1 picks
- As `testUser2`: go to the group → make Round 1 picks (pick differently!)
- **Verify:** Both users' picks show on the group page bracket view

### 4. Scrape Scores (after tipoff window starts)
- Wait for the scheduled scrape job to fire, **or** manually trigger:
  ```
  node -e "require('./scrape')()"
  ```
- **Verify:**
  - Console shows scraped results
  - No `[UNMATCHED]` warnings for tournament teams
  - Bracket view shows winners for completed games
  - Group standings page shows updated scores

### 5. Scoring Spot-Checks
Pick 2-3 matches and verify scores manually:

| Scenario | Formula | Example |
|----------|---------|---------|
| Correct pick, favorite wins | (winnerSeed / loserSeed) × round | #2 beats #15, R1: (2/15) × 1 = 0.133 |
| Correct pick, upset wins | (winnerSeed / loserSeed) × round | #12 beats #5, R1: (12/5) × 1 = 2.4 |
| Wrong pick, you picked the underdog | -1 × round | R1: -1 |
| Wrong pick, you picked the favorite | -(loserSeed / winnerSeed) × round | #2 loses to #15, R1: -(2/15) × 1 = -0.133 |

### 6. Round Completion
- If not all games have completed naturally, set remaining match winners via MongoDB:
  ```
  db.matches.updateOne(
    { matchNumber: X },
    { $set: { winner: ObjectId("...winning team id...") } }
  )
  ```
  Then trigger another scrape or manually call the scoring pipeline.
- **Verify:**
  - `tournament.currentRound` incremented (check DB)
  - All `tournamentGroup.currentRound` values incremented
  - End-of-round summary email sent (check Resend dashboard at resend.com)
  - Email contains correct rankings and scores
  - Users can now access Round 2 pick form

### 7. Next Round Picks
- As `testUser1`: make Round 2 picks
- **Verify:** Winners from Round 1 are correctly populated as opponents in Round 2 matches

---

## Admin Dashboard Tests

1. Log in as admin → verify "Admin" link appears in nav dropdown
2. `/admin` → verify user table loads with all users
3. "Find Suspicious" → verify it highlights users with no group membership
4. Select suspicious users → "Delete Selected" → verify deletion + flash message
5. Reset a test user's password → log out → log in as that user with new password
6. `/admin/teams` → verify teams listed by region → edit a team name → verify change persists

---

## Bot Prevention Tests

1. Submit registration form with JavaScript disabled → should be rejected ("Nonhuman user detected")
2. Submit registration form normally → should succeed
3. Fill in the hidden `message` honeypot field → should be rejected
