// GOLDEN FRAMES — the byte-identity gate for the perception refactor (Story
// 1.1). A deterministic seeded scenario drives world.step() through every
// signal channel — all 11 GameEvent kinds (blip, shell, torp, torpU, boom,
// burst, dmg, sunk, spawn, pt, bn) plus the contact and mine channels and a spectator
// frame — and JSON.stringify's each frame buildFrame() produces (JSON key
// insertion order == msgpack key order, which is load-bearing on the wire).
// The serialized array is committed as a Vitest snapshot: the later refactor of
// perception.ts must replay it byte-for-byte identically. NO Date.now() /
// Math.random() anywhere — every number here is a fixed seed or scripted input.
//
// FIDELITY LIMITS (this gate is a PROXY, honest about its blind spots): frames
// are pinned via JSON.stringify, not the msgpack encoder the wire actually uses,
// so two shapes of bug slip past a byte-identical JSON string — (1) a key whose
// VALUE is `undefined` is DROPPED by JSON.stringify but WOULD be encoded by
// msgpack, and (2) `-0` serializes as `0`. Both are key/negative-zero PRESENCE
// bugs; they are caught instead by the explicit key-order guards in
// signals.test.ts (Object.keys equality + `'hit' in wire` presence checks),
// which assert the materialized object shape directly rather than its JSON text.
//
// RE-RECORDED 2026-11-04 (Story 10.4, the four battleships). What moved, and
// why it is not a perception regression: every scenario's hull is one of the
// four battleships (the retired Torpedo Boat / Battleship / Mine Layer re-keyed
// to bismarck / yamato / warspite — classWeapons.ts), so `cls`/`vcls`, hp, hull
// geometry, wake width and radar masks move with the hull; the own-ship frame
// carries `shift` (the seat gun gone), `turrets` and `sec`, and slot 0's pair is
// the main battery's summary; every captain contact row ends in `tu`; the
// gunnery scenario trains its turrets before each click; the denial scenario
// spends every turret before its cooling press; the owner mine detonation is
// driven by the secondaries (R3: the main battery never hurts a mine); and
// blows are the 10.3 armor-folded numbers. The perception chokepoint, the six
// exceptions and every proven sub-case are unchanged.
//
// RE-RECORDED AGAIN 2026-11-04 (Story 10.4 review gate). Values only — no key,
// no row, no event added or removed: (1) heat per ROUND (shared secondaries
// law) moves `you.sec.heat` (0.0125 / 0.025 → 0.03 …); (2) the shared turret
// stop hysteresis / state-aware desired angle moves four `you.turrets[].a`
// and two `tu` entries; (3) NO AIM (aimDist 0 → `batteryAimPoint` null, gate
// S2) holds every turret at rest on the neutral input instead of slewing it to
// a stop, so `you.turrets[].a` / contact `tu` read the rest angles and the
// salvos fired after it leave from the rested bearings (six ballistic events'
// x / y / vx / vy).
//
// RE-RECORDED 2026-11-05 (arc-only fire, Eric 2026-11-05, epic-10 amendment
// 10: a ready turret whose arc does not hold the aim point never fires). Only
// the denial scenario moved: its clicks aim dead ahead, where only the forward
// turrets bear, so it now spends just those. The two frames in which the aft
// turrets fired backward off their stops (each one `mz` + two `shell`
// events) are gone, and the `cooling` press lands two ticks sooner (tick 4,
// fireSeq 4) with the aft turrets still loaded (`ammo[0].n` 2, their reloads
// 0). That frame also carries the tick-2 salvo's terminal burst + `hc` pair and
// the ability's `no-ammo`. Three captured frames became one; no key, event
// kind or proof was added or removed, and every other scenario is unchanged.
//
// …and HOLD OUTSIDE THE ARC (Eric 2026-11-05, same amendment): a turret whose
// arc does not hold the aim point holds its angle instead of traveling to a
// stop. Values only, in 34 frames: 59 `you.turrets[].a` (an aft turret that
// used to creep from π toward its stop while the aim sat ahead now stays at
// rest, e.g. 3.0631 → π) and 6 contact `tu` entries (e.g. −4 → 0). No event,
// salvo, key or proof moved.
//
// RE-RECORDED AT THE MERGE of development (arc-only fire, above) into Story
// 10.5 (2026-11-05): the snapshot is the story's frames with the arc-only-fire
// changes laid on top, token-diffed against both parents; see the Story 10.5
// notes on the R6 battery below.
//
// RE-RECORDED 2026-11-05 (Story 10.6, the catalog under the index — torpedo
// LAUNCHERS, mine RACKS, per-ship ability numbers; PV 98). Structurally
// diffed frame by frame (168 frames before and after, none added or removed):
//   * NEW KEYS, no other key moved: every contact row of a hull holding a
//     torpedo ends in `lu` (after `tu` — 225 rows); the own block of a hull
//     holding a torpedo / mine appends `launchers` (138) / `racks` (23);
//   * the mine slot's `ammo` summary reads the rack's new base of three (23
//     values, e.g. 1 → 2 after one drop);
//   * HULL REPAIR's cooldown is the 75 s base (two `repairReadyAt`, 90050 →
//     75050); the draw deals the new catalog (five `offer` entries);
//   * the scenarios' three torpedo clicks now carry a positive `aimDist` (a
//     torpedo click with none names no area and is refused out-of-arc, R16):
//     in the gunnery scenario the turrets therefore chase that aim (four
//     `you.turrets[].a`, two contact `tu`), and its torpedo leaves the FORE
//     launcher's station along the launcher's CURRENT bearing — the early-
//     click rule, the launcher not yet on the aim (two ballistic events'
//     x / y / vx / vy).
// No event kind, frame, channel or proof was added or removed; the declared
// exceptions are still six.
//
// RE-RECORDED 2026-11-06 (Story 10.6, R28 — the launchers fire across the
// beam, 30°–120° off their own end; dead ahead is refused). The two scenarios
// that fired a torpedo dead ahead now fire a legal shot, and ONLY their frames
// moved (93 lines, same count; every proof unchanged):
//   * scnHoming: the shooter lies with +x on its starboard beam (heading
//     −π/2, launcher trained there), so c's contact row for it reads the new
//     heading, `lu` and `tu` (its turrets chase the same aim); the torpedo leaves
//     the fore launcher's side instead of the bow, so its reveal x / y / vx /
//     vy, and the tick of every `torpU` and torpedo-wake `wk` c sees, moved;
//   * scnGunnery: the torpedo click aims along shot 1's bearing (π/4) instead
//     of dead ahead — before R28 that click fired EARLY along the launcher's
//     current bearing (0.74 rad); now the trained launcher is on the aim and
//     fires at it (0.89 rad from its station): the reveal's x / y / vx / vy,
//     the shooter's turret and launcher angles (they chase the new aim) and
//     o1's `tu` / `lu` for it.
//
// RE-RECORDED 2026-11-06 (Story 10.7, offer composition — the four-slot type
// plan and the own-row REDRAW flag; PV 98 → 99). Structurally diffed line by
// line (174 lines before and after, none added or removed):
//   * NEW KEY, no other key moved: every `you` row carries `rd` right after
//     `offer` (164 rows, all `false` — no scenario redraws);
//   * the draw's new plan moved two drawn `offer` values (the rng stream is
//     spent differently).
// Nothing else moved: no event, contact, salvo, proof or exception.
//
// RE-RECORDED 2026-11-06 (Story 10.8, the PvE fleet retired). ONE KEY GONE,
// nothing else: the credited killer's `vcls` stamp on four `sunk` rows (Story
// 5.6, amendment 43 — the victim's hull id, which only a roster-less drone
// kill ever needed) left with the fleet. 4 of 174 lines moved, each by that
// key alone; no `kcls` or `aggro` was ever in a captured frame. No RNG
// stream moved (no scenario runs the zone clock, so the deleted wave spawner
// never drew). The six exceptions and every proof are unchanged.
//
// RE-RECORDED 2026-11-12 (Story 11.1, real dispersion + no traverse; PV
// 103). Structurally diffed frame by frame (168 frames before and after, none
// added or removed; NO key added or removed on any row): (1) every turret /
// launcher angle is the DERIVED angle (at the aim inside the arc, rest
// outside), so 83 contact `tu`, 1 `lu`, 2 `you.turrets[].a` and 1
// `you.launchers[].a` values moved; (2) every main-battery shell flies from
// its own muzzle straight at its own DISPERSED landing (converge, R13), so 20
// `shell` reveals' vx / vy and the matching 12 `burst`, 8 `hc`, 6 `sp` and 4
// `boom` points moved by a few units; (3) with no traverse to wait for, the
// gunnery scenario's `holdAim` is one tick, so its 9 captured frames sit
// earlier (tick 82 → 2, 117 → 37, 118 → 38, 426 → 265 — `t` / `tick` /
// `sweep` / `xp` move with them) and its torpedo leaves at the aim bearing
// on the first click, which shifts that torpedo's `torpU` and wake (`wk`)
// paints on observer `c` by a tick or two (14 frames' event lists). The
// perception chokepoint, the six exceptions and every proof are unchanged.
//
// RE-RECORDED 2026-11-12 (Story 11.1 REVIEW FIX — parallel salvo tracks and
// the HMAC dispersion key; PV stays 103, unreleased). Structurally diffed
// frame by frame: 168 frames before and after, 22 moved, NO key added or
// removed anywhere, and ONLY event values moved: (1) every main-battery
// shell now flies on the SALVO BEARING (parallel tracks, abreast off the
// muzzle line), so the 20 `shell` reveals' vx / vy moved, and 12 of them
// their x / y (a spawn on the muzzle line, not a barrel offset); the `mz`
// rides the salvo's first spawn, so 6 `mz` points moved with it; (2) every
// landing is re-rolled under the new per-shell seed (HMAC under the World's
// offline key — no scenario passes a key), so 12 `burst`, 8 `hc`, 6 `sp` and
// 4 `boom` points moved by a few units. No frame, tick, contact, paint or
// count moved; the six exceptions and every proof are unchanged.
//
// RE-RECORDED 2026-11-12 (Story 11.2, the hectometer ruler and real reach).
// What moved, and why it is not a perception regression: every reach is its
// own CONFIG fact now (sight 500 u → 200 hm ≈ 4,545 u; radar 1,500 u → 400 hm
// ≈ 9,091 u; the new plain-hull, splash and flash reaches 350 hm ≈ 7,955 u;
// shell 200 hm; torpedo 15 hm ≈ 341 u; mine 3 hm ≈ 68 u), so the placements
// sized for the old ladder no longer proved their comments. Each is re-based
// off the reach it names (the constants block below — no bare distance), and
// because the board (radius 5,000 u) is narrower than the reaches, an observer
// whose subject is far sits at a WEST seat with the subject east of it.
// Structurally diffed frame by frame: 168 frames before and after, same order,
// same observers; every event KIND is still present.
//   THE RE-BASES (old → new, and what the row still proves):
//   * scnSightSpawnBlip: `a` (0,0) → the WEST seat (−4,261, 0), `b` still
//     100 u east of it (contact AND blip); `c` 700 u → ANNULUS 8,523 u from
//     `a` on the same swept bearing (beyond every eye reach: blip only, for
//     `a` and for `b`). NEW hull `p`, 6,250 u from `a` on bearing π/6 — the
//     plain band, off the beam (see the `pc` note below).
//   * scnPtBn: `a` → WEST, `b` 700 u → 8,523 u east of it (the credited
//     sinking still arrives unseen; b's spawn stays out of sight).
//   * scnMines: `a` → (−4,645, 0); `seen` (500, 0) → 68.2 u due north (the
//     mine-sight boundary, inclusive); `nearFog` 520 u → 88.2 u (20 u past it,
//     hidden); `own` / `fog` (±1,700 diagonals) → 9,291 u east (beyond radar:
//     own shown, enemy hidden).
//   * scnSpectator: `a` → WEST; `b` 1,000 u → 8,523 u east; `c` (−600, 400)
//     → 6,250 u out on bearing π/6 (a fogged a's plain band — the spectator
//     holds it as a full contact and carries no `pc`); the own mine keeps its
//     (800, 800) offset.
//   * scnStraddleBoom: nothing re-seated — `b` (SIGHT + 12) and the shell
//     (SIGHT − 15) follow sight from 512 / 485 u to 4,557 / 4,530 u. The boom
//     is still hit-stripped for `a`; `b`'s centre is now in a's plain band, so
//     both of a's and b's frames carry the other as a `pc` row.
//   * scnIslandLos: `a` → WEST; the rock 75 u → 300 u east (radius 30 kept, so
//     it subtends less than the fan) and `b` behind it 150 u → 600 u; `c`
//     keeps its (100, 100) offset; the three radar targets 700 u on bearings
//     0 / π/2 / π → 8,523 u on bearings 0 (`r`, hard cover: dark) / +π/10
//     (`p`, open water: paints) / −π/10 (`s`, low cover: paints); the low
//     ridge (−200, 0) → 200 u out on bearing −π/10; the paint window 0..π →
//     −π/10..π/4; the raster covers the seat (reach 700 → 4,261 u).
//   * scnBallisticReveal: the shell SIGHT + 6 (506 u) → shellSight + 6
//     (4,551 u); the torpedo detect + 6 (506 u) → torpedoSight + 6 (347 u).
//     The 4.9 fork is real again: the shell reveals beyond the torpedo reach.
//   * scnSpectatorBallistic: `fly` (300, 300) → 4,551 u out on bearing π/4,
//     opening (just outside a fogged c's shell sight — never sighted alive).
//   * scnStarShell: the flare point (SIGHT + 80) and `h` follow sight 580 u →
//     4,625 u; `c` (flareDist, −radar) → (flareDist − radar, 0), still EXACTLY
//     at radar range of the zone centre; `d` (−1,700, 0) → (flareDist −
//     9,291, 0), still beyond radar of it. The longer flight moves the burst
//     frames' t 1,050 → 9,150 and the expiry frame's 11,100 → 19,200 (`tick`
//     / `sweep` / `xp` / reloads with them). `h` is a plain hull to the firer
//     before the burst and after expiry, a full contact under the zone.
//   * scnZoneKill: `a` → WEST; `b`, the owned zone and the shell 700 u →
//     8,523 u east — beyond the splash reach too, so the zone alone carries
//     the boom, its victim id and the sunk row's `seen`.
//   * scnHoming: `a` / `b` / `c` keep their offsets, shifted 4,770 u west (the
//     torpedo runs toward the middle of the board); `d` (−1,700, 0) → 9,291 u
//     east of `c` (beyond every eye reach and the radar of every hull).
//   * scnGunnery: `a` → WEST with its bow 45° off due east (shot 1 and the
//     torpedo keep their 45°-off-the-bow geometry, now aimed due east); `o1`
//     (0, 300) → 300 u due west (inside the halo, and behind the line of fire
//     so shot 1's burst is beyond its splash reach); `o2` 900 u → 8,105 u out
//     on bearing +π/10 (150 u past the 350 hm halo); the rock and `o3` 200 /
//     300 u due east → due south; shot 1 SIGHT + 400 (900 u) → 8,079 u
//     (halfway between the farthest eye reach and the Bismarck's 361 hm guns);
//     `b` 700 u due west → 8,079 u on bearing −π/10 (beyond BOTH sight tiers:
//     the Hit Call still names only the shooter). Flights are ~322 ticks, so
//     the burst / torpedo / hit frames sit at t 16,200 / 16,250 / 42,450 (were
//     1,850 / 1,900 / 13,250).
//   * scnWake: `a` → WEST; the in-sight samples keep 200 / 212 u east of it;
//     the far run and the torpedo ribbon 700.. / 800.. u → 8,523.. / 8,623.. u
//     east (beyond every eye reach, inside the radar rim).
//   * scnTorpReReveal: the torpedo detect + 6 → torpedoSight + 6 (347 u). The
//     one-tick shrink is the real FLASH mark (`dazzledUntil`) instead of a
//     `stats.sightRange` write: the torpedo reach is a CONFIG fact, not a
//     stat, so the stats write no longer moves that gate.
//   * scnMineKindForAll: enemy `a` 120 u → 94.1 u east (60 + mineSight / 2),
//     so all three mines sit inside its 68 u mine sight (34–45 u away).
//   * NOT re-seated (every subject already inside the reach its comment
//     names): scnCombat, scnBurst, scnMineBlast, scnMineBurstDetonation,
//     scnDenied, scnDebuffs, scnHeal.
//   THE NEW CHANNEL: `pc` (plain hulls — {h,x,y,heading,speed} under an
//   anonymous per-observer, per-visit handle), a fogged frame's optional key
//   after `mines` / `litZones`, omitted when empty. Nine frames carry it:
//   scnSightSpawnBlip's two (`p`, one row each, a different handle per
//   observer), scnStraddleBoom's two, scnStarShell's firer and `d` frames
//   (`h` takes a NEW handle after the zone lifts and drops it — per visit),
//   and scnGunnery's `o2` frame. No spectator frame carries it. Four new
//   sub-cases and the channel guard pin it.
//   THE DROPOUT IS GONE (R8): no captured paint ever rode a dropout roll, and
//   ANNULUS no longer has to sit inside a flat band.
//   KEYS, against the previous snapshot: ADDED `pc` on those nine frames, and
//   `you.dazzledUntil` on scnTorpReReveal's ONE silent frame (the real mark,
//   above — the self-private key any flashed hull's own frame carries; it
//   last rode this battery before Story 9.4). REMOVED: none. `ib` is `{}` on
//   every row before and after; no contact, event, mine, zone or denial row
//   gained or lost a key.
//   ROWS that came or went on values alone: `spawn` rows 33 → 56 (the class
//   reach now covers most spawn-ring points — the row is unchanged, the
//   spawn point rides it and is still gated at sight); two `torp` reveals
//   left (scnCombat's `b` and scnGunnery's `o1` sat inside the old 500 u
//   detect rung and are outside the 341 u torpedo sight); scnDebuffs' two
//   frames gain the mine's owner `o` at (600, 600) as a contact; two `blip`s
//   joined scnGunnery's burst-tick frames (the beams turn through a 16 s
//   flight). The perception chokepoint and the six exceptions are unchanged.

import { describe, it, expect } from 'vitest';
import {
  isAfloat,
  transitionLifecycle,
  CONFIG,
  abilityCode,
  FAMILY_SLOT,
  DEFAULT_CLASS_ID,
  FLASH_WINDOW_MS,
  coverageHas,
  wrapPositive,
  aimPointOf,
  turretBears,
  type BallisticEvent,
  type BlipEvent,
  type FrameMsg,
  type GameEvent,
  type HitCallEvent,
  type MatchPhase,
  type MineKind,
  type MineView,
  type PlainContact,
  type ShipClassId,
  type WakeBlipEvent,
  type WakeRibbon,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { fitClassWeapons } from './classWeapons.js';
import { buildFrame } from '../game/frames.js';
import { circleIsland, flatRaster, rasterFrom, ridgeField } from './islandFixture.js';

const TAU = Math.PI * 2;
const DT = CONFIG.tick.simDtMs;
// THE RE-BASED PLACEMENTS (Story 11.2, the hectometer ruler — every reach is
// its own CONFIG fact, and none derives from another). Each scenario seats
// its hulls, shells and mines off the reach its comment names, never off a
// bare distance:
//   SIGHT        class and name by eye — inside it a hull is a full contact;
//   HULL_SIGHT   a plain hull by eye — between the two it is a `pc` row;
//   SHELL_SIGHT / TORP_SIGHT / MINE_SIGHT — a shell, a torpedo, a laid mine;
//   SPLASH_SIGHT a boom / burst POSITION; FLASH — the muzzle flash;
//   EYE          the farthest any eye reaches: past it only radar holds a hull.
const SIGHT = CONFIG.vision.sight;
const HULL_SIGHT = CONFIG.vision.hullSight;
const SHELL_SIGHT = CONFIG.vision.shellSight;
const TORP_SIGHT = CONFIG.vision.torpedoSight;
const MINE_SIGHT = CONFIG.vision.mineSight;
const SPLASH_SIGHT = CONFIG.vision.splashSight;
const FLASH = CONFIG.vision.muzzleFlash;
const RADAR = CONFIG.vision.radar;
const EYE = Math.max(HULL_SIGHT, FLASH, SPLASH_SIGHT);
// PLAIN_BAND is the middle of the outer sight tier (a plain hull, never a
// full contact). ANNULUS is the one radar-only distance every scenario uses
// (the name predates amendment 210, which removed the radar's inner edge):
// beyond EVERY eye reach and inside the radar rim — the dropout is gone
// (Story 11.2, R8), so a swept, unshadowed hull there paints on every
// revolution. BEYOND_RADAR is past the radar rim. All derived.
const PLAIN_BAND = (SIGHT + HULL_SIGHT) / 2;
const ANNULUS = (EYE + RADAR) / 2;
const BEYOND_RADAR = RADAR + 200;
// THE BOARD IS SMALLER THAN THE REACHES (map radius 5,000 u; a hull past the
// rim is pushed back onto the water when the world steps), so two hulls that
// must be ANNULUS / BEYOND_RADAR apart sit on OPPOSITE sides of the origin:
// the observer at the WEST seat, its far subject that distance east of it.
const WEST = -ANNULUS / 2; // x of the observer whose subject is ANNULUS away
const FAR_WEST = -BEYOND_RADAR / 2; // x of the observer whose subject is BEYOND_RADAR away
// Every far subject of a west-seated observer must sit inside a narrow fan
// about due east to stay on the board; three far subjects fan across it.
const FAN = Math.PI / 10;
// One tick's radar paint window width (rad) — a target at bearing δ/2 is painted
// by the first post-step window [0, δ).
const SWEEP_DELTA = (TAU * DT * CONFIG.vision.sweepRpm) / 60000;

// The full set of channels the fixture MUST exercise: the 15 GameEvent kinds
// (Story 2.1 deleted 'heal' with the REPAIR spend; Story 2.7 added the
// self-private 'bn' boon-fit event; Story 2.8 stripped 'upg' and added the
// homing-track update 'torpU'; Story 4.3 added the gunnery conversation's
// 'sp'/'hc'/'mz'; the 2026-08-04 DAMAGE CONTROL strip brought 'heal' BACK)
// plus the three contact-like channels (contact/mine/litzone) and the
// spectator frame. (`decoy` left with the decoy buoy — Story 7-5 wave 2; the
// Story 8.16 DECOY BUOY's `decoys` channel never had a battery scenario and
// was deleted with the buoys in Story 10.5.)
// BALANCE CYCLE 1 ADDED 'sm' — and it was the doubling that added it, not a
// perception change. Hull hp doubled while the fixture's ordnance did not, so
// hits that used to sink a hull outright now leave it ALIVE and inside the
// wounded damage band, which is exactly when wounded smoke emits. The battery
// therefore covers one channel MORE than before; nothing was lost.
// STORY 11.2 ADDED 'pc' — the plain-hull channel (the outer sight tier).
const EXPECTED_CHANNELS = [
  'blip', 'bn', 'boom', 'burst', 'contact', 'denied', 'dmg', 'hc', 'heal', 'litzone',
  'mine', 'mz', 'pc', 'pt', 'shell', 'sm', 'sp', 'spawn', 'spec', 'sunk', 'torp', 'torpU', 'wk',
];

// Targeted sub-cases the APPENDED scenarios (island LOS, non-owner + spectator
// ballistic reveals) must each prove. Recorded ONLY when the observed fact holds
// (see prove()), so a regression OR a commented-out scenario drops a tag and
// fails the sub-case coverage assertion — the "found-style boolean per mandatory
// sub-case" the straddle-boom check pioneered, generalized across the additions.
const EXPECTED_SUBCASES = [
  'denied-blocked-mine-click',
  'denied-cooling-weapon',
  'denied-noammo-ability',
  'denied-gun-shells-terminate',
  'denied-out-of-arc-owner-only',
  'gunnery-hitcall-beyond-sight',
  'gunnery-miss-own-splash',
  'heal-event-healer-only',
  'heal-pool-drains-on-the-wire',
  'heal-repairhp-never-off-you',
  'island-allows-radar-blip',
  'island-allows-sight-contact',
  'island-blocks-radar-blip',
  'island-blocks-sight-contact',
  'litzone-beyond-radar-silent',
  'litzone-boom-victim-id',
  'litzone-expiry',
  'litzone-firer-reveal',
  'litzone-lifts-plain-to-contact',
  'litzone-sunk-reveal',
  'litzone-thirdparty-radar-circle',
  'mine-burst-detonation',
  'mine-kind-for-all',
  'mine-trip-blast-multivictim',
  'muzzle-flash-beyond-halo-silent',
  'muzzle-flash-inside-halo',
  'muzzle-flash-island-blocked',
  'nonowner-hidden-at-launch',
  'nonowner-reveal-current-params',
  'nonowner-reveal-once',
  'plain-hull-pose-only',
  'shell-reveal-at-sight',
  'slow-factor-victim-private',
  'slowed-victim-private',
  'soft-cover-allows-radar-blip',
  'spectator-ballistic-reveal',
  'spectator-dmg-passthrough',
  'spectator-no-plain-channel',
  'spectator-raw-boom',
  'spectator-reveal-once',
  'straddle-boom-on-plain-hull',
  'torp-re-reveal',
  'torp-re-reveal-silent-outside',
  'torp-reveal-inside-detect',
  'torpedo-launch-no-muzzle',
  'torpu-sighted-update',
  'torpu-unsighted-silent',
];

// The five wake behaviours the battery must prove (Story 4.12).
const WAKE_SUBCASES = [
  'wake-identity-free',
  'wake-outlives-removal',
  'wake-outlives-ship',
  'wake-sight-bubble-disclosed',
  'wake-torpedo-ribbon',
];

// ---------- collector ---------------------------------------------------------

/** The growing golden fixture plus the self-validating coverage sets. */
interface Golden {
  frames: string[];
  channels: Set<string>;
  subcases: Set<string>;
}

/** Serialize one frame into the fixture and note which channels it exercised. */
function record(g: Golden, f: FrameMsg): FrameMsg {
  for (const e of f.events) g.channels.add(e.k);
  if (f.contacts.length > 0) g.channels.add('contact');
  if (f.mines.length > 0) g.channels.add('mine');
  if (f.litZones !== undefined && f.litZones.length > 0) g.channels.add('litzone');
  if (f.pc !== undefined && f.pc.length > 0) g.channels.add('pc');
  if (f.denied !== undefined && f.denied.length > 0) g.channels.add('denied');
  if (f.spec) g.channels.add('spec');
  g.frames.push(JSON.stringify(f));
  return f;
}

/** Record a proven sub-case iff its observed condition held — the strengthened
 *  coverage gate (a missing tag fails the final sub-case assertion). */
function prove(g: Golden, tag: string, held: boolean): void {
  if (held) g.subcases.add(tag);
}

/** A ballistic reveal event (shell or torp) — the two kinds that ride the
 *  per-observer first-sight reveal. */
const isBallistic = (e: GameEvent): boolean => e.k === 'shell' || e.k === 'torp';

/** Blip reference test (cycle 63): a coverage footprint matches when its mask
 *  lights the cell containing the point — the wire carries no position and no
 *  id (amendment 152), so position-by-cell is the strongest public reference
 *  that exists. */
function blipRefs(e: BlipEvent, x: number, y: number): boolean {
  const cellU = CONFIG.vision.radarCellU;
  return coverageHas(e, Math.floor(x / cellU) - e.gx, Math.floor(y / cellU) - e.gy);
}

/** Does the frame carry a blip referencing world point (x, y)? */
function blipAt(f: FrameMsg, x: number, y: number): boolean {
  return f.events.some((e) => e.k === 'blip' && blipRefs(e, x, y));
}

/** The exact key order of a plain-hull row (msgpack order is load-bearing). */
const PLAIN_KEYS = 'h,x,y,heading,speed';

/** The frame's plain-hull row AT a hull's pose — the only way to name one: a
 *  `pc` row carries an anonymous handle, never a roster id. */
function plainAt(f: FrameMsg, ship: ShipRecord): PlainContact | undefined {
  return (f.pc ?? []).find((r) => r.x === ship.state.x && r.y === ship.state.y);
}

/** Step budget for a shell at `shellSpeed` (u/s) to cover `distU`, with slack. */
function flightTicks(distU: number, shellSpeed: number): number {
  return Math.ceil(distU / ((shellSpeed * DT) / 1000)) + 40;
}

/** Build one observer's frame (wire semantics: once per observer per tick). */
function cap(g: Golden, w: World, id: string, phase?: MatchPhase): FrameMsg {
  return record(g, buildFrame(w, id, phase));
}

// ---------- world construction helpers (mirror perception.test) ---------------

/** World with a fixed seed and no islands (fog stays out of the geometry).
 *  The height raster is flattened too (Story 4.11): the real generated
 *  terrain must not radar-shadow a scenario built on empty water — scenarios
 *  that WANT terrain occlusion set an explicit raster (scnIslandLos). */
function bareWorld(seed: number): World {
  const w = new World(seed, CONFIG.match.fillTo, CONFIG.zone);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

/** Add a ship and teleport it to an exact pose (speed 0). `hull` defaults to
 *  DEFAULT_CLASS_ID (Story 10.4 — every pre-1.7 scenario was built on the
 *  retired Torpedo Boat); scnStarShell places a yamato (its fixture carries
 *  the star shell); the 1.8 scenarios place a warspite (its fixture carries
 *  the naval mines) — the suite-wide re-keying in classWeapons.ts. */
function place(w: World, id: string, x: number, y: number, heading = 0, hull: ShipClassId = DEFAULT_CLASS_ID): ShipRecord {
  // The hull's default deck (Story 8.2): what the door admits for a captain.
  const rec = w.addShip(id, id.toUpperCase(), 'captain', hull, undefined, undefined);
  // THE CLASS WEAPON IS A CARD NOW (Story 8.10, amendment 62): the interim
  // spawn seed is deleted and a hull comes up with gun + Shift and an EMPTY
  // weapon row, so this fixture fits it explicitly through the same applyCard
  // path a real pick takes. Every case below keeps its subject.
  fitClassWeapons(w, rec);
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = heading;
  rec.state.speed = 0;
  // PARK THE BEAM AT 0 EXPLICITLY. addShip anchors a fresh sweep to the hull's
  // SPAWN-RING heading (Eric ruling 2026-08-16), which this fixture then throws
  // away by teleporting the hull to a scripted pose — so an un-parked beam would
  // sit at an angle derived from a discarded placement, and every scenario's
  // paint window would move whenever mapgen or the spawn-candidate count did.
  // The battery already scripts the beam by hand wherever a beam is load-bearing
  // (see scnBlip / scnRadarWake); this makes the DEFAULT explicit rather than
  // inherited, and is what keeps the committed golden bytes byte-identical.
  rec.sweepAngle = 0;
  rec.prevSweepAngle = 0;
  return rec;
}

/** Drop a live ballistic (shell or torpedo) directly into world state. */
function injectShell(
  w: World,
  id: string,
  ownerId: string,
  x: number,
  y: number,
  dir: number,
  distLeft: number,
  kind: 'shell' | 'torp' = 'shell',
): void {
  w.shells.set(id, {
    id,
    ownerId,
    x,
    y,
    vx: Math.cos(dir) * CONFIG.gun.shellSpeed,
    vy: Math.sin(dir) * CONFIG.gun.shellSpeed,
    distLeft,
    bornAt: w.now,
    kind,
    family: kind === 'torp' ? null : 'cannon',
    damage: CONFIG.gun.damage,
    hitRadius: CONFIG.gun.shellRadius,
    // Contact-only injection (legacy hit rule): full damage on interception,
    // no burst point — keeps the pre-1.4 scenario events byte-stable. The
    // burst channel is exercised by scnBurst through the REAL gun.
    targetX: null,
    targetY: null,
    burstRadius: 0,
    contactDamage: CONFIG.gun.damage,
    hits: CONFIG.gun.hits,
  });
}

/** Drop a mine directly into world state (armed by default; a NAVAL mine
 *  unless the scenario says otherwise — Story 8.13 stamps the laying line's kind). */
function injectMine(w: World, id: string, ownerId: string, x: number, y: number, kind: MineKind = 'naval'): void {
  w.mines.set(id, { id, ownerId, x, y, armedAt: 0, kind, hp: 10 });
}

// ---------- scenarios ---------------------------------------------------------

/** contacts + spawn + a radar-only blip (target visible ONLY as a blip), a
 *  sighted hull the beam crosses (a contact AND a blip — amendment 210), and
 *  a PLAIN hull (Story 11.2, R3): in the outer sight tier, off the beam — a
 *  `pc` row of pose under an anonymous handle, and nothing else. */
function scnSightSpawnBlip(g: Golden): void {
  const w = bareWorld(1001);
  place(w, 'a', WEST, 0);
  place(w, 'b', WEST + 100, 0, 1.5); // inside sight, bearing 0 (swept) -> live contact AND blip (amendment 210)
  const brg = SWEEP_DELTA / 2; // painted by the first post-step window [0, δ)
  place(w, 'c', WEST + ANNULUS * Math.cos(brg), ANNULUS * Math.sin(brg)); // beyond every eye reach, inside radar -> blip only
  const pb = Math.PI / 6; // off the beam: the eye alone holds it
  const p = place(w, 'p', WEST + PLAIN_BAND * Math.cos(pb), PLAIN_BAND * Math.sin(pb), 0.7); // between sight and hull sight -> plain
  w.step(); // sweep advances 0 -> δ, publishing the join spawns
  const fa = cap(g, w, 'a'); // own spawn + contact b + blips b and c (c is never a contact) + plain p
  cap(g, w, 'b');
  const row = plainAt(fa, p);
  prove(
    g,
    'plain-hull-pose-only',
    row !== undefined &&
      (fa.pc ?? []).length === 1 &&
      Object.keys(row).join(',') === PLAIN_KEYS &&
      row.heading === p.state.heading &&
      !fa.contacts.some((ct) => ct.id === 'p') && // never both lists
      !blipAt(fa, p.state.x, p.state.y) && // off the beam: no paint
      !fa.events.some((e) => e.k === 'spawn' && e.id === 'p') && // the spawn row stays on the class reach
      row.h !== 'p', // an anonymous handle, never the roster id
  );
}

/** shell + torp reveals, then boom + dmg + sunk + pt from a killing hit. */
function scnCombat(g: Golden): void {
  const w = bareWorld(1002);
  place(w, 'a', 0, 0);
  const b = place(w, 'b', 150, 0);
  b.hp = 1; // any landed blow sinks it (a blow settles to at least 1 — Story 10.3/10.4)
  injectShell(w, 'tp', 'a', 0, 300, Math.PI / 2, 400, 'torp'); // owner-visible torp, flies clear
  injectShell(w, 'sg', 'a', 130, 0, 0, 100, 'shell'); // point-blank on b
  cap(g, w, 'a'); // shell + torp reveals (owner always), contact b
  w.step(); // shell strikes b
  cap(g, w, 'a'); // boom + sunk + pt (dmg is victim-private)
  cap(g, w, 'b'); // boom + dmg + sunk (victim)
}

/** pt + bn — both self-private, delivered only to the acting ship. ('heal'
 *  left the wire with the REPAIR spend — Story 2.1, PV 12; the legacy 'upg'
 *  event died with the 2.8 strip, so this scenario no longer drives one. The
 *  banked offer is OVERRIDDEN with a fixed non-heal hand so the fixture stays
 *  content-stable — and the "a spend never heals" pin holds for every card
 *  since Story 10.3 deleted HULL POINTS' heal-on-grant (Eric 2026-11-04,
 *  epic-10 amendment 8). The hand's ids were renamed in place then:
 *  'radarSweep' -> 'intel', 'speed' -> 'engines', same seats.) */
function scnPtBn(g: Golden): void {
  const w = bareWorld(1003);
  const a = place(w, 'a', WEST, 0);
  place(w, 'b', WEST + ANNULUS, 0); // far (beyond every eye reach of a); sunk to bank a a level
  w.sinkShip('b', 'a'); // sunk(b) + pt(a) — the sunk now reaches a UNSEEN (PV 23: credited killer)
  a.hp -= 30; // damaged — a non-heal spend may not restore this
  a.offer = ['deckGun', 'reload', 'intel', 'engines']; // fixed non-heal hand
  const hpBefore = a.hp;
  expect(w.spendPoint('a', 3)).toBe(true); // the fourth card — bn(a)
  expect(a.hp).toBe(hpBefore); // a non-heal spend never heals
  w.step();
  cap(g, w, 'a'); // spawn(a) + pt + bn + the unseen sunk(b) (b's spawn stays out of sight)
}

/** mine channel: own mine always, enemy mine at the MINE-SIGHT boundary
 *  (Story 11.2, R4 — a laid mine has its own eye reach, 3 hm; Story 4.9's
 *  detect rung before), enemy mine just beyond it hidden, enemy mine in deep
 *  fog (beyond radar) hidden. The near mines lie due north of the observer so
 *  the boundary distance is exact (dx is 0). */
function scnMines(g: Golden): void {
  const w = bareWorld(1004);
  place(w, 'a', FAR_WEST, 0);
  injectMine(w, 'own', 'a', -FAR_WEST, MINE_SIGHT); // beyond radar: the owner sees own mines everywhere
  injectMine(w, 'seen', 'b', FAR_WEST, MINE_SIGHT); // enemy mine at the mine-sight boundary (inclusive)
  injectMine(w, 'nearFog', 'b', FAR_WEST, MINE_SIGHT + 20); // just beyond mine sight -> excluded
  injectMine(w, 'fog', 'b', -FAR_WEST, -MINE_SIGHT); // enemy mine in deep fog (beyond radar) -> excluded
  cap(g, w, 'a');
}

/** spectator frames: a dead-in-active observer and a finished-phase observer. */
function scnSpectator(g: Golden): void {
  const w = bareWorld(1005);
  place(w, 'a', WEST, 0);
  place(w, 'b', WEST + ANNULUS, 0); // beyond every eye reach of a fogged a
  // In a fogged a's PLAIN band: a spectator holds it as a full contact, and
  // no spectator frame carries `pc` at all (Story 11.2, R3).
  place(w, 'c', WEST + PLAIN_BAND * Math.cos(Math.PI / 6), PLAIN_BAND * Math.sin(Math.PI / 6), 1.2);
  injectMine(w, 'sm', 'a', WEST + 800, 800);
  w.respawnEnabled = false; // active-phase policy: the dead stay dead
  w.sinkShip('a', 'b'); // a dies in the active phase -> spectates once FOUNDERED
  // Story 5.2: spectate keys on isSunk. Drive the founder edge directly (the
  // validated table edge) rather than stepping the 5000ms window, so the
  // fixture's tick count — and every downstream byte — stays put.
  w.ships.get('a')!.lifecycle = transitionLifecycle(w.ships.get('a')!.lifecycle, 'founder', w.now);
  w.step();
  const fa = cap(g, w, 'a', 'active'); // spec: unfogged contacts b,c + own mine
  const fb = cap(g, w, 'b', 'finished'); // finished: everyone spectates
  prove(
    g,
    'spectator-no-plain-channel',
    fa.spec === true && fb.spec === true && !('pc' in fa) && !('pc' in fb) &&
      fa.contacts.some((ct) => ct.id === 'b') && fa.contacts.some((ct) => ct.id === 'c'),
  );
}

/**
 * A straddling hull: b's center sits just outside a's sight (the CLASS reach),
 * its hull reaches inside, so a's shell strikes at a point a can see. a gets
 * the boom (impact seen) but never b's id (center beyond the class reach) —
 * the hit-stripped boom path. Since Story 11.2 that center is in a's PLAIN
 * band, so a holds b as a `pc` row the whole time and the boom on it stays
 * anonymous: no roster id is ever attached to a hull held only by its handle.
 * b, as the victim, sees its own hit. Captures every tick until the boom lands.
 */
function scnStraddleBoom(g: Golden): void {
  const w = bareWorld(1006);
  place(w, 'a', 0, 0);
  const b = place(w, 'b', SIGHT + 12, 0, 0); // center at SIGHT+12u, hull along +x
  b.hp = 100; // survives, so it straddles as a live but unsighted hull
  injectShell(w, 'st', 'a', SIGHT - 15, 0, 0, 40); // striking b's near hull, just inside sight
  let found = false;
  for (let i = 0; i < 20 && !found; i++) {
    w.step();
    const fa = cap(g, w, 'a'); // at impact: boom with `hit` stripped
    const fb = cap(g, w, 'b'); // at impact: boom carrying hit === 'b'
    found = fb.events.some((e) => e.k === 'boom' && e.id === 'st');
    prove(
      g,
      'straddle-boom-on-plain-hull',
      found &&
        fa.events.some((e) => e.k === 'boom' && e.id === 'st' && !('hit' in e)) &&
        plainAt(fa, b) !== undefined &&
        !fa.contacts.some((ct) => ct.id === 'b'),
    );
  }
  expect(found).toBe(true); // the hit-stripped straddle boom actually occurred
}

/**
 * Island LOS + the Story 4.11 radar shadow — the fog GEOMETRY bareWorld()
 * deliberately zeroes. SIGHT occlusion still comes from the island POLYGON:
 * one circle sits due east of observer `a`, between it and `b` (inside sight,
 * LOS-blocked -> never a contact), with `c` (inside sight, LOS-clear) the
 * positive control. RADAR occlusion comes from the HEIGHT RASTER (amendment
 * 179): a hard (q255 ≥ mast) ridge is stamped under the island, so `r`
 * (beyond every eye reach behind it) never paints, and neither does `b`
 * (radar's own rule: hard cover darkens it at every range) — while a LOW
 * (q16) ridge on the bearing −FAN leaves `s` (beyond every eye reach, behind
 * it) PARTIALLY illuminated, which DISCLOSES: the genuine widening the ruling
 * accepts, pinned here on the wire. `p` (beyond every eye reach, open water,
 * bearing +FAN, swept) is the clear-water control. Story 11.2: `a` sits at
 * the WEST seat and the three far hulls FAN across due east (the board is
 * narrower than the radar reach), and the rock stands 300 u off so it
 * subtends less than FAN. A wide manual paint window (windowAround-style —
 * set, don't step) exposes every bearing from −FAN to c's at once, so all
 * three radar targets reach the blip row in one frame. Since amendment 210
 * the radar has no inner edge: `c` (sighted, swept, open water) is a contact
 * AND a blip, and `b` stays dark on both sensors (eye: island LOS; radar:
 * hard cover).
 */
function scnIslandLos(g: Golden): void {
  const w = bareWorld(1007);
  const rockX = WEST + 300; // the rock's centre, due east of a
  const lowX = WEST + 200 * Math.cos(FAN); // the low ridge's centre, on the bearing −FAN
  const lowY = -200 * Math.sin(FAN);
  w.map.islands.push(circleIsland(rockX, 0, 30)); // blocks SIGHT due east
  // The raster: hard cover under the island, soft cover on the bearing −FAN.
  w.map.heightRaster = rasterFrom(-WEST, (x, y) => {
    if (Math.abs(x - rockX) <= 30 && Math.abs(y) <= 30) return 255; // hard: dark to the rim
    if (Math.abs(x - lowX) <= 40 && Math.abs(y - lowY) <= 40) return 16; // low: partial illumination
    return 0;
  });
  const far = (brg: number): [number, number] => [WEST + ANNULUS * Math.cos(brg), ANNULUS * Math.sin(brg)];
  place(w, 'a', WEST, 0);
  place(w, 'b', WEST + 600, 0, 1.5); // inside sight, behind the island -> no contact
  place(w, 'c', WEST + 100, 100); // inside sight, LOS-clear -> contact (sight control)
  place(w, 'r', ...far(0)); // radar-only distance, behind hard cover -> no blip
  place(w, 'p', ...far(FAN)); // radar-only distance, open water, swept -> blip (clear control)
  place(w, 's', ...far(-FAN)); // radar-only distance, behind LOW cover -> blip (the 4.11 disclosure)
  const a = w.ships.get('a')!;
  a.prevSweepAngle = wrapPositive(-FAN - 0.05); // window spans bearings −FAN..π/4 inclusive
  a.sweepAngle = Math.PI / 4 + 0.05;
  const f = cap(g, w, 'a');
  const contactIds = f.contacts.map((c) => c.id);
  prove(g, 'island-blocks-sight-contact', !contactIds.includes('b'));
  prove(g, 'island-allows-sight-contact', contactIds.includes('c'));
  prove(g, 'island-blocks-radar-blip', !blipAt(f, ...far(0)));
  prove(g, 'island-allows-radar-blip', blipAt(f, ...far(FAN)));
  prove(g, 'soft-cover-allows-radar-blip', blipAt(f, ...far(-FAN)));
}

/**
 * Non-owner ballistic reveal — a shell AND a torpedo fired by phantom owner
 * `a` OUTSIDE observer `b`'s reveal gate, each closing on b. The gates FORK
 * as of Story 4.9, and each has its OWN eye reach since Story 11.2 (R4): the
 * shell reveals at SHELL_SIGHT (200 hm), the torpedo at TORP_SIGHT (15 hm —
 * a wake just under the surface). At LAUNCH (pre-step) b's frame carries neither. The next tick
 * each crosses ITS OWN boundary, and b's frame reveals both with CURRENT
 * pos/velocity and t = reveal tick (ctx.now), not the hidden launch point or
 * bornAt (=0) — the shell revealing BEYOND the torpedo reach (proving shells
 * were not narrowed) and the torpedo inside it. The next tick — still in flight — b's
 * frame is empty again: exactly-once per observer (seenBallistics). Three
 * consecutive b frames pin all three states (hidden -> revealed -> silent).
 */
function scnBallisticReveal(g: Golden): void {
  const w = bareWorld(1008);
  place(w, 'b', 0, 0); // the lone observer; `a` is a phantom owner (no ship needed)
  injectShell(w, 'sh', 'a', SHELL_SIGHT + 6, 0, Math.PI, 500, 'shell'); // just outside SHELL_SIGHT, closing -x
  injectShell(w, 'tp', 'a', 0, TORP_SIGHT + 6, -Math.PI / 2, 500, 'torp'); // just outside TORP_SIGHT, closing -y
  const pre = cap(g, w, 'b'); // launch tick: neither revealed (each outside its gate)
  prove(g, 'nonowner-hidden-at-launch', !pre.events.some(isBallistic));
  w.step(); // each crosses its own boundary this tick
  const reveal = cap(g, w, 'b');
  const sh = reveal.events.find((e) => e.k === 'shell') as BallisticEvent | undefined;
  const tp = reveal.events.find((e) => e.k === 'torp') as BallisticEvent | undefined;
  const live = w.shells.get('sh')!;
  prove(
    g,
    'nonowner-reveal-current-params',
    !!sh && !!tp && sh.x === live.x && sh.t === w.now && sh.t !== 0,
  );
  // The Story 4.9 fork, proven on the same frame: the shell's reveal point is
  // BEYOND the torpedo reach (a torpedo-gated shell would still be hidden
  // here) and inside its own; the torpedo's is inside the torpedo reach. The
  // band between the two is real again since Story 11.2 (it was empty while
  // detect = sight, 2026-10-08).
  prove(g, 'shell-reveal-at-sight', !!sh && Math.hypot(sh.x, sh.y) <= SHELL_SIGHT && Math.hypot(sh.x, sh.y) > TORP_SIGHT);
  prove(g, 'torp-reveal-inside-detect', !!tp && Math.hypot(tp.x, tp.y) <= TORP_SIGHT);
  w.step(); // still airborne, but already seen
  const after = cap(g, w, 'b');
  prove(g, 'nonowner-reveal-once', !after.events.some(isBallistic));
}

/**
 * Spectator ballistic reveal — the unfogged spectator variants reviewers found
 * untested. Projectile `fly` is launched while `c` is alive but never sights it;
 * c then dies in the active phase and spectates. c's spectator frame reveals
 * `fly` MID-FLIGHT with current params (the sight gate is skipped, but the
 * exactly-once seenBallistics memory still holds — the next spectator frame omits
 * it). The SAME frame also carries a `dmg` for `e` (spectatorPublic passthrough:
 * a dead player may watch a live fight's hp) and a RAW `boom` (spectators get the
 * unstripped event). upg/pt/heal would stay self-private even here; this scenario
 * pins the two self-private exceptions that DO pass to a spectator.
 */
function scnSpectatorBallistic(g: Golden): void {
  const w = bareWorld(1009);
  place(w, 'c', 0, 0); // the soon-to-be spectator
  const e = place(w, 'e', 150, 0); // a live fight c will watch from the afterlife
  e.hp = 100; // survives the hit -> a clean dmg (no sunk)
  injectShell(w, 'hit', 'd', 130, 0, 0, 100, 'shell'); // point-blank on e -> boom + dmg
  // Stays airborne (the reveal subject), launched just outside c's shell
  // sight and opening — a fogged c could never have sighted it.
  const flyAt = (SHELL_SIGHT + 6) * Math.SQRT1_2;
  injectShell(w, 'fly', 'd', flyAt, flyAt, Math.PI / 4, 500, 'shell');
  w.respawnEnabled = false; // active-phase policy: the dead stay dead
  w.sinkShip('c', 'b'); // c dies -> spectates (phantom killer 'b')
  // Story 5.2: spectate begins at founder; stepping the real window would burn
  // the injected shells' whole flight, so take the table edge directly.
  w.ships.get('c')!.lifecycle = transitionLifecycle(w.ships.get('c')!.lifecycle, 'founder', w.now);
  w.step(); // shell strikes e; fly flies on
  const spec = cap(g, w, 'c', 'active'); // spectator: fly reveal + dmg(e) + raw boom
  prove(g, 'spectator-ballistic-reveal', spec.events.some((ev) => ev.k === 'shell' && ev.id === 'fly'));
  prove(g, 'spectator-dmg-passthrough', spec.events.some((ev) => ev.k === 'dmg' && ev.id === 'e'));
  prove(g, 'spectator-raw-boom', spec.events.some((ev) => ev.k === 'boom' && ev.id === 'hit') && spec.spec === true);
  w.step(); // fly still airborne but already revealed
  const again = cap(g, w, 'c', 'active');
  prove(g, 'spectator-reveal-once', !again.events.some((ev) => ev.k === 'shell' && ev.id === 'fly'));
}

/**
 * burst channel (Story 1.4) — a REAL gun click: the shell spawns at a's hull
 * silhouette edge, flies to the clicked point (b's position, 120u out), and
 * bursts there via the proximity rule (b's hull contains the target point).
 * b takes the full burst damage as a victim-private dmg; both observers see
 * the burst event as the bare {k,id,x,y} shape.
 */
function scnBurst(g: Golden): void {
  const w = bareWorld(1010);
  place(w, 'a', 0, 0);
  const b = place(w, 'b', 120, 0);
  b.hp = 100; // survives the 25 burst — a clean dmg, no sunk
  w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 120, slot: 0, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false });
  let burst = false;
  for (let i = 0; i < 30 && !burst; i++) {
    w.step();
    const fa = cap(g, w, 'a');
    cap(g, w, 'b');
    burst = fa.events.some((e) => e.k === 'burst');
  }
  expect(burst).toBe(true); // the burst actually landed in the fixture
}

/**
 * Star-shell lit zone (Story 1.7) — a REAL battleship flare fired via the
 * input channel: the shell flies to the clicked point (SIGHT+80 out —
 * comfortably beyond the firer's sight bubble) and bursts, spawning the
 * litRadius/10s zone. Captures pin all four zone views in one deterministic
 * pass: the FIRER's frame (zone circle + the hull `h` revealed as a full
 * contact by owned-zone truesight parity — since Story 11.2 `h` sits in the
 * firer's PLAIN band, so the zone LIFTS a `pc` row to a full contact and the
 * two lists never both hold it), a third party `c` sitting EXACTLY at radar
 * range of the zone center (the tagged {id,x,y,r,until,by} circle —
 * boundary-inclusive — and NO contact for `h`), a beyond-radar observer `d`
 * whose frame stays byte-free of the zone, and the FIRER again after natural
 * expiry (zone gone, `h` a plain hull once more). The board is narrower than
 * the radar reach, so `c` and `d` sit due WEST of the zone, on the far side
 * of the firer. Intermediate flight
 * ticks are stepped without frame builds — the fixture pins the launch tick,
 * the burst tick, and expiry.
 */
function scnStarShell(g: Golden): void {
  const w = bareWorld(1011);
  const flareDist = SIGHT + 80; // clicked burst point, comfortably beyond a's sight bubble
  place(w, 'a', 0, 0, 0, 'yamato'); // the firer
  const h = place(w, 'h', flareDist, 40, 1.1); // inside the future zone, beyond a's sight (a plain hull to a)
  // dist to zone center = radar EXACTLY — at radar range. (The round trip
  // flareDist − (flareDist − RADAR) is exact in doubles: the rounding of the
  // inner difference is under half an ulp of RADAR.)
  place(w, 'c', flareDist - RADAR, 0);
  place(w, 'd', flareDist - BEYOND_RADAR, 0); // dist to zone center (flareDist,0) > radar — beyond radar
  // Story 8.5: the Battleship's seed fits `broadside` into weapon slot 2 and
  // `starShells` into 3.
  w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: flareDist, slot: FAMILY_SLOT.shell, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false });
  w.step(); // consumes the click; the flare spawns and starts flying
  const launch = cap(g, w, 'a'); // launch tick: own shell reveal, no zone yet
  let zoneUp = false;
  for (let i = 0; i < flightTicks(flareDist, CONFIG.starShells.shellSpeed) && !zoneUp; i++) {
    w.step();
    zoneUp = w.litZones.size > 0;
  }
  expect(zoneUp).toBe(true); // the flare actually burst in the fixture
  const fa = cap(g, w, 'a'); // burst tick: burst event + zone + h revealed
  prove(
    g,
    'litzone-firer-reveal',
    fa.contacts.some((x) => x.id === 'h') && (fa.litZones ?? []).some((z) => z.by === 'a'),
  );
  const fc = cap(g, w, 'c'); // radar-range third party: circle only
  prove(
    g,
    'litzone-thirdparty-radar-circle',
    (fc.litZones ?? []).some((z) => z.by === 'a') && !fc.contacts.some((x) => x.id === 'h'),
  );
  const fd = cap(g, w, 'd'); // beyond radar: byte-free of the zone
  prove(g, 'litzone-beyond-radar-silent', !('litZones' in fd));
  // Natural expiry: run out the 10s lifetime, then the firer is fogged again.
  const steps = Math.ceil(CONFIG.starShells.litDurationMs / DT) + 1;
  for (let i = 0; i < steps; i++) w.step();
  const after = cap(g, w, 'a');
  prove(
    g,
    'litzone-expiry',
    w.litZones.size === 0 && !('litZones' in after) && !after.contacts.some((x) => x.id === 'h'),
  );
  // The zone LIFTS the plain hull: a `pc` row before the burst, a full
  // contact (and no `pc` row) under the zone, a `pc` row again after expiry.
  prove(
    g,
    'litzone-lifts-plain-to-contact',
    plainAt(launch, h) !== undefined && !launch.contacts.some((x) => x.id === 'h') &&
      plainAt(fa, h) === undefined && fa.contacts.some((x) => x.id === 'h') &&
      plainAt(after, h) !== undefined,
  );
}

/**
 * A kill INSIDE an owned lit zone (Story 1.7 zone event parity) — the zone and
 * the killing shell are injected directly (mines precedent; the real flare
 * flow is scnStarShell's job). Observer `a` owns a zone beyond every eye reach
 * it has (the splash reach included, Story 11.2 — so the zone alone carries
 * the boom, the victim id and the `seen` stamp);
 * its shell strikes `b` inside the zone. Pre-parity, a's frame carried NO boom
 * (owner hit-confirmation suppression) and NO sunk; under the owned zone the
 * boom arrives WITH the victim id (center zone-covered) and the sunk arrives
 * too — while dmg stays victim-private even here.
 */
function scnZoneKill(g: Golden): void {
  const w = bareWorld(1012);
  const bx = WEST + ANNULUS;
  place(w, 'a', WEST, 0);
  const b = place(w, 'b', bx, 0);
  b.hp = 1; // any landed blow sinks it (a blow settles to at least 1 — Story 10.3/10.4)
  w.litZones.set('z1', { id: 'z1', ownerId: 'a', x: bx, y: 0, r: CONFIG.starShells.litRadius, until: 999_999 });
  injectShell(w, 'ks', 'a', bx - 20, 0, 0, 100); // a's shell, point-blank on b, beyond every eye reach of a
  w.step(); // strikes b -> boom + dmg (victim-private) + sunk + pt
  const fa = cap(g, w, 'a');
  prove(g, 'litzone-boom-victim-id', fa.events.some((e) => e.k === 'boom' && e.hit === 'b'));
  prove(
    g,
    'litzone-sunk-reveal',
    fa.events.some((e) => e.k === 'sunk' && e.id === 'b' && e.seen === true) && !fa.events.some((e) => e.k === 'dmg'),
  );
}

/**
 * Mine Layer trip blast — a REAL aimed placement through the fire channel
 * (Story 2.8, amendment 45): ML `a` clicks a mine 76u astern; enemies `b` (the
 * tripper) and `c` sit so the armed mine's 48u BLAST covers both hulls while
 * `a`'s own hull is inside the radius too (owner-excluded by rule). At the
 * trip: ONE boom at the mine with `hit` = the tripper, full damage to b AND c
 * (each victim-private), none to a. Captures pin the post-placement own-mine
 * frame and the blast tick for both the owner and the tripping victim.
 */
function scnMineBlast(g: Golden): void {
  const w = bareWorld(1013);
  const a = place(w, 'a', 0, 0, 0, 'warspite');
  const b = place(w, 'b', -76, 20); // hull beside the future clicked point (clear of a's hull — Story 10.4 beams) — trips it
  const c = place(w, 'c', -76, -40); // second victim: hull within the 48u blast
  w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: Math.PI, fireSeq: 1, aimDist: 76, slot: FAMILY_SLOT.mine, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false });
  w.step(); // the click places the mine at the clicked point (weapon channel)
  expect(w.mines.size).toBe(1);
  cap(g, w, 'a'); // own mine view + spawns/contacts
  let boom = false;
  for (let i = 0; i < 80 && !boom; i++) {
    w.step(); // arm delay runs out, then the pass-over trips the blast
    boom = w.tickEvents.some((e) => e.k === 'boom');
  }
  expect(boom).toBe(true);
  cap(g, w, 'a'); // blast tick, owner's view: boom with hit (victim sighted)
  cap(g, w, 'b'); // blast tick, tripper's view: boom + its own dmg
  // Both victims sail the same hull and took the ONE armor-folded blast
  // (Story 10.3): equal, real damage; the owner none.
  prove(
    g,
    'mine-trip-blast-multivictim',
    w.mines.size === 0 &&
      b.hp === c.hp &&
      b.hp < b.stats.maxHp &&
      a.hp === a.stats.maxHp,
  );
}

/**
 * Owner mine detonation (Story 1.8; Story 10.4 — the SECONDARIES are the only
 * captain weapon that hurts a mine, R3) — `a` holds its secondaries on its
 * own ARMED mine (injected, mines precedent): the rounds LAND on its marker,
 * each taking its damage off the mine's hp (amendment 200), and once the hp
 * is spent it pops as a plain blast at the MINE's position whose boom
 * carries NO victim id (no tripping ship).
 */
function scnMineBurstDetonation(g: Golden): void {
  const w = bareWorld(1014);
  const a = place(w, 'a', 0, 0, 0, 'warspite');
  injectMine(w, 'om', 'a', 300, 0); // a's own armed mine, up-range (inside the secondaries' reach)
  w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 300, slot: 0, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: true });
  let detonated = false;
  for (let i = 0; i < 60 && !detonated; i++) {
    w.step();
    detonated = w.tickEvents.some((e) => e.k === 'boom' && e.id === 'om');
    cap(g, w, 'a'); // flight frames (shell reveal + own mine view), then the detonation tick
  }
  const boom = w.tickEvents.find((e) => e.k === 'boom' && e.id === 'om');
  prove(
    g,
    'mine-burst-detonation',
    detonated && w.mines.size === 0 && boom !== undefined && !('hit' in boom) && a.hp === a.stats.maxHp,
  );
}

/* RETIRED (Story 7-5 wave 2): `scnDecoy`, the decoy-buoy lifecycle scenario
 * (owner truth view / third-party counter-intel blip / truesight unmasking /
 * natural expiry). All four sub-cases assert about a deleted entity and a
 * deleted wire channel. The RADAR BUOY replacing it gets its OWN scenario
 * when it is built — its rules are not the decoy's. */

/**
 * Denial channel (Story 1.10) — every wire reason through the REAL input
 * path, pinned byte-for-byte in the fixture: an astern torpedo click
 * ('out-of-arc'), a gun click mid-cooldown ('cooling'), an ability double
 * press ('no-ammo'), and an island-backed ML MINE CLICK ('blocked'). That
 * last one was the DECOY's un-aimed stern drop until Story 7-5 wave 2 deleted
 * the decoy; the mine's click is the surviving 'blocked' producer and lands
 * at the same rock, so the scenario's fog geometry is unchanged.
 * Denials are SELF-PRIVATE:
 * sighted observer `b` captures the same tick byte-free of the channel. When
 * a weapon click AND an ability press deny on the same tick, the weapon
 * denial rides first (fireControl runs before activationControl — the step
 * order is the wire order).
 */
function scnDenied(g: Golden): void {
  const w = bareWorld(1016);
  place(w, 'a', 0, 0, 0); // TB: gun / boost / heavyTorpedo (Story 8.5)
  place(w, 'b', 120, 0); // sighted second captain — proves owner-only
  const m = place(w, 'm', 400, 0, 0, 'warspite'); // stern rack drops at (324, 0)
  w.map.islands.push(circleIsland(324, 0, 20)); // the rock behind m's stern
  // Story 4.11: give the rock its raster presence (hard cover), so the
  // scenario's fog geometry is unchanged — without it the polygon would still
  // block the drop but m would now PAINT on a's radar through it.
  w.map.heightRaster = rasterFrom(700, ridgeField(324, 0, 20, 20, 255));
  // Tick 1: a clicks the torpedo dead astern; m clicks a MINE into the rock.
  w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: Math.PI, fireSeq: 1, aimDist: 300, slot: 2, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false });
  w.submitInput('m', { seq: 1, throttle: 0, rudder: 0, aim: Math.PI, fireSeq: 1, aimDist: 76, slot: FAMILY_SLOT.mine, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false });
  w.step();
  const fa1 = cap(g, w, 'a');
  const fm1 = cap(g, w, 'm');
  const fb1 = cap(g, w, 'b');
  prove(
    g,
    'denied-out-of-arc-owner-only',
    (fa1.denied ?? []).some((d) => d.reason === 'out-of-arc' && d.slot === 2 && d.seq === 1) &&
      !('denied' in fb1),
  );
  prove(g, 'denied-blocked-mine-click', (fm1.denied ?? []).some((d) => d.reason === 'blocked' && d.slot === FAMILY_SLOT.mine) && w.mines.size === 0);
  // Tick 2: a fires the main battery (spends ONE turret) + activates the boost
  // (spends the charge).
  const aRec = w.ships.get('a')!;
  w.submitInput('a', { seq: 2, throttle: 0, rudder: 0, aim: 0, fireSeq: 2, aimDist: 100, slot: 0, fireT: 0, actSeq: 1, act: 0, hornSeq: 0, held: false, sec: false });
  w.step();
  const salvoFrames: FrameMsg[] = [cap(g, w, 'a')]; // no denial: the shell reveal + a clean frame
  // Story 10.4: every OTHER turret whose arc holds the aim is ready, so each
  // further click fires one; spend them, one click per tick. ARC-ONLY FIRE
  // (Eric 2026-11-05, epic-10 amendment 10): the aim is dead ahead, so only the
  // forward turrets bear — the aft turrets stay loaded and are never spent.
  const bearingTurrets = aRec.turrets.filter((_, i) => turretBears(aRec.hullId, i, aRec.state, aimPointOf(aRec.state, 0, 100))).length;
  let seq = 3;
  let fireSeq = 3;
  for (let k = 1; k < bearingTurrets; k++) {
    w.submitInput('a', { seq: seq++, throttle: 0, rudder: 0, aim: 0, fireSeq: fireSeq++, aimDist: 100, slot: 0, fireT: 0, actSeq: 1, act: 0, hornSeq: 0, held: false, sec: false });
    w.step();
    salvoFrames.push(cap(g, w, 'a'));
  }
  // The denial tick: both channels re-press — the main battery with only
  // non-bearing (aft) turrets loaded, which is the `cooling` refusal.
  const deniedSeq = fireSeq;
  w.submitInput('a', { seq: seq++, throttle: 0, rudder: 0, aim: 0, fireSeq: deniedSeq, aimDist: 100, slot: 0, fireT: 0, actSeq: 2, act: 0, hornSeq: 0, held: false, sec: false });
  w.step();
  const fa3 = cap(g, w, 'a');
  prove(g, 'denied-cooling-weapon', (fa3.denied ?? [])[0]?.reason === 'cooling' && (fa3.denied ?? [])[0]?.seq === deniedSeq);
  prove(g, 'denied-noammo-ability', (fa3.denied ?? [])[1]?.reason === 'no-ammo' && (fa3.denied ?? [])[1]?.slot === 1);
  // The tick-2 salvo terminates on b: the burst + hc terminal frame this
  // scenario always pinned (Story 9.12 review gate), on whichever captured
  // tick it lands now that the turrets were spent one click per tick.
  salvoFrames.push(fa3);
  const terminated = (): boolean =>
    salvoFrames.some((f) => f.events.some((e) => e.k === 'burst') && f.events.some((e) => e.k === 'hc' && e.id === 'a'));
  for (let i = 0; i < 20 && !terminated(); i++) {
    w.step();
    salvoFrames.push(cap(g, w, 'a'));
  }
  prove(g, 'denied-gun-shells-terminate', terminated());
}

/**
 * Homing-track updates (Story 2.8, 'torpU'): TB `a` holds a TIER II heavy
 * torpedo (Story 8.13: ACOUSTIC HOMING is deleted and homing is a TIER STAT —
 * the class-weapon copy is tier I, a straight-runner; the SECOND `heavyTorpedo`
 * card lifts the row to tier II, +0.125 rad/s of steering) and fires past an
 * off-axis enemy; sighted observer `c` gets the once-per-visit 'torp' reveal
 * and then ≥1 'torpU' as the fish steers (the reveal convention relaxes for
 * updates alone), while far observer `d` never gets a byte of either. Frames
 * are captured every tick for both observers — the update cadence itself
 * (CONFIG.torpedo.homingUpdateAngleDeg over the seeded steering) is pinned by
 * the snapshot. The tier-II fish is slow (47.5 u/s) and turns gently, so the
 * target sits nearer than the 2.8 fixture's and the run is longer.
 */
function scnHoming(g: Golden): void {
  const w = bareWorld(1017);
  // R28 (Eric 2026-11-06): the launchers fire across the beam, never dead
  // ahead — the shooter lies with +x on its STARBOARD beam (heading −π/2), its
  // fore launcher already trained there.
  // Story 11.2: the action sits at the west of the board (the torpedo runs
  // east, toward the middle) so the far observer can be beyond radar of every
  // hull in it — BEYOND_RADAR east of `c`, the easternmost of the three.
  const spanU = 250; // a..c, west to east
  const x0 = -(BEYOND_RADAR + spanU) / 2;
  const a = place(w, 'a', x0, 0, -Math.PI / 2);
  w.applyCard(a, 'heavyTorpedo'); // the second copy: tier II — the fish homes
  for (const l of a.launchers) l.a = Math.PI / 2;
  place(w, 'b', x0 + 200, 60); // the torpedo acquires and steers toward this hull mid-flight
  const c = place(w, 'c', x0 + spanU, -60); // torpedo sight covers the turning stretch
  const d = place(w, 'd', x0 + spanU + BEYOND_RADAR, 0); // beyond every eye reach AND the radar of every hull
  for (const s of [c, d]) {
    s.prevSweepAngle = Math.PI; // park the beams away from the action
    s.sweepAngle = Math.PI + 1e-4;
  }
  w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 300, slot: 2, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false });
  let cReveals = 0;
  let cUpdates = 0;
  let dBytes = 0;
  for (let i = 0; i < 90; i++) {
    w.step();
    const fc = cap(g, w, 'c');
    cReveals += fc.events.filter((e) => e.k === 'torp').length;
    cUpdates += fc.events.filter((e) => e.k === 'torpU').length;
    const fd = buildFrame(w, 'd'); // NOT recorded — only proven silent
    dBytes += fd.events.filter((e) => e.k === 'torp' || e.k === 'torpU').length;
    if (i > 2 && w.shells.size === 0) break;
  }
  prove(g, 'torpu-sighted-update', cReveals === 1 && cUpdates >= 1);
  prove(g, 'torpu-unsighted-silent', dBytes === 0);
}

/**
 * Debuff privacy (Story 2.8): a FOULING blast stamps the victim's slowedUntil
 * (and its depth, slowFactor) — each rides `you` on the victim's own frame
 * ONLY (the boostUntil precedent); a sighted watcher's contact for the victim
 * carries neither key. (The FLASH SHELLS `dazzledUntil` arm this scenario
 * carried from Story 8.17 left with the mark in Story 9.4; the FOULING
 * SHELL's `fouledUntil` is pinned victim-private in foulingShell.test.ts and
 * by the perception fuzz, not here.) Since Story 8.13 the fouling mine is its own
 * LINE (`foulingMines`, equipment) and the laid mine carries `kind: 'fouling'`
 * — the readers key off the mine's kind, and the owner's fitted row supplies
 * the blast's numbers.
 */
function scnDebuffs(g: Golden): void {
  const w = bareWorld(1018);
  const o = place(w, 'o', 600, 600, 0, 'warspite');
  w.applyCard(o, 'foulingMines');
  const b = place(w, 'b', 0, 10); // trips the fouling mine below on the first step
  place(w, 'watcher', 100, 60); // sees b as a contact
  injectMine(w, 'fm', 'o', 0, 0, 'fouling');
  w.step(); // the blast lands on b
  const fb = cap(g, w, 'b');
  const fw = cap(g, w, 'watcher');
  const contact = fw.contacts.find((ct) => ct.id === 'b');
  prove(
    g,
    'slowed-victim-private',
    fb.you!.slowedUntil === b.slowedUntil && b.slowedUntil > 0 &&
      contact !== undefined && !('slowedUntil' in contact) && fw.you!.slowedUntil === undefined,
  );
  // THE DEPTH OF THE FOULING rides with the clock and on the same terms (Story
  // 8.13, epic-8 amendment 86): the LAYER's tiered factor reaches the VICTIM's
  // own ship and nothing else. A KEY test on the observer side — a
  // present-but-undefined key would still be a structural tell.
  prove(
    g,
    'slow-factor-victim-private',
    fb.you!.slowFactor === b.slowFactor && b.slowFactor < 1 &&
      contact !== undefined && !('slowFactor' in contact) && !('slowFactor' in fw.you!),
  );
}

/**
 * The gunnery conversation (Story 4.3; the halo is its own fact since Story
 * 11.2 — CONFIG.vision.muzzleFlash, 350 hm) — a REAL gun click driving all
 * three channels through the wire. Shooter `a` sits at the WEST seat, bow 45°
 * off due east, and fires due east into empty water at SHOT — beyond every
 * eye reach it has and inside its guns' reach: on the launch tick the muzzle
 * flash `mz` reaches o1 (300u from the shooter — unambiguously inside the
 * halo), never o2 (150u past the halo) and never o3 (300u but
 * island-blocked: islands block every sensor at all ranges); on the burst
 * tick the shooter alone receives the self-private fall-of-shot `sp` at the
 * true burst point (o1, captured the same tick, gets neither sp nor burst —
 * it sits 300u BEHIND the line of fire, so the point is beyond its splash
 * reach). A torpedo launch next proves the quiet weapon: o1's frame carries
 * NO mz (amendment 20). After the gun reload, a second click centered on
 * fogged hull `b` (SHOT out on the bearing −FAN — beyond every eye reach, no
 * boom rides a burst outcome) delivers exactly one Hit Call `hc` carrying
 * only {k,id,x,y} with id = the SHOOTER — no victim id, no severity, and no
 * sp for the same shell.
 */
function scnGunnery(g: Golden): void {
  const w = bareWorld(1019);
  w.map.islands.push(circleIsland(WEST, -200, 40)); // the o3 LOS blocker, due south
  const a = place(w, 'a', WEST, 0, -Math.PI / 4); // the shooter
  // Beyond every eye reach of the shooter, inside its main battery's reach.
  const SHOT = (EYE + a.stats.equipment.mainBattery.rangeU) / 2;
  const speed = CONFIG.mainBattery.shellSpeed;
  place(w, 'o1', WEST - 300, 0); // unambiguously inside the muzzle halo, behind the line of fire
  place(w, 'o2', WEST + (FLASH + 150) * Math.cos(FAN), (FLASH + 150) * Math.sin(FAN)); // beyond the halo
  place(w, 'o3', WEST, -300); // inside the halo but behind the island
  place(w, 'b', WEST + SHOT * Math.cos(-FAN), SHOT * Math.sin(-FAN)); // the fogged victim of the second shot
  // Shot 1 — a miss into empty water due east (45° off the bow, clear of the
  // island), bursting beyond o1's splash reach.
  holdAim(w, 'a', 1, 0, SHOT);
  w.submitInput('a', { seq: 2, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: SHOT, slot: 0, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false });
  w.step(); // the click fires: mz + shell reveal ride this tick
  cap(g, w, 'a'); // shooter: own mz + own shell reveal
  const fo1 = cap(g, w, 'o1');
  const fo2 = cap(g, w, 'o2');
  const fo3 = cap(g, w, 'o3');
  prove(g, 'muzzle-flash-inside-halo', fo1.events.some((e) => e.k === 'mz'));
  prove(g, 'muzzle-flash-beyond-halo-silent', !fo2.events.some((e) => e.k === 'mz'));
  prove(g, 'muzzle-flash-island-blocked', !fo3.events.some((e) => e.k === 'mz'));
  // Flight to the burst (no frame builds), then the burst/splash tick.
  let burst = false;
  for (let i = 0; i < flightTicks(SHOT, speed) && !burst; i++) {
    w.step();
    burst = w.tickEvents.some((e) => e.k === 'burst');
  }
  expect(burst).toBe(true);
  const faMiss = cap(g, w, 'a');
  const fo1Miss = cap(g, w, 'o1'); // same tick: the splash is SELF-private
  prove(
    g,
    'gunnery-miss-own-splash',
    faMiss.events.some((e) => e.k === 'sp' && e.id === 'a') &&
      !fo1Miss.events.some((e) => e.k === 'sp' || e.k === 'burst'),
  );
  // The torpedo launch — the ratified quiet weapon: no mz for anyone. R28: it
  // fires along shot 1's bearing (45° off the bow, inside the fore launcher's
  // band) — dead ahead is refused.
  w.submitInput('a', { seq: 3, throttle: 0, rudder: 0, aim: 0, fireSeq: 2, aimDist: 300, slot: 2, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false });
  w.step();
  cap(g, w, 'a'); // own torp reveal, no mz
  const fo1Torp = cap(g, w, 'o1');
  prove(g, 'torpedo-launch-no-muzzle', w.shells.size === 1 && !fo1Torp.events.some((e) => e.k === 'mz'));
  // Ride out a turret reload while training onto b, then shot 2 — centered
  // on the fogged hull b.
  const reloadTicks = Math.ceil(CONFIG.mainBattery.reloadMs / DT) + 1;
  for (let i = 0; i < reloadTicks; i++) w.step();
  holdAim(w, 'a', 4, -FAN, SHOT);
  w.submitInput('a', { seq: 5, throttle: 0, rudder: 0, aim: -FAN, fireSeq: 3, aimDist: SHOT, slot: 0, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false });
  let hit = false;
  for (let i = 0; i < flightTicks(SHOT, speed) && !hit; i++) {
    w.step();
    hit = w.tickEvents.some((e) => e.k === 'hc');
  }
  expect(hit).toBe(true);
  const faHit = cap(g, w, 'a');
  const hc = faHit.events.find((e): e is HitCallEvent => e.k === 'hc');
  prove(
    g,
    'gunnery-hitcall-beyond-sight',
    hc !== undefined &&
      Object.keys(hc).join(',') === 'k,id,x,y' && // NO victim id / severity field anywhere in it
      hc.id === 'a' && // the SHOOTER's id — never the victim's
      !faHit.contacts.some((c) => c.id === 'b') && // b really is fogged...
      !('pc' in faHit) && // ...to BOTH sight tiers: not even a plain hull
      !faHit.events.some((e) => e.k === 'sp'), // exactly one of hc/sp per shell
  );
}

/** One tick: no traverse since Story 11.1 (R16) — the step sets the derived angle. */
const SETTLE_TICKS = 1;

/** Story 10.4: hold `aim` / `aimDist` (no click) until every turret that can
 *  bear points at it. Consumes input seq `seq`. */
function holdAim(w: World, id: string, seq: number, aim: number, aimDist: number): void {
  const fireSeq = w.ships.get(id)!.lastFireSeq;
  w.submitInput(id, { seq, throttle: 0, rudder: 0, aim, fireSeq, aimDist, slot: 0, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false });
  for (let i = 0; i < SETTLE_TICKS; i++) w.step();
}

/* RETIRED (Story 7-5 wave 2): `scnGunneryDecoy` — "shooting a decoy produces
 * no Hit Call". The buoy it shot at no longer exists. The RULE it illustrated
 * is untouched and still holds BY CONSTRUCTION (`hc` is keyed off victim
 * resolution, and a non-collision-subject resolves none — see the `hc` row's
 * comment in signals.ts); the shooter's own-miss splash is still pinned by
 * `gunnery-miss-own-splash`. */

/**
 * HULL REPAIR on the wire (Eric rulings 2026-08-04; the `C` cooldown ability
 * since Story 10.5): `a` takes damage and PRESSES HULL REPAIR. Its own
 * frame carries the self-private `heal` event and a live `you.repairHp`; `b` —
 * a sighted neighbour hull-to-hull with it — gets NEITHER, and the string
 * `repairHp` appears nowhere in b's serialized frame. A later frame proves the
 * pool visibly drains on the wire without any further event.
 */
function scnHeal(g: Golden): void {
  const w = bareWorld(1021);
  const a = place(w, 'a', 0, 0);
  place(w, 'b', 60, 0); // hull-to-hull: fully sighted, and still told nothing
  a.hp -= 60;
  w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 1, act: abilityCode('repair'), hornSeq: 0, held: false, sec: false });
  w.step();
  const fa = cap(g, w, 'a');
  const fb = cap(g, w, 'b');
  prove(
    g,
    'heal-event-healer-only',
    fa.events.some((e) => e.k === 'heal' && e.id === 'a') && !fb.events.some((e) => e.k === 'heal'),
  );
  prove(
    g,
    'heal-repairhp-never-off-you',
    fa.you!.repairHp > 0 && !JSON.stringify({ ...fb, you: undefined }).includes('repairHp'),
  );
  const poolAfterSpend = fa.you!.repairHp;
  w.step();
  w.step();
  const fa2 = cap(g, w, 'a');
  prove(
    g,
    'heal-pool-drains-on-the-wire',
    fa2.you!.repairHp < poolAfterSpend && !fa2.events.some((e) => e.k === 'heal'),
  );
}

/**
 * RADAR WAKES on the wire (Story 4.12, amendments 194-196/200): a
 * deterministic laid track through a's radar range discloses as `wk`
 * events — geometry plus a water-age bucket and NOTHING else — after the
 * hull that laid it SINKS, and still after its record leaves the room
 * entirely (amendment 200: water outlives its ship). A torpedo-laid ribbon
 * on the same wedge paints on the half-life clock while no torp event
 * exists. Water inside a's sight bubble discloses like any radar return
 * (amendment 210: no inner bound), and no wk payload key carries identity.
 * Story 11.2: `a` sits at the WEST seat and the far run lies ANNULUS east of
 * it — beyond every eye reach, inside the radar rim.
 */
function scnWake(g: Golden): void {
  const w = bareWorld(1022);
  const a = place(w, 'a', WEST, 0);
  const b = place(w, 'b', 900, 900); // its WATER is under test, not its hull
  // b's laid track along y=0 (raw ring injection — fixed poses, fixed ages):
  // two in-sight samples (200, 212 east of a), then a radar-only run
  // ANNULUS..+48 east of a (Story 11.2: beyond every eye reach, inside the
  // radar rim), ages spread so multiple quarter-life buckets ride the wire. The
  // ages sit INSIDE the torpedo boat's 5.5 s water life (epic-4 amendment 213 cut it
  // from 12 s; the old 11.6 s ages had silently expired the in-sight samples,
  // leaving the bubble proof vacuous).
  const xs = [200, 212, ANNULUS, ANNULUS + 12, ANNULUS + 24, ANNULUS + 36, ANNULUS + 48].map((dx) => WEST + dx);
  const ages = [5_300, 5_200, 5_000, 4_000, 2_800, 1_200, 0];
  for (let i = 0; i < xs.length; i++) {
    b.wake.xs[i] = xs[i];
    b.wake.ys[i] = 0;
    b.wake.ts[i] = w.now - ages[i];
  }
  b.wake.head = 0;
  b.wake.count = xs.length;
  // A torpedo's water: half-life (6000ms), one-cell (9u) ribbon at y=6.
  const torp: WakeRibbon = { xs: new Float64Array(8), ys: new Float64Array(8), ts: new Float64Array(8), cap: 8, head: 0, count: 0, lifeMs: 6_000, widthU: 9, torp: true, hullAheadU: 0 };
  for (let i = 0; i < 5; i++) {
    torp.xs[i] = WEST + ANNULUS + 100 + 12 * i; // beyond every eye reach, inside the radar rim
    torp.ys[i] = 6;
    torp.ts[i] = w.now - (4 - i) * 1_200;
  }
  torp.count = 5;
  w.torpWakes.set('fish', torp);
  w.respawnEnabled = false; // active-phase policy: the dead stay dead
  w.sinkShip('b');
  // Story 5.2: a SINKING b would still lay wake (the motion seam) and chain a
  // bogus (last sample)→(900,900) segment onto the injected fixture ring — this
  // scenario is about a WRECK's water, so founder it before the step.
  w.ships.get('b')!.lifecycle = transitionLifecycle(w.ships.get('b')!.lifecycle, 'founder', w.now);
  w.step();
  // Open a's paint window across both tracks' bearings (0 .. ~0.012 rad).
  a.prevSweepAngle = wrapPositive(-0.005);
  a.sweepAngle = wrapPositive(0.03);
  const covers = (e: WakeBlipEvent, x: number, y: number): boolean =>
    coverageHas(e, Math.floor(x / CONFIG.vision.radarCellU) - e.gx, Math.floor(y / CONFIG.vision.radarCellU) - e.gy);
  const fa = cap(g, w, 'a');
  const wks = fa.events.filter((e): e is WakeBlipEvent => e.k === 'wk');
  prove(g, 'wake-outlives-ship', wks.length > 0 && !isAfloat(w.ships.get('b')!.lifecycle));
  prove(
    g,
    'wake-identity-free',
    wks.length > 0 && wks.every((e) => Object.keys(e).join(',') === 'k,t,a,gx,gy,w,h,bits'),
  );
  prove(g, 'wake-sight-bubble-disclosed', wks.some((e) => covers(e, WEST + 206, 0)));
  prove(
    g,
    'wake-torpedo-ribbon',
    wks.some((e) => covers(e, WEST + ANNULUS + 130, 6)) && !fa.events.some((e) => e.k === 'torp'),
  );
  // The record leaves the room entirely: the orphaned water still paints.
  w.removeShip('b');
  a.prevSweepAngle = wrapPositive(-0.005);
  a.sweepAngle = wrapPositive(0.03);
  const fa2 = cap(g, w, 'a');
  prove(
    g,
    'wake-outlives-removal',
    fa2.events.filter((e) => e.k === 'wk').length > 0 && !w.ships.has('b'),
  );
}

// ---------- the fixture -------------------------------------------------------

/**
 * The straight-runner re-reveal (Story 8.13, epic-8 amendment 78): observer
 * `b` is revealed a torpedo at the torpedo-sight ring, the gate then SHRINKS
 * under it for one tick, and when sight returns the torpedo is revealed AGAIN
 * with current pos/velocity and `t` = the re-reveal time, in the unchanged
 * {k,id,x,y,vx,vy,t} shape. Nothing is emitted while outside. Frames captured
 * every tick, so the snapshot pins the silent tick too.
 *
 * THE SHRINK IS THE REAL WHITEOUT MARK AGAIN (Story 11.2): the torpedo's eye
 * reach is a CONFIG fact now (`torpedoSight`), not a stat, so Story 9.4's
 * plain `stats.sightRange` write no longer moves this gate. The one thing
 * that does is the FLASH SHELLS mark (`dazzledUntil`, restored by Story
 * 10.9): every eye reach is 0 through the whiteout's ramp. The mark is set
 * for exactly the silent tick and cleared, so that ONE frame's `you` carries
 * `dazzledUntil` (the self-private key every flashed hull's own frame has).
 */
function scnTorpReReveal(g: Golden): void {
  const w = bareWorld(1021);
  const b = place(w, 'b', 0, 0); // the lone observer; `a` is a phantom owner
  injectShell(w, 'tp', 'a', TORP_SIGHT + 6, 0, Math.PI, 5_000, 'torp'); // just outside TORP_SIGHT, closing -x at 25u/tick
  cap(g, w, 'b'); // launch tick: hidden
  w.step();
  const first = cap(g, w, 'b'); // crosses the ring: revealed (TORP_SIGHT − 19u out)
  const one = first.events.find((e) => e.k === 'torp') as BallisticEvent | undefined;
  b.dazzledUntil = w.now + FLASH_WINDOW_MS; // flashed for exactly the next frame: every eye reach is 0 in the ramp
  w.step();
  const shrunk = cap(g, w, 'b'); // TORP_SIGHT − 44u out: OUTSIDE the whited-out reach — silent, mark cleared
  prove(g, 'torp-re-reveal-silent-outside', !!one && !shrunk.events.some(isBallistic) && !b.seenBallistics.has('tp'));
  b.dazzledUntil = 0; // sight back
  w.step();
  const again = cap(g, w, 'b'); // TORP_SIGHT − 69u out: INSIDE again — revealed again
  const two = again.events.find((e) => e.k === 'torp') as BallisticEvent | undefined;
  const live = w.shells.get('tp')!;
  prove(
    g,
    'torp-re-reveal',
    !!one && !!two && two.id === one.id && two.x === live.x && two.vx === live.vx && two.t === w.now && two.t > one.t &&
      Math.hypot(two.x, two.y) <= TORP_SIGHT && Object.keys(two).join() === 'k,id,x,y,vx,vy,t',
  );
  w.step();
  const after = cap(g, w, 'b'); // inside and marked: silent once more
  prove(g, 'nonowner-reveal-once', !after.events.some(isBallistic));
}

/**
 * The mine kind for EVERY observer (Eric 2026-10-01, cycle 162, PV 68 —
 * superseding Story 8.13's own-only rule, epic-8 amendment 76): Mine Layer `o`
 * holds all three mine lines and has one of each kind in the water; `o`'s own
 * frame carries `c` on every mine (naval / captive / fouling), AND enemy `a`,
 * who has all three inside its mine sight, receives the kind on every row too — LAST, after
 * `by`, so the historical prefix stays byte-stable. Both frames are captured,
 * so the snapshot pins the exact bytes of each.
 */
function scnMineKindForAll(g: Golden): void {
  const w = bareWorld(1022);
  const o = place(w, 'o', 0, 0, 0, 'warspite'); // holds NAVAL MINES (class weapon)...
  w.applyCard(o, 'captiveMines'); // ...plus the other two lines
  w.applyCard(o, 'foulingMines');
  place(w, 'a', 60 + MINE_SIGHT / 2, 0); // enemy observer: every mine below is inside its mine sight
  const kinds: readonly MineKind[] = ['naval', 'captive', 'fouling'];
  kinds.forEach((kind, i) => injectMine(w, `m-${kind}`, 'o', 60, (i - 1) * 30, kind));
  const fo = cap(g, w, 'o');
  const fa = cap(g, w, 'a');
  const ownRows = fo.mines.filter((m) => m.own);
  const ownCarriesKind = ownRows.length === 3 && ownRows.every((m) => 'c' in m && m.c === w.mines.get(m.id)!.kind);
  const enemyRows = fa.mines as readonly MineView[];
  const enemyCarriesKind =
    enemyRows.length === 3 && enemyRows.every((m) => !m.own && m.c === w.mines.get(m.id)!.kind && Object.keys(m).join() === 'id,x,y,own,by,c');
  prove(g, 'mine-kind-for-all', ownCarriesKind && enemyCarriesKind);
}

/** The full scenario battery + the self-validating coverage assertions —
 *  shared verbatim by both grammar runs (R6). Returns the serialized frames
 *  for the caller's own snapshot. */
function runBattery(): string[] {
  const g: Golden = { frames: [], channels: new Set(), subcases: new Set() };
  runScenarios(g);
  const subcases = [...EXPECTED_SUBCASES, ...WAKE_SUBCASES].sort();
  // Self-validating coverage: the fixture can never silently lose a channel.
  expect([...g.channels].sort()).toEqual(EXPECTED_CHANNELS);
  // Strengthened coverage: every appended scenario's mandatory sub-cases were
  // actually OBSERVED (each tag is recorded only when its fact held), so a
  // regression or a removed scenario fails here.
  expect([...g.subcases].sort()).toEqual(subcases);
  // THE PLAIN-HULL CHANNEL IS IN THE GOLDEN (Story 11.2, R3): at least one
  // snapshotted frame carries a `pc` row, every such row is exactly
  // {h,x,y,heading,speed} in that order, and no spectator frame carries the
  // channel at all.
  const parsed = g.frames.map((s) => JSON.parse(s) as FrameMsg);
  const plainRows = parsed.flatMap((f) => f.pc ?? []);
  expect(plainRows.length).toBeGreaterThan(0);
  for (const row of plainRows) expect(Object.keys(row).join(',')).toBe(PLAIN_KEYS);
  expect(parsed.some((f) => f.spec === true && 'pc' in f)).toBe(false);
  return g.frames;
}

describe('golden frames — byte-identity gate for the perception refactor', () => {
  // THE snapshot key is historical and load-bearing: it was cut when the
  // grammar was a per-room mode, and cycle 105's ONE-RADAR deletion must
  // leave every byte of the battery it pins unchanged — the deletion removed
  // the road not taken, never the behaviour production runs.
  //
  // REGENERATED KNOWINGLY IN STORY 7-5 WAVE 2. The decoy-buoy and
  // shoot-a-decoy scenarios were RETIRED with their subject (nothing fakes a
  // ship contact any more), and the denial scenario's 'blocked' producer moved
  // from the decoy's un-aimed stern drop to the MINE's click at the same rock.
  // Every surviving scenario's frames are otherwise unchanged — the equipment
  // swap does not touch the fixture's hulls (TB/ML), and the reload timers
  // visible in `you.ammo` are the ones those hulls already carried.
  // REGENERATED KNOWINGLY AGAIN IN BALANCE CYCLE 1. The diff is 118 lines and
  // every one of them is the hp doubling propagating into the frames (125→250,
  // 150→300 on the fixture's TB/ML hulls) plus the 'sm' emissions that follow
  // from hulls now surviving wounded where they used to sink. No perception
  // rule moved, no channel was lost, and no scenario was retired — verified by
  // reading the diff rather than by trusting the update flag.
  // REGENERATED KNOWINGLY IN STORY 8.16. Exactly TWO rows moved, and in each
  // the ONLY difference is `you.offer`'s content: SHIELD BLOCK, CHAFF and
  // DECOY BUOY left `stub` and joined the common pool, so the seeded draw
  // deals a different hand ('decoyBuoy' / 'deckGunBarrel' where
  // 'phosphorShells' / 'starShells' were). Every other byte — contacts,
  // events, blips, mines, zones — is unchanged (verified by diffing the rows
  // with `offer` masked out, not by trusting the update flag).
  // REGENERATED KNOWINGLY IN STORY 8.17. Exactly FOUR rows moved, each read:
  // (1)+(2) two `you.offer` hands — the seeded draw deals differently now that
  // `dazzleShells` is a consumable and `phosphorShells` an equipment line;
  // (3) scnStarShell's burst frame: the flare bursting over hull `h` inside
  // its lit circle now emits `hc` where it emitted `sp` (the flare deals the
  // tier's damage — amendment 135(a)); (4) scnDebuffs' two frames: the DAZZLE
  // zone (`daz: true` on `litZones`) is gone, `you.dazzledUntil` is the flash
  // mark (10 s) and the dazzled victim's own contact list is EMPTY — the
  // watcher at 117 u is outside its collapsed 82.5 u sight (amendment 132) —
  // while the watcher's contact for the victim is unchanged. No other byte.
  // REGENERATED KNOWINGLY IN STORY 8.18. Exactly ONE row moved, and the ONLY
  // difference is `you.offer`'s content: SMOKE SCREEN left `stub` and joined
  // the common pool, so the seeded draw deals a different hand ('chaff' /
  // 'deckGunTurret' re-ordered where 'deckGunTurret' / 'reload' were). No
  // battery frame carries a `smoke` channel (no scenario lays a trail), no
  // contact, event, blip, mine or zone byte moved — the sightClear predicate
  // with an EMPTY puff store is byte-identical to losClear (verified by
  // diffing the snapshot, not by trusting the update flag).
  // REGENERATED KNOWINGLY FOR AMENDMENT 185 (gun ladders tiered). Exactly TWO
  // rows moved, and in each the ONLY difference is `you.offer`'s content:
  // DECK GUN TURRET and DECK GUN BARREL left the catalog (their effects are
  // CANNON ladder rungs now), so the seeded draw deals differently — row 8
  // ['deckGun','chaff','dazzleShells','deckGunTurret'] became ['reload',
  // 'chaff','dazzleShells','intel'], row 31 dealt 'armor' where it dealt
  // 'speed'. No contact, event, blip, mine, zone, position or hp byte moved
  // (verified by diffing the rows with `offer` masked out).
  // REGENERATED KNOWINGLY IN STORY 9.2 (PV 75). 156 of 167 lines moved, read
  // by diffing old against new: in 155 the ONLY difference is `you.ammo`
  // growing from nine to eleven entries by two trailing `null`s (SLOT_COUNT
  // 11 — the two new consumable slots are empty in every golden world); in
  // the ONE other (row 8) the same two nulls plus `you.offer`'s content —
  // CHAFF left the catalog (amendment 31), so the seeded draw deals
  // 'decoyBuoy' where it dealt 'chaff'. No golden frame ever carried
  // `you.chaff` / `you.chaffGhosts`; no contact, event, blip, mine, zone,
  // position or hp byte moved.
  // REGENERATED KNOWINGLY IN STORY 9.4 (PV 78). Exactly THREE rows moved,
  // each read: (1) row 8's `you.offer` hand deals 'foulingShell' in the slot
  // that dealt 'dazzleShells' — the catalog id rename, same seeded draw;
  // (2) scnDebuffs' victim frame: `you.dazzledUntil` is GONE with the FLASH
  // SHELLS mark, and the victim's own contact list now carries the watcher
  // at 117 u — its sight is no longer collapsed to 82.5 u (the
  // `dazzled-victim-private` sub-case left with the field; the watcher's own
  // frame is byte-identical); (3) scnTorpReReveal's tick-2 frame: the same
  // `you.dazzledUntil` key gone — the gate shrink is a stats write now, which
  // never rides the wire, so the silent tick and the re-reveal are
  // byte-identical. No other contact, event, blip, mine, zone, position or hp
  // byte moved (verified by diffing the rows field by field).
  // REGENERATED KNOWINGLY IN STORY 9.6 (PV 80). Exactly TWO rows moved, and in
  // each the ONLY difference is `you.offer`'s content: row 8's hand
  // ['reload','decoyBuoy','foulingShell','intel'] became
  // ['passiveHealing','decoyBuoy','foulingShell','reload'] (the new PASSIVE
  // HEALING ladder joined the pool, so the seeded draw deals differently);
  // row 31 deals 'hullPoints' where it dealt 'armor' (the id rename, same
  // seat, same draw). No contact, event, blip, mine, zone, position or hp
  // byte moved (verified by diffing the rows field by field).
  // REGENERATED KNOWINGLY IN STORY 9.8 (PV 82, the twelfths ladder —
  // amendment 103, rulings 121–129). 29 of 160 rows moved, each read field by
  // field: (1) placements re-based onto ANNULUS (sight + 200, inside the radar
  // dropout's flat band) / BEYOND_RADAR — blip masks, contact and event
  // positions follow; (2) SIGHT-derived positions (spectator b, straddle,
  // ballistic and torpedo reveals, the flare's burst point and its longer
  // flight's tick/t/sweep/xp/reload) moved with sight 330 → 500 and
  // litRadius = SIGHT / 2; (3) the bigger sight bubble adds contacts / reveals
  // it now honestly covers (b sees a's torp in scnCombat; o1 and o3 see each
  // other in scnGunnery; scnSightSpawnBlip's c becomes a blip for b instead of
  // a contact) and drops scnMines' stale `nearFog` row. No dropout roll is
  // pinned on a paint: every blip/wake the battery records sits inside
  // `dropout.startU` (scnHoming's far observer moved beyond radar for that).
  // REGENERATED KNOWINGLY IN STORY 10.1 (PV 92, the per-ship consumable kit —
  // epic-10 amendment 3). The ammo array went 9 → 11 (Story 9.2's six fixed
  // keys) → 9 (SLOT_COUNT = 5 + KIT_SIZE). 159 of 169 snapshot lines moved,
  // read by diffing old against new, and in EVERY one the only differences
  // are (1) `you.ammo` shrinking from eleven entries to nine by dropping two
  // trailing `null`s (the two retired consumable slots, empty in every golden
  // world) and (2) the new self-private `you.kit` field beside `gun` — the
  // default four, since no golden world names a kit. No `offer` hand, contact,
  // event, blip, mine, zone, position or hp byte moved (verified with both
  // differences masked out). BOT KITS roll off a separate kit stream (map
  // seed ^ 0x6b17), so every hue and gun draw of a pinned seed is unchanged.
  // REGENERATED KNOWINGLY IN STORY 10.3 (2026-11-04, PV 95, THE INDEX MODEL —
  // epic-10 amendment 8), twice: wave 0 when the line list went 30 → 28
  // (HULL POINTS / PASSIVE HEALING deleted, four ids renamed — the seeded draw
  // deals differently, so `you.offer` hands moved), and wave 2a for the
  // numbers. 159 of the snapshot's lines moved in wave 2a, diffed field by
  // field: (1) every `hp` — hulls are 1000 (was 300 / 350), and the fixtures
  // that set a raw hp now read a different FRACTION, so (2) the wounded-smoke
  // `sm` tier moves 1 → 2 on five rows; (3) `dmg.amount` follows Eric's
  // damage table (cannon 8 → 24 — a ×3 placeholder, naval mine 90 → 200,
  // fouling mine 10 → 100) and `you.repairHp` the HULL REPAIR pool (50 →
  // 100 over 5 s); (4) in scnMineBurstDetonation the cannon's FIRST shell now pops the
  // 10 hp mine (24 ≥ 10), so that one row's boom / burst / sp order follows
  // (the same events, the mine popping a shell earlier). No contact,
  // position, channel or event TYPE was added or removed.
  it('RETURN grammar (R6): the full battery — the one radar, byte-identical to production', () => {
    // REGENERATED KNOWINGLY IN STORY 10.5 (2026-11-05, PV 97, THE KIT RETIRE
    // AND THE THREE EQUIPMENT SLOTS — epic-10 amendment 11). Read by diffing
    // old against new with the structural fields masked; every change is one
    // of: (1) `you.ammo` is five entries (gun, Shift, torpedo, mine, special
    // shell) — a Warspite's rack now sits in the MINE slot (3), so its pool
    // moved one place right; (2) the self-private `you.kit` is gone; (3) the
    // catalog lost its consumable lines, so the seeded draw deals different
    // `you.offer` hands; (4) one kind per family slot: the Yamato fixture's
    // BROADSIDE (out of the deal, no family — R6) and the Warspite fixtures'
    // second / third mine lines are refused, so their `cards` shrank; (5) the
    // mine click's `blocked` denial names slot 3, and the Shift's `no-ammo`
    // denial now carries its ability code (`act`); (6) scnHeal PRESSES HULL
    // REPAIR through the input path (`C`), so its frames gain `ackSeq` 1, the
    // self-private `you.repairReadyAt`, and a whole pool on the press tick (the
    // press lands after tickRepairs, so the first drain is the next tick). No
    // contact, event type, position or hp outside scnHeal moved; the passive
    // regen (R8) pays nothing inside the battery's short windows.
    // RE-RECORDED AGAIN 2026-11-05 (Story 10.5 wave 2c, R9 / R10 — RELOAD is
    // the main battery's stat only): ten `you.ammo[].reloadMsLeft` values
    // moved and nothing else — the Yamato's star-shell reload and the
    // Bismarck rows' Speed Boost / heavy-torpedo reloads now run on their own
    // unscaled numbers (20000 / 25000 / 30000 at the press) instead of the
    // hull's RELOAD index scale. Diffed token by token: no other byte moved.
    // RE-RECORDED AGAIN 2026-11-05 (Story 10.5, R11 — R9 reversed, RELOAD
    // scales the Q / E / R weapons again; merged with development's arc-only
    // fire): the five slot-weapon values of the note above return to their
    // pre-R9 numbers (the Yamato star shell 20000 / 19000 / 8950 → 28580 /
    // 27580 / 17530, the Bismarck heavy torpedo 30000 / 14600 → 28560 /
    // 13160); the Speed Boost values stay unscaled (R10). Against
    // development, the only other moves are the story's own (five-entry
    // `ammo`, no `kit`, the cards / offer / denial / HULL REPAIR rows above).
    expect(runBattery()).toMatchSnapshot();
  });
});

/** Every scenario in fixture order (extracted verbatim from the original
 *  single `it` — the ordering comments still govern). */
function runScenarios(g: Golden): void {
  scnSightSpawnBlip(g);
  scnCombat(g);
  scnPtBn(g);
  scnMines(g);
  scnSpectator(g);
  scnStraddleBoom(g);
  // Appended scenarios (must not disturb the six above or their snapshot rows).
  scnIslandLos(g);
  scnBallisticReveal(g);
  scnSpectatorBallistic(g);
  scnBurst(g);
  scnStarShell(g);
  scnZoneKill(g);
  scnMineBlast(g);
  scnMineBurstDetonation(g);
  scnDenied(g);
  // Story 8.15 (the snapshot regenerated KNOWINGLY — PV 58): every `shell`
  // reveal row gains the trailing family key `w: 'cannon'` (the ONE declared
  // disclosure widening, amendment 89(i)); torpedo rows, `you` rows (no cut
  // is ever opened in this battery, so `hunkerUntil` stays omitted) and
  // every other channel are byte-identical.
  // Story 2.8 additions (appended KNOWINGLY — the snapshot regenerated with
  // the strip + deck economy; every earlier scenario's rows changed shape
  // through you.upg leaving and you.offer going deck-drawn).
  scnHoming(g);
  scnDebuffs(g);
  // Story 4.3 additions (appended KNOWINGLY — the snapshot regenerated with
  // the gunnery conversation: earlier scenarios' rows gain sp/hc/mz where
  // their existing shots always earned them; every other channel must stay
  // byte-identical).
  scnGunnery(g);
  // PV 23 (the public register — snapshot regenerated KNOWINGLY): witnessed
  // `sunk` rows gain the trailing per-observer `seen: true`, and previously
  // absent sunk rows appear unseen where an observer is the credited killer
  // or the victim is a human captain. Every other channel must stay
  // byte-identical.
  // DAMAGE CONTROL addition (appended KNOWINGLY — the snapshot regenerated
  // with PV 24: every `you` row gains the required `repairHp` key, and this
  // scenario adds the self-private `heal` channel).
  scnHeal(g);
  // Story 4.12 addition (appended KNOWINGLY — the snapshot regenerated with
  // PV 32: this scenario adds the identity-free `wk` wake channel; every
  // earlier scenario's rows must stay byte-identical, since no prior world
  // ever lays wake — every ship in them is placed at speed 0).
  scnWake(g);
  // Story 8.13 additions (appended KNOWINGLY — the snapshot regenerated with
  // PV 56: the re-reveal is a change to the ballistic gate's MEMORY, so no
  // earlier scenario's bytes move — none of them ever carried a projectile out
  // of a gate and back — and the own-only mine kind added a trailing `c` to
  // the OWNER'S mine rows only: scnMines' `own` row and scnSpectator's `sm`
  // row). Cycle 162 (PV 68, Eric 2026-10-01 "Everyone sees the kind"): the
  // snapshot regenerated once more — every NON-OWN mine row across the battery
  // gains the same trailing `c`, and nothing else moves (the chaff ghosts ride
  // `you` only when the owner's beam paints its own fakes, which no golden
  // world arranges).
  scnTorpReReveal(g);
  scnMineKindForAll(g);
}
