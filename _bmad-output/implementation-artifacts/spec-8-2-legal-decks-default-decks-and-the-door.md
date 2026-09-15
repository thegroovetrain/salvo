---
title: 'Story 8.2: Legal Decks, Default Decks, and the Door'
type: 'feature'
created: '2026-09-15'
status: 'done'
baseline_revision: '5ca9b58c'
final_revision: '95da350'
review_loop_iteration: 0
followup_review_recommended: true
context:
  [
    '{project-root}/_bmad-output/project-context.md',
    '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md',
    '{project-root}/_bmad-output/implementation-artifacts/epic-8-context-amendments.md',
    '{project-root}/_bmad-output/implementation-artifacts/spec-8-1-the-card-model-and-catalog-engine.md',
  ]
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** After 8.1 every hull sails an interim "every buildable line at cap" deck built server-side with no notion of a legal deck, a default deck, or a door check; the queue's seat reservation carries only name/class/horn/colour, the option sanitizer silently drops unknown keys, and nothing stops a future client from supplying deck contents.

**Approach:** Add ONE pure `checkDeck()` (`shared/src/sim/deckRules.ts`) with exactly the two composition rules and two ownership bounds; author the three DEFAULT decks at Eric's delivered counts in `catalog.ts`; add ONE shared `loadDeckFor(userId, deckId, hull)` (server, zero Colyseus imports) called at BOTH doors that, with no account module, always resolves the hull's default deck; freeze the 40 line ids in the seat reservation (queue) or at the arena's `onJoin` (Solo vs AI / dev direct); make the sanitizer REFUSE a client `deck` key, accept `deckId`, and honour `deckOverride` only under `HC_DEV_OPTIONS=1`; build the server-private `DeckState` from the frozen list at spawn. Default decks are THE deck from this story on; stub lines stay in the frozen 40 but are never dealt (Eric 2026-09-15). Drones stay gun-only; `FLEET_FIT` is struck from the epic (Eric 2026-09-15).

## Boundaries & Constraints

**Always:**

- **Eric rulings 2026-09-15 (record as epic-8 amendments 10–12 in the same PR, re-apply to `epic-8-context.md`, all under "Story 8.2"):**
  - **(10) DEFAULT DECK COUNTS (delivered as a spreadsheet screenshot; supersede FR56's and catalog-v3 §1's counts; line composition per FR56 except the Battleship no longer carries HEAT SEEKING).** Every hull: `armor 3, speed 3, turning 3, radarSweep 3, reload 3, hullRepair 3, shieldBlock 3, smokeScreen 2, chaff 2, deckGun 2, deckGunTurret 1, deckGunBarrel 2` (30 universal cards). **Torpedo Boat** + `lightTorpedo 3, heavyTorpedo 3, machineGun 3, acousticHoming 1`. **Mine Layer** + `navalMines 3, captiveMines 3, flak 3, foulingMines 1`. **Battleship** + `missile 3, monitor 3, starShells 3, dazzleShells 1`. Each sums to 40 with exactly three equipment lines. Unhomed: `supercavTorpedo, broadside, decoyBuoy, heatSeeking, phosphorShells`.
  - **(11) INTERIM: default decks are the frozen deck NOW; stubs undrawable.** The hull's default deck is the 40-card deck from 8.2 on; stub lines (amendment 5) stay in the frozen list but never reach `DeckState`/an offer, so ~23 cards are drawable per hull until 8.7–8.15 flip the stubs (no code change then). Rejected: keeping 8.1's interim all-lines deck.
  - **(12) DRONES STAY GUN-ONLY — `FLEET_FIT` is STRUCK.** Eric: *"I don't know what that FLEET_FIT thing is, that should not have been added to the epic. It was never even discussed with me."* Epic-5 amendment 34 stands (*"each has a gun to defend itself"*). Correction of record against epics.md Story 8.2 AC, Story 8.5 AC, FR45, AR38/AR52's `FLEET_FIT` clauses: nothing is built; drones get no deck, no cards.
- `checkDeck(cards, owned, catalog = CATALOG)` returns `{ ok: true } | { ok: false, rule }` with `rule ∈ 'size' | 'equipmentLines' | 'unowned' | 'overCap'` checked in that order and NOTHING else (no heal requirement, no ladder requirement, no hull lock). `size` = `cards.length !== CONFIG.deck.size`; `equipmentLines` = distinct lines of `kind === 'equipment'` (copy 1 is a `slotFill`) `> CONFIG.deck.maxEquipmentLines`; `unowned` = any id not in `owned` (an unknown id is unowned); `overCap` = copies of a line `> line.cap`. Pure, deterministic, no logging.
- `catalog.ts` gains `DEFAULT_DECKS: Readonly<Record<ShipClassId, readonly LineId[]>>` — each authored as COUNTS through a `deck({...})` helper that expands to ids in `LINE_IDS` order and is validated at module load (`checkDeck` passes against `DEFAULT_OWNED`) — and `DEFAULT_OWNED: ReadonlySet<LineId>` = the union of the three defaults' line ids (a fresh account's unlocks). Both deep-frozen. Pins: 40 / 40 / 40, three equipment lines each, the exact counts of amendment 10 as a table test, the unhomed five absent from all three.
- The pacifist posture (AR50): a `PACIFIST_DECK` of 40 cards and ZERO equipment lines drawn from `DEFAULT_OWNED` (ladders + deck-gun family + consumables at cap, trimmed to 40 in `LINE_IDS` order) lives in `server/scripts/batchsim/controls.ts`, is pinned legal, and the pacifist control sails it.
- `loadDeckFor(userId: string | null, deckId: string | undefined, hull: ShipClassId): readonly LineId[]` lives in `server/src/game/decks.ts` (zero Colyseus imports); with no account module it returns `DEFAULT_DECKS[hull]` and IGNORES `deckId` (documented as the Epic 9 port). The DOOR (not `loadDeckFor`) then runs `checkDeck(cards, DEFAULT_OWNED)` and refuses on failure — a default deck always passes (pinned), so today only a dev `deckOverride` can be refused.
- Door transport (orchestrator ruling): the queue writes the frozen list into the reservation's SERVER-ONLY `auth` payload (`reserveMultipleSeatsFor(..., { sessionId, options, auth: { ...p.client.auth, deck } })`), never into `options`; `ArenaRoom.onJoin` reads `client.auth?.deck`, and when it is absent (Solo vs AI, dev direct join) runs `loadDeckFor` + `checkDeck` itself. A client can therefore never supply a deck: `options` never carries one. The implementer MUST verify that `auth` propagates through `reserveMultipleSeatsFor` → `client.auth` in Colyseus 0.18 (a unit test over the real reservation path or the queue smoke); if it does not, HALT and report — do not fall back to `options`.
- Sanitizer: `roomOptions.ts` gains `sanitizeDeckOptions(options, devEnabled): { deckId?: string; deckOverride?: readonly string[]; clientDeck: boolean; rejectedKeys: string[] }` used by BOTH `onJoin`s. `deck` key present (any value) → `clientDeck: true` → the door REFUSES with reason `deck.illegal { rule: 'clientSupplied' }`. `deckId` → string trimmed, ≤ 64 code points, else dropped. `deckOverride` → array of strings (each a known `LineId`, else the whole override is dropped) honoured ONLY when `devEnabled`; otherwise pushed to `rejectedKeys` and logged (`deck.devOptionsRejected { rejected }`, the `room.devOptionsRejected` precedent). An honoured override REPLACES `loadDeckFor`'s list and STILL goes through `checkDeck` (this is how the refusal tests reach the door end to end). `StandardQueueRoom.sanitizeArenaOptions` forwards `deckId` (nothing else new).
- Refusal: `log.warn('deck.illegal', { rule, sessionId })` then `throw new ServerError(DECK_REFUSED_CODE, 'deck illegal: <rule>')` from `onJoin` in both rooms, where `DECK_REFUSED_CODE` is an app-level code that is NOT the auth/version-gate code (the client maps that code to "VERSION MISMATCH"). Verify in Colyseus 0.18 that a throw in `onJoin` rejects that client cleanly (queue pool untouched, room not disposed). Client: NO new copy (UX-DR71's surface is Epic 9's); one client unit pin that a deck refusal renders through the generic branch, never the version-mismatch branch.
- World: `addShip(..., deck: readonly LineId[] = [])` stores the frozen list on `ShipRecord.deckList`; `DeckState` is built by `buildDeckState(deckList, carried, catalog)` in `shared/src/sim/deck.ts` (REPLACES the interim `buildDeck`): the frozen list minus every stub line minus one copy per carried line (8.1's spawn seed — a hull spawns holding copy 1 of each weapon it already carries: TB `heavyTorpedo`, BS `broadside` + `starShells`, ML `navalMines`); `redeployShip` rebuilds from `deckList`, never from the catalog. Fleet hulls keep `EMPTY_DECK` and `deckList = []`. Bots go through the same `loadDeckFor(null, undefined, hull)` at their spawn site in `ArenaRoom`. Pins: drawable deck sizes TB 23 / ML 23 / BS 23; no stub id in any `DeckState` or offer; the "every non-stub line in a default deck folds (no dead cards)" pin re-pointed at the defaults.
- Anti-cheat: `DeckState`, `deckList`, `deckId` and `DEFAULT_OWNED` never appear on the wire — a structural pin in `perception.test.ts` (`JSON.stringify` of every frame + the welcome contains no key named `deck`, `deckList` or `deckId`); `you.cards` is unchanged; golden frames unchanged. The client does NOT send `deckId` in 8.2 (a field with no consumer may not ride — Story 4.9 rule); the server accepts it.
- No `PROTOCOL_VERSION` bump: no frame, schema, welcome or catalog-line change (pin: `PROTOCOL_VERSION === 51`; the PV log block is left untouched). If the implementer finds a genuine wire change, HALT and report.
- Batch-sim: `deckSim.ts` / `runner.ts` sail `DEFAULT_DECKS[hull]` through `buildDeckState`; pity/rarity remain gone. Deck-size-dependent harness pins updated knowingly.
- Version 0.18.1 → **0.18.2** (cycle 137: `VERSION` + root `package.json`), one-line stamps in BOTH trackers (`_bmad-output/gds-workflow-status.yaml`, `_bmad-output/implementation-artifacts/sprint-status.yaml`), `CHANGELOG.md` entry, `deferred-work.md`: stamp `:1981` (extra-slot no-op) as PARTIALLY discharged (≤ 3 equipment lines now enforced at the door; the no-op itself waits for 8.5) and add one entry for 8.3 (40-card exhaustion re-derivation; `:982`'s "59 fits vs 25 levels" no longer holds). `npm run check` green.
- Process: worktree only; no dev server in Eric's checkout; kill what you boot; halt on any error; tests are UPDATED never deleted.

**Block If:**

- `auth` does not propagate through the 0.18 seat reservation (see Door transport) — do not move the deck into `options`.
- Any change would put deck contents, a deck id or an owned set on the wire.
- A count in amendment 10 cannot be honoured without changing a catalog cap (it cannot: every count ≤ cap — verify in the pin).

**Never:**

- Build the draw redesign (8.3), slots (8.5), consumable stock (8.7), the pre-queue client gate / Ship & Deck screen / `SAIL DEFAULT DECK` copy (Epic 9), an account store, or `FLEET_FIT`.
- Change any catalog line, tier, cap or stub flag; change drone loadouts; touch the `Tab` offer shape, the six perception exceptions, the passive XP tick, or `CLAUDE.md`.
- Add in-game copy; add a per-ship spatial field to the Colyseus schema; silently substitute a deck on refusal.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Default deck legal | `checkDeck(DEFAULT_DECKS[hull], DEFAULT_OWNED)` for each hull | `{ ok: true }`; 40 cards; 3 equipment lines | n/a (pinned at module load) |
| 41 cards | default + one `armor` | `{ ok: false, rule: 'size' }` | Door refuses `deck.illegal { rule: 'size' }` |
| Four equipment lines | TB default with `broadside` swapped for a ladder copy, `broadside` owned | `{ ok: false, rule: 'equipmentLines' }` | Door refuses |
| Unowned line | default with one `phosphorShells` (count kept at 40) | `{ ok: false, rule: 'unowned' }` | Door refuses |
| Over cap | 40 cards with `acousticHoming ×2` | `{ ok: false, rule: 'overCap' }` | Door refuses |
| Pacifist deck | `PACIFIST_DECK` (40, zero equipment) | `{ ok: true }` | n/a |
| Zero-heal deck | 40 owned cards with no `hullRepair` | `{ ok: true }` | n/a |
| Client `deck` key | join options `{ deck: [...] }` at queue or arena | Refused `deck.illegal { rule: 'clientSupplied' }`; not queued / not seated | `ServerError(DECK_REFUSED_CODE)` |
| Dev override, legal | `HC_DEV_OPTIONS=1`, `deckOverride` = 40 owned ids | Frozen list = the override; default NOT used | n/a |
| Dev override, illegal | `HC_DEV_OPTIONS=1`, `deckOverride` of 41 | Refused with `rule: 'size'`; never substituted | `ServerError` |
| Override in production | `HC_DEV_OPTIONS` unset, `deckOverride` present | Dropped, `rejectedKeys` + `deck.devOptionsRejected` log; default deck used | Silent drop (matchOverride precedent) |
| Queue → arena | captain queued, match formed | Reservation `auth.deck` = 40 ids; arena `onJoin` uses it without re-loading; `deckList` on the record | n/a |
| Solo vs AI | `client.create('arena', { solo: true })` | Arena `onJoin` loads + checks itself; same frozen list | n/a |
| Spawn deck | TB / ML / BS default, carried seed | `DeckState` sizes 23 / 23 / 23; no stub id; `cards` seed unchanged | Pin |
| Redeploy | sandbox `redeployShip` | `DeckState` rebuilt from `deckList`, same size | n/a |
| Wire | any frame / welcome | no `deck`, `deckList`, `deckId` key anywhere | Pin |
| Client renders refusal | server throws `DECK_REFUSED_CODE` | generic connection-failed status, never "VERSION MISMATCH" | Pin |

</intent-contract>

## Code Map

- `shared/src/sim/deckRules.ts` -- NEW: `checkDeck`, `DeckRule`, `DeckCheck`, `equipmentLineCount`
- `shared/src/sim/catalog.ts` -- `DEFAULT_DECKS`, `DEFAULT_OWNED`, `deck()` count-expansion helper, module-load validation
- `shared/src/sim/deck.ts:68` -- `buildDeck` → `buildDeckState(deckList, carried, catalog)`; `drawOffer`/`consumeCard` untouched
- `shared/src/index.ts` -- barrel exports (`deckRules.js`, new catalog symbols); PV 51 untouched
- `shared/src/constants.ts:1580-1601` -- `CONFIG.deck` doc block: 8.2 has landed (no value change)
- `server/src/game/decks.ts` -- NEW: `loadDeckFor`, `DECK_REFUSED_CODE`, `DeckRefusal` (the Epic 9 port)
- `server/src/rooms/roomOptions.ts:19,123,174` -- `deckId`/`deckOverride` on `JoinOptions`; `sanitizeDeckOptions`
- `server/src/rooms/StandardQueueRoom.ts:100-107,174,346-349` -- forward `deckId`; load + check at `onJoin`; deck into reservation `auth`
- `server/src/rooms/ArenaRoom.ts:933-955` -- `client.auth?.deck` else load + check; refusal; pass `deck` to `addShip`; bot spawn site passes `loadDeckFor(null, undefined, hull)`
- `server/src/game/world.ts:176,384,1251-1289,1611` -- `ShipRecord.deckList`; `addShip(..., deck)`; `buildDeckState`; `redeployShip` from `deckList`
- `server/scripts/batchsim/{deckSim,runner,controls}.ts` -- defaults through `buildDeckState`; `PACIFIST_DECK`
- `client/src/net/connection.ts:654-660` -- no code change unless the refusal code needs the generic branch; test pin only
- Tests: `shared/src/__tests__/{deckRules (new),catalog,deck,barrel}.test.ts`; `server/src/__tests__/{roomOptions,queue,solo,upgrades,perception,frames,goldenFrames,decks (new)}.test.ts`; `server/scripts/batchsim/__tests__/batchSim.test.ts`; `client/src/__tests__/connection*.test.ts` (refusal-status pin)
- `VERSION`, `package.json`, `CHANGELOG.md`, `_bmad-output/gds-workflow-status.yaml`, `_bmad-output/implementation-artifacts/{sprint-status.yaml,deferred-work.md,epic-8-context.md,epic-8-context-amendments.md}`

## Tasks & Acceptance

**Execution:**
- [x] `epic-8-context-amendments.md` + `epic-8-context.md` -- record rulings 10–12 (counts, interim defaults, FLEET_FIT struck) -- durable home first
- [x] `shared/src/sim/deckRules.ts` + `catalog.ts` + `deck.ts` + `index.ts` + shared tests -- `checkDeck`, `DEFAULT_DECKS`/`DEFAULT_OWNED`, `buildDeckState`, barrel; pins for counts/legality/sizes/stubs -- `npm test -w shared` green
- [x] `server/src/game/decks.ts` + `rooms/roomOptions.ts` + `rooms/StandardQueueRoom.ts` + `rooms/ArenaRoom.ts` + `game/world.ts` + server tests -- `loadDeckFor`, sanitizer, both doors, reservation `auth`, refusal, `deckList`, redeploy; door tests via the `new ArenaRoom()` idiom; wire pin -- `npm test -w server` green
- [x] `server/scripts/batchsim/*` -- defaults + `PACIFIST_DECK` -- harness tests green
- [x] `client/src/__tests__` -- refusal renders generic, never version-mismatch -- `npm test -w client` green
- [x] `VERSION`/`package.json`/`CHANGELOG.md`/both trackers/`deferred-work.md` -- cycle 137, 0.18.2, PV 51 unchanged, amendments 10–12 -- tracker discipline
- [x] `npm run check` green; headless `queueSmoke`, `soloSmoke`, `matchSmoke` over real sockets on a scratch port -- the gate

**Acceptance Criteria:**
- Given the catalog, when the module loads, then `DEFAULT_DECKS` has three decks of exactly 40 ids at amendment 10's counts, each passing `checkDeck` against `DEFAULT_OWNED`, and the unhomed five appear in none.
- Given `checkDeck`, when fed a 41-card deck, a four-equipment-line deck, an unowned line and an over-cap line, then each returns `ok: false` with the stable rule, and a pure-gunboat, zero-heal and pacifist deck each return `ok: true`.
- Given a captain at either door with no account module, when they join, then the hull's default deck is the frozen list, `deckList` on the ship record has 40 ids, and `DeckState` holds 23 drawable non-stub cards.
- Given a client `deck` key or an illegal dev `deckOverride`, when it hits either door, then the join is refused with `deck.illegal { rule }`, logged once, never substituted; a `deckOverride` without `HC_DEV_OPTIONS=1` is dropped and logged.
- Given any frame or welcome, when serialized, then no `deck`, `deckList` or `deckId` key is present; `PROTOCOL_VERSION` stays 51.
- Given `npm run check`, then lint, tsc ×3 and every test pass.

## Spec Change Log

## Review Triage Log

### 2026-09-15 — Review pass (Blind Hunter + Edge Case Hunter at session model, plus Codex `gpt-5.6-sol` cross-model review — verdicts: Codex fix-first, Blind Hunter build-on-it; findings applied in this pass)
- intent_gap: 0
- bad_spec: 0
- patch: 10: (high 0, medium 2, low 8)
- defer: 2: (high 0, medium 1, low 1)
- reject: 3: (high 0, medium 0, low 3)
- addressed_findings:
  - `[medium]` `[patch]` (Blind Hunter) `encounterSpan.ts` spawned 20 bots with no deck resolver → an EMPTY pool while production bots sail the default → resolver passed; STRUCTURAL: `addShip`'s `deck` and `addBot`'s `deckFor` are now REQUIRED (203 + 35 call sites), so an unlisted spawn site is a tsc error; this exposed a latent harness control without a `deck` (fixed)
  - `[medium]` `[patch]` (Blind Hunter) the reservation-`auth` transport had no failing test (seat and door both resolve to the same default) → unit test queues 20 captains with a dev override that DIFFERS from the hull default and asserts the arena stores that list from `client.auth`; `queueSmoke.mjs` now captures server stdout and asserts 20 × `deckSource:"seat"`, no `deck.illegal` (a discriminating run with the deck removed from `seatAuth` fails 0/20)
  - `[low]` `[patch]` (Codex CONFIRMED; Blind Hunter "harmless") `Object.freeze(new Set())` leaves `DEFAULT_OWNED` mutable → `add`/`delete`/`clear` sealed to throw, pinned
  - `[low]` `[patch]` (all three reviewers) `joinCounter` incremented before the deck refusal could throw → moved after `resolveJoinDeck`; pinned (next nameless captain is still `CAPTAIN-1`)
  - `[low]` `[patch]` (Codex + Edge Case Hunter) the queue forwarded the RAW `deckId` into the reservation options → sanitized value forwarded; 1e5-char / control-character ids pinned
  - `[low]` `[patch]` (Blind Hunter) a dev override with one unknown id silently sailed the default (a silent substitution on the dev path; `unowned` unreachable) → the sanitizer bounds shape only (≤ 256 × 64) and `checkDeck` judges, so an unknown id is refused `unowned` end to end; malformed shape drops AND logs
  - `[low]` `[patch]` (Edge Case Hunter, verified real) `deckFromCounts` checked unknown keys against an injected catalog while expanding over `LINE_IDS` → silent drop; now checks `LINE_ID_SET`, pinned
  - `[low]` `[patch]` (Edge Case Hunter) batch-sim `--set deck.*` accepted but inert (decks are baked at import) → refused with a naming error on every surface; supersedes `spec-balance-sim-harness-prep.md`'s "TUNABLE_FAMILIES byte-identical" line
  - `[low]` `[patch]` (Blind Hunter) `seatAuth` comment and the queue test mock said `client.auth` is `true`; core 0.18.13 maps a `true` verdict to `undefined` → corrected
  - `[low]` `[patch]` (orchestrator, found verifying the patch report) `deckSim.ts` `carriedLinesFor` (new in 8.2) passed a class id where `effectiveStats` wants a hull envelope — a tsc error in the batch-sim tsconfig, which `npm run check` does not type-check → `hullEnvelope(cls)`
- deferred (ledgered in `deferred-work.md`): the arena's seat re-check is hard-wired to `DEFAULT_OWNED` (Epic 9 trap: an account deck with an unhomed line passes the queue and is refused by the arena); the batch-sim tsconfig's standing pre-existing tsc error (`encounterSpan.ts:98`) and its absence from the gate
- rejected: `Object.hasOwn` on a non-object options body (pre-existing, core tears the client down first); pool-depth-vs-match-length watch item (Eric's amendment 11, already ledgered for 8.3); the `equipmentLines`-before-`unowned` ordering note (documented contract)
- noted deviation from the intent contract, accepted as a consequence of amendment 11: two golden-frame `you.offer` rows re-baselined (the drawn offer is a function of the deck); nothing spatial or key-shaped moved. Also: the welcome carries `config.deck` (the two public dials, shipped since 8.1) — the wire pin exempts exactly that block and scans everything else
- traced clean by the reviewers: no client-writable path to `client.auth` (static `onAuth` returns only `true`/throws; reconnect re-reserves with the previous auth), `redeployShip` from `deckList`, a throw in the queue's `onJoin` leaves pool/deadline/listing untouched, every production spawn site passes a real deck, PV 51 unchanged

## Auto Run Result

**Status:** done (2026-09-15, build cycle **137**, version **0.18.2**, PV 51 unchanged).

**Summary:** A captain now sails a legal 40-card deck the server checked once at the door. `shared/src/sim/deckRules.ts` is the ONE pure `checkDeck()` with exactly four rules in contract order (`size`, `equipmentLines`, `unowned`, `overCap`) and nothing else; the three DEFAULT decks live in `catalog.ts` at Eric's re-cut counts (amendment 10: 30 universal cards per hull incl. 3 HULL REPAIR, 3 SHIELD BLOCK, 2 SMOKE, 2 CHAFF, 2 DECK GUN; three equipment lines ×3 + one add-on per hull; the Battleship loses HEAT SEEKING), authored from counts and validated at module load against `DEFAULT_OWNED` (a sealed, genuinely immutable set). `server/src/game/decks.ts` `loadDeckFor(userId, deckId, hull)` (zero Colyseus imports) is the Epic 9 port and today always returns the hull's default; `server/src/rooms/deckDoor.ts` `admitDeck` is the one sequence both doors run (sanitize → refuse a client `deck` key → honoured dev override or the loader → `checkDeck` → refuse `deck.illegal { rule }` with `ServerError(4402)`, never substitute). The queue admits BEFORE pooling and writes the frozen list into the reservation's server-only `auth` payload; the arena reads `client.auth.deck` (re-checked) or, for Solo vs AI / dev direct joins, admits itself. `World.addShip`/`addBot` REQUIRE a deck; `ShipRecord.deckList` is the frozen 40 and `buildDeckState(deckList, carried)` builds the server-private pool (stub lines never dealt, one copy of each carried weapon seeded out → 23 drawable per hull, amendment 11); redeploy rebuilds from `deckList`. Drones stay gun-only; `FLEET_FIT` was struck from the epic at Eric's word (amendment 12). Nothing deck-shaped rides the wire (structural pin over every frame and the welcome); the client sends no `deckId` and shows no new copy — a refusal renders through the generic connection-failed branch (pinned), never as a version mismatch.

**Files changed:** shared — `sim/deckRules.ts` (new), `sim/catalog.ts` (`deckFromCounts`, `DEFAULT_DECKS`, `DEFAULT_OWNED`), `sim/deck.ts` (`buildDeckState`), `index.ts`, `constants.ts` (doc only), tests (`deckRules` new, `catalog`, `deck`, `barrel`); server — `game/decks.ts` (new), `rooms/deckDoor.ts` (new), `rooms/roomOptions.ts` (`sanitizeDeckOptions`), `rooms/StandardQueueRoom.ts`, `rooms/ArenaRoom.ts`, `game/world.ts` (`deckList`, required deck args, `DeckResolver`), `scripts/batchsim/{controls,runner,deckSim,catalogReport,overrides,args,encounterSpan}.ts`, `scripts/rl/env.ts`, `scripts/queueSmoke.mjs` (deck-transport step), tests (`decks` new, `roomOptions`, `perception`, `upgrades`, `batchSim`, fixtures in ~50 files, golden snapshot 2 offer rows); client — `__tests__/connection.test.ts` (pin only); docs — `VERSION`/`package.json`/lock (0.18.2), `CHANGELOG.md`, both trackers, `deferred-work.md` (`:1979` stamped partially discharged; 3 new entries), `epic-8-context.md`, `epic-8-context-amendments.md` (10–12).

**Review findings breakdown:** Blind Hunter + Edge Case Hunter (session model) + Codex `gpt-5.6-sol`. 10 patches applied with fail-first regression tests (2 medium, 8 low), 2 deferred (ledgered), 3 rejected, 0 intent gaps, 0 bad-spec loopbacks. Agreement: all three flagged the burned join ordinal; Codex + Edge flagged the raw `deckId`; Codex alone the mutable Set (fixed anyway: it is a legality authority); Blind Hunter alone the deck-less harness bots and the unguarded transport invariant (both real). Follow-up review recommended: the patch pass made `addShip`/`addBot` signatures required across 238 call sites and changed the dev-override semantics.

**Verification performed:** `npm run check` exit 0 on the final tree — lint 0 errors (3 pre-existing max-lines warnings), tsc clean ×3, **828 / 1810 / 3262** tests, `check:hooks` 266 green; batch-sim tsconfig now type-checks except one pre-existing error (ledgered); headless `queueSmoke` (with the new deck-transport assertion, 20/20 seat-sourced), `soloSmoke`, `matchSmoke` (passed on the third run — the ledgered pre-existing ready-room torpedo-lane flake, not deck-related) over real sockets on self-booted servers; a throwaway real-socket proof showed 20/20 arena joins `deckSource:"seat"`, 0 `deck.illegal`; no stray listeners.

**Residual risks / Eric's veto list:** (1) the transport-by-`auth` ruling and the 4402 refusal code are orchestrator rulings; (2) `DECK_ID_MAX = 64` and the dev-override bounds (256 × 64) are agent numbers on a dev/Epic-9-only surface; (3) with 23 drawable cards a long match can empty the pool — behaviour is fail-safe and 8.3 owns the re-derivation; (4) the harness `PACIFIST_DECK` trims into `smokeScreen ×1` and drops `chaff` by `LINE_IDS` order (pinned, harness only); (5) the golden `you.offer` rows moved with the new pool; (6) the in-browser match on staging is Eric's post-merge step.

## Design Notes

- **Why `auth`, not `options`, for the frozen deck:** the arena cannot tell a reservation's options from a direct join's; the reservation's `auth` value is written only by server code (the queue) and surfaces as `client.auth`, so "a client never supplies a deck" holds structurally rather than by a sanitizer's whitelist.
- **Why the door checks and `loadDeckFor` does not:** Epic 9 plugs a store into `loadDeckFor`; refusal semantics stay at the door so the reason codes (`account.unavailable`, `deck.missing` later) live in one place.
- **Drawable-size arithmetic (pin as a table):** each default holds 16 stub cards (`hullRepair 3 + shieldBlock 3 + smokeScreen 2 + chaff 2` + two stub weapon lines × 3) and the carried seed removes one copy (`heavyTorpedo` TB, `navalMines` ML, `starShells` BS — BS's carried `broadside` is not in its deck, so nothing is removed for it) → 40 − 16 − 1 = 23.
- `deck()` helper example: `deck({ armor: 3, speed: 3, ..., lightTorpedo: 3, acousticHoming: 1 })` → a frozen 40-id array in `LINE_IDS` order; a count over cap or a sum ≠ 40 throws at module load.

## Verification

**Commands:**
- `npm run build -w shared && npm test -w shared` -- expected: green; new `deckRules.test.ts`; catalog/deck pins reflect defaults
- `npm test -w server && npm test -w client` -- expected: green
- `npm run check` -- expected: exit 0
- `grep -rn "buildDeck(" shared/src server/src` -- expected: no matches (only `buildDeckState`)
- `grep -rn "FLEET_FIT" shared/src server/src client/src` -- expected: no matches
- `HC_DEV_OPTIONS=1 PORT=<free> node server/scripts/queueSmoke.mjs` (+ `soloSmoke`, `matchSmoke`) -- expected: pass over real sockets
