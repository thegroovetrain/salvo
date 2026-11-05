// Truesight nameplates (Story 1.13) — the pure helpers + the latch state
// machine that render/contacts.ts and main.ts drive. Covers the spec's I/O &
// Edge-Case Matrix: latch (no plate before resolve → appears on resolve →
// persists after roster leave), drone verbatim "DRONE"/droneOutline, textSafe
// relation color (Story 10.4), code-point-safe 14-char mid-ellipsis (incl. surrogate pairs), the
// uppercase rule + ordering, and the constant-screen-size screenY math.
//
// The NameplateLayer's Pixi Text lifecycle isn't exercised here (jsdom has no
// canvas text metrics, matching every other client render test — only Graphics
// is constructed). The latch decision the layer is driven by is factored into
// pure helpers, which is what these tests pin.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Container } from 'pixi.js';
import { DEFAULT_CLASS_ID, SHIP_CLASS_IDS, hullSilhouette, polygonMaxRadius, type Contact, type HullId } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { textSafe } from '../util/color.js';
import { relationStroke, type Relation } from '../render/relationColor.js';
import {
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
/** The drone plate's label, read from the resolver — the label is copy, the rule is that it never varies with the roster. */
const DRONE_TEXT = resolvePlate(null, relationStroke('enemy'), true)!.text;
const OWN = relationStroke('own');
const ENEMY = relationStroke('enemy');
const RELATIONS: readonly Relation[] = ['own', 'enemy'];
const enemyIs = (): Relation => 'enemy';

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
  it('is the droneOutline grey VERBATIM for a drone (never lightened, stroke ignored)', () => {
    for (const r of RELATIONS) expect(plateColor(relationStroke(r), true)).toBe(C.droneOutline);
  });

  it('is the relation stroke\'s text-safe (≥4.5:1) variant for a captain', () => {
    for (const r of RELATIONS) expect(plateColor(relationStroke(r), false)).toBe(textSafe(relationStroke(r)));
  });
});

describe('resolvePlate — the latch gate', () => {
  it('a drone always resolves to the one fixed drone label (never its roster name)', () => {
    expect(DRONE_TEXT.length).toBeGreaterThan(0);
    expect(resolvePlate('DRONE-07', ENEMY, true)).toEqual({ text: DRONE_TEXT, color: C.droneOutline });
    // Even if a (bogus) name were present, the drone text stays the fixed label.
    const bogus = resolvePlate('IMPOSTER', OWN, true);
    expect(bogus).toEqual({ text: DRONE_TEXT, color: C.droneOutline });
    expect(bogus!.text).not.toContain('IMPOSTER');
  });

  it('a captain with an unsynced name does NOT resolve (no plate, no id leak)', () => {
    for (const r of RELATIONS) expect(resolvePlate(null, relationStroke(r), false)).toBeNull();
  });

  it('a synced captain resolves to uppercase callsign + text-safe relation color', () => {
    expect(resolvePlate('ace', ENEMY, false)).toEqual({ text: 'ACE', color: textSafe(ENEMY) });
  });

  it('strips control chars so a newline never reaches Pixi as a multi-line plate', () => {
    const r = resolvePlate('AB\nCD', ENEMY, false);
    expect(r?.text).toBe('ABCD');
    expect(r?.text).not.toContain('\n');
  });

  it('does NOT latch a blank plate for a zero-width-only name (stays unresolved)', () => {
    // All-format-char (ZWSP U+200B) or empty/whitespace name → null, so the
    // driver keeps retrying rather than latching an invisible plate that never
    // re-resolves. Format chars are Cf (not stripped), but all-Cf still fails the gate.
    expect(resolvePlate('​​', ENEMY, false)).toBeNull();
    expect(resolvePlate('', ENEMY, false)).toBeNull();
    expect(resolvePlate('   ', ENEMY, false)).toBeNull();
  });

  it('keeps an emoji ZWJ sequence intact (format chars survive)', () => {
    // The ZWJ (U+200D) is a format char but must NOT be stripped — the family
    // emoji is one grapheme built from it. Only true control chars are removed.
    const family = '👨‍👩‍👧‍👦';
    const r = resolvePlate(family, ENEMY, false);
    expect(r?.text).toBe(family); // ≤ 14 code points, uppercase is a no-op on emoji
    expect(r?.text).toContain('‍');
  });
});

describe('latchPlate — resolve once, then persist', () => {
  it('emits no plate before the roster syncs, then the plate on resolve', () => {
    // Frame 1: unresolved human → nothing to set, not yet latched.
    const f1 = latchPlate(false, null, ENEMY, false);
    expect(f1.plate).toBeNull();
    expect(f1.latched).toBe(false);
    // Frame 2: the name lands → the plate resolves and latches.
    const f2 = latchPlate(false, 'ACE', ENEMY, false);
    expect(f2.plate).toEqual({ text: 'ACE', color: textSafe(ENEMY) });
    expect(f2.latched).toBe(true);
  });

  it('persists a latched plate even after the player leaves the roster', () => {
    // Already latched; the roster entry vanished (name back to null). The
    // driver sets nothing (keeps the existing Text) and stays latched.
    const f = latchPlate(true, null, ENEMY, false);
    expect(f.plate).toBeNull();
    expect(f.latched).toBe(true);
  });

  it('latches a drone on the first frame (always resolvable)', () => {
    const f = latchPlate(false, null, ENEMY, true);
    expect(f.plate).toEqual({ text: DRONE_TEXT, color: C.droneOutline });
    expect(f.latched).toBe(true);
  });
});

describe('plateScreenY — floats above the hull, constant screen font at any zoom', () => {
  it('offsets above the hull bounding circle plus the pad', () => {
    const pad = 8;
    const r = polygonMaxRadius(hullSilhouette(DEFAULT_CLASS_ID));
    expect(plateScreenY(100, DEFAULT_CLASS_ID, 1, pad)).toBeCloseTo(100 - r - pad, 9);
  });

  it('the hull-radius offset scales with zoom while the pad does NOT', () => {
    const pad = 8;
    const r = polygonMaxRadius(hullSilhouette(DEFAULT_CLASS_ID));
    const full = plateScreenY(100, DEFAULT_CLASS_ID, 1, pad); // 100 - r - 8
    const half = plateScreenY(100, DEFAULT_CLASS_ID, 0.5, pad); // 100 - r/2 - 8 (spectate zoom)
    expect(full).toBeCloseTo(100 - r - pad, 9);
    expect(half).toBeCloseTo(100 - r / 2 - pad, 9);
    // The hull-radius offset (excluding the constant pad) halves at 0.5× — the
    // hull shrinks with zoom, so the plate sits closer to the ship's screen point.
    expect(100 - half - pad).toBeCloseTo((100 - full - pad) / 2, 9);
  });

  it('uses each hull id\'s own silhouette radius (per-class offset)', () => {
    const pad = 6;
    for (const id of [...SHIP_CLASS_IDS, 'droneSmall'] as const) {
      const r = polygonMaxRadius(hullSilhouette(id));
      expect(plateScreenY(0, id, 1, pad)).toBeCloseTo(-r - pad, 9);
    }
  });
});

describe('ContactViews plate offset survives prune (no fallback-hull pop)', () => {
  const contact = (cls: Contact['cls']): Contact[] => [{ id: 'e1', x: 100, y: 50, heading: 0, speed: 0, cls }];
  const camera = { worldToScreen: (p: { x: number; y: number }) => ({ x: p.x, y: p.y }), zoom: 1 };
  const plates = { nameOf: () => 'ADM', camera, pad: 8 };
  const radius = (id: HullId): number => polygonMaxRadius(hullSilhouette(id));
  // The captain hull whose plate offset differs MOST from the default-class
  // fallback, so a pop to the fallback is unmistakable.
  const SEEN: HullId = SHIP_CLASS_IDS.reduce((best, id) =>
    Math.abs(radius(id) - radius(DEFAULT_CLASS_ID)) > Math.abs(radius(best) - radius(DEFAULT_CLASS_ID)) ? id : best,
  );

  it('holds the sighted hull\'s plate offset through the fade-after-prune', () => {
    const nameplates = new NameplateLayer(stubLayer());
    const views = new ContactViews(stubLayer(), nameplates);
    const store = new ContactStore();

    // Sight a non-default captain and render once (creates the view + latches the plate).
    store.pushFrame(0, contact(SEEN));
    views.render(store, 0, 0, 16, enemyIs, plates);
    const plate = textLog.find((t) => t.text === 'ADM');
    expect(plate).toBeDefined();
    const rSeen = radius(SEEN);
    const rDefault = radius(DEFAULT_CLASS_ID);
    expect(plate!.position.y).toBeCloseTo(50 - rSeen - 8, 6); // its own offset while sighted

    // Stop pushing; advance past the stale TTL so prune drops the contact — its
    // class entry is DELETED, so a live store.classOf() would fall back to
    // DEFAULT_CLASS_ID. The cached hull id must keep the sighted offset (no pop).
    const afterTtl = CONTACT_STALE_MS + 1;
    views.render(store, afterTtl, afterTtl, 16, enemyIs, plates);
    expect(plate!.position.y).toBeCloseTo(50 - rSeen - 8, 6); // STILL its own, not popped
    // Sanity: the default-class fallback would have produced a visibly different y.
    expect(50 - rDefault - 8).not.toBeCloseTo(50 - rSeen - 8, 2);
  });
});

// UX-DR22 / Story 5.3 (the omniscient reveal): at spectate the server delivers
// every afloat hull as an ordinary Contact (no observer bubble applies), so this
// exercises the SAME drivePlate path every contact always uses — the reveal adds
// no new plate logic, it just means every hull on the ocean reaches it in one
// frame. What's pinned here is the property the reveal DEPENDS on: nothing in
// that big a batch gets skipped, drones read "DRONE", humans read their callsign.
describe('ContactViews — every revealed hull latches a plate in one frame (UX-DR22)', () => {
  const contact = (id: string, cls: Contact['cls']): Contact => ({ id, x: 0, y: 0, heading: 0, speed: 0, cls });
  const camera = { worldToScreen: (p: { x: number; y: number }) => p, zoom: 1 };

  it('resolves a plate for every synced human AND every drone in a big reveal-shaped frame', () => {
    const nameplates = new NameplateLayer(stubLayer());
    const views = new ContactViews(stubLayer(), nameplates);
    const store = new ContactStore();

    const humans: Record<string, { name: string }> = {
      h1: { name: 'ace' },
      h2: { name: 'boss' },
      h3: { name: 'zed' },
    };
    const droneIds = ['d1', 'd2'];

    store.pushFrame(0, [
      ...Object.keys(humans).map((id) => contact(id, DEFAULT_CLASS_ID)),
      ...droneIds.map((id) => contact(id, 'droneSmall')),
    ]);

    const plates = { nameOf: (id: string) => humans[id]?.name ?? null, camera, pad: 8 };
    views.render(store, 0, 0, 16, enemyIs, plates);

    // Nothing in the batch was skipped — every human AND every drone latched.
    for (const id of [...Object.keys(humans), ...droneIds]) expect(nameplates.has(id)).toBe(true);

    // Captains: uppercase callsign in the enemy relation stroke's text-safe variant.
    for (const h of Object.values(humans)) {
      const rec = textLog.find((t) => t.text === h.name.toUpperCase());
      expect(rec).toBeDefined();
      expect(rec!.style.fill).toBe(textSafe(ENEMY));
    }

    // Drones: the fixed drone label (never a roster/session id) in drone-outline grey.
    const droneRecs = textLog.filter((t) => t.text === DRONE_TEXT);
    expect(droneRecs).toHaveLength(droneIds.length);
    for (const r of droneRecs) expect(r.style.fill).toBe(C.droneOutline);
  });

  // The deliberate id-leak guard already pinned above (`resolvePlate — the latch
  // gate`, "a captain with an unsynced name does NOT resolve") carries into
  // the reveal unchanged: the "every hull" property above is scoped to hulls WITH
  // a resolved roster entry. An unsynced human is excluded from that set BY
  // DESIGN — never falls back to its session id — so it must not gain a plate
  // just because the reveal put many more contacts on screen at once.
  it('a captain whose name never synced still resolves NO plate inside a large reveal frame', () => {
    const nameplates = new NameplateLayer(stubLayer());
    const views = new ContactViews(stubLayer(), nameplates);
    const store = new ContactStore();

    const [first, second] = SHIP_CLASS_IDS;
    store.pushFrame(0, [contact('ace', first), contact('ghost', second), contact('d1', 'droneSmall')]);
    const plates = { nameOf: (id: string) => (id === 'ace' ? 'ace' : null), camera, pad: 8 };
    views.render(store, 0, 0, 16, enemyIs, plates);

    expect(nameplates.has('ace')).toBe(true); // synced human: plates
    expect(nameplates.has('d1')).toBe(true); // drone: always resolvable
    expect(nameplates.has('ghost')).toBe(false); // unsynced human: no plate, ever
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
    // CURRENT behavior: place() re-shows whenever alpha>0, so own-plate
    // discipline relies on `main.ts` calling `place` only where the plate is
    // meant to be seen. It is NOT true that updateOwnPlate stops while
    // spectating (the stale claim this comment used to make): since Story 5.3
    // `renderSpectate` calls it every frame for the WRECK, and hides the own
    // plate only where there is no wreck to label. This pins the re-show
    // behavior, not a guarantee about who calls it.
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
