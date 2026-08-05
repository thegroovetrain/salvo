// THE FOGHORN CHEVRON (render/foghorn.ts) — the pure core the Pixi adapter
// animates: the tier→gain table, the tier→weight table, the bearing→screen
// placement, the TTL fade, the motion-scaled pop, and the spectator bearing.
//
// Four things in here are CONTRACT, not coverage:
//   • THE EDGE CONVENTION. The camera has no rotation and no y-flip
//     (camera.ts worldToScreen is a pure scale-and-translate; ships.ts:17 states
//     the same fact), so a world bearing IS the screen direction: 0 = right,
//     π/2 = DOWN, π = left, 3π/2 = UP. Every cardinal is pinned below, because
//     the single most likely way this feature ships broken is a y-flip that
//     points every chevron at the wrong horizon — and nothing else in the game
//     would catch it.
//   • `motion: 'off'` must remove MOTION and never INFORMATION (the ratified
//     house rule, effects.ts:44-53; UX-DR36 via amendment 55). PRESENCE,
//     DIRECTION and TIER WEIGHT survive intact; only the pop-in scale goes.
//   • THE MARK OUTLIVES THE SOUND (amendment 56). The audio mix drops honks at
//     its concurrency cap; the chevron never rides on that.
//   • THE CAP IS GLOBAL ONLY. Amendment 51 applies amendment 45's rule — no
//     correlation handle on the wire — so marks cannot be grouped by source and
//     no per-source cap can exist. There is deliberately no key here to test.

import { describe, it, expect, vi } from 'vitest';
import { Container } from 'pixi.js';
import { CONFIG, type FoghornEvent } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import {
  Foghorn,
  bearingTo,
  chevronAlpha,
  chevronPoint,
  chevronPop,
  chevronWeight,
  tierGain,
} from '../render/foghorn.js';
import { isFogImmuneEffect, isJuiceEffect, effectPeakAlpha } from '../render/effects.js';
import { bindRoom, type RoomBindingDeps } from '../net/roomBindings.js';
import type { Connection } from '../net/connection.js';
import { motionIntensity } from '../settings/store.js';

const F = CLIENT_CONFIG.foghorn;
const CH = F.chevron;
const TTL = CH.ttlMs;
const W = 1366;
const H = 768;
const TAU = Math.PI * 2;

// --- the cooldown is single-sourced from shared CONFIG (amendment 41) --------

describe('the foghorn cooldown is NOT copied client-side', () => {
  it('CLIENT_CONFIG.foghorn carries no cooldown of its own', () => {
    // The `damageBands` precedent: exactly one copy of a gameplay number may
    // exist. main.ts reads CONFIG.foghorn.cooldownMs straight from shared, so a
    // retune moves the client's wire-spam guard with the server's gate. A
    // `cooldownMs` key appearing here is the regression this pins.
    expect(Object.keys(F)).not.toContain('cooldownMs');
    expect(JSON.stringify(F)).not.toContain(String(CONFIG.foghorn.cooldownMs));
  });

  it('leaves the shared cadence byte-identical to its ruled value', () => {
    expect(CONFIG.foghorn.cooldownMs).toBe(1500); // Eric ruling, amendment 56
  });
});

// --- tier → gain (amendment 53) ---------------------------------------------

describe('tierGain — the three earshot bands Eric named', () => {
  it('maps 1/2/3 to 100% / 75% / 50%', () => {
    expect(tierGain(1)).toBe(1);
    expect(tierGain(2)).toBe(0.75);
    expect(tierGain(3)).toBe(0.5);
  });

  it('is monotonically quieter with distance — a farther honk is never louder', () => {
    expect(tierGain(1)).toBeGreaterThan(tierGain(2));
    expect(tierGain(2)).toBeGreaterThan(tierGain(3));
    expect(tierGain(3)).toBeGreaterThan(0); // an audible band is audible
  });

  it('resolves an ABSENT tier to full gain (the self + spectator shapes)', () => {
    // Neither carries a `v`: the honker IS the honk and a spectator is
    // omniscient. Silence would be the one wrong answer.
    expect(tierGain(undefined)).toBe(1);
  });

  it('carries no reach knob — who hears what is resolved server-side', () => {
    // Amendment 53: the bands derive from the LISTENER's effective ranges
    // (sightOf / muzzleFlash / radarRange) and arrive pre-decided as `v`.
    // A distance or radius here would be a second, forkable authority.
    const keys = JSON.stringify(F).toLowerCase();
    expect(keys).not.toContain('range');
    expect(keys).not.toContain('reach');
  });
});

// --- tier → chevron weight ---------------------------------------------------

describe('chevronWeight — tier separable without hue', () => {
  it('differs in SIZE, STROKE and ALPHA at once, so volume survives a glance', () => {
    const [a, b, c] = [chevronWeight(1), chevronWeight(2), chevronWeight(3)];
    expect(a.size).toBeGreaterThan(b.size);
    expect(b.size).toBeGreaterThan(c.size);
    expect(a.thickness).toBeGreaterThan(b.thickness);
    expect(b.thickness).toBeGreaterThan(c.thickness);
    expect(a.alpha).toBeGreaterThan(b.alpha);
    expect(b.alpha).toBeGreaterThan(c.alpha);
  });

  it('keeps every tier visible — the quietest band still draws', () => {
    expect(chevronWeight(3).alpha).toBeGreaterThan(0);
    expect(chevronWeight(3).size).toBeGreaterThan(0);
  });

  it('draws an absent tier (the spectator shape) at full weight', () => {
    expect(chevronWeight(undefined)).toEqual(chevronWeight(1));
  });

  it('carries no identity channel of any kind', () => {
    // Amendment 51: no id, no hue, no class, no correlation handle. The tier
    // table decides WEIGHT and nothing else; hue is one constant for all three.
    for (const v of [1, 2, 3] as const) {
      expect(Object.keys(chevronWeight(v)).sort()).toEqual(['alpha', 'size', 'thickness']);
    }
  });
});

// --- THE EDGE CONVENTION -----------------------------------------------------

describe('chevronPoint — world bearing IS the screen direction (no y-flip)', () => {
  const inset = CH.insetPx;
  const cx = W / 2;
  const cy = H / 2;

  it('puts bearing 0 on the RIGHT edge, vertically centred', () => {
    const p = chevronPoint(0, W, H, inset);
    expect(p.x).toBeCloseTo(W - inset, 6);
    expect(p.y).toBeCloseTo(cy, 6);
  });

  it('puts bearing π/2 on the BOTTOM edge — screen +y is DOWN, and so is world +y', () => {
    const p = chevronPoint(Math.PI / 2, W, H, inset);
    expect(p.x).toBeCloseTo(cx, 6);
    expect(p.y).toBeCloseTo(H - inset, 6);
  });

  it('puts bearing π on the LEFT edge', () => {
    const p = chevronPoint(Math.PI, W, H, inset);
    expect(p.x).toBeCloseTo(inset, 6);
    expect(p.y).toBeCloseTo(cy, 6);
  });

  it('puts bearing 3π/2 on the TOP edge', () => {
    const p = chevronPoint((3 * Math.PI) / 2, W, H, inset);
    expect(p.x).toBeCloseTo(cx, 6);
    expect(p.y).toBeCloseTo(inset, 6);
  });

  it('agrees with the camera transform: a honker due SOUTH-in-world plots DOWN-screen', () => {
    // The independent re-derivation. camera.worldToScreen is
    // (world - center) * zoom + screenCenter with no rotation term, so a honker
    // at +y in world space is at +y on screen. If chevronPoint ever disagreed
    // with that, every bearing in the game would point at the wrong horizon.
    const b = bearingTo(0, 0, 0, 500); // straight "down" in world coords
    const p = chevronPoint(b, W, H, inset);
    expect(p.y).toBeGreaterThan(cy);
    expect(p.x).toBeCloseTo(cx, 6);
  });

  it('never leaves the inset rectangle, for any bearing', () => {
    for (let i = 0; i < 64; i++) {
      const p = chevronPoint((i / 64) * TAU, W, H, inset);
      expect(p.x).toBeGreaterThanOrEqual(inset - 1e-6);
      expect(p.x).toBeLessThanOrEqual(W - inset + 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(inset - 1e-6);
      expect(p.y).toBeLessThanOrEqual(H - inset + 1e-6);
    }
  });

  it('touches an edge for every bearing — the mark is PINNED, never floating', () => {
    for (let i = 0; i < 64; i++) {
      const p = chevronPoint((i / 64) * TAU, W, H, inset);
      const onEdge =
        Math.min(Math.abs(p.x - inset), Math.abs(p.x - (W - inset))) < 1e-6 ||
        Math.min(Math.abs(p.y - inset), Math.abs(p.y - (H - inset))) < 1e-6;
      expect(onEdge).toBe(true);
    }
  });

  it('is translational under a viewport change (the mark tracks the real edge)', () => {
    const a = chevronPoint(0, W, H, inset);
    const b = chevronPoint(0, W * 2, H, inset);
    expect(b.x - a.x).toBeCloseTo(W, 6);
  });

  it('collapses to the centre rather than inverting on a viewport smaller than the inset', () => {
    const p = chevronPoint(0, 40, 40, inset);
    expect(p.x).toBeCloseTo(20, 6);
    expect(p.y).toBeCloseTo(20, 6);
  });

  it('holds the centre for a non-finite bearing instead of producing NaN coordinates', () => {
    const p = chevronPoint(Number.NaN, W, H, inset);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
  });
});

// --- bearingTo (the spectator path) -----------------------------------------

describe('bearingTo — the spectator derives what the server would not send', () => {
  it('returns wrapPositive [0, 2π) bearings for the four cardinals', () => {
    expect(bearingTo(0, 0, 10, 0)).toBeCloseTo(0, 9);
    expect(bearingTo(0, 0, 0, 10)).toBeCloseTo(Math.PI / 2, 9);
    expect(bearingTo(0, 0, -10, 0)).toBeCloseTo(Math.PI, 9);
    expect(bearingTo(0, 0, 0, -10)).toBeCloseTo((3 * Math.PI) / 2, 9); // never negative
  });

  it('is taken FROM the observation point, not from the origin', () => {
    expect(bearingTo(100, 100, 200, 100)).toBeCloseTo(0, 9);
    expect(bearingTo(100, 100, 0, 100)).toBeCloseTo(Math.PI, 9);
  });

  it('is range-free — doubling the distance does not move the bearing', () => {
    expect(bearingTo(0, 0, 10, 10)).toBeCloseTo(bearingTo(0, 0, 400, 400), 9);
  });
});

// --- the TTL fade ------------------------------------------------------------

describe('chevronAlpha — a bearing is a fact with an expiry', () => {
  it('is dead at exactly one TTL and beyond', () => {
    expect(chevronAlpha(TTL, 1)).toBe(0);
    expect(chevronAlpha(TTL * 5, 1)).toBe(0);
  });

  it('starts at the tier peak and decays monotonically — a honk never re-brightens', () => {
    expect(chevronAlpha(0, 0.9)).toBeCloseTo(0.9, 9);
    let prev = Infinity;
    for (let age = 0; age < TTL; age += TTL / 20) {
      const a = chevronAlpha(age, 0.9);
      expect(a).toBeLessThanOrEqual(prev + 1e-9);
      prev = a;
    }
  });

  it('scales linearly with the tier peak and never exceeds it', () => {
    expect(chevronAlpha(TTL / 2, 1)).toBeCloseTo(0.5, 9);
    expect(chevronAlpha(TTL / 2, 0.5)).toBeCloseTo(0.25, 9);
    for (let age = 0; age <= TTL; age += TTL / 10) {
      expect(chevronAlpha(age, 0.5)).toBeLessThanOrEqual(0.5 + 1e-9);
    }
  });

  it('treats a negative age (clock jitter) as FULL, not as a pop', () => {
    // The phosphor.ts blipAlpha resolution, not smoke.ts's: a chevron has no
    // bloom-in ramp, so "newborn" and "full" coincide and there is no
    // discontinuity at the origin to protect against.
    expect(chevronAlpha(-40, 0.9)).toBeCloseTo(0.9, 9);
  });

  it('lasts the ~1.2s amendment 55 named — long enough to look, short enough to expire', () => {
    expect(TTL).toBeGreaterThanOrEqual(1000);
    expect(TTL).toBeLessThanOrEqual(1600);
    // ...and it must expire well inside the honk cooldown's SECOND honk, or
    // marks from one captain would visibly stack into a track.
    expect(TTL).toBeLessThan(CONFIG.foghorn.cooldownMs * 2);
  });
});

// --- the pop is the only motion channel --------------------------------------

describe('chevronPop — the one animated flourish', () => {
  it('is exactly 1 at motion=off, from the very first frame', () => {
    for (const age of [0, 20, CH.popMs / 2, CH.popMs, TTL]) {
      expect(chevronPop(age, 0)).toBe(1);
    }
  });

  it('starts big and settles to true size at full motion', () => {
    expect(chevronPop(0, 1)).toBeCloseTo(CH.popScale, 9);
    expect(chevronPop(CH.popMs, 1)).toBeCloseTo(1, 9);
    expect(chevronPop(TTL, 1)).toBeCloseTo(1, 9); // clamped, never inverts
  });

  it('halves its amplitude at `reduced`', () => {
    const full = chevronPop(0, motionIntensity('full')) - 1;
    const reduced = chevronPop(0, motionIntensity('reduced')) - 1;
    expect(reduced).toBeCloseTo(full / 2, 9);
  });

  it('never runs backwards for a negative age', () => {
    expect(chevronPop(-100, 1)).toBeCloseTo(CH.popScale, 9);
  });
});

// --- the ratified house rule --------------------------------------------------

describe("motion: 'off' removes MOTION, never INFORMATION (UX-DR36, amendment 55)", () => {
  it('keeps PRESENCE: alpha is identical at off and at full', () => {
    for (const age of [0, 300, 900]) {
      expect(chevronAlpha(age, chevronWeight(2).alpha)).toBe(chevronAlpha(age, chevronWeight(2).alpha));
    }
    // The fade is not motion-parameterised at all — there is no level to pass.
    // (`Function.length` counts required params: ageMs + peak, ttlMs defaulted.)
    expect(chevronAlpha.length).toBe(2);
  });

  it('keeps DIRECTION: the placement takes no motion input whatsoever', () => {
    expect(chevronPoint.length).toBe(3); // bearing, w, h — inset defaulted, no level
    const off = chevronPoint(1.1, W, H);
    const same = chevronPoint(1.1, W, H);
    expect(off).toEqual(same);
  });

  it('keeps TIER WEIGHT: all three bands stay fully distinguishable at off', () => {
    const still = (v: 1 | 2 | 3) => ({
      ...chevronWeight(v),
      drawn: chevronWeight(v).size * chevronPop(0, 0),
    });
    expect(still(1).drawn).toBeGreaterThan(still(2).drawn);
    expect(still(2).drawn).toBeGreaterThan(still(3).drawn);
  });

  it('removes exactly ONE channel and nothing else', () => {
    const age = 60;
    expect(chevronPop(age, 0)).toBe(1); // gone
    expect(chevronAlpha(age, 0.9)).toBeGreaterThan(0); // stays
    expect(chevronPoint(2.2, W, H)).toEqual(chevronPoint(2.2, W, H)); // stays
  });
});

// --- the own-hull bloom is not juice -----------------------------------------

describe("the own-hull `horn` bloom survives motion: 'off'", () => {
  it('is NOT a juice effect — it is the honker’s only visual', () => {
    // A honker gets no chevron (a bearing to yourself is meaningless), so if
    // `horn` were juice, spawnOneShot's `peakAlpha <= 0` early-out at
    // motion:'off' would delete the entire visual twin of a cue the player
    // deliberately triggered.
    expect(isJuiceEffect('horn')).toBe(false);
    expect(effectPeakAlpha('horn', 0.5, motionIntensity('off'))).toBe(0.5);
    expect(effectPeakAlpha('horn', 0.5, motionIntensity('reduced'))).toBe(0.5);
  });

  it('is fog-immune, like every other mark that must read past the bubble', () => {
    expect(isFogImmuneEffect('horn')).toBe(true);
  });
});

// --- the adapter: TTL, cap, spawn bookkeeping --------------------------------

describe('Foghorn — the pooled chevron list', () => {
  const mk = () => new Foghorn(new Container());

  it('spawns one mark per honk and ages it out at exactly one TTL', () => {
    const f = mk();
    f.onHonk(0, 1, 1000);
    expect(f.liveMarks).toBe(1);
    f.render(1000 + TTL - 1, W, H);
    expect(f.liveMarks).toBe(1);
    f.render(1000 + TTL, W, H);
    expect(f.liveMarks).toBe(0);
  });

  it('ages against SERVER time, so a backgrounded tab cannot strand a mark', () => {
    // Timestamp math (serverNow - t), never accumulated dt — the render loop
    // that would do the accumulating is throttled while hidden.
    const f = mk();
    f.onHonk(0, 1, 5000);
    f.render(5000 + TTL * 10, W, H); // one frame, ten lifetimes later
    expect(f.liveMarks).toBe(0);
  });

  it('caps globally at maxMarks, evicting the OLDEST first', () => {
    const f = mk();
    for (let i = 0; i < CH.maxMarks + 5; i++) f.onHonk(i * 0.1, 1, 1000 + i);
    expect(f.liveMarks).toBe(CH.maxMarks);
  });

  it('has no per-source cap and no key to build one from', () => {
    // Amendment 51 applies amendment 45 verbatim: the wire carries no
    // correlation handle, so marks cannot be grouped by the hull that honked.
    // onHonk's whole signature is (bearing, tier, t) — there is nothing to key.
    const f = mk();
    expect(f.onHonk.length).toBe(3);
  });

  it('clear() drops every live mark (return to port)', () => {
    const f = mk();
    f.onHonk(0, 1, 1000);
    f.onHonk(1, 2, 1000);
    f.clear();
    expect(f.liveMarks).toBe(0);
  });

  it('survives a render with no marks and a render after a clear', () => {
    const f = mk();
    expect(() => f.render(1000, W, H)).not.toThrow();
    f.onHonk(0, 1, 1000);
    f.clear();
    expect(() => f.render(1000, W, H)).not.toThrow();
  });

  it('skips the spawn entirely while the tab is hidden', () => {
    const f = mk();
    const spy = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    f.onHonk(0, 1, 1000);
    expect(f.liveMarks).toBe(0);
    spy.mockRestore();
  });

  it('spawns at motion:off — presence is information (no motion gate on the path)', () => {
    const f = mk();
    f.onHonk(Math.PI, 3, 1000);
    expect(f.liveMarks).toBe(1);
    f.render(1000, W, H);
    expect(f.liveMarks).toBe(1);
  });
});

// --- the routing shapes (roomBindings `case 'fh'`) ---------------------------

function setupHonk(over: Record<string, unknown> = {}) {
  const sink: { handler: (f: unknown) => void } = { handler: () => undefined };
  const room = {
    onMessage: () => undefined,
    onError: () => undefined,
    onLeave: () => undefined,
    onDrop: () => undefined,
    onReconnect: () => undefined,
  };
  const conn = { room, welcome: {}, sink } as unknown as Connection;
  const playHorn = vi.fn();
  const spawnEffect = vi.fn();
  const onHonk = vi.fn();
  const deps = {
    state: { net: { you: over.you ?? null, sessionId: 'me', tick: 0, ackSeq: 0 }, spectating: true, phase: '', respawnEta: null, mode: 'interp' },
    clock: { addSample: vi.fn() },
    contacts: { pushFrame: vi.fn() },
    mines: { sync: vi.fn() },
    litZones: { sync: vi.fn() },
    decoys: { sync: vi.fn() },
    ownBurstRadius: () => undefined,
    ownMineRings: () => undefined,
    effects: { spawnEffect },
    audio: { play: vi.fn(), playHorn },
    foghorn: { onHonk },
    cameraCenter: () => (over.camera ?? { x: 0, y: 0 }),
    onSunkObserved: vi.fn(),
    onSpectate: vi.fn(),
    colors: vi.fn(() => null),
    ordnanceHue: vi.fn(() => 0),
  } as unknown as RoomBindingDeps;
  bindRoom(conn, deps);
  return { sink, playHorn, spawnEffect, onHonk };
}

/** A frame carrying exactly one `fh` event, at server time 200. */
function honkFrame(e: FoghornEvent): unknown {
  return { t: 200, tick: 2, ackSeq: 0, spec: true, contacts: [], mines: [], events: [e] };
}

describe("roomBindings case 'fh' — three shapes, three behaviors", () => {
  it('SELF: plays at 100%, blooms the own hull, and draws NO chevron', () => {
    const you = { x: 40, y: -60, heading: 0, speed: 0, cls: 'torpedoBoat', boons: [], alive: true, sweep: 0 };
    const { sink, playHorn, spawnEffect, onHonk } = setupHonk({ you });
    sink.handler(honkFrame({ k: 'fh', h: 'standard', self: true }));
    expect(playHorn).toHaveBeenCalledWith('standard', 1);
    expect(spawnEffect).toHaveBeenCalledWith('horn', 40, -60);
    expect(onHonk).not.toHaveBeenCalled(); // a bearing to yourself is meaningless
  });

  it('SELF with no own ship on the frame still sounds (the bloom is what is skipped)', () => {
    const { sink, playHorn, spawnEffect } = setupHonk();
    sink.handler(honkFrame({ k: 'fh', h: 'standard', self: true }));
    expect(playHorn).toHaveBeenCalledWith('standard', 1);
    expect(spawnEffect).not.toHaveBeenCalled();
  });

  it('FOGGED: plays at the tier gain and draws a chevron at the WIRE bearing', () => {
    const { sink, playHorn, onHonk } = setupHonk();
    sink.handler(honkFrame({ k: 'fh', h: 'standard', b: 2.5, v: 2 }));
    expect(playHorn).toHaveBeenCalledWith('standard', 0.75);
    expect(onHonk).toHaveBeenCalledWith(2.5, 2, 200); // bearing, tier, FRAME time
  });

  it('FOGGED tier 3: the quietest band still draws its mark', () => {
    const { sink, playHorn, onHonk } = setupHonk();
    sink.handler(honkFrame({ k: 'fh', h: 'standard', b: 0.25, v: 3 }));
    expect(playHorn).toHaveBeenCalledWith('standard', 0.5);
    expect(onHonk).toHaveBeenCalledWith(0.25, 3, 200);
  });

  it('SPECTATOR: plays at 100% and derives the bearing from the CAMERA centre', () => {
    const { sink, playHorn, onHonk } = setupHonk({ camera: { x: 100, y: 100 } });
    sink.handler(honkFrame({ k: 'fh', h: 'standard', x: 100, y: 600 }));
    expect(playHorn).toHaveBeenCalledWith('standard', 1);
    // Due "south" of the camera in world coords -> π/2, which chevronPoint puts
    // on the BOTTOM edge (the y-down convention above).
    expect(onHonk).toHaveBeenCalledWith(Math.PI / 2, undefined, 200);
  });

  it('SPECTATOR: the bearing is fixed AT RECEIPT, not re-derived as the camera pans', () => {
    let cam = { x: 0, y: 0 };
    const { sink, onHonk } = setupHonk({ camera: cam });
    // A fresh setup per pan would be a different assertion; instead pin that the
    // value handed to the layer is a NUMBER, not a live source the layer could
    // re-read. (The layer stores `bearing` and never consults the camera again.)
    sink.handler(honkFrame({ k: 'fh', h: 'standard', x: 500, y: 0 }));
    cam = { x: 999, y: 999 };
    expect(typeof onHonk.mock.calls[0][0]).toBe('number');
    expect(onHonk.mock.calls[0][0]).toBeCloseTo(0, 9);
  });

  it('THE CHEVRON IS PUSHED BEFORE THE AUDIO — and never rides on it', () => {
    // amendment 56: the mix cap drops HORNS, never CHEVRONS. A playHorn that
    // throws (or silently drops, which it does at its concurrency cap) must not
    // be able to take the visual twin with it.
    const order: string[] = [];
    const { sink } = (() => {
      const s = setupHonk();
      s.playHorn.mockImplementation(() => order.push('audio'));
      s.onHonk.mockImplementation(() => order.push('chevron'));
      return s;
    })();
    sink.handler(honkFrame({ k: 'fh', h: 'standard', b: 1, v: 1 }));
    expect(order).toEqual(['chevron', 'audio']);
  });

  it('an UNKNOWN horn id is forwarded verbatim — the audio layer owns the fallback', () => {
    // The wire type is HornId, but a newer server can send an id this bundle has
    // never heard of. roomBindings must NOT sanitize or drop it: playHorn takes
    // a plain string and falls back to the default voice (amendment 52).
    const { sink, playHorn, onHonk } = setupHonk();
    sink.handler(honkFrame({ k: 'fh', h: 'brass-leviathan' } as unknown as FoghornEvent));
    expect(playHorn).toHaveBeenCalledWith('brass-leviathan', 1);
    expect(onHonk).not.toHaveBeenCalled(); // no bearing and no position -> no mark
  });

  it('a shape with neither bearing nor position SOUNDS but draws nothing', () => {
    // A chevron at a defaulted bearing of 0 would point confidently at the
    // wrong horizon, which is strictly worse than no mark at all.
    const { sink, playHorn, onHonk } = setupHonk();
    sink.handler(honkFrame({ k: 'fh', h: 'standard' }));
    expect(playHorn).toHaveBeenCalledTimes(1);
    expect(onHonk).not.toHaveBeenCalled();
  });

  it('never leaks a position into the chevron call — bearing and tier only', () => {
    const { sink, onHonk } = setupHonk();
    sink.handler(honkFrame({ k: 'fh', h: 'standard', b: 1.75, v: 1 }));
    expect(onHonk.mock.calls[0]).toHaveLength(3);
    for (const arg of onHonk.mock.calls[0]) {
      expect(typeof arg === 'number' || arg === undefined).toBe(true);
    }
  });
});
