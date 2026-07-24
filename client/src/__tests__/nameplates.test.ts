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

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Container } from 'pixi.js';
import { hullSilhouette, polygonMaxRadius, type Contact } from '@salvo/shared';
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
  NameplateLayer,
} from '../render/nameplates.js';
import { ContactViews, CONTACT_STALE_MS } from '../render/contacts.js';
import { ContactStore } from '../net/snapshots.js';

// jsdom has no canvas text metrics, so Pixi's Text can't rasterize here (every
// other client render test constructs only Graphics). Partial-mock pixi.js —
// keep the real Container/Graphics scene graph, swap ONLY Text for a metric-free
// stub that captures text/style/position/alpha/visible/anchor/destroy so the
// NameplateLayer's Pixi lifecycle + the ContactViews plate driver are testable.
const textLog = vi.hoisted(() => [] as StubTextRecord[]);
interface StubTextRecord {
  text: string;
  textWrites: number;
  style: Record<string, unknown>;
  alpha: number;
  visible: boolean;
  destroyed: boolean;
  position: { x: number; y: number };
  anchor: { x: number; y: number };
}
vi.mock('pixi.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pixi.js')>();
  class StubText {
    private _text: string;
    textWrites = 1;
    style: Record<string, unknown>;
    alpha = 1;
    visible = true;
    destroyed = false;
    position = { x: 0, y: 0, set(x: number, y: number): void { this.x = x; this.y = y; } };
    anchor = { x: 0, y: 0, set(x: number, y: number): void { this.x = x; this.y = y; } };
    constructor(opts: { text: string; style: Record<string, unknown> }) {
      this._text = opts.text;
      this.style = { ...opts.style };
      textLog.push(this as unknown as StubTextRecord);
    }
    get text(): string { return this._text; }
    set text(v: string) { this._text = v; this.textWrites++; }
    destroy(): void { this.destroyed = true; }
  }
  return { ...actual, Text: StubText };
});

/** A stub scene-graph parent — addChild is the only method the layers call. */
const stubLayer = (): Container => ({ addChild() {}, removeChild() {} }) as unknown as Container;

beforeEach(() => {
  textLog.length = 0;
});

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

  it('re-ellipsizes when uppercase EXPANDS code points past the cap (ß→SS)', () => {
    // A 14-cp name at the cap: ellipsize leaves it, but toUpperCase doubles each
    // ß to SS (28 chars) — the result must be re-ellipsized back to ≤ 14 cps so
    // the plate can never overrun (Pixi would otherwise render an over-length line).
    const out = plateText('ß'.repeat(14));
    expect([...out].length).toBeLessThanOrEqual(14);
    expect(out).toContain('…'); // proof the uppercased overflow was re-ellipsized
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

  it('falls back to text-safe amber for an out-of-range human index (bounds guard)', () => {
    // Belt-and-braces like the 1.12 siblings: an index past the wheel resolves to
    // amber, so textSafe never receives undefined and the plate always has a color.
    expect(plateColor(999, false)).toBe(textSafe(C.amber));
    expect(plateColor(-1, false)).toBe(textSafe(C.amber));
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

  it('strips control chars so a newline never reaches Pixi as a multi-line plate', () => {
    const r = resolvePlate('AB\nCD', 5, false);
    expect(r?.text).toBe('ABCD');
    expect(r?.text).not.toContain('\n');
  });

  it('does NOT latch a blank plate for a zero-width-only name (stays unresolved)', () => {
    // All-format-char (ZWSP U+200B) or empty/whitespace name → null, so the
    // driver keeps retrying rather than latching an invisible plate that never
    // re-resolves. Format chars are Cf (not stripped), but all-Cf still fails the gate.
    expect(resolvePlate('​​', 5, false)).toBeNull();
    expect(resolvePlate('', 5, false)).toBeNull();
    expect(resolvePlate('   ', 5, false)).toBeNull();
  });

  it('keeps an emoji ZWJ sequence intact (format chars survive)', () => {
    // The ZWJ (U+200D) is a format char but must NOT be stripped — the family
    // emoji is one grapheme built from it. Only true control chars are removed.
    const family = '👨‍👩‍👧‍👦';
    const r = resolvePlate(family, 5, false);
    expect(r?.text).toBe(family); // ≤ 14 code points, uppercase is a no-op on emoji
    expect(r?.text).toContain('‍');
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

describe('ContactViews plate offset survives prune (no torpedoBoat pop)', () => {
  const contact = (cls: Contact['cls']): Contact[] => [{ id: 'e1', x: 100, y: 50, heading: 0, speed: 0, cls }];
  const camera = { worldToScreen: (p: { x: number; y: number }) => ({ x: p.x, y: p.y }), zoom: 1 };
  const plates = { nameOf: () => 'ADM', camera, pad: 8 };
  const rosterIndex = (): number => 3;

  it('holds the BATTLESHIP plate offset through the fade-after-prune', () => {
    const nameplates = new NameplateLayer(stubLayer());
    const views = new ContactViews(stubLayer(), nameplates);
    const store = new ContactStore();

    // Sight a battleship contact and render once (creates the view + latches the plate).
    store.pushFrame(0, contact('battleship'));
    views.render(store, 0, 0, 16, rosterIndex, plates);
    const plate = textLog.find((t) => t.text === 'ADM');
    expect(plate).toBeDefined();
    const rBs = polygonMaxRadius(hullSilhouette('battleship'));
    const rTb = polygonMaxRadius(hullSilhouette('torpedoBoat'));
    expect(plate!.position.y).toBeCloseTo(50 - rBs - 8, 6); // battleship offset while sighted

    // Stop pushing; advance past the stale TTL so prune drops the contact — its
    // class entry is DELETED, so a live store.classOf() would fall back to
    // 'torpedoBoat'. The cached hull id must keep the battleship offset (no pop).
    const afterTtl = CONTACT_STALE_MS + 1;
    views.render(store, afterTtl, afterTtl, 16, rosterIndex, plates);
    expect(plate!.position.y).toBeCloseTo(50 - rBs - 8, 6); // STILL battleship, not popped
    // Sanity: the torpedoBoat fallback would have produced a visibly different y.
    expect(50 - rTb - 8).not.toBeCloseTo(50 - rBs - 8, 2);
  });
});

describe('NameplateLayer — Pixi Text lifecycle state machine', () => {
  it('set() creates the Text once, then diff-before-assigns on text (color always writes)', () => {
    const layer = new NameplateLayer(stubLayer());
    layer.set('a', 'HELLO', 0x111111);
    const t = textLog[0];
    expect(textLog).toHaveLength(1);
    expect(t.text).toBe('HELLO');
    expect(t.textWrites).toBe(1);

    layer.set('a', 'HELLO', 0x222222); // same text, new color
    expect(textLog).toHaveLength(1); // not recreated
    expect(t.textWrites).toBe(1); // text NOT re-assigned (avoids re-rasterize)
    expect(t.style.fill).toBe(0x222222); // color still updates

    layer.set('a', 'WORLD', 0x333333); // changed text
    expect(t.text).toBe('WORLD');
    expect(t.textWrites).toBe(2);
  });

  it('place() on an id without a plate is a no-op (no throw)', () => {
    const layer = new NameplateLayer(stubLayer());
    expect(() => layer.place('ghost', 10, 20, 1)).not.toThrow();
    expect(textLog).toHaveLength(0);
  });

  it('hide() then place(alpha>0) re-shows the plate', () => {
    // CURRENT behavior: place() re-shows whenever alpha>0, so own-plate discipline
    // relies on updateOwnPlate NOT running while spectating (main.ts hides the own
    // plate and drives contacts only). This pins that contract, not a guarantee.
    const layer = new NameplateLayer(stubLayer());
    layer.set('a', 'X', 0x1);
    const t = textLog[0];
    layer.place('a', 10, 20, 1);
    expect(t.visible).toBe(true);
    layer.hide('a');
    expect(t.visible).toBe(false);
    layer.place('a', 10, 20, 0.5);
    expect(t.visible).toBe(true);
    expect(t.alpha).toBe(0.5);
  });

  it('remove() destroys the Text and drops it; a later set() recreates', () => {
    const layer = new NameplateLayer(stubLayer());
    layer.set('a', 'X', 0x1);
    const first = textLog[0];
    layer.remove('a');
    expect(first.destroyed).toBe(true);
    expect(layer.has('a')).toBe(false);

    layer.set('a', 'Y', 0x2); // recreate after removal
    expect(layer.has('a')).toBe(true);
    expect(textLog).toHaveLength(2);
    expect(textLog[1].text).toBe('Y');
  });
});
