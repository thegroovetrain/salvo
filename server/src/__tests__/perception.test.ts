// STORY 11.2 (Eric 2026-11-12, R3 / R4 / R8 / R18) — READ THIS FIRST; where a
// paragraph below still speaks of the twelfths ladder, the detect rung or
// the radar dropout, this one supersedes it:
//   - TWO EYE TIERS. `sighted` is the CLASS-AND-NAME reach (`CONFIG.vision
//     .sight`): a full contact. `hullSighted` is the PLAIN-HULL reach
//     (`CONFIG.vision.hullSight`): between the two a hull is a `pc` row —
//     exactly {h,x,y,heading,speed} under an anonymous handle. verifyPlain
//     is that tier's own invariant line (NOT a seventh exception): every row
//     lies in the band with island LOS clear, names no roster id, never
//     coexists with a full contact for the same hull, and every hull the
//     strict band demands is present. PlainLedger pins the handle: stable
//     within a visit, fresh on every visit, never shared by two observers.
//   - EVERY POINT HAS ITS OWN NAMED EYE REACH (`eyeSeen` at a CONFIG.vision
//     fact, whiteout-scaled, fog-tolled, island LOS): booms and bursts at
//     `splashSight`, shells at `shellSight`, torpedoes and their updates at
//     `torpedoSight`, mines at `mineSight`, a crate's kind at
//     `crateKindSight`; mz / sm at `muzzleFlash` (never whiteout-scaled).
//   - IDENTITY STAYS ON THE CLASS REACH: a boom's `hit`, the sunk row's
//     `seen` and the whole spawn row.
//   - THE RADAR DROPOUT IS GONE: every in-range, swept, unshadowed subject
//     paints every sweep; the dropout oracle and its two directed suites
//     were deleted (a ruling, recorded in the epic-11 amendments).
//   - The synthetic sight-shrink seam (a `sightRange` write) is replaced by
//     real FLASH marks (`dazzledUntil`): the point reaches no longer read
//     `stats.sightRange`, and the whiteout scales every eye reach together.
//
// THE ANTI-CHEAT INVARIANT (the plan's marquee test), property-style, plus
// directed boundary/LOS/paint-window cases. The property: for every observer,
// in every frame, every contact and every event references ONLY what that
// observer's sight bubble ∪ this-tick radar paints ∪ lit zones the observer
// OWNS (Story 1.7 — plus the self-directed events: own dmg/sunk/spawn, own
// shells; the lit-zone CIRCLE itself is owner-always / radar-gated; Story
// 4.3's three DECLARED gunnery exceptions: shooter-private sp/hc at any
// range, and the mz flash inside the observer-scaled 6/12 halo (radar ×
// muzzleFlashFactor, Story 9.8; SIGHT*1.25 under the eighths) with island LOS; PV 23's 4th declared exception, the
// PUBLIC REGISTER `sunk` row:
// every sinking is identity-only public (every hull is a participant since
// Story 10.8), and the per-observer `seen` flag may be present only when the
// witness predicate holds — see verifySunk; plus DAMAGE
// CONTROL's healer-private `heal` and the owner-only `repairHp` pool,
// neither of which may ever reach another observer; Story 4.4's FIFTH
// declared exception, the anonymous `sm` wounded-smoke pulse inside the same
// 6/12 halo with island LOS — identity-free for EVERY
// observer, see the sm verifier; and Story 4.5's SIXTH declared exception,
// the bearing-only `fh` foghorn — bearing + a 4..12 volume BAND resolved as
// twelfths of the LISTENER'S own intel range (Story 9.8, ruling 129) and
// floored at 4 on the wire, since bands 1-4 are one indistinguishable 100%
// plateau for every honest client (review fix), islands muffling the FLOORED
// band to max(5, floored + 3), never a position or id for any
// fogged observer, see the fh verifier). Story 4.9 also TIGHTENS three rows
// WITHIN the invariant: mines, torpedoes, and torpU updates now reveal at
// the DETECT range — 1 × the observer's effective sight since the 4/8 rung (2026-10-08; was 0.75 ×), a strict subset
// of the sight bubble — so their oracles below bind them to the narrower
// gate (see `detected`); shells, booms, bursts, sunk-witness and
// spawns stay on truesight. Story 8.15 adds ONE DECLARED DISCLOSURE WIDENING
// inside the invariant, not a seventh exception (amendment 89(i)): a `shell`
// reveal carries `w`, the gun family from the fixed three-word set — nothing
// range-derivable, no identity, never on a `torp` — see assertBallisticShape
// and verifyBallistic; and it pins three more SELF-PRIVATE fields on the
// boostUntil terms: `hunkerUntil` (the HUNKER Shift's window), the
// seat's pick and the held-fire level `held` may exist NOWHERE but the
// observer's own `you` (see verifyFrame). Story 10.4 re-points that pin: the
// seat's pick is the SHIFT, the turrets' reloads and the secondaries' heat /
// lock are self-private on the same terms, the retired `gun` key rides
// nowhere, and a sighted hull's turret ANGLES (`tu`) ride its contact row and
// nothing else — an extension of a sighted contact, not a seventh exception
// (verifyBatteryPrivacy). The fuzz seats every ship with a RANDOM Shift, a
// random hull and scrambled turret angles / reloads, and drives a random
// level on both `held` and `sec`, so main-battery salvos and secondaries
// rounds all flow through the oracle. Story 9.3 (the
// MULTI-SPECTRAL COUNTERMEASURE — Story 8.18's SMOKE SCREEN seat) adds NO
// occluder and no seventh exception: since Story 9.3 session 2 (Eric
// 2026-10-12, "just draw it on top of ships") a cloud is a CLIENT VISUAL
// OVERLAY that hides nothing on the server — the fuzz keeps seeding clouds
// (straddling hull pairs, on observers, random ages) and asserts every
// sight-, flare-, radar- and wake-tier oracle is cloud-blind. The cloud itself
// reaches a client through the `clouds` channel on its own gate (owner /
// spectator / its spray DISC sighted — nearest point within sight with
// island LOS to it — or radar-detected — nearest point within radar range,
// the beam crossing the disc's bearing span this tick, the centre shadow-
// visible) — see cloudGateOracle — carrying `{id,x,y,t0}` and no owner, radius
// or `until`. The disc radius is the literal 200 × (1 + 1.5 × min(1, age /
// 15 s)) curve, re-derived here, never CONFIG or the shared
// `cloudOutlineRadius`. Story 8.19 (WAKE DRAFTING,
// amendments 151–155) adds ONE own-ship field, not a seventh exception:
// `you.draft` — the wake-draft lift folded into the observer's own cap — is
// own-ship state, a DECLARED disclosure (NFR21; Eric 2026-09-30, amendment
// 160): the exact scalar is `lift × ageFactor × headFactor`, so a MODIFIED
// client varying its heading over a few ticks can recover the direction and
// rough age of a wake it cannot see (island- or cloud-hidden) — a rough
// bearing toward a hidden hull within one wake length (~250 u); honest
// clients show nothing, and Eric accepted it because prediction needs the
// exact double. It may exist NOWHERE but the observer's own `you` (see
// verifyFrame), so the count stays SIX. Cycle 162 (Eric 2026-10-01, PV 68)
// adds the mine KIND `c` to EVERY delivered mine row inside the invariant,
// not a seventh exception (a field on a row the sight gate already admitted —
// see verifyMine). Story 9.2 (epic-9 amendment 31) RETIRED CHAFF: its
// server-generated fakes, their carve-out arm in verifyBlip and the owner's
// `you.chaff` / `you.chaffGhosts` are gone, so every blip must now trace to a
// genuine ship paint or a decoy paint — the invariant is STRICTER, and the
// six exceptions are unchanged. Story 9.10 (THE FOG FIELD — Eric 2026-10-14/15,
// "no discs, it won't look like realistic rolling fog"; epic-9 amendments
// 149–150, 164, 167–170, 172–173; 163 superseded by 210) keeps the count at SIX: fog is a TOLL
// on the sight predicates, never a channel — the field is public weather
// both sides derive from the welcome seed and the schema cut, so nothing
// per-observer about fog rides a frame (the `fog` key exists on no frame;
// amendment 162's seventh exception is MOOT). SIGHT ITSELF IS FOG-TOLLED:
// every sight-tier oracle here (`sighted`, `detected`, the mz/sm halo
// verifiers and the cloud gate's sight arm to the nearest disc point)
// compares `dist + toll ≤ range`,
// where the toll is `fogTollOracle` — a NUMERIC INTEGRATION of the segment
// (≤ 1 u midpoint samples of the SHARED `fogDensityAt` over the world's own
// field, EPOCH clock (`fogEpochT` — the last refresh's `now`, the view the
// server's memo walks) and cut — the field is the world, like the islands — times
// sightCostPerU), never `withinSight` or `world.fogTollAlong` (production's
// 10 u march + quick-reject raster), so the two derivations check each
// other. The midpoint rule's error is bounded by the step times the total
// variation of the density along the ray, so every fogged oracle carries a
// dead band of `sightCostPerU × ((marchStepU + 1) × TV + 0.5)` — zero on a
// ray that touches no fog: a delivered subject must be inside the LOOSE
// bound, a subject the oracle demands PRESENT must be inside the STRICT one
// (see `Bound`), and with no fog on the ray both collapse to the exact
// pre-fog test. THE RADAR ORACLES ARE FOG-BLIND BY RULING (amendment 149) AND
// HAVE NO INNER EDGE (amendment 210, Eric 2026-10-21, superseding amendment
// 163's "dark to both": the server returns the entire sweep, so a hull fog
// hides inside the bubble is no contact but still blips, and a sighted hull
// is a contact AND a blip) — `blipPredicate`, the
// wake oracle's radar half, the cloud gate's radar arm, the
// zone circles and the foghorn never read the field, and the fuzz asserts
// (RADAR_THROUGH_FOG) that returns whose ray crosses fog paint exactly as the
// fog-blind oracle says. The fuzz PINS the cut per world through the World's
// test seam (worlds ≡ 0 mod 3 at ~30 % coverage, ≡ 1 at ~5 %, ≡ 2 with no
// fog) so the toll arms are non-vacuous, and the five FOG_* /
// RADAR_THROUGH_FOG ledgers prove each arm ran. FLASH SHELLS (epic-10
// amendment 5; gate fixes F2/F4, Eric 2026-10-29) add ONE row-rule widening,
// not a seventh exception: a `burst` carrying the flash tag `f` may also
// reach an observer whose hull CENTRE is within the burst's own stamped
// radius `r` (the launched shell's tiered radius — Story 10.5, R7) of the
// burst point (the flashed victim, whose sight is 0 that tick — see
// verifyBurst); and zero sight admits NOTHING, not even a point at the
// observer's own centre. The exceptions stay SIX. The checks below
// are a deliberate test-local reimplementation of the
// visibility predicates so a refactor of perception.ts cannot silently agree
// with its own bug.

import { describe, it, expect } from 'vitest';
import {
  isAfloat,
  isSinking,
  CATALOG,
  CONFIG,
  INDEX_IDS,
  abilityCode,
  DEFAULT_CLASS_ID,
  DEFAULT_SHIFT,
  SHIFT_IDS,
  SHIP_CLASS_IDS,
  encodeTurretAngles,
  encodeLauncherAngles,
  initialLaunchers,
  launcherRest,
  launcherTrainRad,
  turretMounts,
  turretRest,
  turretTrainRad,
  HORN_IDS,
  SHELL_FAMILIES,
  bearing,
  coverageHas,
  isDropRoll,
  FLASH_WINDOW_MS,
  effectiveSight,
  effectiveStats,
  hullEnvelope,
  boostedKinematics,
  draftedKinematics,
  hmToU,
  hullSilhouette,
  mulberry32,
  FOG_NO_CUT,
  FOG_SOLID_DENSITY,
  fogCutForTarget,
  fogDensityAt,
  fogLattice,
  paintSeed,
  segPolygonHit,
  segmentPaintSeed,
  smearArc,
  wrapPositive,
  type BallisticEvent,
  type BlipEvent,
  type HullCoverage,
  type HullId,
  type ReturnBlipEvent,
  type BoomEvent,
  type BoonFitEvent,
  type BurstEvent,
  type Contact,
  type Island,
  type DamageEvent,
  type DropPickupEvent,
  type GameEvent,
  type DropKind,
  type IndexId,
  type FrameMsg,
  type GhostPaint,
  type HealEvent,
  type ShiftId,
  type HitCallEvent,
  type MatchPhase,
  type MineKind,
  type MineView,
  type OwnShip,
  type PlainContact,
  type PointEvent,
  type SpawnEvent,
  type SplashEvent,
  type SunkEvent,
  type TorpedoUpdateEvent,
  type WakeBlipEvent,
  type WakeRibbon,
  dispersionAxes,
} from '@salvo/shared';
import { World, type ShipRecord, type WorldOptions } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
// Registry symbols are imported ONLY to ENUMERATE keys/rows for the completeness
// block below — never as a behavior oracle. Every visibility predicate in this
// file stays independently reimplemented (see the header), so a perception
// refactor cannot silently agree with its own bug via a row's own visible().
import { SIGNAL_REGISTRY } from '../game/signals.js';
import { circleIsland, flatRaster, rasterFrom, ridgeField } from './islandFixture.js';
import type { HeightRaster, Vec2 } from '@salvo/shared';

const TAU = Math.PI * 2;
const SIGHT = CONFIG.vision.sight;
const RADAR = CONFIG.vision.radar;
const DT = CONFIG.tick.simDtMs;
const SWEEP_PERIOD = 60000 / CONFIG.vision.sweepRpm; // ms per base revolution
const SWEEP_DELTA = (TAU * DT) / SWEEP_PERIOD;
const TICKS_PER_REV = Math.round(SWEEP_PERIOD / DT);
/** u — the PLAIN-HULL eye reach, the outer sight tier's rim (Story 11.2). */
const HULL_SIGHT = CONFIG.vision.hullSight;
/** u — the longest reach ANY eye rule has (the plain hull, the muzzle flash /
 *  smoke halo, a splash): beyond it nothing is seen, only painted. */
const EYE_MAX = Math.max(HULL_SIGHT, CONFIG.vision.muzzleFlash, CONFIG.vision.splashSight);
/** u — a directed-case placement BEYOND EVERY EYE REACH and inside the radar
 *  reach, so every swept paint lands and no eye rule enters the case (the
 *  name predates amendment 210, which removed the radar's inner edge — there
 *  is no annulus any more). Derived, never a literal. */
const ANNULUS_D = (EYE_MAX + RADAR) / 2;
/** u — a directed-case placement in the PLAIN BAND: beyond the
 *  class-and-name reach, inside the plain-hull reach (Story 11.2). */
const PLAIN_D = (SIGHT + HULL_SIGHT) / 2;
/** u — a placement BEYOND radar range. */
const BEYOND_RADAR = RADAR + 200;
/** u — HALF of ANNULUS_D: a directed case that STEPS the world seats its
 *  two hulls at (∓FAR_HALF, 0) — ANNULUS_D apart, both on the 10,000 u board
 *  (a radar reach is nearly its diameter now, so "observer at the origin,
 *  target a radar reach away" is off the water and the rim would move it). */
const FAR_HALF = ANNULUS_D / 2;
/** u — the named POINT eye reaches (Story 11.2, R4 / R18), for the directed
 *  cases' placements: a shell in flight, a running torpedo, a laid mine, a
 *  boom / burst point, and the muzzle-flash / wounded-smoke halo. */
const SHELL_SIGHT = CONFIG.vision.shellSight;
const TORP_SIGHT = CONFIG.vision.torpedoSight;
const MINE_SIGHT = CONFIG.vision.mineSight;
const SPLASH_SIGHT = CONFIG.vision.splashSight;
const MUZZLE_FLASH = CONFIG.vision.muzzleFlash;

/** A FLASH mark that leaves the observer every eye reach × `k` right now
 *  (0 ≤ k < 1; 0 = the hit tick, fully white): `k` of the way through the
 *  whiteout's clearing phase. The mark is real (`dazzledUntil`) — the one seam
 *  that shrinks the point reaches since Story 11.2. */
function flashMark(w: World, k = 0): number {
  const { rampMs, holdMs, clearMs } = CONFIG.flashShells;
  return w.now + FLASH_WINDOW_MS - (rampMs + holdMs + clearMs * k);
}

// ---------- test-local visibility reimplementation --------------------------

/** THE anti-cheat oracle for island LOS, INDEPENDENTLY REIMPLEMENTED: the raw
 *  concave-safe polygon test with NONE of islandBlocksSegment's broadphase or
 *  `core` early-outs. If either optimization ever changed an answer, this
 *  oracle would disagree and the invariant suite would fail. */
function clearLos(a: { x: number; y: number }, b: { x: number; y: number }, islands: readonly Island[]): boolean {
  return islands.every((isle) => segPolygonHit(a, b, isle.poly, 0) === null);
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// ---------- Story 9.3: the MULTI-SPECTRAL COUNTERMEASURE oracle (independently re-derived) ----
//
// A cloud HIDES NOTHING (Story 9.3 session 2, Eric 2026-10-12): it is a
// client overlay. The only rule the oracle needs is its DELIVERY gate, over
// the cloud's spray DISC — centre fixed, radius LINEAR from the cloud's own
// STAMPED `r0` at birth to its stamped `r1` at its stamped `lifeMs` (Story
// 10.6, I6 — the owner's SMOKE SCREEN cards at the press; deliberately NOT
// CONFIG.countermeasure and NEVER the shared `cloudOutlineRadius`). Only LIVE
// clouds count (`until` in the future). The test-injected clouds carry the
// literal two-card disc (150 → 300 u, amendment 141) over a 15 s life.
const CLOUD_LIFE_MS = 15_000;
const CLOUD_STAMP = Object.freeze({ lifeMs: CLOUD_LIFE_MS, r0: 150, r1: 300 });

function cloudOutlineOracle(cloud: { bornAt: number; lifeMs: number; r0: number; r1: number }, now: number): number {
  const age = Math.max(0, now - cloud.bornAt);
  return cloud.r0 + (cloud.r1 - cloud.r0) * Math.min(1, age / cloud.lifeMs);
}

function segPointDistOracle(a: { x: number; y: number }, b: { x: number; y: number }, p: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
}

/** THE sight oracle: the ONE predicate every sight-tier check below composes
 *  (never production's `sightClear`) — island LOS and nothing else (a cloud
 *  hides nothing, Story 9.3 session 2). */
function sightClearOracle(w: World, me: ShipRecord, b: { x: number; y: number }): boolean {
  return clearLos(me.state, b, w.map.islands);
}

// ---------- Story 9.10: the FOG FIELD oracle (independently re-derived) ---
//
// THE TOLL, BY NUMERIC INTEGRATION (never production's march): walk the
// segment a → b in n = ceil(len) equal steps (≤ 1 u each) and sum the SHARED
// `fogDensityAt` (the one derivation both sides run — the field is the
// world, like its islands; the oracle reads it through `fogFieldForTest`
// with the world's clock and cut) at every midpoint, times the step, times
// sightCostPerU. Production marches the same integrand at `marchStepU`
// behind a quick-reject raster; the two agree to within the midpoint rule's
// error, which is bounded by (production step + oracle step) × the total
// variation TV of the density along the ray — `slack` is that bound (plus
// half a unit for the oracle's own sampling of TV) times the cost. With no
// fog on the ray (every sample 0) `touched` is 0, slack is 0 and the fogged
// oracles are the exact pre-fog tests.
//
// THE OWN BANK (amendment 179, Eric 2026-10-16 "like grass patches in
// League"): when the observer stands in SOLID fog (shared density ≥ ½ at its
// exact position — production evaluates that same point), the leading solid
// run of the ray is free and the first thinner sample ends it for good. The
// oracle therefore returns a BAND: `tollMax` is the plain integral (no run —
// the most production may charge, since its walk may end the run early on a
// cell the ray only grazes) and `tollMin` is the integral past a GENEROUS
// run that frees the observer's own cell (its longest reach, a cell
// diagonal), stays free while any point of the ray's cross section within a
// cell centre's reach is solid, and bridges any surely-thin dip shorter than
// five cells (the most production may free: its cell centres can sit off the
// ray and miss a thin dip the 1 u samples catch). Sampling stands in for a
// proof here, as the slack does for the midpoint rule. 'loose' (what production delivered must satisfy) uses tollMin;
// 'strict' (what production must deliver) uses tollMax. With the observer
// in clear water the band is a point and the fogged oracles are exactly the
// cycle-191 tests.
interface FogToll {
  tollMin: number;
  tollMax: number;
  slack: number;
  touched: number;
}

const NO_TOLL: FogToll = { tollMin: 0, tollMax: 0, slack: 0, touched: 0 };

/** The first sample index the generous own-bank run cannot reach: the
 *  observer's own cell (`own` samples) and POSSIBLY-solid samples (`solid[i]`
 *  — some point within a cell centre's reach of the ray is solid, so
 *  production's walk may still be in its run) are free, a dip of surely-thin
 *  samples shorter than `bridge` is bridged, a longer dip (or the end) ends
 *  the run. */
function generousRunEnd(solid: Uint8Array, own: number, bridge: number): number {
  const n = solid.length;
  let i = Math.min(own, n);
  while (i < n) {
    if (solid[i] === 1) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < n && j - i < bridge && solid[j] === 0) j += 1;
    if (j < n && j - i < bridge) i = j; // a short dip: bridged
    else break;
  }
  return i;
}

/** The cross-section traces (u, perpendicular to the ray) that stand in for every
 *  cell centre's reach (≤ 7.1 u off the ray) in the oracle's generous run. */
const CROSS_SECTION_U = [-8, -6, -4, -2, 0, 2, 4, 6, 8];

function fogTollOracle(w: World, a: { x: number; y: number }, b: { x: number; y: number }): FogToll {
  if (w.fogCut >= FOG_NO_CUT) return NO_TOLL;
  const field = w.fogFieldForTest();
  const len = dist(a, b);
  const n = Math.ceil(len);
  if (n === 0) return NO_TOLL;
  const step = len / n;
  const dens = new Float64Array(n);
  let sum = 0;
  let tv = 0;
  let prev = 0;
  let touched = 0;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const d = fogDensityAt(field, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, w.fogEpochT, w.fogCut);
    dens[i] = d;
    if (d > 0) touched = 1;
    sum += d;
    tv += Math.abs(d - prev);
    prev = d;
  }
  if (touched === 0) return NO_TOLL;
  const cost = CONFIG.fog.sightCostPerU;
  const slack = ((CONFIG.fog.marchStepU + step) * tv + 0.5) * cost;
  const tollMax = sum * step * cost;
  if (fogDensityAt(field, a.x, a.y, w.fogEpochT, w.fogCut) < FOG_SOLID_DENSITY) return { tollMin: tollMax, tollMax, slack, touched };
  // The generous run: a sample is POSSIBLY solid when any point of its cross
  // section (the ray and every 2 u out to ±8 u, a cell centre's reach) is solid —
  // production's cell walk may still be free there (the cycle-194 gate,
  // Codex: on-ray samples alone under-read a run grazing a solid contour).
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const solid = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (dens[i] >= FOG_SOLID_DENSITY) {
      solid[i] = 1;
      continue;
    }
    const t = (i + 0.5) / n;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    for (const s of CROSS_SECTION_U) {
      if (s !== 0 && fogDensityAt(field, x - uy * s, y + ux * s, w.fogEpochT, w.fogCut) >= FOG_SOLID_DENSITY) {
        solid[i] = 1;
        break;
      }
    }
  }
  let paid = 0;
  const ownSamples = Math.ceil((CONFIG.fog.marchStepU * Math.SQRT2) / step); // the own cell's longest run along the ray
  const cellSamples = Math.ceil(CONFIG.fog.marchStepU / step);
  for (let i = generousRunEnd(solid, ownSamples, 5 * cellSamples); i < n; i++) paid += dens[i];
  return { tollMin: paid * step * cost, tollMax, slack, touched };
}

/** Which side of the dead band a fogged range test sits on: 'loose' (the
 *  default — what production DELIVERED must satisfy) grants the slack;
 *  'strict' (what production MUST deliver) demands it. */
type Bound = 'loose' | 'strict';

/** THE fogged range comparison every sight-tier oracle composes:
 *  `dist + toll ≤ range ± slack` and island LOS. */
function sightedWithin(w: World, me: ShipRecord, p: { x: number; y: number }, range: number, bound: Bound): boolean {
  // ZERO REACH ADMITS NOTHING (gate fix F4, Eric 2026-10-29): a whited-out
  // observer sees no point at all — not even one at its own centre (a hull it
  // is co-located with, a cloud it stands in).
  if (!(range > 0)) return false;
  const { tollMin, tollMax, slack } = fogTollOracle(w, me.state, p);
  const margin = bound === 'loose' ? slack : -slack;
  const toll = bound === 'loose' ? tollMin : tollMax; // amendment 179: the own-bank band (see fogTollOracle)
  return dist(me.state, p) + toll <= range + margin && sightClearOracle(w, me, p);
}

/** Non-vacuity ledgers for the fog (the CLOUD_SIGHT_THROUGH idiom).
 *  FOG_HID_CONTACT: (observer, hull) pairs inside GEOMETRIC sight with island
 *  LOS clear and no owned zone, whose toll pushed them out — verified ABSENT.
 *  FOG_THIN_SEEN: pairs whose ray touches fog yet stay inside the tolled
 *  range — verified PRESENT. FOG_HID_MINE_OR_TORP: detect-rung subjects
 *  (enemy mines, enemy fish) hidden by the toll — verified absent.
 *  FOG_HID_SM: an `sm` (or `mz`) inside the geometric halo with LOS, hidden
 *  by the toll — verified absent. RADAR_THROUGH_FOG: ship or decoy paints
 *  whose ray touches fog — painted exactly as the fog-blind oracle says
 *  (verifyBlipCompleteness). */
const FOG_HID_CONTACT = { n: 0 };
const FOG_THIN_SEEN = { n: 0 };
const FOG_HID_MINE_OR_TORP = { n: 0 };
const FOG_HID_SM = { n: 0 };
const RADAR_THROUGH_FOG = { n: 0 };

/** Non-vacuity ledgers for THE ARC INVARIANT LINE (Story 11.3 — verifyArc):
 *  hull, crate and wake paints checked at a range where the beam is many
 *  cells wide (≥ ARC_FAR_U) AND the target's own angular width is under the
 *  beam (less the arm's slack), so the bearing-span arm (a) is a claim the
 *  target alone could not satisfy (Story 11.3 review, P8). */
const ARC_HULL_FAR = { n: 0 };
const ARC_CRATE_FAR = { n: 0 };
const ARC_WAKE_FAR = { n: 0 };

/** Non-vacuity ledgers for the cloud (the DECOY_PAINT_EXPECTED idiom).
 *  CLOUD_SIGHT_THROUGH: (observer, hull) pairs inside sight with island LOS
 *  clear whose line runs through a live cloud's disc — verified PRESENT as a
 *  contact (a cloud hides nothing). CLOUD_DELIVERED_BY_SIGHT /
 *  CLOUD_DELIVERED_BY_RADAR: clouds delivered to a non-owner that ONE sensor
 *  alone explains (cloudGateOracle). */
const CLOUD_SIGHT_THROUGH = { n: 0 };
const CLOUD_DELIVERED_BY_SIGHT = { n: 0 };
/** Story 10.4 non-vacuity: contact rows the fuzz saw carrying turret angles. */
const TU_SEEN = { n: 0 };
/** Story 10.6 non-vacuity: contact rows the fuzz saw carrying LAUNCHER
 *  angles, and own frames carrying `launchers` / `racks`. */
const LU_SEEN = { n: 0 };
const OWN_MOUNTS_SEEN = { n: 0 };
/** Story 11.1 non-vacuity: in-flight DISPERSED shells (main battery /
 *  secondaries) whose landing point the fuzz proved absent from a frame. */
const LANDING_GUARDED = { n: 0 };
/** Story 11.1 review fix: pairs of one salvo's shell reveals checked parallel (verifyParallelSalvoTracks). */
const PARALLEL_PAIRS = { n: 0 };
const CLOUD_DELIVERED_BY_RADAR = { n: 0 };
/** Story 8.19: how many frames carried a POSITIVE `you.draft` (the drafting
 *  arm of the self-private clause ran against a real lift, not only the
 *  omitted-at-0 arm). */
const DRAFT_SEEN = { n: 0 };

// Per-observer EFFECTIVE eye reaches, re-derived here (deliberately NOT via
// production's sightOf / hullSightOf / eyeReach — the reimplementation rule).
// Every reach is a CONFIG.vision fact, the same for every observer (no card
// writes one), under THE WHITEOUT: the observer's own FLASH mark scales it
// through the ONE shared curve (`effectiveSight` — pinned in shared
// sight.test.ts; this suite owns WHERE it applies — every eye reach, never a
// radar gate and never the mz / sm halo).
//
// (HISTORY: until Story 11.2 a synthetic sight-shrink seam wrote a collapsed
// `sightRange` onto the record — the per-visit ledger's gate exit after Story
// 9.4 retired the dazzle. The dazzle is back (Story 10.9) and the point
// reaches no longer read `stats.sightRange`, so the fuzz now collapses the
// gates with real marks: `flashAll` / `clearFlash` below.)

/** u — `reachU` as THIS observer's eye has it this tick (the whiteout). */
function eyeReachOracle(w: World, me: ShipRecord, reachU: number): number {
  return effectiveSight({ sightRange: reachU }, me.dazzledUntil, w.now);
}

/** u — the observer's CLASS-AND-NAME sight this tick. */
function effSight(w: World, me: ShipRecord): number {
  return eyeReachOracle(w, me, SIGHT);
}

/** u — the observer's PLAIN-HULL sight this tick (Story 11.2). */
function effHullSight(w: World, me: ShipRecord): number {
  return eyeReachOracle(w, me, HULL_SIGHT);
}

// INTEL RANGE IS FLAT AGAIN (Eric ruling 2026-08-20). `intelRange` — the only
// card that ever wrote `stats.radarRange` — is deleted, so every observer
// resolves the same number. Kept as a named function rather than folded into
// its five call sites: production still resolves the ruler through
// `me.stats.radarRange`, so this is the independent oracle for a value a future
// radar card could move again, and only this body would change.
function effRadar(): number {
  return RADAR;
}

function sighted(w: World, me: ShipRecord, p: { x: number; y: number }, bound: Bound = 'loose'): boolean {
  // Story 9.10: fog-tolled (`dist + toll ≤ sight`, the integration oracle).
  return sightedWithin(w, me, p, effSight(w, me), bound);
}

/** THE POINT-BY-EYE ORACLE at a NAMED reach (Story 11.2, R4 / R18): `p`
 *  within `reachU` under the whiteout, fog-tolled, island LOS clear. */
function eyeSeen(w: World, me: ShipRecord, p: { x: number; y: number }, reachU: number, bound: Bound = 'loose'): boolean {
  return sightedWithin(w, me, p, eyeReachOracle(w, me, reachU), bound);
}

/** The OUTER eye tier: within the plain-hull reach (Story 11.2, R3). */
function hullSighted(w: World, me: ShipRecord, p: { x: number; y: number }, bound: Bound = 'loose'): boolean {
  return sightedWithin(w, me, p, effHullSight(w, me), bound);
}

/** A boom or a burst POINT: the splash reach. */
function splashSeen(w: World, me: ShipRecord, p: { x: number; y: number }, bound: Bound = 'loose'): boolean {
  return eyeSeen(w, me, p, CONFIG.vision.splashSight, bound);
}

/** A live projectile by kind: a shell at the shell reach, a torpedo at the
 *  torpedo reach (binds the reveals, the torpU updates and the visit ledger). */
function projectileSeen(w: World, me: ShipRecord, sh: { kind: 'shell' | 'torp' }, p: { x: number; y: number }, bound: Bound = 'loose'): boolean {
  return eyeSeen(w, me, p, sh.kind === 'torp' ? CONFIG.vision.torpedoSight : CONFIG.vision.shellSight, bound);
}

/** A laid mine: the mine reach. */
function mineSeen(w: World, me: ShipRecord, p: { x: number; y: number }, bound: Bound = 'loose'): boolean {
  return eyeSeen(w, me, p, CONFIG.vision.mineSight, bound);
}

/** A crate's KIND: the crate-kind reach. */
function crateSeen(w: World, me: ShipRecord, p: { x: number; y: number }, bound: Bound = 'loose'): boolean {
  return eyeSeen(w, me, p, CONFIG.vision.crateKindSight, bound);
}

// The Story 1.7 owned-zone reveal source, reimplemented test-locally (NEVER
// the production ownZoneCovers): a lit zone OWNED by the observer covers `p`
// iff dist(p, center) ≤ r — deliberately NO island-LOS term ("lit from above")
// and NEVER anyone else's zone. No cloud term (Story 9.3 session 2: a cloud
// hides nothing, so amendment 142's flare-blinding is retired).
function zoneCovers(w: World, me: ShipRecord, p: { x: number; y: number }): boolean {
  for (const zone of w.litZones.values()) {
    if (zone.ownerId === me.id && dist(zone, p) <= zone.r) return true;
  }
  return false;
}

// Structural over anything carrying a sweep window (the radar buoy's own beam
// used this too until Story 8.16 deleted the buoy).
function inPaintWindow(me: { sweepAngle: number; prevSweepAngle: number }, brg: number): boolean {
  const window = wrapPositive(me.sweepAngle - me.prevSweepAngle);
  return wrapPositive(brg - me.prevSweepAngle) < window;
}

// (The radar DROPOUT oracle of Story 9.8 — `dropoutOracle`, its ledger and
// `revWhere` — was DELETED 2026-11-12 with the dropout itself: Story 11.2,
// R8. No radar oracle below has a roll term.)

// ---------- Story 4.11: the radar-shadow oracle (independently re-derived) ----
//
// The blip row's occlusion term is no longer island LOS: it is the height-
// aware shadow (amendment 179). Re-derived here from the ruling's LAW — never
// the production radarShadow module (the header's reimplementation rule):
// fold every LAND raster cell the observer→target ray ENTERS at distance
// 0 < entry < dist into
//
//     a_i = (1 − q_i/64) / entry + entry / K
//
// (H = q64 mast height as a LITERAL, never CONFIG.vision.radarMastQ; K = the
// BASE radar range squared over 4 — derived from the ruler since Story 9.8,
// never the observer's own range: K stays a world constant even for a
// boon-widened observer, amendment 185), and the target is disclosed iff
// dist · (min_i a_i − dist/K) > 0 — a PARTIALLY
// illuminated hull still paints; only full shadow deletes the blip.
//
// A CELL NEVER OCCLUDES A QUERY POINT INSIDE IT, AT EITHER END OF THE RAY: the
// observer's own cell is exempt (its entry is ≤ 0 — nothing at distance 0
// stands between the antenna and anything, and u/d is undefined there), and so
// is the TARGET's own cell (the ray has not LEFT it by the time it reaches the
// target). That two-ended rule is what makes the model SYMMETRIC — A paints B
// exactly when B paints A — and without the far end a hull whose centre rounds
// into a hard-cover cell would be a one-way stealth pocket: invisible to
// everyone, seeing everyone. Off-raster travel is transparent.
// TRAVERSAL IS DELIBERATELY DIFFERENT from production: instead
// of the DDA + max-height-pyramid walk, this oracle slab-tests every raster
// cell in the segment's bounding box — but every entry distance is derived
// from the same cell-boundary coordinates ((boundary − origin) / dir), and
// the direction is normalized twice exactly as the production one-shot path
// normalizes it, so the two implementations can only ever disagree on a
// target sitting exactly on the visibility root.

/** CONFIG.vision.radarMastQ as a literal (the oracle rule). */
const MAST_Q = 64;
/** Base radar² / 4 — never the observer's boon-widened radar range
 *  (amendment 185: K is a world constant). Derived from the twelfths ruler
 *  (Story 9.8) rather than a literal, so a ladder retune moves it. */
const SHADOW_K = RADAR ** 2 / 4;

/** [tEnter, tExit] of the ray against one axis slab, or null for a miss. */
function axisSlab(o: number, dir: number, min: number, max: number): readonly [number, number] | null {
  if (dir === 0) return o >= min && o <= max ? [-Infinity, Infinity] : null;
  const t1 = (min - o) / dir;
  const t2 = (max - o) / dir;
  return t1 < t2 ? [t1, t2] : [t2, t1];
}

/** a_i for raster cell (i, j) against the unit ray, or null when the cell is
 *  sea, missed, or EXEMPT AT EITHER END OF THE RAY — the observer's own cell
 *  (entry ≤ 0) and the TARGET's own cell, plus anything past the target.
 *  The far-end rule is RE-DERIVED here from the slab geometry rather than
 *  copied from production's "entry distance of the target's cell" fold limit:
 *  a cell occludes only once the ray has LEFT it before reaching the target,
 *  i.e. iff its EXIT distance is at or before `len`. The cell CONTAINING the
 *  target is the one the ray is still inside at `len` (exit > len), so it
 *  never folds — which is exactly what keeps the model symmetric (see the
 *  section header). A corner graze (exit == entry) folds — the DDA folds the
 *  corner cell too. */
function cellAOracle(
  r: HeightRaster,
  ox: number,
  oy: number,
  ux: number,
  uy: number,
  len: number,
  i: number,
  j: number,
): number | null {
  const q = r.height[j * r.n + i];
  if (q <= 0) return null;
  const sx = axisSlab(ox, ux, r.x0 + (i - 0.5) * r.cell, r.x0 + (i + 0.5) * r.cell);
  const sy = axisSlab(oy, uy, r.y0 + (j - 0.5) * r.cell, r.y0 + (j + 0.5) * r.cell);
  if (sx === null || sy === null) return null;
  const entry = Math.max(sx[0], sy[0]);
  const exit = Math.min(sx[1], sy[1]);
  if (exit < entry) return null; // ray misses the cell square
  if (entry <= 0 || entry >= len) return null; // observer's own cell; fold strictly nearer only
  if (exit > len) return null; // the target's own cell: the ray is still inside it at `len`
  return (1 - q / MAST_Q) / entry + entry / SHADOW_K;
}

/** min a_i over every land cell in the segment's bounding box (±1 cell). */
function shadowAMinOracle(r: HeightRaster, ox: number, oy: number, ux: number, uy: number, len: number): number {
  const tx = ox + ux * len;
  const ty = oy + uy * len;
  const iLo = Math.max(0, Math.floor((Math.min(ox, tx) - r.x0) / r.cell - 0.5) - 1);
  const iHi = Math.min(r.n - 1, Math.ceil((Math.max(ox, tx) - r.x0) / r.cell + 0.5) + 1);
  const jLo = Math.max(0, Math.floor((Math.min(oy, ty) - r.y0) / r.cell - 0.5) - 1);
  const jHi = Math.min(r.n - 1, Math.ceil((Math.max(oy, ty) - r.y0) / r.cell + 0.5) + 1);
  let aMin = Infinity;
  for (let j = jLo; j <= jHi; j++) {
    for (let i = iLo; i <= iHi; i++) {
      const a = cellAOracle(r, ox, oy, ux, uy, len, i, j);
      if (a !== null && a < aMin) aMin = a;
    }
  }
  return aMin;
}

/** The oracle's gate decision: is `p` at least partially illuminated on the
 *  observer→p bearing? Degenerate rays fail OPEN (the ruling's rule — fail
 *  closed would hide legitimate contacts). */
function shadowVisible(w: World, me: ShipRecord, p: { x: number; y: number }): boolean {
  return shadowVisibleFrom(w, me.state, p);
}

/** The same gate from an arbitrary antenna position (Story 7-5 wave 2: the
 *  radar BUOY's shadow march runs from the BUOY, not from any ship — same
 *  law, same K and mast constants, different origin). */
function shadowVisibleFrom(w: World, o: { x: number; y: number }, p: { x: number; y: number }): boolean {
  const dx = p.x - o.x;
  const dy = p.y - o.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (!Number.isFinite(len) || len <= 0) return true;
  // The production one-shot path normalizes dx/len and then re-normalizes the
  // result; mirror both steps so entry distances are bit-identical and only a
  // true root-sitter could ever disagree.
  const nx = dx / len;
  const ny = dy / len;
  const ul = Math.sqrt(nx * nx + ny * ny);
  const aMin = shadowAMinOracle(w.map.heightRaster, o.x, o.y, nx / ul, ny / ul, len);
  return aMin === Infinity || len * (aMin - len / SHADOW_K) > 0;
}

// ---------- world construction helpers ---------------------------------------

/** World whose islands are cleared for exact-geometry directed cases. The
 *  height raster is flattened too (Story 4.11): the real generated terrain
 *  must not radar-shadow a world the test built as empty water. */
function bareWorld(seed = 1, opts: WorldOptions = {}): World {
  const w = new World(seed, CONFIG.match.fillTo, CONFIG.zone, opts);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

/** Add a ship and teleport it to an exact pose (speed 0). `shift` is the
 *  seat's pick (Story 10.4 — the seat gun's successor) and `hull` its class —
 *  the fuzz draws both at random; directed cases default to the defaults. */
function place(w: World, id: string, x: number, y: number, heading = 0, shift: ShiftId = DEFAULT_SHIFT, hull: HullId = DEFAULT_CLASS_ID): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), undefined, hull, undefined, undefined, shift);
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = heading;
  rec.state.speed = 0;
  // PARK THE BEAM AT 0. addShip anchors a fresh sweep to the hull's SPAWN-RING
  // heading (Eric ruling 2026-08-16); this helper then discards that placement
  // by teleporting the hull, so an un-parked beam would start at an angle
  // derived from geometry no test here scripts. A teleporting fixture must
  // script the beam too — windowAround does it explicitly wherever a window is
  // load-bearing; this is the same rule applied to the default.
  rec.sweepAngle = 0;
  rec.prevSweepAngle = 0;
  return rec;
}

/** Open the observer's paint window around a bearing (without stepping). */
function windowAround(me: ShipRecord, brg: number, halfWidth = 0.02): void {
  me.prevSweepAngle = wrapPositive(brg - halfWidth);
  me.sweepAngle = wrapPositive(brg + halfWidth);
}

function injectShell(
  w: World,
  id: string,
  ownerId: string,
  x: number,
  y: number,
  dir: number,
  distLeft: number,
  targeted = false,
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
    // `targeted` mirrors the real gun: a burst point distLeft along the
    // bearing, so the invariant worlds exercise burst events too. Untargeted
    // is the contact-only legacy shape.
    targetX: targeted ? x + Math.cos(dir) * distLeft : null,
    targetY: targeted ? y + Math.sin(dir) * distLeft : null,
    burstRadius: targeted ? CONFIG.gun.burstRadius : 0,
    contactDamage: targeted ? CONFIG.gun.contactDamage : CONFIG.gun.damage,
    hits: kind === 'torp' ? CONFIG.torpedo.hits : CONFIG.gun.hits,
  });
}

/** Drop a mine directly into world state (armed by default; a NAVAL mine
 *  unless the case says otherwise — Story 8.13 stamps the laying line's kind). */
function injectMine(w: World, id: string, ownerId: string, x: number, y: number, armedAt = 0, kind: MineKind = 'naval'): void {
  w.mines.set(id, { id, ownerId, x, y, armedAt, kind, hp: 10 });
}

/** Drop a lit zone directly into world state (Story 1.7; far-future expiry). */
function injectZone(
  w: World,
  id: string,
  ownerId: string,
  x: number,
  y: number,
  r = CONFIG.starShells.litRadius,
  until = 999_999,
): void {
  w.litZones.set(id, { id, ownerId, x, y, r, until });
}

/** Drop a PHOSPHOR burning zone directly into world state (Story 8.17) —
 *  the injectZone sibling over the SEPARATE `burnZones` store. */
function injectBurnZone(
  w: World,
  id: string,
  ownerId: string,
  x: number,
  y: number,
  r: number = CONFIG.phosphorShells.zoneRadius,
  until = 999_999,
  dps: number = CONFIG.phosphorShells.dps,
): void {
  w.burnZones.set(id, { id, ownerId, x, y, r, until, dps });
}

/** Drop a FOULING SHELL foul zone directly into world state (Story 9.4) —
 *  the injectBurnZone sibling over the SEPARATE `foulZones` store. */
function injectFoulZone(
  w: World,
  id: string,
  ownerId: string,
  x: number,
  y: number,
  r: number = CONFIG.foulingShell.radius,
  until = 999_999,
): void {
  w.foulZones.set(id, { id, ownerId, x, y, r, until });
}

/** Drop a MULTI-SPECTRAL COUNTERMEASURE cloud directly into world state
 *  (Story 9.3) — the injectMine posture: a raw store write, never the
 *  production press path. `bornAt` defaults to "now" (a fresh cloud); `until`
 *  is the literal 15 s life; the cached base is the shared generator's (the
 *  store's own memo, exactly as production caches it at the press). */
function injectCloud(w: World, id: string, ownerId: string, x: number, y: number, bornAt = w.now): void {
  w.clouds.set(id, { id, ownerId, x, y, bornAt, until: bornAt + CLOUD_LIFE_MS, ...CLOUD_STAMP });
}

/** Push a raw world-emitted event onto the world's tick-event list — the exact
 *  buffer perception.forwardedEvents() dispatches, reached the same way the
 *  world's own step does (the field is private only to production callers). */
function emitWorldEvent(w: World, e: GameEvent): void {
  (w as unknown as { events: GameEvent[] }).events.push(e);
}

const blipsOf = (f: FrameMsg) => f.events.filter((e): e is BlipEvent => e.k === 'blip');
const shellsOf = (f: FrameMsg) => f.events.filter((e): e is BallisticEvent => e.k === 'shell');
const boomsOf = (f: FrameMsg) => f.events.filter((e): e is BoomEvent => e.k === 'boom');

/**
 * Structural anti-cheat guard: a ballistic event may carry ONLY these keys. Any
 * extra field (a returning `ttl`/`distLeft`, or a launch position tag) is
 * range-derivable and would let a modified client solve back to the fogged
 * muzzle — so its mere PRESENCE fails the test. See BallisticEvent's note.
 *
 * THE ONE DECLARED WIDENING (Story 8.15, amendment 89(i)): a `shell` reveal
 * MAY carry `w`, and when it does the value is one of the three family words
 * and nothing else — a `torp` reveal NEVER carries it. `w` is not
 * range-derivable (the three families share one shell speed and one range
 * rung) and names no shooter, so the constant-free argument stands.
 */
const BALLISTIC_KEYS = ['id', 'k', 't', 'vx', 'vy', 'x', 'y'];
const BALLISTIC_KEYS_WITH_FAMILY = ['id', 'k', 't', 'vx', 'vy', 'w', 'x', 'y'];
function assertBallisticShape(e: BallisticEvent): void {
  const keys = Object.keys(e).sort();
  // Every World-launched `shell` names its family; a `torp` never does.
  expect('w' in e).toBe(e.k === 'shell');
  if (e.k === 'shell') {
    expect(keys).toEqual(BALLISTIC_KEYS_WITH_FAMILY);
    expect(SHELL_FAMILIES).toContain(e.w);
    return;
  }
  expect(keys).toEqual(BALLISTIC_KEYS);
  expect('w' in e).toBe(false); // a torpedo (or a family-less shell) never carries it
}

// ---------- directed cases: sight tier ---------------------------------------

describe('perception — sight tier boundaries (exact)', () => {
  it('a ship at exactly sight range is a contact (boundary inclusive)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    const b = place(w, 'b', SIGHT, 0, 1.5);
    const f = buildFrame(w, 'a');
    expect(f.contacts).toEqual([
      { id: 'b', x: b.state.x, y: b.state.y, heading: 1.5, speed: 0, cls: DEFAULT_CLASS_ID, tu: encodeTurretAngles(b.turrets, b.hullId) },
    ]);
  });

  it('a ship just outside sight range is invisible', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', SIGHT + 0.01, 0);
    expect(buildFrame(w, 'a').contacts).toEqual([]);
  });

  it('a ship inside sight but behind an island is invisible (LOS rule)', () => {
    const w = bareWorld();
    w.map.islands.push(circleIsland(75, 0, 30));
    place(w, 'a', 0, 0);
    place(w, 'b', 150, 0);
    expect(buildFrame(w, 'a').contacts).toEqual([]);
    // ...and stepping aside restores the contact.
    w.ships.get('b')!.state.y = 120;
    expect(buildFrame(w, 'a').contacts.map((c) => c.id)).toEqual(['b']);
  });

  it('a foundered hull carries no wake-draft lift on the wire (Story 8.19)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    const b = place(w, 'b', 100, 0);
    w.respawnEnabled = false;
    w.sinkShip('b');
    w.step(CONFIG.ship.sinkingWindowMs);
    expect(isAfloat(b.lifecycle) || isSinking(b.lifecycle)).toBe(false);
    // A stale lift planted on the sunk record is restamped to 0 by the next
    // step (off the water) and never reaches the wire.
    b.draft = 0.03;
    w.step();
    expect(b.draft).toBe(0);
    const f = buildFrame(w, 'b');
    if (f.you !== undefined) expect('draft' in f.you).toBe(false);
    expect(JSON.stringify(f)).not.toContain('"draft"');
  });

  it('dead ships are never contacts; a viewer with no ship sees nothing', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    const b = place(w, 'b', 100, 0);
    w.respawnEnabled = false;
    w.sinkShip('b');
    // Story 5.2 (amendment 15 seam 3): while SINKING, b is deliberately still
    // a contact — it vanishes only at founder. Assert both halves.
    expect(buildFrame(w, 'a').contacts.map((c) => c.id)).toEqual(['b']);
    w.step(CONFIG.ship.sinkingWindowMs);
    expect(isAfloat(b.lifecycle)).toBe(false);
    expect(buildFrame(w, 'a').contacts).toEqual([]);
    const watcher = buildFrame(w, 'watcher');
    expect(watcher.contacts).toEqual([]);
    expect(watcher.events).toEqual([]);
  });
});

// ---------- directed cases: the two eye tiers (Story 11.2, R3) ----------------
//
// Inside the CLASS-AND-NAME reach a hull is a full contact; beyond it and
// inside the PLAIN-HULL reach it is a `pc` row — its pose under an anonymous
// per-observer, per-visit handle and nothing else. Every frame below also
// passes verifyFrame (verifyPlain is its outer-tier line), except where a
// comment says why not.

describe('perception — the two eye tiers (Story 11.2, R3)', () => {
  const PLAIN_KEYS = ['h', 'x', 'y', 'heading', 'speed'];
  /** A distinctive roster id, longer than any handle, so a text scan for it cannot hit a handle by chance. */
  const TARGET = 'target-hull';

  /** Build the viewer's frame and run it through the whole invariant. */
  function look(w: World, viewer: string, phase: MatchPhase = 'active'): FrameMsg {
    const f = buildFrame(w, viewer, phase);
    verifyFrame(w, viewer, f);
    return f;
  }

  /** The viewer's ONE plain row this tick (the case scripts exactly one hull into the band). */
  function onePlain(w: World, viewer: string): PlainContact {
    const f = look(w, viewer);
    expect(f.pc).toHaveLength(1);
    return f.pc![0];
  }

  it('boundaries, exact: a hull at exactly the class reach is a contact; a hair beyond it is ONE plain row — its true pose, no id, no class; at exactly the hull reach still a plain row; a hair beyond, on neither tier', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    const t = place(w, TARGET, SIGHT, 0, 1.5);
    t.state.speed = 7;
    const atClass = look(w, 'a');
    expect(atClass.contacts.map((c) => c.id)).toEqual([TARGET]);
    expect('pc' in atClass).toBe(false);

    t.state.x = SIGHT + 0.01;
    const justPast = look(w, 'a');
    expect(justPast.contacts).toEqual([]);
    expect(justPast.pc).toHaveLength(1);
    const row = justPast.pc![0];
    expect(Object.keys(row)).toEqual(PLAIN_KEYS);
    expect({ ...row, h: '' }).toEqual({ h: '', x: t.state.x, y: 0, heading: 1.5, speed: 7 });
    expect(JSON.stringify(row)).not.toContain(TARGET);
    expect(JSON.stringify(row)).not.toContain(t.hullId);

    t.state.x = HULL_SIGHT;
    const atHull = look(w, 'a');
    expect(atHull.contacts).toEqual([]);
    expect(atHull.pc?.map((r) => r.x)).toEqual([HULL_SIGHT]);

    t.state.x = HULL_SIGHT + 0.01;
    const beyond = look(w, 'a');
    expect(beyond.contacts).toEqual([]);
    expect('pc' in beyond).toBe(false);
  });

  it('island LOS blocks the plain tier exactly as it blocks contacts: a hull in the band behind a rock is on neither tier, and stepping aside restores the plain row', () => {
    const w = bareWorld();
    w.map.islands.push(circleIsland(PLAIN_D / 2, 0, SIGHT / 100)); // squarely on the ray
    place(w, 'a', 0, 0);
    const t = place(w, TARGET, PLAIN_D, 0);
    const blocked = look(w, 'a');
    expect(blocked.contacts).toEqual([]);
    expect('pc' in blocked).toBe(false);
    t.state.x = 0;
    t.state.y = PLAIN_D; // the same range, a clear ray
    expect(onePlain(w, 'a').y).toBe(PLAIN_D);
  });

  it('the handle: stable while the hull stays in the band, FRESH after it leaves and returns (moved out, or the observer flashed blind for a frame), different for two observers of the same hull in the same tick, never a ship id', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'c', 0, SIGHT / 100); // a second observer beside the first
    const t = place(w, TARGET, PLAIN_D, 0);
    const first = onePlain(w, 'a').h;
    expect(onePlain(w, 'a').h).toBe(first); // the same visit: the same handle, frame after frame
    expect(onePlain(w, 'a').h).toBe(first);
    // Visit 2: the hull goes beyond the hull reach for a frame and comes back.
    t.state.x = HULL_SIGHT + PLAIN_D;
    expect('pc' in look(w, 'a')).toBe(false);
    t.state.x = PLAIN_D;
    const second = onePlain(w, 'a').h;
    // Visit 3: the observer is flashed blind for a frame (every eye reach 0).
    a.dazzledUntil = flashMark(w);
    expect('pc' in look(w, 'a')).toBe(false);
    a.dazzledUntil = 0;
    const third = onePlain(w, 'a').h;
    expect(new Set([first, second, third]).size).toBe(3);
    // Another observer of the same hull, the same tick: its own handle.
    const other = look(w, 'c');
    expect(other.contacts.map((k) => k.id)).toEqual(['a']);
    expect(other.pc).toHaveLength(1);
    expect([first, second, third]).not.toContain(other.pc![0].h);
    for (const h of [first, second, third, other.pc![0].h]) expect(w.ships.has(h)).toBe(false);
  });

  it('the crossing: a hull moved from the band to inside the class reach is a contact and gone from pc in that same frame — never both; moved back out it is a plain row under a NEW handle', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    const t = place(w, TARGET, PLAIN_D, 0);
    const before = onePlain(w, 'a').h;
    t.state.x = SIGHT / 2;
    const inside = look(w, 'a');
    expect(inside.contacts.map((c) => c.id)).toEqual([TARGET]);
    expect('pc' in inside).toBe(false);
    t.state.x = PLAIN_D;
    const after = look(w, 'a');
    expect(after.contacts).toEqual([]);
    expect(after.pc).toHaveLength(1);
    expect(after.pc![0].h).not.toBe(before);
  });

  it("an OWNED lit zone over a hull in the band makes it a FULL contact (and no plain row); someone else's zone leaves it a plain row", () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    const t = place(w, TARGET, PLAIN_D, 0, 0.9);
    injectZone(w, 'theirs', 'someone-else', PLAIN_D, 0);
    const foreign = look(w, 'a');
    expect(foreign.contacts).toEqual([]);
    expect(foreign.pc).toHaveLength(1);
    w.litZones.clear();
    injectZone(w, 'mine', 'a', PLAIN_D, 0);
    const owned = look(w, 'a');
    expect(owned.contacts).toEqual([
      { id: TARGET, x: PLAIN_D, y: 0, heading: 0.9, speed: 0, cls: t.hullId, tu: encodeTurretAngles(t.turrets, t.hullId) },
    ]);
    expect('pc' in owned).toBe(false);
  });

  it('spectators: a finished-phase frame lists the plain-band hull as a full contact and carries no pc', () => {
    const w = bareWorld();
    place(w, TARGET, PLAIN_D, 0);
    const a = place(w, 'a', 0, 0);
    expect(look(w, 'a').pc).toHaveLength(1); // the fogged frame holds it as a plain row
    // (verifyFrame's contact line is the FOGGED one — it rejects the viewer's
    // own hull, which a finished-phase frame lists — so the unfogged frame
    // goes through the outer tier's own line.)
    const spec = buildFrame(w, 'a', 'finished');
    verifyPlain(w, a, spec);
    expect(spec.spec).toBe(true);
    expect(spec.contacts.map((c) => c.id)).toContain(TARGET);
    expect('pc' in spec).toBe(false);
  });

  describe('identity stays on the class reach', () => {
    /** The observer's view of a blow on, the sinking of, and a spawn at a hull `d` away (the world steps: both hulls on the board). */
    function identityAt(d: number, verifySunkFrame: boolean): { boom: BoomEvent | undefined; sunk: SunkEvent[]; spawns: GameEvent[] } {
      const w = bareWorld();
      place(w, 'a', -d / 2, 0);
      const t = place(w, TARGET, d / 2, 0);
      t.hp = 100; // survives the blow
      w.respawnEnabled = false;
      // A spawn event at the hull's point (the row's payload is a roster id).
      emitWorldEvent(w, { k: 'spawn', id: TARGET, x: t.state.x, y: t.state.y });
      const spawns = look(w, 'a').events.filter((e) => e.k === 'spawn' && e.id === TARGET);
      // A third party's shell, one tick from striking the hull.
      injectShell(w, 's1', 'someone-else', d / 2 - 20, 0, 0, 100);
      w.step();
      const boom = boomsOf(look(w, 'a')).find((e) => e.id === 's1');
      expect(boomsOf(buildFrame(w, TARGET)).find((e) => e.id === 's1')?.hit).toBe(TARGET); // the blow landed
      w.sinkShip(TARGET, 'someone-else');
      w.step();
      // (verifyFrame's contact line demands an AFLOAT hull, so the in-sight
      // control — where the sinking hull is still a contact, Story 5.2 — is
      // read without it.)
      const f = verifySunkFrame ? look(w, 'a') : buildFrame(w, 'a');
      return { boom, sunk: f.events.filter((e): e is SunkEvent => e.k === 'sunk'), spawns };
    }

    it('in the plain band: a boom on the hull arrives WITHOUT hit, its sinking is the public row WITHOUT seen, and a spawn at its point does not arrive', () => {
      const seen = identityAt(PLAIN_D, true);
      expect(seen.boom).toBeDefined(); // the splash reach covers the band: the impact is watched...
      expect('hit' in seen.boom!).toBe(false); // ...but it names nobody
      expect(seen.sunk).toEqual([{ k: 'sunk', id: TARGET, by: 'someone-else' }]);
      expect(seen.spawns).toEqual([]);
    });

    it('inside the class reach: the same boom carries hit, the same sinking carries seen: true, the same spawn arrives', () => {
      const seen = identityAt(SIGHT / 2, false);
      expect(seen.boom?.hit).toBe(TARGET);
      expect(seen.sunk).toEqual([{ k: 'sunk', id: TARGET, by: 'someone-else', seen: true }]);
      expect(seen.spawns).toHaveLength(1);
    });
  });

  it('order: with three hulls in the band the pc rows are sorted by handle — a payload-only order, never the roster order', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    const hulls = [0, 1, 2].map((i) => place(w, `hull-${i}`, 0, 0));
    const VISITS = 12;
    let reordered = 0;
    for (let visit = 0; visit < VISITS; visit++) {
      hulls.forEach((hull, i) => {
        const brg = (i * TAU) / hulls.length;
        hull.state.x = PLAIN_D * Math.cos(brg);
        hull.state.y = PLAIN_D * Math.sin(brg);
      });
      const rows = look(w, 'a').pc ?? [];
      expect(rows).toHaveLength(hulls.length);
      const handles = rows.map((r) => r.h);
      expect(handles).toEqual([...handles].sort());
      // Which hull each row is (by pose), against the roster's insertion order.
      const order = rows.map((r) => hulls.findIndex((hull) => hull.state.x === r.x && hull.state.y === r.y));
      if (order.join() !== [0, 1, 2].join()) reordered += 1;
      // Every hull leaves the band for a frame, so the next visit mints fresh handles.
      for (const hull of hulls) {
        hull.state.x = 0;
        hull.state.y = HULL_SIGHT + PLAIN_D;
      }
      expect('pc' in look(w, 'a')).toBe(false);
    }
    expect(reordered).toBeGreaterThan(0); // non-vacuous: the handle order is not the insertion order
  });
});

// ---------- directed cases: radar tier ---------------------------------------

describe('perception — radar paint window (exact)', () => {
  it('paints a ship in the annulus when the beam crosses its bearing — the identity-free footprint of its LIVE pose (cycle 63)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', ANNULUS_D, 0, 0.7);
    b.state.speed = 12; // speed never rides the wire — the mask is pose geometry only
    windowAround(a, 0);
    const blips = blipsOf(buildFrame(w, 'a'));
    expect(blips).toHaveLength(1);
    expect(blips[0].t).toBe(w.now);
    expect(maskEquals(maskOracle(w, a.state, DEFAULT_CLASS_ID, b.state.x, b.state.y, 0.7, w.now), blips[0])).toBe(true);
  });

  it('does not paint outside the beam window', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', ANNULUS_D, 0); // bearing 0
    windowAround(a, Math.PI); // beam on the far side
    expect(blipsOf(buildFrame(w, 'a'))).toEqual([]);
  });

  it('radar boundary is exact: paints at dist == radar, not just beyond', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', RADAR, 0);
    windowAround(a, 0);
    expect(blipsOf(buildFrame(w, 'a'))).toHaveLength(1);
    w.ships.get('b')!.state.x = RADAR + 0.01;
    windowAround(a, 0);
    expect(blipsOf(buildFrame(w, 'a'))).toEqual([]);
  });

  it('inside sight a swept hull is a contact AND a blip (amendment 210: the entire sweep)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', SIGHT, 0); // exactly at sight => sighted
    windowAround(a, 0);
    const f = buildFrame(w, 'a');
    expect(f.contacts.map((c) => c.id)).toEqual(['b']);
    const blips = blipsOf(f);
    expect(blips).toHaveLength(1);
    expect(maskEquals(maskOracle(w, a.state, b.hullId, b.state.x, b.state.y, b.state.heading, w.now), blips[0])).toBe(true);
    // ...and only when swept: the beam elsewhere leaves the contact alone.
    windowAround(a, Math.PI);
    const g = buildFrame(w, 'a');
    expect(g.contacts.map((c) => c.id)).toEqual(['b']);
    expect(blipsOf(g)).toEqual([]);
  });

  it('HARD terrain cover (h ≥ mast) blocks the blip; a LOW island on the same bearing discloses it (Story 4.11, amendment 179)', () => {
    // Terrain occlusion is now the height raster, never the island polygons:
    // a q255 wall between observer and target kills the paint outright…
    const w = bareWorld();
    w.map.heightRaster = rasterFrom(700, ridgeField(200, 0, 40, 40, 255));
    const a = place(w, 'a', 0, 0);
    place(w, 'b', ANNULUS_D, 0);
    windowAround(a, 0);
    expect(blipsOf(buildFrame(w, 'a'))).toEqual([]);
    // …while a quarter-mast (q16) island on the identical bearing leaves the
    // target PARTIALLY illuminated (0 < vis < 1) — and partial discloses.
    // This is the genuine disclosure widening the ruling accepts: the old
    // binary rule deleted this blip.
    w.map.heightRaster = rasterFrom(700, ridgeField(200, 0, 40, 40, 16));
    windowAround(a, 0);
    expect(blipsOf(buildFrame(w, 'a'))).toHaveLength(1);
  });

  it('soft cover still goes dark past its residual reach (the shadow runs to the rim)', () => {
    // A half-mast (q32) ridge whose worst-case reach lands INSIDE the scope:
    // ridge at e* = √(K/2) (the worst placement for u = 1/2), whose residual
    // reach is 2e* — derived from K = radar²/4, so it follows the radar reach.
    const eStar = Math.sqrt(SHADOW_K / 2);
    const reach = 2 * eStar;
    expect(reach).toBeLessThan(RADAR); // the root lies inside the scope
    const w = bareWorld();
    w.map.heightRaster = rasterFrom(RADAR, ridgeField(eStar, 0, 20, 40, 32));
    const a = place(w, 'a', 0, 0);
    const past = (reach + RADAR) / 2; // inside radar, beam swept — but past the reach
    const b = place(w, 'b', past, 0);
    windowAround(a, 0);
    expect(shadowVisible(w, a, b.state)).toBe(false);
    expect(blipsOf(buildFrame(w, 'a'))).toEqual([]);
    // The SAME ridge does not darken a nearer target on the same bearing:
    // behind the ridge, short of its residual reach.
    b.state.x = (eStar + reach) / 2;
    windowAround(a, 0);
    expect(shadowVisible(w, a, b.state)).toBe(true);
    expect(blipsOf(buildFrame(w, 'a'))).toHaveLength(1);
  });

  it('a polygon island with NO raster presence no longer occludes radar (sight keeps binary island LOS)', () => {
    // The seam made explicit: circleIsland is polygon geometry only. It still
    // blocks SIGHT (losClear is untouched) but casts no radar shadow — the
    // raster is the blip gate's ONLY occlusion input.
    const w = bareWorld();
    w.map.islands.push(circleIsland(200, 0, 40));
    const a = place(w, 'a', 0, 0);
    place(w, 'b', ANNULUS_D, 0); // beyond sight, behind the polygon — still paints
    place(w, 'c', 250, 0); // inside sight, behind the polygon — no contact, but radar's rule paints it (amendment 210)
    windowAround(a, 0);
    const f = buildFrame(w, 'a');
    expect(f.contacts).toEqual([]); // sight stays island-LOS-blocked
    expect(blipsOf(f)).toHaveLength(2);
  });

  it('a hull whose CENTRE sits inside a hard-cover cell still paints, from every bearing (the far-end exemption)', () => {
    // The symmetry clause: a cell cannot occlude a query point INSIDE it, at
    // either end of the ray. Navigable water sits in cells well under the q64
    // mast threshold, but nothing structural pins that gap — and a hull whose
    // centre rounded into a hard-cover cell would otherwise be a ONE-WAY
    // stealth pocket (it paints everyone, nobody paints it), breaking "A paints
    // B exactly when B paints A". A fresh world per bearing so the only hulls
    // on the water are this observer and this target.
    for (let n = 0; n < 16; n++) {
      const brg = (n * TAU) / 16;
      const w = bareWorld();
      // Exactly ONE land sample — the q255 raster cell centred on the origin.
      // Every other cell, and therefore the whole of every ray up to the
      // target's own cell, is open water.
      w.map.heightRaster = rasterFrom(700, ridgeField(0, 0, 1, 1, 255));
      const b = place(w, 'b', 2, 1); // inside that cell, off its centre
      const a = place(w, 'a', ANNULUS_D * Math.cos(brg), ANNULUS_D * Math.sin(brg));
      windowAround(a, bearing(a.state, b.state));
      // Non-vacuous: the target really is in the radar annulus, not sighted.
      expect(dist(a.state, b.state)).toBeGreaterThan(effSight(w, a));
      expect(dist(a.state, b.state)).toBeLessThanOrEqual(effRadar());
      expect(blipsOf(buildFrame(w, 'a'))).toHaveLength(1);
      expect(shadowVisible(w, a, b.state)).toBe(true); // …and the oracle agrees
    }
  });
});

describe('perception — exactly once per revolution (incl. 2π wrap)', () => {
  it('each target paints exactly once per revolution, wrap tick included', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    // Mid-window bearings (δ/2 margin from window seams) so FP accumulation
    // over 160 wrapPositive additions cannot shift a paint across a seam.
    const firstBrg = SWEEP_DELTA / 2; // painted by the first window [0, δ)
    place(w, 'b', ANNULUS_D * Math.cos(firstBrg), ANNULUS_D * Math.sin(firstBrg));
    const wrapBrg = -SWEEP_DELTA / 2; // painted by the wrap window [2π−δ, 2π)
    place(w, 'c', ANNULUS_D * Math.cos(wrapBrg), ANNULUS_D * Math.sin(wrapBrg));

    const paints = new Map<string, number[]>([['b', []], ['c', []]]);
    // The wire carries no id, so a paint is attributed by which hull's cell
    // its mask lights (b and c sit on well-separated bearings).
    const cellU = CONFIG.vision.radarCellU;
    const covers = (e: BlipEvent, ship: ShipRecord): boolean =>
      coverageHas(e, Math.floor(ship.state.x / cellU) - e.gx, Math.floor(ship.state.y / cellU) - e.gy);
    let expectedSweep = 0;
    for (let tick = 1; tick <= 2 * TICKS_PER_REV; tick++) {
      w.step();
      expectedSweep = wrapPositive(expectedSweep + SWEEP_DELTA);
      const f = buildFrame(w, 'a');
      // OwnShip.sweep is the post-advance angle == this tick's window end
      // (identical accumulation => exact equality expected).
      expect(f.you!.sweep).toBe(expectedSweep);
      for (const e of blipsOf(f)) {
        if (covers(e, w.ships.get('b')!)) paints.get('b')!.push(tick);
        else if (covers(e, w.ships.get('c')!)) paints.get('c')!.push(tick);
      }
    }
    expect(paints.get('b')).toEqual([1, 1 + TICKS_PER_REV]);
    expect(paints.get('c')).toEqual([TICKS_PER_REV, 2 * TICKS_PER_REV]);
  });
});

// ---------- directed cases: event visibility ---------------------------------

describe('perception — shell events (per-observer, exactly once)', () => {
  it('the owner always gets its shell event, even far away; others do not', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    const b = place(w, 'b', 100, 0);
    injectShell(w, 's1', 'a', ANNULUS_D, 0, 0, 300); // beyond every eye reach, of the owner and of b alike
    expect(dist(b.state, w.shells.get('s1')!)).toBeGreaterThan(SHELL_SIGHT); // premise: b's eye cannot have it
    const fa = buildFrame(w, 'a');
    expect(shellsOf(fa).map((e) => e.id)).toEqual(['s1']);
    expect(shellsOf(buildFrame(w, 'b'))).toEqual([]);
    // exactly once: the owner is not re-sent the same shell.
    expect(shellsOf(buildFrame(w, 'a'))).toEqual([]);
  });

  it('a shell first entering the shell reach arrives with CURRENT params, once', () => {
    const w = bareWorld();
    // The world STEPS: both hulls sit on the board, ANNULUS_D apart.
    const a = place(w, 'a', -FAR_HALF, 0);
    place(w, 'b', FAR_HALF, 0);
    // b's shell, a few ticks of flight outside a's shell reach, flying toward a.
    const tickU = (CONFIG.gun.shellSpeed * DT) / 1000;
    const startX = a.state.x + SHELL_SIGHT + 3.5 * tickU;
    injectShell(w, 's1', 'b', startX, 0, Math.PI, SHELL_SIGHT / 2);
    expect(shellsOf(buildFrame(w, 'a'))).toEqual([]);
    // Advance the sim until the shell crosses into a's shell reach.
    let ev = null;
    let ticks = 0;
    for (let i = 0; i < 100 && !ev; i++) {
      w.step();
      ticks += 1;
      ev = shellsOf(buildFrame(w, 'a'))[0] ?? null;
    }
    expect(ev).not.toBeNull();
    expect(ticks).toBeGreaterThan(1); // it flew unseen first — the reveal is not the launch
    const sh = w.shells.get('s1')!;
    expect(ev!.x).toBe(sh.x); // current position, NOT the hidden launch point
    expect(ev!.x).toBeLessThan(startX);
    expect(dist(a.state, ev!)).toBeLessThanOrEqual(SHELL_SIGHT);
    expect(ev!.t).toBe(w.now);
    assertBallisticShape(ev!); // no range-derivable field (no ttl) leaks the muzzle
    w.step();
    expect(shellsOf(buildFrame(w, 'a'))).toEqual([]); // never re-sent
  });

  it('a shell behind an island is not visible', () => {
    const w = bareWorld();
    w.map.islands.push(circleIsland(100, 0, 40));
    place(w, 'a', 0, 0);
    place(w, 'b', 600, 0);
    injectShell(w, 's1', 'b', 200, 0, Math.PI / 2, 10); // in range but behind the rock
    expect(shellsOf(buildFrame(w, 'a'))).toEqual([]);
  });

  it('a shell event carries ONLY {k,id,x,y,vx,vy,t} (+ the family `w`) — no range-derivable field', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectShell(w, 's1', 'a', 10, 0, 0, 300);
    const ev = shellsOf(buildFrame(w, 'a'))[0];
    expect(ev).toBeDefined();
    assertBallisticShape(ev); // fails if `ttl`/`distLeft`/anything extra returns
    expect(ev.w).toBe('cannon');
  });

  // Story 8.15 (amendment 89(i)); Story 10.4: the `mg` family now belongs to
  // the SECONDARIES. A secondaries round entering an enemy's sight reveals
  // with `w: 'mg'` and NOTHING else new — current pos and velocity, the
  // reveal time, the family word. No shooter, no range, no heat, no `sec`.
  // The torpedo stays blind (no `w`).
  it("a secondaries round entering an observer's sight carries w:'mg' and nothing range-derivable; a torpedo carries no w", () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    // b sits outside a's sight but inside its own secondaries' reach + a's
    // sight, bow toward a.
    const bx = SIGHT + a.stats.secondaryRangeU / 2; // SIGHT: the default hull is INTEL 100
    place(w, 'b', bx, 0, Math.PI);
    // b holds the secondaries toward a; the level alone fires (no click).
    w.submitInput('b', {
      seq: 1, throttle: 0, rudder: 0, aim: Math.PI, fireSeq: 0, aimDist: bx, slot: 0, fireT: 0,
      actSeq: 0, act: 0, hornSeq: 0, held: false, sec: true,
    });
    let ev: BallisticEvent | undefined;
    for (let i = 0; i < 60 && ev === undefined; i++) {
      w.step();
      ev = shellsOf(buildFrame(w, 'a'))[0];
    }
    expect(ev).toBeDefined();
    expect(Object.keys(ev!).sort()).toEqual(BALLISTIC_KEYS_WITH_FAMILY);
    expect(ev!.w).toBe('mg');
    expect(Math.hypot(ev!.x, ev!.y)).toBeLessThanOrEqual(SIGHT); // revealed at the sight ring, never at the muzzle
    // The owner's own reveal carries the same word — and one `mz` PER SHELL.
    const own = buildFrame(w, 'b');
    for (const e of shellsOf(own)) expect(e.w).toBe('mg');
    // A torpedo reveal, in the same world, never carries the key.
    injectShell(w, 't1', 'b', 100, 0, Math.PI, 500, false, 'torp');
    const torp = buildFrame(w, 'a').events.find((e): e is BallisticEvent => e.k === 'torp');
    expect(torp).toBeDefined();
    expect('w' in torp!).toBe(false);
    expect(a.seenBallistics.has('t1')).toBe(true);
  });
});

// ---------- fail-closed shape guards (Wave B) --------------------------------

describe('perception — world-emitted ballistics never forward (fail-closed)', () => {
  // A ballistic reveal is re-issued PER OBSERVER by the scan over live
  // world.shells (records that carry ownerId). A raw BallisticEvent riding the
  // tickEvents forwarding path has the WIRE shape (no ownerId), so the ballistic
  // row's shape guard (`'ownerId' in shell`) must drop it — otherwise a client
  // could be fed a projectile the scan never legitimately revealed to it.
  for (const kind of ['shell', 'torp'] as const) {
    it(`a world-emitted ${kind} GameEvent (no ownerId) reaches no frame — fogged or spectator`, () => {
      const w = bareWorld();
      place(w, 'a', 0, 0); // observer sitting ON the event's location (max exposure)
      emitWorldEvent(w, { k: kind, id: 'ghost', x: 0, y: 0, vx: 1, vy: 0, t: w.now });
      // Fogged path: dropped even point-blank on the observer.
      expect(buildFrame(w, 'a').events.filter((e) => e.k === kind)).toEqual([]);
      // Unfogged spectator path (finished phase): also dropped — the shape guard
      // fires before the mode check, so fog relaxation cannot resurrect it.
      expect(buildFrame(w, 'a', 'finished').events.filter((e) => e.k === kind)).toEqual([]);
    });
  }
});

describe('perception — boom / dmg / sunk / spawn visibility', () => {
  it('an out-of-sight boom is hidden from everyone but the struck ship', () => {
    const w = bareWorld();
    // The world STEPS: both hulls on the board, ANNULUS_D apart — beyond
    // every eye reach (the splash reach included).
    place(w, 'a', -FAR_HALF, 0);
    const b = place(w, 'b', FAR_HALF, 0);
    b.hp = 1; // any landed blow sinks it (a blow settles to at least 1 — Story 10.3 armor folds the nominal number)
    // a's shell, one tick from striking b — b is far outside a's every eye reach.
    injectShell(w, 's1', 'a', FAR_HALF - 20, 0, 0, 100);
    w.step();
    const fa = buildFrame(w, 'a');
    const fb = buildFrame(w, 'b');
    // b (victim) sees the boom, its dmg, and its own sinking (seen: own hull).
    expect(fb.events.filter((e) => e.k === 'boom')).toHaveLength(1);
    expect(fb.events.filter((e) => e.k === 'dmg')).toEqual([
      { k: 'dmg', id: 'b', amount: expect.any(Number), hp: 0 },
    ]);
    expect(fb.events.filter((e) => e.k === 'sunk')).toEqual([{ k: 'sunk', id: 'b', by: 'a', seen: true }]);
    // a (owner, out of sight) gets no boom / dmg — no impact-location leak —
    // but the sinking itself arrives (PV 23: credited killer + public
    // register), WITHOUT the spatial license: no `seen`.
    expect(fa.events.filter((e) => e.k === 'boom')).toEqual([]);
    expect(fa.events.filter((e) => e.k === 'dmg')).toEqual([]);
    expect(fa.events.filter((e) => e.k === 'sunk')).toEqual([{ k: 'sunk', id: 'b', by: 'a' }]);
  });

  it('a boom within sight is visible; a witnessed sinking carries seen: true', () => {
    const w = bareWorld();
    place(w, 'a', -FAR_HALF, 0);
    const b = place(w, 'b', -FAR_HALF + 150, 0);
    b.hp = 1; // any landed blow sinks it (a blow settles to at least 1)
    const c = place(w, 'c', FAR_HALF, 0); // far-away third party
    expect(dist(c.state, b.state)).toBeGreaterThan(EYE_MAX); // premise: beyond c's every eye reach
    injectShell(w, 's1', 'a', -FAR_HALF + 130, 0, 0, 100); // a's shell, point-blank on b
    w.step();
    const fa = buildFrame(w, 'a');
    expect(fa.events.filter((e) => e.k === 'boom')).toHaveLength(1);
    expect(fa.events.filter((e) => e.k === 'sunk')).toEqual([{ k: 'sunk', id: 'b', by: 'a', seen: true }]);
    // dmg stays victim-private even when the boom is visible.
    expect(fa.events.filter((e) => e.k === 'dmg')).toEqual([]);
    const fc = buildFrame(w, 'c');
    // The fog-kill THIRD PARTY (PV 23): no boom, but the public register
    // delivers the human sinking — identity only, no `seen`.
    expect(fc.events.filter((e) => e.k === 'boom')).toEqual([]);
    expect(fc.events.filter((e) => e.k === 'sunk')).toEqual([{ k: 'sunk', id: 'b', by: 'a' }]);
  });

  it('a WITNESSED sinking arrives with seen: true for a witness who did not fire the shot', () => {
    const w = bareWorld();
    place(w, 'c', 0, 0); // a witness who did not fire the shot
    place(w, 'd1', 100, 0); // inside c's sight bubble
    w.sinkShip('d1', 'a');
    w.step();
    expect(buildFrame(w, 'c').events.filter((e) => e.k === 'sunk')).toEqual([
      { k: 'sunk', id: 'd1', by: 'a', seen: true },
    ]);
  });

  it('an unattributed human sinking (storm) is public with `by` OMITTED, never undefined', () => {
    const w = bareWorld();
    const c = place(w, 'c', -FAR_HALF, 0); // far away — unwitnessed
    const b = place(w, 'b', FAR_HALF, 0);
    expect(sighted(w, c, b.state)).toBe(false); // premise: beyond c's class reach
    w.sinkShip('b'); // by = undefined (the storm has no killer)
    w.step();
    const sunk = buildFrame(w, 'c').events.filter((e) => e.k === 'sunk');
    expect(sunk).toEqual([{ k: 'sunk', id: 'b' }]);
    expect('by' in sunk[0]).toBe(false); // msgpack would encode an undefined value
    expect('seen' in sunk[0]).toBe(false);
  });

  it('the BOUNTY channel (Story 4.6): `bty: "v"` rides the sunk row to EVERY recipient identically, appended last', () => {
    const w = bareWorld();
    const a = place(w, 'a', -FAR_HALF, 0); // the killer of the holder — far from the wreck
    const b = place(w, 'b', FAR_HALF, 0); // the throne holder, soon a wreck
    const c = place(w, 'c', 0, FAR_HALF); // an uninvolved, out-of-sight bystander
    place(w, 'v', 0, -FAR_HALF); // b's earlier victim (the throne claim)
    expect(sighted(w, a, b.state) || sighted(w, c, b.state)).toBe(false); // premise: nobody holds b's name by eye
    w.sinkShip('v', 'b'); // b takes the throne
    w.step(); // drain the claim sink from the queue
    w.sinkShip('b', 'a'); // the holder goes down in fog
    w.step();
    // Killer (credited, unwitnessed): the channel arrives WITHOUT `seen`, LAST.
    const ka = buildFrame(w, 'a').events.filter((e) => e.k === 'sunk');
    expect(ka).toEqual([{ k: 'sunk', id: 'b', by: 'a', bty: 'v' }]);
    expect(Object.keys(ka[0])).toEqual(['k', 'id', 'by', 'bty']); // bty LAST
    // Victim (own hull => witnessed): seen AND bty, bty still last.
    const kb = buildFrame(w, 'b').events.filter((e) => e.k === 'sunk');
    expect(kb).toEqual([{ k: 'sunk', id: 'b', by: 'a', seen: true, bty: 'v' }]);
    expect(Object.keys(kb[0])).toEqual(['k', 'id', 'by', 'seen', 'bty']);
    // Bystander (public register, unwitnessed): identical value — it is
    // observer-INDEPENDENT, unlike the per-observer `seen`.
    const kc = buildFrame(w, 'c').events.filter((e) => e.k === 'sunk');
    expect(kc).toEqual([{ k: 'sunk', id: 'b', by: 'a', bty: 'v' }]);
  });

  it('the BOUNTY channel: `bty: "k"` (the LEADER did the sinking) rides identically too', () => {
    const w = bareWorld();
    const a = place(w, 'a', -FAR_HALF, 0); // the throne holder — the killer this time
    const b = place(w, 'b', FAR_HALF, 0); // a captain victim
    const c = place(w, 'c', 0, FAR_HALF); // an uninvolved, out-of-sight bystander
    place(w, 'v', 0, -FAR_HALF); // a's earlier victim (the throne claim)
    expect(sighted(w, a, b.state) || sighted(w, c, b.state)).toBe(false); // premise: nobody holds b's name by eye
    w.sinkShip('v', 'a'); // a takes the throne
    w.step();
    w.sinkShip('b', 'a'); // the LEADER sinks a captain in fog
    w.step();
    const ka = buildFrame(w, 'a').events.filter((e) => e.k === 'sunk');
    expect(ka).toEqual([{ k: 'sunk', id: 'b', by: 'a', bty: 'k' }]);
    expect(Object.keys(ka[0])).toEqual(['k', 'id', 'by', 'bty']); // bty LAST
    const kc = buildFrame(w, 'c').events.filter((e) => e.k === 'sunk');
    expect(kc).toEqual([{ k: 'sunk', id: 'b', by: 'a', bty: 'k' }]); // observer-independent
    // The leader sinks a hull IN SIGHT: `seen` rides beside `bty`, bty last.
    const d = place(w, 'd', -FAR_HALF - 200, 0);
    expect(sighted(w, a, d.state) && !sighted(w, c, d.state)).toBe(true); // premise: in the leader's sight, out of the bystander's
    w.sinkShip('d', 'a');
    w.step();
    const kd = buildFrame(w, 'a').events.filter((e) => e.k === 'sunk');
    expect(kd).toEqual([{ k: 'sunk', id: 'd', by: 'a', seen: true, bty: 'k' }]);
    expect(buildFrame(w, 'c').events.filter((e) => e.k === 'sunk')).toEqual([{ k: 'sunk', id: 'd', by: 'a', bty: 'k' }]);
  });

  it('a boom whose victim center is out of sight arrives WITHOUT hit (straddle)', () => {
    // b's center sits just OUTSIDE a's sight; its hull reaches INSIDE, so a's
    // shell strikes at a point a can see. a must get the boom (impact sighted)
    // but never the victim's id (center fogged) — reviewer finding 2.
    const w = bareWorld();
    place(w, 'a', 0, 0);
    const b = place(w, 'b', SIGHT + 12, 0, 0); // center SIGHT+12u, hull axis along x
    b.hp = 100; // survives, so it straddles as a live (but unsighted) hull
    injectShell(w, 's1', 'a', SIGHT - 15, 0, 0, 40); // a's shell striking b's near hull, just inside a's sight
    let boomB: BoomEvent | undefined;
    for (let i = 0; i < 20 && !boomB; i++) {
      w.step();
      boomB = boomsOf(buildFrame(w, 'b')).find((e) => e.id === 's1');
    }
    // The straddle actually happened: impact point inside a's sight, center outside.
    expect(boomB).toBeDefined();
    expect(dist({ x: 0, y: 0 }, boomB!)).toBeLessThanOrEqual(SIGHT);
    expect(dist({ x: 0, y: 0 }, b.state)).toBeGreaterThan(SIGHT);
    // Victim sees its own hit; the far owner sees the impact but NOT the id.
    expect(boomB!.hit).toBe('b');
    const boomA = boomsOf(buildFrame(w, 'a')).find((e) => e.id === 's1');
    expect(boomA).toBeDefined();
    expect(boomA!.hit).toBeUndefined();
    expect('hit' in boomA!).toBe(false); // stripped, not just undefined
    // a is not otherwise leaking b: b never appears as a contact.
    expect(buildFrame(w, 'a').contacts.map((c) => c.id)).not.toContain('b');
  });

  it('a spawn reaches the spawner, and not an observer beyond the class reach of the point', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.step(); // flush a's own join spawn
    const c = w.addShip('c', 'CHARLIE', undefined, undefined, undefined, undefined); // ring spawn
    // Seat a at the ANTIPODE of c's spawn point: a ring diameter apart, which
    // is beyond the class reach — the only reach a spawn row rides.
    a.state.x = -c.state.x;
    a.state.y = -c.state.y;
    expect(sighted(w, a, c.state)).toBe(false); // premise
    w.step();
    const fa = buildFrame(w, 'a');
    expect(fa.events.filter((e) => e.k === 'spawn')).toEqual([]);
    const fc = buildFrame(w, 'c');
    expect(fc.events.filter((e) => e.k === 'spawn')).toEqual([
      { k: 'spawn', id: 'c', x: c.state.x, y: c.state.y },
    ]);
  });
});

// ---------- directed cases: mine visibility (contact-like) -------------------

describe('perception — ZERO SIGHT ADMITS NOTHING (gate fix F4: withinSight fails closed at range 0)', () => {
  it('a whited-out observer co-located with another hull gets no contact for it, and standing inside a cloud (beam parked) gets no cloud row; the undazzled twin gets both', () => {
    for (const blind of [true, false]) {
      const w = bareWorld();
      const me = place(w, 'me', 0, 0);
      place(w, 'b', 0, 0); // hull centre exactly on the observer's
      injectCloud(w, 'ck', 'b', 0, 0); // the observer stands in it
      if (blind) me.dazzledUntil = w.now + FLASH_WINDOW_MS; // the hit tick: sight 0
      me.prevSweepAngle = me.sweepAngle; // park the beam: only the SIGHT arm can deliver the cloud
      const f = buildFrame(w, 'me');
      expect(f.contacts.some((c) => c.id === 'b'), `blind=${blind}`).toBe(!blind);
      expect((f.clouds ?? []).some((c) => c.id === 'ck'), `blind=${blind}`).toBe(!blind);
    }
  });
});

describe('perception — burst visibility (owner always, else burst point sighted)', () => {
  /** Route an internal burst subject through the real pending-events choke,
   *  the way World.resolveBurst emits it (wire BurstEvent + internal `own`). */
  function emitBurst(w: World, id: string, own: string, x: number, y: number, flash = false, r: number = CONFIG.flashShells.radius): void {
    interface Pendable { pending: GameEvent[] }
    // Story 10.5: a FLASH subject carries its stamped radius `r` beside `f`.
    const subject = flash ? { k: 'burst', id, x, y, own, f: true, r } : { k: 'burst', id, x, y, own };
    (w as unknown as Pendable).pending.push(subject as GameEvent);
    w.step();
  }

  it('the OWNER gets its burst even far beyond sight (the point is its own click)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    emitBurst(w, 'b1', 'a', ANNULUS_D, 0); // beyond a's every eye reach
    const bursts = buildFrame(w, 'a').events.filter((e) => e.k === 'burst');
    expect(bursts).toEqual([{ k: 'burst', id: 'b1', x: ANNULUS_D, y: 0 }]); // bare shape, no `own`
  });

  it('a non-owner beyond the splash reach of the burst point NEVER receives it (fogged)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    const c = place(w, 'c', -FAR_HALF, 0); // ANNULUS_D from the burst point (the world steps: on the board)
    expect(dist(c.state, { x: FAR_HALF, y: 0 })).toBeGreaterThan(SPLASH_SIGHT); // premise
    emitBurst(w, 'b1', 'a', FAR_HALF, 0);
    expect(buildFrame(w, 'c').events.filter((e) => e.k === 'burst')).toEqual([]);
  });

  it('a non-owner WITH the burst point sighted receives the bare event', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'c', 580, 0); // 20u from the burst point — sighted
    emitBurst(w, 'b1', 'a', 600, 0);
    const bursts = buildFrame(w, 'c').events.filter((e) => e.k === 'burst');
    expect(bursts).toEqual([{ k: 'burst', id: 'b1', x: 600, y: 0 }]);
  });

  it('a non-owner behind an island never receives it (LOS rule)', () => {
    const w = bareWorld();
    w.map.islands.push(circleIsland(100, 0, 40));
    place(w, 'c', 0, 0);
    emitBurst(w, 'b1', 'a', 200, 0); // inside sight range but behind the rock
    expect(buildFrame(w, 'c').events.filter((e) => e.k === 'burst')).toEqual([]);
  });

  it('the FLASH tag (epic-10 amendment 5) adds one bit and ONE recipient arm (gate fix F2, Eric 2026-10-29: the flashed victim sees the disc): over random boards — some observers blind — the observers receiving a flagged burst are EXACTLY those receiving the same burst unflagged ∪ those whose hull centre is inside the flash radius, and only the flagged one carries `f: true` (LAST)', () => {
    const rng = mulberry32(0xf1a5).next;
    let reached = 0;
    let fogged = 0;
    let widened = 0; // in-radius observers the unflagged burst did NOT reach (blind ones)
    for (let trial = 0; trial < 40; trial++) {
      const blind = Array.from({ length: 6 }, (_, i) => i > 0 && rng() < 0.5); // never the owner
      const build = (): World => {
        const w = bareWorld();
        for (let i = 0; i < 6; i++) {
          const o = place(w, `o${i}`, (i - 3) * 160, (i % 2) * 120);
          if (blind[i]) o.dazzledUntil = w.now + FLASH_WINDOW_MS; // white at the frame: sight 0
        }
        return w;
      };
      const bx = Math.floor(rng() * 1200) - 600;
      const by = Math.floor(rng() * 600) - 300;
      // Story 10.5 (R7): a random TIER's disc — the arm reads the burst's own `r`.
      const r = CONFIG.flashShells.radius + Math.floor(rng() * 5) * CONFIG.flashShells.radiusStepPerTier;
      const plain = build();
      const flagged = build();
      emitBurst(plain, 'b1', 'o0', bx, by, false);
      emitBurst(flagged, 'b1', 'o0', bx, by, true, r);
      const got = (w: World, flash: boolean): string[] => {
        const ids: string[] = [];
        for (let i = 0; i < 6; i++) {
          const b = buildFrame(w, `o${i}`).events.filter((e) => e.k === 'burst');
          expect(b.length).toBeLessThanOrEqual(1);
          if (b.length === 0) continue;
          ids.push(`o${i}`);
          if (flash) expect(Object.keys(b[0])).toEqual(['k', 'id', 'x', 'y', 'f', 'r']);
          else expect('f' in b[0]).toBe(false);
        }
        return ids;
      };
      const plainIds = got(plain, false);
      const inRadius: string[] = [];
      for (let i = 0; i < 6; i++) {
        const o = flagged.ships.get(`o${i}`)!;
        if (dist(o.state, { x: bx, y: by }) <= r) inRadius.push(`o${i}`);
      }
      const expected = [...new Set([...plainIds, ...inRadius])].sort();
      expect([...got(flagged, true)].sort()).toEqual(expected);
      widened += expected.length - plainIds.length;
      reached += plainIds.length;
      fogged += 6 - plainIds.length;
    }
    expect(reached).toBeGreaterThan(40); // non-vacuous: owners and sighted observers received it...
    expect(fogged).toBeGreaterThan(0); // ...and fogged observers did not, flag or no flag...
    expect(widened).toBeGreaterThan(0); // ...and a blind in-radius observer got the flagged one alone
  });

  it('END-TO-END: a real main-battery landing reaches the owner as a bare impact {k,id,x,y} — no blast ring, no owner tag (epic-11 amendment 8)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.input = { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 600, slot: 0, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false };
    let landing: GameEvent | undefined;
    for (let i = 0; i < 120 && !landing; i++) {
      w.step();
      const ev = buildFrame(w, 'a').events;
      expect(ev.some((e) => e.k === 'burst')).toBe(false); // the blast is retired
      landing = ev.find((e) => e.k === 'boom');
    }
    expect(landing).toBeDefined(); // the owner's own shell
    expect(Object.keys(landing!).sort()).toEqual(['id', 'k', 'x', 'y']); // no `land` / radius / range field
    // Lands AT ITS LANDING — the dispersed point around the click (Story 11.1).
    expect(Math.hypot((landing as BoomEvent).x - 600, (landing as BoomEvent).y)).toBeLessThanOrEqual(dispersionAxes(1200).alongU);
  });

  it('a main-battery landing beyond the owner\'s splash reach still reaches the OWNER (the retired burst\'s owner arm), and no one else there', () => {
    interface Pendable { pending: GameEvent[] }
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const c = place(w, 'c', 0, -FAR_HALF); // a bystander beside the shooter
    // A landing subject routed through the real pending-events choke, the
    // way World.announceLanding emits it (wire BoomEvent + internal `land`).
    (w as unknown as Pendable).pending.push({ k: 'boom', id: 's9', x: ANNULUS_D, y: 0, land: a.id } as GameEvent);
    w.step();
    expect(buildFrame(w, 'a').events.filter((e) => e.k === 'boom')).toEqual([{ k: 'boom', id: 's9', x: ANNULUS_D, y: 0 }]);
    expect(buildFrame(w, c.id).events.some((e) => e.k === 'boom')).toBe(false);
  });
});

describe('perception — mine visibility (owner-always, else the MINE reach + LOS — Story 11.2, never radar)', () => {
  // The mine's own eye reach (`CONFIG.vision.mineSight`, MINE_SIGHT above) —
  // Story 4.9's detect rung carried it until Story 11.2 retired the ladder.

  it('the owner sees all its own mines everywhere; the enemy never radar-paints them', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 0, 0); // b co-located briefly; we only read its frame's mines
    injectMine(w, 'm1', 'a', 900, 900); // owner's mine, far outside any range
    const fa = buildFrame(w, 'a');
    expect(fa.mines).toEqual([{ id: 'm1', x: 900, y: 900, own: true, by: 'a', c: 'naval' }]); // own view carries the kind (8.13)
    // b sits at the origin — the mine is far beyond the mine reach (and mines never paint).
    expect(Math.hypot(900, 900)).toBeGreaterThan(MINE_SIGHT);
    expect(buildFrame(w, 'b').mines).toEqual([]);
  });

  it('an enemy mine is visible at exactly the mine reach, invisible just outside it', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectMine(w, 'm1', 'b', MINE_SIGHT, 0); // exactly at the reach — inclusive
    expect(buildFrame(w, 'a').mines).toEqual([{ id: 'm1', x: MINE_SIGHT, y: 0, own: false, by: 'b', c: 'naval' }]); // the kind rides for the enemy too (cycle 162)
    w.mines.clear();
    injectMine(w, 'm2', 'b', MINE_SIGHT + 0.01, 0); // a hair beyond the reach
    expect(buildFrame(w, 'a').mines).toEqual([]);
  });

  // (RE-CUT 2026-11-12 — Story 11.2, a ruling recorded in the epic-11
  // amendments: "detect is OBSERVER-SCALED (amendment 121): a sight collapsed
  // to the 1/12 rung collapses it; a sightRange boon widens it" — the mine
  // reach is a CONFIG fact no stat writes, so the sightRange-boon half is
  // DELETED and the collapse half rides the one thing that still scales the
  // reach: the observer's own flash whiteout.)
  it('the mine reach is WHITEOUT-SCALED and reads no stat: a flash mark shrinks it with every other eye reach, a `sightRange` write does not move it', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    injectMine(w, 'm1', 'b', MINE_SIGHT / 2, 0); // inside the reach, outside a quarter of it
    const minesNow = (): string[] => buildFrame(w, 'a').mines.map((m) => m.id);
    expect(minesNow()).toEqual(['m1']);
    a.dazzledUntil = flashMark(w, 0.25); // a quarter cleared: every eye reach × 0.25
    expect(minesNow()).toEqual([]);
    a.dazzledUntil = flashMark(w, 0.75); // three quarters cleared: the mine is back inside
    expect(minesNow()).toEqual(['m1']);
    a.dazzledUntil = flashMark(w); // the hit tick: blind
    expect(minesNow()).toEqual([]);
    a.dazzledUntil = 0;
    // A stat write neither widens nor collapses the reach.
    injectMine(w, 'm2', 'b', 0, MINE_SIGHT + 0.01); // a hair beyond the reach
    a.stats = { ...a.stats, sightRange: a.stats.sightRange * 2 };
    expect(minesNow()).toEqual(['m1']);
    a.stats = { ...a.stats, sightRange: MINE_SIGHT / 4 };
    expect(minesNow()).toEqual(['m1']);
  });

  it('an enemy mine inside an OWNED lit zone stays visible beyond the mine reach (the OR-path is untouched)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectMine(w, 'm1', 'b', ANNULUS_D, 0); // beyond every eye reach — fogged on its own
    expect(buildFrame(w, 'a').mines).toEqual([]);
    injectZone(w, 'z1', 'a', ANNULUS_D, 0);
    expect(buildFrame(w, 'a').mines.map((m) => m.id)).toEqual(['m1']);
  });

  it('an enemy mine behind an island is invisible (LOS rule)', () => {
    const w = bareWorld();
    w.map.islands.push(circleIsland(MINE_SIGHT / 2, 0, MINE_SIGHT / 5));
    place(w, 'a', 0, 0);
    injectMine(w, 'm1', 'b', MINE_SIGHT * 0.9, 0); // inside the mine reach but behind the rock
    expect(buildFrame(w, 'a').mines).toEqual([]);
    w.map.islands.length = 0; // ...and the rock is the only reason
    expect(buildFrame(w, 'a').mines.map((m) => m.id)).toEqual(['m1']);
  });

  it('arm state makes no difference to visibility', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectMine(w, 'armed', 'b', MINE_SIGHT / 2, 0, 0);
    injectMine(w, 'unarmed', 'b', 0, MINE_SIGHT / 2, w.now + CONFIG.mine.armDelay);
    expect(buildFrame(w, 'a').mines.map((m) => m.id).sort()).toEqual(['armed', 'unarmed']);
  });
});

describe('perception — the torpedo reach vs the shell reach (Story 11.2, R4 / R18: each projectile kind has its own eye reach)', () => {
  const torpsOf = (f: FrameMsg) => f.events.filter((e): e is BallisticEvent => e.k === 'torp');

  it('a shell at exactly the shell reach reveals (inclusive) and a torpedo at that same distance does not — the rows read different reaches; a hair beyond, the shell is silent too', () => {
    expect(TORP_SIGHT).toBeLessThan(SHELL_SIGHT); // premise: a torpedo is seen closer than a shell
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectShell(w, 's1', 'b', SHELL_SIGHT, 0, Math.PI, 400, false, 'shell');
    injectShell(w, 't1', 'b', 0, SHELL_SIGHT, -Math.PI / 2, 400, false, 'torp');
    const f = buildFrame(w, 'a');
    expect(shellsOf(f).map((e) => e.id)).toEqual(['s1']);
    expect(torpsOf(f)).toEqual([]);
    const w2 = bareWorld();
    place(w2, 'a', 0, 0);
    injectShell(w2, 's2', 'b', SHELL_SIGHT + 0.01, 0, Math.PI, 400, false, 'shell');
    expect(shellsOf(buildFrame(w2, 'a'))).toEqual([]);
  });

  it('a torpedo reveals at exactly the torpedo reach (inclusive), not a hair beyond', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectShell(w, 't1', 'b', TORP_SIGHT, 0, Math.PI, 400, false, 'torp');
    expect(torpsOf(buildFrame(w, 'a')).map((e) => e.id)).toEqual(['t1']);
    const w2 = bareWorld();
    place(w2, 'a', 0, 0);
    injectShell(w2, 't2', 'b', TORP_SIGHT + 0.01, 0, Math.PI, 400, false, 'torp');
    expect(torpsOf(buildFrame(w2, 'a'))).toEqual([]);
  });

  it('the owner-always and owned-zone paths on the torp row are untouched', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectShell(w, 'own', 'a', 900, 900, 0, 400, false, 'torp'); // own fish, anywhere
    expect(torpsOf(buildFrame(w, 'a')).map((e) => e.id)).toEqual(['own']);
    injectShell(w, 'zoned', 'b', ANNULUS_D, 0, 0, 400, false, 'torp'); // far beyond the torpedo reach
    injectZone(w, 'z1', 'a', ANNULUS_D, 0);
    expect(torpsOf(buildFrame(w, 'a')).map((e) => e.id)).toEqual(['zoned']);
  });
});

// ---------- Story 8.13: the per-visit ballistic mark (epic-8 amendment 78) ----
//
// The exactly-once memory became ONCE PER VISIT: an observer's mark on a live
// projectile is cleared the first tick the projectile is OUTSIDE that
// observer's reveal gate, so a projectile that leaves and comes back is
// revealed again — same {k,id,x,y,vx,vy,t} shape, current pos/velocity, `t` =
// the re-reveal time. While it stays inside, nothing is re-sent (byte-identical
// to the old behaviour); the owner's own projectiles never leave the gate, so
// they are revealed exactly once; spectators likewise. Every case counts the
// events across the WHOLE run, so a duplicate anywhere fails.

describe('perception — ballistic re-reveal on gate re-entry (Story 8.13, amendment 78)', () => {
  const torpsOf = (f: FrameMsg) => f.events.filter((e): e is BallisticEvent => e.k === 'torp');
  const ballisticsOf = (f: FrameMsg, kind: 'shell' | 'torp') => f.events.filter((e): e is BallisticEvent => e.k === kind);
  const isBallisticEvent = (e: GameEvent): e is BallisticEvent => e.k === 'shell' || e.k === 'torp';

  /** Build `n` frames for `id` and return every ballistic event of `kind`. */
  function collect(w: World, id: string, kind: 'shell' | 'torp', n: number): BallisticEvent[] {
    const out: BallisticEvent[] = [];
    for (let i = 0; i < n; i++) out.push(...ballisticsOf(buildFrame(w, id), kind));
    return out;
  }

  for (const [kind, ring] of [['torp', TORP_SIGHT], ['shell', SHELL_SIGHT]] as const) {
    it(`${kind}: revealed at the ${kind === 'torp' ? 'torpedo' : 'shell'} reach, silent outside it, revealed AGAIN on re-entry — exactly two events over the run`, () => {
      const w = bareWorld();
      const a = place(w, 'a', 0, 0);
      injectShell(w, 'p1', 'b', ring - 20, 0, 0, 900, false, kind); // inside the gate, 20u short of the ring
      const first = collect(w, 'a', kind, 3); // inside: revealed once, then silent
      expect(first.map((e) => e.id)).toEqual(['p1']);
      expect(a.seenBallistics.has('p1')).toBe(true);
      a.state.x = -60; // the observer backs off: the projectile is now 40u OUTSIDE the ring
      expect(collect(w, 'a', kind, 3)).toEqual([]); // nothing while outside...
      expect(a.seenBallistics.has('p1')).toBe(false); // ...and the mark is gone (per-visit)
      a.state.x = 0; // closes again: the projectile is back inside
      const again = collect(w, 'a', kind, 3);
      expect(again.map((e) => e.id)).toEqual(['p1']); // ONE re-reveal, then silent again
      const live = w.shells.get('p1')!;
      expect(again[0]).toEqual({
        k: kind, id: 'p1', x: live.x, y: live.y, vx: live.vx, vy: live.vy, t: w.now,
        ...(kind === 'shell' ? { w: 'cannon' } : {}), // Story 8.15: the family rides a shell, never a torp
      });
      assertBallisticShape(again[0]); // the re-reveal gains no field
      expect(Math.hypot(again[0].x - a.state.x, again[0].y - a.state.y)).toBeLessThanOrEqual(ring);
    });
  }

  it('a running torpedo crosses INTO the torpedo reach, the observer is pulled away for a tick, then returns: two reveals, each with the torpedo\'s CURRENT params and t = now', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    injectShell(w, 't1', 'b', -TORP_SIGHT - 30, 0, 0, 5_000, false, 'torp'); // closing +x, outside the reach
    expect(torpsOf(buildFrame(w, 'a'))).toEqual([]);
    let reveals: BallisticEvent[] = [];
    let ticks = 0;
    while (reveals.length === 0 && ticks++ < 20) {
      w.step();
      reveals = torpsOf(buildFrame(w, 'a'));
    }
    expect(reveals).toHaveLength(1);
    const firstT = reveals[0].t;
    expect(firstT).toBe(w.now);
    w.step();
    expect(torpsOf(buildFrame(w, 'a'))).toEqual([]); // still inside, still marked, silent
    a.state.x = FAR_HALF; // yanked far outside the reach for one tick: the mark is dropped
    w.step();
    expect(torpsOf(buildFrame(w, 'a'))).toEqual([]);
    expect(a.seenBallistics.has('t1')).toBe(false);
    a.state.x = 0; // and back
    w.step();
    const again = torpsOf(buildFrame(w, 'a'));
    const live = w.shells.get('t1')!;
    expect(again).toEqual([{ k: 'torp', id: 't1', x: live.x, y: live.y, vx: live.vx, vy: live.vy, t: w.now }]);
    expect(again[0].t).toBeGreaterThan(firstT); // the re-reveal time, never the first reveal's
    expect(Math.hypot(live.x, live.y)).toBeLessThanOrEqual(TORP_SIGHT); // re-revealed INSIDE the gate
    w.step();
    expect(torpsOf(buildFrame(w, 'a'))).toEqual([]);
  });

  it('a projectile that never leaves the gate is revealed exactly once (the old pin, restated over many frames)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectShell(w, 't1', 'b', 100, 0, 0, 900, false, 'torp');
    injectShell(w, 's1', 'b', 200, 0, 0, 900, false, 'shell');
    const seen: string[] = [];
    for (let i = 0; i < 12; i++) seen.push(...buildFrame(w, 'a').events.filter(isBallisticEvent).map((e) => e.id));
    expect(seen.sort()).toEqual(['s1', 't1']);
  });

  it('OWNER-ALWAYS: the owner is revealed its own fish once and never again, however far it runs and wherever the owner goes', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    injectShell(w, 'own', 'a', 900, 900, 0, 5_000, false, 'torp'); // far outside every ring
    expect(collect(w, 'a', 'torp', 4).map((e) => e.id)).toEqual(['own']);
    a.state.x = -2_000; // the owner moves; the fish is still the owner's
    expect(collect(w, 'a', 'torp', 4)).toEqual([]);
    expect(a.seenBallistics.has('own')).toBe(true); // never cleared: the owner's gate never closes
    a.state.x = 0;
    for (let i = 0; i < 5; i++) {
      w.step();
      expect(torpsOf(buildFrame(w, 'a'))).toEqual([]);
    }
  });

  it('SPECTATOR: an unfogged spectator is revealed a projectile once, whatever moves', () => {
    const w = bareWorld();
    const c = place(w, 'c', 0, 0);
    injectShell(w, 'far', 'b', 900, 900, 0, 5_000, false, 'torp');
    const spec = (): BallisticEvent[] => torpsOf(buildFrame(w, 'c', 'finished'));
    expect(spec().map((e) => e.id)).toEqual(['far']);
    expect(spec()).toEqual([]);
    c.state.x = -2_000;
    w.step();
    expect(spec()).toEqual([]);
    expect(c.seenBallistics.has('far')).toBe(true); // a spectator's gate is always open — never cleared
  });

  it('the gate SHRINKING under the projectile is an exit too: cleared while a flash whiteout shrinks the reach, re-revealed when it returns', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    injectShell(w, 't1', 'b', TORP_SIGHT / 2, 0, Math.PI / 2, 900, false, 'torp'); // inside the reach, outside a quarter of it
    expect(collect(w, 'a', 'torp', 2).map((e) => e.id)).toEqual(['t1']);
    a.dazzledUntil = flashMark(w, 0.25); // a real flash mark: every eye reach × 0.25
    expect(collect(w, 'a', 'torp', 2)).toEqual([]);
    expect(a.seenBallistics.has('t1')).toBe(false);
    a.dazzledUntil = 0;
    expect(collect(w, 'a', 'torp', 2).map((e) => e.id)).toEqual(['t1']);
  });

  it('an island sliding between observer and fish is an exit too (LOS is part of the gate)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectShell(w, 't1', 'b', 150, 0, Math.PI / 2, 900, false, 'torp');
    expect(collect(w, 'a', 'torp', 2).map((e) => e.id)).toEqual(['t1']);
    w.map.islands.push(circleIsland(75, 0, 30)); // the rock now blocks the line
    expect(collect(w, 'a', 'torp', 2)).toEqual([]);
    w.map.islands.length = 0;
    expect(collect(w, 'a', 'torp', 2).map((e) => e.id)).toEqual(['t1']);
  });

  it('HOMING: a re-reveal re-sets the torpU baseline — later drift is measured from the RE-REVEAL velocity, not the first one', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    injectShell(w, 'h1', 'b', 150, 0, 0, 900, false, 'torp');
    const fish = w.shells.get('h1')!;
    fish.homing = { turnRate: 0.5, acquireRange: 120 };
    const speed = Math.hypot(fish.vx, fish.vy);
    const steer = (deg: number): void => {
      fish.vx = Math.cos((deg * Math.PI) / 180) * speed;
      fish.vy = Math.sin((deg * Math.PI) / 180) * speed;
    };
    const updatesOf = (f: FrameMsg) => f.events.filter((e): e is TorpedoUpdateEvent => e.k === 'torpU');
    expect(torpsOf(buildFrame(w, 'a')).map((e) => e.id)).toEqual(['h1']); // reveal, baseline 0°
    expect(a.torpDirs.get('h1')).toBe(0);
    steer(4); // below the 5° threshold from 0°
    expect(updatesOf(buildFrame(w, 'a'))).toEqual([]);
    a.state.x = -SIGHT; // the fish (150,0) is sight + 150 off: far outside the torpedo reach
    expect(buildFrame(w, 'a').events.filter((e) => e.k === 'torp' || e.k === 'torpU')).toEqual([]);
    expect(a.seenBallistics.has('h1')).toBe(false);
    expect(a.torpDirs.has('h1')).toBe(false); // the baseline leaves with the mark
    steer(30); // the fish turns hard while unseen
    a.state.x = 0; // back inside
    const f = buildFrame(w, 'a');
    expect(torpsOf(f)).toEqual([{ k: 'torp', id: 'h1', x: fish.x, y: fish.y, vx: fish.vx, vy: fish.vy, t: w.now }]);
    expect(updatesOf(f)).toEqual([]); // a reveal IS the current velocity — no update rides with it
    expect(a.torpDirs.get('h1')).toBeCloseTo(Math.PI / 6, 12); // baseline re-set to the re-reveal heading
    steer(33); // 3° from the re-reveal heading (33° from the FIRST — the old baseline would have fired here)
    expect(updatesOf(buildFrame(w, 'a'))).toEqual([]);
    steer(36); // 6° from the re-reveal heading: past the threshold
    expect(updatesOf(buildFrame(w, 'a')).map((e) => e.id)).toEqual(['h1']);
    expect(updatesOf(buildFrame(w, 'a'))).toEqual([]); // baseline advanced; silent again
  });
});

// (DELETED 2026-11-12 — Story 11.2, a ruling recorded in the epic-11 amendments: "an observer just past the 6/12 halo — still inside 5/8 of radar — receives neither mz nor sm" — its premise was the eighths ratio against the twelfths ladder; the halo is its own CONFIG fact now and the block below re-cuts both boundaries onto it.)
describe('perception — the mz/sm halo is CONFIG.vision.muzzleFlash (Story 11.2, R18): its own fact, boundary inclusive, never whiteout-scaled', () => {
  /** The mz / sm kinds an observer at (d, 0) receives for a flash and a puff at the origin. */
  function haloKinds(d: number, blind = false): string[] {
    const w = bareWorld();
    const a = place(w, 'a', d, 0);
    if (blind) a.dazzledUntil = flashMark(w); // the hit tick: every EYE reach is 0
    emitWorldEvent(w, { k: 'mz', x: 0, y: 0 });
    emitWorldEvent(w, { k: 'sm', x: 0, y: 0, tier: 1 });
    const f = buildFrame(w, 'a');
    verifyFrame(w, 'a', f);
    return f.events.filter((e) => e.k === 'mz' || e.k === 'sm').map((e) => e.k).sort();
  }

  it('an observer at exactly the halo receives both (boundary inclusive) — the emission is real, not vacuous', () => {
    expect(haloKinds(MUZZLE_FLASH)).toEqual(['mz', 'sm']);
  });

  it('an observer a hair past the halo receives neither mz nor sm', () => {
    expect(haloKinds(MUZZLE_FLASH + 0.01)).toEqual([]);
  });

  it('a flash mark does NOT shrink the halo: a whited-out observer at the boundary still receives both (a flash is a light source), and still nothing a hair beyond', () => {
    expect(haloKinds(MUZZLE_FLASH, true)).toEqual(['mz', 'sm']);
    expect(haloKinds(MUZZLE_FLASH + 0.01, true)).toEqual([]);
  });
});

// ---------- directed cases: lit zones (Story 1.7) -----------------------------

describe('perception — lit zones: firer-only truesight parity ("lit from above")', () => {
  const LIT_R = CONFIG.starShells.litRadius;

  it('the FIRER gains a full contact for a ship inside its zone, far beyond sight and radar', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    const b = place(w, 'b', BEYOND_RADAR, 0, 2.1); // way outside sight AND radar
    injectZone(w, 'z1', 'a', BEYOND_RADAR, 0);
    expect(buildFrame(w, 'a').contacts).toEqual([
      { id: 'b', x: BEYOND_RADAR, y: 0, heading: 2.1, speed: 0, cls: DEFAULT_CLASS_ID, tu: encodeTurretAngles(b.turrets, b.hullId) },
    ]);
    // Zone expiry/removal drops the contact again (revealed only while lit).
    w.litZones.clear();
    expect(buildFrame(w, 'a').contacts).toEqual([]);
  });

  it('a zone-revealed ship the beam crosses is a contact AND a blip (amendment 210 ruling (a): the entire sweep)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', ANNULUS_D, 0); // beyond sight, inside radar
    injectZone(w, 'z1', 'a', ANNULUS_D, 0);
    windowAround(a, 0); // the beam crosses b's bearing this very tick
    const f = buildFrame(w, 'a');
    expect(f.contacts.map((c) => c.id)).toEqual(['b']);
    const blips = blipsOf(f);
    expect(blips).toHaveLength(1); // the zone no longer withholds the paint
    expect(maskEquals(maskOracle(w, a.state, b.hullId, b.state.x, b.state.y, b.state.heading, w.now), blips[0])).toBe(true);
  });

  it('the firer watches a zone-revealed ship die: boom (victim id KEPT) + sunk arrive', () => {
    const w = bareWorld();
    place(w, 'a', -FAR_HALF, 0); // the world steps: both hulls on the board, ANNULUS_D apart
    const b = place(w, 'b', FAR_HALF, 0); // beyond a's every eye reach — pre-1.7 the owner got NO boom here
    b.hp = 1; // any landed blow sinks it (a blow settles to at least 1)
    injectZone(w, 'z1', 'a', FAR_HALF, 0);
    injectShell(w, 's1', 'a', FAR_HALF - 20, 0, 0, 100); // a's shell, point-blank on b
    w.step();
    const fa = buildFrame(w, 'a');
    // Boom point zone-covered => visible; victim center zone-covered => hit un-stripped.
    expect(fa.events.filter((e) => e.k === 'boom')).toEqual([
      { k: 'boom', id: 's1', hit: 'b', x: expect.any(Number), y: expect.any(Number) },
    ]);
    // Wreck inside the owned zone => the sunk arrives WITNESSED (seen: true).
    expect(fa.events.filter((e) => e.k === 'sunk')).toEqual([{ k: 'sunk', id: 'b', by: 'a', seen: true }]);
    // dmg stays victim-private even under the zone (truesight parity, not omniscience).
    expect(fa.events.filter((e) => e.k === 'dmg')).toEqual([]);
  });

  it("a kill inside someone ELSE's zone: the boom never leaks; the sunk is public but UNSEEN (PV 23)", () => {
    const w = bareWorld();
    place(w, 'c', -FAR_HALF, 0); // non-owner observer (the world steps: on the board, ANNULUS_D from b)
    const b = place(w, 'b', FAR_HALF, 0); // beyond c's every eye reach
    b.hp = 1; // any landed blow sinks it (a blow settles to at least 1)
    injectZone(w, 'z1', 'a', FAR_HALF, 0); // a's zone — c gains nothing from it
    injectShell(w, 's1', 'a', FAR_HALF - 20, 0, 0, 100);
    w.step();
    const fc = buildFrame(w, 'c');
    expect(fc.events.filter((e) => e.k === 'boom')).toEqual([]);
    // The human sinking rides the public register — identity only, no `seen`,
    // so someone else's zone still grants c NO spatial knowledge.
    expect(fc.events.filter((e) => e.k === 'sunk')).toEqual([{ k: 'sunk', id: 'b', by: 'a' }]);
  });

  it('a ship BEHIND AN ISLAND inside the zone is still revealed to the firer (no LOS term)', () => {
    const w = bareWorld();
    w.map.islands.push(circleIsland(400, 0, 60)); // squarely between a and b
    place(w, 'a', 0, 0);
    place(w, 'b', 800, 0);
    injectZone(w, 'z1', 'a', 800, 0);
    expect(buildFrame(w, 'a').contacts.map((c) => c.id)).toEqual(['b']);
  });

  it('a ship outside the zone edge is NEVER revealed by it (boundary exact)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    // The zone sits ANNULUS_D up the y axis (beyond a's every eye reach, so
    // the zone is the only source); b is offset along x, so its distance
    // from the zone center is exactly its x.
    place(w, 'b', LIT_R, ANNULUS_D); // center exactly ON the edge — inclusive
    injectZone(w, 'z1', 'a', 0, ANNULUS_D);
    expect(buildFrame(w, 'a').contacts.map((c) => c.id)).toEqual(['b']);
    w.ships.get('b')!.state.x = LIT_R + 0.01; // a hair outside
    const out = buildFrame(w, 'a');
    expect(out.contacts).toEqual([]);
    expect('pc' in out).toBe(false);
  });

  it("a NON-OWNER never gains contacts from someone else's zone — only the radar-gated circle", () => {
    const w = bareWorld();
    place(w, 'a', 0, 0); // the firer (owns the zone)
    place(w, 'b', ANNULUS_D + 100, 0); // hidden inside the zone (beyond c's sight, unswept)
    const c = place(w, 'c', 100, 0); // third party: zone center ANNULUS_D away — within radar
    c.prevSweepAngle = Math.PI; // beam nowhere near b's bearing — no blip either
    c.sweepAngle = Math.PI + 0.001;
    injectZone(w, 'z1', 'a', ANNULUS_D + 100, 0);
    const fc = buildFrame(w, 'c');
    // b stays hidden from c (a, 100u away, is c's ordinary sight contact).
    expect(fc.contacts.map((x) => x.id)).toEqual(['a']);
    expect(fc.litZones).toEqual([{ id: 'z1', x: ANNULUS_D + 100, y: 0, r: LIT_R, until: 999_999, by: 'a' }]);
  });

  it("an enemy mine inside the firer's zone becomes a mine view (mines never radar-paint otherwise)", () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectMine(w, 'm1', 'b', 890, 0); // inside the zone, far beyond a's mine reach
    expect(890).toBeGreaterThan(MINE_SIGHT);
    injectMine(w, 'm2', 'b', 900 + LIT_R + 1, 0); // outside the zone edge — stays hidden
    injectZone(w, 'z1', 'a', 900, 0);
    expect(buildFrame(w, 'a').mines).toEqual([{ id: 'm1', x: 890, y: 0, own: false, by: 'b', c: 'naval' }]);
  });

  it("an unseen ballistic inside the firer's zone materializes exactly once, with current params", () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectShell(w, 's1', 'b', ANNULUS_D - 20, 0, Math.PI / 2, 400); // b's shell, deep inside the zone, beyond a's shell reach
    expect(shellsOf(buildFrame(w, 'a'))).toEqual([]); // unseen without the zone
    injectZone(w, 'z1', 'a', ANNULUS_D, 0);
    const ev = shellsOf(buildFrame(w, 'a'))[0];
    expect(ev).toBeDefined();
    const sh = w.shells.get('s1')!;
    expect({ x: ev.x, y: ev.y }).toEqual({ x: sh.x, y: sh.y }); // current pos, never the launch point
    assertBallisticShape(ev); // constant-free wire shape holds on the zone path too
    expect(shellsOf(buildFrame(w, 'a'))).toEqual([]); // exactly-once memory unchanged
  });

  it("a ballistic inside someone ELSE's zone stays hidden from a non-owner", () => {
    const w = bareWorld();
    place(w, 'c', 0, 0); // non-owner, shell far outside its shell reach
    injectShell(w, 's1', 'b', ANNULUS_D - 20, 0, Math.PI / 2, 400);
    injectZone(w, 'z1', 'a', ANNULUS_D, 0); // a's zone, not c's
    expect(shellsOf(buildFrame(w, 'c'))).toEqual([]);
  });
});

describe('perception — litZones channel (owner always, else radar-gated; frames omit when empty)', () => {
  it('the owner always receives its zone circle; a frame with no visible zones omits the key', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    const far = place(w, 'far', -FAR_HALF, 0); // a far observer, the other way from the zone
    injectZone(w, 'z1', 'a', BEYOND_RADAR, 0, CONFIG.starShells.litRadius, 42_000);
    expect(dist(far.state, w.litZones.get('z1')!)).toBeGreaterThan(RADAR); // premise: beyond its radar
    const fa = buildFrame(w, 'a');
    expect(fa.litZones).toEqual([
      { id: 'z1', x: BEYOND_RADAR, y: 0, r: CONFIG.starShells.litRadius, until: 42_000, by: 'a' },
    ]);
    // Beyond-radar third party: byte-free — the litZones key is ABSENT, not [].
    const ffar = buildFrame(w, 'far');
    expect('litZones' in ffar).toBe(false);
  });

  it('a third party sees the circle at dist == radar (inclusive), loses it just beyond', () => {
    const w = bareWorld();
    place(w, 'c', 0, 0);
    injectZone(w, 'z1', 'a', RADAR, 0);
    expect(buildFrame(w, 'c').litZones?.map((z) => z.id)).toEqual(['z1']);
    w.litZones.get('z1')!.x = RADAR + 0.01;
    expect('litZones' in buildFrame(w, 'c')).toBe(false);
  });

  it('no LOS and no sweep gate on the circle (a flare in the sky)', () => {
    const w = bareWorld();
    w.map.islands.push(circleIsland(200, 0, 40)); // blocks sight AND radar paint on the axis
    const c = place(w, 'c', 0, 0);
    c.prevSweepAngle = Math.PI; // beam on the far side — never crossed bearing 0
    c.sweepAngle = Math.PI + 0.001;
    injectZone(w, 'z1', 'a', 400, 0);
    expect(buildFrame(w, 'c').litZones?.map((z) => z.id)).toEqual(['z1']);
  });

  it('spectators see every zone', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectZone(w, 'z1', 'b', 9_000, 9_000, CONFIG.starShells.litRadius, 999_999);
    const zones = buildFrame(w, 'a', 'finished').litZones;
    expect(zones?.map((z) => z.id)).toEqual(['z1']);
  });

  it('no observer of the circle receives a doctrine verb any more — the `phos`/`daz` tail is gone (Story 8.17, amendment 134)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0); // the firer (owner)
    place(w, 'c', 100, 0); // third party: zone center within radar
    injectZone(w, 'zd', 'a', 500, 0, CONFIG.starShells.litRadius, 999_999);
    for (const f of [buildFrame(w, 'a'), buildFrame(w, 'c'), buildFrame(w, 'c', 'finished')]) {
      expect(Object.keys(f.litZones![0]).sort()).toEqual(['by', 'id', 'r', 'until', 'x', 'y']);
    }
  });

  it("a dead firer's zone persists and keeps revealing nothing to others (natural expiry only)", () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'c', 100, 0);
    injectZone(w, 'z1', 'a', 500, 0, CONFIG.starShells.litRadius, w.now + CONFIG.starShells.litDurationMs);
    w.respawnEnabled = false; // active-phase policy
    w.sinkShip('a', 'c');
    w.step();
    expect(w.litZones.has('z1')).toBe(true); // owner death never clears it
    // c still sees only the circle (never a's reveal privileges).
    expect(buildFrame(w, 'c').litZones?.map((z) => z.id)).toEqual(['z1']);
    // ...and it dies by natural expiry.
    const steps = Math.ceil(CONFIG.starShells.litDurationMs / DT) + 2;
    for (let i = 0; i < steps; i++) w.step();
    expect(w.litZones.size).toBe(0);
    expect('litZones' in buildFrame(w, 'c')).toBe(false);
  });
});

// ---------- Story 8.17: the PHOSPHOR burning zone (directed) ------------------
//
// Amendments 131 / 135(e) / 135(f): the burning zone rides its OWN frame
// channel (`burnZones`, BurnZoneView {id,x,y,r,until,by}) through the LIT
// ZONE's visibility gate byte-for-byte — owner always, else the centre within
// the observer's radar range, no LOS, no sweep, spectators all — and it is a
// HAZARD ONLY: it reveals nothing and extends no gun's reach. `dps` is
// server-private.

describe('perception — burnZones channel (Story 8.17: the lit-zone gate, a circle only, never a reveal)', () => {
  const R = CONFIG.phosphorShells.zoneRadius;

  it('the owner always receives its zone; a frame with no visible burn zones omits the key; `dps` never rides', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    const far = place(w, 'far', -FAR_HALF, 0); // the other way from the zone
    injectBurnZone(w, 'bz1', 'a', BEYOND_RADAR, 0, R, 42_000, 7);
    expect(dist(far.state, w.burnZones.get('bz1')!)).toBeGreaterThan(RADAR); // premise: beyond its radar
    const fa = buildFrame(w, 'a');
    expect(fa.burnZones).toEqual([{ id: 'bz1', x: BEYOND_RADAR, y: 0, r: R, until: 42_000, by: 'a' }]);
    expect(Object.keys(fa.burnZones![0])).toEqual(['id', 'x', 'y', 'r', 'until', 'by']);
    expect(JSON.stringify(fa)).not.toContain('dps');
    expect('burnZones' in buildFrame(w, 'far')).toBe(false); // byte-free beyond radar
    expect('burnZones' in buildFrame(w, 'a', 'finished')).toBe(true); // spectators see all
  });

  it('a third party sees the circle at dist == radar (inclusive), loses it just beyond — no LOS, no sweep gate', () => {
    const w = bareWorld();
    w.map.islands.push(circleIsland(200, 0, 40)); // blocks sight AND radar paint on the axis
    const c = place(w, 'c', 0, 0);
    c.prevSweepAngle = Math.PI; // beam on the far side — never crossed bearing 0
    c.sweepAngle = Math.PI + 0.001;
    injectBurnZone(w, 'bz1', 'a', RADAR, 0);
    expect(buildFrame(w, 'c').burnZones?.map((z) => z.id)).toEqual(['bz1']);
    w.burnZones.get('bz1')!.x = RADAR + 0.01;
    expect('burnZones' in buildFrame(w, 'c')).toBe(false);
  });

  it("a hull inside the FIRER'S OWN burn zone but outside its sight is NOT a contact (amendment 135(e)) — a lit zone in the same place WOULD reveal it", () => {
    const w = bareWorld();
    place(w, 'a', 0, 0); // the firer
    const b = place(w, 'b', BEYOND_RADAR, 0, 2.1); // way outside sight AND radar
    injectBurnZone(w, 'bz1', 'a', BEYOND_RADAR, 0, R);
    const f = buildFrame(w, 'a');
    expect(f.contacts).toEqual([]); // no reveal through a burning zone
    expect(f.events.filter((e) => e.k === 'blip')).toEqual([]);
    expect(f.burnZones?.map((z) => z.id)).toEqual(['bz1']); // ...only the circle itself
    // THE CONTROL: the same circle as a LIT zone reveals b to the firer.
    w.burnZones.clear();
    injectZone(w, 'z1', 'a', BEYOND_RADAR, 0, R);
    expect(buildFrame(w, 'a').contacts.map((c) => c.id)).toEqual(['b']);
  });

  it("a dead firer's burn zone persists and dies only by expiry (the lit-zone rule)", () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'c', 100, 0);
    injectBurnZone(w, 'bz1', 'a', 500, 0, R, w.now + CONFIG.phosphorShells.zoneDurationMs);
    w.respawnEnabled = false;
    w.sinkShip('a', 'c');
    w.step();
    expect(w.burnZones.has('bz1')).toBe(true);
    expect(buildFrame(w, 'c').burnZones?.map((z) => z.id)).toEqual(['bz1']);
    const steps = Math.ceil(CONFIG.phosphorShells.zoneDurationMs / DT) + 2;
    for (let i = 0; i < steps; i++) w.step();
    expect(w.burnZones.size).toBe(0);
    expect('burnZones' in buildFrame(w, 'c')).toBe(false);
  });
});

// ---------- Story 9.4: the FOULING SHELL foul zone (directed) -----------------
//
// Epic-9 amendment 63: the foul zone rides its OWN frame channel (`foulZones`,
// FoulZoneView {id,x,y,r,until,by}) through the BURN ZONE's visibility gate
// byte-for-byte — owner always, else the centre within the observer's radar
// range, no LOS, no sweep, spectators all — and it is a HAZARD ONLY: it
// reveals nothing, and nothing about who it slows rides it (the slow reaches
// each victim through its own private `you.fouledUntil`).

describe('perception — foulZones channel (Story 9.4: the burn-zone gate, a circle only, never a reveal)', () => {
  const R = CONFIG.foulingShell.radius;

  it('the owner always receives its zone; a frame with no visible foul zones omits the key; key order is id,x,y,r,until,by', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    const far = place(w, 'far', -FAR_HALF, 0); // the other way from the zone
    injectFoulZone(w, 'fz1', 'a', BEYOND_RADAR, 0, R, 42_000);
    expect(dist(far.state, w.foulZones.get('fz1')!)).toBeGreaterThan(RADAR); // premise: beyond its radar
    const fa = buildFrame(w, 'a');
    expect(fa.foulZones).toEqual([{ id: 'fz1', x: BEYOND_RADAR, y: 0, r: R, until: 42_000, by: 'a' }]);
    expect(Object.keys(fa.foulZones![0])).toEqual(['id', 'x', 'y', 'r', 'until', 'by']);
    expect(JSON.stringify(fa)).not.toContain('ownerId');
    expect('foulZones' in buildFrame(w, 'far')).toBe(false); // byte-free beyond radar
    expect('foulZones' in buildFrame(w, 'a', 'finished')).toBe(true); // spectators see all
  });

  it('a third party sees the circle at dist == radar (inclusive), loses it just beyond — no LOS, no sweep gate', () => {
    const w = bareWorld();
    w.map.islands.push(circleIsland(200, 0, 40)); // blocks sight AND radar paint on the axis
    const c = place(w, 'c', 0, 0);
    c.prevSweepAngle = Math.PI; // beam on the far side — never crossed bearing 0
    c.sweepAngle = Math.PI + 0.001;
    injectFoulZone(w, 'fz1', 'a', RADAR, 0);
    expect(buildFrame(w, 'c').foulZones?.map((z) => z.id)).toEqual(['fz1']);
    w.foulZones.get('fz1')!.x = RADAR + 0.01;
    expect('foulZones' in buildFrame(w, 'c')).toBe(false);
  });

  it("a hull inside the FIRER'S OWN foul zone but outside its sight is NOT a contact — a lit zone in the same place WOULD reveal it", () => {
    const w = bareWorld();
    place(w, 'a', 0, 0); // the firer
    const b = place(w, 'b', BEYOND_RADAR, 0, 2.1); // way outside sight AND radar
    injectFoulZone(w, 'fz1', 'a', BEYOND_RADAR, 0, R);
    const f = buildFrame(w, 'a');
    expect(f.contacts).toEqual([]); // no reveal through a foul zone
    expect(f.events.filter((e) => e.k === 'blip')).toEqual([]);
    expect(f.foulZones?.map((z) => z.id)).toEqual(['fz1']); // ...only the circle itself
    // THE CONTROL: the same circle as a LIT zone reveals b to the firer.
    w.foulZones.clear();
    injectZone(w, 'z1', 'a', BEYOND_RADAR, 0, R);
    expect(buildFrame(w, 'a').contacts.map((c) => c.id)).toEqual(['b']);
  });

  it("a dead firer's foul zone persists and dies only by expiry (the burn-zone rule)", () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'c', 100, 0);
    injectFoulZone(w, 'fz1', 'a', 500, 0, R, w.now + CONFIG.foulingShell.durationMs);
    w.respawnEnabled = false;
    w.sinkShip('a', 'c');
    w.step();
    expect(w.foulZones.has('fz1')).toBe(true);
    expect(buildFrame(w, 'c').foulZones?.map((z) => z.id)).toEqual(['fz1']);
    const steps = Math.ceil(CONFIG.foulingShell.durationMs / DT) + 2;
    for (let i = 0; i < steps; i++) w.step();
    expect(w.foulZones.size).toBe(0);
    expect('foulZones' in buildFrame(w, 'c')).toBe(false);
  });
});

// ---------- Story 10.8: the fleet's three wire keys are GONE (directed) ------
//
// `Contact.aggro` (Story 5.6, amendment 40), `SunkEvent.vcls` (amendment 43)
// and `SunkEvent.kcls` (Story 7.6) were the PvE fleet's keys: the self-private
// hunting mark, the victim's hull id to a killer who could hold no roster row
// for it, and a PvE killer's hull id. With the fleet retired the server sets
// none of them — the shared wire type keeps them optional until the shared
// cut, so the pin lives here (and in the invariant's oracles above).

describe('perception — the retired fleet keys never ride the wire (Story 10.8)', () => {
  /** The sunk rows in one observer's frame this tick. */
  function sunkRows(w: World, viewer: string, phase: MatchPhase = 'active'): SunkEvent[] {
    return buildFrame(w, viewer, phase).events.filter((e): e is SunkEvent => e.k === 'sunk');
  }

  it('a sighted contact carries no `aggro`, whoever is looking', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 150, 0);
    place(w, 'c', 0, 150);
    w.step();
    for (const viewer of ['a', 'b', 'c']) {
      for (const c of buildFrame(w, viewer, 'active').contacts) expect('aggro' in c, `${viewer} -> ${c.id}`).toBe(false);
    }
  });

  it('a sinking carries no `vcls` / `kcls` — not to the credited killer, not to a witness, not to a spectator', () => {
    const w = bareWorld();
    const killer = place(w, 'killer', -FAR_HALF, 0);
    const bystander = place(w, 'bystander', -FAR_HALF + 100, 0);
    const victim = place(w, 'rival', FAR_HALF, 0); // unsighted by everyone (the world steps: on the board)
    expect(sighted(w, killer, victim.state) || sighted(w, bystander, victim.state)).toBe(false);
    w.sinkShip('rival', 'killer');
    w.step();
    for (const viewer of ['killer', 'bystander']) {
      const rows = sunkRows(w, viewer);
      expect(rows, viewer).toHaveLength(1); // the public register (PV 23)
      expect(Object.keys(rows[0]), viewer).toEqual(['k', 'id', 'by']);
    }
    const spec = sunkRows(w, 'rival', 'finished'); // the victim, unfogged
    expect(spec).toHaveLength(1);
    expect('vcls' in spec[0] || 'kcls' in spec[0]).toBe(false);
  });
});

// ---------- Story 4.12: radar wakes (directed) --------------------------------

describe('perception — radar wakes (Story 4.12, directed)', () => {
  it('discloses exactly the swept segments — in-sight water included (amendment 210: no inner bound)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 900, 900); // its WATER, not its hull, is under test
    // Pin the production-derived ribbon constants against LITERALS (the
    // oracle-independence rule): a hull's water lives 5.5s (cut from
    // 12s by amendment 213) and its turbulent core is its own beam (Story 10.4: the default hull's).
    expect(b.wake.lifeMs).toBe(5_500);
    expect(b.wake.widthU).toBe(CONFIG.shipClasses[DEFAULT_CLASS_ID].hull.beam);
    // A straight laid track along y=0 STRADDLING the sight ring — half of it
    // inside sight, half beyond: 26 samples on the 12u cadence, ages spread
    // over 5s — the spread is kept INSIDE the life so the whole fixture
    // track is live water.
    const trackEnd = SIGHT + (25 * 12) / 2;
    injectWakeTrack(b.wake, trackEnd, 0, 0, 26, w.now, 5_000);
    const firstMid = trackEnd - 25 * 12 + 6; // the oldest segment's midpoint
    expect(firstMid).toBeLessThan(SIGHT - 50); // well inside sight
    windowAround(a, 0);
    const f = buildFrame(w, 'a');
    verifyFrame(w, 'a', f); // the completeness oracle: exactly the gated segments
    const wks = f.events.filter((e): e is WakeBlipEvent => e.k === 'wk');
    expect(wks.length).toBeGreaterThan(0);
    // The track's age spread reaches the wire as more than one bucket.
    expect(new Set(wks.map((e) => e.a)).size).toBeGreaterThan(1);
    // In-bubble water rides the row like any radar return: a disclosed mask
    // covers the cell containing the oldest midpoint, inside sight.
    const cellX = Math.floor(firstMid / RCELL_U);
    const cellY = Math.floor(0 / RCELL_U);
    expect(wks.some((e) => coverageHas(e, cellX - e.gx, cellY - e.gy))).toBe(true);
    // An unswept bearing discloses nothing at all.
    windowAround(a, Math.PI);
    expect(buildFrame(w, 'a').events.some((e) => e.k === 'wk')).toBe(false);
  });

  it("the observer's OWN hull wake reaches its own wk row like any other return (Eric 2026-10-21: all radar returns); another ship's in-sight water does too", () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.state.speed = 30; // a lone moving hull laying its own ribbon astern
    injectWakeTrack(a.wake, 0, 0, 0, 26, w.now, 5_000); // ends under its own hull, 300 u of water astern
    const N = 64;
    const sweepAll = (): WakeBlipEvent[] => {
      const out: WakeBlipEvent[] = [];
      for (let k = 0; k < N; k++) {
        windowAround(a, (k * 2 * Math.PI) / N, Math.PI / N);
        const f = buildFrame(w, 'a');
        verifyFrame(w, 'a', f);
        out.push(...f.events.filter((e): e is WakeBlipEvent => e.k === 'wk'));
      }
      return out;
    };
    expect(sweepAll().length).toBeGreaterThan(0);
    // Another ship's water, deep inside sight, discloses on the same sweep.
    const b = place(w, 'b', 900, 900);
    const before = sweepAll().length;
    injectWakeTrack(b.wake, SIGHT / 2, 0, 0, 26, w.now, 5_000); // the whole track ends half a sight out: in-sight water
    expect(sweepAll().length).toBeGreaterThan(before);
  });

  it('a track behind hard cover does not disclose; the same track over low terrain does (amendment 179 on water)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 900, 900);
    injectWakeTrack(b.wake, ANNULUS_D, 0, 0, 6, w.now, 3_000); // the last 60u up to ANNULUS_D along y=0
    windowAround(a, 0);
    // Hard cover (q255 ≥ the q64 mast) across bearing 0 at 300u: the bearing
    // is dark to the rim — the water is gated exactly as a hull is.
    w.map.heightRaster = rasterFrom(700, ridgeField(300, 0, 40, 40));
    expect(buildFrame(w, 'a').events.some((e) => e.k === 'wk')).toBe(false);
    // The SAME geometry over a low q8 rise: soft cover with a residual reach
    // past the track, so it paints — the deliberate disclosure widening a
    // low island stopped hiding things behind it (Story 4.11).
    w.map.heightRaster = rasterFrom(700, ridgeField(300, 0, 40, 40, 8));
    const f = buildFrame(w, 'a');
    verifyFrame(w, 'a', f);
    expect(f.events.some((e) => e.k === 'wk')).toBe(true);
  });

  it("a wake outlives its ship, then the ship's record, and is reaped when the water is gone (amendment 200)", () => {
    const w = bareWorld();
    // The world STEPS: both hulls on the board, ANNULUS_D apart on the y
    // axis, so the sinking hull itself is beyond a's every eye reach and off
    // the swept bearing — only its WATER, laid along bearing 0 from a, is
    // under test.
    const a = place(w, 'a', 0, -FAR_HALF);
    const b = place(w, 'b', 0, FAR_HALF);
    injectWakeTrack(b.wake, SIGHT / 4, -FAR_HALF, 0, 10, w.now, 2_000);
    w.respawnEnabled = false; // active-phase policy: the dead stay dead
    w.sinkShip('b');
    w.step();
    windowAround(a, 0);
    let f = buildFrame(w, 'a');
    verifyFrame(w, 'a', f);
    expect(f.events.filter((e) => e.k === 'wk').length).toBeGreaterThan(0); // sunk: the water still paints
    // The record itself leaves (client gone): the ribbon detaches into the
    // orphan store and KEEPS disclosing — a fading track with nothing
    // attached to it.
    w.removeShip('b');
    f = buildFrame(w, 'a');
    expect(f.events.filter((e) => e.k === 'wk').length).toBeGreaterThan(0);
    expect(w.wakeRibbons).toHaveLength(2); // a's active ribbon + b's orphaned water
    // ...until the water ages out, at which point the orphan is REAPED.
    for (let i = 0; i < Math.ceil(5_500 / DT) + 2; i++) w.step();
    windowAround(a, 0);
    expect(buildFrame(w, 'a').events.some((e) => e.k === 'wk')).toBe(false);
    expect(w.wakeRibbons).toHaveLength(1); // only a's (empty) active ribbon remains
  });

  it("a torpedo's water paints while the torpedo itself stays silent beyond the torpedo reach (amendment 196)", () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    // A live torpedo at ANNULUS_D — beyond every eye reach: its
    // torp row must stay byte-silent while the water behind it paints.
    injectShell(w, 'fish', 'zz', ANNULUS_D, 6, 0, 400, false, 'torp');
    // The torpedo ribbon's ruled constants as LITERALS: half a ship's life
    // (2750ms since amendment 213 cut the ship clock; the 0.5 factor is
    // unchanged), one 9u cell wide.
    const tw: WakeRibbon = { xs: new Float64Array(20), ys: new Float64Array(20), ts: new Float64Array(20), cap: 20, head: 0, count: 0, lifeMs: 2_750, widthU: 9, torp: true, hullAheadU: 0 };
    injectWakeTrack(tw, ANNULUS_D, 6, 0, 8, w.now, 5_000); // the last 84u up to ANNULUS_D at y=6
    w.torpWakes.set('fish', tw);
    windowAround(a, 0.013, 0.03); // the wedge covering the ribbon's bearings
    const f = buildFrame(w, 'a');
    verifyFrame(w, 'a', f);
    expect(f.events.some((e) => e.k === 'torp')).toBe(false); // the quiet weapon stays quiet
    const wks = f.events.filter((e): e is WakeBlipEvent => e.k === 'wk');
    expect(wks.length).toBeGreaterThan(0);
    // The 6s clock quantizes the same track older than a ship's 12s clock
    // would: the 5s-old tail reads bucket 3, the fresh head bucket 0.
    expect(new Set(wks.map((e) => e.a)).size).toBeGreaterThan(1);
  });

  it('torpedo and ship water disclose at EVERY distance — past sight, just inside it, deep inside the torpedo reach (amendment 210: no inner bound)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    // HISTORY: review-gate P2 gave torpedo water a detect inner bound and
    // ship water a sight inner bound. Amendment 210 (Eric 2026-10-21: the
    // server returns the entire sweep) retired both — water is a radar
    // return at any distance, gated by sweep and shadow alone (the dropout
    // left with Story 11.2).
    const cap = 20;
    const inBand = SIGHT - 30; // a track ending just inside sight
    const tw: WakeRibbon = { xs: new Float64Array(cap), ys: new Float64Array(cap), ts: new Float64Array(cap), cap, head: 0, count: 0, lifeMs: 2_750, widthU: 9, torp: true, hullAheadU: 0 };
    injectWakeTrack(tw, SIGHT + 70, 0, 0, 4, w.now, 2_000); // sight+34..sight+70 along y=0 — past sight
    w.torpWakes.set('fish', tw);
    windowAround(a, 0);
    const f = buildFrame(w, 'a');
    verifyFrame(w, 'a', f);
    expect(f.events.some((e) => e.k === 'wk')).toBe(true);
    // Water just inside sight is disclosed too.
    const band: WakeRibbon = { ...tw, xs: new Float64Array(cap), ys: new Float64Array(cap), ts: new Float64Array(cap), head: 0, count: 0 };
    injectWakeTrack(band, inBand, 0, 0, 4, w.now, 2_000);
    w.torpWakes.set('fish', band);
    const fb = buildFrame(w, 'a');
    verifyFrame(w, 'a', fb);
    expect(fb.events.some((e) => e.k === 'wk')).toBe(true);
    w.torpWakes.set('fish', tw);
    // ...and deep inside the torpedo's own eye reach.
    const innerEnd = TORP_SIGHT / 2;
    const inner: WakeRibbon = { xs: new Float64Array(cap), ys: new Float64Array(cap), ts: new Float64Array(cap), cap, head: 0, count: 0, lifeMs: 2_750, widthU: 9, torp: true, hullAheadU: 0 };
    injectWakeTrack(inner, innerEnd, 0, 0, 4, w.now, 2_000); // inside the torpedo reach
    w.torpWakes.set('fish2', inner);
    const f2 = buildFrame(w, 'a');
    verifyFrame(w, 'a', f2);
    const cellX = Math.floor((innerEnd - 10) / RCELL_U);
    expect(
      f2.events.filter((e): e is WakeBlipEvent => e.k === 'wk').some((e) => coverageHas(e, cellX - e.gx, 0 - e.gy)),
    ).toBe(true);
    // And a SHIP's water inside sight discloses the same way.
    const b = place(w, 'b', 900, 900);
    injectWakeTrack(b.wake, inBand, 40, 0, 4, w.now, 2_000);
    windowAround(a, bearing(a.state, { x: inBand - 18, y: 40 }), 0.2);
    const f3 = buildFrame(w, 'a');
    verifyFrame(w, 'a', f3);
    const shipCellX = Math.floor((inBand - 18) / RCELL_U);
    const shipCellY = Math.floor(40 / RCELL_U);
    expect(
      f3.events.filter((e): e is WakeBlipEvent => e.k === 'wk').some((e) => coverageHas(e, shipCellX - e.gx, shipCellY - e.gy)),
    ).toBe(true);
  });

  it("in-bubble torpedo water follows the RADAR's island rule (the shadow march), not the eye's binary LOS (amendment 210)", () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    // An island POLYGON squarely across bearing 0 with the raster left FLAT:
    // the eye's binary LOS is blocked, the radar's shadow march sees open
    // water. In-bubble water is a radar return, so it DISCLOSES.
    w.map.islands.push(circleIsland(200, 0, 40));
    const cap = 20;
    const tw: WakeRibbon = { xs: new Float64Array(cap), ys: new Float64Array(cap), ts: new Float64Array(cap), cap, head: 0, count: 0, lifeMs: 2_750, widthU: 9, torp: true, hullAheadU: 0 };
    injectWakeTrack(tw, SIGHT - 30, 0, 0, 4, w.now, 2_000); // inside sight, behind the polygon
    w.torpWakes.set('fish', tw);
    windowAround(a, 0);
    const f = buildFrame(w, 'a');
    verifyFrame(w, 'a', f);
    expect(f.events.some((e) => e.k === 'wk')).toBe(true);
    // Hard cover (q255 ≥ the mast) on the same bearing in the RASTER darkens
    // the same in-bubble water — the radar's own rule.
    w.map.heightRaster = rasterFrom(700, ridgeField(200, 0, 40, 40));
    const f2 = buildFrame(w, 'a');
    verifyFrame(w, 'a', f2);
    expect(f2.events.some((e) => e.k === 'wk')).toBe(false);
  });

  it('the wire mask SCINTILLATES per paint: the same segment on two ticks draws two different masks, spine intact (review-gate P3)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 900, 900);
    injectWakeTrack(b.wake, ANNULUS_D, 0, 0, 10, w.now, 2_000);
    b.wake.widthU = 32; // a battleship-beam ribbon: 3-4 sharp rows, real flanks to glint
    windowAround(a, 0);
    const f1 = buildFrame(w, 'a');
    verifyFrame(w, 'a', f1);
    const first = f1.events.filter((e): e is WakeBlipEvent => e.k === 'wk');
    expect(first.length).toBeGreaterThan(0);
    w.step(); // 50ms later: same water, same geometry, a fresh paint seed
    windowAround(a, 0);
    const f2 = buildFrame(w, 'a');
    verifyFrame(w, 'a', f2);
    const second = f2.events.filter((e): e is WakeBlipEvent => e.k === 'wk');
    expect(second.length).toBeGreaterThan(0);
    // At least one segment's mask must differ between the two paints — a
    // byte-identical replay means the width fingerprint rides the wire
    // un-fuzzed (the P3 defect). Deterministic: fixed seed, fixed tick times.
    const key = (e: WakeBlipEvent): string => `${e.gx},${e.gy},${e.w},${e.h},${e.bits.join('.')}`;
    const firstKeys = new Set(first.map(key));
    expect(second.some((e) => !firstKeys.has(key(e)))).toBe(true);
    // And every mask still carries its centre-line: the spine is core, never
    // glinted, so each disclosed segment's own cell chain survives (checked
    // structurally by the completeness oracle's mask equality above).
  });
});

// ---------- THE INVARIANT (property-style over random worlds) ----------------

/**
 * KEYS NO FRAME MAY CARRY, card-economy edition (Story 8.2 + 8.3, re-cut for
 * Story 8.14). The DECK, its frozen list and its id are retired mechanisms and
 * stay on this list so a resurrection is caught; the DRAW-PILE COUNTER family
 * (`deckLeft`, `deckSize`, `pool`, `remaining`) was deleted by Eric on
 * 2026-09-10/11 ("if the player can infer it, do not propose it") and a field
 * with no consumer may not ride along "for later".
 *
 * `takes` AND `weights` ARE THE STORY 8.14 ADDITIONS (amendments 90/91). The
 * match-wide take ledger and the per-ship weights it derives are the newest
 * server-private card state there is: knowing which lines other captains have
 * taken — or how your own draw is weighted — is knowing other people's builds,
 * which is exactly what the anti-cheat boundary exists to withhold. Only the
 * four offered line ids ever leave the server.
 *
 * `CONFIG.offer.weighting` is deliberately NOT in tension with this: `config`
 * rides the WELCOME, not a frame, and the two dials are public numbers. The
 * key `weighting` is therefore absent from this list while `weights` — the
 * per-ship derived map — is on it.
 *
 * Matched as KEYS (see `hasForbiddenKey`), never as a substring of the
 * serialized text, so a LINE ID riding `offer`/`cards` as a VALUE can never
 * false-positive.
 *
 * THE HAND LOG TOO (Story 8.21, R1): `hands`, `offered`, `taken` and `record`
 * are the server-only MatchRecord's vocabulary — every hand a captain was
 * dealt, what they took, what they threw back. No frame ever carried them;
 * this is the forward pin that none ever will.
 */
const DECK_FORBIDDEN_KEYS = ['deck', 'deckList', 'deckId', 'deckLeft', 'deckSize', 'pool', 'remaining', 'takes', 'weights', 'hands', 'offered', 'taken', 'record'] as const;

/**
 * Recursively walk every plain object/array nested in `value` and report
 * whether any of them carries an OWN KEY that exactly matches one of
 * `forbidden` (case-sensitive). A forbidden word occurring only as a VALUE —
 * a string, a substring of a longer key, part of serialized text — never
 * trips this: only the key position counts, which is what makes it safe
 * against the deck-gun family's LINE IDS riding `offer`/`cards` as values.
 */
function hasForbiddenKey(value: unknown, forbidden: readonly string[]): boolean {
  if (Array.isArray(value)) return value.some((entry) => hasForbiddenKey(entry, forbidden));
  if (value === null || typeof value !== 'object') return false;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (forbidden.includes(key)) return true;
    if (hasForbiddenKey(nested, forbidden)) return true;
  }
  return false;
}

describe('hasForbiddenKey — a KEY scan, not a value scan', () => {
  it('a forbidden word riding as a VALUE passes; the same word as a KEY fails', () => {
    expect(hasForbiddenKey({ note: 'pool' }, DECK_FORBIDDEN_KEYS)).toBe(false);
    expect(hasForbiddenKey({ pool: 1 }, DECK_FORBIDDEN_KEYS)).toBe(true);
  });
});

/** Story 10.4 fuzz helpers. A uniform hull off a SIDE stream (so the shared
 *  scenario rng is unmoved). */
function pickHull(side: { next(): number }): HullId {
  return SHIP_CLASS_IDS[Math.min(SHIP_CLASS_IDS.length - 1, Math.floor(side.next() * SHIP_CLASS_IDS.length))];
}

/** Scramble a hull's turret angles anywhere inside each turret's legal train
 *  interval, and a random remaining reload, off the side stream — so `tu` and
 *  the self-private turret pin see varied, non-rest state. */
function scrambleTurrets(rec: ShipRecord, side: { next(): number }): void {
  const train = turretTrainRad(rec.hullId);
  turretMounts(rec.hullId).forEach((m, i) => {
    rec.turrets[i].a = turretRest(m) + (side.next() * 2 - 1) * train;
    rec.turrets[i].reloadMsLeft = side.next() < 0.5 ? 0 : side.next() * CONFIG.mainBattery.reloadMs;
  });
}

/** Story 10.6 fuzz helper: about half the hulls mount torpedo LAUNCHERS (one
 *  or two, one or two tubes each — angles scrambled inside each arc, tube
 *  clocks random) and about half carry mine RACKS — raw state writes off the
 *  SIDE stream (the scrambleTurrets posture), so `lu` and the self-private
 *  `launchers` / `racks` pins see varied, non-rest state. */
function scrambleMounts(rec: ShipRecord, side: { next(): number }): void {
  if (side.next() < 0.5) {
    const counts = { torpedoLaunchers: side.next() < 0.5 ? 1 : 2, tubesPerLauncher: side.next() < 0.5 ? 1 : 2 };
    rec.launchers = initialLaunchers(rec.hullId, counts);
    rec.launchers.forEach((l, i) => {
      l.a = launcherRest(i) + (side.next() * 2 - 1) * launcherTrainRad(rec.hullId, i);
      for (let k = 0; k < l.tubes.length; k += 1) l.tubes[k] = side.next() < 0.5 ? 0 : side.next() * 20_000;
    });
  }
  if (side.next() < 0.5) {
    const n = side.next() < 0.5 ? 1 : 2;
    rec.racks = { racks: Array.from({ length: n }, () => ({ n: Math.floor(side.next() * 4), reloadMsLeft: side.next() * 10_000 })), next: 0 };
  }
}

/** One random level drives BOTH held inputs (Story 10.4) — no extra draw. */
function bothLevels(level: boolean): { held: boolean; sec: boolean } {
  return { held: level, sec: level };
}

/**
 * THE MAIN BATTERY AND THE SECONDARIES ARE SELF-PRIVATE except for one sighted
 * field (Story 10.4, contract §7):
 *   (1) `tu` — a hull's turret ANGLES — rides ONLY a contact row (the row's
 *       own visibility gate is what the rest of this verifier proves), equals
 *       the shared encoding of THAT hull's turrets, and is absent on a hull
 *       with no battery;
 *   (2) reloads, heat, lock and the Shift ride NOTHING but `you`: the keys
 *       `turrets`, `reloadMsLeft`-bearing turret rows, `heat`, `locked`,
 *       `untilRoundMs` and `shift` appear nowhere else, and the round phase
 *       `untilRoundMs` appears nowhere at all;
 *   (3) on `you` they are exactly the observer's own record's.
 */
function verifyBatteryPrivacy(w: World, me: ShipRecord, f: FrameMsg, withoutYou: object): void {
  for (const c of f.contacts) {
    const ship = w.ships.get(c.id);
    if (ship === undefined) continue;
    if (ship.turrets.length === 0) expect('tu' in c).toBe(false);
    else {
      expect(c.tu).toEqual(encodeTurretAngles(ship.turrets, ship.hullId));
      TU_SEEN.n += 1;
    }
    // Story 10.6 (I7): `lu` — the launcher ANGLES — on exactly `tu`'s terms:
    // only on a contact row, the shared encoding of THAT hull's launchers,
    // absent on a hull with none, appended directly after `tu`.
    if (ship.launchers.length === 0) expect('lu' in c).toBe(false);
    else {
      expect(c.lu).toEqual(encodeLauncherAngles(ship.launchers));
      const keys = Object.keys(c);
      expect(keys[keys.length - 1]).toBe('lu');
      if ('tu' in c) expect(keys.indexOf('lu')).toBe(keys.indexOf('tu') + 1);
      LU_SEEN.n += 1;
    }
  }
  const withoutContacts = { ...withoutYou, contacts: undefined };
  expect(hasForbiddenKey(withoutContacts, ['tu', 'lu'])).toBe(false);
  // Tube and rack clocks (Story 10.6) ride `you` and nothing else.
  expect(hasForbiddenKey(withoutYou, ['turrets', 'heat', 'untilRoundMs', 'shift', 'launchers', 'tubes', 'racks'])).toBe(false);
  expect(JSON.stringify(f)).not.toContain('untilRoundMs');
  if (f.you === undefined) return;
  expect(f.you.turrets).toEqual(me.turrets.map((t) => ({ a: t.a, reloadMsLeft: t.reloadMsLeft })));
  expect(f.you.sec).toEqual({ heat: me.sec.heat });
  // ...and on `you` they are exactly the observer's own, present iff it holds any.
  expect('launchers' in f.you).toBe(me.launchers.length > 0);
  if (me.launchers.length > 0) expect(f.you.launchers).toEqual(me.launchers);
  expect('racks' in f.you).toBe(me.racks.racks.length > 0);
  if (me.racks.racks.length > 0) expect(f.you.racks).toEqual(me.racks.racks);
  if ('launchers' in f.you || 'racks' in f.you) OWN_MOUNTS_SEEN.n += 1;
}

/** True iff some object nested in `value` carries numeric `x`, `y` equal to `p`. */
function carriesPoint(value: unknown, p: Vec2): boolean {
  if (Array.isArray(value)) return value.some((v) => carriesPoint(v, p));
  if (value === null || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  if (o.x === p.x && o.y === p.y) return true;
  return Object.values(o).some((v) => carriesPoint(v, p));
}

/** Story 11.1: an IN-FLIGHT dispersed shell's landing (its target point) is
 *  server-private until it lands — no frame row sits on it as a value. (A
 *  shell spawned AT its target, the point-blank rule, is skipped: its
 *  position IS its target, and its reveal is already a landing.) */
function verifyNoLandingPoint(w: World, f: FrameMsg): void {
  for (const s of w.shells.values()) {
    if (s.targetX === null || s.targetY === null || (s.family !== 'cannon' && s.family !== 'mg')) continue;
    if (s.x === s.targetX && s.y === s.targetY) continue;
    expect(carriesPoint(f, { x: s.targetX, y: s.targetY }), `shell ${s.id}'s landing rode a frame`).toBe(false);
    LANDING_GUARDED.n += 1;
  }
}

/** Story 11.1 review fix — NO CONVERGING TRACKS ON THE WIRE: the shell
 *  reveals of ONE main-battery salvo in a frame (grouped by the server's
 *  truth: same owner, same birth time) carry parallel velocities, read off
 *  the wire fields ONLY (vx, vy) — pairwise cross product ~0, so their tracks
 *  never intersect and two visible shells solve no aim point and no range. */
function verifyParallelSalvoTracks(w: World, f: FrameMsg): void {
  const salvos = new Map<string, BallisticEvent[]>();
  for (const e of f.events) {
    if (e.k !== 'shell') continue;
    const s = w.shells.get(e.id);
    if (s === undefined || s.batteryShell !== true) continue;
    const key = `${s.ownerId}@${s.bornAt}`;
    salvos.set(key, [...(salvos.get(key) ?? []), e]);
  }
  for (const rows of salvos.values()) {
    for (let i = 1; i < rows.length; i += 1) {
      const a = rows[0];
      const b = rows[i];
      const cross = (a.vx * b.vy - a.vy * b.vx) / (Math.hypot(a.vx, a.vy) * Math.hypot(b.vx, b.vy));
      expect(Math.abs(cross), `salvo tracks ${a.id} / ${b.id} converge`).toBeLessThan(1e-9);
      PARALLEL_PAIRS.n += 1;
    }
  }
}

/** Assert one frame leaks nothing beyond the observer's vision. */
function verifyFrame(w: World, viewerId: string, f: FrameMsg): void {
  const me = w.ships.get(viewerId)!;
  // Fitted boons ride ONLY on the observer's own ship — never on a contact.
  if (f.you) expect(f.you.cards).toEqual(me.cards);
  // Story 2.6: level + XP progress are self-private on the same terms — the
  // observer's OWN values, and nothing else's.
  if (f.you) {
    expect(f.you.lvl).toBe(me.level);
    expect(f.you.xp).toBeCloseTo(me.xpMs / CONFIG.xp.levelMs, 12);
    // HULL REPAIR (2026-08-04; a CARD since Story 8.8): the paid regen pool is
    // self-private on the boostUntil terms — the OBSERVER'S OWN value on `you`,
    // and nothing else's. The free per-level channel that used to be summed in
    // here is gone (epic-8 amendment 46); the out-of-combat regen that replaced
    // it has no pool at all. The privacy claim is unchanged and is what the
    // structural pin below still enforces.
    expect(f.you.repairHp).toBe(me.repairHp);
  }
  // THE STRUCTURAL PIN: `repairHp` may exist NOWHERE in a frame except `you`,
  // and the string must be absent entirely from any frame that has no `you`
  // (every spectator frame). A whole-frame text scan, so a future channel that
  // starts carrying the pool — a contact field, a heal event payload, a
  // spectator passthrough — fails here even if no verifier knows about it.
  const withoutYou = { ...f, you: undefined };
  expect(JSON.stringify(withoutYou)).not.toContain('repairHp');
  // ...AND THE FOULING DEPTH, on identical terms (Story 8.13, epic-8 amendment
  // 86). `slowFactor` names the LAYER's tier, so it is intel about somebody
  // else's build: it may ride the VICTIM's own ship and nowhere else — not a
  // contact for a fouled hull, not a boom payload, not a spectator passthrough
  // — and it may not exist at all on a frame with no `you`. Same whole-frame
  // text scan as the pool above, so a future channel that starts carrying it
  // fails here even if no verifier knows about it. (The window it rides with,
  // `slowedUntil`, has been pinned victim-private since Story 2.8 in
  // doctrines.test.ts; this is its depth.)
  expect(JSON.stringify(withoutYou)).not.toContain('slowFactor');
  // THE HUNKER (was DAMAGE CUT until Story 9.9) WINDOW (Story 8.15, the Battleship's Shift, amendments
  // 99–102) is SELF-PRIVATE on the boostUntil terms: an enemy reads a cut hull
  // only through its persistence under fire. It may exist NOWHERE but `you`,
  // the string must be absent from any frame that has no `you`, and on `you`
  // it is present IFF the observer's own record has a cut opened this life.
  expect(JSON.stringify(withoutYou)).not.toContain('hunkerUntil');
  if (f.you !== undefined) {
    expect('hunkerUntil' in f.you).toBe(me.hunkerUntil > 0);
    if (me.hunkerUntil > 0) expect(f.you.hunkerUntil).toBe(me.hunkerUntil);
  }
  // (The SHIELD BLOCK seat's pin left with the shield — Story 10.5: no frame
  // carries a `shield` key at all.)
  expect(JSON.stringify(f)).not.toContain('"shield"');
  // THE SEAT'S SHIFT AND THE HELD LEVELS never ride anything but `you` (the
  // Shift, Story 10.4 — the seat gun's successor) — and `held` / `sec` are
  // INPUT, which no frame carries at all: a secondaries stream is disclosed
  // only through its rounds' reveals and their flashes, never as "this hull's
  // button is down". The retired seat `gun` key rides nowhere.
  expect(JSON.stringify(f)).not.toContain('"gun"');
  expect(JSON.stringify(withoutYou)).not.toContain('"shift"');
  expect(JSON.stringify(f)).not.toContain('"held"');
  if (f.you !== undefined) expect(f.you.shift).toBe(me.shift);
  verifyBatteryPrivacy(w, me, f, withoutYou);
  // (The seat's KIT left with Story 10.5: no frame carries a `kit` key.)
  expect(JSON.stringify(f)).not.toContain('"kit"');
  // And when it IS on `you`, it is this observer's own record's factor and
  // present only while the observer's own window runs.
  if (f.you !== undefined) {
    const slowed = me.slowedUntil > w.now && me.slowFactor !== 1;
    expect('slowFactor' in f.you).toBe(slowed);
    if (slowed) expect(f.you.slowFactor).toBe(me.slowFactor);
  }
  // THE CARD ECONOMY NEVER RIDES THE WIRE (Story 8.2, epic-8 Anti-cheat;
  // extended by 8.3 and again by 8.14): the retired deck keys AND the new
  // `takes` / `weights` may appear as a KEY nowhere in ANY frame — `you`
  // included, because `you.cards`, `you.offer` and `you.gun` are the only
  // card-shaped fields a captain may see. A recursive key walk, not a
  // serialized-text scan, because the deck-gun family's LINE IDS legitimately
  // ride `offer`/`cards` as VALUES and a substring match on the JSON text
  // cannot tell a key from a value.
  expect(hasForbiddenKey(f, DECK_FORBIDDEN_KEYS)).toBe(false);
  // THE REDRAW FLAG (Story 10.7, R4) is self-private on the `pts` / `offer`
  // terms: the observer's OWN latch on `you`, and as a KEY nowhere else.
  if (f.you !== undefined) expect(f.you.rd).toBe(me.mulliganed);
  expect(hasForbiddenKey(withoutYou, ['rd'])).toBe(false);
  // THE EXHAUSTED HULL'S BONUS POINTS (Story 10.7, R5) are self-private on the
  // `cards` terms: the observer's OWN non-zero counts on `you`, and as a KEY
  // nowhere else; the record's field name rides nothing at all.
  if (f.you !== undefined) {
    for (const id of INDEX_IDS) expect(f.you.ib[id] ?? 0).toBe(me.indexBonus[id]);
    for (const n of Object.values(f.you.ib)) expect(n).toBeGreaterThan(0);
  }
  expect(hasForbiddenKey(withoutYou, ['ib'])).toBe(false);
  expect(hasForbiddenKey(f, ['indexBonus'])).toBe(false);
  // THE LAUNCH POINT, THE LANDING AND THE SEED (Story 9.12's attenuation
  // reference retired 2026-11-12; Story 11.1 real dispersion): no frame ever
  // carries a shell's origin, its target / dispersed landing or its
  // dispersion seed as a field — the muzzle would become solvable and the
  // fall of shot predictable; the ballistic reveal is built field by field.
  // (The amendment-202 cursor point these lines used to guard is deleted.)
  expect(hasForbiddenKey(f, ['originX', 'originY', 'attenRangeU', 'cursor', 'targetX', 'targetY', 'origin', 'landing', 'seed', 'dispersionSeed', 'dispersionKey', 'batteryShell'])).toBe(false);
  // THE ARCING-FLIGHT TAGS and the high-ground stop (epic-11 amendment 8) are
  // server-internal: `terrainStop` would tell an observer a shell's track ends
  // short on a hillside before it gets there; the landing boom's owner tag
  // `land` names the shooter.
  expect(hasForbiddenKey(f, ['overShips', 'overLand', 'terrainStop', 'land', 'run'])).toBe(false);
  verifyParallelSalvoTracks(w, f);
  verifyNoLandingPoint(w, f);
  // ...and the hand is never bigger than the dial that sizes it (a pool with
  // fewer dealable lines than the offer size draws SHORT, never long).
  if (f.you) expect(f.you.offer.length).toBeLessThanOrEqual(CONFIG.offer.size);
  // Story 9.3 session 2 (Eric 2026-10-12): A CLOUD HIDES NOTHING. Every other
  // afloat hull inside this observer's sight with island LOS clear whose line
  // runs through a live cloud's disc must be PRESENT as a contact — the
  // owner of the cloud, the observer inside it, the hull inside it, all
  // alike (CLOUD_SIGHT_THROUGH counts the pairs so the arm is exercised).
  for (const other of w.ships.values()) {
    if (!isAfloat(me.lifecycle) || other.id === me.id || !isAfloat(other.lifecycle)) continue;
    // Story 9.10: "in sight" is the FOG-TOLLED sight (strict — the pair must
    // be inside the dead band's inner edge to be demanded present).
    const inSight = sighted(w, me, other.state, 'strict');
    if (!inSight) continue;
    const throughCloud = [...w.clouds.values()].some(
      (c) => w.now < c.until && segPointDistOracle(me.state, other.state, c) <= cloudOutlineOracle(c, w.now),
    );
    if (!throughCloud) continue;
    CLOUD_SIGHT_THROUGH.n += 1;
    expect(f.contacts.some((c) => c.id === other.id), `cloud hid ${other.id} from ${me.id}`).toBe(true);
  }
  // FOG BANKS HIDE BY TOLL (Story 9.10, amendments 164–165): every other
  // afloat hull inside this observer's GEOMETRIC sight with island LOS clear
  // and no owned zone, whose ray crosses a live bank, is a contact IFF the
  // tolled distance stays inside sight — PRESENT when strictly inside
  // (FOG_THIN_SEEN), ABSENT when the toll pushed it past the loose bound
  // (FOG_HID_CONTACT); the dead band between is production's call.
  for (const other of w.ships.values()) {
    if (!isAfloat(me.lifecycle) || other.id === me.id || !isAfloat(other.lifecycle)) continue;
    if (zoneCovers(w, me, other.state)) continue;
    if (dist(me.state, other.state) > effSight(w, me) || !clearLos(me.state, other.state, w.map.islands)) continue;
    if (fogTollOracle(w, me.state, other.state).touched === 0) continue;
    const present = f.contacts.some((c) => c.id === other.id);
    if (sighted(w, me, other.state, 'strict')) {
      FOG_THIN_SEEN.n += 1;
      expect(present, `thin fog hid ${other.id} from ${me.id}`).toBe(true);
    } else if (!sighted(w, me, other.state)) {
      FOG_HID_CONTACT.n += 1;
      expect(present, `fog should hide ${other.id} from ${me.id}`).toBe(false);
    }
  }
  // ...and the MINE and TORPEDO reaches pay the same toll: an enemy mine or
  // fish inside its own geometric eye reach with LOS, no owned zone, that the
  // toll pushed out is on no channel (FOG_HID_MINE_OR_TORP).
  if (isAfloat(me.lifecycle)) {
    for (const mine of w.mines.values()) {
      if (mine.ownerId === me.id || zoneCovers(w, me, mine)) continue;
      if (dist(me.state, mine) > eyeReachOracle(w, me, CONFIG.vision.mineSight) || !clearLos(me.state, mine, w.map.islands)) continue;
      if (mineSeen(w, me, mine)) continue;
      FOG_HID_MINE_OR_TORP.n += 1;
      expect(f.mines.some((m) => m.id === mine.id), `fog should hide mine ${mine.id} from ${me.id}`).toBe(false);
    }
    for (const sh of w.shells.values()) {
      if (sh.kind !== 'torp' || sh.ownerId === me.id || zoneCovers(w, me, sh)) continue;
      if (dist(me.state, sh) > eyeReachOracle(w, me, CONFIG.vision.torpedoSight) || !clearLos(me.state, sh, w.map.islands)) continue;
      if (projectileSeen(w, me, sh, sh)) continue;
      FOG_HID_MINE_OR_TORP.n += 1;
      expect(f.events.some((e) => (e.k === 'torp' || e.k === 'torpU') && e.id === sh.id), `fog should hide fish ${sh.id} from ${me.id}`).toBe(false);
    }
    // ...and the 750 u halo pays it too (amendment 167): a flash or a puff
    // inside the GEOMETRIC halo with LOS that the toll pushed out is withheld
    // (FOG_HID_SM counts the puffs; both kinds are asserted).
    const halo = CONFIG.vision.muzzleFlash; // its own fact since Story 11.2 — never whiteout-scaled
    for (const ev of w.tickEvents) {
      if (ev.k !== 'sm' && ev.k !== 'mz') continue;
      const p = ev as { k: 'sm' | 'mz'; x: number; y: number };
      const d = dist(me.state, p);
      if (d > halo || !clearLos(me.state, p, w.map.islands)) continue;
      const { tollMin, slack } = fogTollOracle(w, me.state, p);
      if (d + tollMin <= halo + slack) continue; // the loose side: the least production may have charged
      if (p.k === 'sm') FOG_HID_SM.n += 1;
      expect(f.events.some((e) => e.k === p.k && (e as { x: number; y: number }).x === p.x && (e as { x: number; y: number }).y === p.y), `fog should hide ${p.k} at (${p.x},${p.y}) from ${me.id}`).toBe(false);
    }
  }
  // THE WAKE-DRAFT LIFT IS SELF-PRIVATE (Story 8.19): `draft` may exist
  // NOWHERE but `you` — never on a contact, never in a frame without `you` —
  // and on `you` it is the record's exact double IFF positive, ABSENT (never
  // 0, never `undefined`) otherwise. INDEPENDENTLY of the record: a positive
  // `draft` is only ever carried by a hull that is ON THE WATER (afloat or
  // sinking) — a foundered/sunk hull rides no wake — and never above the
  // dial. It is a declared own-ship disclosure (NFR21, amendment 160), not a
  // perception exception.
  expect(JSON.stringify(withoutYou)).not.toContain('"draft"');
  if (f.you !== undefined) {
    expect('draft' in f.you).toBe(me.draft > 0);
    if (me.draft > 0) {
      DRAFT_SEEN.n += 1;
      expect(Object.is(f.you.draft, me.draft)).toBe(true);
    }
    if (f.you.draft !== undefined) {
      expect(isAfloat(me.lifecycle) || isSinking(me.lifecycle), `${me.id} carries draft off the water`).toBe(true);
      expect(f.you.draft).toBeGreaterThan(0);
      expect(f.you.draft).toBeLessThanOrEqual(CONFIG.wake.draft.lift);
    }
  }
  for (const c of f.contacts) {
    const target = w.ships.get(c.id)!;
    expect(target).toBeDefined();
    expect(isAfloat(target.lifecycle)).toBe(true);
    expect(c.id).not.toBe(viewerId);
    expect('boons' in c).toBe(false); // enemy builds are hidden (anti-cheat)
    expect('stats' in c).toBe(false);
    expect('lvl' in c).toBe(false); // ...and so is the economy (Story 2.6)
    expect('xp' in c).toBe(false);
    expect('draft' in c).toBe(false); // ...and whether they ride a wake (Story 8.19)
    // Sight tier (dist + LOS) OR the ship's CENTER inside a zone the viewer
    // OWNS (Story 1.7 firer-only truesight parity) — nothing else.
    expect(sighted(w, me, target.state) || zoneCovers(w, me, target.state)).toBe(true);
    expect({ x: c.x, y: c.y }).toEqual({ x: target.state.x, y: target.state.y });
    verifyAggro(c);
  }
  verifyPlain(w, me, f);
  for (const e of f.events) verifyEvent(w, me, e);
  for (const m of f.mines) verifyMine(w, me, m);
  for (const z of f.litZones ?? []) verifyLitZone(w, me, z);
  for (const z of f.burnZones ?? []) verifyBurnZone(w, me, z);
  // The OWNER always sees its own live zones of both kinds (the litzone /
  // burnzone gates' owner clause — Story 1.7 / Story 8.17).
  for (const z of w.litZones.values()) {
    if (z.ownerId === me.id && w.now < z.until) expect((f.litZones ?? []).some((v) => v.id === z.id), `own lit zone ${z.id} delivered`).toBe(true);
  }
  for (const z of w.burnZones.values()) {
    if (z.ownerId === me.id && w.now < z.until) expect((f.burnZones ?? []).some((v) => v.id === z.id), `own burn zone ${z.id} delivered`).toBe(true);
  }
  // THE FOUL ZONE (Story 9.4): every live zone is delivered EXACTLY when its
  // gate passes (the burn zone's — owner always, else the centre within
  // radar range), and nothing about who it slows rides the frame outside
  // `you` (`fouledUntil` is victim-private on the slowedUntil terms).
  for (const z of f.foulZones ?? []) verifyFoulZone(w, me, z);
  for (const z of w.foulZones.values()) {
    if (w.now >= z.until) continue;
    const delivered = (f.foulZones ?? []).some((v) => v.id === z.id);
    expect(delivered, `foul zone ${z.id} for ${me.id}`).toBe(foulZoneGateOracle(w, me, z));
  }
  expect(JSON.stringify(withoutYou)).not.toContain('fouledUntil');
  if (f.you !== undefined) {
    expect('fouledUntil' in f.you).toBe(me.fouledUntil > w.now);
    if (f.you.fouledUntil !== undefined) expect(f.you.fouledUntil).toBe(me.fouledUntil);
  }
  verifyOwnWindows(w, me, f, withoutYou);
  // (The DECOY BUOYS' `decoys` channel left with Story 10.5.)
  expect('decoys' in f).toBe(false);
  // THE COUNTERMEASURE CLOUD (Story 9.3): every live cloud is delivered
  // EXACTLY when its gate passes (owner always; else the disc sighted or
  // radar-detected), and the store-private fields (`ownerId`, `bornAt`,
  // `until`) exist NOWHERE in the frame text — a cloud on the wire is
  // `{id,x,y,t0}` and nothing else.
  for (const v of f.clouds ?? []) verifyCloudShape(w, v);
  for (const cloud of w.clouds.values()) {
    if (w.now >= cloud.until) continue;
    const delivered = (f.clouds ?? []).some((v) => v.id === cloud.id);
    // Story 9.10: the sight arm is fog-tolled, so the gate has a dead band —
    // a delivered cloud must pass the LOOSE gate, a withheld one must fail
    // the STRICT one (the same band every tolled oracle grants).
    if (delivered) expect(cloudGateOracle(w, me, cloud, 'loose'), `cloud ${cloud.id} delivered to ${me.id} only if its gate passes`).toBe(true);
    else expect(cloudGateOracle(w, me, cloud, 'strict'), `cloud ${cloud.id} withheld from ${me.id} only if its gate fails`).toBe(false);
  }
  // FOG IS NOT A CHANNEL (Story 9.10): no frame — fogged or spectator — ever
  // carries a `fog` key; the field is public weather (welcome seed + schema
  // cut) and its hiding is the toll inside the sight oracles above.
  expect('fog' in f).toBe(false);
  expect(JSON.stringify(f)).not.toContain('ownerId');
  expect(JSON.stringify(f)).not.toContain('bornAt');
  for (const d of f.denied ?? []) verifyDenied(me, d);
  // THE AIRDROPS (Story 10.9, R3): the sighted channel is delivered EXACTLY
  // when the drop gate passes, `{id,x,y,c}` and nothing else; the crate's
  // position rides no other frame field (its radar paint is a fuzzed rect
  // the completeness oracle below attributes).
  verifyDrops(w, me, f);
  verifyBlipOrdering(w, f);
  verifyBlipCompleteness(w, me, f);
  verifyWakeCompleteness(w, me, f);
}

// ---------- THE PLAIN-HULL ORACLE (Story 11.2, R3) — the outer tier's line ----

/** Non-vacuity ledgers for the outer tier: `pc` rows verified, and hulls the
 *  STRICT band demanded present that the frame did carry. */
const PLAIN_SEEN = { n: 0 };
const PLAIN_DEMANDED = { n: 0 };

/** The hull a `pc` row is a view of: the one on-water hull, never the
 *  observer, at EXACTLY the row's pose (the row carries no id — that is the
 *  point — so the oracle recovers the subject from the world by pose). */
function plainSubject(w: World, me: ShipRecord, row: PlainContact): ShipRecord | undefined {
  for (const ship of w.ships.values()) {
    if (ship.id === me.id || (!isAfloat(ship.lifecycle) && !isSinking(ship.lifecycle))) continue;
    const st = ship.state;
    if (st.x === row.x && st.y === row.y && st.heading === row.heading && st.speed === row.speed) return ship;
  }
  return undefined;
}

/** Is `target` in this observer's PLAIN BAND at the given side of the fog
 *  dead band? In the band = inside the plain-hull reach with island LOS
 *  clear, and NOT a full contact (beyond the class reach, in no owned lit
 *  zone). 'loose' is what a DELIVERED row must satisfy (the hull reach
 *  loose, the class reach not strictly inside); 'strict' is what DEMANDS a
 *  row (the hull reach strict, the class reach not even loosely inside). */
function inPlainBand(w: World, me: ShipRecord, target: ShipRecord, bound: Bound): boolean {
  if (zoneCovers(w, me, target.state)) return false;
  if (bound === 'loose') return hullSighted(w, me, target.state, 'loose') && !sighted(w, me, target.state, 'strict');
  return hullSighted(w, me, target.state, 'strict') && !sighted(w, me, target.state, 'loose');
}

/**
 * THE OUTER TIER'S INVARIANT LINE (Story 11.2, R3) — not a seventh exception.
 * Both directions:
 *   - SHAPE: `pc` is omitted, never []; never on a spectator frame; each row
 *     is EXACTLY {h,x,y,heading,speed} in that order — so no class, no roster
 *     id, no turret or launcher angles can ride it;
 *   - THE HANDLE names nobody: a non-empty string that is no roster id, no
 *     two rows of a frame share one, and the rows are ordered by it (a
 *     payload-only order — never the roster's);
 *   - THE BAND: every row is a live view of one on-water hull that lies in
 *     the observer's plain band (loose) — beyond the class reach, inside the
 *     hull reach, island LOS clear;
 *   - ONE TIER PER HULL: no hull is both a contact and a `pc` row;
 *   - COMPLETENESS: every other on-water hull the STRICT band holds is there.
 */
function verifyPlain(w: World, me: ShipRecord, f: FrameMsg): void {
  const rows = f.pc ?? [];
  if ('pc' in f) expect(rows.length, 'pc is omitted, never []').toBeGreaterThan(0);
  if (f.spec === true) expect('pc' in f, 'a spectator frame carries no pc').toBe(false);
  const contactIds = new Set(f.contacts.map((c) => c.id));
  const subjects = new Set<string>();
  const handles = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    expect(Object.keys(row)).toEqual(['h', 'x', 'y', 'heading', 'speed']);
    expect(typeof row.h).toBe('string');
    expect(row.h.length).toBeGreaterThan(0);
    expect(w.ships.has(row.h), `handle ${row.h} is a roster id`).toBe(false);
    expect(handles.has(row.h), `handle ${row.h} twice in one frame`).toBe(false);
    handles.add(row.h);
    if (i > 0) expect(rows[i - 1].h < row.h, 'pc rows are ordered by handle').toBe(true);
    const target = plainSubject(w, me, row)!;
    expect(target, `pc row ${row.h} is a live view of a hull`).toBeDefined();
    expect(subjects.has(target.id), `${target.id} rides pc twice`).toBe(false);
    subjects.add(target.id);
    expect(contactIds.has(target.id), `${target.id} is a contact AND a plain contact`).toBe(false);
    expect(inPlainBand(w, me, target, 'loose'), `${target.id} rides ${me.id}'s pc outside the plain band`).toBe(true);
    PLAIN_SEEN.n += 1;
  }
  if (f.spec === true || !isAfloat(me.lifecycle)) return;
  for (const other of w.ships.values()) {
    if (other.id === me.id || !isAfloat(other.lifecycle)) continue;
    if (!inPlainBand(w, me, other, 'strict')) continue;
    PLAIN_DEMANDED.n += 1;
    expect(subjects.has(other.id), `${other.id} is in ${me.id}'s plain band but rides no pc row`).toBe(true);
  }
}

/**
 * THE HANDLE LEDGER (Story 11.2, R3) — the anonymity half of the outer tier,
 * across frames and across observers, INDEPENDENTLY of production's memory
 * (`ShipRecord.plainHandles` is never read):
 *   - WITHIN A VISIT (the hull was a `pc` row for this observer on the
 *     previous tick too) the handle is the SAME — the client can follow it;
 *   - A NEW VISIT (it was not) carries a handle NEVER SEEN BEFORE, by anyone:
 *     not this observer's handle for that hull on an earlier visit (per
 *     VISIT), not another observer's handle for it (per OBSERVER — two
 *     colluding clients share no token), not any handle of any other hull.
 * `revisits` counts second-and-later visits (the non-vacuity gate).
 */
class PlainLedger {
  private readonly live = new Map<string, { h: string; tick: number }>();
  private readonly ever = new Set<string>();
  private readonly visited = new Set<string>();
  revisits = 0;

  verify(w: World, viewerId: string, f: FrameMsg, tick: number): void {
    const me = w.ships.get(viewerId)!;
    for (const row of f.pc ?? []) {
      const target = plainSubject(w, me, row);
      if (target === undefined) continue; // verifyPlain already failed the frame
      const key = `${viewerId}>${target.id}`;
      const held = this.live.get(key);
      if (held !== undefined && held.tick === tick - 1) {
        expect(row.h, `${key}: the handle changed inside one visit`).toBe(held.h);
      } else {
        expect(this.ever.has(row.h), `${key}: a new visit reused the handle ${row.h}`).toBe(false);
        if (this.visited.has(key)) this.revisits += 1;
        this.visited.add(key);
        this.ever.add(row.h);
      }
      this.live.set(key, { h: row.h, tick });
    }
  }
}

// ---------- THE AIRDROP ORACLE (Story 10.9, epic-10 amendment 18, R3) ---------

/** Non-vacuity ledgers for the drop arms: a crate delivered by SIGHT to a
 *  fogged observer, one WITHHELD from a fogged observer (the gate's false
 *  arm ran), one painted on RADAR (an anonymous disc rect attributed), and
 *  one delivered by an OWNED LIT ZONE alone (outside detect). */
const DROP_SIGHTED = { n: 0 };
const DROP_WITHHELD = { n: 0 };
const DROP_PAINTED = { n: 0 };
const DROP_BY_ZONE = { n: 0 };

/** The drop SIGHT gate, independently re-derived — the mine oracle MINUS the
 *  owner clause (a crate has no owner): spectator always; else the centre
 *  within the CRATE-KIND eye reach (Story 11.2 — island LOS, fog-tolled) OR inside a lit zone
 *  the observer OWNS. Never radar: a crate's radar presence is an anonymous
 *  blip, never a `drops[]` row. `bound` grants the tolled oracle's dead band
 *  (delivered → loose passes; withheld → strict fails). */
function dropGateOracle(w: World, me: ShipRecord, spectator: boolean, d: { x: number; y: number }, bound: Bound): boolean {
  if (spectator) return true;
  return crateSeen(w, me, d, bound) || zoneCovers(w, me, d);
}

/**
 * THE DROP CHANNEL, both directions: every delivered row names a live world
 * drop the gate admits, carries EXACTLY {id,x,y,c} in that order with the
 * world's own kind (deep-equal — the kind glyph is a field on a sight-gated
 * row, never a delivery of its own), and no drop is delivered twice; and the
 * converse — every world drop the STRICT gate admits appears. A frame with no
 * `drops` key is a frame of zero sighted drops (the litZones omission rule).
 */
function verifyDrops(w: World, me: ShipRecord, f: FrameMsg): void {
  const spectator = f.spec === true;
  const rows = f.drops ?? [];
  if ('drops' in f) expect(rows.length, 'drops is omitted, never []').toBeGreaterThan(0);
  const seen = new Set<string>();
  for (const v of rows) {
    const drop = w.drops.get(v.id)!;
    expect(drop, `drop ${v.id} is a live world drop`).toBeDefined();
    expect(seen.has(v.id), `drop ${v.id} delivered once`).toBe(false);
    seen.add(v.id);
    expect(Object.keys(v)).toEqual(['id', 'x', 'y', 'c']);
    expect({ x: v.x, y: v.y }).toEqual({ x: drop.x, y: drop.y });
    expect(v.c).toBe(drop.kind);
    expect(dropGateOracle(w, me, spectator, drop, 'loose'), `drop ${v.id} delivered to ${me.id} only if its gate passes`).toBe(true);
    if (spectator) continue;
    DROP_SIGHTED.n += 1;
    if (!crateSeen(w, me, drop, 'loose') && zoneCovers(w, me, drop)) DROP_BY_ZONE.n += 1;
  }
  for (const drop of w.drops.values()) {
    if (seen.has(drop.id)) continue;
    expect(dropGateOracle(w, me, spectator, drop, 'strict'), `drop ${drop.id} withheld from ${me.id} only if its gate fails`).toBe(false);
    if (!spectator) DROP_WITHHELD.n += 1;
  }
  // No roll exists before pickup (Eric 2026-11-08): the word never rides a frame.
  expect(JSON.stringify(f)).not.toContain('rolls');
}

/**
 * THE SELF-PRIVATE OWN WINDOWS — `dazzledUntil` (the FLASH SHELLS mark, Story
 * 10.9) and, since Story 10.5 (epic-10 amendment 11), the two COOLDOWN
 * ABILITIES' `repairReadyAt` / `smokeReadyAt`. NONE is a perception exception
 * (the count stays SIX): each is the viewer's own seat (the `fouledUntil`
 * idiom) and may exist NOWHERE but `you` — so another captain's cooldown
 * stamps never reach any other observer's frame, fogged or spectator (a
 * spectator frame has no `you` at all, so the whole text must lack them); on
 * `you` each is present IFF the observer's own record holds it in the future,
 * carrying the record's exact value. (The SHIELD BUOY pool and the SPEED BUOY
 * clock left with the buoys.)
 */
const OWN_WINDOWS = ['dazzledUntil', 'repairReadyAt', 'smokeReadyAt'] as const;
/** Non-vacuity: a cooling ability actually rode an own frame in the fuzz. */
const COOLDOWN_SEEN = { n: 0 };

function verifyOwnWindows(w: World, me: ShipRecord, f: FrameMsg, withoutYou: object): void {
  const text = JSON.stringify(withoutYou);
  for (const k of OWN_WINDOWS) expect(text).not.toContain(k);
  for (const k of ['buoyShield', 'speedBuoyAt']) expect(JSON.stringify(f)).not.toContain(k);
  if (f.you === undefined) return;
  for (const k of OWN_WINDOWS) {
    const live = me[k] > w.now;
    expect(k in f.you, `${k} on ${me.id}'s own frame`).toBe(live);
    if (live) expect(f.you[k]).toBe(me[k]);
  }
  if (f.you.repairReadyAt !== undefined || f.you.smokeReadyAt !== undefined) COOLDOWN_SEEN.n += 1;
}

/**
 * THE RETIRED AGGRO MARK (Story 5.6, epic-5 amendment 40 → Story 10.8): the
 * self-private `Contact.aggro` key named a PvE fleet hull hunting THIS
 * observer. The fleet is gone; the key must never appear on any contact —
 * a stray `aggro` would be a dead key on the wire (the shared type still
 * declares it as optional until the shared cut).
 */
function verifyAggro(c: Contact): void {
  expect('aggro' in c).toBe(false);
}

/** One EXPECTED return: the mask an independent oracle recomputes for a gated
 *  source, plus a label naming that source in the failure message. Every
 *  return is UNTAGGED since Story 8.16 (the radar buoy's PV 44 `src` sensor
 *  attribution was deleted with the buoy). */
interface ExpectedBlip {
  mask: MaskOracle;
  label: string;
}

/** Gated SHIP paints through the observer's OWN radar. */
function expectedShipBlips(w: World, me: ShipRecord): ExpectedBlip[] {
  const out: ExpectedBlip[] = [];
  for (const target of w.ships.values()) {
    if (!isAfloat(target.lifecycle) || target.id === me.id) continue;
    if (!blipPredicate(w, me, target.state)) continue;
    if (fogTollOracle(w, me.state, target.state).touched > 0) RADAR_THROUGH_FOG.n += 1; // Story 9.10: painted through fog
    const s = target.state;
    out.push({ mask: maskOracle(w, me.state, target.hullId, s.x, s.y, s.heading, w.now), label: `gated ship ${target.id}` });
  }
  return out;
}

/** Gated AIRDROP paints through the observer's OWN radar (Story 10.9, R3):
 *  the crate's centre through the SAME predicate a hull runs (range, swept
 *  this tick, shadow-visible), expected as the fuzzed DISC footprint and
 *  nothing else. */
function expectedDropBlips(w: World, me: ShipRecord): ExpectedBlip[] {
  const out: ExpectedBlip[] = [];
  for (const drop of w.drops.values()) {
    if (!blipPredicate(w, me, drop)) continue;
    DROP_PAINTED.n += 1;
    out.push({ mask: discMaskOracle(w, me.state, drop.x, drop.y, w.now), label: `gated drop ${drop.id}` });
  }
  return out;
}

/**
 * THE RETURN-MODE COMPLETENESS ORACLE (cycle-63 review gate; hardened at the
 * Story 7-5 wave-2 review gate). With no id on the wire, `blipMatchesShip`
 * justifies a blip if SOME gated ship matches — an upper bound only, under
 * which duplicate blips of one hull, or N copies of one mask replacing other
 * hulls' paints, would pass the fuzz. This pins the lower bound and the
 * multiplicity in one stroke: every gated subject's expected mask is present in
 * the frame, and the frame carries EXACTLY one blip per gated subject.
 *
 * THE MATCHING IS CONSUMPTION-BASED, and that is the whole hardening. The
 * earlier shape — `blips.some(...)` per expected source plus a total count —
 * had a substitution hole: when two expected sources happen to share a mask (two
 * hulls on the same pose), ONE emitted blip satisfied BOTH existence checks, leaving room in the
 * count for an entirely unjustified blip to ride along. Pairing each expected
 * source with exactly ONE emitted blip and requiring nothing left over closes it
 * in both directions: an omitted paint fails (nothing to pair with) and a leaked
 * paint fails (nothing pairs with it).
 */
function verifyBlipCompleteness(w: World, me: ShipRecord, f: FrameMsg): void {
  if (!isAfloat(me.lifecycle)) return;
  const unmatched = f.events.filter((e): e is ReturnBlipEvent => e.k === 'blip');
  // (The decoy paints and the RADAR BUOY paints left with the buoys — Story 10.5.)
  // The AIRDROPS (Story 10.9) are the one non-ship subject: each gated crate
  // is consumed by exactly one blip carrying its fuzzed DISC rect, so a hull
  // paint can never stand in for a crate paint or the reverse.
  const expected = [...expectedShipBlips(w, me), ...expectedDropBlips(w, me)];
  for (const exp of expected) {
    const i = unmatched.findIndex((b) => maskEquals(exp.mask, b));
    expect(i, `${exp.label} accounted for by its own blip`).toBeGreaterThanOrEqual(0);
    unmatched.splice(i, 1); // CONSUMED — it can never justify a second source
  }
  expect(unmatched, 'every blip traces to a gated subject (nothing unaccounted)').toEqual([]);
}

/** The Story 1.10 denial oracle: a denial in a frame must be the OBSERVER'S
 *  OWN press this tick — its identity matches the observer's stored input on
 *  exactly one channel grammar (weapon click ↔ (slot, fireSeq), no `act`;
 *  ability press ↔ (act, actSeq) since Story 10.5) with a legal wire reason.
 *  Anything else — another ship's denial, a fabricated slot/seq, a
 *  server-internal reason ('dead'/'empty-slot') — fails the invariant:
 *  denials are owner-only by construction. */
function verifyDenied(me: ShipRecord, d: { slot: number; reason: string; seq: number; act?: number }): void {
  expect(['out-of-arc', 'no-ammo', 'cooling', 'blocked']).toContain(d.reason);
  const weaponPress = d.act === undefined && d.slot === me.input.slot && d.seq === me.input.fireSeq;
  const abilityPress = d.act !== undefined && d.act === me.input.act && d.seq === me.input.actSeq;
  expect(weaponPress || abilityPress).toBe(true);
}

/** FR10 anti-tell (Story 1.8): the frame's blip SUBSEQUENCE must be ordered by
 *  PUBLIC payload only — never by source (the historical guard against a
 *  decoy paint's array position de-anonymizing it; kept because a
 *  payload-only order can never leak). Reimplemented test-locally,
 *  applied to EVERY verified frame: the cycle-63 footprint orders by (gx, gy,
 *  t, w, h, then the mask words — length first, then each signed-int32 word).
 *  The mask words ARE part of the production comparator's key (cycle-63
 *  review gate: the oracle used to stop at the rect, a strictly weaker order
 *  than the one it claimed to pin), and the full key is total up to
 *  byte-identical payloads — which carry no order information to leak. */
function verifyBlipOrdering(w: World, f: FrameMsg): void {
  const blips = f.events.filter((e): e is BlipEvent => e.k === 'blip');
  for (let i = 1; i < blips.length; i++) {
    const a = blips[i - 1];
    const b = blips[i];
    const key = (e: ReturnBlipEvent): number[] => [e.gx, e.gy, e.t, e.w, e.h, e.bits.length, ...e.bits];
    const ka = key(a);
    const kb = key(b);
    // (The PV 44 `src` closing term went with the radar buoy in Story 8.16.)
    const cmp = ka.map((v, j) => v - kb[j]).find((d) => d !== 0) ?? 0;
    expect(cmp).toBeLessThanOrEqual(0);
  }
}

/** A mine may reach a frame only if the viewer owns it, it is inside the MINE
 *  eye reach (Story 11.2: `CONFIG.vision.mineSight`, far tighter than
 *  sight), OR it sits inside a lit zone the viewer OWNS (Story 1.7). */
function verifyMine(w: World, me: ShipRecord, m: MineView): void {
  const mine = w.mines.get(m.id)!;
  expect(mine).toBeDefined();
  const own = mine.ownerId === me.id;
  expect(m.own).toBe(own);
  expect(m.by).toBe(mine.ownerId); // Story 1.12: every visible mine carries its dropper id (personal hue)
  if (!own) expect(mineSeen(w, me, mine) || zoneCovers(w, me, mine)).toBe(true); // never radar, never merely sighted
  // THE KIND RIDES EVERY ROW (Eric 2026-10-01, cycle 162, PV 68 — "Everyone
  // sees the kind", superseding Story 8.13's own-only rule, amendment 76):
  // every delivered mine view names the laid mine's true kind, LAST, after
  // `by`, in the one key order — owner, enemy and spectator alike. It is a
  // field on a row the gate above already admitted, not a delivery of its
  // own, so the exception count stays SIX.
  expect(Object.keys(m)).toEqual(['id', 'x', 'y', 'own', 'by', 'c']);
  expect(m.c).toBe(mine.kind);
}

/** A delivered COUNTERMEASURE cloud's wire shape: exactly
 *  {id,x,y,t0,lifeMs,r0,r1} in that key order — no owner, no own-flag, no
 *  `until` — `t0` the store's birth stamp and the last three the cloud's own
 *  STAMPED life and disc (Story 10.6, I6: under this channel's gate, never a
 *  seventh exception); the cloud must be live. */
function verifyCloudShape(w: World, v: { id: string; x: number; y: number; t0: number; lifeMs: number; r0: number; r1: number }): void {
  const cloud = w.clouds.get(v.id)!;
  expect(cloud).toBeDefined();
  expect(w.now).toBeLessThan(cloud.until); // an expired cloud never materializes
  expect(Object.keys(v)).toEqual(['id', 'x', 'y', 't0', 'lifeMs', 'r0', 'r1']);
  expect(v).toEqual({ id: cloud.id, x: cloud.x, y: cloud.y, t0: cloud.bornAt, lifeMs: cloud.lifeMs, r0: cloud.r0, r1: cloud.r1 });
}

/** The point of the disc nearest the observer, re-derived as a WALK: from the
 *  observer toward the centre by (d − r); the observer itself when inside. */
function nearestDiscPointOracle(o: { x: number; y: number }, c: { x: number; y: number }, r: number): { x: number; y: number } {
  const d = dist(o, c);
  if (d <= r) return { x: o.x, y: o.y };
  const t = (d - r) / d;
  return { x: o.x + (c.x - o.x) * t, y: o.y + (c.y - o.y) * t };
}

/** Did this tick's beam window cross the disc's bearing span? Re-derived as
 *  ARC OVERLAP BY MIDPOINTS: the window's mid-bearing and the centre's
 *  bearing are within (window/2 + asin(min(1, r/d))) of each other. An
 *  observer inside the disc: any non-empty window. */
function beamCrossesDiscOracle(me: ShipRecord, c: { x: number; y: number }, r: number): boolean {
  const win = wrapPositive(me.sweepAngle - me.prevSweepAngle);
  if (win <= 0) return false;
  const d = dist(me.state, c);
  if (d <= r) return true;
  const half = Math.asin(Math.min(1, r / d));
  let delta = wrapPositive(me.prevSweepAngle + win / 2 - bearing(me.state, c));
  if (delta > Math.PI) delta = TAU - delta;
  return delta <= win / 2 + half;
}

/** THE CLOUD DELIVERY GATE (Story 9.3; amendment 51 — Eric 2026-10-12: "If I
 *  can see smoke particles in my sight range, I want them composited" and
 *  "If it's detected by my radar, I want my radar to paint it" — re-cut for
 *  the session-2 overlay onto the spray DISC): the OWNER always; else the
 *  disc SIGHTED — its nearest point within effSight (inclusive) with ISLAND
 *  LOS to that point (`clearLos`) — or RADAR-DETECTED — its nearest point
 *  within effRadar (inclusive), the beam crossing its bearing span this tick,
 *  and the centre shadow-visible (the test-local march). Never a lit-zone
 *  path. The two ledgers count deliveries ONE sensor alone explains. Since
 *  Story 9.10 the sight arm is fog-tolled (`bound` picks the dead band's
 *  side); the radar arm is fog-blind. */
function cloudGateOracle(
  w: World,
  me: ShipRecord,
  cloud: { id: string; ownerId: string; x: number; y: number; bornAt: number; lifeMs: number; r0: number; r1: number },
  bound: Bound = 'strict',
): boolean {
  if (cloud.ownerId === me.id) return true;
  const r = cloudOutlineOracle(cloud, w.now);
  const near = dist(me.state, cloud) - r;
  // Story 9.10: the sight arm pays the fog toll on the segment to the nearest
  // disc point, at the caller's side of the dead band (verifyFrame asks
  // 'loose' for a delivered cloud and 'strict' for a withheld one; the
  // ledgers count on the loose pass). The radar arm below is FOG-BLIND by
  // ruling (amendment 149).
  const bySight = near <= effSight(w, me) && sightedWithin(w, me, nearestDiscPointOracle(me.state, cloud, r), effSight(w, me), bound);
  const byRadar = near <= effRadar() && beamCrossesDiscOracle(me, cloud, r) && shadowVisible(w, me, cloud);
  if (bound === 'loose') { // the delivered-cloud pass (verifyFrame) — count what reached a frame
    if (bySight && !byRadar) CLOUD_DELIVERED_BY_SIGHT.n += 1;
    if (byRadar && !bySight) CLOUD_DELIVERED_BY_RADAR.n += 1;
  }
  return bySight || byRadar;
}

/** A lit-zone circle may reach a frame only if the viewer OWNS the zone or the
 *  zone CENTER is within the viewer's effective radar range — no LOS term, no
 *  sweep term (Story 1.7). Wire shape is exactly {id,x,y,r,until,by} with
 *  `by` naming the owner (the `phos`/`daz` doctrine tail is DELETED, Story
 *  8.17 amendment 134); the zone must be live (in the world map, unexpired). */
function verifyLitZone(
  w: World,
  me: ShipRecord,
  z: { id: string; x: number; y: number; r: number; until: number; by: string },
): void {
  const zone = w.litZones.get(z.id)!;
  expect(zone).toBeDefined();
  expect(w.now).toBeLessThan(zone.until); // expired zones never materialize
  expect(Object.keys(z).sort()).toEqual(['by', 'id', 'r', 'until', 'x', 'y']);
  expect(z).toEqual({ id: zone.id, x: zone.x, y: zone.y, r: zone.r, until: zone.until, by: zone.ownerId });
  if (zone.ownerId !== me.id) expect(dist(me.state, zone)).toBeLessThanOrEqual(effRadar());
}

/** The PHOSPHOR burning zone (Story 8.17, amendments 131 / 135(f)) — the LIT
 *  ZONE's gate, re-derived here BYTE-FOR-BYTE and independently: the owner
 *  always, else the zone CENTER within the viewer's radar range; no LOS, no
 *  sweep. Wire shape exactly {id,x,y,r,until,by} — `dps` (the firer's tier, a
 *  build read) may NEVER ride; the zone must be live in the SEPARATE
 *  `burnZones` store (a burning zone is never a lit zone, and vice versa). */
function verifyBurnZone(
  w: World,
  me: ShipRecord,
  z: { id: string; x: number; y: number; r: number; until: number; by: string },
): void {
  const zone = w.burnZones.get(z.id)!;
  expect(zone).toBeDefined();
  expect(w.litZones.has(z.id)).toBe(false); // never both stores
  expect(w.now).toBeLessThan(zone.until); // expired zones never materialize
  expect(Object.keys(z).sort()).toEqual(['by', 'id', 'r', 'until', 'x', 'y']);
  expect(z).toEqual({ id: zone.id, x: zone.x, y: zone.y, r: zone.r, until: zone.until, by: zone.ownerId });
  if (zone.ownerId !== me.id) expect(dist(me.state, zone)).toBeLessThanOrEqual(effRadar());
}

/** Non-vacuity ledger for the foul zone (the DECOY_PAINT_EXPECTED idiom):
 *  foul zones delivered to a NON-owner — the radar-range clause ran against a
 *  real frame, not only the owner clause. */
const FOUL_ZONE_DELIVERED = { n: 0 };

/** The foul zone's gate (Story 9.4, amendment 63), re-derived INDEPENDENTLY
 *  and byte-for-byte the burn zone's: the owner always, else the zone CENTER
 *  within the viewer's radar range; no LOS, no sweep. */
function foulZoneGateOracle(w: World, me: ShipRecord, zone: { ownerId: string; x: number; y: number }): boolean {
  return zone.ownerId === me.id || dist(me.state, zone) <= effRadar();
}

/** The FOULING SHELL foul zone (Story 9.4, amendment 63) — the BURN ZONE's
 *  gate, re-derived here BYTE-FOR-BYTE and independently (foulZoneGateOracle).
 *  Wire shape exactly {id,x,y,r,until,by}; the zone must be live in the
 *  SEPARATE `foulZones` store (never a lit zone, never a burn zone). */
function verifyFoulZone(
  w: World,
  me: ShipRecord,
  z: { id: string; x: number; y: number; r: number; until: number; by: string },
): void {
  const zone = w.foulZones.get(z.id)!;
  expect(zone).toBeDefined();
  expect(w.litZones.has(z.id)).toBe(false); // never another store
  expect(w.burnZones.has(z.id)).toBe(false);
  expect(w.now).toBeLessThan(zone.until); // expired zones never materialize
  expect(Object.keys(z)).toEqual(['id', 'x', 'y', 'r', 'until', 'by']);
  expect(z).toEqual({ id: zone.id, x: zone.x, y: zone.y, r: zone.r, until: zone.until, by: zone.ownerId });
  expect(foulZoneGateOracle(w, me, zone)).toBe(true);
  if (zone.ownerId !== me.id) FOUL_ZONE_DELIVERED.n += 1;
}

// ---------- per-kind event verifiers (the independent oracle) ----------------
//
// One test-local verifier per GameEvent kind — the deliberately reimplemented
// visibility oracle (NEVER a row's own visible()/materialize(), per the header).
// verifyEvent() dispatches through EVENT_VERIFIERS; a kind with no entry throws
// ("unexpected event kind leaked"). The completeness suite below pins this map's
// KEY SET to the registry's event-kind rows, so a future registry row without a
// verifier fails CI by construction (the story's marquee AC).

type EventVerifier = (w: World, me: ShipRecord, e: GameEvent) => void;

/** The ship-blip predicate at a POINT, reimplemented test-locally: range
 *  (d ≤ radar — NO inner edge, amendment 210), the height-aware radar shadow
 *  (Story 4.11 — the independently re-derived shadowVisible above, NEVER
 *  island LOS: a low island no longer deletes a blip, hard cover ≥ mast
 *  height does) and the this-tick paint window — no zone term
 *  (amendment 210 ruling (a): a hull in the viewer's own light paints too).
 *  (Observer and target are both at mast height — amendment 101.) */
/** THE POINT-BLIP PREDICATE, independently re-derived: d ≤ intel (no inner
 *  edge), the paint window, the shadow march. No cloud term (Story 9.3 session 2: a cloud hides nothing —
 *  8.18's in-bubble smoke paint and cycle 174's radar rule are retired). */
function blipPredicate(w: World, me: ShipRecord, p: { x: number; y: number }): boolean {
  // FOG-BLIND BY RULING (amendment 149) with NO INNER EDGE (amendment 210):
  // no bank term exists on this gate and it reaches down to the observer's
  // hull — a hull fog hides inside the bubble still paints, a hull beyond it
  // paints through any bank. The fuzz's RADAR_THROUGH_FOG ledger proves the
  // arm ran.
  const d = dist(me.state, p);
  return d <= effRadar() && shadowVisible(w, me, p) && inPaintWindow(me, bearing(me.state, p));
}

// --- the cycle-63 `return`-grammar COVERAGE oracle (amendments 155-157) ------
//
// Re-DERIVED against the new payload, not adapted from the retired `ext`
// oracle: the wire now carries a world-anchored coverage footprint
// ({k,t,gx,gy,w,h,bits}) rasterized server-side from the true hull polygon
// AND FUZZED per paint (dilation + stretch + glint + bridge repair, cycle-63
// review gate). The oracle below reimplements the whole pipeline from the
// documented contract — the raw silhouette verts rotated/translated by hand,
// a test-local even-odd crossing test (never the production pointInPolygon),
// the bbox cell rect, the centre-in-polygon rule, the quarter-cell spine
// walk, the centre-cell fail-safe, the fuzz stages in their contractual
// order, and the LSB-first packing — so a refactor of sim/radarRaster.ts
// cannot silently agree with its own bug. THE ONE SHARED PIECE is the entropy
// stream (`paintSeed` + `mulberry32`): the RNG sequence IS the wire contract
// (both sides must draw the identical stream), so the oracle consumes the
// shared primitives while reimplementing every piece of GEOMETRY they drive.
// Justification is EXACT mask equality (two-sided: every wire bit must be
// earned AND every earned bit must be on the wire), so this oracle cannot go
// vacuous by the channel quietly shrinking.

/** The shared radar grid resolution — the wire-contract lattice parameter. */
const RCELL_U = CONFIG.vision.radarCellU;

/** Test-local even-odd point-in-polygon (ray crossing), reimplemented. */
function inPolyOracle(px: number, py: number, poly: readonly { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

interface MaskOracle { gx: number; gy: number; w: number; h: number; bits: number[] }

/** Test-local SHARP rasterization onto a padded boolean grid: centre rule +
 *  quarter-cell spine + bounds-checked centre-cell fail-safe. Returns the
 *  padded grid (2 cells each side) and its cell-space origin. */
function sharpOracle(cls: HullId, x: number, y: number, heading: number): { grid: Uint8Array; w: number; h: number; gx0: number; gy0: number } {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const local = hullSilhouette(cls);
  const poly = local.map((p) => ({ x: x + c * p.x - s * p.y, y: y + s * p.x + c * p.y }));
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const gx = Math.floor(Math.min(...xs) / RCELL_U);
  const gy = Math.floor(Math.min(...ys) / RCELL_U);
  const bw = Math.floor(Math.max(...xs) / RCELL_U) - gx + 1;
  const bh = Math.floor(Math.max(...ys) / RCELL_U) - gy + 1;
  const w = bw + 4;
  const h = bh + 4;
  const grid = new Uint8Array(w * h);
  const mark = (cellX: number, cellY: number): void => {
    const col = cellX - gx;
    const row = cellY - gy;
    if (col >= 0 && row >= 0 && col < bw && row < bh) grid[(row + 2) * w + col + 2] = 1;
  };
  for (let row = 0; row < bh; row++) {
    for (let col = 0; col < bw; col++) {
      if (inPolyOracle((gx + col + 0.5) * RCELL_U, (gy + row + 0.5) * RCELL_U, poly)) mark(gx + col, gy + row);
    }
  }
  // The spine: the bow→stern centre-line at quarter-cell steps (the step
  // count is part of the contract).
  const lxs = local.map((p) => p.x);
  const min = Math.min(...lxs);
  const max = Math.max(...lxs);
  const steps = Math.max(1, Math.ceil(((max - min) / RCELL_U) * 4));
  for (let i = 0; i <= steps; i++) {
    const lx = min + ((max - min) * i) / steps;
    mark(Math.floor((x + c * lx) / RCELL_U), Math.floor((y + s * lx) / RCELL_U));
  }
  mark(Math.floor(x / RCELL_U), Math.floor(y / RCELL_U)); // the fail-safe
  return { grid, w, h, gx0: gx - 2, gy0: gy - 2 };
}

/** Test-local fuzz: dilate(8-neighbour) → four side-stretch draws (−x, +x,
 *  −y, +y) of the dilated snapshot → glint erosion of the fringe (row-major
 *  over the snapshot) → diagonal bridge repair to a fixed point. Mutates and
 *  returns the padded grid. */
function fuzzOracle(core: Uint8Array, w: number, h: number, seed: number): Uint8Array {
  const { stretchP, glintP } = CONFIG.vision.radarFuzz;
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (core[i] === 0) continue;
    const row = Math.floor(i / w);
    const col = i % w;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) out[(row + dy) * w + col + dx] = 1;
    }
  }
  const rng = mulberry32(seed);
  const flags = [rng.next() < stretchP, rng.next() < stretchP, rng.next() < stretchP, rng.next() < stretchP];
  const dirs = [-1, 1, -w, w];
  const dilated = out.slice();
  for (let i = w; i < w * h - w; i++) {
    if (dilated[i] === 0) continue;
    for (let d = 0; d < 4; d++) {
      if (flags[d]) out[i + dirs[d]] = 1;
    }
  }
  const snap = out.slice();
  for (let i = 0; i < w * h; i++) {
    if (snap[i] === 0 || core[i] === 1) continue;
    if (rng.next() < glintP) out[i] = 0;
  }
  bridgeOracle(out, w, h);
  return out;
}

/** Diagonal bridge repair, reimplemented: repeat row-major scans until no 2×2
 *  block holds exactly one covered diagonal pair (`\` bridges top-right, `/`
 *  bridges top-left — the contract's fixed choice). */
function bridgeOracle(out: Uint8Array, w: number, h: number): void {
  for (let pass = 0, again = true; again && pass < w * h; pass++) {
    again = false;
    for (let row = 0; row < h - 1; row++) {
      for (let col = 0; col < w - 1; col++) {
        const i = row * w + col;
        const back = out[i] + out[i + w + 1];
        const fore = out[i + 1] + out[i + w];
        if (back === 2 && fore === 0) {
          out[i + 1] = 1;
          again = true;
        } else if (fore === 2 && back === 0) {
          out[i] = 1;
          again = true;
        }
      }
    }
  }
}

/** A padded sharp grid (2 cells each side — `sharpOracle`'s shape). */
interface PaddedOracle { grid: Uint8Array; w: number; h: number; gx0: number; gy0: number }

/** The shipped beam (rad) and pulse (u) — the arc's two dials (Story 11.3). */
const ARC_BEAM = (CONFIG.vision.beamDeg * Math.PI) / 180;
const ARC_PULSE = hmToU(CONFIG.vision.pulseHm);

/** Pack the inner (unpadded) rect of a padded grid into a mask on the SAME
 *  rect — no crop: the arc's frame reads the sharp rect, so the oracle must
 *  hand it the rect the production rasterizer builds. */
function innerMaskOracle(s: PaddedOracle): HullCoverage {
  const w = s.w - 4;
  const h = s.h - 4;
  const bits = new Array<number>(Math.ceil((w * h) / 32)).fill(0);
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      if (s.grid[(row + 2) * s.w + col + 2] === 1) bits[(row * w + col) >>> 5] |= 1 << ((row * w + col) & 31);
    }
  }
  return { gx: s.gx0 + 2, gy: s.gy0 + 2, w, h, bits };
}

/** THE ARC, in the oracle (Story 11.3, R1–R4): the sharp core → the SHARED
 *  `smearArc` at the shipped beam and pulse about the observer (the arc law
 *  has its own contract tests, shared/src/__tests__/radarArc.test.ts; the
 *  oracle replays the COMPOSITION independently) → re-padded 2 cells each
 *  side for the fuzz. */
function arcOracle(s: PaddedOracle, o: { x: number; y: number }): PaddedOracle {
  const arc = smearArc(innerMaskOracle(s), o.x, o.y, RCELL_U, ARC_BEAM, ARC_PULSE);
  const w = arc.w + 4;
  const h = arc.h + 4;
  const grid = new Uint8Array(w * h);
  for (let row = 0; row < arc.h; row++) {
    for (let col = 0; col < arc.w; col++) {
      const i = row * arc.w + col;
      if ((arc.bits[i >>> 5] & (1 << (i & 31))) !== 0) grid[(row + 2) * w + col + 2] = 1;
    }
  }
  return { grid, w, h, gx0: arc.gx - 2, gy0: arc.gy - 2 };
}

/** Test-local paint-pipeline oracle: sharp → THE OBSERVER'S ARC (Story 11.3)
 *  → fuzz(paintSeed(t, pose)) → tight-crop → LSB-first packing. `t` is the
 *  paint tick (the server stamps `t = now` and seeds the glint from it); `o`
 *  is the observer whose radar painted it. */
function maskOracle(w: World, o: { x: number; y: number }, cls: HullId, x: number, y: number, heading: number, t: number): MaskOracle {
  const s = arcOracle(sharpOracle(cls, x, y, heading), o);
  // THE SALT (Story 11.2 review gate, F1): the wire mask is fuzzed on the
  // room-private per-paint salt — the oracle asks the World for it, which a
  // client cannot.
  const grid = fuzzOracle(s.grid, s.w, s.h, paintSeed(t, x, y, heading, w.paintSaltFor('hull', [t, x, y, heading])));
  return packOracle(grid, s.w, s.h, s.gx0, s.gy0);
}

/** The pipeline's tail, shared by the hull and the disc oracles: tight-crop
 *  the fuzzed padded grid to its lit bbox and pack it LSB-first. */
function packOracle(grid: Uint8Array, gw: number, gh: number, gx0: number, gy0: number): MaskOracle {
  let minC = gw;
  let minR = gh;
  let maxC = -1;
  let maxR = -1;
  for (let i = 0; i < gw * gh; i++) {
    if (grid[i] === 0) continue;
    const row = Math.floor(i / gw);
    const col = i % gw;
    if (col < minC) minC = col;
    if (col > maxC) maxC = col;
    if (row < minR) minR = row;
    if (row > maxR) maxR = row;
  }
  const w = maxC - minC + 1;
  const h = maxR - minR + 1;
  const bits = new Array<number>(Math.ceil((w * h) / 32)).fill(0);
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      if (grid[(row + minR) * gw + col + minC] === 1) bits[(row * w + col) >>> 5] |= 1 << ((row * w + col) & 31);
    }
  }
  return { gx: gx0 + minC, gy: gy0 + minR, w, h, bits };
}

/** Test-local SHARP disc rasterization (Story 10.9 — the AIRDROP's imprint),
 *  re-derived from the documented contract, never the production
 *  `rasterizeDiscCoverage`: the disc's bounding-box cell rect, and a cell is
 *  lit iff the point of its square NEAREST the centre (the centre clamped
 *  into the square) lies within `r` — TOUCH sampling, so a crate smaller than
 *  three cells always lights every cell it straddles, its own included.
 *  Padded 2 cells each side for the fuzz, like `sharpOracle`. */
function sharpDiscOracle(x: number, y: number, r: number): { grid: Uint8Array; w: number; h: number; gx0: number; gy0: number } {
  const gx = Math.floor((x - r) / RCELL_U);
  const gy = Math.floor((y - r) / RCELL_U);
  const bw = Math.floor((x + r) / RCELL_U) - gx + 1;
  const bh = Math.floor((y + r) / RCELL_U) - gy + 1;
  const w = bw + 4;
  const h = bh + 4;
  const grid = new Uint8Array(w * h);
  const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
  for (let row = 0; row < bh; row++) {
    for (let col = 0; col < bw; col++) {
      const x0 = (gx + col) * RCELL_U;
      const y0 = (gy + row) * RCELL_U;
      const nx = clamp(x, x0, x0 + RCELL_U);
      const ny = clamp(y, y0, y0 + RCELL_U);
      if (Math.hypot(nx - x, ny - y) <= r) grid[(row + 2) * w + col + 2] = 1;
    }
  }
  return { grid, w, h, gx0: gx - 2, gy0: gy - 2 };
}

/** The AIRDROP paint oracle (Story 10.9, R3): sharp disc of the crate radius
 *  → THE OBSERVER'S ARC (Story 11.3, R4: crates smear like hulls) → the SAME
 *  fuzz law as a hull, seeded from (paint tick, exact centre, a ZERO heading —
 *  a disc has none — and the room's per-paint 'crate' salt) → tight-crop →
 *  LSB-first packing. */
function discMaskOracle(w: World, o: { x: number; y: number }, x: number, y: number, t: number): MaskOracle {
  const s = arcOracle(sharpDiscOracle(x, y, CONFIG.drops.radiusU), o);
  const grid = fuzzOracle(s.grid, s.w, s.h, paintSeed(t, x, y, 0, w.paintSaltFor('crate', [t, x, y])));
  return packOracle(grid, s.w, s.h, s.gx0, s.gy0);
}

/** True iff `ev` is a legitimate AIRDROP paint: SOME live drop passing the
 *  blip predicate rasterizes to exactly this disc
 *  footprint. */
function blipMatchesDrop(w: World, me: ShipRecord, ev: BlipEvent): boolean {
  for (const drop of w.drops.values()) {
    if (!blipPredicate(w, me, drop)) continue;
    if (maskEquals(discMaskOracle(w, me.state, drop.x, drop.y, w.now), ev)) return true;
  }
  return false;
}

/** EXACT footprint equality — rect and every mask word. Takes the RECT
 *  (`GhostPaint`), which a `ReturnBlipEvent` extends. */
function maskEquals(a: MaskOracle, ev: GhostPaint): boolean {
  if (a.gx !== ev.gx || a.gy !== ev.gy || a.w !== ev.w || a.h !== ev.h) return false;
  return a.bits.length === ev.bits.length && a.bits.every((v, i) => v === ev.bits[i]);
}

/** Pose check for one blip against a (cls, heading) truth source at a
 *  position: the blip must carry EXACTLY the coverage footprint the
 *  independent oracle rasterizes from that pose (cycle 63, amendment 152 —
 *  never an id, position, extent, or pose field). */
function blipPoseMatches(
  w: World,
  o: { x: number; y: number },
  ev: BlipEvent,
  cls: HullId,
  p: { x: number; y: number },
  heading: number,
): boolean {
  return maskEquals(maskOracle(w, o, cls, p.x, p.y, heading, w.now), ev);
}

/** True iff `ev` is a legitimate GENUINE ship paint. The payload carries NO
 *  id (cycle 63), so the justification quantifies over the ships: SOME live
 *  non-self ship passing the ship-blip predicate must rasterize to exactly
 *  this footprint. */
function blipMatchesShip(w: World, me: ShipRecord, ev: BlipEvent): boolean {
  for (const target of w.ships.values()) {
    if (!isAfloat(target.lifecycle) || target.id === me.id) continue;
    if (!blipPredicate(w, me, target.state)) continue;
    if (blipPoseMatches(w, me.state, ev, target.hullId, target.state, target.state.heading)) return true;
  }
  return false;
}

/** The exact blip key set (cycle 63, amendment 152): the coverage footprint
 *  and NOTHING else — pinned as an exact key set, so the deletion of `id`,
 *  the position, `ext` and every pose channel is structural on every blip the
 *  fuzz sees. (Story 10.9's optional `src` origin tag left with the RADAR
 *  BUOY in Story 10.5 — `src` is forbidden again.) */
const RETURN_BLIP_KEYS = ['bits', 'gx', 'gy', 'h', 'k', 't', 'w'];
/** Fields the `return` payload must NEVER grow back — asserted by name as well
 *  as by the exact key set, because each is its own disclosure channel: `id`
 *  the cross-sweep correlation handle, x/y the exact float position, `ext`
 *  the derived aspect scalar, cls/heading/speed the 4.2 pose, `src` the
 *  retired sensor / origin tag. */
const RETURN_FORBIDDEN_KEYS = ['id', 'x', 'y', 'ext', 'cls', 'heading', 'speed', 'src'];

function verifyBlip(w: World, me: ShipRecord, e: GameEvent): void {
  const ev = e as BlipEvent;
  expect(ev.t).toBe(w.now);
  // Shape gate: the exact key set, both directions.
  expect(Object.keys(ev).sort()).toEqual(RETURN_BLIP_KEYS);
  for (const forbidden of RETURN_FORBIDDEN_KEYS) expect(Object.hasOwn(ev, forbidden)).toBe(false);
  // THE JUSTIFICATION. Every blip must byte-match an independently re-derived
  // GENUINE SHIP PAINT through the observer's own gate. (The DECOY paint arm
  // and the RADAR BUOY's tagged arm left with the buoys, Story 10.5.)
  // CHAFF's third arm — the server-generated fakes' carve-out (Story 8.16) —
  // is DELETED with the line (Story 9.2, epic-9 amendment 31): no false
  // signal leaves observe() any more, so the invariant is strictly tighter.
  // Every arm demands EXACT mask equality against the oracle's own
  // recomputation, so a real ship's footprint emitted outside every gate —
  // at its true pose, with its true hull — matches no arm and fails (pinned
  // by the directed leak-catch case below the invariant suite).
  // The AIRDROP arm (Story 10.9, R3): a blip may instead be a gated crate's
  // fuzzed DISC footprint — the same four gate terms, keyed on the drop's id.
  expect(blipMatchesShip(w, me, ev) || blipMatchesDrop(w, me, ev)).toBe(true);
  // THE ARC LINE (Story 11.3): the justified paint is an arc about THIS observer.
  const truth = blipArcTruth(w, me, ev);
  expect(truth, 'a justified blip has a subject to measure its arc against').not.toBeNull();
  verifyArc(me, ev, truth!, 'blip');
}

// ---------------------------------------------------------------------------
// THE ARC INVARIANT LINE (Story 11.3, Eric 2026-11-13, R1–R4) — beside the
// master invariant, for EVERY radar paint (hull blip, crate blip, wake `wk`)
// any observer receives across the scenario battery. Not an exception (the
// count stays SIX): a tightening of what an already-justified paint may look
// like. About THAT observer, the paint's lit cell centres must
//   (a) span at least the beam in bearing, minus one lattice cell of slack
//       per edge (a lit centre sits up to a cell inside the smeared edge —
//       measured worst ~1.5 cells across both edges), so a far contact is
//       never NARROWER than the beam allows (R2's superseding AC);
//   (b) contain the target's TRUE bearing — the arc is centered (R2);
//   (c) be no deeper along the line of sight than the target's own radial
//       extent + the pulse + a fuzz bound (R3). FUZZ BOUND, per side: half a
//       cell diagonal of lattice phase + a quarter cell of smearArc range-bin
//       over-inclusion + √2 cells of 8-neighbour dilation + one cell of
//       stretch + a bridge cell ≈ 4 cells → 8 cells across both sides. A
//       wake has no dilation or stretch, so the bound is loose for it.
// The target's radial extent is exact geometry (the hull's silhouette, the
// crate's disc, the wake's capsule quad), measured from the observer.
// ---------------------------------------------------------------------------

/** u — the range past which a paint counts toward the ARC_*_FAR ledgers: the
 *  beam is ~11 cells wide at 50 hm. */
const ARC_FAR_U = hmToU(50);
/** u — the fuzz/lattice depth bound (see the header above). */
const ARC_DEPTH_FUZZ_U = 8 * RCELL_U;

/** The measured truth a paint's arc is checked against: the target's centre
 *  and its radial extent [rMin, rMax] about the observer. */
interface ArcTruth { cx: number; cy: number; rMin: number; rMax: number; aWidth: number; kind: 'hull' | 'crate' | 'wake' }

/** The angular width (rad) of a point set about `o`, bearings relative to the
 *  bearing of (cx, cy) and wrapped to ±π. */
function angularWidth(o: { x: number; y: number }, pts: readonly { x: number; y: number }[], cx: number, cy: number): number {
  const brg = Math.atan2(cy - o.y, cx - o.x);
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of pts) {
    const a = Math.atan2(p.y - o.y, p.x - o.x) - brg;
    const rel = Math.atan2(Math.sin(a), Math.cos(a));
    lo = Math.min(lo, rel);
    hi = Math.max(hi, rel);
  }
  return hi - lo;
}

/** Distance from (px, py) to the segment a→b. */
function pointSegDist(px: number, py: number, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / l2)) : 0;
  return Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t));
}

/** A polygon's radial extent about `o`: farthest vertex, nearest boundary
 *  point (0 when `o` is inside). */
function polyArcTruth(o: { x: number; y: number }, poly: readonly { x: number; y: number }[], cx: number, cy: number, kind: ArcTruth['kind']): ArcTruth {
  let rMax = 0;
  let rMin = Infinity;
  for (let i = 0; i < poly.length; i++) {
    rMax = Math.max(rMax, Math.hypot(poly[i].x - o.x, poly[i].y - o.y));
    rMin = Math.min(rMin, pointSegDist(o.x, o.y, poly[i], poly[(i + 1) % poly.length]));
  }
  if (inPolyOracle(o.x, o.y, poly)) rMin = 0;
  return { cx, cy, rMin, rMax, aWidth: angularWidth(o, poly, cx, cy), kind };
}

/** The subject a justified blip was matched to (the blipMatchesShip /
 *  blipMatchesDrop quantifiers, returning the geometry instead of a flag). */
function blipArcTruth(w: World, me: ShipRecord, ev: BlipEvent): ArcTruth | null {
  for (const target of w.ships.values()) {
    if (!isAfloat(target.lifecycle) || target.id === me.id) continue;
    if (!blipPredicate(w, me, target.state)) continue;
    if (!blipPoseMatches(w, me.state, ev, target.hullId, target.state, target.state.heading)) continue;
    const { x, y, heading } = target.state;
    const c = Math.cos(heading);
    const sn = Math.sin(heading);
    const poly = hullSilhouette(target.hullId).map((p) => ({ x: x + c * p.x - sn * p.y, y: y + sn * p.x + c * p.y }));
    return polyArcTruth(me.state, poly, x, y, 'hull');
  }
  for (const drop of w.drops.values()) {
    if (!blipPredicate(w, me, drop)) continue;
    if (!maskEquals(discMaskOracle(w, me.state, drop.x, drop.y, w.now), ev)) continue;
    const d = Math.hypot(drop.x - me.state.x, drop.y - me.state.y);
    const r = CONFIG.drops.radiusU;
    return { cx: drop.x, cy: drop.y, rMin: Math.max(0, d - r), rMax: d + r, aWidth: d > r ? 2 * Math.asin(r / d) : 2 * Math.PI, kind: 'crate' };
  }
  return null;
}

/** The capsule quad of a wake segment (the wakeMaskOracle's own derivation). */
function wakeArcTruth(o: { x: number; y: number }, seg: WakeSegOracle, widthU: number): ArcTruth {
  const dx = seg.bx - seg.ax;
  const dy = seg.by - seg.ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ux = len > 0 ? dx / len : 1;
  const uy = len > 0 ? dy / len : 0;
  const hw = Number.isFinite(widthU) && widthU > 0 ? widthU / 2 : 0;
  const quad = [
    { x: seg.ax - ux * hw - uy * hw, y: seg.ay - uy * hw + ux * hw },
    { x: seg.bx + ux * hw - uy * hw, y: seg.by + uy * hw + ux * hw },
    { x: seg.bx + ux * hw + uy * hw, y: seg.by + uy * hw - ux * hw },
    { x: seg.ax - ux * hw + uy * hw, y: seg.ay - uy * hw - ux * hw },
  ];
  return polyArcTruth(o, quad, seg.mx, seg.my, 'wake');
}

/** The lit cell centres' bearing span (relative to `brg`, wrapped to ±π) and
 *  range span about `o`. */
function litPolar(m: GhostPaint, o: { x: number; y: number }, brg: number): { lo: number; hi: number; rLo: number; rHi: number } {
  const out = { lo: Infinity, hi: -Infinity, rLo: Infinity, rHi: -Infinity };
  for (let row = 0; row < m.h; row++) {
    for (let col = 0; col < m.w; col++) {
      const i = row * m.w + col;
      if ((m.bits[i >>> 5] & (1 << (i & 31))) === 0) continue;
      const dx = (m.gx + col + 0.5) * RCELL_U - o.x;
      const dy = (m.gy + row + 0.5) * RCELL_U - o.y;
      const a = Math.atan2(dy, dx) - brg;
      const rel = Math.atan2(Math.sin(a), Math.cos(a));
      const r = Math.hypot(dx, dy);
      out.lo = Math.min(out.lo, rel);
      out.hi = Math.max(out.hi, rel);
      out.rLo = Math.min(out.rLo, r);
      out.rHi = Math.max(out.rHi, r);
    }
  }
  return out;
}

/** THE ARC LINE for one paint (see the section header). */
function verifyArc(me: ShipRecord, m: GhostPaint, t: ArcTruth, tag: string): void {
  const o = me.state;
  const range = Math.hypot(t.cx - o.x, t.cy - o.y);
  if (!(range > 0)) return; // a paint on the antenna's own point has no bearing (the gate never paints one)
  const brg = Math.atan2(t.cy - o.y, t.cx - o.x);
  const p = litPolar(m, o, brg);
  const label = `${tag} ${t.kind} @ ${range.toFixed(0)} u`;
  // (a) never narrower than the beam (one cell of slack per edge).
  expect(p.hi - p.lo, `${label}: bearing span ≥ beam`).toBeGreaterThanOrEqual(ARC_BEAM - (2 * RCELL_U) / range);
  // (b) centered: the true bearing lies inside the span (within one cell of
  // lattice phase — a near, unsmeared ribbon's cell centres can all sit just
  // to one side of its exact midpoint bearing; far out the beam swamps it).
  const cellAngle = RCELL_U / range;
  expect(p.lo, `${label}: arc holds the true bearing (lo)`).toBeLessThanOrEqual(cellAngle);
  expect(p.hi, `${label}: arc holds the true bearing (hi)`).toBeGreaterThanOrEqual(-cellAngle);
  // (c) no deeper than the target's own extent + the pulse + the fuzz bound.
  expect(p.rHi - p.rLo, `${label}: depth bound`).toBeLessThanOrEqual(t.rMax - t.rMin + ARC_PULSE + ARC_DEPTH_FUZZ_U);
  if (range < ARC_FAR_U) return;
  // (d) far: no WIDER than the target's own angular width plus the beam, plus
  // the lattice and fuzz (a sharp cell centre within a cell diagonal of the
  // target, then two fuzz cells — dilation + stretch — a side).
  expect(p.hi - p.lo, `${label}: bearing span ≤ target + beam`).toBeLessThanOrEqual(t.aWidth + ARC_BEAM + (5 * Math.SQRT2 * RCELL_U) / range);
  // The ledger counts a paint only where arm (a) is a real claim: the target
  // alone is narrower than the beam less the arm's slack.
  if (!(t.aWidth < ARC_BEAM - (2 * RCELL_U) / range)) return;
  if (t.kind === 'hull') ARC_HULL_FAR.n += 1;
  else if (t.kind === 'crate') ARC_CRATE_FAR.n += 1;
  else ARC_WAKE_FAR.n += 1;
}

// shell AND torp share one verifier — with the fork by kind (Story 11.2, R4):
// a shell reveals at the SHELL eye reach, a torpedo at the TORPEDO eye reach
// (`projectileSeen`). Both live in world.shells, keyed by projectile id.
function verifyBallistic(w: World, me: ShipRecord, e: GameEvent): void {
  const ev = e as BallisticEvent;
  const sh = w.shells.get(ev.id)!;
  expect(sh).toBeDefined();
  expect({ x: ev.x, y: ev.y }).toEqual({ x: sh.x, y: sh.y }); // current pos, never launch pos
  assertBallisticShape(ev); // no range-derivable field ever leaks
  // Story 8.15: `w` is the LIVE projectile's family, present IFF it is a shell
  // with a family — and a torpedo's family is null by construction, so a torp
  // reveal is provably blind (the structural half is in assertBallisticShape).
  if (sh.kind === 'torp') expect(sh.family).toBeNull();
  expect('w' in ev).toBe(sh.kind === 'shell' && sh.family !== null);
  if ('w' in ev) expect(ev.w).toBe(sh.family);
  // Inside its kind's eye reach OR inside an OWNED lit zone (Story 1.7) —
  // never anyone else's.
  if (sh.ownerId !== me.id) {
    expect(projectileSeen(w, me, sh, ev) || zoneCovers(w, me, ev)).toBe(true);
  }
}

function verifyBoom(w: World, me: ShipRecord, e: GameEvent): void {
  const ev = e as BoomEvent;
  // The wire shape never carries a server-internal owner tag (`run`, `land`).
  for (const k of Object.keys(ev)) expect(['k', 'id', 'hit', 'x', 'y']).toContain(k);
  // A MAIN-BATTERY LANDING boom (epic-11 amendment 8 — the retired burst's
  // owner arm) reaches its shell's OWNER anywhere: the point is his own
  // shell's landing, sent to him anyway as `sp` / `hc`. The owner is
  // recovered INDEPENDENTLY from the world's internal tick-event buffer.
  const src = w.tickEvents.find((t) => t.k === 'boom' && t.id === ev.id) as (BoomEvent & { land?: string }) | undefined;
  const ownLanding = src?.land === me.id;
  // Boom POINT: inside the SPLASH reach (Story 11.2, R4) OR inside a zone the
  // observer OWNS (Story 1.7 parity).
  if (ev.hit !== me.id && !ownLanding) expect(splashSeen(w, me, ev) || zoneCovers(w, me, ev)).toBe(true);
  // `hit` is an IDENTITY: it may name a victim only when that victim's CENTER
  // is inside the CLASS reach (`sighted`) or zone-covered (or the observer is
  // the victim) — a straddling hull, or a PLAIN hull of the outer tier, must
  // not leak its id.
  if (ev.hit !== undefined && ev.hit !== me.id) {
    const victim = w.ships.get(ev.hit)!.state;
    expect(sighted(w, me, victim) || zoneCovers(w, me, victim)).toBe(true);
  }
}

// A burst may reach an observer ONLY when it fired the shell (the point is its
// own click) or the burst point is sighted; and the wire shape is exactly
// {k,id,x,y} — the server-internal owner field (and any radius/range field)
// must never ride it. The owner is recovered INDEPENDENTLY from the world's
// internal tick-event buffer (where `own` legitimately lives), never from the
// registry row.
function verifyBurst(w: World, me: ShipRecord, e: GameEvent): void {
  const ev = e as BurstEvent;
  const src = w.tickEvents.find((t) => t.k === 'burst' && t.id === ev.id) as
    | (BurstEvent & { own?: string })
    | undefined;
  expect(src).toBeDefined();
  // The FLASH tag `f` (epic-10 amendment 5) is the ONE optional key: present
  // (exactly `true`, LAST) iff the internal subject carries it — never on any
  // other burst. It never changes WHO receives the burst (the gate below).
  if (src!.f === true) {
    // ...followed LAST by its stamped radius `r` (Story 10.5, R7) — the
    // launched shell's own number, a tier step of the CONFIG base.
    expect(Object.keys(ev)).toEqual(['k', 'id', 'x', 'y', 'f', 'r']);
    expect(ev.f).toBe(true);
    expect(ev.r).toBe(src!.r);
    expect(((ev.r! - CONFIG.flashShells.radius) / CONFIG.flashShells.radiusStepPerTier) % 1).toBe(0);
  } else {
    expect(Object.keys(ev).sort()).toEqual(['id', 'k', 'x', 'y']);
  }
  // Burst point: inside the splash reach OR inside a zone the observer OWNS (Story 1.7 parity)
  // — OR, for a FLASH-tagged burst only (Eric 2026-10-29, gate fix F2), the
  // observer's hull CENTRE inside the flash radius of the burst point (the
  // flashed victim sees the disc; it already learns the flash through its own
  // `dazzledUntil`). Re-derived here off CONFIG, never the row.
  if (src!.own === me.id) return;
  const inFlash = src!.f === true && dist(me.state, ev) <= src!.r!;
  expect(splashSeen(w, me, ev) || zoneCovers(w, me, ev) || inFlash).toBe(true); // the SPLASH reach (Story 11.2, R4)
}

// THE PUBLIC REGISTER (PV 23) — `sunk` is the 4th DECLARED exception to the
// master invariant (after sp/hc/mz), reimplemented here independently of its
// registry row: a victim's sinking is identity-only PUBLIC (allowed
// unconditionally — every hull is a participant since Story 10.8 retired the
// PvE fleet, whose sinkings reached only a witness or the credited killer);
// the victim itself always hears of its own sinking; and the per-observer
// `seen` flag may be PRESENT only when the witness predicate genuinely holds
// — `seen` is the client's license to render spatially, so a wrongly-stamped
// flag IS a location leak. INDEPENDENCE SCOPE: the claim above is honest
// only for the GEOMETRY terms — `sighted`/`zoneCovers` are this file's own
// reimplementations.
function verifySunk(w: World, me: ShipRecord, e: GameEvent): void {
  const ev = e as SunkEvent;
  // THE PAYLOAD PIN: because this event reaches every fogged client, the wire
  // shape itself is the anti-leak boundary — the keys must be a subset of
  // exactly {k,id,by,seen,bty}. A positional (or any other) field added at the
  // world emission, or a materialize() regression back to pass-through, fails
  // HERE even though every visibility clause still holds. The two class
  // stamps of Stories 5.6 / 7.6 (`vcls` — the victim's hull id to the
  // credited killer; `kcls` — a PvE killer's hull id) RETIRED with the fleet
  // at Story 10.8: a hull class never rides this row again, to anyone (the
  // shared type keeps them optional until the shared cut; this pin is what
  // keeps the server from setting them).
  for (const key of Object.keys(ev)) expect(['k', 'id', 'by', 'seen', 'bty']).toContain(key);
  // `bty` (Story 4.6, 2026-08-10 rework): WHICH PARTICIPANT held the bounty
  // throne at the pre-sink instant — 'v' the victim, 'k' the killer. Two
  // independent checks, neither reading the production row: the value is
  // only ever literally 'v' or 'k' (a false/undefined-valued key is a wire
  // regression — msgpack encodes it), and it must be observer-INDEPENDENT,
  // equal to the world's own pre-sink emission verbatim — a per-observer
  // stamping would turn it into a second `seen` and leak witness geometry.
  const src = w.tickEvents.find((t) => t.k === 'sunk' && t.id === ev.id) as SunkEvent | undefined;
  if ('bty' in ev) expect(['v', 'k']).toContain(ev.bty);
  if (src !== undefined) {
    expect('bty' in ev).toBe(src.bty !== undefined); // present iff the world emitted it
    expect(ev.bty).toBe(src.bty); // and identical for every observer, verbatim
  }
  if (ev.id === me.id) return;
  const wreck = w.ships.get(ev.id);
  if (wreck === undefined) {
    // No wreck record this tick. Production visible() still delivers to the
    // CREDITED KILLER (sunkCreditedTo consults no record), and ONLY to them:
    // sunkWitnessed and the public clause both fail-close without a record.
    expect(ev.by).toBe(me.id);
    // The witness predicate fail-closes too, so `seen` must be ABSENT.
    expect(ev.seen).toBeUndefined();
    return;
  }
  // `seen` IS AN IDENTITY FIELD (Story 11.2): the CLASS reach, never the
  // splash reach — it must not name a hull the observer holds only as a
  // plain contact.
  const witnessed = sighted(w, me, wreck.state) || zoneCovers(w, me, wreck.state);
  // In EVERY case: `seen` present ⇒ the sight-or-owned-zone condition holds.
  if (ev.seen !== undefined) {
    expect(ev.seen).toBe(true); // never emitted as false
    expect(witnessed).toBe(true);
  }
}

/**
 * The foghorn VOLUME-BAND oracle (Story 9.8, ruling 129 — twelve bands, the
 * proportional re-read of Story 4.9's eight / amendment 122), reimplemented
 * test-locally from the ruling text — NEVER the production hornBandFor. The
 * band is which twelfth of the LISTENER'S own INTEL range (this file's
 * effRadar reimplementation — boon-widened, NEVER dazzle-scaled, which is
 * what makes "dazzle cannot deafen" true by construction) the honker sits
 * in: ceil(12 × d / intel), d == 0 → band 1, boundaries inclusive; beyond
 * band 12 → inaudible. Islands MUFFLE once, post-resolution, to max(5,
 * band + 3) — silent past 12 (a cloud muffles nothing — Story 9.3 session 2). Amendment 53's
 * max() clamps are RETIRED; nothing here reads effSight or muzzleFlash.
 *
 * THE PLATEAU FLOOR (review fix, anti-cheat): the RAW band is floored to
 * `max(band, 4)` BEFORE the muffle. Bands 1-4 are indistinguishable in every
 * honest client surface (gain 1.0 and the same chevron weight for all four), so
 * transmitting which of them a honker sits in is pure range resolution for a
 * modified client and nothing else — amendment 51 bounds the disclosure to
 * bearing and VOLUME TIER. Re-derived here from that reasoning, not read off
 * production: flooring the EMITTED value instead would leak the very bit the
 * floor removes (a blocked raw 1-3 would land differently from a blocked raw
 * 4, which differences straight back to the plateau). The DOMAIN CHECK is the second half of the same fail-closed discipline:
 * only a POSITIVE FINITE listener range — tested before the `d === 0`
 * short-circuit, which never reads it — and a finite integer in 1..12 is a
 * band at all.
 */
function hornBandOracle(w: World, me: ShipRecord, p: { x: number; y: number }): number | null {
  const intel = effRadar();
  if (!Number.isFinite(intel) || intel <= 0) return null;
  const d = dist(me.state, p);
  // Story 9.8 (ruling 129): TWELVE bands, the plateau floor at the sight rung
  // (4/12), the island muffle +3 (the eighths' +2 re-read), silent past 12.
  const band = d === 0 ? 1 : Math.ceil((12 * d) / intel);
  if (!Number.isInteger(band) || band < 1 || band > 12) return null;
  const floored = Math.max(band, 4);
  const emitted = sightClearOracle(w, me, p) ? floored : Math.max(5, floored + 3);
  return emitted > 12 ? null : emitted;
}

// ---------- Story 4.12: the radar-wake oracle (independently re-derived) -----
//
// The `wk` row discloses a wake ribbon SEGMENT — water, not a ship — in the
// `return` grammar ONLY (cycle-69 review gate, P1: the client's wake path has
// no other consumer), gated at its MIDPOINT by the blip clauses: dist ≤
// radar (NO inner bound — amendment 210, Eric 2026-10-21: the server returns
// the entire sweep; the per-source sight/detect inner bounds of review-gate
// P2 and the in-bubble binary-LOS clause are retired) ∧ this-tick paint
// window ∧ the height-aware shadow march, for ship and
// torpedo water alike. NO owned-zone term; the ONLY self-exclusion is the
// observer's own HULL ribbon (keyed by its ship id — the amendment-210 gate
// patch, as the radar never paints its own hull); its own torpedo water paints. Everything below re-derives the ribbon model from
// the documented contract, never the production sim/wake.ts or the segment
// rasterizer: segmentation of the RAW ring storage (consecutive finite
// samples chain, the ribbon closes across a non-finite one), the
// older-endpoint age rule with strict `age > life` expiry, the four-bucket
// quarter-life quantization written as a LITERAL, and the whole segment-mask
// geometry (capsule quad with square caps, centre-in-quad fill on the
// test-local even-odd test, the quarter-cell centre-line walk with in-walk
// diagonal bridging, the PER-PAINT FLANK GLINT — review-gate P3: covered
// non-spine cells drop row-major on mulberry32(segmentPaintSeed(t, pose)) at
// the shipped glintP, the spine never drops — the fixed-point bridge pass,
// LSB-first packing, and the tight CROP of what survived (the rect dims are
// themselves a width readout, so an eroded edge row must leave the rect).
// The seed/RNG primitives are shared exactly as the hull fuzz oracle shares
// paintSeed/mulberry32; NO dilation and NO stretch (wave 1's ruling — the
// hull's structural smear would blob a one-cell ribbon). The ribbon's
// STORAGE (xs/ys/ts ring, lifeMs, widthU, torp) is read as world state
// exactly as verifyBallistic reads a shell's live x/y; the directed wake
// tests pin the production-derived lifeMs/widthU values against literals
// (12000 / 6000; a hull's beam; one 9u cell) so a wrong derivation cannot
// hide inside the state this oracle consumes.

/** WAKE_AGE_BUCKETS as a literal (the oracle rule). */
const WAKE_BUCKETS_LIT = 4;

interface WakeSegOracle {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  mx: number;
  my: number;
  bucket: number;
}

/** The LIVE segments of one ribbon, re-derived from raw ring storage: walk
 *  the ring oldest→newest, chain consecutive finite samples (closing across
 *  any non-finite one), drop a segment whose OLDER endpoint's water is
 *  strictly older than the ribbon's life, and quantize its age into the
 *  four quarter-life buckets (boundary age lands in the OLDER bucket; the
 *  last bucket clamps). */
function wakeSegmentsOracle(r: WakeRibbon, now: number): WakeSegOracle[] {
  const out: WakeSegOracle[] = [];
  let prev = -1;
  for (let n = 0; n < r.count; n++) {
    const i = (r.head + n) % r.cap;
    if (!Number.isFinite(r.xs[i]) || !Number.isFinite(r.ys[i]) || !Number.isFinite(r.ts[i])) continue;
    if (prev >= 0) {
      const age = now - r.ts[prev];
      if (age <= r.lifeMs) {
        const raw = Math.floor((Math.max(0, age) / r.lifeMs) * WAKE_BUCKETS_LIT);
        out.push({
          ax: r.xs[prev],
          ay: r.ys[prev],
          bx: r.xs[i],
          by: r.ys[i],
          mx: (r.xs[prev] + r.xs[i]) / 2,
          my: (r.ys[prev] + r.ys[i]) / 2,
          bucket: Math.min(raw, WAKE_BUCKETS_LIT - 1),
        });
      }
    }
    prev = i;
  }
  return out;
}

/** The per-segment wake gate, reimplemented test-locally (see the oracle
 *  header): d ≤ radar (no inner bound — amendment 210), the this-tick paint
 *  window and the radar shadow march — FOG-BLIND by ruling (amendment 149).
 *  Ship and torpedo
 *  water alike; no cloud term (Story 9.3 session 2), NO zone term; the one
 *  self term: NONE (Eric 2026-10-21: "I want ALL radar returns" — the
 *  observer's own water paints too); a midpoint on the observer's own point
 *  is no return. */
function wakeDisclosed(w: World, me: ShipRecord, seg: WakeSegOracle): boolean {
  const mid = { x: seg.mx, y: seg.my };
  if (mid.x === me.state.x && mid.y === me.state.y) return false;
  if (Math.hypot(seg.bx - seg.ax, seg.by - seg.ay) > LEGAL_WAKE_SEGMENT_U) return false;
  const d = dist(me.state, mid);
  if (d > effRadar()) return false;
  if (!inPaintWindow(me, bearing(me.state, mid))) return false;
  return shadowVisible(w, me, mid);
}

/** u — the longest segment real water makes (Story 11.3 review, P6),
 *  re-derived here: one sample cadence plus one tick of the fastest water-
 *  layer (every hull with every card line at its cap, boosted and drafted;
 *  every torpedo row at its cap). Longer is a pose teleported across a live
 *  ring (these fixtures place hulls by fiat) and is never painted. */
const LEGAL_WAKE_SEGMENT_U = ((): number => {
  const every = Object.values(CATALOG).flatMap((l) => Array<string>(l.cap).fill(l.id));
  let v: number = CONFIG.torpedo.speed;
  for (const id of SHIP_CLASS_IDS) {
    const st = effectiveStats(hullEnvelope(id), every);
    v = Math.max(v, draftedKinematics(boostedKinematics(st.kinematics, CONFIG.boost.factor, true), CONFIG.wake.draft.lift, true).maxSpeed);
    v = Math.max(v, st.equipment.lightTorpedo.speed, st.equipment.heavyTorpedo.speed, st.equipment.supercavTorpedo.speed);
  }
  return CONFIG.vision.wakeSampleU + (v * CONFIG.tick.simDtMs) / 1000;
})();

/** Test-local SEGMENT mask oracle (the maskOracle sibling, re-derived from
 *  the documented paintSegmentCoverage contract): capsule quad with square
 *  caps (endpoints extended halfW along the axis, ±halfW along the normal; a
 *  zero-length segment's axis degenerates to +x), the quad's cell bbox as
 *  the working rect, centre-in-quad fill (even-odd) into the mask, the
 *  quarter-cell centre-line walk with in-walk diagonal bridging into a
 *  SEPARATE spine grid (then unioned), the PER-PAINT FLANK GLINT (review-
 *  gate P3: row-major over the rect, each covered non-spine cell draws once
 *  on mulberry32(segmentPaintSeed(t, ax, ay, bx, by)) and drops under the
 *  shipped glintP; the spine never drops — seed/RNG shared as entropy
 *  primitives, the paintSeed precedent), the fixed-point diagonal bridge
 *  pass, LSB-first packing, and the tight CROP of what survived. NO dilation
 *  and NO stretch. */
function wakeMaskOracle(w: World, o: { x: number; y: number }, ax: number, ay: number, bx: number, by: number, widthU: number, t: number): MaskOracle {
  const dx = bx - ax;
  const dy = by - ay;
  // sqrt(dx²+dy²), NOT Math.hypot: the documented axis derivation — a
  // last-ulp divergence here could flip a quad corner across a cell boundary
  // (the shadowVisible oracle's bit-identity discipline).
  const len = Math.sqrt(dx * dx + dy * dy);
  const ux = len > 0 ? dx / len : 1;
  const uy = len > 0 ? dy / len : 0;
  const hw = Number.isFinite(widthU) && widthU > 0 ? widthU / 2 : 0;
  const quad = [
    { x: ax - ux * hw - uy * hw, y: ay - uy * hw + ux * hw },
    { x: bx + ux * hw - uy * hw, y: by + uy * hw + ux * hw },
    { x: bx + ux * hw + uy * hw, y: by + uy * hw - ux * hw },
    { x: ax - ux * hw + uy * hw, y: ay - uy * hw - ux * hw },
  ];
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  const gx = Math.floor(Math.min(...xs) / RCELL_U);
  const gy = Math.floor(Math.min(...ys) / RCELL_U);
  const cw = Math.floor(Math.max(...xs) / RCELL_U) - gx + 1;
  const ch = Math.floor(Math.max(...ys) / RCELL_U) - gy + 1;
  const grid = new Uint8Array(cw * ch);
  const spine = new Uint8Array(cw * ch);
  const mark = (col: number, row: number): void => {
    if (col >= 0 && row >= 0 && col < cw && row < ch) spine[row * cw + col] = 1;
  };
  if (hw > 0) {
    for (let row = 0; row < ch; row++) {
      for (let col = 0; col < cw; col++) {
        if (inPolyOracle((gx + col + 0.5) * RCELL_U, (gy + row + 0.5) * RCELL_U, quad)) grid[row * cw + col] = 1;
      }
    }
  }
  const steps = Math.max(1, Math.ceil((Math.max(Math.abs(dx), Math.abs(dy)) / RCELL_U) * 4));
  let pcol = Math.floor(ax / RCELL_U) - gx;
  let prow = Math.floor(ay / RCELL_U) - gy;
  mark(pcol, prow);
  for (let i = 1; i <= steps; i++) {
    const col = Math.floor((ax + (dx * i) / steps) / RCELL_U) - gx;
    const row = Math.floor((ay + (dy * i) / steps) / RCELL_U) - gy;
    if (col !== pcol && row !== prow) mark(pcol, row); // in-walk corner bridge
    mark(col, row);
    pcol = col;
    prow = row;
  }
  for (let i = 0; i < cw * ch; i++) if (spine[i] === 1) grid[i] = 1; // spine ∪ fill
  // THE ARC (Story 11.3, R4): spine ∪ fill is smeared about the observer by
  // the SHARED smearArc; the core is the spine's own arc (smearArc of the
  // spine on the same rect), re-seated on the arc's rect. An observer within
  // a cell of the rect gets no arc (smearArc returns its input), and the core
  // is then the bare spine.
  const coverMask = innerMaskOracle({ grid: padOracle(grid, cw, ch), w: cw + 4, h: ch + 4, gx0: gx - 2, gy0: gy - 2 });
  const spineMask = innerMaskOracle({ grid: padOracle(spine, cw, ch), w: cw + 4, h: ch + 4, gx0: gx - 2, gy0: gy - 2 });
  const arc = smearArc(coverMask, o.x, o.y, RCELL_U, ARC_BEAM, ARC_PULSE);
  const coreMask = arc === coverMask ? spineMask : smearArc(spineMask, o.x, o.y, RCELL_U, ARC_BEAM, ARC_PULSE);
  const ag = maskToGridOracle(arc, arc);
  const core = maskToGridOracle(coreMask, arc);
  // THE PER-PAINT FLANK GLINT (P3): row-major over the ARC's rect, covered
  // non-core cells only.
  const rng = mulberry32(segmentPaintSeed(t, ax, ay, bx, by, w.paintSaltFor('wake', [t, ax, ay, bx, by]))); // F1: the room-private salt
  const glintP = CONFIG.vision.radarFuzz.glintP;
  for (let i = 0; i < arc.w * arc.h; i++) {
    if (ag[i] === 1 && core[i] !== 1 && rng.next() < glintP) ag[i] = 0;
  }
  bridgeOracle(ag, arc.w, arc.h); // the same fixed-point rule, reused test-locally
  return cropPackOracle(ag, arc.w, arc.h, arc.gx, arc.gy);
}

/** A bare `cw × ch` grid padded 2 cells each side (`innerMaskOracle`'s input). */
function padOracle(g: Uint8Array, cw: number, ch: number): Uint8Array {
  const out = new Uint8Array((cw + 4) * (ch + 4));
  for (let row = 0; row < ch; row++) {
    for (let col = 0; col < cw; col++) out[(row + 2) * (cw + 4) + col + 2] = g[row * cw + col];
  }
  return out;
}

/** `m`'s lit cells on `rect`'s grid (absolute lattice; cells outside dropped). */
function maskToGridOracle(m: HullCoverage, rect: HullCoverage): Uint8Array {
  const out = new Uint8Array(rect.w * rect.h);
  for (let row = 0; row < m.h; row++) {
    for (let col = 0; col < m.w; col++) {
      const i = row * m.w + col;
      if ((m.bits[i >>> 5] & (1 << (i & 31))) === 0) continue;
      const c = m.gx + col - rect.gx;
      const r = m.gy + row - rect.gy;
      if (c >= 0 && r >= 0 && c < rect.w && r < rect.h) out[r * rect.w + c] = 1;
    }
  }
  return out;
}

/** CROP a grid at absolute origin (gx, gy) to its covered bbox and pack it
 *  LSB-first (the core guarantees at least one cell). */
function cropPackOracle(grid: Uint8Array, cw: number, ch: number, gx: number, gy: number): MaskOracle {
  // CROP to the covered bbox (the spine guarantees at least one cell).
  let minC = cw;
  let minR = ch;
  let maxC = -1;
  let maxR = -1;
  for (let row = 0; row < ch; row++) {
    for (let col = 0; col < cw; col++) {
      if (grid[row * cw + col] !== 1) continue;
      if (col < minC) minC = col;
      if (col > maxC) maxC = col;
      if (row < minR) minR = row;
      if (row > maxR) maxR = row;
    }
  }
  const ow = maxC - minC + 1;
  const oh = maxR - minR + 1;
  const bits = new Array<number>(Math.ceil((ow * oh) / 32)).fill(0);
  for (let row = 0; row < oh; row++) {
    for (let col = 0; col < ow; col++) {
      if (grid[(row + minR) * cw + col + minC] === 1) {
        const i = row * ow + col;
        bits[i >>> 5] |= 1 << (i & 31);
      }
    }
  }
  return { gx: gx + minC, gy: gy + minR, w: ow, h: oh, bits };
}

/** True iff `ev` is justified by SOME live ribbon segment: gated for this
 *  observer, same age bucket, and EXACTLY the oracle's mask (two-sided —
 *  every wire bit earned, every earned bit on the wire). */
function wakeMatchesSegment(w: World, me: ShipRecord, ev: WakeBlipEvent): boolean {
  for (const ribbon of w.wakeRibbons) {
    for (const seg of wakeSegmentsOracle(ribbon, w.now)) {
      if (seg.bucket !== ev.a || !wakeDisclosed(w, me, seg)) continue;
      if (!maskEquals(wakeMaskOracle(w, me.state, seg.ax, seg.ay, seg.bx, seg.by, ribbon.widthU, w.now), ev as unknown as ReturnBlipEvent)) continue;
      // THE ARC LINE (Story 11.3, R4): the justified segment paint is an arc
      // about THIS observer, like a hull's.
      verifyArc(me, ev, wakeArcTruth(me.state, seg, ribbon.widthU), 'wk');
      return true;
    }
  }
  return false;
}

/** The exact `wk` key set (amendment 194: geometry + age bucket and NOTHING
 *  else), plus the by-name forbidden identity/pose channels. */
const WAKE_KEYS = ['a', 'bits', 'gx', 'gy', 'h', 'k', 't', 'w'];
const WAKE_FORBIDDEN_KEYS = ['id', 'x', 'y', 'cls', 'heading', 'speed', 'own', 'by', 'ext'];

function verifyWake(w: World, me: ShipRecord, e: GameEvent): void {
  const ev = e as WakeBlipEvent;
  expect(Object.keys(ev).sort()).toEqual(WAKE_KEYS);
  for (const forbidden of WAKE_FORBIDDEN_KEYS) expect(Object.hasOwn(ev, forbidden)).toBe(false);
  expect(ev.t).toBe(w.now);
  expect(Number.isInteger(ev.a)).toBe(true);
  expect(ev.a).toBeGreaterThanOrEqual(0);
  expect(ev.a).toBeLessThan(WAKE_BUCKETS_LIT);
  expect(wakeMatchesSegment(w, me, ev), 'wk event justified by a gated live segment').toBe(true);
}

/**
 * THE WAKE COMPLETENESS ORACLE (the verifyBlipCompleteness spirit, demanded
 * by amendment 40 / amendment 159's clause l): an upper-bound-only oracle
 * cannot detect the channel getting SMALLER, so every frame must carry
 * EXACTLY one `wk` event per gated live segment — each gated segment's
 * expected mask + bucket present, and the total count equal, so nothing is
 * missing, duplicated, or fabricated. This also binds the production
 * broadphase (sweepMayCrossWake): an over-eager cull drops a gated segment
 * and fails HERE.
 */
function verifyWakeCompleteness(w: World, me: ShipRecord, f: FrameMsg): void {
  if (!isAfloat(me.lifecycle)) return;
  const wks = f.events.filter((e): e is WakeBlipEvent => e.k === 'wk');
  let gated = 0;
  for (const ribbon of w.wakeRibbons) {
    for (const seg of wakeSegmentsOracle(ribbon, w.now)) {
      if (!wakeDisclosed(w, me, seg)) continue;
      gated++;
      const expected = wakeMaskOracle(w, me.state, seg.ax, seg.ay, seg.bx, seg.by, ribbon.widthU, w.now);
      expect(
        wks.some((b) => b.a === seg.bucket && maskEquals(expected, b as unknown as ReturnBlipEvent)),
        `gated wake segment (${seg.ax},${seg.ay})→(${seg.bx},${seg.by}) accounted for`,
      ).toBe(true);
    }
  }
  expect(wks.length, 'exactly one wk event per gated wake segment').toBe(gated);
}

/** Write a synthetic laid track STRAIGHT into a ribbon's raw ring storage
 *  (the injectShell posture — world state, never production sampling): `n`
 *  samples on the 12u cadence marching TO (x, y) along `heading`, ages
 *  spread evenly across the newest `spanMs` (oldest first — ring order is
 *  time order), so every age bucket gets exercised. */
function injectWakeTrack(r: WakeRibbon, x: number, y: number, heading: number, n: number, now: number, spanMs: number): void {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  for (let k = 0; k < n; k++) {
    const back = (n - 1 - k) * 12;
    r.xs[k] = x - c * back;
    r.ys[k] = y - s * back;
    r.ts[k] = now - (spanMs * (n - 1 - k)) / Math.max(1, n - 1);
  }
  r.head = 0;
  r.count = n;
}

const EVENT_VERIFIERS: Record<string, EventVerifier> = {
  blip: verifyBlip,
  // Story 4.12: radar wakes — NOT a declared fog exception (the exact three
  // blip clauses, per segment); the oracle above re-derives ribbon geometry,
  // gate, and mask from the documented contract.
  wk: verifyWake,
  shell: verifyBallistic,
  torp: verifyBallistic,
  boom: verifyBoom,
  burst: verifyBurst,
  sunk: verifySunk,
  // Self-private kinds: each may only ever reach the ship its `id` names.
  dmg: (_w, me, e) => expect((e as DamageEvent).id).toBe(me.id), // victim-private
  pt: (_w, me, e) => expect((e as PointEvent).id).toBe(me.id), // earner-private
  // THE AIRDROP PICKUP TELL (Story 10.9, epic-10 amendment 18): collector-
  // private on the pt terms — delivered iff `id` is the observer — and
  // exactly {k,id,t,g}: the rolls the collector just gained, nothing about
  // the crate's position (it is gone). Spectator privacy is pinned by the
  // directed row tests (signals.test.ts) and dropPerception.test.ts.
  dp: (w, me, e) => {
    const ev = e as DropPickupEvent;
    expect(ev.id).toBe(me.id);
    expect(Object.keys(ev)).toEqual(['k', 'id', 't', 'g']);
    expect(ev.t).toBe(w.now);
    for (const roll of ev.g) expect(isDropRoll(roll)).toBe(true);
  },
  // DAMAGE CONTROL (2026-08-04): healer-private on the pt/bn terms, and the
  // key set IS the severity oracle — a heal may carry NO hp amount, no pool
  // total, no maxHp, nothing another observer could difference against a
  // watched hp bar. Reimplemented here independently of the registry row.
  heal: (_w, me, e) => {
    const ev = e as HealEvent;
    expect(ev.id).toBe(me.id);
    expect(Object.keys(ev).sort()).toEqual(['id', 'k']);
  },
  bn: (_w, me, e) => {
    // Spender-private (Story 2.7), and a valid catalog id: an enemy build can
    // never ride another observer's frame, and a fabricated boon id can never
    // materialize (the server only ever emits what it just applied).
    expect((e as BoonFitEvent).id).toBe(me.id);
    expect(Object.hasOwn(CATALOG, (e as BoonFitEvent).boon)).toBe(true);
  },
  // Story 4.3 — the gunnery conversation's three DECLARED exceptions, each
  // reimplemented here independently of its registry row (the header rule).
  sp: (_w, me, e) => {
    // FALL OF SHOT (amendment 16): shooter-private — the `id` names the
    // SHOOTER and only that observer may receive it, at ANY range (a declared
    // exception: the point is one the shooter authored). Wire shape carries
    // no victim/severity field — exactly {k,id,x,y}.
    const ev = e as SplashEvent;
    expect(Object.keys(ev).sort()).toEqual(['id', 'k', 'x', 'y']);
    expect(ev.id).toBe(me.id);
  },
  hc: (_w, me, e) => {
    // HIT CALL (amendments 17/18): shooter-private, position only. The exact
    // key set IS the severity oracle: no victim id, no amount/hp, no kill
    // flag, no hull count can ride a {k,id,x,y} shape — and `id` must be the
    // OBSERVER (the shooter), never a victim reference.
    const ev = e as HitCallEvent;
    expect(Object.keys(ev).sort()).toEqual(['id', 'k', 'x', 'y']);
    expect(ev.id).toBe(me.id);
  },
  mz: (w, me, e) => {
    // MUZZLE FLASH (amendments 15/19/20; halo MOVED to 5/8 by Story 4.9,
    // amendment 119). THE HALO IS NOW OBSERVER-SCALED (Eric ruling 2026-08-16:
    // *"It scales. Intel range means your detection range on all levels gets
    // further."*) — SUPERSEDED 2026-11-12 (Story 11.2, R18): the halo is its
    // own fact, `CONFIG.vision.muzzleFlash`, the same for every observer.
    // NEVER WHITEOUT-SCALED (a flash is a light source), so a dazzled
    // observer's flash reach must NOT shrink — the oracle reads the fact bare. Still no owned-zone term,
    // plus island LOS (islands block every sensor at all ranges). The exact key
    // set is the identity oracle: {k,x,y} carries no shooter id, hue, class,
    // weapon, or heading for ANY observer.
    const ev = e as { k: 'mz'; x: number; y: number };
    expect(Object.keys(ev).sort()).toEqual(['k', 'x', 'y']);
    // Story 9.10 (amendment 167): the flash PAYS the fog toll — dist + toll
    // against the halo (the integration oracle, loose bound).
    const mzToll = fogTollOracle(w, me.state, ev);
    expect(dist(me.state, ev) + mzToll.tollMin).toBeLessThanOrEqual(CONFIG.vision.muzzleFlash + mzToll.slack);
    expect(sightClearOracle(w, me, ev)).toBe(true); // island LOS
  },
  sm: (w, me, e) => {
    // WOUNDED SMOKE (Story 4.4, amendments 40-50; reach MOVED with the
    // muzzle-flash halo to 5/8 by Story 4.9, amendment 119 — the amendment 42
    // one-constant coupling doing its job) — the FIFTH declared exception.
    // The reach is the muzzle flash's own fact (`CONFIG.vision.muzzleFlash`,
    // Story 11.2, R18 — amendment 42's one-constant coupling), read bare
    // here and deliberately NOT shared with the mz verifier
    // above, per the header's reimplementation rule. The old flat-halo rationale
    // — that a per-observer reach would leak build state through the plume —
    // holds for SUBJECT-scaling and not for OBSERVER-scaling: the watcher
    // already knows their own build, and this row still carries no identity.
    // Never whiteout-scaled, so a dazzle must NOT shrink it. No owned-zone
    // term; island LOS applies. The exact key set IS the identity oracle:
    // {k,x,y,tier} carries no ship id, hue, class, hp, or fraction for ANY
    // observer — the smoking captain and spectators included — and `tier` is the
    // two-value enum, never a number an hp could be recovered from.
    const ev = e as { k: 'sm'; x: number; y: number; tier: number };
    expect(Object.keys(ev).sort()).toEqual(['k', 'tier', 'x', 'y']);
    expect([1, 2]).toContain(ev.tier);
    // Story 9.10 (amendment 167): smoke PAYS the fog toll like the flash —
    // dist + toll against the halo (the integration oracle, loose bound).
    const smToll = fogTollOracle(w, me.state, ev);
    expect(dist(me.state, ev) + smToll.tollMin).toBeLessThanOrEqual(CONFIG.vision.muzzleFlash + smToll.slack);
    expect(sightClearOracle(w, me, ev)).toBe(true); // island LOS
  },
  fh: (w, me, e) => {
    // THE FOGHORN (Story 4.5, amendments 51-58; Story 4.9's eight-band
    // rebase, amendment 122; twelve bands since Story 9.8, ruling 129) — the SIXTH declared exception, reimplemented
    // here independently of its registry row (see hornBandOracle below —
    // never the production hornBandFor). The payload KEY SET is the anti-leak
    // oracle: {k,h,self} for the honker, {k,h,b,v} for a fogged listener —
    // and NO fogged observer's payload may EVER carry an `id`, `x`, or `y`
    // key (x/y are the spectator path's alone), nor any correlation handle
    // (amendment 45's rule verbatim). Every payload must also be JUSTIFIED by
    // a real honk this tick: a world-internal `fh` subject whose
    // independently-computed band and bearing for THIS observer match the
    // wire exactly.
    const ev = e as { k: 'fh'; h: string; self?: true; b?: number; v?: number };
    expect((HORN_IDS as readonly string[]).includes(ev.h)).toBe(true);
    for (const forbidden of ['id', 'x', 'y']) expect(Object.hasOwn(ev, forbidden)).toBe(false);
    const subjects = w.tickEvents.filter((t) => t.k === 'fh') as Array<{ k: 'fh'; h: string; x: number; y: number; id: string }>;
    if (ev.self === true) {
      expect(Object.keys(ev).sort()).toEqual(['h', 'k', 'self']);
      expect(subjects.some((s) => s.id === me.id && s.h === ev.h)).toBe(true);
      return;
    }
    expect(Object.keys(ev).sort()).toEqual(['b', 'h', 'k', 'v']);
    // 4..12, not 1..12 (twelve bands since Story 9.8, ruling 129): the
    // plateau floor means bands 1-3 never reach the wire (review fix — they
    // carry no gain or chevron-weight difference, so they were pure range
    // resolution for a modified client).
    expect([4, 5, 6, 7, 8, 9, 10, 11, 12]).toContain(ev.v);
    expect(ev.b).toBeGreaterThanOrEqual(0);
    expect(ev.b).toBeLessThan(2 * Math.PI);
    const justified = subjects.some(
      (s) =>
        s.id !== me.id &&
        s.h === ev.h &&
        hornBandOracle(w, me, s) === ev.v &&
        wrapPositive(bearing(me.state, s)) === ev.b,
    );
    expect(justified).toBe(true);
  },
  torpU: (w, me, e) => {
    // A homing-track UPDATE (Story 2.8): only a LIVE steering torpedo the
    // observer has ALREADY been revealed may re-emit, at its current pos, in
    // the constant-free ballistic shape, and only while the observer can see
    // it (owner / sight+LOS / owned zone — the reveal predicate).
    const ev = e as TorpedoUpdateEvent;
    const sh = w.shells.get(ev.id)!;
    expect(sh).toBeDefined();
    expect(sh.kind).toBe('torp');
    expect(sh.homing).toBeDefined();
    expect(Object.keys(ev).sort()).toEqual(['id', 'k', 't', 'vx', 'vy', 'x', 'y']);
    expect({ x: ev.x, y: ev.y }).toEqual({ x: sh.x, y: sh.y });
    expect(me.seenBallistics.has(ev.id)).toBe(true); // an update only ever follows a reveal
    // Updates ride the TORPEDO eye reach, matching the torp reveal —
    // corrections stop exactly where first reveal starts.
    if (sh.ownerId !== me.id) expect(projectileSeen(w, me, sh, ev) || zoneCovers(w, me, ev)).toBe(true);
  },
  spawn: (w, me, e) => {
    // Spawn point: inside the CLASS reach (`sighted` — the payload IS a
    // roster id, so the row never widens to the splash reach: Story 11.2) OR
    // inside a zone the observer OWNS (Story 1.7).
    const p = e as SpawnEvent;
    if (p.id !== me.id) expect(sighted(w, me, p) || zoneCovers(w, me, p)).toBe(true);
  },
};

function verifyEvent(w: World, me: ShipRecord, e: GameEvent): void {
  // OWN-property lookup: a leaked inherited key like 'constructor' must throw
  // "unexpected event kind leaked", never resolve an inherited Function off the
  // map's prototype. No verifier == no registry row we recognize: fail-closed,
  // exactly as the old `default: throw` did. Two ways this fires as a HARD
  // failure: a kind with no registry row at all, and — because the completeness
  // suite keeps this map and the registry in lockstep — a kind whose row exists
  // but lacks a verifier.
  if (!Object.hasOwn(EVENT_VERIFIERS, e.k)) {
    throw new Error(`unexpected event kind leaked into a frame: ${(e as GameEvent).k}`);
  }
  EVENT_VERIFIERS[e.k](w, me, e);
}

/**
 * THE VISIT LEDGER (Story 8.13, epic-8 amendment 78) — the re-reveal oracle,
 * INDEPENDENTLY REIMPLEMENTED: a test-local copy of each observer's
 * per-projectile mark, driven ONLY by the reimplemented gate (owner-always /
 * `projectileSeen` — the shell or the torpedo eye reach / `zoneCovers`) and by the
 * events the frame actually carried — never by `ShipRecord.seenBallistics`.
 * Per observer, per live projectile, per tick, in the order production
 * builds frames:
 *
 *   - a reveal was emitted  ⇒ the projectile is INSIDE the gate now AND the
 *     ledger holds no mark for it ("at most ONE reveal per boundary entry");
 *     the ledger marks it, and if it was ever revealed before, that is a
 *     RE-reveal (counted for the non-vacuity gate);
 *   - no reveal, but INSIDE  ⇒ the ledger must already hold the mark (an
 *     inside, unmarked projectile MUST reveal — a permanent mark that never
 *     clears fails here on re-entry, and a channel that silently dies fails
 *     here on first entry);
 *   - no reveal, and OUTSIDE ⇒ the mark is dropped (the per-visit clear).
 *
 * Spectator frames (unfogged, never cleared) and non-afloat observers are not
 * ledgered: their entry is dropped and the next fogged frame RE-SEEDS from
 * the gate (a respawn clears production's marks wholesale, so a seed from
 * "inside" is the only state both sides agree on). Dead projectiles leave the
 * ledger with the world.
 *
 * THE DEAD BAND (Story 9.10; wide since amendment 179's own-bank band): a
 * projectile inside the loose gate but outside the strict one may be open OR
 * closed in production, so on such a tick with no reveal production may have
 * CLEARED its mark while this ledger keeps one — the mark becomes UNSURE, and
 * a later reveal of an unsure mark is a legitimate re-entry, not a double
 * reveal. A strict-inside tick without a reveal proves production still holds
 * the mark (an unmarked inside projectile must reveal), which makes it sure
 * again; a tick outside the loose gate drops it on both sides.
 */
class VisitLedger {
  private readonly marks = new Map<string, Set<string>>();
  private readonly unsure = new Map<string, Set<string>>();
  private readonly ever = new Map<string, Set<string>>();
  reReveals = 0;

  verify(w: World, viewerId: string, f: FrameMsg): void {
    const me = w.ships.get(viewerId)!;
    if (f.spec === true || !isAfloat(me.lifecycle)) {
      this.marks.delete(viewerId);
      this.unsure.delete(viewerId);
      return;
    }
    const revealed = new Set(f.events.filter((e): e is BallisticEvent => e.k === 'shell' || e.k === 'torp').map((e) => e.id));
    const seeded = this.marks.get(viewerId);
    const marks = seeded ?? new Set<string>();
    const unsure = this.unsure.get(viewerId) ?? new Set<string>();
    const ever = this.ever.get(viewerId) ?? new Set<string>();
    for (const sh of w.shells.values()) {
      // Story 9.10: the gate is fog-tolled, so it has a dead band — a reveal
      // must be inside the LOOSE gate; an unmarked projectile MUST reveal
      // only inside the STRICT one; the band between leaves the mark UNSURE
      // (production may have cleared it — see the class comment).
      const gateAt = (bound: Bound): boolean =>
        sh.ownerId === me.id || projectileSeen(w, me, sh, sh, bound) || zoneCovers(w, me, sh);
      const insideLoose = gateAt('loose');
      if (revealed.has(sh.id)) {
        expect(insideLoose).toBe(true); // never a reveal from outside the gate
        if (seeded !== undefined && !unsure.has(sh.id)) expect(marks.has(sh.id)).toBe(false); // never twice per visit
        if (ever.has(sh.id)) this.reReveals += 1;
        marks.add(sh.id);
        unsure.delete(sh.id);
        ever.add(sh.id);
      } else if (gateAt('strict')) {
        if (seeded !== undefined) expect(marks.has(sh.id)).toBe(true); // inside + unmarked MUST reveal
        marks.add(sh.id); // (re-seed after a gap: production holds the mark)
        unsure.delete(sh.id); // ...and it proved it holds it
      } else if (!insideLoose) {
        marks.delete(sh.id); // the per-visit clear
        unsure.delete(sh.id);
      } else if (marks.has(sh.id)) {
        unsure.add(sh.id); // the dead band: production may be closed and have cleared
      }
    }
    for (const id of marks) if (!w.shells.has(id)) marks.delete(id);
    for (const id of unsure) if (!marks.has(id)) unsure.delete(id);
    this.marks.set(viewerId, marks);
    this.unsure.set(viewerId, unsure);
    this.ever.set(viewerId, ever);
  }
}

/** s — the longest flight an injected fuzz shell has left: a handful of the
 *  run's own six ticks, so some bursters land inside the run and most do not. */
const INJECT_FLIGHT_S = (20 * DT) / 1000;

/** 0.85 × 2800 u — the sampling arena the invariant's oracles were tuned on. */
const INVARIANT_ARENA_U = 2380;

/** Seat an enemy mine INSIDE THE MINE EYE REACH of the first hull standing in
 *  CLEAR water, on the first of 36 bearings × three distances (0.9 / 0.7 /
 *  0.5 of the reach) whose point the loose fog oracle hides (island LOS
 *  clear) — the mine-reach subject amendment 179 still hides. No-op when no
 *  hull, bearing or distance qualifies in this world (the other dense worlds
 *  provide). */
function seatMineBehindFog(w: World, ids: string[]): void {
  const reach = CONFIG.vision.mineSight;
  for (const id of ids) {
    const obs = w.ships.get(id)!;
    if (w.fogDensityAt(obs.state.x, obs.state.y) >= FOG_SOLID_DENSITY) continue;
    for (let k = 0; k < 36 * 3; k++) {
      const brg = (Math.floor(k / 3) / 36) * TAU;
      const d = reach * [0.9, 0.7, 0.5][k % 3];
      const q = { x: obs.state.x + Math.cos(brg) * d, y: obs.state.y + Math.sin(brg) * d };
      const { tollMin, slack } = fogTollOracle(w, obs.state, q);
      if (d + tollMin > eyeReachOracle(w, obs, reach) + slack && clearLos(obs.state, q, w.map.islands)) {
        injectMine(w, 'fogMineClear', ids.find((o) => o !== id)!, q.x, q.y);
        return;
      }
    }
  }
}

describe('perception — THE INVARIANT (random worlds, seeded)', () => {
  it('no frame ever references anything outside sight ∪ this-tick paints', () => {
    const rng = mulberry32(0x5eed_f0f0);
    COOLDOWN_SEEN.n = 0;
    CLOUD_SIGHT_THROUGH.n = 0;
    CLOUD_DELIVERED_BY_SIGHT.n = 0;
    TU_SEEN.n = 0;
    LU_SEEN.n = 0;
    OWN_MOUNTS_SEEN.n = 0;
    LANDING_GUARDED.n = 0;
    PARALLEL_PAIRS.n = 0;
    CLOUD_DELIVERED_BY_RADAR.n = 0;
    DRAFT_SEEN.n = 0;
    FOUL_ZONE_DELIVERED.n = 0;
    FOG_HID_CONTACT.n = 0;
    FOG_THIN_SEEN.n = 0;
    FOG_HID_MINE_OR_TORP.n = 0;
    FOG_HID_SM.n = 0;
    RADAR_THROUGH_FOG.n = 0;
    ARC_HULL_FAR.n = 0;
    ARC_CRATE_FAR.n = 0;
    ARC_WAKE_FAR.n = 0;
    PLAIN_SEEN.n = 0;
    PLAIN_DEMANDED.n = 0;
    let plainRevisits = 0; // Story 11.2: proves a plain hull left the band and came back under a new handle
    DROP_SIGHTED.n = 0;
    DROP_WITHHELD.n = 0;
    DROP_PAINTED.n = 0;
    DROP_BY_ZONE.n = 0;
    let wkSeen = 0; // Story 4.12: proves the wake oracle ran non-vacuously
    let fSeen = 0; // epic-10 amendment 5: proves a FLASH-tagged burst reached the oracle
    let reReveals = 0; // Story 8.13: proves the per-visit ledger saw a re-entry
    for (let world = 0; world < 20; world++) {
      const w = new World(rng.int(0, 2 ** 31 - 1), CONFIG.match.fillTo, CONFIG.zone);
      const ids: string[] = [];
      const shipCount = rng.int(3, 6);
      for (let i = 0; i < shipCount; i++) {
        const id = `p${i}`;
        ids.push(id);
        const ang = rng.float(0, TAU);
        // A FIXED sampling arena, not a fraction of the map (Story 9.1,
        // 2026-10-07): the oracles below are non-vacuous because 3–6 hulls
        // share one patch of water dense enough for radar to paint
        // each other's wakes within 6 ticks. 0.85 × the OLD 2800 u radius is
        // that density; scaling it with the 5500 u ocean spread the hulls so
        // thin that `wkSeen` read 0 across 20 worlds — a sampling artefact,
        // not a dead channel. The 10 % archipelago is still under the hulls.
        const r = rng.float(0, INVARIANT_ARENA_U);
        // Story 8.15: every seat draws a RANDOM GUN, so cannon salvos, flak
        // bursts and machine-gun streams (driven by the random `held` level
        // below) all flow through the oracle — `w` on every shell reveal,
        // one `mz` per stream shell, flak bursts over fish.
        // Story 10.4: the draw that dealt the gun now deals the SHIFT (same
        // stream position), and a SIDE stream deals the hull and scrambles
        // the turret angles, so the contact-row `tu` and the self-private
        // turret / heat pins see varied state.
        const side = mulberry32(((world + 1) * 0x85ebca6b + i) >>> 0);
        const rec = place(w, id, Math.cos(ang) * r, Math.sin(ang) * r, rng.float(0, TAU), SHIFT_IDS[rng.int(0, SHIFT_IDS.length - 1)], pickHull(side));
        scrambleTurrets(rec, side);
        rec.sweepAngle = rng.float(0, TAU); // decorrelate paint windows
        // ...and ~a third open a HUNKER window (a raw state write, like the
        // scratches below) so the self-private pin on `hunkerUntil` is
        // exercised on real frames rather than vacuous.
        if (rng.float(0, 1) < 0.3) rec.hunkerUntil = w.now + rng.float(500, 8000);
        // Random INTEL boons so the invariant is exercised at varied
        // per-observer SWEEP RATES (Story 2.8: the boon economy replaced the
        // legacy counts). Ids are stacked directly and the world-side cache
        // recomputed the way World does (effectiveStats over resolved defs);
        // the CHECKS recompute ranges independently from the raw id list
        // (effSight/effRadar).
        const intel: string[] = [];
        // ONE intel line left: SWEEP RATE. The 2026-08-20 deletion of INTEL
        // RANGE removed the only card that could widen a per-observer RADIUS,
        // so the fuzz no longer varies radii — every observer runs the base
        // ladder and the invariant is exercised across rpm instead.
        for (let n = rng.int(0, 5); n > 0; n--) intel.push('intel'); // up the rpm ladder (uncapped since Story 10.7, R6)
        rec.cards = intel;
        rec.cards = [...intel];
        rec.stats = effectiveStats(rec.cls, rec.cards);
        scrambleMounts(rec, side); // Story 10.6: launchers / racks off the side stream
        // ...and ~half hold EXHAUSTED-HULL BONUS POINTS (Story 10.7, R5) off the
        // side stream, so the `ib` self-privacy pin sees non-empty records.
        // ARMOR / POWER / INTEL: no oracle reads the first two, and INTEL only
        // moves the sweep RATE — which the oracles read off the World-stepped
        // [prevSweepAngle, sweepAngle) window, never re-derive — so INTEL
        // points (uncapped since Story 10.7, R6) are fuzzed too, past the old
        // 30-RPM ceiling with five cards on. RANGE stays out: it moves a reach.
        if (side.next() < 0.5) {
          rec.indexBonus.armor = side.int(1, 4);
          rec.indexBonus.power = side.int(0, 3);
          rec.indexBonus.intel = side.int(0, 40);
          rec.stats = effectiveStats(rec.cls, rec.cards, CATALOG, rec.indexBonus);
        }
        // RADAR WAKES (Story 4.12): guarantee the wk oracle is EXERCISED, not
        // vacuous — most hulls start with a laid track ending at their stern
        // (raw ring injection, ages spread across the 12s life so all four
        // buckets fuzz), on a random bearing so segments land inside and
        // outside sight, the annulus, paint windows, and terrain shadow.
        if (rng.float(0, 1) < 0.7) {
          injectWakeTrack(rec.wake, rec.state.x, rec.state.y, rng.float(0, TAU), rng.int(3, 24), w.now, 11_000);
        }
      }
      // A GUARANTEED NEIGHBOUR (Story 8.18 / 9.3): the random ring above seats
      // hulls kilometres apart, so two hulls inside one sight bubble were rare
      // and the cloud arm could pass vacuously. One extra hull per world
      // sits 260–320 u off ids[0] on a random bearing — inside sight, in the
      // clear — and most of the clouds below are seated on THAT segment.
      {
        const anchor = w.ships.get(ids[0])!.state;
        const brg = rng.float(0, TAU);
        const d = rng.float(260, 320);
        const side = mulberry32(((world + 1) * 0x27d4eb2f) >>> 0);
        const rec = place(w, 'pn', anchor.x + Math.cos(brg) * d, anchor.y + Math.sin(brg) * d, rng.float(0, TAU), SHIFT_IDS[rng.int(0, SHIFT_IDS.length - 1)], pickHull(side));
        scrambleTurrets(rec, side);
        rec.sweepAngle = rng.float(0, TAU);
        ids.push('pn');
        // ...and the cloud arrangements the random ring never produces on its
        // own (Story 9.3 session 2 — they now prove a cloud hides NOTHING):
        //   • EVEN worlds: a FRESH cloud at the MIDPOINT of anchor→pn (both
        //     hulls INSIDE its 200 u disc) and the anchor's beam parked just
        //     short of pn's bearing — pn must stay a full contact
        //     (CLOUD_SIGHT_THROUGH). The cloud's OWNER alternates: the anchor
        //     itself in every fourth world, otherwise ids[1];
        //   • ODD worlds: a close neighbour 'pq' 40–80 u off the anchor and a
        //     cloud of random age centred ON the anchor (an observer standing
        //     in a cloud, whoever owns it), the anchor's beam parked short of
        //     pq's bearing.
        const anchorRec = w.ships.get(ids[0])!;
        const owner = world % 4 === 0 || world % 4 === 1 ? ids[0] : ids[1];
        if (world % 2 === 0) {
          const pn = rec.state;
          injectCloud(w, 'straddle', owner, (anchor.x + pn.x) / 2, (anchor.y + pn.y) / 2, w.now);
          anchorRec.sweepAngle = wrapPositive(bearing(anchor, pn) - 0.01);
          anchorRec.prevSweepAngle = anchorRec.sweepAngle;
        } else {
          const qb = rng.float(0, TAU);
          const qd = rng.float(40, 80);
          const pq = place(w, 'pq', anchor.x + Math.cos(qb) * qd, anchor.y + Math.sin(qb) * qd, rng.float(0, TAU), SHIFT_IDS[rng.int(0, SHIFT_IDS.length - 1)], pickHull(side));
          scrambleTurrets(pq, side);
          pq.sweepAngle = rng.float(0, TAU);
          ids.push('pq');
          injectCloud(w, 'onAnchor', owner, anchor.x, anchor.y, w.now - rng.float(0, 12_000));
          anchorRec.sweepAngle = wrapPositive(bearing(anchor, pq.state) - 0.01);
          anchorRec.prevSweepAngle = anchorRec.sweepAngle;
        }
      }
      // THE FOG FIELD (Story 9.10) — PINNED per world through the World's
      // test-only seam (production's one writer is the controller, which
      // needs a live zone): the cut is the shared quantile over a lattice of
      // the arena for a coverage of ~30 % in worlds ≡ 0 mod 3 (dense enough
      // that rays inside sight routinely pay their way out — FOG_HID_CONTACT,
      // FOG_HID_SM, FOG_HID_MINE_OR_TORP), ~5 % in worlds ≡ 1 (thin fog most
      // rays graze and still see through — FOG_THIN_SEEN) and NONE in worlds
      // ≡ 2 (the exact pre-fog oracles). An enemy mine 0.8 of the way from
      // the anchor to pn rides the dense worlds so the detect rung has a
      // subject inside geometric detect that the toll can hide — and, since
      // amendment 179 (an observer in a bank is no longer hidden from a mine
      // in its OWN bank), a second enemy mine seated BEHIND FOG FROM CLEAR
      // WATER: the first hull standing in clear water, the first of 36
      // bearings whose 240 u point the loose oracle hides, so the detect-rung
      // ledger (FOG_HID_MINE_OR_TORP) keeps a subject the rule still hides.
      {
        const share = [0.3, 0.05, 0][world % 3];
        const lattice = fogLattice(0, 0, INVARIANT_ARENA_U, CONFIG.fog.quantileLattice);
        w.setFogCutForTest(fogCutForTarget(w.fogFieldForTest(), w.now, lattice, share));
        if (world % 3 === 0) {
          const a = w.ships.get(ids[0])!.state;
          const p = w.ships.get('pn')!.state;
          injectMine(w, 'fogMine', 'pn', a.x + (p.x - a.x) * 0.8, a.y + (p.y - a.y) * 0.8);
          seatMineBehindFog(w, ids);
        }
      }
      // WOUNDED SMOKE (Story 4.4): guarantee the sm oracle is EXERCISED, not
      // vacuous — two hulls start wounded, one in each band, so every world
      // emits `sm` pulses on the cadence. Delivery is guaranteed at minimum to
      // the smoking captain itself (dist 0 passes the constant halo trivially
      // — amendment 46: own smoke rides the same row), so the verifier always
      // runs against real frames. The random scratches below (the heal-spend
      // block) rarely cross a band on their own.
      w.ships.get(ids[0])!.hp = w.ships.get(ids[0])!.stats.maxHp * 0.4; // tier 1 band
      w.ships.get(ids[1])!.hp = w.ships.get(ids[1])!.stats.maxHp * 0.2; // tier 2 band
      for (let s = 0; s < rng.int(0, 5); s++) {
        const ang = rng.float(0, TAU);
        const r = rng.float(0, w.map.radius * 0.9);
        injectShell(
          w,
          `inj${s}`,
          ids[rng.int(0, ids.length - 1)],
          Math.cos(ang) * r,
          Math.sin(ang) * r,
          rng.float(0, TAU),
          // A flight of up to INJECT_FLIGHT_S at the gun's shell speed (the
          // draw's upper bound was the radar reach until Story 11.2 moved
          // radar to 400 hm — a shell with that far to go never lands inside
          // the 6-tick run, and the burst / flash oracles went vacuous).
          rng.float(20, CONFIG.gun.shellSpeed * INJECT_FLIGHT_S),
          rng.float(0, 1) < 0.5, // half the shells are targeted bursters (real gun shape)
        );
        // FLASH tag (epic-10 amendment 5): every odd targeted burster carries
        // the server-internal flash tag, so the burst oracle sees flagged
        // bursts (`f` present, LAST) beside bare ones. Off the slot parity —
        // the shared `rng`, and every scenario it draws, is unmoved.
        const injected = w.shells.get(`inj${s}`)!;
        if (s % 2 === 1 && injected.targetX !== null) injected.flash = { radius: CONFIG.flashShells.radius, durationMs: FLASH_WINDOW_MS };
      }
      for (let s = 0; s < rng.int(0, 4); s++) {
        const ang = rng.float(0, TAU);
        const r = rng.float(0, w.map.radius * 0.9);
        injectMine(w, `mine${s}`, ids[rng.int(0, ids.length - 1)], Math.cos(ang) * r, Math.sin(ang) * r);
      }
      // Random lit zones (Story 1.7) so the invariant exercises the owned-zone
      // reveal source AND the radar-gated litZones channel in the same frames.
      for (let z = 0; z < rng.int(0, 3); z++) {
        const ang = rng.float(0, TAU);
        const r = rng.float(0, w.map.radius * 0.9);
        injectZone(w, `zone${z}`, ids[rng.int(0, ids.length - 1)], Math.cos(ang) * r, Math.sin(ang) * r);
      }
      // Random PHOSPHOR burning zones (Story 8.17) — some seated right on a
      // hull so the burn AND the no-reveal rule are both exercised: the
      // oracle's contact source is sight ∪ OWNED LIT zones only, so a hull
      // standing in its enemy's (or its own) fire outside sight must stay dark
      // (amendment 135(e)), while the radar-gated `burnZones` circle rides.
      for (let z = 0; z < rng.int(0, 3); z++) {
        const onHull = rng.float(0, 1) < 0.5 ? w.ships.get(ids[rng.int(0, ids.length - 1)])!.state : null;
        const ang = rng.float(0, TAU);
        const r = rng.float(0, w.map.radius * 0.9);
        injectBurnZone(
          w,
          `burn${z}`,
          ids[rng.int(0, ids.length - 1)],
          onHull ? onHull.x + rng.float(-30, 30) : Math.cos(ang) * r,
          onHull ? onHull.y + rng.float(-30, 30) : Math.sin(ang) * r,
          CONFIG.phosphorShells.zoneRadius * rng.float(1, 1.4641),
          w.now + rng.float(DT, 12_000),
          rng.float(5, 10),
        );
      }
      // RNG-STREAM PRESERVATION (Story 11.2): the retired sight-shrink seam
      // drew here (a coin per hull, a lapse time for a quarter of them). The
      // same draws are burned so every later fuzz geometry is unmoved; the
      // collapsed gates now come from real FLASH marks (the dazzle stream
      // below, and `flashAll` after tick 2).
      for (let i = 0; i < ids.length; i++) {
        if (rng.float(0, 1) < 0.25) rng.float(DT, 10_000);
      }
      // Random FOULING SHELL foul zones (Story 9.4) — on their OWN stream so
      // every draw above and below is untouched (the cloud seeding's idiom):
      // some seated right on a hull, so the radar-gated `foulZones` circle
      // rides while the no-reveal rule holds (a hull standing in a foul zone
      // outside sight stays dark — amendment 63).
      const frng = mulberry32(0xf0a1_0000 + world);
      for (let z = 0; z < frng.int(0, 3); z++) {
        const onHull = frng.float(0, 1) < 0.5 ? w.ships.get(ids[frng.int(0, ids.length - 1)])!.state : null;
        const ang = frng.float(0, TAU);
        const r = frng.float(0, w.map.radius * 0.9);
        injectFoulZone(
          w,
          `foul${z}`,
          ids[frng.int(0, ids.length - 1)],
          onHull ? onHull.x + frng.float(-60, 60) : Math.cos(ang) * r,
          onHull ? onHull.y + frng.float(-60, 60) : Math.sin(ang) * r,
          CONFIG.foulingShell.radius * frng.float(0.5, 1.5),
          w.now + frng.float(DT, 12_000),
        );
      }
      // RNG-STREAM PRESERVATION (Story 9.2): the retired CHAFF seeding drew
      // from `rng` here (a coin per hull, six draws per seated cloud, one
      // more for 'pn''s own cloud). The same draws are burned so every later
      // fuzz geometry — and the non-vacuity ledgers tuned on it — is
      // unchanged; nothing is seeded from them.
      for (let i = 0; i < ids.length; i++) {
        if (rng.float(0, 1) >= 0.5) continue;
        for (let k = 0; k < 6; k++) rng.next();
      }
      rng.next();
      // (The Story 8.16 DECOYS left with the buoys in Story 10.5. Their draws
      // are BURNED here, unchanged in count, so the shared stream — and every
      // scenario drawn below — is unmoved.)
      for (let di = 0; di < rng.int(1, 3); di++) {
        rng.int(0, ids.length - 1);
        rng.int(0, ids.length - 1);
        rng.float(0.02, 0.4);
        if (rng.float(0, 1) < 0.7) rng.float(SIGHT + 10, RADAR - 10);
        else rng.float(0, RADAR * 1.5);
        rng.float(1, 2);
      }
      // DAZZLE MARKS (Story 10.9) — on their OWN stream so every draw above and
      // below is untouched (the foul-zone idiom): ~a fifth of the hulls carry
      // a live FLASH SHELLS dazzle mark (the shared effectiveSight collapses
      // their sight on top of the shrink seam). (The RADAR BUOYS this stream
      // also laid left with Story 10.5.)
      const brng = mulberry32(0xb0e1_0000 + world);
      for (const id of ids) {
        const owner = w.ships.get(id)!;
        // The retired RADAR BUOY draws are BURNED, unchanged in count, so the
        // dazzle marks land where they always did.
        for (let k = 0; k < brng.int(0, 3); k++) {
          brng.int(0, ids.length - 1);
          brng.float(0, 1);
          brng.float(0, TAU);
          brng.float(0, 1);
          brng.float(0, 1);
        }
        if (brng.float(0, 1) < 0.2) owner.dazzledUntil = w.now + brng.float(DT, FLASH_WINDOW_MS); // anywhere in the whiteout: white, or a clear circle of any size
      }
      // COUNTERMEASURE CLOUDS (Story 9.3): 1–4 live clouds of RANDOM age (a
      // fresh 200 u disc to a nearly-expired 500 u one), each owned by a
      // RANDOM hull, seated where hiding WOULD show if any gate still read a
      // cloud: most STRADDLE the segment between two hulls (a random point
      // along it), some sit ON an observer, the rest anywhere on the water.
      // The FIRST cloud of every world is OLD (13–14.5 s — the draw is kept
      // so the stream is unchanged). A raw store write, like injectMine;
      // production makes them at the pressing hull's centre.
      for (let sp = 0; sp < rng.int(1, 4); sp++) {
        const roll = rng.float(0, 1);
        // Half the pairs are the guaranteed in-sight pair (ids[0] ↔ 'pn').
        const pairNear = rng.float(0, 1) < 0.5;
        const a = w.ships.get(pairNear ? ids[0] : ids[rng.int(0, ids.length - 1)])!.state;
        const b = w.ships.get(pairNear ? 'pn' : ids[rng.int(0, ids.length - 1)])!.state;
        let px: number;
        let py: number;
        if (roll < 0.55) {
          const t = rng.float(0.1, 0.9);
          px = a.x + (b.x - a.x) * t + rng.float(-25, 25);
          py = a.y + (b.y - a.y) * t + rng.float(-25, 25);
        } else if (roll < 0.8) {
          px = a.x + rng.float(-15, 15);
          py = a.y + rng.float(-15, 15);
        } else {
          const ang = rng.float(0, TAU);
          const r = rng.float(0, w.map.radius * 0.9);
          px = Math.cos(ang) * r;
          py = Math.sin(ang) * r;
        }
        const bornAt = w.now - (sp === 0 ? rng.float(13_000, 14_500) : rng.float(0, 14_900));
        injectCloud(w, `cloud${world}_${sp}`, ids[rng.int(0, ids.length - 1)], px, py, bornAt);
      }
      // THE RADAR-DETECTED CLOUD (amendment 51, 2026-10-12): one young cloud
      // per world whose disc lies wholly BEYOND ids[0]'s sight (centre
      // sight + 240 … sight + 440 out, radius ≤ 230 u at ≤ 1.5 s, so the
      // nearest point is past sight — re-based on the twelfths ladder, Story
      // 9.8) and whose nearest point is inside its radar range,
      // centred just ahead of its beam so the sweep crosses its bearing span
      // — the radar-only delivery arm (CLOUD_DELIVERED_BY_RADAR) is
      // exercised, not vacuous. Drawn from its OWN stream so the main `rng`
      // sequence (and every ledger tuned on it) is untouched.
      {
        const crng = mulberry32(0xc10d_0000 + world);
        const obs = w.ships.get(ids[0])!;
        const brg = obs.sweepAngle + crng.float(1, 3) * SWEEP_DELTA;
        const d = crng.float(SIGHT + 240, SIGHT + 440);
        const owner = ids[1 + crng.int(0, ids.length - 2)];
        injectCloud(w, `radarCloud${world}`, owner, obs.state.x + Math.cos(brg) * d, obs.state.y + Math.sin(brg) * d, w.now - crng.float(0, 1_500));
      }
      // THE COOLDOWN ABILITIES (Story 10.5 — the seat the SHIELD BLOCK stamp
      // held, the same two draws): ~a third of the hulls carry a running HULL
      // REPAIR / SMOKE cooldown — some cooling, some lapsed — so the
      // self-private pin (verifyOwnWindows: own `you` only, never another
      // observer's frame, never a spectator's) runs on real frames in both
      // directions. The fuzz's own presses stamp them for real as well.
      for (const id of ids) {
        if (rng.float(0, 1) >= 0.33) continue;
        const s = w.ships.get(id)!;
        rng.next(); // the retired shield-hp draw, burned so the stream is unmoved
        s.repairReadyAt = w.now + rng.float(-400, 8000);
        s.smokeReadyAt = s.repairReadyAt;
      }
      // Synthetic TORPEDO ribbons (Story 4.12, amendment 196): half-life
      // (6000ms) one-cell (9u) water keyed into the live torpWakes store — the
      // wake scan treats torpedo water exactly as ship water, and the fuzz
      // must prove the oracle holds for it (the fish entity itself is covered
      // by the untouched torp/torpU rows).
      for (let t = 0; t < rng.int(0, 2); t++) {
        const cap = 40;
        const tw: WakeRibbon = { xs: new Float64Array(cap), ys: new Float64Array(cap), ts: new Float64Array(cap), cap, head: 0, count: 0, lifeMs: 2_750, widthU: 9, torp: true, hullAheadU: 0 };
        const ang = rng.float(0, TAU);
        const rr = rng.float(0, w.map.radius * 0.9);
        injectWakeTrack(tw, Math.cos(ang) * rr, Math.sin(ang) * rr, rng.float(0, TAU), rng.int(2, 12), w.now, 5_000);
        w.torpWakes.set(`tw${t}`, tw);
      }
      // THE AIRDROPS (Story 10.9, R3) — on their OWN stream so every draw
      // above is untouched (the foul-zone idiom). A raw store write, like
      // injectMine (production places them through the spawner). Four crates
      // a world, seated so every drop arm runs non-vacuously:
      //   • `dropNear`: 60–200 u off ids[0] — inside its detect rung and its
      //     radar, so it is SIGHTED (and painted when the beam crosses it);
      //   • `dropRadar`: between sight and radar range off ids[1], 1–3 beam
      //     steps ahead of its parked beam — painted (an anonymous disc rect)
      //     within the run, never sighted by it;
      //   • `dropFar`: anywhere on the water — withheld from almost everyone;
      //     is a WRECK crate (kind `'wreck'`) so `c` is exercised on both kinds;
      //   • `dropLit`: 20–40 u off `zone0`'s centre when the world laid one —
      //     the zone's owner sees it by the lit zone ALONE when the zone is
      //     beyond its detect rung (the DROP_BY_ZONE arm).
      {
        const drng = mulberry32(0xd90b_0000 + world);
        const roll = (): IndexId => CONFIG.drops.indices[drng.int(0, CONFIG.drops.indices.length - 1)];
        const seat = (id: string, x: number, y: number, kind: DropKind): void => {
          w.drops.set(id, { id, x: Math.fround(x), y: Math.fround(y), kind });
        };
        const a = w.ships.get(ids[0])!.state;
        const ab = drng.float(0, TAU);
        const ad = drng.float(60, 200);
        seat(`dropNear${world}`, a.x + Math.cos(ab) * ad, a.y + Math.sin(ab) * ad, roll());
        const b = w.ships.get(ids[1])!;
        const bb = b.sweepAngle + drng.float(1, 3) * SWEEP_DELTA;
        const bd = drng.float(SIGHT + 100, RADAR - 100);
        seat(`dropRadar${world}`, b.state.x + Math.cos(bb) * bd, b.state.y + Math.sin(bb) * bd, roll());
        const fb = drng.float(0, TAU);
        const fd = drng.float(0, w.map.radius * 0.9);
        seat(`dropFar${world}`, Math.cos(fb) * fd, Math.sin(fb) * fd, 'wreck');
        const zone = w.litZones.get('zone0');
        if (zone !== undefined) {
          const zb = drng.float(0, TAU);
          const zd = drng.float(20, 40);
          seat(`dropLit${world}`, zone.x + Math.cos(zb) * zd, zone.y + Math.sin(zb) * zd, roll());
        }
      }
      // THE PLAIN-BAND HULL (Story 11.2, R3): the arena above seats every hull
      // within one class-and-name reach of most others, so the OUTER tier
      // would pass vacuously. One extra hull per world, 'pp', sits in ids[0]'s
      // PLAIN BAND — beyond its class reach, inside its hull reach — on the
      // bearing from ids[0] through the map centre, so it is on the water and
      // most of the arena's hulls see it across the band too. It is an
      // observer as well. Seated and driven on its OWN stream, and kept out
      // of `ids`, so every draw of the shared `rng` is untouched.
      const prng = mulberry32(0x91a1_0000 + world);
      {
        const anchor = w.ships.get(ids[0])!.state;
        const brg = anchor.x === 0 && anchor.y === 0 ? prng.float(0, TAU) : Math.atan2(-anchor.y, -anchor.x);
        const d = prng.float(SIGHT + 100, SIGHT + 400);
        const pp = place(w, 'pp', anchor.x + Math.cos(brg) * d, anchor.y + Math.sin(brg) * d, prng.float(0, TAU), SHIFT_IDS[prng.int(0, SHIFT_IDS.length - 1)], pickHull(prng));
        scrambleTurrets(pp, prng);
        pp.sweepAngle = prng.float(0, TAU);
      }
      const observers = [...ids, 'pp'];
      const ledger = new VisitLedger();
      const plainLedger = new PlainLedger();
      for (let tick = 1; tick <= 6; tick++) {
        w.submitInput('pp', {
          seq: tick, throttle: prng.float(-1, 1), rudder: prng.float(-1, 1), aim: prng.float(-Math.PI, Math.PI),
          fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false,
        });
        for (const id of ids) {
          w.submitInput(id, {
            seq: tick,
            throttle: rng.float(-1, 1),
            rudder: rng.float(-1, 1),
            aim: rng.float(-Math.PI, Math.PI),
            fireSeq: rng.float(0, 1) < 0.4 ? tick : 0, // ~40% of ticks land a fresh click
            aimDist: rng.float(0, 900),
            fireT: 0,
            // Half the clicks target the torpedo slot with a RANDOM aim, so the
            // invariant worlds exercise the out-of-arc / cooling / no-ammo
            // denials alongside genuine launches — verifyDenied proves every
            // one is owner-only with a legal reason. NOTE: these worlds place
            // only default-hull torpedo boats (place → addShip), so the 'blocked'
            // reason (mineLayer stern-drop obstruction) is structurally
            // unreachable HERE; its owner-only privacy is pinned by the directed
            // tests in denials.test.ts, not by this fuzz.
            slot: rng.float(0, 1) < 0.5 ? 1 : 0,
            // ~30% of ticks also press SMOKE (Story 10.5 — the press names its
            // ability; HULL REPAIR is pressed by the patient below): repeated
            // presses run the cooldown into `cooling` denials, every one
            // verified owner-only, and stamp real `smokeReadyAt`s. (The Shift
            // is not pressed here: the old slot-2 press was inert, and a boost
            // would re-lay every world's geometry.)
            actSeq: rng.float(0, 1) < 0.3 ? tick : 0,
            act: abilityCode('smoke'),
            // THE FOGHORN (Story 4.5): every ship honks on tick 1 (the fh
            // oracle is EXERCISED, never vacuous — the honker's own self
            // payload is guaranteed, and cross-ship deliveries land at random
            // distances/LOS so all three tiers and the island muffle get
            // fuzzed), plus ~30% random later presses (which the 1500ms
            // cooldown consumes and drops inside this 300ms run — the
            // stale/early-press path is fuzzed too).
            hornSeq: tick === 1 || rng.float(0, 1) < 0.3 ? tick : 0,
            // THE HELD LEVEL (Story 8.15): ~half of every ship's ticks hold
            // fire, so a machine-gun seat streams (one direct shell per rateMs
            // at `now`, its own `mz` each) and every other seat ignores it.
            // ...and since Story 10.4 the SAME level drives the SECONDARIES
            // (`sec` — no extra draw, so the shared stream is unmoved): every
            // captain streams secondaries rounds (one `mz` each) through the
            // oracle on ~half its ticks.
            ...bothLevels(rng.float(0, 1) < 0.5),
          });
        }
        // HULL REPAIR (the `C` ability since Story 10.5): ~25% of ticks a
        // random hull takes a scratch, so the presses above (a third of them
        // HULL REPAIR) land REAL heals — the self-private `heal` row and the
        // repairHp / repairReadyAt pins are exercised rather than vacuous.
        if (rng.float(0, 1) < 0.25) {
          const patient = w.ships.get(ids[rng.int(0, ids.length - 1)])!;
          patient.hp = Math.max(1, patient.hp - rng.float(10, 60));
          // ...and PRESSES HULL REPAIR through the real input path (a later seq
          // this tick, unless its own input already pressed an ability). A full or cooling hull is refused; both are legal states.
          const first = w.inputs.get(patient.id)!;
          if (first.actSeq !== tick) w.submitInput(patient.id, { ...first, seq: tick + 0.5, actSeq: tick, act: abilityCode('repair') });
        }
        w.step();
        // THE WAKE-DRAFT LIFT (Story 8.19) must be EXERCISED on the wire, not
        // only its omitted-at-0 arm: these short fuzz runs rarely sail one
        // hull along another's water, so on odd ticks ids[0]'s stamp is
        // planted AFTER the step (a non-round double, no rng draw — every
        // other oracle keeps its stream) and verifyFrame must find it in that
        // observer's own `you`, exactly, and nowhere else. The next stepShips
        // restamps it from the water, so the sim itself never sees the plant.
        const rider = w.ships.get(ids[0])!;
        if (tick % 2 === 1 && isAfloat(rider.lifecycle)) rider.draft = CONFIG.wake.draft.lift * 0.6180339887;
        // A FAR PUFF BEHIND THE WEATHER (Story 11.2): the mz / sm halo is 350 hm
        // now, so a puff the toll can push out of it needs a long ray through
        // fog — which the arena's own wounded hulls (a few hundred u from
        // their watchers) never give. In the DENSE worlds one synthetic `sm`
        // a tick is planted 0.85 of the halo from ids[0], across the ocean on
        // the bearing through the map centre (the emitWorldEvent posture: the
        // world's own tick-event buffer, no rng draw), so FOG_HID_SM has a
        // subject; verifyFrame's halo oracle judges it like any real puff.
        if (world % 3 === 0) {
          const o = w.ships.get(ids[0])!.state;
          const brg = Math.atan2(-o.y, -o.x);
          const d = CONFIG.vision.muzzleFlash * 0.85;
          emitWorldEvent(w, { k: 'sm', x: o.x + Math.cos(brg) * d, y: o.y + Math.sin(brg) * d, tier: 1 });
        }
        // Build each observer's frame exactly once per tick (wire semantics).
        for (const id of observers) {
          const f = buildFrame(w, id);
          wkSeen += f.events.filter((e) => e.k === 'wk').length;
          fSeen += f.events.filter((e) => e.k === 'burst' && 'f' in e).length;
          verifyFrame(w, id, f);
          ledger.verify(w, id, f);
          plainLedger.verify(w, id, f, tick);
        }
        // THE PER-VISIT MARKS must be EXERCISED, not vacuous — the ballistic
        // reveal's (Story 8.13, amendment 78) and the plain hull's handle
        // (Story 11.2): after tick 2's frames EVERY hull is FLASHED (a fresh
        // mark — the whiteout holds every eye reach at 0 through ticks 3-4, so
        // every projectile and every plain hull LEAVES its gate), and after
        // tick 4's the marks are lifted, so on tick 5 whatever is still live
        // and still inside RE-ENTERS — a projectile must be revealed again,
        // a plain hull must come back under a NEW handle. A gate exit, not a
        // teleport, so every other oracle stays on the same footing. Raw
        // state writes (no rng draw). (HISTORY: Story 9.4 – 11.1 did this
        // with a synthetic `sightRange` write.)
        if (tick === 2) for (const id of observers) w.ships.get(id)!.dazzledUntil = w.now + FLASH_WINDOW_MS;
        if (tick === 4) for (const id of observers) w.ships.get(id)!.dazzledUntil = 0;
      }
      reReveals += ledger.reReveals;
      plainRevisits += plainLedger.revisits;
    }
    // The ledger values, under the perf pins' opt-in flag (the HC_PERF_LOG
    // idiom) — so a re-lay of the fuzz geometry can be checked for how far
    // above zero each arm actually sits, not only that it cleared the bar.
    if (process.env.HC_PERF_LOG) {
      console.log(
        `perception fuzz ledgers: CLOUD_SIGHT_THROUGH ${CLOUD_SIGHT_THROUGH.n} | ` +
          `CLOUD_DELIVERED_BY_SIGHT ${CLOUD_DELIVERED_BY_SIGHT.n} | CLOUD_DELIVERED_BY_RADAR ${CLOUD_DELIVERED_BY_RADAR.n} | ` +
          `COOLDOWN_SEEN ${COOLDOWN_SEEN.n} | ` +
          `DRAFT_SEEN ${DRAFT_SEEN.n} | FOUL_ZONE_DELIVERED ${FOUL_ZONE_DELIVERED.n} | wk ${wkSeen} | reReveals ${reReveals} | ` +
          `PLAIN_SEEN ${PLAIN_SEEN.n} PLAIN_DEMANDED ${PLAIN_DEMANDED.n} plainRevisits ${plainRevisits} | ` +
          `FOG_HID_CONTACT ${FOG_HID_CONTACT.n} | FOG_THIN_SEEN ${FOG_THIN_SEEN.n} | FOG_HID_MINE_OR_TORP ${FOG_HID_MINE_OR_TORP.n} | ` +
          `FOG_HID_SM ${FOG_HID_SM.n} | RADAR_THROUGH_FOG ${RADAR_THROUGH_FOG.n}`,
      );
    }
    // The CLOUD arms must have been EXERCISED (Story 9.3, the same vacuity
    // rule): across 20 worlds × 6 ticks with clouds seated on hull-to-hull
    // segments, the ledger must have met in-sight, island-clear hulls whose
    // line ran through a cloud's disc (verifyFrame proved each PRESENT — a
    // cloud hides nothing), and the cloud CHANNEL must have delivered by each
    // sensor alone.
    expect(CLOUD_SIGHT_THROUGH.n).toBeGreaterThan(0);
    expect(CLOUD_DELIVERED_BY_SIGHT.n).toBeGreaterThan(0);
    expect(TU_SEEN.n).toBeGreaterThan(0); // Story 10.4: the `tu` pin was exercised
    expect(LU_SEEN.n).toBeGreaterThan(0); // Story 10.6: the `lu` pin was exercised
    expect(OWN_MOUNTS_SEEN.n).toBeGreaterThan(0); // ...and the own launchers / racks pin
    expect(LANDING_GUARDED.n).toBeGreaterThan(0); // Story 11.1: in-flight dispersed landings were checked absent
    expect(PARALLEL_PAIRS.n).toBeGreaterThan(0); // Story 11.1 review fix: salvo reveals were checked parallel
    expect(CLOUD_DELIVERED_BY_RADAR.n).toBeGreaterThan(0);
    // ...and the wake-draft clause saw a POSITIVE `you.draft` at least once
    // (Story 8.19 — the value is PLANTED on ids[0] on odd ticks, above), so
    // its present-and-exact arm ran, not only the omitted-at-0 one.
    expect(DRAFT_SEEN.n).toBeGreaterThan(0);
    // The wake oracle must have been EXERCISED (amendment 40's vacuity rule):
    // with 70% of hulls pre-laid with tracks across 20 worlds × 6 ticks, zero
    // disclosed segments would mean the channel silently died.
    expect(wkSeen).toBeGreaterThan(0);
    // ...and so must the FLASH tag: at least one flagged burst was verified.
    expect(fSeen).toBeGreaterThan(0);
    // ...and so must the re-reveal: zero second reveals across 20 shrunk
    // worlds would mean the per-visit mark silently reverted to permanent.
    expect(reReveals).toBeGreaterThan(0);
    // THE OUTER SIGHT TIER (Story 11.2) must have been EXERCISED: plain rows
    // verified, hulls the strict band demanded and found, and a hull that
    // left the band and came back under a fresh handle.
    expect(PLAIN_SEEN.n).toBeGreaterThan(0);
    expect(PLAIN_DEMANDED.n).toBeGreaterThan(0);
    expect(plainRevisits).toBeGreaterThan(0);
    // ...and the FOUL ZONE channel (Story 9.4) must have delivered to a
    // NON-owner at least once — the radar-range clause ran, not only the
    // owner clause.
    expect(FOUL_ZONE_DELIVERED.n).toBeGreaterThan(0);
    // ...and the Story 10.5 cooldown pin: a cooling HULL REPAIR / SMOKE rode
    // a real own frame (and, by verifyOwnWindows, no other).
    expect(COOLDOWN_SEEN.n).toBeGreaterThan(0);
    // THE AIRDROP ARMS (Story 10.9) must each have been EXERCISED: a crate
    // delivered by sight to a fogged observer, one withheld (the gate's false
    // arm), one painted on radar as an attributed anonymous disc rect, and
    // one delivered by an OWNED lit zone alone, outside the detect rung.
    expect(DROP_SIGHTED.n).toBeGreaterThan(0);
    expect(DROP_WITHHELD.n).toBeGreaterThan(0);
    expect(DROP_PAINTED.n).toBeGreaterThan(0);
    expect(DROP_BY_ZONE.n).toBeGreaterThan(0);
    // THE FOG ARMS (Story 9.10) must each have been EXERCISED: a hull inside
    // geometric sight hidden by toll (verified absent), a hull seen through
    // thin fog, a detect-rung subject hidden, an `sm` hidden inside the halo,
    // and a radar return painted through fog exactly as the fog-blind oracle
    // says.
    expect(FOG_HID_CONTACT.n).toBeGreaterThan(0);
    expect(FOG_THIN_SEEN.n).toBeGreaterThan(0);
    expect(FOG_HID_MINE_OR_TORP.n).toBeGreaterThan(0);
    expect(FOG_HID_SM.n).toBeGreaterThan(0);
    expect(RADAR_THROUGH_FOG.n).toBeGreaterThan(0);
    // THE ARC LINE (Story 11.3) was exercised far out, where the beam is
    // many cells wide, for every paint source the battery produces.
    if (process.env.HC_PERF_LOG) console.log(`arc ledgers: hull ${ARC_HULL_FAR.n} | crate ${ARC_CRATE_FAR.n} | wake ${ARC_WAKE_FAR.n}`);
    expect(ARC_HULL_FAR.n).toBeGreaterThan(0);
    expect(ARC_CRATE_FAR.n).toBeGreaterThan(0);
    expect(ARC_WAKE_FAR.n).toBeGreaterThan(0);
  });
});

// (THE RADAR DROPOUT'S TWO DIRECTED SUITES — "the radar dropout, end to end"
// and "a cloud pass across the sweep wrap is one dropout decision", Story 9.8
// — were DELETED 2026-11-12 with the dropout itself: Story 11.2, R8. A
// ruling, recorded in the epic-11 amendments; nothing replaces them until
// Story 11.4's strength model.)

describe('perception — a countermeasure cloud hides nothing (Story 9.3 session 2, Eric 2026-10-12)', () => {
  it('a fresh cloud between two hulls 150 u apart hides neither from the other', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 150, 0);
    injectCloud(w, 'mid', 'a', 75, 0);
    for (const [me, other] of [['a', 'b'], ['b', 'a']]) {
      const f = buildFrame(w, me);
      verifyFrame(w, me, f);
      expect(f.contacts.some((c) => c.id === other), `${other} visible to ${me} through the cloud`).toBe(true);
    }
  });

  it("a hull inside a non-owner's cloud paints as a blip when swept", () => {
    const w = bareWorld();
    const me = place(w, 'a', 0, 0);
    place(w, 'h', ANNULUS_D, 0); // in a's annulus (sight < ANNULUS_D ≤ dropout start)
    injectCloud(w, 'onH', 'h', ANNULUS_D, 0); // h's own cloud — a is NOT its owner
    windowAround(me, 0);
    const f = buildFrame(w, 'a');
    verifyFrame(w, 'a', f);
    expect(f.events.filter((ev) => ev.k === 'blip')).toHaveLength(1);
  });
});

// ---------- the invariant catches a genuine leak (Story 8.16) ---------------
//
// Pinned directly: the oracle must catch a GENUINE leak of a REAL ship.
// Justification is exact mask equality against oracle-recomputed sources, so
// a real hidden ship's true footprint — the exact payload a leaking
// perception bug would emit — matches no arm and fails. (Written for CHAFF's
// fake carve-out, Story 8.16; kept after CHAFF's retirement in Story 9.2.)

describe('perception — the invariant still catches a genuine leak (Story 8.16)', () => {
  it('a forged blip carrying a hidden REAL ship\'s true footprint fails verifyFrame', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0); // observer; place() parks its beam zero-width
    // The REAL hidden ship: inside a's annulus, but a's paint window is
    // zero-width, so NO gate passes for it.
    const h = place(w, 'h', ANNULUS_D, 100, 1.25);
    const legit = buildFrame(w, 'a');
    verifyFrame(w, 'a', legit); // the honest frame passes (sanity)
    // Forge the exact payload a leaking blip path would emit for `h` — its
    // true pose rasterized+fuzzed for this tick — and assert the oracle
    // REFUSES it: it matches no gated ship.
    const forged = maskOracle(w, w.ships.get('a')!.state, h.hullId, h.state.x, h.state.y, h.state.heading, w.now);
    const forgedFrame = buildFrame(w, 'a');
    forgedFrame.events.push({ k: 'blip', t: w.now, gx: forged.gx, gy: forged.gy, w: forged.w, h: forged.h, bits: forged.bits });
    expect(() => verifyFrame(w, 'a', forgedFrame)).toThrow();
  });
});

// ---------- the completeness oracle CONSUMES its matches ---------------------
//
// Story 7-5 wave-2 review gate. The guard used to justify each expected source
// with `blips.some(...)` and then check a total count. When two expected sources
// share a mask — two hulls on one pose here — ONE emitted blip satisfied BOTH existence checks,
// and the count then had room for an entirely unjustified blip. Consumption
// matching closes it: each expected source pairs with exactly one blip, and
// anything left over fails.

describe('perception — the completeness oracle cannot be satisfied by substitution', () => {
  /** Rebuild a frame with a forged blip subsequence, re-sorted into the wire's
   *  payload-only order so the forgery fails COMPLETENESS rather than tripping
   *  verifyBlipOrdering first (which would pass the test for the wrong reason). */
  function withBlips(f: FrameMsg, blips: readonly ReturnBlipEvent[]): FrameMsg {
    const key = (e: ReturnBlipEvent): number[] => [e.gx, e.gy, e.t, e.w, e.h, e.bits.length, ...e.bits];
    const sorted = [...blips].sort((a, b) => key(a).map((v, j) => v - key(b)[j]).find((d) => d !== 0) ?? 0);
    return { ...f, events: [...f.events.filter((e) => e.k !== 'blip'), ...sorted] };
  }

  it('one blip may justify only ONE gated subject — a twin cannot cover for an omitted paint', () => {
    const w = bareWorld();
    const me = place(w, 'a', 0, 0);
    // Twins: same class, same pose => byte-identical rasterized masks. That
    // collision is what the old existence-plus-count guard could not tell apart.
    place(w, 't1', ANNULUS_D, 0);
    place(w, 't2', ANNULUS_D, 0);
    // A third gated hull on its own bearing inside the same window, whose mask
    // differs — the substitute that keeps the count whole.
    place(w, 't3', ANNULUS_D * Math.cos(0.015), ANNULUS_D * Math.sin(0.015), 0.4);
    windowAround(me, 0);
    const legit = buildFrame(w, 'a');
    verifyFrame(w, 'a', legit); // the honest frame passes: two twin paints + one
    const blips = legit.events.filter((e): e is ReturnBlipEvent => e.k === 'blip');
    expect(blips).toHaveLength(3);
    const twinMask = maskOracle(w, me.state, DEFAULT_CLASS_ID, ANNULUS_D, 0, 0, w.now);
    const twinBlips = blips.filter((b) => maskEquals(twinMask, b));
    const other = blips.find((b) => !maskEquals(twinMask, b))!;
    expect(twinBlips).toHaveLength(2);

    // THE SUBSTITUTION: drop ONE twin's paint (t2 silently loses its return) and
    // let a duplicate of t3's paint fill the hole in the count.
    const forged = withBlips(legit, [twinBlips[0], other, { ...other, bits: [...other.bits] }]);
    // It satisfies every clause of the OLD guard: same blip count, and each
    // expected mask — both twins' and t3's — is present SOMEWHERE. Every blip
    // also individually traces to a real gated ship, so the per-blip arm
    // (verifyBlip) is silent too: only multiplicity can catch this.
    const forgedBlips = forged.events.filter((e): e is ReturnBlipEvent => e.k === 'blip');
    expect(forgedBlips).toHaveLength(blips.length);
    expect(forgedBlips.some((b) => maskEquals(twinMask, b))).toBe(true);
    // ...and the consuming oracle refuses it anyway.
    expect(() => verifyFrame(w, 'a', forged)).toThrow(/accounted for by its own blip/);
  });
});

// ---------- directed cases: THE FOG FIELD (Story 9.10) -------------------------
//
// The spec's I/O matrix, row by row, against real frames (every fogged frame
// also passes verifyFrame, so the integration oracle agrees with production
// on each). The field is PINNED through the World's test seam so the
// geometry is exact: a cut of −2 is density 1 on the whole ocean and 0 past
// its rim (amendment 179), FOG_NO_CUT is no fog. Since amendment 179 an
// observer standing in solid fog pays nothing inside its own bank, so the
// LOOKING-IN cases put the observer just past the rim (clear water, the one
// exact clear/solid edge) and the subject on the ocean: a ray of d with k u
// on the ocean costs d + COST × k. Every distance below is derived from
// CONFIG.fog.sightCostPerU and the eye reach under test (Story 11.2: each
// subject has its own — `lookInHidden` / `lookInSeen`).

/** Density 1 on the whole ocean (0 past the rim). */
const FULL_FOG_CUT = -2;
const COST = CONFIG.fog.sightCostPerU;
/** How far past the ocean's rim the looking-in observer stands (clear water by the clip). */
const OFF_RIM_U = 10;
/** u — the dead band the directed premises keep clear of: two march cells of toll either way. */
const FOG_PREMISE_SLACK = 2 * COST * CONFIG.fog.marchStepU;

/** The tolled length of a LOOKING-IN ray of `d`: all of it but the observer's
 *  OFF_RIM_U of clear water crosses density 1. */
function lookInTolled(d: number): number {
  return d + COST * (d - OFF_RIM_U);
}

/** u — the looking-in distance whose tolled ray lands exactly ON `reach`. */
function lookInEdge(reach: number): number {
  return (reach + COST * OFF_RIM_U) / (1 + COST);
}

/** u — a looking-in distance the fog HIDES at `reach`: inside the geometric
 *  reach, its tolled ray past it by more than the dead band. */
function lookInHidden(reach: number): number {
  const d = lookInEdge(reach) + (2 * FOG_PREMISE_SLACK) / (1 + COST);
  expect(d).toBeLessThan(reach); // premise: clear water would show it
  expect(lookInTolled(d)).toBeGreaterThan(reach + FOG_PREMISE_SLACK); // premise: the toll hides it
  return d;
}

/** u — a looking-in distance still SEEN through the fog at `reach`: its
 *  tolled ray inside it by more than the dead band, with real fog on it. */
function lookInSeen(reach: number): number {
  const d = (lookInEdge(reach) + OFF_RIM_U) / 2;
  expect(d).toBeGreaterThan(OFF_RIM_U); // premise: the ray does cross the bank
  expect(lookInTolled(d)).toBeLessThanOrEqual(reach - FOG_PREMISE_SLACK); // premise: it pays its way
  return d;
}

describe('perception — THE FOG FIELD: sight pays the toll (Story 9.10, amendments 149–150 / 164–170; 179: the own bank is free; 210: radar has no inner edge)', () => {
  it('LOOKING IN from clear water: a hull whose tolled ray is past the plain-hull reach is on NEITHER eye tier yet still a BLIP (amendment 210: radar has no inner edge), one whose tolled ray lands in the plain band is a PLAIN contact, and one whose tolled ray stays inside the class reach is a full contact; with no fog all three are full contacts', () => {
    const w = bareWorld();
    const R = w.map.radius;
    const dHidden = lookInHidden(HULL_SIGHT);
    const dPlain = (lookInEdge(SIGHT) + lookInEdge(HULL_SIGHT)) / 2;
    const dSeen = lookInSeen(SIGHT);
    expect(dHidden).toBeLessThan(SIGHT); // premise: clear water would make even the far one a full contact
    expect(lookInTolled(dPlain)).toBeGreaterThan(SIGHT + FOG_PREMISE_SLACK); // premise: fog takes its class...
    expect(lookInTolled(dPlain)).toBeLessThanOrEqual(HULL_SIGHT - FOG_PREMISE_SLACK); // ...and leaves the hull
    const a = place(w, 'a', R + OFF_RIM_U, 0);
    const b = place(w, 'b', R + OFF_RIM_U - dHidden, 0);
    const p = place(w, 'p', R + OFF_RIM_U - dPlain, 0, 0.6);
    const c = place(w, 'c', R + OFF_RIM_U - dSeen, 0);
    w.setFogCutForTest(FULL_FOG_CUT);
    windowAround(a, Math.PI); // the beam ON the three hulls' bearing
    const f = buildFrame(w, 'a');
    verifyFrame(w, 'a', f);
    expect(f.contacts.map((k) => k.id)).toEqual(['c']);
    expect(f.pc?.map((row) => ({ x: row.x, y: row.y }))).toEqual([{ x: p.state.x, y: p.state.y }]);
    // All three hulls paint — fog is never a radar input (149) and the sweep
    // reaches inside the bubble (210): b, fog-hidden from the eye, still
    // arrives as a blip; c, sighted, is a contact AND a blip.
    const blips = blipsOf(f);
    expect(blips).toHaveLength(3);
    for (const ship of [b, p, c]) {
      expect(blips.some((e) => maskEquals(maskOracle(w, a.state, ship.hullId, ship.state.x, ship.state.y, ship.state.heading, w.now), e))).toBe(true);
    }
    // Neither the blip nor the plain row carries an identity.
    const wire = JSON.stringify(f.contacts) + JSON.stringify(f.events) + JSON.stringify(f.pc);
    expect(wire).not.toContain('"b"');
    expect(wire).not.toContain('"p"');
    // ...and with no fog, the same hulls are full contacts.
    w.setFogCutForTest(FOG_NO_CUT);
    const clear = buildFrame(w, 'a');
    verifyFrame(w, 'a', clear);
    expect(clear.contacts.map((k) => k.id).sort()).toEqual(['b', 'c', 'p']);
    expect('pc' in clear).toBe(false);
  });

  it('STANDING IN THE BANK (amendment 179, "like grass patches in League"): under density 1 — one ocean-wide bank — the observer at the center sees a hull, an enemy mine, a puff and a flash, each at a distance clear water would have hidden at that toll; and looking OUT, a hull past the rim through its own solid bank is a contact (the own bank costs nothing) that does not see back', () => {
    const w = bareWorld();
    const R = w.map.radius;
    // Each subject inside its own reach, at a distance whose FULLY tolled ray
    // (the pre-179 rule: every unit pays) would be past it.
    const dHull = SIGHT / 2;
    const dMine = MINE_SIGHT / 2;
    const dHalo = MUZZLE_FLASH / 2;
    expect(dHull * (1 + COST)).toBeGreaterThan(SIGHT); // premise
    expect(dMine * (1 + COST)).toBeGreaterThan(MINE_SIGHT); // premise
    expect(dHalo * (1 + COST)).toBeGreaterThan(MUZZLE_FLASH); // premise
    expect(Math.max(dHull, dHalo)).toBeLessThan(R); // premise: every ray stays inside the one bank
    const a = place(w, 'a', 0, 0);
    place(w, 'b', dHull, 0);
    injectMine(w, 'm', 'c', 0, dMine); // an enemy's mine (its owner is not on the water)
    w.setFogCutForTest(FULL_FOG_CUT);
    emitWorldEvent(w, { k: 'sm', x: -dHalo, y: 0, tier: 1 });
    emitWorldEvent(w, { k: 'mz', x: -dHalo, y: 0 });
    windowAround(a, 0);
    const f = buildFrame(w, 'a');
    verifyFrame(w, 'a', f);
    expect(f.contacts.map((c) => c.id)).toEqual(['b']);
    expect(f.mines.map((m) => m.id)).toEqual(['m']);
    expect(f.events.filter((e) => e.k === 'sm' || e.k === 'mz').map((e) => e.k).sort()).toEqual(['mz', 'sm']);
    // ...and the same observer hidden from a clear-water watcher is the LOOKING IN case above: the rule is not symmetric.
    const out = bareWorld();
    const dOut = lookInHidden(HULL_SIGHT); // b just past the rim, a that far inside the bank
    expect(dOut).toBeLessThanOrEqual(SIGHT); // premise: geometrically a full contact both ways
    place(out, 'a', R + OFF_RIM_U - dOut, 0);
    place(out, 'b', R + OFF_RIM_U, 0);
    out.setFogCutForTest(FULL_FOG_CUT);
    const g = buildFrame(out, 'a');
    verifyFrame(out, 'a', g);
    expect(g.contacts.map((c) => c.id)).toEqual(['b']); // the pre-179 toll would have hidden b; the own bank is free
    // ...while b, in clear water, does NOT see a through that same fog — on either eye tier.
    const back = buildFrame(out, 'b');
    verifyFrame(out, 'b', back);
    expect(back.contacts).toEqual([]);
    expect('pc' in back).toBe(false);
  });

  it('LOOKING IN: an enemy mine inside the mine reach whose tolled ray is past it is NOT a mine row (the mine reach pays the same toll) — and it is still armed in the store; with no fog it is', () => {
    const w = bareWorld();
    const R = w.map.radius;
    const d = lookInHidden(MINE_SIGHT);
    place(w, 'a', R + OFF_RIM_U, 0);
    injectMine(w, 'm', 'b', R + OFF_RIM_U - d, 0);
    w.setFogCutForTest(FULL_FOG_CUT);
    const f = buildFrame(w, 'a');
    verifyFrame(w, 'a', f);
    expect(f.mines).toEqual([]);
    expect(w.mines.has('m')).toBe(true);
    w.setFogCutForTest(FOG_NO_CUT);
    expect(buildFrame(w, 'a').mines.map((m) => m.id)).toEqual(['m']);
  });

  it('LOOKING IN: a wounded-smoke puff (and a flash) inside the halo whose tolled ray is past it is withheld, and delivered with no fog (167)', () => {
    const d = lookInHidden(MUZZLE_FLASH);
    const run = (cut: number): string[] => {
      const w = bareWorld();
      const R = w.map.radius;
      place(w, 'a', R + OFF_RIM_U, 0);
      w.setFogCutForTest(cut);
      emitWorldEvent(w, { k: 'sm', x: R + OFF_RIM_U - d, y: 0, tier: 1 });
      emitWorldEvent(w, { k: 'mz', x: R + OFF_RIM_U - d, y: 0 });
      const f = buildFrame(w, 'a');
      verifyFrame(w, 'a', f);
      return f.events.filter((e) => e.k === 'sm' || e.k === 'mz').map((e) => e.k).sort();
    };
    expect(run(FULL_FOG_CUT)).toEqual([]);
    expect(run(FOG_NO_CUT)).toEqual(['mz', 'sm']);
  });

  it('RADAR IS FOG-BLIND (149): a hull beyond every eye reach paints the byte-identical blip under density 1 and with no fog', () => {
    const paint = (cut: number): BlipEvent[] => {
      const w = bareWorld(7);
      const a = place(w, 'a', 0, 0);
      place(w, 'b', ANNULUS_D, 0);
      w.setFogCutForTest(cut);
      windowAround(a, 0);
      const f = buildFrame(w, 'a');
      verifyFrame(w, 'a', f);
      return blipsOf(f);
    };
    const clear = paint(FOG_NO_CUT);
    const fogged = paint(FULL_FOG_CUT);
    expect(clear).toHaveLength(1);
    expect(fogged).toEqual(clear);
  });

  it('ZONE CIRCLES DO NOT PAY (167): a burn zone centred inside radar range is delivered under density 1, whatever its toll', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 2000, 0);
    const dZone = RADAR / 2;
    expect(dZone * (1 + COST)).toBeGreaterThan(RADAR); // premise: a tolled gate would have withheld it
    injectBurnZone(w, 'bz', 'b', dZone, 0);
    w.setFogCutForTest(FULL_FOG_CUT);
    const f = buildFrame(w, 'a');
    verifyFrame(w, 'a', f);
    expect((f.burnZones ?? []).map((z) => z.id)).toEqual(['bz']);
  });

  it('FOG IS NOT A CHANNEL: no frame carries a `fog` key — fogged or spectator, under density 1 or none', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 200, 0);
    for (const cut of [FOG_NO_CUT, FULL_FOG_CUT]) {
      w.setFogCutForTest(cut);
      expect('fog' in buildFrame(w, 'a')).toBe(false);
      expect('fog' in buildFrame(w, 'a', 'finished')).toBe(false);
    }
  });

  it('SPECTATORS ARE UNFOGGED: a finished-phase frame under density 1 still lists the hull the fogged frame hides', () => {
    const w = bareWorld();
    const R = w.map.radius;
    place(w, 'a', R + OFF_RIM_U, 0);
    place(w, 'b', R + OFF_RIM_U - lookInHidden(HULL_SIGHT), 0);
    w.setFogCutForTest(FULL_FOG_CUT);
    const fogged = buildFrame(w, 'a');
    expect(fogged.contacts).toEqual([]);
    expect('pc' in fogged).toBe(false);
    const spec = buildFrame(w, 'a', 'finished');
    expect(spec.spec).toBe(true);
    expect(spec.contacts.map((c) => c.id)).toContain('b'); // every afloat hull, the spectator's own included
    expect('pc' in spec).toBe(false);
  });

  it('FAIL-CLOSED RANGE (the NaN-safe withinSight): an observer whose sightRange is NaN holds NO full contact at 10 u — the hull is at most a nameless plain row — and a NaN hullSightRange closes that tier too; the radar, which never reads sight (amendment 210), fails closed on its OWN range', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 10, 0);
    a.stats = { ...a.stats, sightRange: NaN };
    windowAround(a, 0);
    const f = buildFrame(w, 'a');
    expect(f.contacts).toEqual([]); // no class, no name
    // The outer tier reads its OWN stat, so the hull is a plain row: its
    // pose under an anonymous handle, nothing that names it.
    expect(f.pc).toHaveLength(1);
    expect(Object.keys(f.pc![0])).toEqual(['h', 'x', 'y', 'heading', 'speed']);
    expect(f.pc![0].h).not.toBe(b.id);
    expect(blipsOf(f)).toHaveLength(1); // a NaN eye does not blind the scope
    a.stats = { ...a.stats, hullSightRange: NaN };
    windowAround(a, 0);
    const g = buildFrame(w, 'a');
    expect(g.contacts).toEqual([]);
    expect('pc' in g).toBe(false); // both eye tiers closed
    expect(blipsOf(g)).toHaveLength(1);
    a.stats = { ...a.stats, radarRange: NaN };
    windowAround(a, 0);
    expect(blipsOf(buildFrame(w, 'a'))).toEqual([]); // a NaN radar range paints nothing
  });
});

// ---------- SIGNAL REGISTRY completeness (CI-by-construction) -----------------
//
// These assertions make "a signal without a passing invariant case fails CI by
// construction" a structural property, not a discipline. SIGNAL_REGISTRY is
// enumerated here ONLY to compare key sets — never called as a visibility
// oracle (the reimplemented predicates above stay the sole oracle). A future
// dev adding a 13th row sees this block fail until they add its verifier.

describe('perception — SIGNAL REGISTRY completeness', () => {
  // The contact-like pseudo-rows are verified through the contacts/pc/
  // mines/drops/litZones/burnZones/foulZones/clouds frame channels
  // (verifyFrame/verifyPlain/verifyMine/verifyDrops/verifyLitZone/
  // verifyBurnZone/verifyFoulZone/cloudGateOracle), not through EVENT_VERIFIERS.
  // The RADAR BUOY's `buoy` row is DELETED (Story 8.16), and the DECOY BUOY's
  // `decoy` row with it in Story 10.5; `burnzone` (Story 8.17) is the PHOSPHOR burning
  // zone's channel on the lit zone's gate, with its own oracle (verifyBurnZone).
  // `cloud` (Story 9.3 — 8.18's `smoke` seat) is the COUNTERMEASURE cloud's
  // channel, with its own oracle (cloudGateOracle / verifyCloudShape); a
  // cloud occludes nothing (Story 9.3 session 2). `foulzone` (Story 9.4) is
  // the FOULING SHELL foul zone's channel on the burn zone's gate, with its
  // own oracle (verifyFoulZone / foulZoneGateOracle). FOG (Story 9.10) HAS
  // NO ROW: the field is public weather and its hiding is the toll inside
  // the sight oracles (fogTollOracle) — the declared exceptions stay at SIX.
  // `drop` (Story 10.9, R3) is the AIRDROP's sight channel — the mine gate
  // minus the owner clause — with its own oracle (verifyDrops); its radar
  // paint is an anonymous blip the completeness oracle attributes
  // (expectedDropBlips), so the declared exceptions STILL stay at SIX.
  // `plain` (Story 11.2, R3) is the OUTER SIGHT TIER's channel — a hull
  // beyond the class-and-name reach and inside the plain-hull reach, as an
  // anonymous {h,x,y,heading,speed} row in `frame.pc` — with its own oracle
  // (verifyPlain, inside verifyFrame) and its own handle ledger (PlainLedger).
  const CONTACT_LIKE = ['contact', 'plain', 'mine', 'drop', 'litzone', 'burnzone', 'foulzone', 'cloud'];
  // The 18 GameEvent kinds — each MUST have an EVENT_VERIFIERS entry (Story
  // 2.1 deleted 'heal' with the REPAIR spend; Story 2.7 added self-private
  // 'bn'; Story 4.3 added the gunnery rows 'sp'/'hc'/'mz'; 2026-08-04's DAMAGE
  // CONTROL strip brought 'heal' BACK, on stricter no-severity terms; Story
  // 4.4 added the anonymous wounded-smoke row 'sm'; Story 4.5 added the
  // bearing-only foghorn row 'fh'; Story 4.12 added the identity-free radar
  // wake row 'wk'; the 2026-10-01 drone drops' self-private 'dp' left with
  // Story 10.5 and RETURNED with Story 10.9's AIRDROPS as the collector-
  // private pickup tell, on the pt terms).
  const EVENT_KINDS = ['blip', 'shell', 'torp', 'torpU', 'boom', 'burst', 'sunk', 'spawn', 'dmg', 'pt', 'bn', 'sp', 'hc', 'mz', 'heal', 'sm', 'fh', 'wk', 'dp'];
  const EXPECTED_KEYS = [...CONTACT_LIKE, ...EVENT_KINDS];

  it('has exactly the expected channel keys (19 event kinds + contact + plain + mine + drop + litzone + burnzone + foulzone + cloud)', () => {
    expect(Object.keys(SIGNAL_REGISTRY).sort()).toEqual([...EXPECTED_KEYS].sort());
    expect(Object.keys(SIGNAL_REGISTRY)).toHaveLength(EXPECTED_KEYS.length);
  });

  it('every row keys itself: row.eventType === its registry key', () => {
    for (const [key, row] of Object.entries(SIGNAL_REGISTRY)) {
      expect(row.eventType).toBe(key);
    }
  });

  it('the contact-like pseudo-rows exist (verified via the contacts/pc/mines/drops/litZones/burnZones/foulZones/clouds channels); fog has no row', () => {
    expect(SIGNAL_REGISTRY.contact).toBeDefined();
    expect(SIGNAL_REGISTRY.plain).toBeDefined(); // Story 11.2 — the outer sight tier (`frame.pc`, verifyPlain)
    expect(SIGNAL_REGISTRY.drop).toBeDefined(); // Story 10.9
    expect(SIGNAL_REGISTRY.mine).toBeDefined();
    expect(SIGNAL_REGISTRY.litzone).toBeDefined();
    expect(SIGNAL_REGISTRY.burnzone).toBeDefined(); // Story 8.17
    expect(SIGNAL_REGISTRY.foulzone).toBeDefined(); // Story 9.4
    expect(Object.hasOwn(SIGNAL_REGISTRY, 'decoy')).toBe(false); // deleted with the buoys (Story 10.5)
    expect(SIGNAL_REGISTRY.cloud).toBeDefined(); // Story 9.3 (8.18's smoke seat)
    expect(Object.hasOwn(SIGNAL_REGISTRY, 'fog')).toBe(false); // Story 9.10 — fog is a toll, never a channel
    expect(Object.hasOwn(SIGNAL_REGISTRY, 'buoy')).toBe(false); // deleted with the radar buoy (Story 8.16)
  });

  it('every event-kind row has a test-local verifier — a row without one FAILS HERE', () => {
    const rowEventKinds = Object.keys(SIGNAL_REGISTRY).filter((k) => !CONTACT_LIKE.includes(k));
    // Key-set equality both ways: a registry row lacking a verifier AND a stray
    // verifier with no row are each a hard failure. THIS is the CI-by-construction
    // gate — a new event row turns this red until its verifier lands.
    expect(Object.keys(EVENT_VERIFIERS).sort()).toEqual(rowEventKinds.sort());
  });

  it('the registry AND every row are frozen (rows are added at authoring time only)', () => {
    expect(Object.isFrozen(SIGNAL_REGISTRY)).toBe(true);
    for (const row of Object.values(SIGNAL_REGISTRY)) {
      expect(Object.isFrozen(row)).toBe(true);
    }
  });
});

// ---------- amendment 210: THE SERVER RETURNS THE ENTIRE SWEEP (I/O matrix) ----
//
// Eric 2026-10-21 ("I always get radar information"), superseding amendment
// 163: the radar has no inner edge. One directed case per server-owned row of
// the spec's I/O matrix; every radius derives from CONFIG.

/** A seeded world (the fuzz's ~30 % dense cut) holding an observer spot in
 *  the heart of a bank and a CLEAR spot `near` away whose tolled ray the eye
 *  cannot pay (production's toll past sight by a march cell of slack), or
 *  null when no seed in range has one. */
function solidFogBlindPair(near: number): { w: World; o: { x: number; y: number }; p: { x: number; y: number } } | null {
  const slack = 2 * CONFIG.fog.sightCostPerU * CONFIG.fog.marchStepU;
  for (let seed = 1; seed <= 12; seed++) {
    const w = bareWorld(seed);
    const lattice = fogLattice(0, 0, INVARIANT_ARENA_U, CONFIG.fog.quantileLattice);
    w.setFogCutForTest(fogCutForTarget(w.fogFieldForTest(), w.now, lattice, 0.3));
    for (let x = -INVARIANT_ARENA_U; x <= INVARIANT_ARENA_U; x += 60) {
      for (let y = -INVARIANT_ARENA_U; y <= INVARIANT_ARENA_U; y += 60) {
        if (w.fogDensityAt(x, y) < 1) continue; // the observer stands in the heart of a bank
        for (let k = 0; k < 36; k++) {
          const p = { x: x + near * Math.cos((k * TAU) / 36), y: y + near * Math.sin((k * TAU) / 36) };
          if (w.fogDensityAt(p.x, p.y) > 0) continue; // the hull sits in clear water
          if (near + w.fogTollAlong(x, y, p.x, p.y) > SIGHT + slack) return { w, o: { x, y }, p };
        }
      }
    }
  }
  return null;
}

describe('perception — amendment 210: the server returns the entire sweep', () => {
  /** u — the matrix's near hull: well inside the sight bubble. */
  const NEAR = SIGHT * 0.6;

  it('clear water: a swept hull inside sight is a contact AND a blip', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', NEAR, 0, 0.4);
    windowAround(a, 0);
    const f = buildFrame(w, 'a');
    verifyFrame(w, 'a', f);
    expect(f.contacts.map((c) => c.id)).toEqual(['b']);
    const blips = blipsOf(f);
    expect(blips).toHaveLength(1);
    expect(maskEquals(maskOracle(w, a.state, b.hullId, b.state.x, b.state.y, b.state.heading, w.now), blips[0])).toBe(true);
  });

  it('observer in SOLID fog, hull in clear water inside sight whose ray pays its way out: no contact, yet a blip', () => {
    const pair = solidFogBlindPair(NEAR);
    expect(pair, 'a solid-fog observer with a clear hull it cannot see exists in some seeded field').not.toBeNull();
    const { w, o, p } = pair!;
    const a = place(w, 'a', o.x, o.y);
    const b = place(w, 'b', p.x, p.y, 1.1);
    expect(sighted(w, a, b.state)).toBe(false); // the independent oracle agrees: the eye is blind
    windowAround(a, bearing(a.state, b.state));
    const f = buildFrame(w, 'a');
    verifyFrame(w, 'a', f);
    expect(f.contacts).toEqual([]);
    const blips = blipsOf(f);
    expect(blips).toHaveLength(1);
    expect(maskEquals(maskOracle(w, a.state, b.hullId, b.state.x, b.state.y, b.state.heading, w.now), blips[0])).toBe(true);
  });

  it('a hull behind a LOW island inside sight: no contact (eye: binary island LOS), a PARTIAL blip (radar: the shadow march)', () => {
    const w = bareWorld();
    w.map.islands.push(circleIsland(NEAR / 2, 0, 30)); // blocks the eye
    w.map.heightRaster = rasterFrom(NEAR, ridgeField(NEAR / 2, 0, 30, 30, 16)); // low: partial illumination (the raster spans the whole ray)
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', NEAR, 0);
    // Premise (the independent shadow oracle): the low ridge sits ON the ray
    // (a finite attenuation term — partial, not clear water) yet leaves the
    // hull illuminated; and the eye's binary island LOS is blocked.
    expect(shadowAMinOracle(w.map.heightRaster, 0, 0, 1, 0, NEAR)).toBeLessThan(Infinity);
    expect(shadowVisible(w, a, b.state)).toBe(true);
    expect(clearLos(a.state, b.state, w.map.islands)).toBe(false);
    windowAround(a, 0);
    const f = buildFrame(w, 'a');
    verifyFrame(w, 'a', f);
    expect(f.contacts).toEqual([]);
    const blips = blipsOf(f);
    expect(blips).toHaveLength(1);
    expect(maskEquals(maskOracle(w, a.state, b.hullId, b.state.x, b.state.y, b.state.heading, w.now), blips[0])).toBe(true);
  });

  it('a hull behind HARD cover (at or above mast height) inside sight: nothing on either channel', () => {
    const w = bareWorld();
    w.map.islands.push(circleIsland(NEAR / 2, 0, 30));
    w.map.heightRaster = rasterFrom(NEAR, ridgeField(NEAR / 2, 0, 30, 30, 255)); // the raster spans the whole ray
    const a = place(w, 'a', 0, 0);
    place(w, 'b', NEAR, 0);
    windowAround(a, 0);
    const f = buildFrame(w, 'a');
    verifyFrame(w, 'a', f);
    expect(f.contacts).toEqual([]);
    expect(blipsOf(f)).toEqual([]);
  });
});
