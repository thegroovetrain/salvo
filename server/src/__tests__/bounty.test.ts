// THE BOUNTY (Story 4.6, Eric ruling 2026-08-10) — the held throne over
// captain-only kills. Covers the full I/O & edge-case matrix server-side:
// the pure strict-overtake rule (game/bounty.ts) row by row — including the
// tests that FAIL if the strict `>` comparison is ever weakened to `>=`, in
// BOTH the vacant and the held direction — and the World wiring: the
// captainKills tally (captains only, `kills` untouched), the pre-sink read,
// the `bty` flag on the sunk emission, the bonus XP grant, the recompute
// seams (per sink, on removal), and the match-boundary reset.
//
// NO location is at stake anywhere in this file by design: the throne is one
// identity scalar and the ruling deleted every location channel. Perception
// coverage for the `bty` wire flag lives in signals.test.ts (key-order pins)
// and perception.test.ts (the independent sunk oracle).

import { describe, it, expect } from 'vitest';
import { CONFIG, type HullId } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { nextBountyHolder, type BountyCandidate } from '../game/bounty.js';

const MIN = CONFIG.bounty.minCaptainKills;

function bareWorld(seed = 7): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  return w;
}

function place(w: World, id: string, x = 0, y = 0, hull: HullId = 'torpedoBoat', drone = false): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), drone, hull);
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

function cand(id: string, captainKills: number, alive = true, isDrone = false): BountyCandidate {
  return { id, alive, isDrone, captainKills };
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
});

// ---------- the World wiring ---------------------------------------------------

describe('World — captainKills tally and throne recompute (per sink, in sink order)', () => {
  it('vacant, first captain kill: the killer takes the throne', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    place(w, 'b', 100, 0);
    expect(w.bountyId).toBe('');
    w.sinkShip('b', 'a');
    expect(a.captainKills).toBe(1);
    expect(w.bountyId).toBe('a');
  });

  it('a DRONE kill advances kills but NEVER captainKills or the throne', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    captainKill(w, 'a'); // a holds at 1
    const before = a.kills;
    const d = place(w, 'd', 200, 0, 'droneMedium', true);
    w.sinkShip('d', 'a');
    expect(a.kills).toBe(before + 1); // the roster tally keeps counting drones
    expect(a.captainKills).toBe(1); // the bounty ruler does not
    expect(w.bountyId).toBe('a');
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

  it('match restart: captainKills zeroes per hull and the throne clears', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    place(w, 'b', 50, 50);
    captainKill(w, 'a');
    expect(w.bountyId).toBe('a');
    expect(a.captainKills).toBe(1);
    w.resetForMatchStart();
    expect(w.bountyId).toBe('');
    for (const s of w.ships.values()) expect(s.captainKills).toBe(0);
  });
});

// ---------- the `bty` flag on the world's sunk emission -------------------------

describe('World — the sunk emission carries `bty` exactly when the victim held the throne', () => {
  function sunkEventsAfterStep(w: World): Array<Record<string, unknown>> {
    w.step();
    return w.tickEvents.filter((e) => e.k === 'sunk') as unknown as Array<Record<string, unknown>>;
  }

  it('sinking the holder flags the emission (attributed kill)', () => {
    const w = bareWorld();
    place(w, 'a');
    place(w, 'c', 50, 50);
    captainKill(w, 'a'); // a holds
    w.step(); // drain the setup sink from the event queue
    w.sinkShip('a', 'c');
    const sunk = sunkEventsAfterStep(w);
    expect(sunk).toHaveLength(1);
    expect(sunk[0].id).toBe('a');
    expect(sunk[0].bty).toBe(true);
  });

  it('a STORM sink of the holder still flies the flag (no killer, no bonus)', () => {
    const w = bareWorld();
    place(w, 'a');
    captainKill(w, 'a');
    w.step();
    w.sinkShip('a'); // storm
    const sunk = sunkEventsAfterStep(w);
    expect(sunk).toHaveLength(1);
    expect(sunk[0].bty).toBe(true);
  });

  it('a NON-holder sinking never carries the key at all', () => {
    const w = bareWorld();
    place(w, 'a');
    place(w, 'b', 100, 0);
    w.sinkShip('b', 'a'); // b held nothing (the throne was vacant pre-sink)
    const sunk = sunkEventsAfterStep(w);
    expect(sunk).toHaveLength(1);
    expect('bty' in sunk[0]).toBe(false);
  });

  it('the read is PRE-sink: the flag reflects who held the throne at the instant of sinking', () => {
    const w = bareWorld();
    place(w, 'a');
    place(w, 'c', 50, 50);
    captainKill(w, 'a'); // a holds at 1
    w.step();
    w.sinkShip('a', 'c'); // c overtakes IN this evaluation (fresh count 1, a dead)
    expect(w.bountyId).toBe('c'); // the throne already moved...
    const sunk = sunkEventsAfterStep(w);
    expect(sunk[0].bty).toBe(true); // ...but the emission names the pre-sink truth
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
    expect(c.offers).toHaveLength(CONFIG.xp.killLevels + CONFIG.bounty.killLevels);
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
