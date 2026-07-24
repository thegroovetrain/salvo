// Truesight nameplates (Story 1.13) — the pure helpers + the latch state
// machine that render/contacts.ts and main.ts drive. Covers the spec's I/O &
// Edge-Case Matrix: latch (no plate before resolve → appears on resolve →
// persists after roster leave), drone verbatim "DRONE"/droneOutline, textSafe
// human color, code-point-safe 14-char mid-ellipsis (incl. surrogate pairs), the
// uppercase rule + ordering, and the constant-screen-size screenY math.
//
// The NameplateLayer's Pixi Text lifecycle isn't exercised here (jsdom has no
// canvas text metrics, matching every other client render test — only Graphics
// is constructed). The latch decision the layer is driven by is factored into
// pure helpers, which is what these tests pin.

import { describe, it, expect } from 'vitest';
import { hullSilhouette, polygonMaxRadius } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { textSafe } from '../util/color.js';
import { PLAYER_HUES } from '../render/ships.js';
import {
  PLATE_FONT_PX,
  plateText,
  plateColor,
  resolvePlate,
  latchPlate,
  plateScreenY,
} from '../render/nameplates.js';

const C = CLIENT_CONFIG.colors;

describe('plateText — uppercase + ellipsize (ellipsis BEFORE uppercase)', () => {
  it('uppercases a short name unchanged', () => {
    expect(plateText('ahab')).toBe('AHAB');
    expect(plateText('Sea Wolf')).toBe('SEA WOLF');
  });

  it('leaves a 14-code-point name untouched (then uppercased)', () => {
    expect(plateText('exactly14chars')).toBe('EXACTLY14CHARS');
  });

  it('mid-ellipsizes an over-length name to 14 code points, THEN uppercases', () => {
    // Ellipsize the RAW name first (7 head + … + 6 tail), so the feed and the
    // plate agree on which characters survive; uppercase is display-only.
    expect(plateText('abcdefghijklmnopqrstuvwxyz')).toBe('ABCDEFG…UVWXYZ');
    expect([...plateText('abcdefghijklmnopqrstuvwxyz')]).toHaveLength(14);
  });

  it('slices on CODE POINTS — a long emoji name never yields a lone surrogate', () => {
    const name = '🚢'.repeat(16); // 16 code points, 32 UTF-16 units
    const out = plateText(name);
    expect([...out]).toHaveLength(14); // 7 head + … + 6 tail, counted in code points
    const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    expect(loneSurrogate.test(out)).toBe(false);
    expect(out).not.toContain('�');
  });
});

describe('plateColor — drone verbatim, human text-safe', () => {
  it('is the droneOutline grey VERBATIM for a drone (never lightened, index ignored)', () => {
    expect(plateColor(0, true)).toBe(C.droneOutline);
    expect(plateColor(5, true)).toBe(C.droneOutline); // index ignored for a drone
    expect(plateColor(19, true)).toBe(C.droneOutline);
  });

  it('is the personal hue text-safe (≥4.5:1) variant for a human', () => {
    for (const idx of [0, 8, 17]) {
      expect(plateColor(idx, false)).toBe(textSafe(PLAYER_HUES[idx]));
    }
  });
});

describe('resolvePlate — the latch gate', () => {
  it('a drone always resolves to the literal "DRONE" (never its roster name)', () => {
    expect(resolvePlate('DRONE-07', null, true)).toEqual({ text: 'DRONE', color: C.droneOutline });
    // Even if a (bogus) name/hue were present, the drone text stays "DRONE".
    expect(resolvePlate('IMPOSTER', 3, true)).toEqual({ text: 'DRONE', color: C.droneOutline });
  });

  it('a human with an unsynced name OR hue does NOT resolve (no plate, no id leak)', () => {
    expect(resolvePlate(null, 5, false)).toBeNull(); // name unsynced
    expect(resolvePlate('ACE', null, false)).toBeNull(); // hue unsynced
    expect(resolvePlate(null, null, false)).toBeNull(); // both unsynced
  });

  it('a fully-synced human resolves to uppercase callsign + text-safe hue', () => {
    expect(resolvePlate('ace', 8, false)).toEqual({ text: 'ACE', color: textSafe(PLAYER_HUES[8]) });
  });
});

describe('latchPlate — resolve once, then persist', () => {
  it('emits no plate before the roster syncs, then the plate on resolve', () => {
    // Frame 1: unresolved human → nothing to set, not yet latched.
    const f1 = latchPlate(false, null, null, false);
    expect(f1.plate).toBeNull();
    expect(f1.latched).toBe(false);
    // Frame 2: name + hue land → the plate resolves and latches.
    const f2 = latchPlate(false, 'ACE', 5, false);
    expect(f2.plate).toEqual({ text: 'ACE', color: textSafe(PLAYER_HUES[5]) });
    expect(f2.latched).toBe(true);
  });

  it('persists a latched plate even after the player leaves the roster', () => {
    // Already latched; the roster entry vanished (name/hue back to null). The
    // driver sets nothing (keeps the existing Text) and stays latched.
    const f = latchPlate(true, null, null, false);
    expect(f.plate).toBeNull();
    expect(f.latched).toBe(true);
  });

  it('latches a drone on the first frame (always resolvable)', () => {
    const f = latchPlate(false, null, null, true);
    expect(f.plate).toEqual({ text: 'DRONE', color: C.droneOutline });
    expect(f.latched).toBe(true);
  });
});

describe('plateScreenY — floats above the hull, constant screen font at any zoom', () => {
  it('offsets above the hull bounding circle plus the pad', () => {
    const pad = 8;
    const r = polygonMaxRadius(hullSilhouette('battleship'));
    expect(plateScreenY(100, 'battleship', 1, pad)).toBeCloseTo(100 - r - pad, 9);
  });

  it('the offset scales with zoom while the font size (9px) does NOT', () => {
    const pad = 8;
    const r = polygonMaxRadius(hullSilhouette('battleship'));
    const full = plateScreenY(100, 'battleship', 1, pad); // 100 - r - 8
    const half = plateScreenY(100, 'battleship', 0.5, pad); // 100 - r/2 - 8 (spectate zoom)
    expect(full).toBeCloseTo(100 - r - pad, 9);
    expect(half).toBeCloseTo(100 - r / 2 - pad, 9);
    // The hull-radius offset (excluding the constant pad) halves at 0.5× — the
    // hull shrinks with zoom, so the plate sits closer to the ship's screen point.
    expect(100 - half - pad).toBeCloseTo((100 - full - pad) / 2, 9);
    // The screen font size is a constant, independent of zoom — plates live in
    // screen space, so 0.5× spectate zoom never shrinks the text.
    expect(PLATE_FONT_PX).toBe(9);
  });

  it('uses each hull id\'s own silhouette radius (per-class offset)', () => {
    const pad = 6;
    for (const id of ['torpedoBoat', 'battleship', 'mineLayer', 'droneSmall'] as const) {
      const r = polygonMaxRadius(hullSilhouette(id));
      expect(plateScreenY(0, id, 1, pad)).toBeCloseTo(-r - pad, 9);
    }
  });
});
