# Sprint Change Proposal — 2026-10-25: The roadmap rebuilt — Epic 10 The Playtest Pass, Epic 11 The Ledger, Epic 12 The Front Door; The Account is Epic 13

**Status:** APPROVED by Eric 2026-10-25 (gds-correct-course, thought-dump mode — Eric supplied eight itemized thoughts in chat and ruled the open points by AskUserQuestion)
**Trigger:** Epic 9 retrospective, 2026-10-24 (`epic-9-retro-2026-10-24.md` §6 significant-discovery alert, action item 1; epic-9 amendments 216–217) and Eric's 2026-10-25 brief: *"epic 10 in its current state will be forgotten and we are going to rebuild the roadmap."*
**Author:** Developer agent with Eric (every design clause below is Eric's ruling or his verbatim thought from this session; nothing is invented here — a clause with no ruling behind it is marked `[unruled]`)
**Predecessors:** `sprint-change-proposal-2026-10-06.md` (Epic 9 inserted, The Account → Epic 10), `-2026-10-23.md` (How-to-Play and Record moved out of Epic 9 to this run)

---

## 1. Issue Summary

**Problem statement.** Epic 10 (The Account) stands in `epics.md` as ten live stories opening with a database-and-auth floor story. Eric ruled inside Epic 9 that he is *"not setting up databases, accounts, or auth at all just yet"* (2026-10-24, amendment 217) and that his playtest feedback comes first (2026-10-23, amendment 216). On 2026-10-25 he set the new shape in one brief: balance and design changes from the playtest, in-game UX improvements, Google's **H5 Games Ads approval has arrived** but the **AdSense site review says the site cannot be crawled and shows no content**, so the publisher account will not be approved until the site is compliant; a **database strictly for match data, now**, to see trends, balance and tune bots from matches with humans in them; and **accounts "probably soon"** so a no-ads package can be sold — motivation noted, not a story.

**Discovery.** Eric's playtests of 0.18.71 / 0.19.0 (the eight itemized thoughts in §2); the AdSense site-review notice (*"Google can't crawl / no content"*); the H5 Games Ads approval e-mail.

**Evidence (what the code says today, verified this session).**
- `client/index.html` is a `<div id="app">` and a `<title>`; `client/how-to-play/index.html` and `client/privacy/index.html` have an EMPTY `<body>` with a module script — every word on all three pages is rendered by JavaScript from `client/src/ui/home.ts`, `client/src/how-to-play/copy.ts`, `client/src/privacy/policyCopy.ts`. The home page has no `<meta name="description">`; no page has Open Graph tags, a canonical link or JSON-LD; there is no `robots.txt`, no `sitemap.xml`, no `client/public/`. The only `noindex` is staging-only (`server/src/robots.ts` under `HC_NOINDEX=1`; `stagingGate.ts`). A crawler fetching production sees a blank document — exactly Google's finding.
- The AdSense H5 interstitial is BUILT: `client/src/ads/adsAdapter.ts` behind the Epic 0 `PortalAdapter`, break `return-to-port`, Google's certified CMP, GA4 behind consent (`client/src/analytics/`). The results display unit (`resultsAd.ts`) is dormant until `VITE_ADSENSE_SLOT_RESULTS` is set. There is no rewarded-ad hook. Ads need no game code; they need the SITE approved.
- The server already builds a complete server-only `MatchRecord` at every finished match (`server/src/game/matchRecord.ts`: match id, mode, PV, game version, ended-at, activation, duration, end cause, outcome, winner; per participant id, callsign, role, hull, gun, placement, kills, PvE kills, damage dealt, final cards, EVERY hand dealt with offered / taken / redrawn / timestamps, banked levels; `userId` hard-typed `null`) and hands it to `createAccountWriter()` → `NullWriter` (`server/src/game/accountWriter.ts`, installed at `app.config.ts:37`), fire-and-forget from `ArenaRoom.handOverRecord`. "Start the database" is: mount a store and a real writer. Nothing else is missing. `@colyseus/database` 0.18.3 and `@colyseus/auth` are in `server/package.json` unused (the Story 8.0 pre-install the retro's never-pre-install rule came from); no `databases:` block in `render.yaml`; no `DATABASE_URL` reader anywhere.
- Inherited from Epic 9: Story 9.17 How-to-Play and Record (text kept whole in `epics.md`, 14 ledger entries owned by it); the cancelled 9.17 Dependency Sweep branch `worktree-create-story-9-17-dep-sweep` (research + patch commit e92b0596, 29 → 16 low advisories); the ledger's 68-line Eric's-call list.

**Issue type.** Strategic re-plan from the stakeholder (new requirements: playtest feedback, publisher compliance, a match-data store) plus a deferral (accounts shift right). Not a technical limitation, not a misunderstanding, not a failed approach.

## 2. Impact Analysis

### Epic impact

| Epic | Impact |
|---|---|
| Epic 9 Tune and Clean | CLOSED 2026-10-24; untouched. |
| **Epic 10 — The Playtest Pass** (NEW) | Eric's eight thoughts minus the site item, in HIS order, plus the re-homed How-to-Play and Record as the closing story. |
| **Epic 11 — The Ledger** (NEW) | The match-data store: mount a database and the real writer behind the existing `MatchRecord`; every row anonymous. |
| **Epic 12 — The Front Door** (NEW) | The landing page and every page rebuilt so Google can crawl them; publisher-site approval. |
| Epic 10 The Account → **Epic 13** | Renumbered only (Eric 2026-10-25: *shift right, text kept whole*). Stories 10.1–10.11 (10.5 deleted) → 13.1–13.11 (13.5 deleted), text unchanged; 13.11 widens from "Epics 8–10" to "Epics 8–13"; 13.1 gains a dated note that Epic 11 may already have built the store half. Every known gate stands. New dated motivation note: a no-ads package (Eric 2026-10-25) — recorded, no story. |

**Sequence (Eric 2026-10-25, AskUserQuestion): 9 → 10 (Playtest Pass) → 11 (Ledger) → 12 (Front Door) → 13 (Account).** Eric chose gameplay first, the store second, the site third.

**Dependencies.** Epic 11 writes whatever `MatchRecord` carries, so Epic 10's new fields (consumable loadout, offer slot types, HE ticks) land in the record before the store exists — no schema churn. Epic 12 needs nothing from 10 or 11. Epic 13's 13.1 either inherits Epic 11's store (then 13.1 shrinks to the auth-side env table) or lands as written if 11 chose differently — decided at 13.1's create-story, not here.

### Story impact — Epic 10 The Playtest Pass (Eric's thoughts verbatim, his rulings this session)

| # | Story | Eric's words / ruling of record | Open at spec step |
|---|---|---|---|
| 10.1 | **Four Configurable Consumable Slots** | *"Go back down to 4 consumable slots, make what each slot holds player-configurable so that the game only gives you those consumables."* RULED 2026-10-25: configured on the port **LOADOUT screen** as a CONSUMABLES row (amendment 96's key · value rows), saved in localStorage like the callsign; **keys return to 1–4**, mapped to the four slots in order; the offer draw deals only the four chosen consumable lines. Supersedes Story 9.2's six fixed keys (epic-9 amendments 31–38) for the slot count and key row. | the default four for a fresh browser; what a slot holding a line at cap does in the offer (amendment 94 stands unless Eric says otherwise); How-to-Play keys copy (10.8) |
| 10.2 | **The First-Minute Objective** — DESIGN SITTING FIRST | *"Need some kind of objective for players in the first minute. Drones themselves are fairly uninteresting, perhaps some marked supply buoys with guards? This could transition into a source of consumables, experience, etc. Perhaps look into other kinds of pickups on the map."* RULED 2026-10-25: a **design sitting before any story** (`gds-brainstorm-game` / forge with Eric); the story is spec'd from its output. This slot HOLDS the number; no AC exists yet. | everything — the mechanic is undesigned |
| 10.3 | **The Battle UI: XP Seen, the Offer in the Corner** | *"In game UI needs some improvements. XP/levels not really very visible unless you know what you are looking for. Tabbing open a dialog to upgrade can get in the way of fights, need to find a way to incorporate this into the in-game battle UI without getting in the way, so your choice pops up in the corner or something and you just click it (or use the hotkey) when convenient."* Visual candidates are RENDERED and shown to Eric before anything is committed (standing rule); DESIGN.md is read first and the designer's re-cut is recorded. | the layout and register of the corner offer; whether `Tab` survives as an alternate open |
| 10.4 | **Offer Composition** | Verbatim: *"Choices gained on upgrade should always include: 1× Ship Upgrade, 1× Weapon Upgrade, 1× Consumable, 1× Ship Upgrade, Weapon Upgrade, or Consumable. When you are out of any of those upgrade types, then they should roll the other types."* His worked example — all weapons at Tier V → `1× Ship, 1× Ship OR Consumable, 1× Consumable, 1× Ship OR Consumable`; out of Ship upgrades too → four Consumables. *"If the pool is unknown (the wildcard slot) then roll for the type first and then roll for the item."* Supersedes the current two-stage kind-then-line draw's "a weapon guaranteed while a slot is open" law in `sim/draw.ts` (Story 8.14). | the wildcard's type weights (equal thirds `[unruled]`); whether a REDRAW keeps the slot types (reading: yes) |
| 10.5 | **Flak Takes No Range Dropoff** | *"Flak, being a burst shell, should suffer no damage dropoff from range."* `CONFIG.gunAttenuation` (fullFrac 0.5 / minFactor 0.5, amendment 187) becomes a per-gun dial; flak's is flat 1.0. | none beyond the dial shape |
| 10.6 | **Bots Fill the Standard Queue at 1:00** | *"Solo queue goes down to 1:00 lobby time and fills with bots at that time if there aren't enough players, so there is always a game."* RULED 2026-10-25: **yes — the queue holds 1:00 and bots fill the roster up to a minimum.** This REVERSES FR34 / Story 6.1's "zero bot-fill — bots never masquerade as players" (epics.md:93, :1509; GDD "No bot-fill in standard lobbies", :287, :326–327, E5 row). `queueTimerMs` 120000 → 60000; `minHumans` 2 stays the ARM condition `[unruled whether a lone captain arms the timer]`. | the roster minimum bots fill to; whether bots are labelled in the feed / results (honesty posture) |
| 10.7 | **The Machine Gun: Steepest Dropoff, High Explosive on the Ladder** | *"Machine guns, being the lightest shell, should suffer the steepest damage dropoff, but probably should get High Explosive stat on its tiered upgrades, that has a scaling chance to apply a scaling damage over time on hit to compensate."* Uses 10.5's per-gun dial; HE is a stat on the MG's TIERED upgrades (no one-off, amendment 232), chance and DoT both scale by tier; a DoT is a new damage source — victim-private like every damage, the six-exception invariant EXTENDED never widened; no friendly fire. | every number (dropoff curve, chance per tier, DoT per tier, duration); whether HE stacks with the FOULING SHELL / burn zone |
| 10.8 | **How-to-Play and Record** (re-homed from Epic 9 — 2026-10-23, amendment 216; text in `epics.md` under the moved-out heading) | Everything the Epic 9 pass owed (the 9.1–9.16 items, private lobbies, drone drops) PLUS this epic's: four slots and keys 1–4, the offer composition, flak and MG dropoff, HE, bot fill, the objective; GDD / catalog-v3 / architecture dated supersession stamps for Epics 9 AND 10 (incl. FR34 and the GDD lobby sentences); copy Eric's; no in-game copy unasked. | the copy |

Design numbers are settled **at each story's spec step with Eric via AskUserQuestion**, never by the spec author (standing).

### Story impact — Epic 11 The Ledger

| # | Story | Shape (Eric's intent; architecture is this run's recommendation, see §4) |
|---|---|---|
| 11.1 | **The Match Ledger** (floor story, Story 0.1 / 8.0 precedent — no player-visible change) | Render managed Postgres per environment (`hullcracker-db`, `hullcracker-dev-db`) declared under `databases:` in `render.yaml` IN THE SAME PR as the code that reads `DATABASE_URL` (the never-ahead rule, AR24); ABSENCE-GATED — without the URL the `NullWriter` stays and the game is byte-identical, with it unreachable the process still starts and logs `ledger.disabled { reason }` once (the 10.1 posture, kept); tables `matches`, `match_participants`, `match_hands` mirroring `MatchRecord` with NO account column yet (added by Epic 13; `userId` stays `null`); the real writer = in-process FIFO, retry once, `flush()` on SIGTERM (Render redeploys must not lose records); nothing on the tick ever awaits it; migrations checked in, run at boot, never `"auto"`; the server test suite exercises the real SQL (PGlite or equivalent) so `npm run check` needs no Postgres; `/metrics` gains `ledger.writeOk / writeFailed / queueDepth`; `/health` unchanged; the privacy policy gains ONE sentence saying match results are stored server-side (see §4 on the callsign); staging gets its own database so the writer is QA'd there. The data layer choice is §4 item 1. |
| 11.2 | **Reading the Ledger** (RULED IN, Eric 2026-10-25) | A `server/scripts/ledgerReport.mjs` that reads the store and renders the harness's existing report shapes (class share, gun share, placement by hull × gun, hands offered vs taken, bot vs human) over live matches, filterable by version and date; no web UI, no admin console (that is 13.7). |

### Story impact — Epic 12 The Front Door

| # | Story | Shape |
|---|---|---|
| 12.1 | **The Landing Page, Redesigned** (design pass, Google Stitch — Eric 2026-10-25) | Eric: *"we need to SERIOUSLY rethink the landing page and user experience so that we can get the site itself approved."* Team effort: the agent writes the Stitch prompts (DESIGN.md's tokens and registers, the page's content brief: what the page SAYS before the canvas — pitch, how to play in three lines, modes, the static-page links), Eric drives Stitch and picks; the chosen output is reconciled with DESIGN.md and ratified before 12.2 builds it. `[unruled: Eric's content for the page]` |
| 12.2 | **Crawlable Pages** | Every page carries its content as HTML at build time — the home pitch, the How-to-Play copy and the privacy policy rendered from their existing copy modules into the documents (prerender at build, the modules stay the single source), so a crawler and a scripting-disabled reader get the text; `<meta name="description">` on the home; Open Graph + Twitter card tags and a canonical URL on every page; `robots.txt` and `sitemap.xml` served from production (staging's `X-Robots-Tag: noindex` posture untouched); `ads.txt` verified present; page titles per page; NFR2's load budget untouched (static text costs nothing). |
| 12.3 | **Publisher Approval** | Resubmit the site in AdSense; fix whatever the review names; once approved, the production smoke of the CMP + interstitial the ledger has owed since Epic 7 (`deferred-work.md` "production smoke once Google's CMP renders", two entries); `VITE_ADSENSE_SLOT_RESULTS` is Eric's call, not this story's. Done = the publisher site is approved and the first live interstitial is seen on production. |

### Artifact conflicts

| Artifact | Conflict | Change (this PR) |
|---|---|---|
| `epics.md` | Epic List ends at Epic 10 The Account; §Epic 10 body is The Account; moved-out 9.17 says "re-homed at the Epic 10 correct-course"; FR34 says zero bot-fill; the Extension paragraph's "one unit" reading | Epic List gains 10 / 11 / 12 entries and The Account → 13; three new epic sections (10.1–10.8, 11.1–11.2, 12.1–12.3) in the house shape; §Epic 10 The Account heading → Epic 13 with 13.N numbers and a dated renumbering note, text otherwise unchanged; 13.11 "Epics 8–10" → "Epics 8–13"; moved-out 9.17 heading gains "→ Story 10.8"; FR34 gains a dated supersession stamp (bot fill, 10.6); the Extension paragraph gains a dated note (accounts shifted right 2026-10-25) |
| `gdd.md` Development Epics | E10 row = The Account; sequence line ends at E10; Assumptions line "E10 depends on it" | E10 / E11 / E12 rows added; Account row → E13; sequence → E8 → E9 → E10 → E11 → E12 → E13; Assumptions line → E13. **Mechanics sections are NOT rewritten here** — dated supersession stamps land at 10.8 (the amendment-89(k) pattern) |
| `game-architecture.md` | "E9/E10" in the dated Account Store amendment | History stays; a dated renumbering notice beside the 2026-10-06 one (E10 → E13; the store half may land at Epic 11) |
| `DESIGN.md` / `EXPERIENCE.md` | forward pointers "Story 10.4 / 10.6" | → 13.4 / 13.6; one-line stamp |
| `sprint-status.yaml` | `epic-10` block = The Account | New `epic-10` (backlog, 10-1..10-8), `epic-11` (11-1..11-2), `epic-12` (12-1..12-3) blocks; Account block → `epic-13` with `13-N` keys; `9-17-how-to-play-and-record: deferred` → pointer to 10-8; one-line stamp |
| `gds-workflow-status.yaml` | `correct-course` line, `next_expected` | One-line stamps |
| `deferred-work.md` | 14 entries owned by "9.17 (How-to-Play)"; 8 by "Epic 10 (The Account)"; the npm-audit entry's NEXT STORY pointer | Append-only: ONE dated entry — owners re-pointed by reference (9.17 → 10.8; Epic 10 → Epic 13; the dependency sweep ABANDONED by Eric 2026-10-25, branch left as research, revisit when it matters); old text stands |
| `epic-10-context-amendments.md` | does not exist | Created; amendment 1 = this proposal's rulings |
| `epic-9-context-amendments.md` | retro's "re-homed at the Epic 10 correct-course" | History; untouched (the ledger entry carries the pointer) |
| `project-context.md` | "FR34 … no bot-fill" is not stated there; version rule text | untouched (10.6 updates it if a rule changes) |
| Code | none | docs only; no version bump, no PV bump, no cycle |

### Technical impact

None in this PR. Downstream, per epic: **10** — 10.1 changes the wire (loadout on the seat, slot count) → PV bump; 10.4 rewrites `sim/draw.ts`'s composition law (shared, deterministic, both sides); 10.5/10.7 per-gun attenuation and a DoT source (victim-private; invariants extended); 10.6 touches `StandardQueueRoom` and `Match` roster fill (bots are ordinary ships through the input pipeline — unchanged). **11** — the first persistent store; `world.ts` / `match.ts` keep zero persistence imports; nothing in a tick awaits the database. **12** — a Vite build step (prerender) and static files; the server's `express.static` already serves `client/dist`; no runtime change.

## 3. Recommended Approach

**Direct adjustment.** Three epics inserted, The Account renumbered, no rollback, MVP unchanged (the GDD's goals stand; FR34 is superseded by an Eric ruling, not by drift). Effort: Low for this proposal (docs); the epics are Eric-paced. Risk: Low — the renumbering risk is the same as 2026-10-06 and is mitigated by the table above and 13.11's reconciliation. Rollback and MVP review were evaluated and rejected: nothing shipped needs reverting.

## 4. Decisions ruled by Eric in this proposal (2026-10-25, AskUserQuestion + chat)

1. **Epic 11's data layer — RULED: Render Postgres + `@colyseus/database`** (Drizzle + `postgres`, already in `server/package.json` since 8.0), checked-in migrations, PGlite in tests — the 13.1 (ex-10.1) store half as already architected; Epic 13 inherits it.
2. **The callsign in the ledger — RULED: NOT stored.** `MatchRecord.participants[].name` is dropped at the writer; rows carry the opaque participant id only. The privacy policy needs a one-line note that match results are stored server-side with no name.
3. **11.2 Reading the Ledger — RULED: IN** (Eric: *"Oh, yes. Sure."*): the readout script over live matches in the harness's report shapes.
4. **Epic 12 order — RULED: design pass first, using Google Stitch.** Eric: *"Design pass first, but I am going to use google's Stitch. You will be responsible for creating prompts, though. Team effort."* 12.1 is therefore: the agent writes the Stitch prompts from DESIGN.md's system and the page's content brief, Eric drives Stitch, the chosen output is reconciled with DESIGN.md (tokens, registers) and ratified before 12.2 builds it.
5. **Epic names** are working labels (Eric 2026-10-06: the name is irrelevant) — The Playtest Pass / The Ledger / The Front Door.
6. **Epic 10 story order** = Eric's thought-dump order with the site item lifted out and How-to-Play last.

Also ruled this session: Google's notice is the AdSense site review ("can't crawl / no content"); The Account shifts right with its text whole; the 9.17 dependency branch is ABANDONED ("revisit dependencies later when it matters"); epic order Gameplay → Store → Front Door; 10.1 on the LOADOUT screen with keys 1–4; 10.2 gets a design sitting first; 10.6 is a 1:00 timer with bots filling to a minimum.

## 5. Implementation Handoff

**Scope: Moderate → Major** (a roadmap rebuild; backlog reorganization, no code; the design sittings for 10.2 and 12.1 are PM/UX work before their stories).

| Who | Does |
|---|---|
| This run (docs PR) | The artifact edits in §2, this proposal file, `epic-10-context-amendments.md` #1, the ledger entry, both tracker stamps; ONE PR to `development`; **never merged without Eric's say-so** |
| Eric | Approves this proposal (§4 answered); merges the PR; rules numbers at each story's spec step |
| `gds-create-story` 10-1 | First story (Four Configurable Consumable Slots) |
| `gds-brainstorm-game` / forge | The 10.2 design sitting, before 10.2's create-story |
| `gds-ux` | The 12.1 landing-page pass, before 12.2 |
| `gds-sprint-planning` | NOT re-run — the tracker is edited in place here (checklist 6.4) |

**Success criteria.** Every planning artifact says Epic 10 = The Playtest Pass, 11 = The Ledger, 12 = The Front Door, 13 = The Account; `npm run check` green (docs only); both trackers diffed against PR #305's file list to prove the stamp rule held; Eric approves.

---
*Approval:* Eric, 2026-10-25 — "approved." (in chat, after reading the file; the four §4 rulings by AskUserQuestion and chat the same session).
