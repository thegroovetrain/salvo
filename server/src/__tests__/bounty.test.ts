// THE BOUNTY (Story 4.6, Eric ruling 2026-08-10) — the held throne over
// captain-only kills. Covers the full I/O & edge-case matrix server-side:
// the pure strict-overtake rule (game/bounty.ts) row by row — including the
// tests that FAIL if the strict `>` comparison is ever weakened to `>=`, in
// BOTH the vacant and the held direction — and the World wiring: the
// `kills` tally (CAPTAIN victims only since Story 5.6 retired the redundant
// `captainKills` split — amendment 38), the pre-sink read,
// the `bty` flag on the sunk emission, the bonus XP grant, the recompute
// seams (per sink, on removal), and the match-boundary reset.
//
// NO location is at stake anywhere in this file by design: the throne is one
// identity scalar and the ruling deleted every location channel. Perception
// coverage for the `bty` wire flag lives in signals.test.ts (key-order pins)
// and perception.test.ts (the independent sunk oracle).

import { describe, it, expect } from 'vitest';
import { isAfloat, LIFECYCLE_ALIVE, sunkAt, CONFIG, type HullId } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { nextBountyHolder, type BountyCandidate } from '../game/bounty.js';

const MIN = CONFIG.bounty.minCaptainKills;
const SIM_DT = CONFIG.tick.simDtMs;

/** Advance the world through a full respawn delay (ready-room posture only —
 *  respawnEnabled defaults true on a bare World). */
function stepThroughRespawn(w: World): void {
  // Story 5.2: a sunk hull first rides its 5000ms sinking window; the revive
  // lands on the founder tick (window > the 3000ms respawn delay).
  const ticks = CONFIG.ship.sinkingWindowMs / SIM_DT;
  for (let i = 0; i < ticks; i++) w.step();
}

function bareWorld(seed = 7): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  return w;
}

function place(w: World, id: string, x = 0, y = 0, hull: HullId = 'torpedoBoat', drone = false): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), drone ? 'fleet' : 'captain', hull);
  rec.state.x = x;
  rec.state.y = y;
  rec.state.speed = 0;
  return rec;
}

/** Feed `killer` one captain kill through the real pipeline: a fresh victim
 *  hull sunk by them. Victims are placed far out so nothing else interferes. */
let victimSeq = 0;
function captainKill(w: World, killer: string): void {
  const vid = `victim-${victimSeq++}`;
  place(w, vid, 900, 900);
  w.sinkShip(vid, killer);
}

/** A candidate snapshot. `afloat` is a test-authoring convenience only — the
 *  rule itself reads the LIFECYCLE (Story 5.1, amendment 2), so the flag is
 *  converted here, at the fixture, and nowhere in the module under test. */
function cand(id: string, kills: number, afloat = true, fleet = false): BountyCandidate {
  return { id, lifecycle: afloat ? LIFECYCLE_ALIVE : sunkAt(0), role: fleet ? 'fleet' : 'captain', kills };
}

// ---------- the pure rule: nextBountyHolder ------------------------------------

describe('nextBountyHolder — the strict-overtake throne rule (pure)', () => {
  it('vacant + a strict unique maximum at minCaptainKills claims the throne', () => {
    expect(nextBountyHolder('', [cand('a', MIN), cand('b', 0)])).toBe('a');
  });

  it('vacant + a zero-kill field stays vacant — FAILS if `>` weakens to `>=` (the vacant direction)', () => {
    // minCaptainKills - 1 sits exactly ON the vacant floor: a weakened
    // comparison (<= floor -> < floor) would crown a captain with MIN-1
    // kills, i.e. zero at the shipped MIN of 1.
    expect(nextBountyHolder('', [cand('a', MIN - 1), cand('b', MIN - 1)])).toBe('');
    expect(nextBountyHolder('', [cand('a', MIN - 1)])).toBe('');
  });

  it('vacant + a TIED top never claims (a tie never transfers, vacant direction)', () => {
    expect(nextBountyHolder('', [cand('a', 2), cand('b', 2), cand('c', 1)])).toBe('');
  });

  it('held + a challenger at EXACTLY the incumbent count stays held — FAILS if `>` weakens to `>=` (the held direction)', () => {
    expect(nextBountyHolder('a', [cand('a', 2), cand('b', 2)])).toBe('a');
  });

  it('held + a strict overtake transfers', () => {
    expect(nextBountyHolder('a', [cand('a', 2), cand('b', 3)])).toBe('b');
  });

  it('held + TWO challengers tied ABOVE the incumbent transfer to nobody (no unique maximum)', () => {
    // The spec sketch's known trap: after the tie nulls the running best, a
    // LOWER third challenger must not slip onto the throne either.
    expect(nextBountyHolder('a', [cand('a', 2), cand('b', 4), cand('c', 4), cand('d', 3)])).toBe('a');
  });

  it('a DEAD incumbent vacates: re-claiming needs a fresh strict unique maximum', () => {
    // b at MIN is the unique max among the alive -> claims.
    expect(nextBountyHolder('a', [cand('a', 5, false), cand('b', MIN), cand('c', 0)])).toBe('b');
    // tie among the alive -> vacant.
    expect(nextBountyHolder('a', [cand('a', 5, false), cand('b', 1), cand('c', 1)])).toBe('');
    // nobody at MIN -> vacant.
    expect(nextBountyHolder('a', [cand('a', 5, false), cand('b', MIN - 1)])).toBe('');
  });

  it('an ABSENT incumbent (removed from the field) vacates the same way', () => {
    expect(nextBountyHolder('gone', [cand('b', MIN)])).toBe('b');
    expect(nextBountyHolder('gone', [cand('b', 0)])).toBe('');
  });

  it('DEAD challengers never claim or overtake', () => {
    expect(nextBountyHolder('', [cand('a', 3, false), cand('b', MIN)])).toBe('b');
    expect(nextBountyHolder('a', [cand('a', 2), cand('b', 9, false)])).toBe('a');
  });

  it('a DRONE can never hold the throne, whatever its count says (defense in depth)', () => {
    expect(nextBountyHolder('', [cand('d', 5, true, true), cand('b', 0)])).toBe('');
    // ...nor keep it as a phantom incumbent.
    expect(nextBountyHolder('d', [cand('d', 5, true, true), cand('b', MIN)])).toBe('b');
  });

  it('an empty field is vacant', () => {
    expect(nextBountyHolder('', [])).toBe('');
    expect(nextBountyHolder('a', [])).toBe('');
  });

  it('a NaN candidate can never clear the floor or be crowned (fail-closed on non-finite input)', () => {
    // `c.kills <= floor` is false for NaN, so an unguarded eligibility
    // test lets a NaN candidate slip past the "strict overtake only" skip and
    // become the running `best` as the first eligible entry.
    expect(nextBountyHolder('', [cand('a', NaN), cand('b', 0)])).toBe('');
  });

  it('a NaN incumbent is fail-closed to an unbeatable floor: nobody can displace a corrupt holder', () => {
    // An unguarded floor goes NaN, and NaN fails every `<=` comparison, so a
    // zero-kill challenger would wrongly clear it and take the throne.
    expect(nextBountyHolder('a', [cand('a', NaN), cand('b', 0)])).toBe('a');
  });
});

// ---------- the World wiring ---------------------------------------------------

describe('World — kill tally and throne recompute (per sink, in sink order)', () => {
  it('vacant, first captain kill: the killer takes the throne', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    place(w, 'b', 100, 0);
    expect(w.bountyId).toBe('');
    w.sinkShip('b', 'a');
    expect(a.kills).toBe(1);
    expect(w.bountyId).toBe('a');
  });

  it('a PvE kill advances NOTHING — not the tally, not the throne (amendment 38)', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    captainKill(w, 'a'); // a holds at 1
    const before = a.kills;
    const d = place(w, 'd', 200, 0, 'droneMedium', true);
    const xpBefore = a.xpMs;
    w.sinkShip('d', 'a');
    // Story 5.6 amendment 38 REVERSES the 4.6 clause that kept `kills`
    // counting drones: a PvE kill now lands in no tally at all...
    expect(a.kills).toBe(before);
    expect(w.bountyId).toBe('a');
    // ...while its XP still pays, which is the whole point of the split.
    expect(a.xpMs).toBeGreaterThan(xpBefore);
    expect(d.id).toBe('d');
  });

  it('held, a challenger reaching EXACTLY the incumbent count does not transfer (world direction)', () => {
    const w = bareWorld();
    place(w, 'a');
    place(w, 'b', 50, 50);
    captainKill(w, 'a');
    captainKill(w, 'a'); // a holds at 2
    captainKill(w, 'b');
    captainKill(w, 'b'); // b reaches exactly 2
    expect(w.bountyId).toBe('a');
    captainKill(w, 'b'); // b reaches 3 — the strict overtake
    expect(w.bountyId).toBe('b');
  });

  it('the killer of the HOLDER competes with their fresh count in the same evaluation', () => {
    const w = bareWorld();
    place(w, 'a');
    place(w, 'c', 50, 50);
    captainKill(w, 'a'); // a holds at 1
    w.sinkShip('a', 'c'); // c sinks the holder: c's new kill (a captain, 1) competes now
    expect(w.bountyId).toBe('c');
  });

  it('holder sunk by the STORM: the throne vacates (nobody else qualifies)', () => {
    const w = bareWorld();
    place(w, 'a');
    place(w, 'b', 50, 50);
    captainKill(w, 'a'); // a holds
    w.sinkShip('a'); // storm — no killer
    expect(w.bountyId).toBe('');
  });

  it('SELF-sink of the holder: no credit, throne vacates', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    captainKill(w, 'a');
    const kills = a.kills;
    w.sinkShip('a', 'a');
    expect(a.kills).toBe(kills); // no self-credit
    expect(w.bountyId).toBe('');
  });

  it('the holder must be ALIVE: ready-room churn vacates on the sink even though a respawn is scheduled', () => {
    const w = bareWorld(); // respawnEnabled defaults true — the ready-room posture
    place(w, 'a');
    captainKill(w, 'a');
    expect(w.bountyId).toBe('a');
    w.sinkShip('a'); // respawnAt is scheduled, but dead is dead
    expect(w.bountyId).toBe('');
  });

  it('holder DISCONNECTS: recomputed immediately — the throne never names an absent player', () => {
    const w = bareWorld();
    place(w, 'a');
    place(w, 'b', 50, 50);
    captainKill(w, 'a');
    captainKill(w, 'a'); // a holds at 2
    captainKill(w, 'b'); // b at 1
    w.removeShip('a');
    expect(w.bountyId).toBe('b'); // fresh strict unique max among the remaining alive captains
  });

  it('holder disconnects into a TIED field: vacant (a tie never claims)', () => {
    const w = bareWorld();
    place(w, 'a');
    place(w, 'b', 50, 50);
    place(w, 'c', -50, 50);
    captainKill(w, 'a');
    captainKill(w, 'a'); // a holds at 2
    captainKill(w, 'b'); // b at 1
    captainKill(w, 'c'); // c at 1 — no transfer (tie below the incumbent anyway)
    expect(w.bountyId).toBe('a');
    w.removeShip('a');
    expect(w.bountyId).toBe('');
  });

  it('match restart: kills zeroes per hull and the throne clears', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    place(w, 'b', 50, 50);
    captainKill(w, 'a');
    expect(w.bountyId).toBe('a');
    expect(a.kills).toBe(1);
    w.resetForMatchStart();
    expect(w.bountyId).toBe('');
    for (const s of w.ships.values()) expect(s.kills).toBe(0);
  });
});

// ---------- respawn is a third recompute seam (Finding 1) -----------------------

describe('World — respawn() re-evaluates the throne (the ready-room-only third seam)', () => {
  it('a vacated throne re-crowns the sole alive strict max once the incumbent respawns', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    place(w, 'b', 50, 50);
    place(w, 'c', -50, 50);
    captainKill(w, 'a');
    captainKill(w, 'a'); // a holds at 2
    captainKill(w, 'c'); // c at 1
    expect(w.bountyId).toBe('a');
    w.sinkShip('a', 'b'); // b's fresh count (1) ties c (1) -> vacates
    expect(w.bountyId).toBe('');
    expect(a.kills).toBe(2); // persists across the death (only redeployShip zeroes it)
    stepThroughRespawn(w);
    expect(isAfloat(a.lifecycle)).toBe(true);
    // a (2) is the unique strict maximum among the alive captains (b=1, c=1) —
    // ≥ minCaptainKills — so the throne must re-crown a on this transition.
    expect(w.bountyId).toBe('a');
  });

  it('a held throne transfers to a returning captain who still strictly outguns the incumbent', () => {
    const w = bareWorld();
    const b = place(w, 'b');
    place(w, 'a', 50, 50);
    place(w, 'c', -50, 50);
    captainKill(w, 'b');
    captainKill(w, 'b');
    captainKill(w, 'b'); // b holds at 3
    captainKill(w, 'a');
    captainKill(w, 'a'); // a at 2
    expect(w.bountyId).toBe('b');
    w.sinkShip('b', 'c'); // c reaches 1; a (2) is the unique alive max -> a crowned
    expect(w.bountyId).toBe('a');
    expect(b.kills).toBe(3); // persists across the death
    stepThroughRespawn(w);
    expect(isAfloat(b.lifecycle)).toBe(true);
    // b (3) strictly exceeds the incumbent a (2) — the ratified transfer
    // condition — so the throne must move back to b on this transition.
    expect(w.bountyId).toBe('b');
  });
});

// ---------- the `bty` channel on the world's sunk emission ----------------------

describe('World — the sunk emission names WHICH participant held the throne (bty: v | k)', () => {
  function sunkEventsAfterStep(w: World): Array<Record<string, unknown>> {
    w.step();
    return w.tickEvents.filter((e) => e.k === 'sunk') as unknown as Array<Record<string, unknown>>;
  }

  it("sinking the holder marks the VICTIM case: bty 'v' (attributed kill)", () => {
    const w = bareWorld();
    place(w, 'a');
    place(w, 'c', 50, 50);
    captainKill(w, 'a'); // a holds
    w.step(); // drain the setup sink from the event queue
    w.sinkShip('a', 'c');
    const sunk = sunkEventsAfterStep(w);
    expect(sunk).toHaveLength(1);
    expect(sunk[0].id).toBe('a');
    expect(sunk[0].bty).toBe('v');
  });

  it("a STORM sink of the holder still marks the victim: bty 'v' (no killer, no bonus)", () => {
    const w = bareWorld();
    place(w, 'a');
    captainKill(w, 'a');
    w.step();
    w.sinkShip('a'); // storm
    const sunk = sunkEventsAfterStep(w);
    expect(sunk).toHaveLength(1);
    expect(sunk[0].bty).toBe('v');
  });

  it("the LEADER doing the sinking marks the KILLER case: bty 'k' (2026-08-10 rework)", () => {
    const w = bareWorld();
    place(w, 'a');
    place(w, 'b', 100, 0);
    captainKill(w, 'a'); // a holds the throne
    w.step();
    w.sinkShip('b', 'a'); // the leader sinks a captain
    const sunk = sunkEventsAfterStep(w);
    expect(sunk).toHaveLength(1);
    expect(sunk[0].id).toBe('b');
    expect(sunk[0].bty).toBe('k');
  });

  it("the leader sinking a DRONE still marks bty 'k' — the mark rides a drone wreck legitimately", () => {
    // Not a leak: a drone sunk event reaches only the witness and the killer
    // (perception's sunk row), both of whom already know the leader's identity
    // from the public ArenaState.bountyId. The 'v' case, by contrast, can
    // never appear on a drone wreck — a drone can never hold the throne.
    const w = bareWorld();
    place(w, 'a');
    place(w, 'd', 100, 0, 'torpedoBoat', true); // a drone
    captainKill(w, 'a'); // a holds the throne
    w.step();
    w.sinkShip('d', 'a');
    const sunk = sunkEventsAfterStep(w);
    expect(sunk).toHaveLength(1);
    expect(sunk[0].id).toBe('d');
    expect(sunk[0].bty).toBe('k');
  });

  it('a sinking involving NEITHER the holder as victim nor as killer never carries the key at all', () => {
    const w = bareWorld();
    place(w, 'a');
    place(w, 'b', 100, 0);
    w.sinkShip('b', 'a'); // b held nothing (the throne was vacant pre-sink)
    const sunk = sunkEventsAfterStep(w);
    expect(sunk).toHaveLength(1);
    expect('bty' in sunk[0]).toBe(false);
  });

  it("a SELF-sink of the holder resolves as the VICTIM case ('v'), never 'k' — one throne, one mark", () => {
    const w = bareWorld();
    place(w, 'a');
    captainKill(w, 'a'); // a holds
    w.step();
    w.sinkShip('a', 'a'); // the holder's own hand: by === id
    const sunk = sunkEventsAfterStep(w);
    expect(sunk).toHaveLength(1);
    expect(sunk[0].bty).toBe('v');
  });

  it('the read is PRE-sink: the mark reflects who held the throne at the instant of sinking', () => {
    const w = bareWorld();
    place(w, 'a');
    place(w, 'c', 50, 50);
    captainKill(w, 'a'); // a holds at 1
    w.step();
    w.sinkShip('a', 'c'); // c overtakes IN this evaluation (fresh count 1, a dead)
    expect(w.bountyId).toBe('c'); // the throne already moved...
    const sunk = sunkEventsAfterStep(w);
    expect(sunk[0].bty).toBe('v'); // ...but the emission names the pre-sink truth
  });
});

// ---------- the XP bonus --------------------------------------------------------

describe('World — sinking the holder pays CONFIG.bounty.killLevels on top of the captain level', () => {
  it('killer of the holder banks killLevels + bounty.killLevels through the unchanged pipeline', () => {
    const w = bareWorld();
    place(w, 'a');
    const c = place(w, 'c', 50, 50);
    captainKill(w, 'a'); // a holds
    w.sinkShip('a', 'c');
    expect(c.level).toBe(CONFIG.xp.killLevels + CONFIG.bounty.killLevels); // 1 + 1 at shipped values
    expect(c.bankedLevels).toBe(CONFIG.xp.killLevels + CONFIG.bounty.killLevels);
    expect(c.xpMs).toBe(0); // whole levels — the fractional carry is untouched
  });

  it('a kill on a NON-holder pays exactly the standard level', () => {
    const w = bareWorld();
    place(w, 'a');
    const c = place(w, 'c', 50, 50);
    captainKill(w, 'a'); // a holds — c's victim below does NOT
    place(w, 'v', 200, 0);
    w.sinkShip('v', 'c');
    expect(c.level).toBe(CONFIG.xp.killLevels);
  });

  it("the LEADER killing someone (bty 'k') collects NO bonus — the bonus is the VICTIM case only", () => {
    const w = bareWorld();
    const a = place(w, 'a');
    place(w, 'b', 100, 0);
    captainKill(w, 'a'); // a takes the throne (and banks the standard level)
    const before = a.level;
    w.sinkShip('b', 'a'); // the leader sinks a captain — bty 'k' on the wire
    expect(a.level).toBe(before + CONFIG.xp.killLevels); // standard level, nothing on top
  });

  it('a storm/self sink of the holder pays nobody', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    place(w, 'b', 50, 50);
    captainKill(w, 'a');
    const levelBefore = a.level;
    w.sinkShip('a'); // storm — no killer, no bonus
    for (const s of w.ships.values()) {
      if (s.id.startsWith('victim-')) continue;
      expect(s.level).toBe(s.id === 'a' ? levelBefore : 0);
    }
  });
});
