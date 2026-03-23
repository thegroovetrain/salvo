# TODOS

## Quick Play

### Queue Timeout to Lobby

**What:** After 5+ minutes in queue with no match, show a message suggesting the player create a private game with bots instead.

**Why:** The "no bot backfill" design means a solo player at 2am waits forever with no feedback. This is the only escape hatch besides manually clicking Cancel.

**Context:** Quick Play v0.9.0 ships with indefinite queue wait (humans only). This adds a client-side timer that shows "No players found. Try creating a private game with bots?" after 5 minutes, with a button to return to lobby. Server-side unchanged — the timer is purely client UX. The 5-minute threshold is a guess; may need tuning based on actual usage.

**Effort:** S
**Priority:** P2
**Depends on:** Quick Play v0.9.0
