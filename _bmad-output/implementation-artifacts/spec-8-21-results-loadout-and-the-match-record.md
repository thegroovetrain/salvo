---
title: 'Story 8.21: Results LOADOUT and the Match Record'
type: 'feature'
created: '2026-09-30'
status: 'in-review'
baseline_revision: 'ae9f92f'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context-amendments.md'
warnings: [oversized, multiple-goals]
---

<intent-contract>

## Intent

**Problem:** The results modal still shows the pre-pool BOONS ACCRUED / LAST OFFER blocks (a name list and a dashed offer strip, built from `net.you`), and nothing on the server keeps any record of what a captain drew or built — the only end-of-match artifact is the `match.end` log line. Eric wants to see what everyone built; a captain wants to see what they ended with; no player may ever see an enemy's draws.

**Approach:** (1) Replace the two blocks with ONE `LOADOUT` block: a DOM twin of the hud-bar's slot row at .72 (gun · Shift · Q E R · belt 1–4, glyph + tier numeral on the absolute ramp, `×n` stock badges) plus one line of the five ship ladders — client-only, no wire change. (2) Give every ship a server-private per-hand log (offered ids, the taken id, REDRAW, world-time stamps), snapshot it with the participant when a ship leaves, and at the results hook build a server-only `MatchRecord` and hand it to an `AccountWriter` PORT (this story ships the `NullWriter`), fire-and-forget. `MatchRecord` is never `ResultsMsg` — pinned. `PROTOCOL_VERSION` stays 63.

## Boundaries & Constraints

**Always:**
- **Eric's rulings of 2026-09-30 (this run, AskUserQuestion; recorded as epic-8 amendments 178–181 in the docs wave):**
  - (R1) **The record captures the FULL per-draw history**: every hand dealt (the offered line ids), the id taken or none, whether the hand was REDRAWn, each with a `T+` stamp — this story absorbs the side story parked at `deferred-work.md` (the 2026-09-22 "what cards were picked in each draw" entry). Rejected: taken-only with stamps; final loadout only.
  - (R2) **An untaken RADAR SWEEP or RELOAD reads `RADAR SWEEP —`** (the name, then a dash in the muted label colour); the ladder line always lists all five. ARMOR / SPEED / TURNING start at Tier I so they always carry a numeral. Rejected: omit the ladder; print `0`.
  - (R3) **Leavers yes, aborts no**: a captain who leaves mid-match has build + hand log snapshotted at leave (as kills are today), so a finished match records everyone who sailed in it; an aborted match (no `match.end`) writes NO record — only today's `match.abort` line. Rejected: record aborts flagged; finishers only.
  - (R4) **A used-up belt stack renders as the bar's own empty square** (the `—` dash) — no new word, no `×0` badge. On the live bar a stack fired to zero leaves `cards`, so the slot is simply empty; the results row reads the same slot ids and shows the same thing. Rejected: the word EMPTY.
- The block is the ratified design: `DESIGN.md` `{components.loadout-block}` + `mockups/countdown-results-1.html` frame 2 (UX-DR55, FR60). Section head `LOADOUT` in the modal's `SECTION_HEAD_CSS` register; row = Gun · Shift · Q E R · belt 1–4 with key chips (`·` ghost under the gun, `Shift`, `Q E R`, `1–4`); squares 39 px (54 × .72) and belt 32 px (44 × .72); glyph is the name (no names rendered); tier numerals on the ABSOLUTE ramp `phosphor / info / storm-readout / denied / amber` (I–V); beneath, one line `ARMOR III · SPEED IV · TURNING II · RADAR SWEEP II · RELOAD III` — 10 px mono uppercase muted labels, numerals 11 px/600 in ramp colours, `·` separators. The block sits where BOONS ACCRUED sat (after the score card, before the game-end table). Modal ≈ 735 px at the floor viewport is accepted (it already scrolls under the viewport cap).
- **The 9 px floor binds the RENDERED size on every DOM register (amendment 43):** the squares scale to .72, the TEXT does not — tier numerals, badges and key chips render at ≥ 9 px at every UI-scale tier (the results modal is not scaled by the UI-scale var today; pin the floor anyway).
- Glyphs come from the one glyph source: `equipmentGlyphSvg(id, size)` (`client/src/render/equipmentIcons.ts`, already used by the DOM refit card). Tier per slot from `slotTier(stats, cards, id)` (`render/equipmentInfo.ts`) — the gun shows `stats.equipment[gun].tier` (amendment 70), Shift has no tier, Q/E/R their line tier; a belt slot shows `×n` from `ammo[slot].n` (`beltBadgeText`). Ladder tier = `cardTierSteps(CATALOG[line], boonStackCount(cards, line)).cur` — a base line (armor/speed/turning) reads I at zero copies; radarSweep/reload at zero copies is R2's dash.
- Slot ids for the row are the client's own replayed loadout (`slotIdsFor(stats, cards, cls, gun)` → `g.ownSlots`), read at the moment the modal opens; `ResultsOwn` carries `gun`, `slots`, `ammo`, `stats` and drops `offer`/`pts`. `net.you` is never cleared on death (the cycle-59 fact), so the elimination modal and the game-end modal read the same data.
- **Record shape (server-only, `server/src/game/matchRecord.ts`):**
  - `HandRecord { dealtAtMs: number; offered: readonly LineId[]; taken: LineId | null; takenAtMs: number | null; redrawn: boolean }` — `*AtMs` are `T+` stamps = `world.now − match.activatedAt`, NEGATIVE for the countdown's level-zero hand and its REDRAW (documented; the modal's `T+` is the same clock).
  - `ParticipantRecord { id; name; role: ShipRole ('captain' | 'bot' — never 'fleet'); userId: null; hullId; gun: GunId; placement: number; kills; pveKills: Record<string, number>; damageDealt; cards: readonly LineId[] (final, fit order, repeats intact); hands: readonly HandRecord[]; bankedLevels: number (unspent at the end) }`.
  - `MatchRecord { matchId; mode; protocolVersion; gameVersion; endedAtEpochMs; activatedAtMs; durationS; endedBy: MatchEndCause; outcome: MatchOutcome; winnerId: string; participants: ParticipantRecord[] }`. No `deck`, no `pool`, no `brought`: neither exists after 8.14. `userId` is `null` for everyone until Epic 9.
  - `buildMatchRecord(world, match, meta)` is PURE over `Match`'s participant snapshots (leavers included) + `match.placements`; it never reads the wire, never mutates.
- **The hand log lives on `ShipRecord.hands` (server-private)** and is written at the three sites that already own the flow: `materializeOffer` pushes a hand when a draw succeeds; `mulligan` marks the open hand `redrawn` before re-materializing; the spend path (`spendCard` → `settleSpend`/`applyCard`) sets `taken`/`takenAtMs` on the open hand. The level-zero devfit cards (`fitOverride`, applied through `applyCard` at spawn) are NOT hands — they show only in `cards`. World stamps RAW `world.now`; `buildMatchRecord` subtracts `match.activatedAt`.
- **`Participant` (match.ts) gains `gun`, `cards`, `hands`, `bankedLevels`**, copied (never aliased) in `snapshotStats` — the existing leave site and the finish site both call it, so leavers ride for free (R3).
- **The writer is a PORT** (`server/src/game/accountWriter.ts`): `interface AccountWriter { recordMatch(record: MatchRecord): Promise<void>; flush(): Promise<void> }`; `NullWriter` resolves immediately and stores nothing; a module registry `getAccountWriter()` / `setAccountWriter()` (the `metrics.ts` seam pattern) with the NullWriter installed by default and `createAccountWriter()` called from `app.config.ts` beside the metrics/liveness boot (Epic 9 branches there); `flush()` is called from the existing graceful-shutdown path if one exists, else documented as Epic 9's to wire. No queue, no retry in this story — AR33's FIFO/retry-once belong to the real writer (Epic 9); recorded.
- **ONE call site**: inside the room's `broadcastResults` hook, immediately after `emitMatchEnd()`, guarded by the SAME latch — the record is built and handed over exactly when `match.end` is emitted (so an abort cascade that reaches `Match.finish()` writes nothing, R3). Fire-and-forget: `void writer.recordMatch(rec).catch(...)` logs `account.write.failed { matchId, err }` (AR51); on hand-over the room logs `match.record { matchId, participants, hands }` — COUNTS ONLY, no names, no ids, no line ids (NFR24). Never awaited on the tick.
- **Pins (tests):** (a) `ResultsMsg` and every row carries none of `deck, deckList, deckId, deckLeft, deckSize, pool, remaining, takes, weights, hands, offered, taken, cards, loadout, record` — on a real `Match.resultsMsg()` from a world with fitted cards and dealt hands; (b) the perception invariant's `DECK_FORBIDDEN_KEYS` gains `hands`, `offered`, `taken`, `record` — no frame ever carries the hand log; (c) `buildMatchRecord`: a captain who took two cards over two levels and REDREW the opening yields hands `[{redrawn: true, taken: null}, {taken: X}, {taken: Y}]` with monotone stamps, the countdown hand's `dealtAtMs < 0`; a leaver is present with placement and hands; a bot is present with `role: 'bot'`; a fleet hull is absent; `userId === null` everywhere; (d) the results hook hands exactly one record per finished match to the installed writer and none on abort; a rejecting writer logs `account.write.failed` and the tick never throws; (e) client: the block renders with the fixtures of the mock (gun IV, Shift, Q III, E II, R I, belt `×1` + three empties), the ladder line reads `RADAR SWEEP —` at zero copies, every text node in the block is ≥ 9 px, `BOONS ACCRUED` / `LAST OFFER` appear nowhere in `client/src`, section order `MATCH LOG < SHIPS YOU SANK < LOADOUT`, the action set is still exactly `['SPECTATE', 'RETURN TO PORT']`.
- The `endedBy: 'lastHumanLeft'` clause of the AC is MOOT: the cause was retired at Story 6.3 (epic-6 amendment 16; `MatchEndCause = 'lastHumanSunk' | 'fieldCleared'`, `classifyEnd` at `match.ts:774`). The two-value enum is persisted as is; the `deferred-work.md` entry (the "effectively unreachable" note, ~`:938`) is closed as already-resolved.
- `PROTOCOL_VERSION` stays 63 (nothing new rides the wire; `OwnShip` already carries `gun`, `ammo`, `cards`). Version 0.18.21 → 0.18.22 (cycle 157). Keep ESLint complexity ≤ 10; `npm run check` green.
- Docs wave (last task): `CHANGELOG.md`, `VERSION`, root `package.json` + lock, both trackers (one-line stamps), epic-8 amendments 178–182 in BOTH homes (`epic-8-context-amendments.md` + the `## Ratified Amendments` section of `epic-8-context.md`, plus the context's Stories/Goal/"Later seams" lines), `deferred-work.md` (close: the BOONS/LAST OFFER owner decision ~`:979`; the per-draw side story ~`:2443` → absorbed by R1; the `lastHumanLeft` note ~`:938`; the two `MatchRecord.pool` entries ~`:1892` / ~`:2293(a)` → MOOT, the pool was retired at 8.14; add: AR33's queue/retry/flush deferred to Epic 9; the 9.x history filter reads `hands`), `DESIGN.md` Loadout Block row + `EXPERIENCE.md` results row get a `BUILT 2026-09-30 (Story 8.21)` stamp — nothing else in the design docs moves.

**Block If:**
- Any surface would need a name, glyph, colour or copy line that is not in the mock or the rulings above (ask Eric, never invent).
- A wire field turns out to be needed for the LOADOUT row (the design says none is).
- The record would have to expose an enemy's draws to any client by any path.

**Never:**
- Put `MatchRecord`, `hands`, or any per-draw data on `ResultsMsg`, any frame, `WelcomeMsg` or the Colyseus schema.
- Render names on the row (the glyph is the name), a `×0` badge, the word EMPTY, or any drawn/taken history in results.
- Build a real store, a queue, a retry, a Postgres/drizzle dependency, an env var or a `render.yaml` change (Epic 9).
- Re-derive a tier ad hoc — every tier and stat comes through `effectiveStats` / `slotTier` / `cardTierSteps`.
- Touch `CLAUDE.md`; touch bot behaviour; touch the draw law (`sim/draw.ts`); change `CONFIG` values.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Elimination modal | own dies with gun tier IV, Q light torpedo III, E machine gun II, R heavy torpedo I, belt HULL REPAIR ×1 | `LOADOUT` head; row of 9 squares: gun glyph + `IV` (denied hue), Shift glyph no numeral, `III`/`II`/`I` numerals, belt `×1` badge then three `—`; ladder line with five entries | No error expected |
| Game-end modal (winner) | own afloat at finish, `net.you` current | Same block from the same builder; placement table follows it | No error expected |
| Depleted belt stack | a consumable fired to zero (gone from `cards`) | that belt square is the empty dash (R4) | No error expected |
| Untaken ladder | zero RADAR SWEEP copies | `RADAR SWEEP —` in muted; the other four keep numerals | No error expected |
| Own identity unresolved | `net.you` null or roster row missing | block omitted, exactly as the identity line is today | No error expected |
| Match finishes | hands dealt, one leaver, one bot, fleet hulls present | one `MatchRecord`: leaver + bot present, fleet absent, `userId: null`, hands with `T+` stamps; `match.record` count-only log; writer called once | writer rejection → `account.write.failed`, tick unaffected |
| Match aborts | tick-error abort or all-leave cascade reaching `finish()` after abort | no record, no `match.record` line | No error expected |
| REDRAW at countdown | opening hand redrawn, new hand dealt, card taken at T+0.05 s | hands `[{redrawn: true, taken: null, dealtAtMs < 0}, {taken: X, takenAtMs ≥ 0}]` | No error expected |
| Open hand at death | level banked, hand dealt, ship sinks | last hand `taken: null, redrawn: false`; `bankedLevels` counts it | No error expected |
| `ResultsMsg` shape | real finish with fitted cards | no forbidden key on the message or any row | pin fails loudly |

</intent-contract>

## Code Map

- `client/src/ui/results.ts` -- DELETE `makeBoons`, `makeOffer`, `offerHeading`, `KIND_ORDER`, `buildOrder` and the block note (`:634–719`); `ResultsOwn` gains `gun`, `slots`, `ammo`, `stats`, drops `offer`/`pts`; `showResults` appends `makeLoadoutBlock(view.own)` where the boons went (`:874–880`); drop the now-unused `boonCopy`/`effectiveStats`/`resolveCards` imports.
- `client/src/ui/loadoutBlock.ts` -- NEW: `makeLoadoutBlock(own: ResultsOwn): HTMLElement` (head + row + ladder line), inline `style.cssText` like the rest of the modal, sizes derived from `CLIENT_CONFIG.hudBar` × `LOADOUT_SCALE = 0.72` with the 9 px text floor; key chips per slot; `equipmentGlyphSvg` glyphs; `slotTier` numerals; `beltBadgeText`-shaped badges; `cardTierSteps` ladder tiers.
- `client/src/ui/tierRamp.ts` -- NEW: `LINEAGE_TIERS` (moved from `upgradeMenu.ts:178–184`, re-exported there for existing importers), `romanTier(n)`; the modal and the refit card share one ramp source.
- `client/src/main.ts` -- `ownResultsIdentity` (`:1725`) builds the new `ResultsOwn` (`gun: you.gun`, `slots: g.ownSlots` or `slotIdsFor(...)`, `ammo: you.ammo`, `stats`); both modal openers (`:1915`, `:1938`) unchanged otherwise.
- `client/src/render/equipmentInfo.ts` / `render/equipmentIcons.ts` / `render/hotbar.ts` -- READ-ONLY sources (`slotTier`, `equipmentGlyphSvg`, `TIER_COLORS`, `beltBadgeText`); export `beltBadgeText` if it is not already.
- `client/src/__tests__/results.test.ts` -- the two build-block cases (`:331–349`) → LOADOUT cases; section-order pin (`:529–551`) reads `LOADOUT`; `offerHeading` case deleted; new 9 px floor + fixture pins; `client/src/__tests__/refitFailOpen.test.ts` `:18, :107–126` -- delete the `makeOffer` cases (the subject is gone; keep the refit-card fail-open pins).
- `server/src/game/world.ts` -- `ShipRecord.hands: HandRecord[]` (init at `addShip` `~:1800`, reset with the per-match resets); push in `materializeOffer` (`:2763`); mark `redrawn` in `mulligan` (`:2726`); set `taken` in the spend path (`spendCard` `:3113` / `settleSpend` `:3148`); devfit `applyCard` (`:2012`) untouched.
- `server/src/game/match.ts` -- `Participant` (`:322`) + `snapshotStats` (`:1092`) carry `gun`, `cards`, `hands`, `bankedLevels`; a read-only accessor for the participant snapshots + `activatedAt` for the builder.
- `server/src/game/matchRecord.ts` -- NEW: the types + `buildMatchRecord(world, match, meta)`.
- `server/src/game/accountWriter.ts` -- NEW: `AccountWriter`, `NullWriter`, `getAccountWriter` / `setAccountWriter` / `createAccountWriter`.
- `server/src/rooms/ArenaRoom.ts` -- the `broadcastResults` hook (`:758`) hands the record over after `emitMatchEnd()` under the same latch; `match.record` + `account.write.failed` logs; `server/src/app.config.ts` (`:63` area) calls `createAccountWriter()`.
- `server/src/__tests__/matchRecord.test.ts` -- NEW (pins c, d); `server/src/__tests__/perception.test.ts` `:2298` `DECK_FORBIDDEN_KEYS` extended; a `ResultsMsg` forbidden-key pin beside `match.test.ts`.
- Docs: `VERSION`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `_bmad-output/gds-workflow-status.yaml`, `_bmad-output/implementation-artifacts/{sprint-status.yaml,epic-8-context.md,epic-8-context-amendments.md,deferred-work.md}`, `DESIGN.md` + `EXPERIENCE.md` (stamps only).

## Tasks & Acceptance

**Execution:**
- [x] `server/src/game/world.ts`, `server/src/game/match.ts`, `server/src/game/matchRecord.ts`, `server/src/game/accountWriter.ts`, `server/src/rooms/ArenaRoom.ts`, `server/src/app.config.ts`, server tests -- the hand log, the participant snapshot, the builder, the port + NullWriter, the one call site, pins (a)–(d) -- the record half (Opus; wire-privacy pins reviewed on Fable).
- [x] `client/src/ui/tierRamp.ts`, `client/src/ui/loadoutBlock.ts`, `client/src/ui/results.ts`, `client/src/main.ts`, client tests -- the LOADOUT block, the block deletions, pins (e) -- the modal half (Opus), in parallel with the server half (disjoint files; `shared/` frozen).
- [ ] Review gate: Blind Hunter + Edge Case Hunter (Fable) + Codex `gpt-5.6-sol` on the diff; triage; fixes routed by weight.
- [ ] Docs wave (Sonnet): version, changelog, trackers, amendments 178–182 in both homes, ledger entries, DESIGN/EXPERIENCE stamps; `npm run check` green; commit, push, ONE PR to `development`.

**Acceptance Criteria:**
- Given own dies or the match ends, when the results modal opens, then one `LOADOUT` block shows the nine slots as they ended (glyph, ramp numeral, `×n` badge, empty dash) and the five-ladder line with R2's dash, and no BOONS ACCRUED / LAST OFFER string exists in the client.
- Given a finished match with a leaver, a bot and fleet hulls, when `match.end` is emitted, then exactly one `MatchRecord` (leaver + bot present, fleet absent, `userId: null`, per-hand `T+` stamps, countdown hand negative) reaches the installed writer, fire-and-forget, with a count-only `match.record` log; an aborted match hands over nothing.
- Given any frame or the results broadcast, when inspected, then no `hands`/`offered`/`taken`/`deck*`/`pool`/`record` key appears; `PROTOCOL_VERSION` is 63 before and after.
- Given `npm run check`, then lint, all type-checks, every test and the hook test pass.

## Spec Change Log

## Review Triage Log

### 2026-09-30 — Review pass 1 (Blind Hunter + Edge Case Hunter on Fable, Codex `gpt-5.6-sol` on the same 2,096-line diff — verdicts: all three build-on-it; agreement: BOTH Fable hunters flagged the leaver-credited-in-the-scuttle-window timing hole, confirmed by the orchestrator in the code and fixed; Codex alone found nothing and traced every seeded invariant clean (privacy of the hand log, snapshot-before-removal, the shared abort/finish latch, writer-failure containment, the safe module cycle); every other finding was single-model and verified by the orchestrator before routing)
- intent_gap: 0
- bad_spec: 0
- patch: 5: (high 0, medium 1, low 4)
- defer: 1: (high 0, medium 0, low 1)
- reject: 5: (high 0, medium 0, low 5)
- addressed_findings:
  - `[medium]` `[patch]` A scuttled leaver's hull stays on the water for its 5 s window and can still be credited a kill there (a torpedo in flight), which banks a level and deals a hand AFTER the leave-time snapshot — the record then depended on whether the match finished during the window (finish re-snapshots) or after it (both hunters). FIX: `reapDeparted` re-snapshots the participant before `removeShip`, so the leaver's record is the hull's last state on every path; pinned by `matchRecord.test.ts` "a leaver CREDITED during its scuttle window keeps that hand" (fails without the fix).
  - `[low]` `[patch]` `match.record` was logged BEFORE `recordMatch` was invoked, so a synchronously throwing writer produced a count line asserting a hand-over that never happened (Blind Hunter). FIX: the log line now follows the call.
  - `[low]` `[patch]` `ui/loadoutBlock.ts` imported `render/hotbar.ts` (Pixi, the settings store) for the one-line pure `beltBadgeText` — the first `ui/ → render/hotbar` edge (Blind Hunter). FIX: the helper moved to `render/equipmentInfo.ts` beside the other pure slot predicates; `hotbar.ts` imports and re-exports it for its own importers.
  - `[low]` `[patch]` The server test's `RESULTS_FORBIDDEN_KEYS` includes `cards`, which the own-ship frame legitimately carries — a future copy into `DECK_FORBIDDEN_KEYS` would break the perception suite (Blind Hunter). FIX: a domain note on the list.
  - `[low]` `[patch]` ERIC RULING AT THE GATE (Edge Case Hunter's finding 2, put to Eric by AskUserQuestion; he chose the NON-recommended option and then wrote *"If the game starts, i want the player's choices tracked."*): a captain dealt the opening hand who leaves DURING THE COUNTDOWN is now recorded too — `Match.countdownLeavers` snapshots them before the hull goes (`keepCountdownLeaver`, kept out of `onPlayerLeave` for the complexity cap), `buildMatchRecord` appends them LAST with `placement: 0` and their (zero) kills; pinned by "a COUNTDOWN leaver is recorded with placement 0 and its opening-hand choice". Recorded as epic-8 amendment 181.
  - Deferred (ledger): `account.write.failed` logs the writer's error text verbatim — harmless with the NullWriter, but an Epic 9 ORM/HTTP error may embed the payload (names) and breach the telemetry PII rule; the real writer must scrub.
  - Rejected: the block cannot wrap on a narrow viewport (desktop-only; the panel already scrolls under the viewport cap); the 9 px floor pin reads declaration text, not a computed size (no scaling rule exists in the block — a truthful, if weak, pin); `Participant.cards` is cast from `string[]` (ids are gated upstream by `applyCard`); the HULL REPAIR plus glyph also changes the LIVE bar's belt square (it is the ratified mock's art and the one glyph source — recorded for Eric's eye on staging, amendment 183); the spec's `buildMatchRecord(world, match, meta)` signature vs the built `(match, meta)` (inside the read-only intent contract; recorded as a measured correction in amendment 183, not re-derived).

## Design Notes

- **Why a DOM twin and not the Pixi bar:** the modal is DOM chrome (CLAUDE.md: Canvas is Pixi, DOM only for chrome); the mock itself is the DOM twin at .72. The glyph source, the tier source and the ramp are the bar's own modules, so nothing is re-derived — only the boxes are drawn twice.
- **Why text does not scale with the squares:** amendment 43 — the 9 px floor is a floor on the rendered size on every DOM surface; 9 × .72 = 6.5 px would breach it.
- **Why the hand log stores raw `world.now`:** `World` does not know the match's activation; `Match` does. Stamping raw time at the three flow sites and converting once in the pure builder keeps the sim free of match bookkeeping and makes the countdown's negative `T+` fall out naturally.
- **Why the record shares the `match.end` latch:** R3 says aborts write nothing; `emitMatchEnd` already encodes "finished, not aborted, exactly once". A second latch would be a second truth.
- **Why no queue/retry now:** AR33's FIFO + retry-once + flush belong with a writer that can fail; the NullWriter cannot. Recorded in the ledger so Epic 9 builds them with the store.

## Verification

**Commands:**
- `npm run build -w shared && npm test -w shared` -- expected: green (shared untouched; the build feeds server/client type-checks)
- `npm test -w server` -- expected: green, incl. the new `matchRecord.test.ts`
- `npm test -w client` -- expected: green, incl. the re-cut `results.test.ts`
- `npm run lint` -- expected: zero errors (complexity ≤ 10)
- `npm run check` -- expected: exit 0
- `grep -rn "BOONS ACCRUED\|LAST OFFER\|offerHeading\|makeOffer\|makeBoons" client/src` -- expected: no matches
