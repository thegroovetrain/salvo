---
title: 'Torpedo tubes by kind (light 3 / heavy 2 / supercav 1; SECOND TUBE card deleted); captive mine trip ring 250'
type: 'feature'
created: '2026-11-25'
status: 'done'
baseline_commit: '21e27305a0022001b55b8b96f1ff68ecd32b5940'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Every torpedo launcher holds one tube, and a one-off SECOND LAUNCHER TUBE card adds one more on every launcher. Eric wants each torpedo kind to come with its own full tube count and damage, with no card that buys extra tubes.

**Approach:** Eric 2026-11-25 (after the tubes-by-kind batch sims, `batch-sim-evidence-2026-11-25.md`), verbatim: *"Light Torpedoes 100 damage each, 3 tubes per launcher, max of two launchers. Heavy 150 each, 2 tubes per launcher, max of two launchers. Supercavitating Torpedoes 300 each, 1 tube per launcher, max of two launchers. All come with max tubes per launcher by default, so no more extra tube card, while the aft launcher upgrade card stays and works the same way (immediate second launcher with 3, 2, or 1 tube depending on which torpedo it is)."* Then: *"Okay, lets make the change."*

## Boundaries & Constraints

**Always:** Tier I damage is light 100, heavy 150, supercav 300. Tubes per launcher are a CONFIG value on each torpedo row: light 3, heavy 2, supercav 1. One fore launcher by default, plus the aft launcher via AFT TORPEDO LAUNCHER, which is unchanged. A ship's pool is launchers × the held kind's tubes. `secondLauncherTube` is DELETED from `LINE_IDS` / `CATALOG` (its seat closes, the Story 11.2 `range` precedent), along with its icon, card name and How-to-Play entry. `PROTOCOL_VERSION` is bumped. Version, cycle and amendment numbers are taken at PR time after `git fetch`.

**Ask First:** if a 3-tube launcher renders visibly wrong on any hull (tubes overrun the mount or the deck).

**THE DROP WAIT WAS WITHDRAWN** (Eric 2026-11-26, verbatim: *"Take out the 3s wait on mines. I changed my mind."*) — the wait sentence below and its three matrix rows are history; only the captive ring and the HUD rulings stand. **Added by Eric mid-implementation (2026-11-25, renegotiated), verbatim:** *"add a 3s cooldown before any single mine rack is able to drop another mine. so i can't just make a huge death stack. And give the Captive Mine a 250u base range."* His answers in chat: during the wait the mine box shows its existing not-ready look ("Show it as not ready"), and INSTANT RELOAD clears the wait ("Clears the wait"). The wait is per rack, so a stocked second rack can drop at once; it is a fixed CONFIG value on the shared mine chassis (`CONFIG.mine`), applied to all three mine kinds. "Base range" is the captive mine's Tier I trip ring, `triggerRadius` 180 → 250 (×1.1 per tier, unchanged). **HUD torpedo row** (Eric picked from rendered options, 2026-11-25: "B: slots match torpedo"): each launcher group draws exactly the held kind's tubes, packed left (light 3 + 3, heavy 2 + 2, supercav 1 + 1); the row box never changes size. With no torpedo fitted, hovering a torpedo card re-lays the empty row as the hovered kind (Eric at review, 2026-11-26: "Re-lay as hovered kind").

**Never:** change reloads, speeds, homing, runs, arcs, tiers, other mine values or the aft card. Never add new player copy (the console's existing TUBES readout already shows the count). Never pin the ruled numbers in a test. Never merge the experiment branch's hack (`worktree-balance-sim-torpedo-tubes`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Light, fore only | cards `[lightTorpedo]` | 1 launcher × 3 tubes, pool 3, each tube on its own clock | N/A |
| Heavy + aft | `[heavyTorpedo, aftTorpedoLauncher]` | 2 launchers × 2 tubes, pool 4; the aft launcher arrives fully loaded | N/A |
| Supercav + aft | `[supercavTorpedo, aftTorpedoLauncher]` | 2 × 1, pool 2 | N/A |
| Old card id | a fold or pick that names `secondLauncherTube` | refused or ignored like any unknown line id | existing unknown-id path |
| Malformed tubes | an injected tube count of 0, 9 or NaN | clamped to [1, MAX_TUBES_PER_LAUNCHER = 3] | clamp |
| ~~WITHDRAWN~~ One rack, two drops | a rack with 2 mines drops, then a drop is asked 1 s later | refused (the existing `cooling` denial); allowed once 3 s have passed since that rack dropped | N/A |
| ~~WITHDRAWN~~ Two racks | rack A drops; a drop is asked at once | rack B drops; then both wait out their own 3 s | N/A |
| ~~WITHDRAWN~~ Instant Reload | a rack inside its 3 s wait | the racks refill and the wait clears | N/A |

</frozen-after-approval>

## Code Map

- `shared/src/constants.ts` -- the torpedo rows (`torpedo` = heavy, `lightTorpedo`, `supercavTorpedo`): damage and the new `tubesPerLauncher`
- `shared/src/sim/mountStats.ts` -- `BASE_MOUNTS`, `clampMounts`, `applyMountCapacity`: the per-ship tube count comes from the held kind's row
- `shared/src/sim/stats.ts` -- `effectiveStats` / `clampStats`: where the held torpedo is known
- `shared/src/sim/launchers.ts` -- `MAX_TUBES_PER_LAUNCHER` 2 → 3; `resizeLaunchers` is already generic
- `shared/src/sim/catalog.ts` -- `LINE_IDS`, the `oneOff` entry, the count comments
- `shared/src/sim/effects.ts` -- the `tubesPerLauncher` stat-path whitelist entry (no card steps it any more)
- `shared/src/index.ts` -- `PROTOCOL_VERSION`
- `client/src/ui/boonCopy.ts`, `client/src/render/equipmentIcons.ts`, `client/src/how-to-play/copy.ts` -- the card's name, glyph and How-to-Play row
- `client/src/render/hullArt/shapes.ts` `launcherArt` -- already draws N tubes; verify 3
- `server/scripts/matchSmoke.mjs`, `server/scripts/weaponsSmoke.mjs` -- fits that use the deleted card
- Tests naming the card or the 1|2 bound: `shared/src/__tests__/{launchers,catalog,catalogUnderIndex,boons,stats}.test.ts`, `server/src/__tests__/{launchersRacks,botPolicy,perception}.test.ts`, `client/src/__tests__/{catalogUnderIndexCards,consoleReadouts,hudBarSlots,ownLaunchers}.test.ts`, golden frames snapshot
- `_bmad-output/planning-artifacts/gdds/gdd-Hullcracker.io-2026-07-16/catalog-v3.md` line 283 -- names the four one-off cards

## Tasks & Acceptance

**Execution:**
- [x] `shared/src/constants.ts` -- damage 100 / 150 / 300 and `tubesPerLauncher` 3 / 2 / 1 on the three rows -- CONFIG is the single source
- [x] `shared/src/sim/mountStats.ts` + `stats.ts` -- derive `stats.tubesPerLauncher` from the held torpedo row (1 with none), clamp to [1, 3]; keep the capacity multiply -- one pure fold path for both sides
- [x] `shared/src/sim/launchers.ts` -- `MAX_TUBES_PER_LAUNCHER` = 3 -- the light needs it
- [x] `shared/src/sim/catalog.ts` + `effects.ts` -- delete the line and its whitelist entry; update the count comments -- no buyable tubes
- [x] `shared/src/index.ts` -- `PROTOCOL_VERSION` +1 with a history line -- catalog content changed
- [x] client copy, icon and How-to-Play -- delete the card's entries
- [x] smokes -- precondition the pool = the kind's tubes; both fit the AFT launcher too (the kind alone never out-damages passive regen at the new damage — the kill plans need both launchers)
- [x] tests -- update the card-naming tests to the new contract (pool = launchers × kind tubes; the aft card adds a full launcher; `secondLauncherTube` is not a line); re-record golden frames only if the wire changed
- [x] `shared/src/constants.ts` `captiveMines` -- `triggerRadius` 250 (the per-rack drop wait was built, then withdrawn by Eric 2026-11-26) -- Eric's mine additions
- [x] WITHDRAWN 2026-11-26 — `shared/src/sim/racks.ts` -- a per-rack wait clock: a drop starts it, `tickRacks` runs it down, `nextDropRack` skips a waiting rack, `instantReloadRacks` clears it, `rackSummary` reads not ready while the turn's rack can't drop; the client reads the summary as it does today -- one shared machine for both sides
- [x] WITHDRAWN 2026-11-26 — rack tests + the perception `you`-only check if the wire shape grows -- the matrix rows above
- [x] GDD catalog-v3 line 283 -- minimal edit: three one-off cards
- [ ] records at PR time -- `VERSION` / `package.json` / lock, `epic-13-context-amendments.md` (append), both trackers (one-line stamps), CHANGELOG

**Acceptance Criteria:**
- Given any torpedo kind with or without the aft card, when the ship's stats fold, then the pool and the drawn tubes equal launchers × that kind's CONFIG tubes on both server and client.
- Given an offer is drawn, when a ship holds any torpedo, then SECOND TUBE never appears.
- Given a client at the old PV, when it joins, then it is refused with the version error.

## Verification

**Commands:**
- `npm test -w shared && npm test -w server && npm test -w client` -- expected: green
- `HC_DEV_OPTIONS=1` matchSmoke + weaponsSmoke -- expected: pass first try
- `npm run check` once at the end -- expected: green

**Manual checks:**
- Render the own-hull launcher with 3 tubes on all four hulls; the tubes sit on the mount

## Spec Change Log

- 2026-11-26 — Eric withdrew the 3 s mine drop wait (Eric 2026-11-26, verbatim: *"Take out the 3s wait on mines. I changed my mind."*). Every wait file was restored to its pre-wait state (commit 18160be2): `sim/racks.ts`, `types.ts`, `equipment/mines.ts`, `frames.ts`, `console/readouts.ts`, `main.ts` and their tests; `CONFIG.mine.rackDropGapMs` removed; the golden snapshot back to the tubes-only re-record; the PV 116 note says no wire shape changes. KEEP: the captive ring 250 (and its `mineHp.test.ts` fix), the HUD torpedo row (layout B + hover re-lay), the smokes' aft-launcher fits.

## Suggested Review Order

**Tubes come from the torpedo kind**

- Entry point: the held kind's CONFIG tubes become `stats.tubesPerLauncher`, one fold for both sides.
  [`mountStats.ts:81`](../../shared/src/sim/mountStats.ts#L81)

- Called after the card fold, before the clamps bound it to 1..3.
  [`stats.ts:1176`](../../shared/src/sim/stats.ts#L1176)

- The per-kind dials and new damage (light shown; heavy is `CONFIG.torpedo`).
  [`constants.ts:1752`](../../shared/src/constants.ts#L1752)

- The tube cap rises to fit the light's three.
  [`launchers.ts:91`](../../shared/src/sim/launchers.ts#L91)

- SECOND LAUNCHER TUBE deleted; its seat closes (Story 11.2 precedent).
  [`catalog.ts:171`](../../shared/src/sim/catalog.ts#L171)

**Captive trip ring**

- Tier I trip ring 180 → 250; the ×1.1 tier step is unchanged.
  [`constants.ts:1940`](../../shared/src/constants.ts#L1940)

**HUD**

- Torpedo row: the kind's tubes per launcher; an empty row re-lays as the hovered kind.
  [`slots.ts:142`](../../client/src/render/console/slots.ts#L142)

- Slot geometry packs both launcher groups left; the row box never moves.
  [`slots.ts:78`](../../client/src/render/console/slots.ts#L78)

**Wire and peripherals**

- PV 116: catalog line gone, client-read CONFIG listed; no wire shape change.
  [`index.ts:6`](../../shared/src/index.ts#L6)

- Smokes fit the aft launcher: one launcher can't outpace passive regen now.
  [`weaponsSmoke.mjs:536`](../../server/scripts/weaponsSmoke.mjs#L536)

- HUD tube layout per kind, fixed rects, hover re-lay.
  [`hudBarSlots.test.ts:26`](../../client/src/__tests__/hudBarSlots.test.ts#L26)