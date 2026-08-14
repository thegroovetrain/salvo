import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  HULL_IDS,
  SHIP_CLASS_IDS,
  ZONE_BEATS_PER_GROUP,
  hullEnvelope,
  isOutside,
  mapRadius,
  radarShadowK,
  rollZoneRings,
  zoneClosedAtMs,
  zoneEndgameAtMs,
  zoneGroups,
  zoneLiveState,
  zoneRingRadii,
  zoneStateAt,
  zoneTerminalRadius,
  type ZoneRing,
  type ZoneTimeline,
} from '../index.js';

const MAP_R = mapRadius(CONFIG.match.fillTo); // the production board (2400 at the shipped targets)
const START = 10_000; // arbitrary non-zero anchor to prove startT is honored
const BEAT = CONFIG.zone.beatMs;
const GROUP_MS = ZONE_BEATS_PER_GROUP * BEAT;

/** Deterministic per-ring seed material for test rolls (one uint32 per ring). */
function seedsFor(seed: number, cfg: ZoneTimeline = CONFIG.zone): number[] {
  return Array.from({ length: zoneGroups(cfg) }, (_, i) => (seed + i * 0x9e3779b9) >>> 0);
}

/** The production ring set on fixed streams (offsets exercised, deterministic). */
function ringsFor(seed: number, cfg: ZoneTimeline = CONFIG.zone, mapR: number = MAP_R): ZoneRing[] {
  return rollZoneRings(mapR, cfg, seedsFor(seed, cfg));
}

const dist = (a: ZoneRing, b: ZoneRing): number => Math.hypot(a.cx - b.cx, a.cy - b.cy);

describe('zone timeline shape — the ratified design targets', () => {
  it('runs 4 ring groups of 4 beats and closes fully at 16:00 (sudden death, Eric ruling 2026-08-14)', () => {
    // THREE geometric groups (map → terminal, closing at 12:00) plus the
    // appended COLLAPSE group: 12:00 clear, 13:00 supply, 14:00 the mark,
    // 15:00-16:00 the terminal ring closing onto its own center.
    expect(zoneGroups(CONFIG.zone)).toBe(4);
    expect(zoneClosedAtMs(CONFIG.zone)).toBe(960_000); // 16:00
    // The GEOMETRIC endgame is still reached at 12:00 — sudden death appended a
    // group, it did not move one (this is what the Story 3.4 evidence and the
    // batch-sim endgame pilot are gated on).
    expect(zoneClosedAtMs({ ...CONFIG.zone, suddenDeath: false })).toBe(720_000); // 12:00
  });

  it('zoneEndgameAtMs is the ENDGAME RING (12:00), separate from full closure once sudden death appends its group', () => {
    // The Story 3.4 Endgame Guarantee is about the instant the terminal 660u
    // ring goes live, which sudden death did NOT move. Keeping the two apart is
    // what stops the batch-sim past-closure evidence line from scoring a
    // healthy ~13:00 campaign as 0% past closure.
    expect(zoneEndgameAtMs(CONFIG.zone)).toBe(720_000); // 12:00
    expect(zoneClosedAtMs(CONFIG.zone)).toBe(960_000); // 16:00
    expect(zoneEndgameAtMs(CONFIG.zone)).toBeLessThan(zoneClosedAtMs(CONFIG.zone));
    // On a non-collapsing timeline the two are the SAME instant, which is why
    // every pre-ruling caller could use either.
    const off = { ...CONFIG.zone, suddenDeath: false };
    expect(zoneEndgameAtMs(off)).toBe(zoneClosedAtMs(off));
    // Fails closed on a degenerate beat exactly as zoneClosedAtMs does.
    expect(zoneEndgameAtMs({ ...CONFIG.zone, beatMs: 0 })).toBe(0);
  });

  it('terminal radius is DERIVED from CONFIG.vision.sight (never a literal) — and sudden death does NOT move it', () => {
    expect(zoneTerminalRadius(CONFIG.zone)).toBe(CONFIG.zone.terminalSightFactor * CONFIG.vision.sight);
    expect(zoneTerminalRadius(CONFIG.zone)).toBe(2 * CONFIG.vision.sight);
    // zoneTerminalRadius means the 660u ENDGAME ring, before and after the
    // ruling: the collapse ring is appended past the clamp chain, never
    // produced by it, so Story 3.4's constraint pins below are untouched.
    expect(zoneTerminalRadius({ ...CONFIG.zone, suddenDeath: false })).toBe(zoneTerminalRadius(CONFIG.zone));
  });

  it('intermediate radii step down geometrically (equal ratio steps map → terminal), then collapse to 0', () => {
    const radii = zoneRingRadii(MAP_R, CONFIG.zone);
    expect(radii).toHaveLength(5); // ring 0 (full map) .. terminal .. collapse
    expect(radii[0]).toBe(MAP_R);
    expect(radii[3]).toBeCloseTo(2 * CONFIG.vision.sight, 9);
    expect(radii[4]).toBe(0); // the collapse ring — EXACTLY zero, never a float
    // The equal-ratio pin covers the GEOMETRIC prefix only: the collapse step is
    // not a geometric shrink, it is the ring closing onto its own center.
    const ratio = radii[1] / radii[0];
    expect(radii[2] / radii[1]).toBeCloseTo(ratio, 9);
    expect(radii[3] / radii[2]).toBeCloseTo(ratio, 9);
    // ...and that prefix is BYTE-IDENTICAL to the pre-ruling chain.
    expect(radii.slice(0, 4)).toEqual(zoneRingRadii(MAP_R, { ...CONFIG.zone, suddenDeath: false }));
  });
});

// Endgame Guarantee sensor-vs-ring pins, honestly described: with the
// committed derivation CONFIG.vision.radar === 2 × CONFIG.vision.sight and
// zoneTerminalRadius(cfg) === terminalSightFactor × sight, BOTH inequalities
// below reduce algebraically to a pure comparison against terminalSightFactor
// once `sight` (> 0) cancels: radar >= terminal <=> factor <= 2, and
// sight < terminal <=> factor > 1. Together they bind
// terminalSightFactor ∈ (1, 2] against the shared derivation — sight itself
// cancels out, so a truesight-only retune (changing CONFIG.vision.sight alone)
// can NEVER fail either test. That is exactly the intent: these are FACTOR /
// DERIVATION pins, not a sight pin — a one-sided retune of terminalSightFactor
// out of (1, 2], or of the radar-from-sight derivation itself, is what must
// fail loudly here.
describe('Endgame Guarantee (Story 3.4) — sensor-vs-ring constraints', () => {
  it('radar is structurally 2 × sight (Eric ruling 2026-08-02, amendment 22 — derivation pin)', () => {
    expect(CONFIG.vision.radar).toBe(2 * CONFIG.vision.sight);
  });

  it('muzzleFlash is structurally 1.25 × sight — the ladder 5/8 rung (Story 4.9, amendment 119; was 1.5 / 6/8 — derivation pin)', () => {
    expect(CONFIG.vision.muzzleFlash).toBe(1.25 * CONFIG.vision.sight);
  });

  it('detect is structurally 0.75 × sight — the ladder 3/8 rung, mines + torpedoes (Story 4.9, amendment 119 — derivation pin)', () => {
    expect(CONFIG.vision.detect).toBe(0.75 * CONFIG.vision.sight);
  });

  it('farRadar is structurally 1.75 × sight — the ladder 7/8 rung (Story 4.9, amendment 118 — derivation pin; deliberately unconsumed, it is 4.10 calibration)', () => {
    expect(CONFIG.vision.farRadar).toBe(1.75 * CONFIG.vision.sight);
  });

  it('the detect RUNG and the runtime detectFactor can never drift: detect === sight × detectFactor (amendment 121 — the gate is observer-scaled, the rung is what it equals at base stats)', () => {
    expect(CONFIG.vision.detectFactor).toBe(0.75);
    expect(CONFIG.vision.detect).toBe(CONFIG.vision.sight * CONFIG.vision.detectFactor);
  });

  it('the full eighths ladder is ordered: detect < sight < muzzleFlash < farRadar < radar (amendments 113/119 — one ruler, no rung out of place)', () => {
    expect(CONFIG.vision.detect).toBeLessThan(CONFIG.vision.sight);
    expect(CONFIG.vision.sight).toBeLessThan(CONFIG.vision.muzzleFlash);
    expect(CONFIG.vision.muzzleFlash).toBeLessThan(CONFIG.vision.farRadar);
    expect(CONFIG.vision.farRadar).toBeLessThan(CONFIG.vision.radar);
  });

  it('every rung is an EIGHTH of intel range — radar/8 divides each one exactly (the ruler is real, not approximate)', () => {
    const eighth = CONFIG.vision.radar / 8;
    expect(CONFIG.vision.detect / eighth).toBe(3);
    expect(CONFIG.vision.sight / eighth).toBe(4);
    expect(CONFIG.vision.muzzleFlash / eighth).toBe(5);
    expect(CONFIG.vision.farRadar / eighth).toBe(7);
    expect(CONFIG.vision.radar / eighth).toBe(8);
  });

  it('radar reaches the terminal ring radius — reduces to terminalSightFactor <= 2 (sight cancels; a truesight-only retune cannot fail this)', () => {
    expect(CONFIG.vision.radar).toBeGreaterThanOrEqual(zoneTerminalRadius(CONFIG.zone));
  });

  it('sight does NOT reach the terminal ring radius — reduces to terminalSightFactor > 1 (sight cancels; a truesight-only retune cannot fail this)', () => {
    expect(CONFIG.vision.sight).toBeLessThan(zoneTerminalRadius(CONFIG.zone));
  });

  it('terminalSightFactor is finite (a NaN factor would otherwise silently pass both pins above via the fail-closed ×2 fallback in zoneTerminalRadius)', () => {
    expect(Number.isFinite(CONFIG.zone.terminalSightFactor)).toBe(true);
  });
});

// Radar-shadow constants (Story 4.11), pinned BUILD-FAILING beside the ladder
// they hang off. `CONFIG.vision.radar` drives gun.rangeU, cannon.rangeU and
// starShells.rangeU, so if the shadow model's K were ever un-pinned from
// radarRange²/4, a shadow-feel retune of R would silently rebalance every gun
// in the game (amendment 182); and if H ever became a computed quantity — a
// percentile of a map's height distribution, or an absolute elevation
// converted per map — the shadow character would drift per seed instead of
// being the ratified q64 decision (amendment 184 struck both out).
describe('radar shadows (Story 4.11) — the 2RH pin and the fixed mast height', () => {
  it('the model K equals radarRange²/4 — i.e. 2RH = radarRange²/4 holds by construction, R being the derived quantity (amendments 114/182/185)', () => {
    expect(radarShadowK()).toBe(CONFIG.vision.radar ** 2 / 4);
  });

  it('radarMastQ is the FIXED literal 64, in raster q units — never computed, never a percentile (amendments 177/184; moving it is an Eric decision, not a tweak)', () => {
    expect(CONFIG.vision.radarMastQ).toBe(64);
    expect(Number.isInteger(CONFIG.vision.radarMastQ)).toBe(true);
  });

  it('the mast sits strictly inside the quantized range (0, 255] — soft cover EXISTS, the deliberate semi-realism departure of amendment 177 (0 would delete it; > 255 would make every wall soft)', () => {
    expect(CONFIG.vision.radarMastQ).toBeGreaterThan(0);
    expect(CONFIG.vision.radarMastQ).toBeLessThanOrEqual(255);
  });
});

// Radar-wake constants (Story 4.12), pinned beside the ladder they sit under.
// The wake clock is sacred the way land is: a COMPUTED lifetime would drift
// with tuning elsewhere, and the three clocks (water dissipation 5.5s,
// phosphor 12s at base rate, material reach ~412u against a 192-247.5u
// full-ahead track — amendments 205 + 213) would silently desynchronise.
describe('radar wakes (Story 4.12) — the wake clock and cadence pins', () => {
  it('wakeLifeMs is the FIXED literal 5500 — Eric-ruled (amendments 205 + 213), never a computed quantity', () => {
    expect(CONFIG.vision.wakeLifeMs).toBe(5500);
    expect(Number.isInteger(CONFIG.vision.wakeLifeMs)).toBe(true);
  });

  // THE RUNG THE CLOCK WAS CUT TO (cycle 71, amendment 213). Eric cut 12s ->
  // 5.5s on seeing a full-ahead torpedo boat: *"that wake trail is far as
  // fuck"*. The replacement is not a feel number but an eighths-ladder rung —
  // the FASTEST hull's full-ahead track is exactly `detect`, so your wake
  // reaches as far behind you as detect reaches around you.
  //
  // ASSERTED, NOT COMPUTED IN constants.ts, and that is the whole point of
  // this test: deriving the clock from `maxSpeed` in the object literal would
  // let a kinematics retune silently move a value Eric SET. Here it fails the
  // build instead, and a human re-decides which of the two should move.
  it('and it puts the fastest PLAYABLE hull\'s full-ahead track exactly on the 3/8 detect rung (amendment 213)', () => {
    const fastest = SHIP_CLASS_IDS.reduce((top, id) => Math.max(top, hullEnvelope(id).kinematics.maxSpeed), 0);
    expect(fastest).toBeGreaterThan(0);
    expect((CONFIG.vision.wakeLifeMs / 1000) * fastest).toBeCloseTo(CONFIG.vision.detect, 9);
  });

  // PLAYABLE, not "every hull", and the distinction is Eric's rather than a
  // convenience: he ruled the cut from the cockpit of a torpedo boat at full
  // ahead, so the anchor is the fastest thing a CAPTAIN can drive (45 u/s).
  // One drone envelope runs a single unit hotter — the retired destroyer's 46
  // u/s, preserved byte-for-byte by the shipClasses identity test — so a drone
  // lays 253u against the rung's 247.5u. That 2% overshoot is recorded here so
  // it reads as a known consequence rather than a broken invariant, and it is
  // bounded above by this assertion.
  it('and a drone envelope overshoots the rung by no more than a hair (it is 1 u/s faster than any captain)', () => {
    const fastestAny = HULL_IDS.reduce((top, id) => Math.max(top, hullEnvelope(id).kinematics.maxSpeed), 0);
    const track = (CONFIG.vision.wakeLifeMs / 1000) * fastestAny;
    expect(track).toBeGreaterThanOrEqual(CONFIG.vision.detect);
    expect(track).toBeLessThan(CONFIG.vision.detect * 1.05);
  });

  it('wakeSampleU is the FIXED literal 12 — one sample per lattice cell plus margin, never a computed quantity', () => {
    expect(CONFIG.vision.wakeSampleU).toBe(12);
    expect(Number.isInteger(CONFIG.vision.wakeSampleU)).toBe(true);
  });

  it('wakeSampleU > radarCellU — consecutive segments rasterize contiguously without oversampling the lattice', () => {
    expect(CONFIG.vision.wakeSampleU).toBeGreaterThan(CONFIG.vision.radarCellU);
  });

  // THE THREE-CLOCKS PIN, NOW A GUARANTEE AT EVERY SWEEP RATE (cycle 71,
  // amendment 213). The "water always has a live paint behind it" handover
  // property is arithmetic on persistSweeps × sweepPeriod ≥ wakeLifeMs — and
  // under the 12s clock it held ONLY at the base 15rpm rate (3 × 4s = 12s
  // exactly, an agreement amendment 205 itself called a COINCIDENCE). At
  // `sweepRpmMax` the revolution halves, giving a 6s phosphor window against
  // 12s of water: cycle 69's review gate found that hole and RULED IT
  // ACCEPTED rather than repaired, because amendment 195 forbids a
  // wake-specific paint lifetime and a global fixed-ms window would re-price
  // the intelSweep boon for every paint.
  //
  // CUTTING THE WATER CLOCK TO 5.5s CLOSED IT FOR FREE — 6s of phosphor now
  // covers 5.5s of water with margin, so the guarantee holds at the base rate
  // AND at a maxed intelSweep build. That is why these two assertions are `>=`
  // rather than the old exact equalities: the relationship being defended is a
  // COVERING, and pinning it to equality would fail the build on a change that
  // made it safer. The worst case is asserted explicitly below so the margin
  // can never quietly evaporate either.
  //
  // The `3` is CLIENT_CONFIG.blip.persistSweeps written as a LITERAL (the
  // oracle discipline: shared may not import client config); its own pin lives
  // in client/src/__tests__/wake.test.ts beside the handover suite.
  it('the three clocks agree AT THE BASE SWEEP RATE: three paints cover the water clock (amendments 195/205)', () => {
    expect(3 * (60_000 / CONFIG.vision.sweepRpm)).toBeGreaterThanOrEqual(CONFIG.vision.wakeLifeMs);
  });

  it('and AT sweepRpmMax TOO — the cycle-69 P4 shortfall is resolved by the 5.5s clock, not merely accepted (amendment 213)', () => {
    const worst = 3 * (60_000 / CONFIG.vision.sweepRpmMax);
    expect(worst).toBeGreaterThanOrEqual(CONFIG.vision.wakeLifeMs);
    // ...and the margin is real rather than a hairline: half a second of
    // phosphor outlives the water even on the fastest sweep money can buy.
    expect(worst - CONFIG.vision.wakeLifeMs).toBeGreaterThanOrEqual(500);
  });
});

describe('closing-rate criterion (amendment 7) — pinned over committed CONFIG', () => {
  const battleshipMinute =
    CONFIG.shipClasses.battleship.kinematics.maxSpeed * (CONFIG.zone.beatMs / 1000); // 2100u at the targets

  it('worst-case escape per close = (1 + offsetCap) × max Δr ≤ a battleship-minute, ≈80%', () => {
    // The collapse step (660 → 0) is SMALLER than the largest geometric step
    // (2400 → 1560.5), so appending it does not move maxDelta and the ratified
    // band still binds the same close it always did.
    const radii = zoneRingRadii(MAP_R, CONFIG.zone);
    let maxDelta = 0;
    for (let g = 1; g < radii.length; g += 1) maxDelta = Math.max(maxDelta, radii[g - 1] - radii[g]);
    const worstEscape = (1 + CONFIG.zone.offsetCap) * maxDelta;
    expect(worstEscape).toBeLessThanOrEqual(battleshipMinute);
    // The ratified target band: ≈80% of a battleship-minute ("neither dilly nor dally").
    const fraction = worstEscape / battleshipMinute;
    expect(fraction).toBeGreaterThan(0.75);
    expect(fraction).toBeLessThan(0.85);
  });

  it('the COLLAPSE close is the gentlest of them all — it is concentric, so the escape is a bare radius', () => {
    // A geometric close can move the center too, which is why the criterion
    // carries the (1 + offsetCap) term. The collapse cannot: it closes onto its
    // OWN center, so the worst case is a hull on the rim sailing to the middle
    // — exactly the terminal radius, and nothing more.
    const worstEscape = zoneTerminalRadius(CONFIG.zone); // 660u, rim → center
    expect(worstEscape).toBeLessThan(battleshipMinute * 0.35);
    // And it is genuinely the easiest close in the timeline to survive.
    const radii = zoneRingRadii(MAP_R, CONFIG.zone);
    for (let g = 1; g < radii.length - 1; g += 1) {
      expect(worstEscape).toBeLessThanOrEqual((1 + CONFIG.zone.offsetCap) * (radii[g - 1] - radii[g]));
    }
  });
});

describe('rollZoneRings — containment + determinism (property, ∀ seeds)', () => {
  it('every next ring is fully contained in the current ring, for 200 seeds', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const rings = ringsFor(seed);
      for (let g = 1; g < rings.length; g += 1) {
        // circle g ⊆ circle g−1 ⇔ centerDist + r_g ≤ r_{g−1} (ε for float sums)
        expect(dist(rings[g - 1], rings[g]) + rings[g].r).toBeLessThanOrEqual(rings[g - 1].r + 1e-9);
      }
      expect(rings[0]).toEqual({ cx: 0, cy: 0, r: MAP_R }); // ring 0 is the full map
      // The ENDGAME ring is now second-to-last (the collapse ring is last), and
      // the collapse ring is CONCENTRIC with it at radius exactly 0.
      const endgame = rings[rings.length - 2];
      const collapse = rings[rings.length - 1];
      expect(endgame.r).toBeCloseTo(2 * CONFIG.vision.sight, 9);
      expect(collapse).toEqual({ cx: endgame.cx, cy: endgame.cy, r: 0 });
    }
  });

  it('the collapse ring consumes NO seed material — the rolled prefix is byte-identical with the flag off', () => {
    // Turning sudden death on must not be able to move a single existing ring:
    // the collapse ring is appended concentric, never drawn from a stream.
    const noCollapse: ZoneTimeline = { ...CONFIG.zone, suddenDeath: false };
    for (let seed = 1; seed <= 50; seed += 1) {
      const withCollapse = rollZoneRings(MAP_R, CONFIG.zone, seedsFor(seed));
      const without = rollZoneRings(MAP_R, noCollapse, seedsFor(seed, noCollapse));
      expect(withCollapse.slice(0, without.length)).toEqual(without);
      expect(withCollapse).toHaveLength(without.length + 1);
    }
  });

  it('containment holds structurally even for an out-of-range offsetCap', () => {
    const cfg: ZoneTimeline = { ...CONFIG.zone, offsetCap: 99 }; // clamped to 1
    for (let seed = 1; seed <= 50; seed += 1) {
      const rings = rollZoneRings(MAP_R, cfg, seedsFor(seed, cfg));
      for (let g = 1; g < rings.length; g += 1) {
        expect(dist(rings[g - 1], rings[g]) + rings[g].r).toBeLessThanOrEqual(rings[g - 1].r + 1e-9);
      }
    }
  });

  it('same seed set → identical rings; different seeds → different centers', () => {
    expect(ringsFor(7)).toEqual(ringsFor(7));
    const a = ringsFor(7);
    const b = ringsFor(8);
    expect(a.slice(1).map((r) => [r.cx, r.cy])).not.toEqual(b.slice(1).map((r) => [r.cx, r.cy]));
  });

  it('rings roll on INDEPENDENT per-ring streams (review FIX 2: one reveal discloses nothing)', () => {
    // Offsets are chained (each center hangs off the previous ring), so the
    // independence property is: (a) changing ring j's seed leaves every ring
    // BEFORE j untouched, and (b) ring j's OFFSET DELTA from its parent is a
    // function of ring j's seed alone — other seeds moving never change it.
    const base = seedsFor(7);
    const delta = (rings: ZoneRing[], g: number): [number, number] => [
      rings[g].cx - rings[g - 1].cx,
      rings[g].cy - rings[g - 1].cy,
    ];
    const a = rollZoneRings(MAP_R, CONFIG.zone, base);
    // Change ONLY ring 2's seed: ring 1 is untouched, ring 2 moves, and ring
    // 3's own offset delta is unchanged (its stream never saw the change).
    const b = rollZoneRings(MAP_R, CONFIG.zone, [base[0], 0xdead, base[2]]);
    expect(b[1]).toEqual(a[1]);
    expect(delta(b, 2)).not.toEqual(delta(a, 2));
    expect(delta(b, 3)[0]).toBeCloseTo(delta(a, 3)[0], 9);
    expect(delta(b, 3)[1]).toBeCloseTo(delta(a, 3)[1], 9);
    // Change ONLY ring 1's seed: rings 2 and 3 keep their own deltas exactly.
    const c = rollZoneRings(MAP_R, CONFIG.zone, [0xbeef, base[1], base[2]]);
    expect(c[1]).not.toEqual(a[1]);
    for (const g of [2, 3]) {
      expect(delta(c, g)[0]).toBeCloseTo(delta(a, g)[0], 9);
      expect(delta(c, g)[1]).toBeCloseTo(delta(a, g)[1], 9);
    }
  });

  it('missing seed material fails CLOSED to concentric rings', () => {
    const rings = rollZoneRings(MAP_R, CONFIG.zone, []);
    for (const ring of rings) expect(Math.hypot(ring.cx, ring.cy)).toBe(0);
  });

  it('offsetCap 0 rolls concentric rings', () => {
    const rings = rollZoneRings(MAP_R, { ...CONFIG.zone, offsetCap: 0 }, seedsFor(5));
    for (const ring of rings) expect(Math.hypot(ring.cx, ring.cy)).toBe(0);
  });
});

describe('zoneStateAt — the four-beat rhythm per group', () => {
  const rings = ringsFor(11);

  it.each([
    ['clear', 0],
    ['supply', 1],
    ['reveal', 2],
    ['closing', 3],
  ])("names beat %s at in-group beat index %i (every group)", (phase, beat) => {
    for (let g = 0; g < zoneGroups(); g += 1) {
      const t = START + g * GROUP_MS + beat * BEAT + BEAT / 2;
      const s = zoneStateAt(t, START, rings);
      expect(s.phase).toBe(phase);
      expect(s.groupIndex).toBe(g);
    }
  });

  it('holds ring g EXACTLY through clear/supply/reveal', () => {
    for (let g = 0; g < zoneGroups(); g += 1) {
      for (const offset of [0, BEAT, 2 * BEAT, 3 * BEAT - 1]) {
        const s = zoneStateAt(START + g * GROUP_MS + offset, START, rings);
        expect(s.current).toEqual(rings[g]);
      }
    }
  });

  it('exposes next-ring geometry from the reveal beat ONLY (null in clear/supply)', () => {
    const g = 1;
    expect(zoneStateAt(START + g * GROUP_MS, START, rings).next).toBeNull();
    expect(zoneStateAt(START + g * GROUP_MS + BEAT, START, rings).next).toBeNull();
    expect(zoneStateAt(START + g * GROUP_MS + 2 * BEAT, START, rings).next).toEqual(rings[g + 1]);
    expect(zoneStateAt(START + g * GROUP_MS + 3 * BEAT, START, rings).next).toEqual(rings[g + 1]);
  });

  it('interpolates BOTH center and radius linearly across the close beat', () => {
    const g = 0;
    const closeStart = START + g * GROUP_MS + 3 * BEAT;
    for (const f of [0, 0.25, 0.5, 0.75]) {
      const s = zoneStateAt(closeStart + f * BEAT, START, rings);
      expect(s.phase).toBe('closing');
      expect(s.current.cx).toBeCloseTo(rings[g].cx + (rings[g + 1].cx - rings[g].cx) * f, 9);
      expect(s.current.cy).toBeCloseTo(rings[g].cy + (rings[g + 1].cy - rings[g].cy) * f, 9);
      expect(s.current.r).toBeCloseTo(rings[g].r + (rings[g + 1].r - rings[g].r) * f, 9);
    }
  });

  it('is continuous at the close-completion boundary (ring g+1 becomes current exactly)', () => {
    const g = 0;
    const boundary = START + (g + 1) * GROUP_MS;
    const justBefore = zoneStateAt(boundary - 1, START, rings);
    const atBoundary = zoneStateAt(boundary, START, rings);
    expect(justBefore.phase).toBe('closing');
    expect(atBoundary.phase).toBe('clear');
    expect(atBoundary.groupIndex).toBe(g + 1);
    expect(atBoundary.current).toEqual(rings[g + 1]);
    expect(Math.abs(justBefore.current.r - rings[g + 1].r)).toBeLessThan(rings[g].r / BEAT + 1e-6);
  });

  it('counts closesInMs down to the close START pre-close and the close END while closing', () => {
    expect(zoneStateAt(START, START, rings).closesInMs).toBe(3 * BEAT);
    expect(zoneStateAt(START + BEAT, START, rings).closesInMs).toBe(2 * BEAT);
    expect(zoneStateAt(START + 3 * BEAT, START, rings).closesInMs).toBe(BEAT);
    expect(zoneStateAt(START + 3 * BEAT + BEAT / 2, START, rings).closesInMs).toBe(BEAT / 2);
  });

  it('is closed on the terminal ring forever past full closure', () => {
    const done = START + zoneClosedAtMs(CONFIG.zone);
    for (const t of [done, done + 1, done + 10_000_000]) {
      const s = zoneStateAt(t, START, rings);
      expect(s.phase).toBe('closed');
      expect(s.current).toEqual(rings[rings.length - 1]);
      expect(s.next).toBeNull();
      expect(s.closesInMs).toBe(0);
    }
  });
});

describe('zoneLiveState — the schema-fed client shape agrees with the full set', () => {
  const rings = ringsFor(13);

  it('given (ring g, ring g+1) it reproduces zoneStateAt exactly across every beat', () => {
    for (let ms = 0; ms < zoneClosedAtMs(CONFIG.zone); ms += BEAT / 4) {
      const full = zoneStateAt(START + ms, START, rings);
      const g = full.groupIndex;
      // The schema mirror: current = ring g at the last boundary; next = ring
      // g+1 only from reveal (zeroed before — modeled as null here).
      const revealedNext = full.next !== null ? rings[g + 1] ?? null : null;
      const live = zoneLiveState(START + ms, START, rings[g], revealedNext, CONFIG.zone);
      expect(live).toEqual(full);
    }
  });

  it('fails closed while closing with a stale (null) next: holds ring g', () => {
    const t = START + 3 * BEAT + BEAT / 2;
    const s = zoneLiveState(t, START, rings[0], null, CONFIG.zone);
    expect(s.phase).toBe('closing');
    expect(s.current).toEqual(rings[0]);
  });
});

describe('degenerate timelines — fail closed, never NaN, never a hang', () => {
  const ring: ZoneRing = { cx: 0, cy: 0, r: 100 };

  it.each([[0], [-1], [NaN], [Infinity]])('beatMs %d reads as closed with 0 total duration', (beatMs) => {
    const cfg: ZoneTimeline = { ...CONFIG.zone, beatMs };
    expect(zoneClosedAtMs(cfg)).toBe(0);
    const s = zoneLiveState(START + 1, START, ring, null, cfg);
    expect(s.phase).toBe('closed');
    expect(s.closesInMs).toBe(0);
  });

  it('zero groups (empty ringSteps) is a single map → terminal close', () => {
    // suddenDeath OFF here on purpose: this pins what `ringSteps` alone decides
    // (the geometric descent), and the appended collapse group is the subject of
    // its own suite. With the flag on the same cfg is a 2-group timeline.
    const cfg: ZoneTimeline = { ...CONFIG.zone, ringSteps: [], suddenDeath: false };
    expect(zoneGroups(cfg)).toBe(1);
    expect(zoneClosedAtMs(cfg)).toBe(ZONE_BEATS_PER_GROUP * BEAT);
    const radii = zoneRingRadii(MAP_R, cfg);
    expect(radii).toEqual([MAP_R, 2 * CONFIG.vision.sight]);
  });

  it('NaN/negative ringSteps and offsetCap never produce NaN or growing rings', () => {
    const cfg: ZoneTimeline = { ...CONFIG.zone, ringSteps: [NaN, -3], offsetCap: NaN };
    const rings = rollZoneRings(MAP_R, cfg, seedsFor(3, cfg));
    let prev = Infinity;
    for (const r of rings) {
      expect(Number.isFinite(r.cx) && Number.isFinite(r.cy) && Number.isFinite(r.r)).toBe(true);
      expect(r.r).toBeLessThanOrEqual(prev);
      expect(Math.hypot(r.cx, r.cy)).toBe(0); // NaN offsetCap clamps to 0 (fail-closed)
      prev = r.r;
    }
  });

  it('a NaN terminalSightFactor falls back to the ratified ×2', () => {
    expect(zoneTerminalRadius({ ...CONFIG.zone, terminalSightFactor: NaN })).toBe(2 * CONFIG.vision.sight);
  });

  it('a map smaller than the terminal radius clamps every ring to the map', () => {
    const radii = zoneRingRadii(300, CONFIG.zone); // terminal 660 > map 300
    for (const r of radii) expect(r).toBeLessThanOrEqual(300);
    expect(radii[radii.length - 2]).toBe(300); // the GEOMETRIC terminal, clamped to the map
    expect(radii[radii.length - 1]).toBe(0); // ...then the collapse ring
  });

  it('the GEOMETRIC terminal is still FLOORED at 1u — the collapse ring is the ONE legal r=0 ring', () => {
    // THE SENTINEL RULE, re-derived under sudden death. `zoneNextR === 0` on the
    // wire still means "unrevealed", so no ring that can ever be TRANSMITTED as
    // revealed geometry may be r=0 — that is what the 1u floor protects, and a
    // dev-only zoneOverride with terminalSightFactor 0 still cannot breach it.
    // The collapse ring is the one exception, and it is legal precisely because
    // it is NEVER read off the wire: both sides synthesize it (see
    // effectiveNext / the wire-parity suite above), so the sentinel and it can
    // never be confused.
    const cfg: ZoneTimeline = { ...CONFIG.zone, terminalSightFactor: 0 };
    const radii = zoneRingRadii(MAP_R, cfg);
    expect(radii[radii.length - 2]).toBe(1); // the geometric terminal: floored
    expect(radii[radii.length - 1]).toBe(0); // the collapse ring: exactly zero
    const rings = rollZoneRings(MAP_R, cfg, seedsFor(9, cfg));
    for (const ring of rings.slice(0, -1)) expect(ring.r).toBeGreaterThanOrEqual(1);
    // Every GEOMETRIC ring keeps a safe center; the collapse ring keeps none —
    // which is the feature (at full collapse the whole map is storm).
    expect(isOutside({ x: 0, y: 0 }, 0, 0, radii[radii.length - 2])).toBe(false);
    expect(isOutside({ x: 0, y: 0 }, 0, 0, radii[radii.length - 1])).toBe(true);
    // ...and with sudden death OFF the last ring is the floored one, as shipped.
    const off = zoneRingRadii(MAP_R, { ...cfg, suddenDeath: false });
    expect(off[off.length - 1]).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// SUDDEN DEATH — THE FINAL COLLAPSE (Eric ruling 2026-08-14). The fourth ring
// group: 12:00 clear, 13:00 supply, 14:00 the mark, 15:00-16:00 the terminal
// ring closing CONCENTRICALLY onto its own center, all storm from 16:00.
// ---------------------------------------------------------------------------
describe('sudden death — the collapse group', () => {
  const rings = ringsFor(17);
  const ENDGAME = rings[rings.length - 2]; // the 660u terminal ring
  const COLLAPSE = rings[rings.length - 1]; // its center, radius 0
  /** The final group's beats on Eric's clock, at the shipped 60s beat. */
  const CLEAR = START + 720_000; // 12:00
  const SUPPLY = START + 780_000; // 13:00
  const MARK = START + 840_000; // 14:00 — the reveal beat
  const CLOSE = START + 900_000; // 15:00 — the collapse begins
  const DONE = START + 960_000; // 16:00 — all storm

  it('lands its beats on Eric’s clock: 12:00 clear, 13:00 supply, 14:00 reveal, 15:00 closing, 16:00 closed', () => {
    for (const [t, phase] of [[CLEAR, 'clear'], [SUPPLY, 'supply'], [MARK, 'reveal'], [CLOSE, 'closing']] as const) {
      const s = zoneStateAt(t, START, rings);
      expect(s.phase).toBe(phase);
      expect(s.groupIndex).toBe(3);
    }
    expect(zoneStateAt(DONE, START, rings).phase).toBe('closed');
    expect(zoneStateAt(DONE - 1, START, rings).phase).toBe('closing');
  });

  it('marks the collapse point at the reveal beat: a next ring CONCENTRIC with the terminal, radius 0', () => {
    expect(zoneStateAt(MARK - 1, START, rings).next).toBeNull(); // 13:59 — nothing yet
    const s = zoneStateAt(MARK, START, rings);
    expect(s.next).toEqual({ cx: ENDGAME.cx, cy: ENDGAME.cy, r: 0 });
    expect(s.current).toEqual(ENDGAME); // the live ring still HOLDS through the mark
  });

  it('interpolates 660 → 0 with the center held EXACTLY fixed (concentric collapse, no drift)', () => {
    for (const f of [0, 0.25, 0.5, 0.75, 0.999]) {
      const s = zoneStateAt(CLOSE + f * BEAT, START, rings);
      expect(s.phase).toBe('closing');
      expect(s.current.cx).toBe(ENDGAME.cx); // BYTE-exact, not "close to"
      expect(s.current.cy).toBe(ENDGAME.cy);
      expect(s.current.r).toBeCloseTo(ENDGAME.r * (1 - f), 9);
    }
    expect(zoneStateAt(CLOSE + BEAT / 2, START, rings).current.r).toBeCloseTo(2 * CONFIG.vision.sight / 2, 9);
  });

  it('is CLOSED on a radius-0 ring forever after 16:00', () => {
    for (const t of [DONE, DONE + 1, DONE + 10_000_000]) {
      const s = zoneStateAt(t, START, rings);
      expect(s.phase).toBe('closed');
      expect(s.current).toEqual(COLLAPSE);
      expect(s.current.r).toBe(0);
      expect(s.next).toBeNull();
      expect(s.closesInMs).toBe(0);
    }
  });

  it('leaves NOWHERE safe once collapsed — every point on the map is outside, including the collapse point itself', () => {
    const ring = zoneStateAt(DONE, START, rings).current;
    const points = [
      { x: ring.cx, y: ring.cy }, // the collapse point
      { x: 0, y: 0 }, // the map origin
      { x: MAP_R, y: 0 }, // the map rim
      { x: ring.cx + 1, y: ring.cy }, // a metre off
    ];
    for (const p of points) expect(isOutside(p, ring.cx, ring.cy, ring.r)).toBe(true);
  });

  // THE WIRE-PARITY PROPERTY — the whole reason this ships with no schema
  // change. A client fed by the room schema NEVER receives the collapse ring:
  // `zoneNextR === 0` means "unrevealed", so its `next` is null through the
  // entire final group. It must nonetheless derive geometry identical to the
  // server's, which reaches the same ring through the rolled array.
  it('a schema-fed client (next = null in the final group) derives the server’s ring EXACTLY, at every quarter-beat', () => {
    for (let ms = 0; ms <= zoneClosedAtMs(CONFIG.zone) + 2 * BEAT; ms += BEAT / 4) {
      const full = zoneStateAt(START + ms, START, rings);
      const g = Math.min(full.groupIndex, rings.length - 1);
      // The mirror EXACTLY as ArenaRoom writes it: cur = ring g at the last
      // boundary (the collapse ring itself once closed), next = the revealed
      // ring only when its radius is non-zero — the collapse ring is zeroed by
      // the sentinel and therefore arrives as null.
      const mirroredCur = full.phase === 'closed' ? rings[rings.length - 1] : rings[g];
      // (`full.next !== null` alone IS the mirror's rule — syncZoneGeometry writes
      // `zoneRevealedNextRing ?? ZERO_RING`, so no extra phase clause belongs here.)
      const revealed = full.next !== null ? rings[g + 1] ?? null : null;
      const wireNext = revealed !== null && revealed.r > 0 ? revealed : null;
      expect(zoneLiveState(START + ms, START, mirroredCur, wireNext, CONFIG.zone)).toEqual(full);
    }
  });

  it('and it agrees even in the STALE window, when the mirror still carries the 660u terminal past closure', () => {
    // The promoting schema patch can land a tick or two after the local clock
    // crosses 16:00. Holding the terminal ring there would render an open safe
    // circle over a fully stormed map — closedState collapses it instead.
    const stale = zoneLiveState(DONE + 10, START, ENDGAME, null, CONFIG.zone);
    expect(stale.phase).toBe('closed');
    expect(stale.current).toEqual(COLLAPSE);
  });

  it('synthesizes the collapse ring ONLY in the final group — an earlier stale null still holds ring g', () => {
    const midClose = START + 3 * BEAT + BEAT / 2; // group 0's close, stale next
    const s = zoneLiveState(midClose, START, rings[0], null, CONFIG.zone);
    expect(s.phase).toBe('closing');
    expect(s.current).toEqual(rings[0]); // held, NOT collapsed to a point
    expect(s.next).toBeNull();
  });

  it('with the flag OFF the timeline is byte-identical to the pre-ruling one, at every quarter-beat', () => {
    const off: ZoneTimeline = { ...CONFIG.zone, suddenDeath: false };
    const offRings = rollZoneRings(MAP_R, off, seedsFor(17, off));
    expect(offRings).toEqual(rings.slice(0, -1));
    expect(zoneGroups(off)).toBe(3);
    for (let ms = 0; ms <= 720_000 + 2 * BEAT; ms += BEAT / 4) {
      const s = zoneStateAt(START + ms, START, offRings, off);
      if (ms >= 720_000) {
        expect(s.phase).toBe('closed');
        expect(s.current).toEqual(offRings[offRings.length - 1]); // terminal HELD, r = 660
        expect(s.current.r).toBeCloseTo(2 * CONFIG.vision.sight, 9);
      } else {
        // Every pre-closure tick is the same state the collapsing timeline has.
        expect(s).toEqual(zoneStateAt(START + ms, START, rings, CONFIG.zone));
      }
    }
  });

  it('fails CLOSED on a degenerate beat duration: closed immediately, PARKED on the terminal ring — a broken timeline must not collapse', () => {
    // A timeline that never RAN does not get to end the match. Fail-closed here
    // has always meant "the timeline is over, park on the terminal ring"; under
    // sudden death, collapsing on this path instead would storm the whole map
    // from zone start and bleed out every hull at once on a mistyped dev
    // override — a far worse failure than the one the rule guards against.
    for (const beatMs of [0, -1, NaN, Infinity]) {
      const cfg: ZoneTimeline = { ...CONFIG.zone, beatMs };
      const s = zoneLiveState(START + 1, START, ENDGAME, null, cfg);
      expect(s.phase).toBe('closed');
      expect(s.current).toEqual(ENDGAME);
      expect(s.current.r).toBeGreaterThan(0);
      // The ring centre is still SAFE, which is the whole point of parking.
      expect(isOutside({ x: s.current.cx, y: s.current.cy }, s.current.cx, s.current.cy, s.current.r)).toBe(false);
    }
  });

  it('an ALREADY-COLLAPSED current ring reads closed even if the clock still says closing (the schema-ahead staleness direction)', () => {
    // zoneViewFrom guards the local-clock-ahead-of-schema direction. This is its
    // mirror: the schema patches to closed (zoneCurR 0) while the client's
    // server-clock estimate still sits in the last closing beat. Deriving a
    // close FROM a ring with no radius would shrink 0 to 0 and report a live
    // r=0 for the width of the clock error.
    const collapsePoint = { cx: ENDGAME.cx, cy: ENDGAME.cy, r: 0 };
    const stillClosing = START + zoneClosedAtMs(CONFIG.zone) - 10;
    const s = zoneLiveState(stillClosing, START, collapsePoint, null, CONFIG.zone);
    expect(s.phase).toBe('closed');
    expect(s.current).toEqual(collapsePoint);
    expect(s.closesInMs).toBe(0);
    // And it is genuinely all-storm, not a 0-to-0 interpolation artifact.
    expect(isOutside({ x: ENDGAME.cx, y: ENDGAME.cy }, s.current.cx, s.current.cy, s.current.r)).toBe(true);
  });
});

describe('isOutside — center-aware, boundary INCLUSIVE-SAFE', () => {
  it('treats a point exactly on the ring as inside (safe)', () => {
    expect(isOutside({ x: MAP_R, y: 0 }, 0, 0, MAP_R)).toBe(false);
    expect(isOutside({ x: 0, y: MAP_R }, 0, 0, MAP_R)).toBe(false);
  });

  it('is outside strictly beyond the radius, inside strictly within', () => {
    expect(isOutside({ x: MAP_R + 0.001, y: 0 }, 0, 0, MAP_R)).toBe(true);
    expect(isOutside({ x: MAP_R - 0.001, y: 0 }, 0, 0, MAP_R)).toBe(false);
    expect(isOutside({ x: 0, y: 0 }, 0, 0, MAP_R)).toBe(false);
  });

  it('honors an offset center (the ring is not the map circle)', () => {
    expect(isOutside({ x: 0, y: 0 }, 500, 0, 400)).toBe(true); // origin outside an offset ring
    expect(isOutside({ x: 500, y: 0 }, 500, 0, 400)).toBe(false);
    expect(isOutside({ x: 100, y: 0 }, 500, 0, 400)).toBe(false); // exactly on it — safe
  });

  it('a ring with NO RADIUS contains nothing — its own center included (the collapse ring)', () => {
    // Boundary-inclusive would otherwise make the exact center "on the ring"
    // and therefore safe, leaving one immortal pixel in a 100%-storm map.
    expect(isOutside({ x: 0, y: 0 }, 0, 0, 0)).toBe(true);
    expect(isOutside({ x: 300, y: 120 }, 300, 120, 0)).toBe(true);
    expect(isOutside({ x: MAP_R, y: 0 }, 300, 120, 0)).toBe(true);
  });

  it('fails CLOSED on a degenerate radius (NaN/negative), never marking the whole map safe', () => {
    for (const r of [NaN, -1, -Infinity]) {
      expect(isOutside({ x: 0, y: 0 }, 0, 0, r)).toBe(true);
    }
  });
});
