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
// a human captain's sinking is identity-only public, a drone's reaches only
// a witness or its killer, and the per-observer `seen` flag may be present
// only when the witness predicate holds — see verifySunk; plus DAMAGE
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
// boostUntil terms: `hunkerUntil` (the Battleship's Shift window), the
// seat's `gun` and the held-fire level `held` may exist NOWHERE but the
// observer's own `you` (see verifyFrame). The fuzz seats every ship with a
// RANDOM gun and drives a random `held` level, so machine-gun streams, flak
// bursts and cannon salvos all flow through the oracle. Story 9.3 (the
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
// decoy paint, the wake oracle's radar half, the cloud gate's radar arm, the
// zone circles and the foghorn never read the field, and the fuzz asserts
// (RADAR_THROUGH_FOG) that returns whose ray crosses fog paint exactly as the
// fog-blind oracle says. The fuzz PINS the cut per world through the World's
// test seam (worlds ≡ 0 mod 3 at ~30 % coverage, ≡ 1 at ~5 %, ≡ 2 with no
// fog) so the toll arms are non-vacuous, and the five FOG_* /
// RADAR_THROUGH_FOG ledgers prove each arm ran. The checks below
// are a deliberate test-local reimplementation of the
// visibility predicates so a refactor of perception.ts cannot silently agree
// with its own bug.

import { describe, it, expect } from 'vitest';
import {
  isAfloat,
  isSinking,
  CATALOG,
  CONFIG,
  consumableSlotFor,
  DEFAULT_GUN,
  GUN_IDS,
  HORN_IDS,
  SHELL_FAMILIES,
  bearing,
  coverageHas,
  dropoutPaintP,
  dropoutPaints,
  effectiveStats,
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
  wrapPositive,
  type BallisticEvent,
  type BlipEvent,
  type HullId,
  type ReturnBlipEvent,
  type BoomEvent,
  type BoonFitEvent,
  type DropEvent,
  type BurstEvent,
  type Contact,
  type Island,
  type DamageEvent,
  type GameEvent,
  type FrameMsg,
  type GhostPaint,
  type GunId,
  type HealEvent,
  type HitCallEvent,
  type MatchPhase,
  type MineKind,
  type MineView,
  type OwnShip,
  type DecoyView,
  type PointEvent,
  type SpawnEvent,
  type SplashEvent,
  type SunkEvent,
  type TorpedoUpdateEvent,
  type WakeBlipEvent,
  type WakeRibbon,
} from '@salvo/shared';
import { World, type ShipRecord, type WorldOptions } from '../game/world.js';
// addDecoy is WORLD-STATE MINTING (the injectMine/createShipWake class), never
// a visibility rule: the fuzz uses it to lay live decoys exactly as production
// does, while every rule about them — visibility, paint masks — is
// reimplemented below (the header's oracle rule).
import { addDecoy } from '../game/decoys.js';
import { buildFrame } from '../game/frames.js';
// Registry symbols are imported ONLY to ENUMERATE keys/rows for the completeness
// block below — never as a behavior oracle. Every visibility predicate in this
// file stays independently reimplemented (see the header), so a perception
// refactor cannot silently agree with its own bug via a row's own visible().
import { SIGNAL_REGISTRY } from '../game/signals.js';
import { circleIsland, flatRaster, rasterFrom, ridgeField } from './islandFixture.js';
import type { HeightRaster } from '@salvo/shared';

const TAU = Math.PI * 2;
const SIGHT = CONFIG.vision.sight;
const RADAR = CONFIG.vision.radar;
const DT = CONFIG.tick.simDtMs;
const SWEEP_PERIOD = 60000 / CONFIG.vision.sweepRpm; // ms per base revolution
const SWEEP_DELTA = (TAU * DT) / SWEEP_PERIOD;
const TICKS_PER_REV = Math.round(SWEEP_PERIOD / DT);
/** u — a directed-case placement BEYOND SIGHT and inside the dropout's flat
 *  band (sight < d ≤ dropout.startU), so every swept paint lands and the eye
 *  stays out of the case (the name predates amendment 210, which removed the
 *  radar's inner edge — there is no annulus any more) (Story
 *  9.8: the twelfths ladder moved sight to 4/12; the old 400 u placements sit
 *  inside it now). Derived, never a literal. */
const ANNULUS_D = SIGHT + 200;
/** u — a placement BEYOND radar range (Story 9.8: the old 900 u placements
 *  are inside the twelfths radar). */
const BEYOND_RADAR = RADAR + 200;
/** The first revolution index ≥ `from` at which the roll PAINTS (or MISSES,
 *  when `paint` is false) a return at `d` for this (observer, target) — the
 *  directed cases pin a revolution on purpose rather than hoping the seed
 *  lands one. Reads the same exported pure roll the oracle mirrors. */
function revWhere(w: World, obs: string, tgt: string, d: number, paint = true, from = 0): number {
  for (let rev = from; rev < from + 10_000; rev++) {
    if (dropoutPaints(d, w.dropoutSeed, obs, tgt, rev) === paint) return rev;
  }
  throw new Error(`no revolution ${paint ? 'paints' : 'misses'} ${tgt} at ${d}u`);
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
// the cloud's spray DISC — centre fixed, radius the literal curve
// `200 × (1 + 1.5 × min(1, age / 15000))` (deliberately NOT
// CONFIG.countermeasure and NEVER the shared `cloudOutlineRadius`). Only LIVE
// clouds count (`until` in the future).
const CLOUD_LIFE_MS = 15_000;

function cloudOutlineOracle(bornAt: number, now: number): number {
  const age = Math.max(0, now - bornAt);
  // 150 → 300 u over the life (Story 9.8 staging, Eric 2026-10-14, amendment 141;
  // was 200 → 500). The oracle keeps the ruled literals, never CONFIG.
  return 150 * (1 + 1.0 * Math.min(1, age / CLOUD_LIFE_MS));
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

/** Non-vacuity ledgers for the cloud (the DECOY_PAINT_EXPECTED idiom).
 *  CLOUD_SIGHT_THROUGH: (observer, hull) pairs inside sight with island LOS
 *  clear whose line runs through a live cloud's disc — verified PRESENT as a
 *  contact (a cloud hides nothing). CLOUD_DELIVERED_BY_SIGHT /
 *  CLOUD_DELIVERED_BY_RADAR: clouds delivered to a non-owner that ONE sensor
 *  alone explains (cloudGateOracle). */
const CLOUD_SIGHT_THROUGH = { n: 0 };
const CLOUD_DELIVERED_BY_SIGHT = { n: 0 };
const CLOUD_DELIVERED_BY_RADAR = { n: 0 };
/** Story 8.19: how many frames carried a POSITIVE `you.draft` (the drafting
 *  arm of the self-private clause ran against a real lift, not only the
 *  omitted-at-0 arm). */
const DRAFT_SEEN = { n: 0 };

// Per-observer EFFECTIVE ranges, recomputed here from the raw fitted-boon id
// list (deliberately NOT via me.stats / effectiveStats — the reimplementation
// rule). No card writes radar range any more (the INTEL RANGE line was deleted
// 2026-08-20), so intel range is the flat constant and truesight is half of it.
// (`stacksOf`, the raw-card counter the radar buoy's jamming oracle read, went
// with the buoy in Story 8.16.)

// THE SIGHT-SHRINK SEAM (Story 9.4). The FLASH SHELLS dazzle (Story 8.17,
// amendment 132) collapsed an observer's sight to ONE EIGHTH of intel range
// and was the fuzz's one GAMEPLAY exit for the per-visit reveal ledger; Story
// 9.4 replaced that consumable with the FOULING SHELL, which never touches
// sight. The ledger's contract (a projectile that leaves the gate and
// re-enters is revealed again) outlives its last cause, so the fuzz keeps
// shrinking sight on a SYNTHETIC input: this test-local map says whose sight
// is shrunk until when, `applySightShrink` writes the matching `sightRange`
// onto the record's stats before every frame build, and the oracle reads
// THIS map — never the stats it wrote — so the re-derivation stays
// independent of production. Cleared per fuzz world.
const SIGHT_SHRUNK = new Map<string, number>(); // observer id → server ms the shrink lapses

/** Write each observer's sight onto its record from the shrink map: one
 *  twelfth of intel range (one rung) while shrunk, a third of it otherwise
 *  (the derived base, `sightRange = radarRange / 3` — Story 9.8, amendment
 *  103). A hull whose stats were just
 *  re-derived (a card pick) is re-shrunk here too, so the map is the truth. */
function applySightShrink(w: World, ids: readonly string[]): void {
  for (const id of ids) {
    const rec = w.ships.get(id)!;
    const want = w.now < (SIGHT_SHRUNK.get(id) ?? 0) ? rec.stats.radarRange / 12 : rec.stats.radarRange / 3;
    if (rec.stats.sightRange !== want) rec.stats = { ...rec.stats, sightRange: want };
  }
}

// TRUESIGHT IS THE 4/12 RUNG OF ONE NUMBER (Story 9.8, epic-9 amendment 103 —
// the twelfths ladder; the 4/8 rung before it). Re-derived here
// INDEPENDENTLY, as ratios, per this file's reimplementation rule: sight is a
// third of intel range, a shrunk hull (the seam above) sees a twelfth of it
// (the 1/12 rung, written as the literal `/ 12`), and the shrink scales sight
// ONLY — intel range itself is never scaled, which is what keeps the 6/12
// muzzle/smoke halo un-shrunk by construction. (Story 9.3: the 8.18 in-smoke eighth is GONE — a
// cloud never touches sight.)
function effSight(w: World, me: ShipRecord): number {
  if (w.now < (SIGHT_SHRUNK.get(me.id) ?? 0)) return effRadar() / 12;
  return effRadar() / 3;
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

// The Story 4.9 DETECT oracle (amendments 119/121), INDEPENDENTLY RE-DERIVED:
// 1 × the observer's effective sight (the 4/8 rung since 2026-10-08, written out as a
// LITERAL — deliberately NOT CONFIG.vision.detectFactor and NEVER the
// production pointDetected), dazzle-scaled through effSight exactly as the
// ruling scales it, island LOS applied unchanged. Binds mines,
// torpedoes, and torpU updates; NON-VACUOUS by the directed cases below (a
// mine/torpedo at 300u — inside sight, outside detect — must be excluded).
function detected(w: World, me: ShipRecord, p: { x: number; y: number }, bound: Bound = 'loose'): boolean {
  // Story 9.10: fog-tolled exactly as sight is (a mine or a fish in a bank is
  // spotted late by the same ray cost).
  return sightedWithin(w, me, p, 1 * effSight(w, me), bound);
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

// ---------- Story 9.8: the radar DROPOUT roll (rulings 121–123) -------------
//
// EVERYTHING RADAR DELIVERS ROLLS: ship blips, decoy paints, the wake's radar
// half and the cloud's radar clause each pass one more term — does THIS sweep
// revolution paint a return at range d? The oracle MIRRORS the roll by
// calling the exported pure `dropoutPaints` with the inputs it reads off the
// world itself (the server-private `w.dropoutSeed`, the observer's ship id,
// the target's key, the observer's `sweepRev`): the curve and the hash are
// pinned in shared (dropout.test.ts), so re-deriving them here would only
// duplicate those pins — what this suite owns is WHERE the roll applies and
// WITH WHICH KEYS. Never in a sight predicate, never on the zone circles
// (inside the sight radius the radar gates roll too since amendment 210,
// where p(paint) is 1).
const DROPOUT_LEDGER = { painted: 0, missed: 0 };

function dropoutOracle(w: World, me: ShipRecord, d: number, targetKey: string, rev = me.sweepRev): boolean {
  const ok = dropoutPaints(d, w.dropoutSeed, me.id, targetKey, rev);
  if (d > CONFIG.vision.dropout.startU) {
    if (ok) DROPOUT_LEDGER.painted += 1;
    else DROPOUT_LEDGER.missed += 1;
  }
  return ok;
}

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

/** Add a ship and teleport it to an exact pose (speed 0). `gun` is the seat's
 *  pick (Story 8.15) — the fuzz draws one at random; directed cases default
 *  to the cannon. */
function place(w: World, id: string, x: number, y: number, heading = 0, gun: GunId = DEFAULT_GUN): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), undefined, undefined, undefined, undefined, gun);
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
  w.clouds.set(id, { id, ownerId, x, y, bornAt, until: bornAt + CLOUD_LIFE_MS });
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
      { id: 'b', x: b.state.x, y: b.state.y, heading: 1.5, speed: 0, cls: 'torpedoBoat' },
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
    expect(maskEquals(maskOracle('torpedoBoat', b.state.x, b.state.y, 0.7, w.now), blips[0])).toBe(true);
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
    // The rim is deep in the dropout band (Story 9.8): pin a revolution on
    // which the roll paints the rim, so the boundary — not the roll — is
    // what the second half tests.
    a.sweepRev = revWhere(w, 'a', 'b', RADAR);
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
    expect(maskEquals(maskOracle(b.hullId, b.state.x, b.state.y, b.state.heading, w.now), blips[0])).toBe(true);
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
    // reach is 2e* — derived from K = radar²/4, so it rides the ladder.
    const eStar = Math.sqrt(SHADOW_K / 2);
    const reach = 2 * eStar;
    expect(reach).toBeLessThan(RADAR); // the root lies inside the scope
    const w = bareWorld();
    w.map.heightRaster = rasterFrom(RADAR, ridgeField(eStar, 0, 20, 40, 32));
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', reach + 100, 0); // annulus, beam swept — but past the reach
    // Pin a painting revolution: the miss below must be the SHADOW's, not the
    // dropout's (Story 9.8).
    a.sweepRev = revWhere(w, 'a', 'b', reach + 100);
    windowAround(a, 0);
    expect(shadowVisible(w, a, b.state)).toBe(false);
    expect(blipsOf(buildFrame(w, 'a'))).toEqual([]);
    // The SAME ridge does not touch a nearer target on the same bearing.
    b.state.x = ANNULUS_D; // inside the residual reach (and the dropout's flat band)
    windowAround(a, 0);
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
    place(w, 'b', 100, 0);
    injectShell(w, 's1', 'a', 600, 600, 0, 300);
    const fa = buildFrame(w, 'a');
    expect(shellsOf(fa).map((e) => e.id)).toEqual(['s1']);
    expect(shellsOf(buildFrame(w, 'b'))).toEqual([]);
    // exactly once: the owner is not re-sent the same shell.
    expect(shellsOf(buildFrame(w, 'a'))).toEqual([]);
  });

  it('a shell first entering sight arrives with CURRENT params, once', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', ANNULUS_D + 100, 0);
    injectShell(w, 's1', 'b', ANNULUS_D, 0, Math.PI, ANNULUS_D - 20); // flying toward a, out of sight
    expect(shellsOf(buildFrame(w, 'a'))).toEqual([]);
    // Advance the sim until the shell crosses into a's sight bubble.
    let ev = null;
    for (let i = 0; i < 100 && !ev; i++) {
      w.step();
      ev = shellsOf(buildFrame(w, 'a'))[0] ?? null;
    }
    expect(ev).not.toBeNull();
    const sh = w.shells.get('s1')!;
    expect(ev!.x).toBe(sh.x); // current position, NOT the hidden launch point
    expect(Math.hypot(ev!.x, ev!.y)).toBeLessThanOrEqual(SIGHT);
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

  // Story 8.15 (amendment 89(i)): a MACHINE-GUN stream shell entering an
  // enemy's sight reveals with `w: 'mg'` and NOTHING else new — current pos and
  // velocity, the reveal time, the family word. No shooter, no range, no
  // magazine, no `held`. The torpedo stays blind (no `w`).
  it("a machine-gun shell entering an observer's sight carries w:'mg' and nothing range-derivable; a torpedo carries no w", () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 600, 0, Math.PI, 'machineGun'); // out of a's 330u sight, bow toward a
    expect(b.loadout[0].equipmentId).toBe('machineGun');
    // b holds fire toward a; the level alone fires (no click).
    w.submitInput('b', {
      seq: 1, throttle: 0, rudder: 0, aim: Math.PI, fireSeq: 0, aimDist: 600, slot: 0, fireT: 0,
      actSeq: 0, actSlot: 0, hornSeq: 0, held: true,
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
    place(w, 'a', 0, 0);
    const b = place(w, 'b', ANNULUS_D, 0);
    b.hp = CONFIG.gun.damage; // next hit sinks (derived — the cannon moved 16 → 12, Story 9.8)
    // a's shell, one tick from striking b — b is far outside a's sight.
    injectShell(w, 's1', 'a', ANNULUS_D - 20, 0, 0, 100);
    w.step();
    const fa = buildFrame(w, 'a');
    const fb = buildFrame(w, 'b');
    // b (victim) sees the boom, its dmg, and its own sinking (seen: own hull).
    expect(fb.events.filter((e) => e.k === 'boom')).toHaveLength(1);
    expect(fb.events.filter((e) => e.k === 'dmg')).toEqual([
      { k: 'dmg', id: 'b', amount: CONFIG.gun.damage, hp: 0 },
    ]);
    expect(fb.events.filter((e) => e.k === 'sunk')).toEqual([{ k: 'sunk', id: 'b', by: 'a', seen: true }]);
    // a (owner, out of sight) gets no boom / dmg — no impact-location leak —
    // but the sinking itself arrives (PV 23: credited killer + public
    // register), WITHOUT the spatial license: no `seen`.
    expect(fa.events.filter((e) => e.k === 'boom')).toEqual([]);
    expect(fa.events.filter((e) => e.k === 'dmg')).toEqual([]);
    // `vcls` (Story 5.6, amendment 43) rides to the CREDITED KILLER, appended
    // LAST — the killer learns WHAT they sank even having never seen it.
    expect(fa.events.filter((e) => e.k === 'sunk')).toEqual([{ k: 'sunk', id: 'b', by: 'a', vcls: 'torpedoBoat' }]);
  });

  it('a boom within sight is visible; a witnessed sinking carries seen: true', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    const b = place(w, 'b', 150, 0);
    b.hp = CONFIG.gun.damage; // the next hit sinks it
    place(w, 'c', 0, 800); // far-away third party
    injectShell(w, 's1', 'a', 130, 0, 0, 100); // a's shell, point-blank on b
    w.step();
    const fa = buildFrame(w, 'a');
    expect(fa.events.filter((e) => e.k === 'boom')).toHaveLength(1);
    expect(fa.events.filter((e) => e.k === 'sunk')).toEqual([
      { k: 'sunk', id: 'b', by: 'a', seen: true, vcls: 'torpedoBoat' },
    ]);
    // dmg stays victim-private even when the boom is visible.
    expect(fa.events.filter((e) => e.k === 'dmg')).toEqual([]);
    const fc = buildFrame(w, 'c');
    // The fog-kill THIRD PARTY (PV 23): no boom, but the public register
    // delivers the human sinking — identity only, no `seen`.
    expect(fc.events.filter((e) => e.k === 'boom')).toEqual([]);
    expect(fc.events.filter((e) => e.k === 'sunk')).toEqual([{ k: 'sunk', id: 'b', by: 'a' }]);
  });

  it('the public register: a drone fog kill reaches its killer but NOT a bystander', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0); // the killer
    place(w, 'c', 0, 800); // an uninvolved, out-of-sight bystander
    const d = w.addShip('d1', 'DRONE-01', 'fleet', 'droneSmall', undefined, undefined);
    d.state.x = ANNULUS_D; // far outside everyone's sight
    d.state.y = 0;
    w.sinkShip('d1', 'a');
    w.step();
    // The killer learns its trap/round connected — no `seen` (never witnessed).
    // ...and `vcls` names WHICH drone (Story 5.6, amendment 43): with fleet
    // hulls off the roster this is the only way the killer can know.
    expect(buildFrame(w, 'a').events.filter((e) => e.k === 'sunk')).toEqual([
      { k: 'sunk', id: 'd1', by: 'a', vcls: 'droneSmall' },
    ]);
    // The bystander receives NOTHING: drones are not on the public register.
    expect(buildFrame(w, 'c').events.filter((e) => e.k === 'sunk')).toEqual([]);
  });

  it('a WITNESSED drone sinking arrives with seen: true (today\'s rule, unchanged)', () => {
    const w = bareWorld();
    place(w, 'c', 0, 0); // a witness who did not fire the shot
    const d = w.addShip('d1', 'DRONE-01', 'fleet', 'droneSmall', undefined, undefined);
    d.state.x = 100; // inside c's sight bubble
    d.state.y = 0;
    w.sinkShip('d1', 'a');
    w.step();
    expect(buildFrame(w, 'c').events.filter((e) => e.k === 'sunk')).toEqual([
      { k: 'sunk', id: 'd1', by: 'a', seen: true },
    ]);
  });

  it('an unattributed human sinking (storm) is public with `by` OMITTED, never undefined', () => {
    const w = bareWorld();
    place(w, 'c', 0, 800); // far away — unwitnessed
    place(w, 'b', 0, 0);
    w.sinkShip('b'); // by = undefined (the storm has no killer)
    w.step();
    const sunk = buildFrame(w, 'c').events.filter((e) => e.k === 'sunk');
    expect(sunk).toEqual([{ k: 'sunk', id: 'b' }]);
    expect('by' in sunk[0]).toBe(false); // msgpack would encode an undefined value
    expect('seen' in sunk[0]).toBe(false);
  });

  it('the BOUNTY channel (Story 4.6): `bty: "v"` rides the sunk row to EVERY recipient identically, appended last', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0); // the killer of the holder — far from the wreck
    place(w, 'b', ANNULUS_D, 0); // the throne holder, soon a wreck
    place(w, 'c', 0, 800); // an uninvolved, out-of-sight bystander
    place(w, 'v', 900, 900); // b's earlier victim (the throne claim)
    w.sinkShip('v', 'b'); // b takes the throne
    w.step(); // drain the claim sink from the queue
    w.sinkShip('b', 'a'); // the holder goes down in fog
    w.step();
    // Killer (credited, unwitnessed): the channel arrives WITHOUT `seen`, LAST.
    const ka = buildFrame(w, 'a').events.filter((e) => e.k === 'sunk');
    expect(ka).toEqual([{ k: 'sunk', id: 'b', by: 'a', bty: 'v', vcls: 'torpedoBoat' }]);
    expect(Object.keys(ka[0])).toEqual(['k', 'id', 'by', 'bty', 'vcls']); // vcls LAST
    // Victim (own hull => witnessed): seen AND bty, bty still last.
    const kb = buildFrame(w, 'b').events.filter((e) => e.k === 'sunk');
    expect(kb).toEqual([{ k: 'sunk', id: 'b', by: 'a', seen: true, bty: 'v' }]);
    expect(Object.keys(kb[0])).toEqual(['k', 'id', 'by', 'seen', 'bty']);
    // Bystander (public register, unwitnessed): identical value — it is
    // observer-INDEPENDENT, unlike the per-observer `seen`.
    const kc = buildFrame(w, 'c').events.filter((e) => e.k === 'sunk');
    expect(kc).toEqual([{ k: 'sunk', id: 'b', by: 'a', bty: 'v' }]);
  });

  it('the BOUNTY channel: `bty: "k"` (the LEADER did the sinking) rides identically too — including on a DRONE wreck', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0); // the throne holder — the killer this time
    place(w, 'b', ANNULUS_D, 0); // a captain victim
    place(w, 'c', 0, 800); // an uninvolved, out-of-sight bystander
    place(w, 'v', 900, 900); // a's earlier victim (the throne claim)
    w.sinkShip('v', 'a'); // a takes the throne
    w.step();
    w.sinkShip('b', 'a'); // the LEADER sinks a captain in fog
    w.step();
    const ka = buildFrame(w, 'a').events.filter((e) => e.k === 'sunk');
    expect(ka).toEqual([{ k: 'sunk', id: 'b', by: 'a', bty: 'k', vcls: 'torpedoBoat' }]);
    expect(Object.keys(ka[0])).toEqual(['k', 'id', 'by', 'bty', 'vcls']); // vcls LAST
    const kc = buildFrame(w, 'c').events.filter((e) => e.k === 'sunk');
    expect(kc).toEqual([{ k: 'sunk', id: 'b', by: 'a', bty: 'k' }]); // observer-independent
    // The leader sinks a DRONE: `bty: 'k'` legitimately rides the (private)
    // drone wreck — the event reaches only the witness and the killer, both
    // of whom already know the leader's identity from the public
    // ArenaState.bountyId, and `by` is already on the line. The out-of-sight
    // bystander gets NOTHING: drone sinkings are not public.
    const d = w.addShip('d', 'D', 'fleet', undefined, undefined, undefined); // a drone, in the leader's sight
    d.state.x = 200;
    d.state.y = 0;
    d.state.speed = 0;
    w.sinkShip('d', 'a');
    w.step();
    const kd = buildFrame(w, 'a').events.filter((e) => e.k === 'sunk');
    expect(kd).toEqual([{ k: 'sunk', id: 'd', by: 'a', seen: true, bty: 'k', vcls: 'torpedoBoat' }]);
    expect(buildFrame(w, 'c').events.filter((e) => e.k === 'sunk')).toEqual([]);
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

  it('spawns are visible to the spawner and to observers who can see the point', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    w.step(); // flush a's own join spawn
    const c = w.addShip('c', 'CHARLIE', undefined, undefined, undefined, undefined); // ring spawn, far from a
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

describe('perception — burst visibility (owner always, else burst point sighted)', () => {
  /** Route an internal burst subject through the real pending-events choke,
   *  the way World.resolveBurst emits it (wire BurstEvent + internal `own`). */
  function emitBurst(w: World, id: string, own: string, x: number, y: number): void {
    interface Pendable { pending: GameEvent[] }
    (w as unknown as Pendable).pending.push({ k: 'burst', id, x, y, own } as GameEvent);
    w.step();
  }

  it('the OWNER gets its burst even far beyond sight (the point is its own click)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    emitBurst(w, 'b1', 'a', 600, 0); // 600u away — far outside a's 330u sight
    const bursts = buildFrame(w, 'a').events.filter((e) => e.k === 'burst');
    expect(bursts).toEqual([{ k: 'burst', id: 'b1', x: 600, y: 0 }]); // bare shape, no `own`
  });

  it('a non-owner outside sight of the burst point NEVER receives it (fogged)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'c', -900, 0); // 1500u from the burst point
    emitBurst(w, 'b1', 'a', 600, 0);
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

  it('END-TO-END: a real gun burst reaches the fogged owner as {k,id,x,y} only', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.input = { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 600, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0, held: false };
    let burst: GameEvent | undefined;
    for (let i = 0; i < 120 && !burst; i++) {
      w.step();
      burst = buildFrame(w, 'a').events.find((e) => e.k === 'burst');
    }
    expect(burst).toBeDefined(); // owner-visible at 600u — nearly 3× sight range
    expect(Object.keys(burst!).sort()).toEqual(['id', 'k', 'x', 'y']); // no own/radius/range field
    expect((burst as BurstEvent).x).toBeCloseTo(600, 4); // bursts AT the clicked point
  });
});

describe('perception — mine visibility (owner-always, else DETECT+LOS — Story 4.9, never radar)', () => {
  // The detect rung, INDEPENDENTLY RE-DERIVED as a literal factor (never
  // CONFIG.vision.detect / detectFactor — the oracle rule).
  const DETECT = SIGHT * 1; // = sight (Story 9.1, Eric 2026-10-08; the 4/12 rung since Story 9.8) — never CONFIG.vision.detect

  it('the owner sees all its own mines everywhere; the enemy never radar-paints them', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 0, 0); // b co-located briefly; we only read its frame's mines
    injectMine(w, 'm1', 'a', 900, 900); // owner's mine, far outside any range
    const fa = buildFrame(w, 'a');
    expect(fa.mines).toEqual([{ id: 'm1', x: 900, y: 900, own: true, by: 'a', c: 'naval' }]); // own view carries the kind (8.13)
    // b sits at the origin — the mine is 1273u away, far beyond detect (and mines never paint).
    expect(buildFrame(w, 'b').mines).toEqual([]);
  });

  it('an enemy mine is visible at exactly the detect boundary, invisible just outside it', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectMine(w, 'm1', 'b', DETECT, 0); // exactly at detect — inclusive
    expect(buildFrame(w, 'a').mines).toEqual([{ id: 'm1', x: DETECT, y: 0, own: false, by: 'b', c: 'naval' }]); // the kind rides for the enemy too (cycle 162)
    w.mines.clear();
    injectMine(w, 'm2', 'b', DETECT + 0.01, 0); // a hair beyond detect
    expect(buildFrame(w, 'a').mines).toEqual([]);
  });

  it('the 3/8 band is GONE (Story 9.1, 2026-10-08): a mine at 300 u and one at sight itself are detected; a hair past sight is not', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectMine(w, 'm1', 'b', 300, 0); // inside sight — fogged under the old 3/8 rung, detected since 2026-10-08
    injectMine(w, 'm2', 'b', SIGHT, 0); // the boundary itself, inclusive
    expect(buildFrame(w, 'a').mines.map((m) => m.id).sort()).toEqual(['m1', 'm2']);
    injectMine(w, 'm3', 'b', SIGHT + 0.01, 0);
    expect(buildFrame(w, 'a').mines.map((m) => m.id).sort()).toEqual(['m1', 'm2']);
  });

  it('detect is OBSERVER-SCALED (amendment 121): a sight collapsed to the 1/12 rung collapses it; a sightRange boon widens it', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    injectMine(w, 'm1', 'b', 200, 0); // inside base detect, outside one rung
    expect(200).toBeGreaterThan(RADAR / 12);
    expect(buildFrame(w, 'a').mines.map((m) => m.id)).toEqual(['m1']);
    a.stats = { ...a.stats, sightRange: a.stats.radarRange / 12 }; // sight collapsed to one rung (a plain stats write) ⇒ detect one rung
    expect(buildFrame(w, 'a').mines).toEqual([]);
    a.stats = { ...a.stats, sightRange: SIGHT + 100 }; // boon-widened detect
    injectMine(w, 'm2', 'b', SIGHT + 50, 0); // beyond base detect, inside the widened one
    expect(buildFrame(w, 'a').mines.map((m) => m.id).sort()).toEqual(['m1', 'm2']);
  });

  it('an enemy mine inside an OWNED lit zone stays visible beyond detect (the OR-path is untouched)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectMine(w, 'm1', 'b', ANNULUS_D, 0); // beyond detect (= sight) — fogged on its own
    expect(buildFrame(w, 'a').mines).toEqual([]);
    injectZone(w, 'z1', 'a', ANNULUS_D, 0);
    expect(buildFrame(w, 'a').mines.map((m) => m.id)).toEqual(['m1']);
  });

  it('an enemy mine behind an island is invisible (LOS rule)', () => {
    const w = bareWorld();
    w.map.islands.push(circleIsland(60, 0, 25));
    place(w, 'a', 0, 0);
    injectMine(w, 'm1', 'b', 120, 0); // inside detect range but behind the rock
    expect(buildFrame(w, 'a').mines).toEqual([]);
  });

  it('arm state makes no difference to visibility', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectMine(w, 'armed', 'b', 100, 0, 0);
    injectMine(w, 'unarmed', 'b', 100, 20, w.now + CONFIG.mine.armDelay);
    expect(buildFrame(w, 'a').mines.map((m) => m.id).sort()).toEqual(['armed', 'unarmed']);
  });
});

describe('perception — torpedo DETECT gate vs shell truesight (Story 4.9: the sibling fork — SHELLS DO NOT MOVE)', () => {
  const DETECT = SIGHT * 1; // = sight (Story 9.1, Eric 2026-10-08; the 4/12 rung since Story 9.8) — never CONFIG.vision.detect
  const torpsOf = (f: FrameMsg) => f.events.filter((e): e is BallisticEvent => e.k === 'torp');

  it('a shell at exactly the truesight boundary reveals; since the 4/8 rung (2026-10-08) a torpedo at the same point reveals too — the fork closed', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectShell(w, 's1', 'b', SIGHT, 0, Math.PI, 400, false, 'shell');
    injectShell(w, 't1', 'b', 0, SIGHT, -Math.PI / 2, 400, false, 'torp');
    const f = buildFrame(w, 'a');
    expect(shellsOf(f).map((e) => e.id)).toEqual(['s1']); // shells unchanged at 330
    expect(torpsOf(f).map((e) => e.id)).toEqual(['t1']); // the torpedo's rung is sight now
    // ...and the two rows still part company a hair further out: neither reveals.
    const w2 = bareWorld();
    place(w2, 'a', 0, 0);
    injectShell(w2, 's2', 'b', SIGHT + 0.01, 0, Math.PI, 400, false, 'shell');
    injectShell(w2, 't2', 'b', 0, SIGHT + 0.01, -Math.PI / 2, 400, false, 'torp');
    const f2 = buildFrame(w2, 'a');
    expect(shellsOf(f2)).toEqual([]);
    expect(torpsOf(f2)).toEqual([]);
  });

  it('a torpedo reveals at exactly the detect boundary (inclusive), not a hair beyond', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectShell(w, 't1', 'b', DETECT, 0, Math.PI, 400, false, 'torp');
    expect(torpsOf(buildFrame(w, 'a')).map((e) => e.id)).toEqual(['t1']);
    const w2 = bareWorld();
    place(w2, 'a', 0, 0);
    injectShell(w2, 't2', 'b', DETECT + 0.01, 0, Math.PI, 400, false, 'torp');
    expect(torpsOf(buildFrame(w2, 'a'))).toEqual([]);
  });

  it('a torpedo just inside sight is revealed (the old 3/8 band is gone) and one just past sight is not', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectShell(w, 't1', 'b', SIGHT - 30, 0, Math.PI, 400, false, 'torp');
    injectShell(w, 't2', 'b', SIGHT + 10, 0, Math.PI, 400, false, 'torp');
    expect(torpsOf(buildFrame(w, 'a')).map((e) => e.id)).toEqual(['t1']);
  });

  it('the owner-always and owned-zone paths on the torp row are untouched', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectShell(w, 'own', 'a', 900, 900, 0, 400, false, 'torp'); // own fish, anywhere
    expect(torpsOf(buildFrame(w, 'a')).map((e) => e.id)).toEqual(['own']);
    injectShell(w, 'zoned', 'b', ANNULUS_D, 0, 0, 400, false, 'torp'); // far beyond detect
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
  const DETECT = SIGHT * 1; // = sight (Story 9.1, Eric 2026-10-08; the 4/12 rung since Story 9.8) — never CONFIG.vision.detect
  const torpsOf = (f: FrameMsg) => f.events.filter((e): e is BallisticEvent => e.k === 'torp');
  const ballisticsOf = (f: FrameMsg, kind: 'shell' | 'torp') => f.events.filter((e): e is BallisticEvent => e.k === kind);
  const isBallisticEvent = (e: GameEvent): e is BallisticEvent => e.k === 'shell' || e.k === 'torp';

  /** Build `n` frames for `id` and return every ballistic event of `kind`. */
  function collect(w: World, id: string, kind: 'shell' | 'torp', n: number): BallisticEvent[] {
    const out: BallisticEvent[] = [];
    for (let i = 0; i < n; i++) out.push(...ballisticsOf(buildFrame(w, id), kind));
    return out;
  }

  for (const [kind, ring] of [['torp', DETECT], ['shell', SIGHT]] as const) {
    it(`${kind}: revealed at the ${kind === 'torp' ? 'detect' : 'sight'} ring, silent outside it, revealed AGAIN on re-entry — exactly two events over the run`, () => {
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

  it('a running fish crosses INTO the detect ring, the observer is pulled away for a tick, then returns: two reveals, each with the fish\'s CURRENT params and t = now', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    injectShell(w, 't1', 'b', -DETECT - 30, 0, 0, 5_000, false, 'torp'); // closing +x, outside detect
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
    a.state.x = 3_000; // yanked clear of everything for one tick: the mark is dropped
    w.step();
    expect(torpsOf(buildFrame(w, 'a'))).toEqual([]);
    expect(a.seenBallistics.has('t1')).toBe(false);
    a.state.x = 0; // and back
    w.step();
    const again = torpsOf(buildFrame(w, 'a'));
    const live = w.shells.get('t1')!;
    expect(again).toEqual([{ k: 'torp', id: 't1', x: live.x, y: live.y, vx: live.vx, vy: live.vy, t: w.now }]);
    expect(again[0].t).toBeGreaterThan(firstT); // the re-reveal time, never the first reveal's
    expect(Math.hypot(live.x, live.y)).toBeLessThanOrEqual(DETECT); // re-revealed INSIDE the gate
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

  it('the gate SHRINKING under the projectile is an exit too: cleared while sight is shrunk, re-revealed when it returns', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    injectShell(w, 't1', 'b', 200, 0, Math.PI / 2, 900, false, 'torp'); // inside detect, outside a sight shrunk to one rung
    expect(collect(w, 'a', 'torp', 2).map((e) => e.id)).toEqual(['t1']);
    const full = a.stats;
    a.stats = { ...a.stats, sightRange: a.stats.radarRange / 12 }; // one rung (Story 9.8) — a plain stats write
    expect(collect(w, 'a', 'torp', 2)).toEqual([]);
    expect(a.seenBallistics.has('t1')).toBe(false);
    a.stats = full;
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
    a.state.x = -SIGHT; // the fish (150,0) is sight + 150 off: outside detect
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

describe('perception — the mz/sm halo is TIGHT at the 6/12 rung, SIGHT*1.5 (Story 9.8: a case that FAILS if production kept the eighths ratio, 5/8 of radar)', () => {
  it('an observer just past the 6/12 halo — still inside 5/8 of radar — receives neither mz nor sm', () => {
    const w = bareWorld();
    const halo = SIGHT * 1.5;
    expect(RADAR * 0.625).toBeGreaterThan(halo + 10); // the old ratio would have reached it
    place(w, 'a', halo + 10, 0);
    emitWorldEvent(w, { k: 'mz', x: 0, y: 0 });
    emitWorldEvent(w, { k: 'sm', x: 0, y: 0, tier: 1 });
    const f = buildFrame(w, 'a');
    expect(f.events.filter((e) => e.k === 'mz' || e.k === 'sm')).toEqual([]);
  });

  it('an observer at exactly SIGHT*1.5 receives both (boundary inclusive) — the emission is real, not vacuous', () => {
    const w = bareWorld();
    place(w, 'a', SIGHT * 1.5, 0);
    emitWorldEvent(w, { k: 'mz', x: 0, y: 0 });
    emitWorldEvent(w, { k: 'sm', x: 0, y: 0, tier: 1 });
    const kinds = buildFrame(w, 'a').events.map((e) => e.k).sort();
    expect(kinds).toEqual(['mz', 'sm']);
  });
});

// ---------- directed cases: lit zones (Story 1.7) -----------------------------

describe('perception — lit zones: firer-only truesight parity ("lit from above")', () => {
  const LIT_R = CONFIG.starShells.litRadius;

  it('the FIRER gains a full contact for a ship inside its zone, far beyond sight and radar', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', BEYOND_RADAR, 0, 2.1); // way outside sight AND radar
    injectZone(w, 'z1', 'a', BEYOND_RADAR, 0);
    expect(buildFrame(w, 'a').contacts).toEqual([
      { id: 'b', x: BEYOND_RADAR, y: 0, heading: 2.1, speed: 0, cls: 'torpedoBoat' },
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
    expect(maskEquals(maskOracle(b.hullId, b.state.x, b.state.y, b.state.heading, w.now), blips[0])).toBe(true);
  });

  it('the firer watches a zone-revealed ship die: boom (victim id KEPT) + sunk arrive', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    const b = place(w, 'b', 900, 0); // far outside a's sight — pre-1.7 the owner got NO boom here
    b.hp = CONFIG.gun.damage; // the next hit sinks it (derived — the cannon moved 16 → 12, Story 9.8)
    injectZone(w, 'z1', 'a', 900, 0);
    injectShell(w, 's1', 'a', 880, 0, 0, 100); // a's shell, point-blank on b
    w.step();
    const fa = buildFrame(w, 'a');
    // Boom point zone-covered => visible; victim center zone-covered => hit un-stripped.
    expect(fa.events.filter((e) => e.k === 'boom')).toEqual([
      { k: 'boom', id: 's1', hit: 'b', x: expect.any(Number), y: expect.any(Number) },
    ]);
    // Wreck inside the owned zone => the sunk arrives WITNESSED (seen: true).
    expect(fa.events.filter((e) => e.k === 'sunk')).toEqual([
      { k: 'sunk', id: 'b', by: 'a', seen: true, vcls: 'torpedoBoat' },
    ]);
    // dmg stays victim-private even under the zone (truesight parity, not omniscience).
    expect(fa.events.filter((e) => e.k === 'dmg')).toEqual([]);
  });

  it("a kill inside someone ELSE's zone: the boom never leaks; the sunk is public but UNSEEN (PV 23)", () => {
    const w = bareWorld();
    place(w, 'c', 0, 0); // non-owner observer
    const b = place(w, 'b', 900, 0);
    b.hp = CONFIG.gun.damage; // the next hit sinks it
    injectZone(w, 'z1', 'a', 900, 0); // a's zone — c gains nothing from it
    injectShell(w, 's1', 'a', 880, 0, 0, 100);
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
    place(w, 'b', 900 + LIT_R, 0); // center exactly ON the edge — inclusive
    injectZone(w, 'z1', 'a', 900, 0);
    expect(buildFrame(w, 'a').contacts.map((c) => c.id)).toEqual(['b']);
    w.ships.get('b')!.state.x = 900 + LIT_R + 0.01; // a hair outside
    expect(buildFrame(w, 'a').contacts).toEqual([]);
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
    injectMine(w, 'm1', 'b', 890, 0); // inside the zone, far beyond a's sight
    injectMine(w, 'm2', 'b', 900 + LIT_R + 1, 0); // outside the zone edge — stays hidden
    injectZone(w, 'z1', 'a', 900, 0);
    expect(buildFrame(w, 'a').mines).toEqual([{ id: 'm1', x: 890, y: 0, own: false, by: 'b', c: 'naval' }]);
  });

  it("an unseen ballistic inside the firer's zone materializes exactly once, with current params", () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectShell(w, 's1', 'b', 880, 0, Math.PI / 2, 400); // b's shell, deep inside the zone
    injectZone(w, 'z1', 'a', 900, 0);
    const ev = shellsOf(buildFrame(w, 'a'))[0];
    expect(ev).toBeDefined();
    const sh = w.shells.get('s1')!;
    expect({ x: ev.x, y: ev.y }).toEqual({ x: sh.x, y: sh.y }); // current pos, never the launch point
    assertBallisticShape(ev); // constant-free wire shape holds on the zone path too
    expect(shellsOf(buildFrame(w, 'a'))).toEqual([]); // exactly-once memory unchanged
  });

  it("a ballistic inside someone ELSE's zone stays hidden from a non-owner", () => {
    const w = bareWorld();
    place(w, 'c', 0, 0); // non-owner, shell far outside its sight
    injectShell(w, 's1', 'b', 880, 0, Math.PI / 2, 400);
    injectZone(w, 'z1', 'a', 900, 0); // a's zone, not c's
    expect(shellsOf(buildFrame(w, 'c'))).toEqual([]);
  });
});

describe('perception — litZones channel (owner always, else radar-gated; frames omit when empty)', () => {
  it('the owner always receives its zone circle; a frame with no visible zones omits the key', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'far', 5_000, 0); // hypothetical far observer (outside radar of everything)
    injectZone(w, 'z1', 'a', RADAR + 500, 0, CONFIG.starShells.litRadius, 42_000);
    const fa = buildFrame(w, 'a');
    expect(fa.litZones).toEqual([
      { id: 'z1', x: RADAR + 500, y: 0, r: CONFIG.starShells.litRadius, until: 42_000, by: 'a' },
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
    place(w, 'far', 5_000, 0);
    injectBurnZone(w, 'bz1', 'a', RADAR + 500, 0, R, 42_000, 7);
    const fa = buildFrame(w, 'a');
    expect(fa.burnZones).toEqual([{ id: 'bz1', x: RADAR + 500, y: 0, r: R, until: 42_000, by: 'a' }]);
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
    place(w, 'b', BEYOND_RADAR, 0, 2.1); // way outside sight AND radar
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
    place(w, 'far', 5_000, 0);
    injectFoulZone(w, 'fz1', 'a', RADAR + 500, 0, R, 42_000);
    const fa = buildFrame(w, 'a');
    expect(fa.foulZones).toEqual([{ id: 'fz1', x: RADAR + 500, y: 0, r: R, until: 42_000, by: 'a' }]);
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
    place(w, 'b', BEYOND_RADAR, 0, 2.1); // way outside sight AND radar
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

// ---------- Story 5.6: the self-private aggro mark (directed) -----------------

describe('perception — Contact.aggro is SELF-PRIVATE (Story 5.6, amendment 40)', () => {
  /** Register a PvE fleet hull at an exact pose (the wave spawner's own seam). */
  function fleet(w: World, id: string, x: number, y: number): ShipRecord {
    const rec = w.addShip(id, 'DRONE', 'fleet', 'droneMedium', undefined, { x, y });
    rec.state.speed = 0;
    w.drones.add(id, 'medium', 1, { x: 0, y: 0 });
    return rec;
  }

  /** The one contact for `id` in `viewer`'s frame. */
  function contactOf(w: World, viewer: string, id: string): Contact {
    const c = buildFrame(w, viewer, 'active').contacts.find((x) => x.id === id);
    expect(c, `${viewer} should see ${id}`).toBeDefined();
    return c!;
  }

  it('the HUNTED captain gets it; a THIRD-PARTY watching the same hull never does', () => {
    const w = bareWorld();
    const f = fleet(w, 'f', 0, 0);
    place(w, 'hunted', 100, 0);
    place(w, 'bystander', -100, 0);
    // Both captains can see the fleet hull — identical vision, one difference.
    expect(contactOf(w, 'hunted', 'f').aggro).toBeUndefined();
    expect(contactOf(w, 'bystander', 'f').aggro).toBeUndefined();

    w.drones.onDamaged('f', 'hunted', false); // it acquires `hunted`
    expect(w.drones.targetOf('f')).toBe('hunted');

    const mine = contactOf(w, 'hunted', 'f');
    expect(mine.aggro).toBe(true);
    expect(Object.keys(mine)).toEqual(['id', 'x', 'y', 'heading', 'speed', 'cls', 'aggro']);

    const theirs = contactOf(w, 'bystander', 'f');
    expect('aggro' in theirs).toBe(false); // OMITTED, not false
    expect(Object.keys(theirs)).toEqual(['id', 'x', 'y', 'heading', 'speed', 'cls']);
    expect(f.role).toBe('fleet');
  });

  it('a SPECTATOR never receives it, even for the hull that was hunting them', () => {
    const w = bareWorld();
    fleet(w, 'f', 0, 0);
    const dead = place(w, 'dead', 100, 0);
    w.drones.onDamaged('f', 'dead', false);
    expect(w.drones.targetOf('f')).toBe('dead');
    // Drive the captain all the way to `sunk` so frames.ts routes them onto
    // the unfogged spectator path.
    w.respawnEnabled = false;
    w.sinkShip('dead');
    for (let i = 0; i < Math.ceil(CONFIG.ship.sinkingWindowMs / CONFIG.tick.simDtMs) + 2; i++) w.step();
    expect(isAfloat(dead.lifecycle)).toBe(false);
    const frame = buildFrame(w, 'dead', 'active');
    expect(frame.spec).toBe(true);
    for (const c of frame.contacts) expect('aggro' in c).toBe(false);
  });

  it('a CAPTAIN contact never carries it, however the field is arranged', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 100, 0);
    // Even with the controller asked directly about two captains, the answer
    // is structurally false: only fleet hulls have minds.
    expect(w.drones.isTargeting('b', 'a')).toBe(false);
    expect('aggro' in contactOf(w, 'a', 'b')).toBe(false);
    expect(a.role).toBe('captain');
  });

  it('the mark CLEARS the moment the hull loses its target (memory expiry)', () => {
    const w = bareWorld();
    const f = fleet(w, 'f', 0, 0);
    const cap = place(w, 'cap', 100, 0);
    w.drones.onDamaged('f', 'cap', false);
    expect(contactOf(w, 'cap', 'f').aggro).toBe(true);
    // Break contact and hold the pose: after memoryMs the target is dropped,
    // and the mark must vanish with it (no stale attribute on the wire).
    for (let i = 0; i < Math.ceil(CONFIG.fleet.memoryMs / CONFIG.tick.simDtMs) + 4; i++) {
      cap.state.x = 100;
      cap.state.y = 0;
      f.state.x = 3000; // out of the fleet hull's sight
      f.state.y = 0;
      w.step();
    }
    expect(w.drones.targetOf('f')).toBeNull();
    f.state.x = 0; // back into view, still un-targeted
    f.state.y = 0;
    expect('aggro' in contactOf(w, 'cap', 'f')).toBe(false);
  });
});

// ---------- Story 5.6: SunkEvent.vcls, killer-only (directed) ------------------

describe('perception — SunkEvent.vcls reaches the CREDITED KILLER alone (amendment 43)', () => {
  /** The sunk rows in one observer's frame this tick. */
  function sunkRows(w: World, viewer: string, phase: MatchPhase = 'active'): SunkEvent[] {
    return buildFrame(w, viewer, phase).events.filter((e): e is SunkEvent => e.k === 'sunk');
  }

  it('the killer learns the class of a fleet hull they NEVER SAW (the mine case)', () => {
    const w = bareWorld();
    const killer = place(w, 'killer', 0, 0);
    // 2000u away — far outside sight (330u) and outside radar (660u) alike.
    // This is precisely the disclosure the client cannot reconstruct: no
    // roster row, no contact, no blip, and the wreck was never rendered.
    const victim = w.addShip('f', 'DRONE', 'fleet', 'droneSmall', undefined, { x: 2000, y: 0 });
    expect(sighted(w, killer, victim.state)).toBe(false);
    w.sinkShip('f', 'killer');
    w.step();
    const rows = sunkRows(w, 'killer');
    expect(rows).toHaveLength(1);
    expect(rows[0].vcls).toBe('droneSmall');
    expect(rows[0].seen).toBeUndefined(); // and NOT witnessed — no spatial licence
    expect(Object.keys(rows[0])).toEqual(['k', 'id', 'by', 'vcls']); // key ORDER pinned
  });

  it('a third party who WITNESSED the same sinking gets the row WITHOUT vcls', () => {
    const w = bareWorld();
    place(w, 'killer', 0, 0);
    const bystander = place(w, 'bystander', 100, 0);
    const victim = w.addShip('f', 'DRONE', 'fleet', 'droneLarge', undefined, { x: 150, y: 0 });
    expect(sighted(w, bystander, victim.state)).toBe(true); // genuinely watched it go down
    w.sinkShip('f', 'killer');
    w.step();
    const theirs = sunkRows(w, 'bystander');
    expect(theirs).toHaveLength(1);
    expect('vcls' in theirs[0]).toBe(false); // OMITTED, not undefined
    expect(theirs[0].seen).toBe(true); // they DID witness it — the two are independent
    expect(sunkRows(w, 'killer')[0].vcls).toBe('droneLarge'); // ...and the killer still gets it
  });

  /** Sink `id` and run the sinking window out, so their next frame is the
   *  unfogged spectator view (frame.spec === true). */
  function spectateOut(w: World, id: string, by: string): void {
    w.respawnEnabled = false;
    w.sinkShip(id, by);
    for (let i = 0; i < Math.ceil(CONFIG.ship.sinkingWindowMs / CONFIG.tick.simDtMs) + 2; i++) w.step();
  }

  it('a SPECTATOR who is not the killer never receives it', () => {
    const w = bareWorld();
    const watcher = place(w, 'watcher', 100, 0);
    place(w, 'killer', 0, 0);
    w.addShip('f', 'DRONE', 'fleet', 'droneMedium', undefined, { x: 150, y: 0 });
    spectateOut(w, 'watcher', 'killer');
    expect(isAfloat(watcher.lifecycle)).toBe(false);
    w.sinkShip('f', 'killer'); // someone ELSE's kill, while they watch
    w.step();
    const frame = buildFrame(w, 'watcher', 'active');
    expect(frame.spec).toBe(true);
    const rows = frame.events.filter((e): e is SunkEvent => e.k === 'sunk');
    expect(rows).toHaveLength(1);
    expect('vcls' in rows[0]).toBe(false); // the unfogged view is not a licence
  });

  it('a SPECTATOR who IS the credited killer DOES receive it (the mine you laid before you died)', () => {
    // The view mode is NOT a gate (orchestrator ruling, review gate): amendment
    // 43's "witnesses and spectators included" names observers who are not the
    // killer. A mine laid before you went down, tripped by a fleet ship while
    // you spectate, is exactly the kill "I want to know the kills I get when I
    // get them" is about — and the SIZE is the payout.
    const w = bareWorld();
    const killer = place(w, 'killer', 0, 0);
    place(w, 'watcher', 100, 0);
    // 2000u away: never sighted, and now the killer has no hull to see with.
    w.addShip('f', 'DRONE', 'fleet', 'droneMedium', undefined, { x: 2000, y: 0 });
    spectateOut(w, 'killer', 'watcher');
    expect(isAfloat(killer.lifecycle)).toBe(false);
    w.sinkShip('f', 'killer'); // the trap springs posthumously
    w.step();
    const frame = buildFrame(w, 'killer', 'active');
    expect(frame.spec).toBe(true);
    const rows = frame.events.filter((e): e is SunkEvent => e.k === 'sunk');
    expect(rows).toHaveLength(1);
    expect(rows[0].vcls).toBe('droneMedium');
    expect(Object.keys(rows[0])).toEqual(['k', 'id', 'by', 'seen', 'vcls']); // key ORDER pinned
    // The BICONDITIONAL, restated on the spectator path: verifySunk's own
    // `vcls` clause is mode-free and would pass here, but the rest of that
    // oracle re-derives the WITNESS geometry, which the unfogged path stamps
    // unconditionally — so the vcls half is asserted directly instead of
    // running a fogged-frame oracle over a spec frame.
    const creditedToMe = rows[0].by === 'killer';
    expect(creditedToMe).toBe(true);
    expect('vcls' in rows[0]).toBe(creditedToMe);
    expect(rows[0].vcls).toBe(w.ships.get('f')!.hullId);
  });

  it('a CAPTAIN victim carries it to their killer too — the rule is uniform', () => {
    const w = bareWorld();
    place(w, 'killer', 0, 0);
    place(w, 'rival', 3000, 0); // unsighted, exactly like the fleet case
    w.sinkShip('rival', 'killer');
    w.step();
    expect(sunkRows(w, 'killer')[0].vcls).toBe('torpedoBoat');
  });

  it('a STORM death (no killer) carries it to nobody', () => {
    const w = bareWorld();
    place(w, 'watcher', 0, 0);
    w.addShip('f', 'DRONE', 'fleet', 'droneSmall', undefined, { x: 150, y: 0 });
    w.sinkShip('f'); // unattributed
    w.step();
    const rows = sunkRows(w, 'watcher');
    expect(rows).toHaveLength(1);
    expect('vcls' in rows[0]).toBe(false);
    expect('by' in rows[0]).toBe(false);
  });
});

// ---------- Story 7.6: SunkEvent.kcls, fleet killers only (directed) ----------

describe('perception — SunkEvent.kcls names a FLEET killer and never a captain (Story 7.6)', () => {
  /** The sunk rows in one observer's frame this tick. */
  function sunkRows(w: World, viewer: string, phase: MatchPhase = 'active'): SunkEvent[] {
    return buildFrame(w, viewer, phase).events.filter((e): e is SunkEvent => e.k === 'sunk');
  }

  it('names the fleet hull that sank a captain — to EVERY client, unsighted (the ruling)', () => {
    // Eric 2026-08-21: *"Yes I want to see that Bob was killed by SMALL DRONE if
    // that's what happened."* A captain victim's sinking is PUBLIC, so the line
    // renders on every client; the killer is 2000u away, so no observer holds a
    // contact, a blip or a hull memo for it. Only the wire can answer.
    const w = bareWorld();
    const victim = place(w, 'bob', 0, 0);
    const watcher = place(w, 'watcher', 60, 0);
    const drone = w.addShip('f', 'DRONE', 'fleet', 'droneSmall', undefined, { x: 2000, y: 0 });
    expect(sighted(w, victim, drone.state)).toBe(false);
    expect(sighted(w, watcher, drone.state)).toBe(false);
    w.sinkShip('bob', 'f');
    w.step();
    for (const viewer of ['bob', 'watcher']) {
      const rows = sunkRows(w, viewer);
      expect(rows).toHaveLength(1);
      expect(rows[0].kcls).toBe('droneSmall');
    }
    // OBSERVER-INDEPENDENT: identical value for the victim and the bystander.
    expect(sunkRows(w, 'bob')[0].kcls).toBe(sunkRows(w, 'watcher')[0].kcls);
    // KEY ORDER pinned, kcls LAST — after vcls, which the fleet killer does not
    // receive here (it is not an observer).
    expect(Object.keys(sunkRows(w, 'watcher')[0])).toEqual(['k', 'id', 'by', 'seen', 'kcls']);
  });

  it('A CAPTAIN KILLER IS NEVER NAMED — the constraint the whole design rests on', () => {
    // A captain's hull class is not disclosed by this row, and this row is
    // PUBLIC for a captain victim. Stamping `by`'s class unconditionally would
    // broadcast every killer's build fact to the whole room.
    const w = bareWorld();
    place(w, 'killer', 0, 0);
    place(w, 'victim', 3000, 0);
    place(w, 'watcher', 60, 0);
    w.sinkShip('victim', 'killer');
    w.step();
    for (const viewer of ['killer', 'victim', 'watcher']) {
      const rows = sunkRows(w, viewer);
      expect(rows).toHaveLength(1);
      expect('kcls' in rows[0]).toBe(false); // OMITTED, not undefined
    }
  });

  it('AN AI CAPTAIN (role "bot") IS NEVER NAMED EITHER — participants, not world content', () => {
    // The gate reads the Story 6.3 role seam's FLEET-HULL reading, not "is not
    // a human": a bot is a captain for every disclosure purpose.
    const w = bareWorld();
    const bot = w.addShip('ai', 'AI', 'bot', 'battleship', undefined, { x: 0, y: 0 });
    expect(bot.role).toBe('bot');
    place(w, 'victim', 3000, 0);
    place(w, 'watcher', 60, 0);
    w.sinkShip('victim', 'ai');
    w.step();
    for (const viewer of ['victim', 'watcher']) {
      expect('kcls' in sunkRows(w, viewer)[0]).toBe(false);
    }
  });

  it('a FLEET victim of a FLEET killer names the killer only on the rows that reach an observer', () => {
    // Both halves on one row: `vcls` (the credited killer alone — here nobody,
    // since the credited killer is a drone with no client) and `kcls`.
    const w = bareWorld();
    const watcher = place(w, 'watcher', 0, 0);
    const target = w.addShip('t', 'DRONE', 'fleet', 'droneLarge', undefined, { x: 150, y: 0 });
    w.addShip('f', 'DRONE', 'fleet', 'droneMedium', undefined, { x: 2000, y: 0 });
    expect(sighted(w, watcher, target.state)).toBe(true); // a drone sinking needs a witness
    w.sinkShip('t', 'f');
    w.step();
    const rows = sunkRows(w, 'watcher');
    expect(rows).toHaveLength(1);
    expect(rows[0].kcls).toBe('droneMedium');
    expect('vcls' in rows[0]).toBe(false); // the watcher did not fire
    expect(Object.keys(rows[0])).toEqual(['k', 'id', 'by', 'seen', 'kcls']);
  });

  it('a STORM death (no killer) and a SELF-SINK both carry it to nobody', () => {
    const w = bareWorld();
    const watcher = place(w, 'watcher', 0, 0);
    const drone = w.addShip('f', 'DRONE', 'fleet', 'droneSmall', undefined, { x: 150, y: 0 });
    expect(sighted(w, watcher, drone.state)).toBe(true);
    w.sinkShip('f'); // unattributed
    w.step();
    expect('kcls' in sunkRows(w, 'watcher')[0]).toBe(false);
    // A self-sink credits nobody (creditKill's own attribution rule), so a
    // fleet hull that goes down on its own id must not name ITSELF as killer.
    const w2 = bareWorld();
    const w2watcher = place(w2, 'watcher', 0, 0);
    const d2 = w2.addShip('f', 'DRONE', 'fleet', 'droneSmall', undefined, { x: 150, y: 0 });
    expect(sighted(w2, w2watcher, d2.state)).toBe(true);
    w2.sinkShip('f', 'f');
    w2.step();
    expect('kcls' in sunkRows(w2, 'watcher')[0]).toBe(false);
  });

  it('a killer whose record is already GONE omits the key rather than guessing', () => {
    const w = bareWorld();
    place(w, 'victim', 0, 0);
    place(w, 'watcher', 60, 0);
    w.addShip('f', 'DRONE', 'fleet', 'droneLarge', undefined, { x: 2000, y: 0 });
    w.sinkShip('victim', 'f');
    w.removeShip('f');
    w.step();
    expect('kcls' in sunkRows(w, 'watcher')[0]).toBe(false);
  });
});

// ---------- Story 4.12: radar wakes (directed) --------------------------------

describe('perception — radar wakes (Story 4.12, directed)', () => {
  it('discloses exactly the swept segments — in-sight water included (amendment 210: no inner bound)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 900, 900); // its WATER, not its hull, is under test
    // Pin the production-derived ribbon constants against LITERALS (the
    // oracle-independence rule): a torpedo boat's water lives 5.5s (cut from
    // 12s by amendment 213) and its turbulent core is its own 9u beam.
    expect(b.wake.lifeMs).toBe(5_500);
    expect(b.wake.widthU).toBe(9);
    // A straight laid track along y=0 from inside sight out to ANNULUS_D
    // (annulus, inside the dropout's flat band): 26 samples on the 12u
    // cadence, ages spread over 5s — the spread is kept INSIDE the life so
    // the whole fixture track is live water.
    injectWakeTrack(b.wake, ANNULUS_D, 0, 0, 26, w.now, 5_000);
    const firstMid = ANNULUS_D - 25 * 12 + 6; // the oldest segment's midpoint
    expect(firstMid).toBeLessThan(SIGHT - 50); // deep inside sight
    windowAround(a, 0);
    const f = buildFrame(w, 'a');
    verifyFrame(w, 'a', f); // the completeness oracle: exactly the gated segments
    const wks = f.events.filter((e): e is WakeBlipEvent => e.k === 'wk');
    expect(wks.length).toBeGreaterThan(0);
    // The track's age spread reaches the wire as more than one bucket.
    expect(new Set(wks.map((e) => e.a)).size).toBeGreaterThan(1);
    // In-bubble water rides the row like any radar return: a disclosed mask
    // covers the cell containing the oldest midpoint, deep inside sight.
    const cellX = Math.floor(firstMid / RCELL_U);
    const cellY = Math.floor(0 / RCELL_U);
    expect(wks.some((e) => coverageHas(e, cellX - e.gx, cellY - e.gy))).toBe(true);
    // An unswept bearing discloses nothing at all.
    windowAround(a, Math.PI);
    expect(buildFrame(w, 'a').events.some((e) => e.k === 'wk')).toBe(false);
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
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 900, 900);
    injectWakeTrack(b.wake, ANNULUS_D, 0, 0, 10, w.now, 2_000);
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

  it("a torpedo's water paints while the fish itself stays silent beyond detect (amendment 196)", () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    // A live fish at ANNULUS_D — beyond the detect rung (= sight): its
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

  it('torpedo and ship water disclose at EVERY distance — past sight, just inside it, deep inside detect (amendment 210: no inner bound)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    // HISTORY: review-gate P2 gave torpedo water a detect inner bound and
    // ship water a sight inner bound. Amendment 210 (Eric 2026-10-21: the
    // server returns the entire sweep) retired both — water is a radar
    // return at any distance, gated by sweep, shadow and dropout alone.
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
    // ...and deep inside the detect rung.
    const innerEnd = SIGHT - 100;
    const inner: WakeRibbon = { xs: new Float64Array(cap), ys: new Float64Array(cap), ts: new Float64Array(cap), cap, head: 0, count: 0, lifeMs: 2_750, widthU: 9, torp: true, hullAheadU: 0 };
    injectWakeTrack(inner, innerEnd, 0, 0, 4, w.now, 2_000); // inside detect
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
  // THE SHIELD BLOCK SEAT (Story 8.16, amendments 116–118) is SELF-PRIVATE on
  // the same terms: it may exist NOWHERE but `you`, and on `you` it is present
  // IFF the observer's own shield is UP (hp left, not yet expired), carrying
  // the record's hp ROUNDED UP and its exact deadline.
  expect(JSON.stringify(withoutYou)).not.toContain('"shield"');
  if (f.you !== undefined) {
    const sh = me.shield;
    const up = sh !== null && sh.hpLeft > 0 && w.now < sh.until;
    expect('shield' in f.you).toBe(up);
    if (up) expect(f.you.shield).toEqual({ hp: Math.ceil(sh!.hpLeft), until: sh!.until }); // whole-number readout (P5)
  }
  // THE SEAT'S GUN AND THE HELD LEVEL never ride anything but `you` (the gun,
  // Story 8.14) — and `held` is INPUT, which no frame carries at all: a
  // machine-gun stream is disclosed only through its shells' reveals and
  // their flashes, never as "this hull's button is down".
  expect(JSON.stringify(withoutYou)).not.toContain('"gun"');
  expect(JSON.stringify(f)).not.toContain('"held"');
  if (f.you !== undefined) expect(f.you.gun).toBe(me.gun);
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
  // THE LAUNCH POINT AND THE ATTENUATION REFERENCE (Story 9.12, epic-9
  // amendment 184(b)): a deck-gun shell carries `originX` / `originY` /
  // `attenRangeU` for the range attenuation and NEVER a frame — the muzzle
  // would become solvable; the ballistic reveal is built field by field. (The
  // amendment-202 cursor point these lines used to guard is deleted.)
  expect(hasForbiddenKey(f, ['originX', 'originY', 'attenRangeU', 'cursor'])).toBe(false);
  // THE SEAT'S GUN IS SELF-PRIVATE (Story 8.14, amendment 95), on exactly the
  // terms `cls` is: it rides `you` and NOTHING else. Which gun an enemy picked
  // is build information, so a whole-frame text scan with `you` spliced out is
  // the structural half — no contact, event, blip or spectator payload may
  // start carrying it.
  if (f.you) expect(f.you.gun).toBe(me.gun);
  expect(JSON.stringify(withoutYou)).not.toContain('"gun"');
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
      (c) => w.now < c.until && segPointDistOracle(me.state, other.state, c) <= cloudOutlineOracle(c.bornAt, w.now),
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
  // ...and the DETECT rung pays the same toll: an enemy mine or fish inside
  // geometric detect with LOS, no owned zone, that the toll pushed out is on
  // no channel (FOG_HID_MINE_OR_TORP).
  if (isAfloat(me.lifecycle)) {
    for (const mine of w.mines.values()) {
      if (mine.ownerId === me.id || zoneCovers(w, me, mine)) continue;
      if (dist(me.state, mine) > 1 * effSight(w, me) || !clearLos(me.state, mine, w.map.islands)) continue;
      if (detected(w, me, mine)) continue;
      FOG_HID_MINE_OR_TORP.n += 1;
      expect(f.mines.some((m) => m.id === mine.id), `fog should hide mine ${mine.id} from ${me.id}`).toBe(false);
    }
    for (const sh of w.shells.values()) {
      if (sh.kind !== 'torp' || sh.ownerId === me.id || zoneCovers(w, me, sh)) continue;
      if (dist(me.state, sh) > 1 * effSight(w, me) || !clearLos(me.state, sh, w.map.islands)) continue;
      if (detected(w, me, sh)) continue;
      FOG_HID_MINE_OR_TORP.n += 1;
      expect(f.events.some((e) => (e.k === 'torp' || e.k === 'torpU') && e.id === sh.id), `fog should hide fish ${sh.id} from ${me.id}`).toBe(false);
    }
    // ...and the 750 u halo pays it too (amendment 167): a flash or a puff
    // inside the GEOMETRIC halo with LOS that the toll pushed out is withheld
    // (FOG_HID_SM counts the puffs; both kinds are asserted).
    const halo = me.stats.radarRange * CONFIG.vision.muzzleFlashFactor;
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
    verifyAggro(w, me, c, target);
  }
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
  for (const d of f.decoys ?? []) verifyDecoy(w, me, d);
  // The OWNER always sees its own decoys (own field awareness, even under fog).
  for (const d of w.decoys.values()) {
    if (d.ownerId === me.id) expect((f.decoys ?? []).some((v) => v.id === d.id), `own decoy ${d.id} delivered`).toBe(true);
  }
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
  verifyBlipOrdering(w, f);
  verifyBlipCompleteness(w, me, f);
  verifyWakeCompleteness(w, me, f);
}

/**
 * THE SELF-PRIVATE AGGRO ORACLE (Story 5.6, epic-5 amendment 40) —
 * INDEPENDENTLY REIMPLEMENTED, in the style every declared exception in this
 * suite carries. `Contact.aggro` is NOT a seventh perception exception: it
 * discloses nothing spatial (the row only ran because the contact was already
 * visible), so it is verified as an ATTRIBUTE rule, both directions:
 *
 *   PRESENT  <=>  the contact is a PvE fleet hull whose current target is
 *                 THIS observer. Not "some observer" — this one.
 *   ABSENT   for every captain contact, every un-aggroed fleet hull, and
 *            every fleet hull hunting somebody else.
 *
 * And it is `true` or missing — never `false`, which would put a dead key on
 * the wire and (worse) make "no mark" and "mark says no" two different states.
 */
function verifyAggro(w: World, me: ShipRecord, c: Contact, target: ShipRecord): void {
  const hunted = target.role === 'fleet' && w.drones.targetOf(target.id) === me.id;
  if (hunted) {
    expect(c.aggro).toBe(true);
  } else {
    expect('aggro' in c).toBe(false);
  }
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
    if (!blipPredicate(w, me, target.state, target.id)) continue;
    if (fogTollOracle(w, me.state, target.state).touched > 0) RADAR_THROUGH_FOG.n += 1; // Story 9.10: painted through fog
    const s = target.state;
    out.push({ mask: maskOracle(target.hullId, s.x, s.y, s.heading, w.now), label: `gated ship ${target.id}` });
  }
  return out;
}

/** DECOY paints (Story 8.16): one per live decoy passing the observer's own
 *  point-blip predicate — the OWNER INCLUDED (the orchestrator ruling: the
 *  owner's radar paints their own decoy through the same gate, no special
 *  case). */
function expectedDecoyBlips(w: World, me: ShipRecord): ExpectedBlip[] {
  const out: ExpectedBlip[] = [];
  for (const d of w.decoys.values()) {
    if (!blipPredicate(w, me, d, d.id)) continue;
    if (fogTollOracle(w, me.state, d).touched > 0) RADAR_THROUGH_FOG.n += 1; // Story 9.10: a decoy paint is fog-blind too
    out.push({ mask: decoyMaskOracle(d, w.now), label: `gated decoy ${d.id} paint` });
  }
  return out;
}

/** Non-vacuity counter for the fuzz (amendment 40's rule): the decoy-paint
 *  arm must actually be EXERCISED. */
const DECOY_PAINT_EXPECTED = { n: 0 };

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
  const decoys = expectedDecoyBlips(w, me);
  DECOY_PAINT_EXPECTED.n += decoys.length;
  const expected = [...expectedShipBlips(w, me), ...decoys];
  for (const exp of expected) {
    const i = unmatched.findIndex((b) => maskEquals(exp.mask, b));
    expect(i, `${exp.label} accounted for by its own blip`).toBeGreaterThanOrEqual(0);
    unmatched.splice(i, 1); // CONSUMED — it can never justify a second source
  }
  expect(unmatched, 'every blip traces to a gated subject (nothing unaccounted)').toEqual([]);
}

/** The Story 1.10 denial oracle: a denial in a frame must be the OBSERVER'S
 *  OWN press this tick — its (slot, seq) identity matches the observer's
 *  stored input on exactly one channel grammar (weapon click ↔ fireSeq on
 *  input.slot; ability press ↔ actSeq on input.actSlot) with a legal wire
 *  reason. Anything else — another ship's denial, a fabricated slot/seq, a
 *  server-internal reason ('dead'/'empty-slot') — fails the invariant:
 *  denials are owner-only by construction. */
function verifyDenied(me: ShipRecord, d: { slot: number; reason: string; seq: number }): void {
  expect(['out-of-arc', 'no-ammo', 'cooling', 'blocked']).toContain(d.reason);
  const weaponPress = d.slot === me.input.slot && d.seq === me.input.fireSeq;
  const abilityPress = d.slot === me.input.actSlot && d.seq === me.input.actSeq;
  expect(weaponPress || abilityPress).toBe(true);
}

/** FR10 anti-tell (Story 1.8): the frame's blip SUBSEQUENCE must be ordered by
 *  PUBLIC payload only — never by source (genuine ship scan vs a decoy
 *  paint), or array position would de-anonymize the deception whenever a
 *  hull and a decoy paint the same tick. Reimplemented test-locally,
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

/** A mine may reach a frame only if the viewer owns it, it is DETECTED
 *  (Story 4.9: the 0.75×sight rung — strictly tighter than sighted), OR it
 *  sits inside a lit zone the viewer OWNS (Story 1.7). */
function verifyMine(w: World, me: ShipRecord, m: MineView): void {
  const mine = w.mines.get(m.id)!;
  expect(mine).toBeDefined();
  const own = mine.ownerId === me.id;
  expect(m.own).toBe(own);
  expect(m.by).toBe(mine.ownerId); // Story 1.12: every visible mine carries its dropper id (personal hue)
  if (!own) expect(detected(w, me, mine) || zoneCovers(w, me, mine)).toBe(true); // never radar, never merely sighted
  // THE KIND RIDES EVERY ROW (Eric 2026-10-01, cycle 162, PV 68 — "Everyone
  // sees the kind", superseding Story 8.13's own-only rule, amendment 76):
  // every delivered mine view names the laid mine's true kind, LAST, after
  // `by`, in the one key order — owner, enemy and spectator alike. It is a
  // field on a row the gate above already admitted, not a delivery of its
  // own, so the exception count stays SIX.
  expect(Object.keys(m)).toEqual(['id', 'x', 'y', 'own', 'by', 'c']);
  expect(m.c).toBe(mine.kind);
}

/** A DECOY may reach a frame only if the viewer OWNS it (own field awareness,
 *  even under fog), it is SIGHTED (sight range + island LOS, like a ship —
 *  amendment 126, superseding 124(h)'s mine-detect rung), or it sits inside a lit zone the viewer
 *  OWNS (Story 1.7 parity). Wire shape is exactly {id,x,y,own,by} in that key
 *  order, `by` naming the owner for EVERY observer (amendment 124(a)), with
 *  `hp` appended LAST on the owner's view ONLY (the MineView.c idiom — a KEY
 *  test, not a value test). The decoy must be live (in the world store). */
function verifyDecoy(w: World, me: ShipRecord, d: DecoyView): void {
  const decoy = w.decoys.get(d.id)!;
  expect(decoy).toBeDefined();
  const own = decoy.ownerId === me.id;
  expect(Object.keys(d)).toEqual(own ? ['id', 'x', 'y', 'own', 'by', 'hp'] : ['id', 'x', 'y', 'own', 'by']);
  expect(d).toEqual({ id: decoy.id, x: decoy.x, y: decoy.y, own, by: decoy.ownerId, ...(own ? { hp: decoy.hp } : {}) });
  if (!own) expect(sighted(w, me, decoy) || zoneCovers(w, me, decoy)).toBe(true);
}

/** A delivered COUNTERMEASURE cloud's wire shape: exactly {id,x,y,t0} in that
 *  key order — no owner, no own-flag, no radius — `t0` the store's birth
 *  stamp; the cloud must be live. */
function verifyCloudShape(w: World, v: { id: string; x: number; y: number; t0: number }): void {
  const cloud = w.clouds.get(v.id)!;
  expect(cloud).toBeDefined();
  expect(w.now).toBeLessThan(cloud.until); // an expired cloud never materializes
  expect(Object.keys(v)).toEqual(['id', 'x', 'y', 't0']);
  expect(v).toEqual({ id: cloud.id, x: cloud.x, y: cloud.y, t0: cloud.bornAt });
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

/** The revolution a disc's PASS belongs to (Story 9.8 review, F1): the one in
 *  which the beam crossed the span's ENTRY bearing. Re-derived as ANGLE
 *  TRAVELLED: the beam has turned wrapPositive(sweepAngle − entry) since it
 *  crossed the entry; if that exceeds sweepAngle itself, it passed bearing 0
 *  on the way — the previous revolution. An observer inside the disc: the
 *  live revolution. */
function discPassRevOracle(me: ShipRecord, c: { x: number; y: number }, r: number): number {
  const d = dist(me.state, c);
  if (d <= r) return me.sweepRev;
  const entry = bearing(me.state, c) - Math.asin(Math.min(1, r / d));
  return wrapPositive(me.sweepAngle - entry) > me.sweepAngle ? me.sweepRev - 1 : me.sweepRev;
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
function cloudGateOracle(w: World, me: ShipRecord, cloud: { id: string; ownerId: string; x: number; y: number; bornAt: number }, bound: Bound = 'strict'): boolean {
  if (cloud.ownerId === me.id) return true;
  const r = cloudOutlineOracle(cloud.bornAt, w.now);
  const near = dist(me.state, cloud) - r;
  // Story 9.10: the sight arm pays the fog toll on the segment to the nearest
  // disc point, at the caller's side of the dead band (verifyFrame asks
  // 'loose' for a delivered cloud and 'strict' for a withheld one; the
  // ledgers count on the loose pass). The radar arm below is FOG-BLIND by
  // ruling (amendment 149).
  const bySight = near <= effSight(w, me) && sightedWithin(w, me, nearestDiscPointOracle(me.state, cloud, r), effSight(w, me), bound);
  const byRadar =
    near <= effRadar() &&
    beamCrossesDiscOracle(me, cloud, r) &&
    shadowVisible(w, me, cloud) &&
    dropoutOracle(w, me, dist(me.state, cloud), cloud.id, discPassRevOracle(me, cloud, r)); // the roll at the CENTRE distance (ruling 123)
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
 *  height does), this-tick paint window, and the dropout roll — no zone term
 *  (amendment 210 ruling (a): a hull in the viewer's own light paints too).
 *  One function because a decoy's paint is DEFINED as this exact
 *  predicate at its position (Story 8.16 — its treatment
 *  under the shadow is identical to a hull's: no height parameter exists to
 *  differ on, amendment 101). */
/** THE POINT-BLIP PREDICATE, independently re-derived: d ≤ intel (no inner
 *  edge), the paint window, the shadow march, the dropout. No cloud term (Story 9.3 session 2: a cloud hides nothing —
 *  8.18's in-bubble smoke paint and cycle 174's radar rule are retired). */
function blipPredicate(w: World, me: ShipRecord, p: { x: number; y: number }, key: string): boolean {
  // FOG-BLIND BY RULING (amendment 149) with NO INNER EDGE (amendment 210):
  // no bank term exists on this gate and it reaches down to the observer's
  // hull — a hull fog hides inside the bubble still paints, a hull beyond it
  // paints through any bank. The fuzz's RADAR_THROUGH_FOG ledger proves the
  // arm ran.
  const d = dist(me.state, p);
  return (
    d <= effRadar() &&
    shadowVisible(w, me, p) &&
    inPaintWindow(me, bearing(me.state, p)) &&
    dropoutOracle(w, me, d, key)
  );
}

// ---------- Story 8.16: the DECOY BUOY oracle (independently re-derived) ----------
//
// The sources that may legitimately put a blip in a frame (see verifyBlip's
// arms), ALL UNTAGGED: the observer's own radar over ships (unchanged) and a
// DECOY's small anonymous paint (CHAFF's fakes retired with the line in Story
// 9.2). Every rule below is re-derived from the ruling text — sizes as
// literals.

/** The decoy's paint square as a literal (CONFIG.decoyBuoy.sizeU, R36). */
const DECOY_PAINT_W_U = 12;

/** The decoy's OWN paint mask: the degenerate-segment square at its fixed
 *  position through the test-local segment pipeline (wakeMaskOracle handles
 *  the zero-length axis — it degenerates to +x, the documented rule). */
function decoyMaskOracle(d: { x: number; y: number }, t: number): MaskOracle {
  return wakeMaskOracle(d.x, d.y, d.x, d.y, DECOY_PAINT_W_U, t);
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

/** Test-local paint-pipeline oracle: sharp → fuzz(paintSeed(t, pose)) →
 *  tight-crop → LSB-first packing. `t` is the paint tick (the server stamps
 *  `t = now` and seeds the glint from it). */
function maskOracle(cls: HullId, x: number, y: number, heading: number, t: number): MaskOracle {
  const s = sharpOracle(cls, x, y, heading);
  const grid = fuzzOracle(s.grid, s.w, s.h, paintSeed(t, x, y, heading));
  let minC = s.w;
  let minR = s.h;
  let maxC = -1;
  let maxR = -1;
  for (let i = 0; i < s.w * s.h; i++) {
    if (grid[i] === 0) continue;
    const row = Math.floor(i / s.w);
    const col = i % s.w;
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
      if (grid[(row + minR) * s.w + col + minC] === 1) bits[(row * w + col) >>> 5] |= 1 << ((row * w + col) & 31);
    }
  }
  return { gx: s.gx0 + minC, gy: s.gy0 + minR, w, h, bits };
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
  ev: BlipEvent,
  cls: HullId,
  p: { x: number; y: number },
  heading: number,
): boolean {
  return maskEquals(maskOracle(cls, p.x, p.y, heading, w.now), ev);
}

/** True iff `ev` is a legitimate GENUINE ship paint. The payload carries NO
 *  id (cycle 63), so the justification quantifies over the ships: SOME live
 *  non-self ship passing the ship-blip predicate must rasterize to exactly
 *  this footprint. */
function blipMatchesShip(w: World, me: ShipRecord, ev: BlipEvent): boolean {
  for (const target of w.ships.values()) {
    if (!isAfloat(target.lifecycle) || target.id === me.id) continue;
    if (!blipPredicate(w, me, target.state, target.id)) continue;
    if (blipPoseMatches(w, ev, target.hullId, target.state, target.state.heading)) return true;
  }
  return false;
}

/** True iff `ev` is a legitimate DECOY paint (Story 8.16): some live decoy —
 *  the observer's own included — passes the observer's own point-blip
 *  predicate at the decoy's position and its small degenerate-square
 *  footprint matches exactly. The size IS the profile: never any hull's
 *  silhouette. */
function blipMatchesDecoyPaint(w: World, me: ShipRecord, ev: BlipEvent): boolean {
  for (const d of w.decoys.values()) {
    if (!blipPredicate(w, me, d, d.id)) continue;
    if (maskEquals(decoyMaskOracle(d, w.now), ev as ReturnBlipEvent)) return true;
  }
  return false;
}

/** The exact blip key set (cycle 63, amendment 152): the coverage footprint
 *  and NOTHING else — pinned as an exact key set, so the deletion of `id`,
 *  the position, `ext`, every pose channel AND (Story 8.16, PV 59) the radar
 *  buoy's `src` sensor tag is structural on every blip the fuzz sees. */
const RETURN_BLIP_KEYS = ['bits', 'gx', 'gy', 'h', 'k', 't', 'w'];
/** Fields the `return` payload must NEVER grow back — asserted by name as well
 *  as by the exact key set, because each is its own disclosure channel: `id`
 *  the cross-sweep correlation handle, x/y the exact float position, `ext`
 *  the derived aspect scalar, cls/heading/speed the 4.2 pose, `src` the
 *  deleted sensor attribution. */
const RETURN_FORBIDDEN_KEYS = ['id', 'x', 'y', 'ext', 'cls', 'heading', 'speed', 'src'];

function verifyBlip(w: World, me: ShipRecord, e: GameEvent): void {
  const ev = e as BlipEvent;
  expect(ev.t).toBe(w.now);
  // Shape gate: the exact key set, both directions — no blip carries `src`.
  expect(Object.keys(ev).sort()).toEqual(RETURN_BLIP_KEYS);
  for (const forbidden of RETURN_FORBIDDEN_KEYS) expect(Object.hasOwn(ev, forbidden)).toBe(false);
  // THE JUSTIFICATION. Every blip must byte-match one of TWO independently
  // re-derived sources:
  //   1. a GENUINE SHIP PAINT through the observer's own gate (unchanged);
  //   2. a DECOY's small anonymous paint through the observer's gate.
  // CHAFF's third arm — the server-generated fakes' carve-out (Story 8.16) —
  // is DELETED with the line (Story 9.2, epic-9 amendment 31): no false
  // signal leaves observe() any more, so the invariant is strictly tighter.
  // Every arm demands EXACT mask equality against the oracle's own
  // recomputation, so a real ship's footprint emitted outside every gate —
  // at its true pose, with its true hull — matches no arm and fails (pinned
  // by the directed leak-catch case below the invariant suite).
  expect(blipMatchesShip(w, me, ev) || blipMatchesDecoyPaint(w, me, ev)).toBe(true);
}

// shell AND torp share one verifier — with the Story 4.9 fork: a shell
// reveals at first-SIGHT, a torpedo at first-DETECT (1×sight since 2026-10-08 — the once-tighter
// oracle above). Both live in world.shells, keyed by projectile id.
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
  // First-sight (shell) / first-detect (torp) OR inside an OWNED lit zone
  // (Story 1.7) — never anyone else's.
  if (sh.ownerId !== me.id) {
    const inRange = sh.kind === 'torp' ? detected(w, me, ev) : sighted(w, me, ev);
    expect(inRange || zoneCovers(w, me, ev)).toBe(true);
  }
}

function verifyBoom(w: World, me: ShipRecord, e: GameEvent): void {
  const ev = e as BoomEvent;
  // Boom point: sighted OR inside a zone the observer OWNS (Story 1.7 parity).
  if (ev.hit !== me.id) expect(sighted(w, me, ev) || zoneCovers(w, me, ev)).toBe(true);
  // `hit` may name a victim only when that victim's CENTER is sighted or
  // zone-covered (or the observer is the victim) — a straddling hull must not
  // leak its id.
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
  expect(Object.keys(ev).sort()).toEqual(['id', 'k', 'x', 'y']);
  const src = w.tickEvents.find((t) => t.k === 'burst' && t.id === ev.id) as
    | (BurstEvent & { own?: string })
    | undefined;
  expect(src).toBeDefined();
  // Burst point: sighted OR inside a zone the observer OWNS (Story 1.7 parity).
  if (src!.own !== me.id) expect(sighted(w, me, ev) || zoneCovers(w, me, ev)).toBe(true);
}

// THE PUBLIC REGISTER (PV 23) — `sunk` is the 4th DECLARED exception to the
// master invariant (after sp/hc/mz), reimplemented here independently of its
// registry row: a HUMAN victim's sinking is identity-only PUBLIC (allowed
// unconditionally); a DRONE victim reaches only a witness (sighted or
// owned-zone — Story 1.7) or its credited killer; the victim itself always
// hears of its own sinking; and the per-observer `seen` flag may be PRESENT
// only when the witness predicate genuinely holds — `seen` is the client's
// license to render spatially, so a wrongly-stamped flag IS a location leak.
// INDEPENDENCE SCOPE: the claim above is honest only for the GEOMETRY terms —
// `sighted`/`zoneCovers` are this file's own reimplementations. The drone
// discrimination reads the same production `wreck.role` field the row
// reads, and the credited clause is the same trivial `by === me` equality, so
// a hull mis-flagged at construction (e.g. a future combat bot built through
// the drone path) would put the row and this oracle in agreement on the same
// wrong answer.
/**
 * `kcls` (Story 7.6, Eric ruling 2026-08-21): THE KILLER'S HULL ID, and it may
 * name a PvE FLEET HULL AND NOTHING ELSE.
 *
 * THE POSITIVE ASSERTION IS THE POINT, not the biconditional around it: a
 * CAPTAIN'S CLASS MAY NEVER RIDE THIS FIELD. A captain's hull class is not
 * disclosed by the `sunk` row, and this row is PUBLIC for a captain victim, so
 * a stamping that read `by`'s class unconditionally would broadcast every
 * killer's build fact to every client in the room. That is the single failure
 * this oracle exists to catch, and it is asserted in BOTH directions:
 *   • present ⇒ the killer's record exists AND its role is `'fleet'` AND the
 *     value is exactly that hull's id (so it cannot name some third ship);
 *   • a live FLEET killer distinct from the victim ⇒ it MUST be present (so the
 *     feature cannot silently stop working), and by contraposition a live
 *     NON-fleet killer must NOT be.
 *
 * INDEPENDENCE SCOPE, stated as honestly as verifySunk's own: the role read is
 * the same `role` field production reads (spelled here as a literal `'fleet'`
 * comparison rather than through the `isFleetHull` seam the row calls, so a
 * change to that seam's meaning shows up as a disagreement here). A hull
 * mis-flagged at CONSTRUCTION would put both in agreement on the same wrong
 * answer — that is a world-construction invariant, pinned elsewhere.
 *
 * OBSERVER-INDEPENDENT: no clause below reads `me`. A per-observer stamping
 * would make it a second `seen` and leak witness geometry, and the directed
 * suite restates that by comparing two observers' rows for equality.
 */
function verifySunkKillerClass(w: World, ev: SunkEvent): void {
  // A self-sink credits nobody (creditKill's own attribution rule), so it is
  // not a "killer" for this purpose and must never stamp.
  const killer = ev.by !== undefined && ev.by !== ev.id ? w.ships.get(ev.by) : undefined;
  const fleetKiller = killer !== undefined && killer.role === 'fleet';
  if ('kcls' in ev) {
    expect(killer).toBeDefined();
    // THE GUARANTEE THE WHOLE DESIGN RESTS ON: never a captain, never a bot.
    expect(killer!.role).toBe('fleet');
    expect(fleetKiller).toBe(true);
    expect(ev.kcls).toBe(killer!.hullId);
  } else {
    // The other direction: a live fleet killer MUST be named. Contrapositive of
    // the clause above — a captain or bot killer lands here and stays unnamed.
    expect(fleetKiller).toBe(false);
  }
}

function verifySunk(w: World, me: ShipRecord, e: GameEvent): void {
  const ev = e as SunkEvent;
  // THE PAYLOAD PIN: because this event now reaches every fogged client, the
  // wire shape itself is the anti-leak boundary — the keys must be a subset of
  // exactly {k,id,by,seen,bty,vcls,kcls}. A positional (or any other) field
  // added at the world emission, or a materialize() regression back to
  // pass-through, fails HERE even though every visibility clause still holds.
  for (const key of Object.keys(ev)) expect(['k', 'id', 'by', 'seen', 'bty', 'vcls', 'kcls']).toContain(key);
  // `vcls` (Story 5.6, epic-5 amendment 43): THE VICTIM'S HULL ID, and the
  // only class field this row may carry ABOUT THE VICTIM. Reimplemented here as a hard
  // biconditional against the two clauses it is allowed to depend on — the
  // observer is the CREDITED KILLER, and the wreck record still exists — so
  // any leak to a bystander or to a witness who did not fire fails here.
  // Deliberately NOT keyed on the wreck's ROLE: the rule is uniform across
  // every victim, and a fleet-only stamping would fail this. And deliberately
  // NOT keyed on the VIEW MODE either (orchestrator ruling, review gate): a
  // spectator who IS the credited killer must get it, and the directed suite
  // restates this same biconditional over a spec frame (this oracle itself is
  // a FOGGED-frame audit — its witness clauses re-derive geometry the unfogged
  // path stamps unconditionally — so it is not run there). A spectator who is
  // not the killer still fails `creditedToMe`, and so must not get it.
  const creditedToMe = ev.by !== undefined && ev.by === me.id;
  const wreckNow = w.ships.get(ev.id);
  if ('vcls' in ev) {
    expect(creditedToMe).toBe(true); // never a bystander, never a spectator
    expect(wreckNow).toBeDefined();
    expect(ev.vcls).toBe(wreckNow!.hullId);
  } else if (creditedToMe && wreckNow !== undefined) {
    // The other direction: a killer with a live wreck record MUST get it.
    expect('vcls' in ev).toBe(true);
  }
  verifySunkKillerClass(w, ev);
  // `bty` (Story 4.6, 2026-08-10 rework): WHICH PARTICIPANT held the bounty
  // throne at the pre-sink instant — 'v' the victim, 'k' the killer. Three
  // independent checks, none reading the production row: the value is only
  // ever literally 'v' or 'k' (a false/undefined-valued key is a wire
  // regression — msgpack encodes it); `bty === 'v'` can never mark a DRONE
  // wreck (a drone can never hold the throne, so a 'v'-flagged drone sinking
  // would be a crowning bug surfacing on the wire) — while `bty === 'k'` MAY
  // ride a drone wreck (the leader sinks a drone): that is not a leak,
  // because that sunk event only reaches the witness and the killer, both of
  // whom already know the leader's identity from the public
  // ArenaState.bountyId, and `by` is already on the line; and it must be
  // observer-INDEPENDENT, equal to the world's own pre-sink emission verbatim
  // — a per-observer stamping would turn it into a second `seen` and leak
  // witness geometry.
  const src = w.tickEvents.find((t) => t.k === 'sunk' && t.id === ev.id) as SunkEvent | undefined;
  if ('bty' in ev) {
    expect(['v', 'k']).toContain(ev.bty);
    const flaggedWreck = w.ships.get(ev.id);
    if (ev.bty === 'v' && flaggedWreck !== undefined) expect(flaggedWreck.role).not.toBe('fleet');
  }
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
  const witnessed = sighted(w, me, wreck.state) || zoneCovers(w, me, wreck.state);
  // A drone sinking is NEVER public: witnessed, or this observer's own kill.
  if (wreck.role === 'fleet') expect(witnessed || ev.by === me.id).toBe(true);
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
// window ∧ the height-aware shadow march ∧ the dropout roll, for ship and
// torpedo water alike. NO owned-zone term and NO self-exclusion (your own wake
// paints — amendment 204). Everything below re-derives the ribbon model from
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
 *  window, the radar shadow march — FOG-BLIND by ruling (amendment 149) —
 *  and the dropout roll keyed on the water's SOURCE (Story 9.8, ruling 123:
 *  `w.wakeKeyOf` — the ship id, or the fish's shell id). Ship and torpedo
 *  water alike; no cloud term (Story 9.3 session 2), NO zone term and NO
 *  self term (deliberate). */
function wakeDisclosed(w: World, me: ShipRecord, seg: WakeSegOracle, key: string): boolean {
  const mid = { x: seg.mx, y: seg.my };
  const d = dist(me.state, mid);
  if (d > effRadar()) return false;
  if (!inPaintWindow(me, bearing(me.state, mid))) return false;
  return shadowVisible(w, me, mid) && dropoutOracle(w, me, d, key);
}

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
function wakeMaskOracle(ax: number, ay: number, bx: number, by: number, widthU: number, t: number): MaskOracle {
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
  // THE PER-PAINT FLANK GLINT (P3): row-major, covered non-spine cells only.
  const rng = mulberry32(segmentPaintSeed(t, ax, ay, bx, by));
  const glintP = CONFIG.vision.radarFuzz.glintP;
  for (let i = 0; i < cw * ch; i++) {
    if (grid[i] === 1 && spine[i] !== 1 && rng.next() < glintP) grid[i] = 0;
  }
  bridgeOracle(grid, cw, ch); // the same fixed-point rule, reused test-locally
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
      if (seg.bucket !== ev.a || !wakeDisclosed(w, me, seg, w.wakeKeyOf(ribbon))) continue;
      if (maskEquals(wakeMaskOracle(seg.ax, seg.ay, seg.bx, seg.by, ribbon.widthU, w.now), ev as unknown as ReturnBlipEvent)) return true;
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
      if (!wakeDisclosed(w, me, seg, w.wakeKeyOf(ribbon))) continue;
      gated++;
      const expected = wakeMaskOracle(seg.ax, seg.ay, seg.bx, seg.by, ribbon.widthU, w.now);
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
  dp: (_w, me, e) => {
    // Drone drops (Eric ruling 2026-10-01): killer-private on the pt/bn terms,
    // a LIVE consumable catalog id, and nothing else on the event.
    const ev = e as DropEvent;
    expect(ev.id).toBe(me.id);
    expect(Object.hasOwn(CATALOG, ev.boon)).toBe(true);
    expect(CATALOG[ev.boon].kind).toBe('consumable');
    expect(Object.keys(ev).sort()).toEqual(['boon', 'id', 'k']);
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
    // further."*) — 6/12 of THIS observer's intel range since Story 9.8 (5/8
    // before it), re-derived here as `me.stats.radarRange × muzzleFlashFactor`
    // rather than by importing the production resolver.
    // ANCHORED ON RADAR RANGE, NOT SIGHT: that is what keeps it un-dazzled, so a
    // dazzled observer's flash reach must NOT shrink. Still no owned-zone term,
    // plus island LOS (islands block every sensor at all ranges). The exact key
    // set is the identity oracle: {k,x,y} carries no shooter id, hue, class,
    // weapon, or heading for ANY observer.
    const ev = e as { k: 'mz'; x: number; y: number };
    expect(Object.keys(ev).sort()).toEqual(['k', 'x', 'y']);
    // Story 9.10 (amendment 167): the flash PAYS the fog toll — dist + toll
    // against the halo (the integration oracle, loose bound).
    const mzToll = fogTollOracle(w, me.state, ev);
    expect(dist(me.state, ev) + mzToll.tollMin).toBeLessThanOrEqual(me.stats.radarRange * CONFIG.vision.muzzleFlashFactor + mzToll.slack);
    expect(sightClearOracle(w, me, ev)).toBe(true); // island LOS
  },
  sm: (w, me, e) => {
    // WOUNDED SMOKE (Story 4.4, amendments 40-50; reach MOVED with the
    // muzzle-flash halo to 5/8 by Story 4.9, amendment 119 — the amendment 42
    // one-constant coupling doing its job) — the FIFTH declared exception.
    // The reach is now 5/8 of THIS observer's intel range (Eric ruling
    // 2026-08-16; 6/12 since Story 9.8), re-derived here as muzzleFlashFactor
    // against `me.stats.radarRange` and deliberately NOT shared with the mz verifier
    // above, per the header's reimplementation rule. The old flat-halo rationale
    // — that a per-observer reach would leak build state through the plume —
    // holds for SUBJECT-scaling and not for OBSERVER-scaling: the watcher
    // already knows their own build, and this row still carries no identity.
    // Anchored on radar range, so a dazzle must NOT shrink it. No owned-zone
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
    expect(dist(me.state, ev) + smToll.tollMin).toBeLessThanOrEqual(me.stats.radarRange * CONFIG.vision.muzzleFlashFactor + smToll.slack);
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
    // Story 4.9: updates ride the DETECT gate, matching the torp reveal —
    // corrections stop exactly where first reveal starts.
    if (sh.ownerId !== me.id) expect(detected(w, me, ev) || zoneCovers(w, me, ev)).toBe(true);
  },
  spawn: (w, me, e) => {
    // Spawn point: sighted OR inside a zone the observer OWNS (Story 1.7).
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
 * `sighted` for a shell, `detected` for a torpedo / `zoneCovers`) and by the
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
        sh.ownerId === me.id || (sh.kind === 'torp' ? detected(w, me, sh, bound) : sighted(w, me, sh, bound)) || zoneCovers(w, me, sh);
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

/** 0.85 × 2800 u — the sampling arena the invariant's oracles were tuned on. */
const INVARIANT_ARENA_U = 2380;

/** Seat an enemy mine 240 u from the first hull standing in CLEAR water, on the
 *  first of 36 bearings whose point the loose fog oracle hides (island LOS
 *  clear) — the detect-rung subject amendment 179 still hides. No-op when no
 *  hull or bearing qualifies in this world (the other dense worlds provide). */
function seatMineBehindFog(w: World, ids: string[]): void {
  for (const id of ids) {
    const obs = w.ships.get(id)!;
    if (w.fogDensityAt(obs.state.x, obs.state.y) >= FOG_SOLID_DENSITY) continue;
    for (let k = 0; k < 36; k++) {
      const brg = (k / 36) * TAU;
      const q = { x: obs.state.x + Math.cos(brg) * 240, y: obs.state.y + Math.sin(brg) * 240 };
      const { tollMin, slack } = fogTollOracle(w, obs.state, q);
      if (240 + tollMin > effSight(w, obs) + slack && clearLos(obs.state, q, w.map.islands)) {
        injectMine(w, 'fogMineClear', ids.find((o) => o !== id)!, q.x, q.y);
        return;
      }
    }
  }
}

describe('perception — THE INVARIANT (random worlds, seeded)', () => {
  it('no frame ever references anything outside sight ∪ this-tick paints', () => {
    const rng = mulberry32(0x5eed_f0f0);
    DECOY_PAINT_EXPECTED.n = 0;
    CLOUD_SIGHT_THROUGH.n = 0;
    CLOUD_DELIVERED_BY_SIGHT.n = 0;
    CLOUD_DELIVERED_BY_RADAR.n = 0;
    DRAFT_SEEN.n = 0;
    FOUL_ZONE_DELIVERED.n = 0;
    FOG_HID_CONTACT.n = 0;
    FOG_THIN_SEEN.n = 0;
    FOG_HID_MINE_OR_TORP.n = 0;
    FOG_HID_SM.n = 0;
    RADAR_THROUGH_FOG.n = 0;
    DROPOUT_LEDGER.painted = 0;
    DROPOUT_LEDGER.missed = 0;
    let wkSeen = 0; // Story 4.12: proves the wake oracle ran non-vacuously
    let reReveals = 0; // Story 8.13: proves the per-visit ledger saw a re-entry
    for (let world = 0; world < 20; world++) {
      const w = new World(rng.int(0, 2 ** 31 - 1), CONFIG.match.fillTo, CONFIG.zone);
      SIGHT_SHRUNK.clear(); // the sight-shrink seam is per world
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
        const rec = place(w, id, Math.cos(ang) * r, Math.sin(ang) * r, rng.float(0, TAU), GUN_IDS[rng.int(0, GUN_IDS.length - 1)]);
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
        for (let n = rng.int(0, 5); n > 0; n--) intel.push('radarSweep'); // toward the rpm cap
        rec.cards = intel;
        rec.cards = [...intel];
        rec.stats = effectiveStats(rec.cls, rec.cards);
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
        const rec = place(w, 'pn', anchor.x + Math.cos(brg) * d, anchor.y + Math.sin(brg) * d, rng.float(0, TAU), GUN_IDS[rng.int(0, GUN_IDS.length - 1)]);
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
          const pq = place(w, 'pq', anchor.x + Math.cos(qb) * qd, anchor.y + Math.sin(qb) * qd, rng.float(0, TAU), GUN_IDS[rng.int(0, GUN_IDS.length - 1)]);
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
          rng.float(20, CONFIG.vision.radar), // gun range base = radar range (shellRange retired)
          rng.float(0, 1) < 0.5, // half the shells are targeted bursters (real gun shape)
        );
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
      // SHRUNK-SIGHT observers (the sight-shrink seam — the FLASH SHELLS
      // dazzle's seeding, Story 8.17, kept on the same rng draws since Story
      // 9.4 retired the mark): ~a quarter of the hulls start with sight at
      // the 1/8 rung, so the collapsed gate runs real frames from tick 1 (the
      // tick-2 shrink below then flips every hull, and clears it, for the
      // re-reveal ledger). The second draw's upper bound is the old 10 s flash
      // life, spelled as a literal so the stream is byte-identical.
      for (const id of ids) {
        if (rng.float(0, 1) < 0.25) SIGHT_SHRUNK.set(id, w.now + rng.float(DT, 10_000));
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
      // DECOYS (Story 8.16): 1-3 live decoys on random owners, minted through
      // production addDecoy; most seated in another ship's beam annulus (the
      // paint arm), the rest anywhere (the detect / lit-zone / owner views).
      for (let di = 0; di < rng.int(1, 3); di++) {
        const owner = w.ships.get(ids[rng.int(0, ids.length - 1)])!;
        const obs = w.ships.get(ids[rng.int(0, ids.length - 1)])!;
        const brg = obs.sweepAngle + rng.float(0.02, 0.4);
        const d = rng.float(0, 1) < 0.7 ? rng.float(SIGHT + 10, RADAR - 10) : rng.float(0, RADAR * 1.5);
        addDecoy(w.decoys, owner.id, obs.state.x + Math.cos(brg) * d, obs.state.y + Math.sin(brg) * d, `decoy${di}`).hp =
          rng.float(1, CONFIG.decoyBuoy.hp);
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
      // 9.8) but whose centre is inside the dropout's flat band (so the radar
      // roll always paints it) and nearest point inside its radar range,
      // centred just ahead of its beam so the sweep crosses its bearing span
      // — the radar-only delivery arm (CLOUD_DELIVERED_BY_RADAR) is
      // exercised, not vacuous. Drawn from its OWN stream so the main `rng`
      // sequence (and every ledger tuned on it) is untouched.
      {
        const crng = mulberry32(0xc10d_0000 + world);
        const obs = w.ships.get(ids[0])!;
        const brg = obs.sweepAngle + crng.float(1, 3) * SWEEP_DELTA;
        const d = crng.float(SIGHT + 240, SIGHT + 440);
        expect(d).toBeLessThanOrEqual(CONFIG.vision.dropout.startU);
        const owner = ids[1 + crng.int(0, ids.length - 2)];
        injectCloud(w, `radarCloud${world}`, owner, obs.state.x + Math.cos(brg) * d, obs.state.y + Math.sin(brg) * d, w.now - crng.float(0, 1_500));
      }
      // SHIELD BLOCK (Story 8.16): ~a third of the hulls carry a shield seat —
      // some up, some lapsed — so the self-private `shield` pin is exercised
      // on real frames in both directions.
      for (const id of ids) {
        if (rng.float(0, 1) >= 0.33) continue;
        w.ships.get(id)!.shield = { hpLeft: rng.float(1, CONFIG.shieldBlock.hp), until: w.now + rng.float(-400, 8000) };
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
      const ledger = new VisitLedger();
      for (let tick = 1; tick <= 6; tick++) {
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
            // ~30% of ticks also press the ability slot (TB boost in slot 2):
            // repeated presses drain the 1-charge pool into no-ammo denials.
            actSeq: rng.float(0, 1) < 0.3 ? tick : 0,
            actSlot: 2,
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
            held: rng.float(0, 1) < 0.5,
          });
        }
        // HULL REPAIR (a CARD since Story 8.8): drive REAL heals through the
        // fuzz so the self-private `heal` row and the repairHp pin are
        // exercised rather than vacuous — ~25% of ticks a random hull takes a
        // scratch, stocks a copy and fires it from the belt. (The row fails
        // closed on a full or non-afloat hull; either outcome is a legal world
        // state to verify.)
        if (rng.float(0, 1) < 0.25) {
          const patient = w.ships.get(ids[rng.int(0, ids.length - 1)])!;
          patient.hp = Math.max(1, patient.hp - rng.float(10, 60));
          w.applyCard(patient, 'hullRepair');
          w.sinkingActivationGate(patient, consumableSlotFor('hullRepair')!);
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
        // Build each observer's frame exactly once per tick (wire semantics),
        // with the sight-shrink seam written onto the records first.
        applySightShrink(w, ids);
        for (const id of ids) {
          const f = buildFrame(w, id);
          wkSeen += f.events.filter((e) => e.k === 'wk').length;
          verifyFrame(w, id, f);
          ledger.verify(w, id, f);
        }
        // THE PER-VISIT MARK (Story 8.13, amendment 78) must be EXERCISED, not
        // vacuous: after tick 2's frames, EVERY hull's sight is SHRUNK for
        // ticks 3-4 (their gates collapse — projectiles between the shrunken
        // ring and the full ring LEAVE it) and clear again on tick 5, when
        // whatever is still live and still inside the full ring RE-ENTERS and
        // must be revealed again. A gate exit, not a teleport, so every other
        // oracle stays on the same footing. (Story 9.3 widened this from two
        // hulls to all; Story 9.4 moved it from the retired dazzle mark onto
        // the sight-shrink seam — kept: the whole ring feeds the ledger.)
        if (tick === 2) {
          for (const id of ids) SIGHT_SHRUNK.set(id, w.now + 2 * DT + 1);
        }
      }
      reReveals += ledger.reReveals;
    }
    // The CLOUD arms must have been EXERCISED (Story 9.3, the same vacuity
    // rule): across 20 worlds × 6 ticks with clouds seated on hull-to-hull
    // segments, the ledger must have met in-sight, island-clear hulls whose
    // line ran through a cloud's disc (verifyFrame proved each PRESENT — a
    // cloud hides nothing), and the cloud CHANNEL must have delivered by each
    // sensor alone.
    expect(CLOUD_SIGHT_THROUGH.n).toBeGreaterThan(0);
    expect(CLOUD_DELIVERED_BY_SIGHT.n).toBeGreaterThan(0);
    expect(CLOUD_DELIVERED_BY_RADAR.n).toBeGreaterThan(0);
    // ...and the wake-draft clause saw a POSITIVE `you.draft` at least once
    // (Story 8.19 — the value is PLANTED on ids[0] on odd ticks, above), so
    // its present-and-exact arm ran, not only the omitted-at-0 one.
    expect(DRAFT_SEEN.n).toBeGreaterThan(0);
    // The wake oracle must have been EXERCISED (amendment 40's vacuity rule):
    // with 70% of hulls pre-laid with tracks across 20 worlds × 6 ticks, zero
    // disclosed segments would mean the channel silently died.
    expect(wkSeen).toBeGreaterThan(0);
    // ...and so must the re-reveal: zero second reveals across 20 shrunk
    // worlds would mean the per-visit mark silently reverted to permanent.
    expect(reReveals).toBeGreaterThan(0);
    // ...and the FOUL ZONE channel (Story 9.4) must have delivered to a
    // NON-owner at least once — the radar-range clause ran, not only the
    // owner clause.
    expect(FOUL_ZONE_DELIVERED.n).toBeGreaterThan(0);
    // ...and so must the Story 8.16 decoy-paint arm: decoy paints actually
    // reached (and were consumed from) real frames.
    expect(DECOY_PAINT_EXPECTED.n).toBeGreaterThan(0);
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
    // The ledger values, under the perf pins' opt-in flag (the HC_PERF_LOG
    // idiom) — so a re-lay of the fuzz geometry can be checked for how far
    // above zero each arm actually sits, not only that it cleared the bar.
    if (process.env.HC_PERF_LOG) {
      console.log(
        `perception fuzz ledgers: CLOUD_SIGHT_THROUGH ${CLOUD_SIGHT_THROUGH.n} | ` +
          `CLOUD_DELIVERED_BY_SIGHT ${CLOUD_DELIVERED_BY_SIGHT.n} | CLOUD_DELIVERED_BY_RADAR ${CLOUD_DELIVERED_BY_RADAR.n} | ` +
          `DECOY_PAINT_EXPECTED ${DECOY_PAINT_EXPECTED.n} | ` +
          `DRAFT_SEEN ${DRAFT_SEEN.n} | FOUL_ZONE_DELIVERED ${FOUL_ZONE_DELIVERED.n} | wk ${wkSeen} | reReveals ${reReveals} | ` +
          `dropout painted ${DROPOUT_LEDGER.painted} missed ${DROPOUT_LEDGER.missed} | ` +
          `FOG_HID_CONTACT ${FOG_HID_CONTACT.n} | FOG_THIN_SEEN ${FOG_THIN_SEEN.n} | FOG_HID_MINE_OR_TORP ${FOG_HID_MINE_OR_TORP.n} | ` +
          `FOG_HID_SM ${FOG_HID_SM.n} | RADAR_THROUGH_FOG ${RADAR_THROUGH_FOG.n}`,
      );
    }
  });
});

// ---------- THE RADAR DROPOUT, end to end (Story 9.8, rulings 121–123) ------
//
// The non-vacuity ledgers the fuzz cannot guarantee in six ticks: one quiet
// world, one observer, and a subject of every radar-delivered kind parked on
// its own clear bearing, run through ≥ 200 real sweep revolutions (world.step
// advances the beam, so `sweepRev` increments exactly as production does).
// EVERY tick's frame passes verifyFrame — whose blip / wake completeness
// oracles and cloud / foul-zone gate oracles MIRROR the roll — so the oracle
// and production agree on every tick, paint and miss alike; the ledgers then
// prove the roll actually bit (some revolutions miss the far returns) and
// actually spared (the flat band never misses; the zone circle never rolls).

describe('perception — the radar dropout, end to end (Story 9.8, rulings 121–123)', () => {
  it('far returns of every radar kind come and go per revolution; the flat band never misses; a foul zone never rolls', () => {
    const w = bareWorld();
    w.map.heightRaster = flatRaster(RADAR + 200);
    w.damageEnabled = false; // a quiet world: nothing but the beam moves
    const a = place(w, 'a', 0, 0);
    const FAR = RADAR - 100; // deep in the dropout band (past the knee)
    const NEAR = CONFIG.vision.dropout.startU - 100; // inside the flat band, past sight
    expect(NEAR).toBeGreaterThan(SIGHT);
    expect(dropoutPaintP(FAR)).toBeGreaterThan(0.1);
    expect(dropoutPaintP(FAR)).toBeLessThan(0.9);
    const at = (d: number, brg: number): { x: number; y: number } => ({ x: d * Math.cos(brg), y: d * Math.sin(brg) });
    // Subjects on well-separated bearings (none inside another's window span).
    const BRG = { far: 0.5, near: 1.5, decoy: 2.5, wake: 3.5, cloud: 4.6, foul: 5.7 };
    const far = place(w, 'far', at(FAR, BRG.far).x, at(FAR, BRG.far).y);
    const near = place(w, 'near', at(NEAR, BRG.near).x, at(NEAR, BRG.near).y);
    const dp = at(FAR, BRG.decoy);
    addDecoy(w.decoys, 'z', dp.x, dp.y, 'dk');
    const cp = at(FAR, BRG.cloud);
    injectCloud(w, 'ck', 'z', cp.x, cp.y);
    w.clouds.set('ck', { ...w.clouds.get('ck')!, until: 1e9 }); // keep it on the water for the whole run
    const fp = at(FAR, BRG.foul);
    injectFoulZone(w, 'fk', 'z', fp.x, fp.y, CONFIG.foulingShell.radius, 1e9);
    // The wake: a short RADIAL torpedo-style track ending at FAR on its own
    // bearing (every segment swept on the same tick), re-laid fresh each tick
    // so it never ages out. An unregistered ribbon rolls under the key ''.
    const cap = 8;
    const tw: WakeRibbon = { xs: new Float64Array(cap), ys: new Float64Array(cap), ts: new Float64Array(cap), cap, head: 0, count: 0, lifeMs: 2_750, widthU: 9, torp: true, hullAheadU: 0 };
    const relayWake = (): void => {
      tw.head = 0;
      tw.count = 0;
      const end = at(FAR, BRG.wake);
      injectWakeTrack(tw, end.x, end.y, BRG.wake, 4, w.now, 300);
      w.torpWakes.set('twk', tw);
    };
    const cellU = CONFIG.vision.radarCellU;
    const covers = (e: ReturnBlipEvent | WakeBlipEvent, p: { x: number; y: number }): boolean =>
      coverageHas(e, Math.floor(p.x / cellU) - e.gx, Math.floor(p.y / cellU) - e.gy);
    const wakeMid = at(FAR - 6, BRG.wake); // the newest segment's midpoint
    // Per-revolution outcome per subject (a revolution PAINTS if any of its
    // swept ticks delivered the subject).
    const ledger = {
      far: new Map<number, boolean>(),
      near: new Map<number, boolean>(),
      decoy: new Map<number, boolean>(),
      wake: new Map<number, boolean>(),
      cloud: new Map<number, boolean>(),
    };
    const note = (m: Map<number, boolean>, rev: number, hit: boolean): void => {
      m.set(rev, (m.get(rev) ?? false) || hit);
    };
    let foulTicks = 0;
    let ticks = 0;
    const REVS = 210;
    for (let t = 0; t < REVS * TICKS_PER_REV; t++) {
      w.step();
      relayWake();
      const f = buildFrame(w, 'a');
      verifyFrame(w, 'a', f); // the oracle MIRRORS the roll — it agrees on every tick
      ticks++;
      const blips = f.events.filter((e): e is ReturnBlipEvent => e.k === 'blip');
      const wks = f.events.filter((e): e is WakeBlipEvent => e.k === 'wk');
      const rev = a.sweepRev;
      const swept = (p: { x: number; y: number }): boolean => inPaintWindow(a, bearing(a.state, p));
      if (swept(far.state)) note(ledger.far, rev, blips.some((e) => covers(e, far.state)));
      if (swept(near.state)) note(ledger.near, rev, blips.some((e) => covers(e, near.state)));
      if (swept(dp)) note(ledger.decoy, rev, blips.some((e) => covers(e, dp)));
      if (swept(wakeMid)) note(ledger.wake, rev, wks.some((e) => covers(e, wakeMid)));
      if (beamCrossesDiscOracle(a, cp, cloudOutlineOracle(w.clouds.get('ck')!.bornAt, w.now))) {
        note(ledger.cloud, rev, (f.clouds ?? []).some((c) => c.id === 'ck'));
      }
      if ((f.foulZones ?? []).some((z) => z.id === 'fk')) foulTicks++;
    }
    expect(a.sweepRev).toBeGreaterThanOrEqual(200); // the beam really wrapped ≥ 200 times
    const tally = (m: Map<number, boolean>): { revs: number; painted: number; missed: number } => {
      const painted = [...m.values()].filter(Boolean).length;
      return { revs: m.size, painted, missed: m.size - painted };
    };
    const res = {
      far: tally(ledger.far),
      near: tally(ledger.near),
      decoy: tally(ledger.decoy),
      wake: tally(ledger.wake),
      cloud: tally(ledger.cloud),
    };
    if (process.env.HC_PERF_LOG) {
      console.log(`dropout ledgers @ FAR=${FAR}u NEAR=${NEAR}u p(FAR)=${dropoutPaintP(FAR).toFixed(3)}: ${JSON.stringify(res)} foulTicks ${foulTicks}/${ticks}`);
    }
    // (i) the far hull: painted on SOME revolutions, missed on OTHERS, at a
    // long-run share near the curve's p(FAR). (verifyFrame's completeness
    // oracle already proved a missed revolution emits nothing for it.)
    expect(res.far.revs).toBeGreaterThanOrEqual(200);
    expect(res.far.painted).toBeGreaterThan(0);
    expect(res.far.missed).toBeGreaterThan(0);
    expect(Math.abs(res.far.painted / res.far.revs - dropoutPaintP(FAR))).toBeLessThanOrEqual(0.1);
    // (ii) inside the flat band: painted on EVERY revolution.
    expect(res.near.revs).toBeGreaterThanOrEqual(200);
    expect(res.near.missed).toBe(0);
    // (iii) the decoy rolls like a hull (ruling 122: no size weighting).
    expect(res.decoy.painted).toBeGreaterThan(0);
    expect(res.decoy.missed).toBeGreaterThan(0);
    // (iv) the wake's radar half and the cloud's radar clause roll too (123).
    expect(res.wake.painted).toBeGreaterThan(0);
    expect(res.wake.missed).toBeGreaterThan(0);
    expect(res.cloud.painted).toBeGreaterThan(0);
    expect(res.cloud.missed).toBeGreaterThan(0);
    // (v) the foul zone is a drawn hazard, never a return: delivered EVERY tick.
    expect(foulTicks).toBe(ticks);
  });
});

// ---------- a cloud pass straddling bearing 0 is ONE roll (Story 9.8 review, F1)
//
// A DISC spans an arc the beam takes several ticks to cross. When that arc
// straddles bearing 0, `advanceSweeps` bumps `sweepRev` mid-pass — a roll on
// the live revolution would split one physical pass into paint-then-miss (or
// miss-then-paint). The pass must be ONE decision: every tick of it delivers
// the cloud, or none does.

describe('perception — a cloud pass across the sweep wrap is one dropout decision (Story 9.8 review, F1)', () => {
  it('a cloud at 1,400 u on bearing 0: every pass across the wrap is all-paint or all-miss, over 50+ revolutions', () => {
    const w = bareWorld();
    w.map.heightRaster = flatRaster(RADAR + 200);
    w.damageEnabled = false;
    const a = place(w, 'a', 0, 0);
    const D = 1_400;
    expect(D).toBeGreaterThan(CONFIG.vision.dropout.startU);
    expect(D - cloudOutlineOracle(0, CLOUD_LIFE_MS)).toBeGreaterThan(SIGHT); // radar-only: never sighted
    injectCloud(w, 'ck', 'z', D, 0);
    w.clouds.set('ck', { ...w.clouds.get('ck')!, until: 1e12 });
    const passes: boolean[][] = [];
    let wrapPasses = 0;
    let cur: boolean[] | null = null;
    let curWrapped = false;
    for (let t = 0; t < 52 * TICKS_PER_REV; t++) {
      w.step();
      const f = buildFrame(w, 'a');
      verifyFrame(w, 'a', f);
      const r = cloudOutlineOracle(w.clouds.get('ck')!.bornAt, w.now);
      if (beamCrossesDiscOracle(a, w.clouds.get('ck')!, r)) {
        cur ??= [];
        cur.push((f.clouds ?? []).some((c) => c.id === 'ck'));
        if (a.sweepAngle < a.prevSweepAngle) curWrapped = true;
      } else if (cur !== null) {
        passes.push(cur);
        if (curWrapped) wrapPasses++;
        cur = null;
        curWrapped = false;
      }
    }
    expect(wrapPasses).toBeGreaterThanOrEqual(50); // the passes really cross the wrap
    expect(passes.every((p) => p.length >= 2)).toBe(true); // multi-tick passes: a split was possible
    for (const [i, p] of passes.entries()) expect(new Set(p).size, `pass ${i}: ${p.join(',')}`).toBe(1);
    // Non-vacuous: the dropout really bites at this range (some passes paint, some miss).
    expect(passes.some((p) => p[0])).toBe(true);
    expect(passes.some((p) => !p[0])).toBe(true);
  });
});

// ---------- a countermeasure cloud hides NOTHING (Story 9.3 session 2) -------
//
// Eric 2026-10-12: "rather than fucking with whether I can see something,
// just draw it on top of ships." The cloud is a client overlay; directed
// non-vacuity pins for the fuzz's cloud-blind oracles.

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
    // REFUSES it: it matches no gated ship and no decoy paint.
    const forged = maskOracle(h.hullId, h.state.x, h.state.y, h.state.heading, w.now);
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
    const twinMask = maskOracle('torpedoBoat', ANNULUS_D, 0, 0, w.now);
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
// on the ocean costs d + COST × k. The distances below are derived from
// CONFIG.fog.sightCostPerU, the 500 u sight and the 750 u halo.

/** Density 1 on the whole ocean (0 past the rim). */
const FULL_FOG_CUT = -2;
const COST = CONFIG.fog.sightCostPerU;
/** How far past the ocean's rim the looking-in observer stands (clear water by the clip). */
const OFF_RIM_U = 10;

describe('perception — THE FOG FIELD: sight pays the toll (Story 9.10, amendments 149–150 / 164–170; 179: the own bank is free; 210: radar has no inner edge)', () => {
  it('LOOKING IN from clear water: a hull 200 u away with 190 u of density 1 between is no CONTACT (200 + 2 × 190 > 500) yet still a BLIP (amendment 210: radar has no inner edge), and one 150 u away with 140 u of fog is seen (150 + 280 ≤ 500); with no fog both are plain contacts', () => {
    const w = bareWorld();
    const R = w.map.radius;
    const a = place(w, 'a', R + OFF_RIM_U, 0);
    const b = place(w, 'b', R + OFF_RIM_U - 200, 0);
    const c = place(w, 'c', R + OFF_RIM_U - 150, 0);
    expect(200 + COST * (200 - OFF_RIM_U)).toBeGreaterThan(SIGHT + 2 * COST * CONFIG.fog.marchStepU); // premise, a cell of slack either way
    expect(150 + COST * (150 - OFF_RIM_U)).toBeLessThanOrEqual(SIGHT - 2 * COST * CONFIG.fog.marchStepU); // premise
    w.setFogCutForTest(FULL_FOG_CUT);
    windowAround(a, Math.PI); // the beam ON b's (and c's) bearing
    const f = buildFrame(w, 'a');
    verifyFrame(w, 'a', f);
    expect(f.contacts.map((k) => k.id)).toEqual(['c']);
    // Both hulls paint — fog is never a radar input (149) and the sweep
    // reaches inside the bubble (210): b, fog-hidden from the eye, still
    // arrives as a blip; c, sighted, is a contact AND a blip.
    const blips = blipsOf(f);
    expect(blips).toHaveLength(2);
    for (const s of [b, c]) {
      expect(blips.some((e) => maskEquals(maskOracle(s.hullId, s.state.x, s.state.y, s.state.heading, w.now), e))).toBe(true);
    }
    expect(JSON.stringify(f.contacts) + JSON.stringify(f.events)).not.toContain('"b"'); // the blip carries no identity
    // ...and with no fog, the same hull is a plain contact.
    w.setFogCutForTest(FOG_NO_CUT);
    const clear = buildFrame(w, 'a');
    verifyFrame(w, 'a', clear);
    expect(clear.contacts.map((c) => c.id).sort()).toEqual(['b', 'c']);
  });

  it('STANDING IN THE BANK (amendment 179, "like grass patches in League"): under density 1 — one ocean-wide bank — the observer at the center sees the 200 u hull, the enemy mine at 200 u, the puff and the flash at 300 u, all of which clear water would have hidden at that toll; and looking OUT, a hull 400 u away past the rim through 100 u of solid fog is a contact (the own bank costs nothing)', () => {
    const w = bareWorld();
    const R = w.map.radius;
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 200, 0);
    place(w, 'c', 2000, 0);
    injectMine(w, 'm', 'c', 0, 200);
    w.setFogCutForTest(FULL_FOG_CUT);
    emitWorldEvent(w, { k: 'sm', x: -300, y: 0, tier: 1 });
    emitWorldEvent(w, { k: 'mz', x: -300, y: 0 });
    windowAround(a, 0);
    const f = buildFrame(w, 'a');
    verifyFrame(w, 'a', f);
    expect(f.contacts.map((c) => c.id)).toEqual(['b']);
    expect(f.mines.map((m) => m.id)).toEqual(['m']);
    expect(f.events.filter((e) => e.k === 'sm' || e.k === 'mz').map((e) => e.k).sort()).toEqual(['mz', 'sm']);
    // ...and the same observer hidden from a clear-water watcher is the LOOKING IN case above: the rule is not symmetric.
    const out = bareWorld();
    place(out, 'a', R - 100, 0);
    place(out, 'b', R + 300, 0);
    out.setFogCutForTest(FULL_FOG_CUT);
    expect(400 + COST * 100).toBeGreaterThan(SIGHT); // premise: the cycle-191 toll would have hidden b
    const g = buildFrame(out, 'a');
    verifyFrame(out, 'a', g);
    expect(g.contacts.map((c) => c.id)).toEqual(['b']);
    // ...while b, in clear water, does NOT see a 400 u away through those 100 u of fog (400 + 200 > 500)
    const back = buildFrame(out, 'b');
    verifyFrame(out, 'b', back);
    expect(back.contacts).toEqual([]);
  });

  it('LOOKING IN: an enemy mine 200 u away with 190 u of density 1 between is NOT a mine row (the detect rung pays the same toll) — and it is still armed in the store; with no fog it is', () => {
    const w = bareWorld();
    const R = w.map.radius;
    place(w, 'a', R + OFF_RIM_U, 0);
    place(w, 'b', 2000, 0);
    injectMine(w, 'm', 'b', R + OFF_RIM_U - 200, 0);
    w.setFogCutForTest(FULL_FOG_CUT);
    const f = buildFrame(w, 'a');
    verifyFrame(w, 'a', f);
    expect(f.mines).toEqual([]);
    expect(w.mines.has('m')).toBe(true);
    w.setFogCutForTest(FOG_NO_CUT);
    expect(buildFrame(w, 'a').mines.map((m) => m.id)).toEqual(['m']);
  });

  it('LOOKING IN: a wounded-smoke puff (and a flash) 300 u away with 290 u of density 1 between is withheld (300 + 2 × 290 > 750) and delivered with no fog (167)', () => {
    const run = (cut: number): string[] => {
      const w = bareWorld();
      const R = w.map.radius;
      place(w, 'a', R + OFF_RIM_U, 0);
      w.setFogCutForTest(cut);
      emitWorldEvent(w, { k: 'sm', x: R + OFF_RIM_U - 300, y: 0, tier: 1 });
      emitWorldEvent(w, { k: 'mz', x: R + OFF_RIM_U - 300, y: 0 });
      const f = buildFrame(w, 'a');
      verifyFrame(w, 'a', f);
      return f.events.filter((e) => e.k === 'sm' || e.k === 'mz').map((e) => e.k).sort();
    };
    expect(300 + COST * (300 - OFF_RIM_U)).toBeGreaterThan(RADAR * CONFIG.vision.muzzleFlashFactor + 2 * COST * CONFIG.fog.marchStepU); // premise
    expect(run(FULL_FOG_CUT)).toEqual([]);
    expect(run(FOG_NO_CUT)).toEqual(['mz', 'sm']);
  });

  it('RADAR IS FOG-BLIND (149): a hull at 700 u paints the byte-identical blip under density 1 and with no fog', () => {
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

  it('ZONE CIRCLES DO NOT PAY (167): a burn zone centred 900 u away is delivered on radar range under density 1', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 2000, 0);
    injectBurnZone(w, 'bz', 'b', 900, 0);
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
    place(w, 'b', R + OFF_RIM_U - 200, 0);
    w.setFogCutForTest(FULL_FOG_CUT);
    expect(buildFrame(w, 'a').contacts).toEqual([]);
    const spec = buildFrame(w, 'a', 'finished');
    expect(spec.spec).toBe(true);
    expect(spec.contacts.map((c) => c.id)).toContain('b'); // every afloat hull, the spectator's own included
  });

  it('FAIL-CLOSED RANGE (the NaN-safe withinSight): an observer whose sightRange is NaN sees NOTHING at 10 u — no contact, no detect-rung row; the radar, which never reads sight (amendment 210), fails closed on its OWN range', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 10, 0);
    injectMine(w, 'm', 'b', 0, 10);
    (a as { stats: { sightRange: number } }).stats = { ...a.stats, sightRange: NaN };
    windowAround(a, 0);
    const f = buildFrame(w, 'a');
    expect(f.contacts).toEqual([]);
    expect(f.mines).toEqual([]);
    expect(blipsOf(f)).toHaveLength(1); // a NaN eye does not blind the scope
    (a as { stats: { radarRange: number } }).stats = { ...a.stats, radarRange: NaN };
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
  // The seven contact-like pseudo-rows are verified through the contacts/
  // mines/litZones/burnZones/foulZones/decoys/clouds frame channels
  // (verifyFrame/verifyMine/verifyLitZone/verifyBurnZone/verifyFoulZone/
  // verifyDecoy/cloudGateOracle), not through EVENT_VERIFIERS.
  // The RADAR BUOY's `buoy` row is DELETED (Story 8.16) along with its oracle;
  // `decoy` is the DECOY BUOY's channel on the mine row's rules, with its own
  // oracle (verifyDecoy); `burnzone` (Story 8.17) is the PHOSPHOR burning
  // zone's channel on the lit zone's gate, with its own oracle (verifyBurnZone).
  // `cloud` (Story 9.3 — 8.18's `smoke` seat) is the COUNTERMEASURE cloud's
  // channel, with its own oracle (cloudGateOracle / verifyCloudShape); a
  // cloud occludes nothing (Story 9.3 session 2). `foulzone` (Story 9.4) is
  // the FOULING SHELL foul zone's channel on the burn zone's gate, with its
  // own oracle (verifyFoulZone / foulZoneGateOracle). FOG (Story 9.10) HAS
  // NO ROW: the field is public weather and its hiding is the toll inside
  // the sight oracles (fogTollOracle) — the declared exceptions stay at SIX.
  const CONTACT_LIKE = ['contact', 'mine', 'litzone', 'burnzone', 'foulzone', 'decoy', 'cloud'];
  // The 19 GameEvent kinds — each MUST have an EVENT_VERIFIERS entry (Story
  // 2.1 deleted 'heal' with the REPAIR spend; Story 2.7 added self-private
  // 'bn'; Story 4.3 added the gunnery rows 'sp'/'hc'/'mz'; 2026-08-04's DAMAGE
  // CONTROL strip brought 'heal' BACK, on stricter no-severity terms; Story
  // 4.4 added the anonymous wounded-smoke row 'sm'; Story 4.5 added the
  // bearing-only foghorn row 'fh'; Story 4.12 added the identity-free radar
  // wake row 'wk'; the 2026-10-01 drone drops added self-private 'dp').
  const EVENT_KINDS = ['blip', 'shell', 'torp', 'torpU', 'boom', 'burst', 'sunk', 'spawn', 'dmg', 'pt', 'bn', 'dp', 'sp', 'hc', 'mz', 'heal', 'sm', 'fh', 'wk'];
  const EXPECTED_KEYS = [...CONTACT_LIKE, ...EVENT_KINDS];

  it('has exactly the 26 expected channel keys (19 event kinds + contact + mine + litzone + burnzone + foulzone + decoy + cloud)', () => {
    expect(Object.keys(SIGNAL_REGISTRY).sort()).toEqual([...EXPECTED_KEYS].sort());
    expect(Object.keys(SIGNAL_REGISTRY)).toHaveLength(26);
  });

  it('every row keys itself: row.eventType === its registry key', () => {
    for (const [key, row] of Object.entries(SIGNAL_REGISTRY)) {
      expect(row.eventType).toBe(key);
    }
  });

  it('the seven contact-like pseudo-rows exist (verified via the contacts/mines/litZones/burnZones/foulZones/decoys/clouds channels); fog has no row', () => {
    expect(SIGNAL_REGISTRY.contact).toBeDefined();
    expect(SIGNAL_REGISTRY.mine).toBeDefined();
    expect(SIGNAL_REGISTRY.litzone).toBeDefined();
    expect(SIGNAL_REGISTRY.burnzone).toBeDefined(); // Story 8.17
    expect(SIGNAL_REGISTRY.foulzone).toBeDefined(); // Story 9.4
    expect(SIGNAL_REGISTRY.decoy).toBeDefined();
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
  /** u — the matrix's "hull at 300 u": well inside the sight bubble. */
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
    expect(maskEquals(maskOracle(b.hullId, b.state.x, b.state.y, b.state.heading, w.now), blips[0])).toBe(true);
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
    expect(maskEquals(maskOracle(b.hullId, b.state.x, b.state.y, b.state.heading, w.now), blips[0])).toBe(true);
  });

  it('a hull behind a LOW island inside sight: no contact (eye: binary island LOS), a PARTIAL blip (radar: the shadow march)', () => {
    const w = bareWorld();
    w.map.islands.push(circleIsland(NEAR / 2, 0, 30)); // blocks the eye
    w.map.heightRaster = rasterFrom(700, ridgeField(NEAR / 2, 0, 30, 30, 16)); // low: partial illumination
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
    expect(maskEquals(maskOracle(b.hullId, b.state.x, b.state.y, b.state.heading, w.now), blips[0])).toBe(true);
  });

  it('a hull behind HARD cover (at or above mast height) inside sight: nothing on either channel', () => {
    const w = bareWorld();
    w.map.islands.push(circleIsland(NEAR / 2, 0, 30));
    w.map.heightRaster = rasterFrom(700, ridgeField(NEAR / 2, 0, 30, 30, 255));
    const a = place(w, 'a', 0, 0);
    place(w, 'b', NEAR, 0);
    windowAround(a, 0);
    const f = buildFrame(w, 'a');
    verifyFrame(w, 'a', f);
    expect(f.contacts).toEqual([]);
    expect(blipsOf(f)).toEqual([]);
  });
});
