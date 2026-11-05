// Story 1.10 — the SELF-PRIVATE denial channel (FrameMsg.denied): FR12's
// "denied fire is never silent" made authoritative. The matrix below drives
// every wire reason end-to-end through the REAL input path (submitInput →
// step → buildFrame): 'out-of-arc' (torpedo click astern), 'cooling' (weapon
// click against an empty reloading pool), 'no-ammo' (ability press against an
// empty pool), and 'blocked' (stern drops landing in a rock / off the water).
// Every denial spends NOTHING (round/charge + reload untouched), reaches ONLY
// the pressing client's own frame (owner-only — never another observer, never
// a spectator frame), lives exactly one tick, and never queues for drones.
// The stale-client join error's refresh instruction is pinned here too.

import { describe, it, expect } from 'vitest';
import { CONFIG, FAMILY_SLOT, PROTOCOL_VERSION, SLOT_BOOST, abilityCode, abilityReadyAt, abilitySlot, type InputMsg } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { fitClassWeapons } from './classWeapons.js';
import { buildFrame } from '../game/frames.js';
import { protocolVersionError } from '../rooms/roomOptions.js';
import { circleIsland, flatRaster } from './islandFixture.js';
import { neutralize } from './deckGunFixture.js';

/** World with no islands (directed cases add their own geometry). The height
 *  raster is flattened too (Story 4.11): real terrain must not radar-shadow a
 *  world the test built as empty water. */
function bareWorld(seed = 7): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

// FIVE FIXED-ROLE SLOTS (Story 10.5): every captain spawns [gun, Shift,
// torpedo, mine, special shell]. A hull's class weapon lands in its FAMILY's
// slot — the torpedo in Q (2), the mine rack in E (3).
/** The torpedo slot (Q). */
const SLOT_WEAPON = FAMILY_SLOT.torpedo;
/** The mine slot (E) — the Warspite fixture's rack. */
const SLOT_MINE = FAMILY_SLOT.mine;

/** Add a ship and teleport it to an exact pose (speed 0). */
function place(
  w: World,
  id: string,
  x: number,
  y: number,
  heading = 0,
  hull: 'bismarck' | 'yamato' | 'warspite' = 'bismarck',
): ShipRecord {
  // NEUTRAL index (deckGunFixture, Story 10.4): this suite reads CONFIG numbers verbatim.
  const rec = neutralize(w.addShip(id, id.toUpperCase(), 'captain', hull, undefined, undefined));
  // THE CLASS WEAPON IS A CARD NOW (Story 8.10, amendment 62): the interim
  // spawn seed is deleted and a hull comes up with gun + Shift and an EMPTY
  // weapon row, so this fixture fits it explicitly through the same applyCard
  // path a real pick takes. Every case below keeps its subject.
  fitClassWeapons(w, rec);
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = heading;
  rec.state.speed = 0;
  return rec;
}

/** A neutral-driving input with the given press fields. */
function input(seq: number, extra: Partial<InputMsg> = {}): InputMsg {
  return {
    seq,
    throttle: 0,
    rudder: 0,
    aim: 0,
    fireSeq: 0,
    aimDist: 0,
    slot: 0,
    fireT: 0,
    actSeq: 0,
    act: 0, hornSeq: 0, held: false, sec: false,
    ...extra,
  };
}

describe('denial channel — the four wire reasons (I/O matrix)', () => {
  it("out-of-arc: an astern torpedo click denies {slot,'out-of-arc',fireSeq} and keeps the fish", () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0); // TB, bow along +x
    place(w, 'b', 100, 0);
    w.submitInput('a', input(1, { fireSeq: 1, slot: SLOT_WEAPON, aim: Math.PI })); // dead astern — far outside ±30°
    w.step();
    const fa = buildFrame(w, 'a');
    expect(fa.denied).toEqual([{ slot: SLOT_WEAPON, reason: 'out-of-arc', seq: 1 }]);
    // Denied presses spend NOTHING: the round is kept and no reload started.
    expect(a.loadout[SLOT_WEAPON].state).toEqual({ n: 1, reloadMsLeft: 0 });
    // SELF-PRIVATE: the other captain's frame is byte-free of the channel.
    expect('denied' in buildFrame(w, 'b')).toBe(false);
  });

  it("cooling: a weapon click against an empty (reloading) pool denies {'cooling'} — the reload-boundary race made explicit", () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    // Story 10.4: slot 0 is the MAIN BATTERY — one click fires ONE ready
    // turret whose arc holds the aim (arc-only fire, epic-10 amendment 10), so
    // the clicks aim at the BEAM, where every turret bears, and every turret
    // is spent click by click first.
    const BEAM = Math.PI / 2;
    const turrets = a.stats.equipment.mainBattery.maxAmmo;
    for (let k = 1; k <= turrets; k += 1) {
      w.submitInput('a', input(k, { fireSeq: k, slot: 0, aim: BEAM, aimDist: 100 }));
      w.step(); // click k fires one turret (its reload starts)
      expect('denied' in buildFrame(w, 'a')).toBe(false);
    }
    w.submitInput('a', input(turrets + 1, { fireSeq: turrets + 1, slot: 0, aim: BEAM, aimDist: 100 }));
    w.step(); // every turret reloading — the previously-silent case
    expect(buildFrame(w, 'a').denied).toEqual([{ slot: 0, reason: 'cooling', seq: turrets + 1 }]);
    // Nothing further spent: the pool stays empty with its reload running.
    expect(a.loadout[0].state!.n).toBe(0);
    expect(a.loadout[0].state!.reloadMsLeft).toBeGreaterThan(0);
  });

  it("no-ammo: a within-RTT ability double press denies {'no-ammo'} keyed on the press's actSeq", () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0); // TB: slot 1 = boost (1 charge) on every captain
    w.submitInput('a', input(1, { actSeq: 1, act: 0, hornSeq: 0, held: false, sec: false }));
    w.step(); // press 1 activates (charge 1 → 0)
    expect(a.boostUntil).toBeGreaterThan(0);
    expect('denied' in buildFrame(w, 'a')).toBe(false);
    w.submitInput('a', input(2, { actSeq: 2, act: 0, hornSeq: 0, held: false, sec: false }));
    w.step(); // press 2, pool empty — silently swallowed before 1.10
    // Story 10.5: an ability denial names its ability (`act`) beside the slot.
    expect(buildFrame(w, 'a').denied).toEqual([{ slot: SLOT_BOOST, reason: 'no-ammo', seq: 2, act: abilityCode('shift') }]);
  });

  /** One HULL REPAIR press (`C` — Story 10.5) through the real input path. */
  const repair = (w: World, seq: number): void => {
    w.submitInput('a', input(seq, { actSeq: seq, act: abilityCode('repair') }));
    w.step();
  };
  const repairDenial = (seq: number, reason: string) => ({ slot: abilitySlot('repair'), reason, seq, act: abilityCode('repair') });

  it("blocked (full hull): a HULL REPAIR press at full hp denies {'blocked'} and starts NO cooldown", () => {
    // Story 10.5 (epic-10 amendment 11): HULL REPAIR is the `C` cooldown
    // ability. Its refusal reaches the wire because the client pre-denies the
    // same case locally and the two must agree.
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    expect(a.hp).toBe(a.stats.maxHp);
    repair(w, 1);
    expect(buildFrame(w, 'a').denied).toEqual([repairDenial(1, 'blocked')]);
    expect(a.repairReadyAt).toBe(0); // the cooldown is NOT started
    expect(buildFrame(w, 'a').you!.repairReadyAt).toBeUndefined();
    // ...and hurt, the same press succeeds silently.
    a.hp = a.stats.maxHp - CONFIG.hullRepair.instantHp - CONFIG.hullRepair.regenHp;
    repair(w, 2);
    expect('denied' in buildFrame(w, 'a')).toBe(false);
    expect(a.repairHp).toBeGreaterThan(0);
  });

  it("blocked (a FRACTION off full): 0.4 hp missing is still FULL — amendment 53's one definition", () => {
    // Fractional damage (storm, burn) parks a hull a fraction under max;
    // `hullIsFull` is the shared predicate the refusal law reads.
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.hp = a.stats.maxHp - 0.4;
    a.lastDamagedAt = w.now; // keep the passive regen out of this case
    repair(w, 1);
    expect(buildFrame(w, 'a').denied).toEqual([repairDenial(1, 'blocked')]);
    expect(a.repairHp).toBe(0);
    expect(a.repairReadyAt).toBe(0);
    expect(w.tickEvents.some((e) => e.k === 'heal')).toBe(false);
  });

  it('a hurt press heals instantHp now, pools regenHp, stamps the cooldown and cues `heal`', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.hp = a.stats.maxHp - CONFIG.hullRepair.instantHp - CONFIG.hullRepair.regenHp;
    a.lastDamagedAt = w.now; // keep the passive regen out of this case
    const before = a.hp;
    repair(w, 1);
    expect('denied' in buildFrame(w, 'a')).toBe(false);
    // The press lands after tickRepairs in the step, so this tick's hp is the
    // instant heal and the pool is whole.
    expect(a.hp).toBe(before + CONFIG.hullRepair.instantHp);
    expect(a.repairHp).toBe(CONFIG.hullRepair.regenHp);
    expect(a.repairReadyAt).toBe(abilityReadyAt(w.now, 'repair'));
    expect(w.tickEvents.some((e) => e.k === 'heal' && e.id === 'a')).toBe(true);
    expect(buildFrame(w, 'a').you!.repairReadyAt).toBe(a.repairReadyAt);
  });

  it("cooling: a HULL REPAIR press inside the cooldown denies {'cooling'} and heals nothing", () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.hp = a.stats.maxHp / 2;
    a.lastDamagedAt = w.now;
    repair(w, 1);
    const ready = a.repairReadyAt;
    a.repairHp = 0;
    const hp = a.hp;
    repair(w, 2);
    expect(buildFrame(w, 'a').denied).toEqual([repairDenial(2, 'cooling')]);
    expect(a.hp).toBe(hp);
    expect(a.repairHp).toBe(0);
    expect(a.repairReadyAt).toBe(ready);
    expect(w.tickEvents.some((e) => e.k === 'heal')).toBe(false);
  });

  it('a FROZEN room (weapons locked) refuses a repair press SILENTLY: no denial, no heal, no cooldown', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.hp = a.stats.maxHp / 2;
    a.lastDamagedAt = w.now;
    w.weaponsEnabled = false;
    const hp = a.hp;
    repair(w, 1);
    expect('denied' in buildFrame(w, 'a')).toBe(false);
    expect(a.hp).toBe(hp);
    expect(a.repairReadyAt).toBe(0);
  });

  it("blocked (island): a MINE click onto a rock (Story 2.8 aimed placement) denies {'blocked'} and consumes NOTHING", () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0, 'warspite'); // heading 0 ⇒ rear sector centers on π
    w.map.islands.push(circleIsland(-60, 0, 20)); // the rock the click lands on
    w.submitInput('a', input(1, { fireSeq: 1, slot: SLOT_MINE, aim: Math.PI, aimDist: 60 }));
    w.step();
    expect(buildFrame(w, 'a').denied).toEqual([{ slot: SLOT_MINE, reason: 'blocked', seq: 1 }]);
    // Charge AND reload untouched — the previously wasted charge is kept. The
    // rack is 2-deep at base since the 2026-08-04 balance pass, so "untouched"
    // means BOTH drops still aboard.
    expect(a.loadout[SLOT_MINE].state).toEqual({ n: 2, reloadMsLeft: 0 });
    expect(w.mines.size).toBe(0);
  });

  // RETIRED (Story 7-5 wave 2): the DECOY stern drop denial. Its subject —
  // an un-aimed stern-rack ABILITY that could be blocked by a rock — no longer
  // exists: the decoy buoy is deleted and the RADAR BUOY replacing it is a
  // CLICK-PLACED weapon on the mine's rear sector (R2.7), whose 'blocked'
  // denial is the mine's own, already covered by the two cases below. The
  // buoy's own denial matrix lands with the buoy (a later agent).

  it("blocked (boundary): a mine click off the water disk denies {'blocked'} too", () => {
    const w = bareWorld();
    // Facing map-inward (heading π → bow along −x), the rear sector centers on
    // +x — a click 60u astern from 30u inside the rim lands past the edge.
    const a = place(w, 'a', w.map.radius - 30, 0, Math.PI, 'warspite');
    w.submitInput('a', input(1, { fireSeq: 1, slot: SLOT_MINE, aim: 0, aimDist: 60 }));
    w.step();
    expect(buildFrame(w, 'a').denied).toEqual([{ slot: SLOT_MINE, reason: 'blocked', seq: 1 }]);
    expect(a.loadout[SLOT_MINE].state).toEqual({ n: 2, reloadMsLeft: 0 }); // 2-deep rack, untouched
  });

  it("out-of-arc: a mine click at the BOW (or past placeRange) denies {'out-of-arc'} (Story 2.8 rear placement arc)", () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0, 'warspite');
    w.submitInput('a', input(1, { fireSeq: 1, slot: SLOT_MINE, aim: 0, aimDist: 40 })); // bow click — outside the rear sector
    w.step();
    expect(buildFrame(w, 'a').denied).toEqual([{ slot: SLOT_MINE, reason: 'out-of-arc', seq: 1 }]);
    w.submitInput('a', input(2, { fireSeq: 2, slot: SLOT_MINE, aim: Math.PI, aimDist: CONFIG.mine.placeRange + 50 }));
    w.step();
    expect(buildFrame(w, 'a').denied).toEqual([{ slot: SLOT_MINE, reason: 'out-of-arc', seq: 2 }]);
    expect(a.loadout[SLOT_MINE].state).toEqual({ n: 2, reloadMsLeft: 0 }); // 2-deep rack, untouched
    expect(w.mines.size).toBe(0);
  });
});

describe('denial channel — lifecycle + privacy edges', () => {
  it('a denial lives exactly one tick (the next frame is byte-free again)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    w.submitInput('a', input(1, { fireSeq: 1, slot: SLOT_WEAPON, aim: Math.PI }));
    w.step();
    expect(buildFrame(w, 'a').denied).toHaveLength(1);
    w.step(); // no new press — the stored fireSeq reads as "no new click"
    expect('denied' in buildFrame(w, 'a')).toBe(false);
  });

  it('a spectator frame NEVER carries the channel, even when a denial exists this tick', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    w.submitInput('a', input(1, { fireSeq: 1, slot: SLOT_WEAPON, aim: Math.PI }));
    w.step();
    expect(w.denialsFor('a')).toHaveLength(1); // the denial IS pending this tick
    // The finished-phase (spectator) build of the SAME observer omits it: the
    // spectator path structurally never reads the denial store.
    expect('denied' in buildFrame(w, 'a', 'finished')).toBe(false);
  });

  it('drones never queue denials (no client, no channel)', () => {
    const w = bareWorld();
    const d = w.addShip('d1', 'DRONE', 'fleet', 'droneSmall', undefined, undefined); // universal fit: slot 1 = torpedo
    d.state.x = 0;
    d.state.y = 0;
    d.state.heading = 0;
    w.submitInput('d1', input(1, { fireSeq: 1, slot: SLOT_WEAPON, aim: Math.PI })); // astern — would deny
    w.step();
    expect(w.denialsFor('d1')).toBeUndefined();
  });

  it("the gate's dead refusal stays server-internal (no wire denial for a dead press)", () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.respawnEnabled = false;
    w.sinkShip('a');
    // Story 5.2: sinkShip now opens the five-second window (a SINKING hull
    // fires normally — amendment 10), so ride it out to a genuinely dead hull
    // before pressing. One oversized step crosses the founder deadline.
    w.step(CONFIG.ship.sinkingWindowMs);
    w.submitInput('a', input(1, { fireSeq: 1, slot: 0 }));
    w.step(); // fireControl skips dead ships entirely — nothing queues
    expect(w.denialsFor('a')).toBeUndefined();
  });
});

describe('pv join gate — the stale-client error', () => {
  it("a stale or missing pv is refused with an error that tells the client to refresh", () => {
    expect(protocolVersionError(PROTOCOL_VERSION - 1)).toMatch(/refresh/);
    expect(protocolVersionError(undefined)).toMatch(/refresh/);
  });
});

describe('blocked-drop geometry sanity (Story 2.8: clicked mine placement)', () => {
  it('an ML clicking open water astern still places normally (the check refuses only illegal water)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0, 0, 'warspite');
    w.map.islands.push(circleIsland(200, 200, 40)); // a rock nowhere near the click
    w.submitInput('a', input(1, { fireSeq: 1, slot: SLOT_MINE, aim: Math.PI, aimDist: 60 }));
    w.step();
    expect(w.mines.size).toBe(1);
    expect('denied' in buildFrame(w, 'a')).toBe(false);
    // The mine lands AT the clicked point (amendment 45), 60u dead astern.
    const mine = [...w.mines.values()][0];
    expect(mine.x).toBeCloseTo(-60, 6);
    expect(mine.y).toBeCloseTo(0, 6);
  });
});
