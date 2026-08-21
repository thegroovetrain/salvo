// A NAME IS NEVER OBSCURED BY TERRAIN (this cycle). Eric: *"in game, names need
// to appear above all players and in front of islands, not behind. they should
// never be obscured by terrain."* — and, on the first draft of the stack, *"i
// think i should be able to see aiming reticles over it. Just not terrain."*
// Four surfaces changed, and this file pins all four:
//
//   A. THE NAMEPLATE CONTAINER BECAME A CHART LAYER, SEATED BETWEEN `ship` AND
//      `aim`. It was `plateRoot`, the SECOND root mounted, which put it under
//      EVERY chart layer — including `map`, whose island bodies and contour
//      bands are filled at `alpha: 1`, and `ship`. A callsign was painted over
//      by any island it crossed and by every hull silhouette. One array index
//      now carries both halves of the ruling: above `map` and `ship`, below
//      `aim`/`burstFx`/`sweep`.
//
//   B. ...WHICH COST THE FOG'S FEATHER, SO THE PLATE CARRIES IT ITSELF. Being
//      under the fog composite softened a plate as its hull approached the edge
//      of the bubble — which is what DESIGN.md's Nameplate row means by "they
//      fade in/out with truesight resolution". `chartRoot` is above `fogSprite`,
//      so the plate's alpha is now `fader × softness`, the SAME per-frame
//      `HullSoftness` product the hull (contacts.ts) and the aggro mark already
//      wear. Identical bill, identical payment, to epic-5 amendment 22's hull
//      lift — with ONE deliberate difference, pinned below: the feather is
//      sampled at the HULL's world pose, not at the plate's own offset
//      position, so a label fades with the thing it labels rather than
//      reproducing the screen-space composite exactly.
//
//   C. A SCREEN-SPACE LAYER INSIDE A CAMERA-TRANSFORMED ROOT. Plates are placed
//      in raw screen pixels by `camera.worldToScreen` and hold a constant 14px
//      at any zoom, so they cannot inherit the chart transform. `applyCamera`
//      writes its exact INVERSE onto the `plate` container, and the pin below is
//      the round trip: a child point must land back on itself.
//
//   D. THE ROOT ORDER IS NOW DECLARED DATA. It was an inline `addChild`
//      argument list inside a function that needs a live WebGL context, so it
//      was the one part of the scene's stacking no test could see —
//      `deferred-work.md` carried that as an open entry, and retiring the
//      `plateRoot` root is exactly the kind of change it left unguarded.
//      `createStage` now ITERATES the exported `STAGE_ROOT_ORDER`, and
//      `EVERY_ROOT_PLACED` turns "someone added a root and forgot the array"
//      into a compile error exactly as `EVERY_LAYER_PLACED` already does one
//      level down.
//
// The feather curve itself is UNCHANGED — `hullSightSoftness` is the fog
// texture's own two constants and nothing about it moved; what is new is that a
// plate consumes it.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { Container } from 'pixi.js';
import { CONFIG, type OwnShip } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import type { Camera } from '../render/camera.js';
import { hullSightSoftness } from '../render/fog.js';
import { NameplateLayer } from '../render/nameplates.js';
import { UpgradeMenu, offerView, type OfferView } from '../ui/upgradeMenu.js';
import { ContactViews } from '../render/contacts.js';
import { ContactStore } from '../net/snapshots.js';
import type { Contact } from '@salvo/shared';
import {
  applyCamera,
  CHART_LAYER_ORDER,
  EVERY_ROOT_PLACED,
  HUD_LAYER_ORDER,
  STAGE_ROOT_ORDER,
  WORLD_LAYER_ORDER,
} from '../render/stage.js';
import { FOG_FILL_ALPHA, HOLE_FEATHER_START } from '../render/textures.js';

const SIGHT = CONFIG.vision.sight;
const DAZZLE = CONFIG.starShells.dazzleSightFactor;

// jsdom has no canvas text metrics, so Pixi's Text cannot rasterize here (every
// other client render test constructs only Graphics). Partial-mock pixi.js the
// same way nameplates.test.ts does — keep the real scene graph (Container is
// used verbatim by the transform suite below), swap ONLY Text for a metric-free
// stub that records the alpha/visible writes `place` makes, which is the whole
// of what this file asks of the layer.
const textLog = vi.hoisted(() => [] as StubTextRecord[]);
interface StubTextRecord {
  alpha: number;
  visible: boolean;
  position: { x: number; y: number };
}
vi.mock('pixi.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pixi.js')>();
  class StubText {
    text: string;
    style: Record<string, unknown>;
    alpha = 1;
    visible = true;
    position = { x: 0, y: 0, set(x: number, y: number): void { this.x = x; this.y = y; } };
    anchor = { x: 0, y: 0, set(x: number, y: number): void { this.x = x; this.y = y; } };
    constructor(opts: { text: string; style: Record<string, unknown> }) {
      this.text = opts.text;
      this.style = { ...opts.style };
      textLog.push(this as unknown as StubTextRecord);
    }
    destroy(): void {}
  }
  return { ...actual, Text: StubText };
});

/** A stub scene-graph parent — addChild is the only method the layer calls. */
const stubLayer = (): Container => ({ addChild() {}, removeChild() {} }) as unknown as Container;

/** `client/index.html`, wherever the suite was invoked from. */
function readIndexHtml(): string {
  for (const p of ['index.html', 'client/index.html']) {
    try {
      return readFileSync(resolve(process.cwd(), p), 'utf8');
    } catch {
      // try the next candidate
    }
  }
  throw new Error('client/index.html not found from ' + process.cwd());
}

/** A minimal spendable refit view, so the band actually mounts and we can read
 *  the rung it declares. Mirrors upgradeMenu.test.ts's own fixture. */
function refitViewFixture(): OfferView {
  const you: OwnShip = {
    id: 'me', x: 0, y: 0, heading: 0, speed: 0, hp: 80, alive: true,
    ammo: [], sweep: 0, cls: 'torpedoBoat', pts: 1,
    offer: ['intelSweep', 'shipHull', 'gunBarrel', 'mineBlast'],
    boostUntil: 0, boons: [], lvl: 0, xp: 0, repairHp: 0,
  };
  const v = offerView(you, false, false, false);
  if (!v) throw new Error('fixture produced no spendable offer');
  return v;
}

describe('the declared CHART order: a name reads over terrain, under the reticle', () => {
  const at = (name: string): number => CHART_LAYER_ORDER.indexOf(name as never);

  it('seats `plate` ABOVE `ship` — the whole point, since `map` (opaque island '
    + 'fills) and `ship` were both painting over the callsign', () => {
    expect(at('plate'), 'the plate is a chart layer now').toBeGreaterThanOrEqual(0);
    expect(at('plate')).toBeGreaterThan(at('ship'));
    expect(at('plate')).toBeGreaterThan(at('map'));
    expect(STAGE_ROOT_ORDER as readonly string[], 'and is no longer a stage root')
      .not.toContain('plateRoot');
  });

  it("keeps `plate` BELOW the reticle, the burst rings and the sweep — Eric's "
    + 'second clause, and the hull lift\'s own rule extended to labels', () => {
    expect(at('plate')).toBeLessThan(at('aim'));
    expect(at('plate')).toBeLessThan(at('burstFx'));
    expect(at('plate')).toBeLessThan(at('sweep'));
  });

  it('leaves it directly between the two, so nothing slipped in on either side', () => {
    expect(at('plate')).toBe(at('ship') + 1);
    expect(at('aim')).toBe(at('plate') + 1);
  });

  it("does NOT disturb the hull lift's own seat: `ship` still sits directly "
    + 'above `blip`', () => {
    expect(at('ship')).toBe(at('blip') + 1);
    expect(WORLD_LAYER_ORDER as readonly string[], 'and hulls are still charted')
      .not.toContain('ship');
  });

  it('never reaches the HUD: the chrome bar, hotbar, vitals, vignette and '
    + 'foghorn chevrons still win over a floating callsign', () => {
    for (const l of HUD_LAYER_ORDER) expect(CHART_LAYER_ORDER as readonly string[]).not.toContain(l);
    expect(STAGE_ROOT_ORDER.indexOf('hudRoot'), 'and hudRoot is still the topmost root')
      .toBe(STAGE_ROOT_ORDER.length - 1);
  });
});

describe('the declared ROOT order (the gap deferred-work named)', () => {
  it('mounts world → fog → chart → hud, with the plate root retired', () => {
    expect(STAGE_ROOT_ORDER as readonly string[]).toEqual([
      'worldRoot', 'fogSprite', 'chartRoot', 'hudRoot',
    ]);
  });

  it('puts the chart (and therefore the plate) ABOVE the fog — the bill part B '
    + 'pays', () => {
    expect(STAGE_ROOT_ORDER.indexOf('chartRoot')).toBeGreaterThan(STAGE_ROOT_ORDER.indexOf('fogSprite'));
  });

  it('names every root exactly once, and the compile-time half agrees', () => {
    expect(new Set(STAGE_ROOT_ORDER).size, 'no root is mounted twice').toBe(STAGE_ROOT_ORDER.length);
    // ...and a `Stage` root missing from the array would make this `false` and
    // stop the build (the root-level sibling of EVERY_LAYER_PLACED).
    expect(EVERY_ROOT_PLACED).toBe(true);
  });

  it('leaves the world and HUD child orders alone — this cycle moved one layer', () => {
    expect(WORLD_LAYER_ORDER as readonly string[]).toEqual([
      'ocean', 'wake', 'projectile', 'mineWorld', 'buoyWorld',
    ]);
    expect(HUD_LAYER_ORDER as readonly string[]).toEqual(['vignette', 'hud', 'foghorn']);
  });
});

// A NAME MUST NOT COVER A MENU EITHER (Eric, 2026-08-21: *"make extra sure that
// things like the upgrade and settings menu are not obscured by the name"*).
// Two independent mechanisms hold that, one per side of the canvas boundary, and
// neither was asserted anywhere before this cycle — the whole point of the ask is
// that a plate is now ALLOWED to draw over things it never could, so the list of
// things it still may not draw over wants a pin rather than an argument.
describe('a plate can never obscure the chrome — both mechanisms, pinned', () => {
  it('PIXI SIDE: `chartRoot` sits below `hudRoot`, so EVERY Pixi HUD surface '
    + 'outranks a plate — the chrome bar, hotbar, vitals, XP rail, the hotbar '
    + "slot tooltip, the storm vignette and the foghorn chevrons", () => {
    expect(STAGE_ROOT_ORDER.indexOf('chartRoot')).toBeLessThan(STAGE_ROOT_ORDER.indexOf('hudRoot'));
    // ...and the plate really is inside chartRoot rather than a root of its own,
    // which is what makes the line above cover it.
    expect(CHART_LAYER_ORDER as readonly string[]).toContain('plate');
    expect(STAGE_ROOT_ORDER as readonly string[]).not.toContain('plateRoot');
  });

  it('DOM SIDE: the refit window really does declare a positive z-index, so it '
    + 'stacks above the canvas the plate is drawn into', () => {
    const menu = new UpgradeMenu(() => {});
    menu.toggle(refitViewFixture());
    const panel = document.getElementById('upgrade-menu');
    expect(panel, 'the band mounted').not.toBeNull();
    expect(Number(panel!.style.zIndex), 'the ratified refit rung').toBeGreaterThan(0);
    expect(panel!.parentElement, 'a sibling of #app, not a child of the canvas')
      .toBe(document.body);
  });

  it("DOM SIDE: settings' rung is positive too, and it is the ONE rung that is a "
    + 'config value (the rest are literals pointing back at it)', () => {
    expect(CLIENT_CONFIG.settings.zIndex).toBeGreaterThan(0);
  });

  it('DOM SIDE: ...and the canvas host declares NO z-index, which is the whole '
    + 'reason every one of those rungs wins', () => {
    // `#app { position: fixed; inset: 0 }` with NO z-index paints as a
    // z-index:auto positioned element — below every positive-z sibling, per the
    // CSS painting order. Giving it a rung (or lifting the canvas itself) would
    // put nameplates over the refit window and the settings panel in one edit,
    // with nothing else in the codebase objecting. THIS is that objection.
    // Resolved from cwd rather than `import.meta.url`: Vite rewrites module
    // URLs, so `new URL(..., import.meta.url)` is not a file: URL here. The
    // suite is run both from the repo root and from `client/`, so try both.
    const html = readIndexHtml();
    const appRules = html.match(/#app[^{]*\{[^}]*\}/g) ?? [];
    expect(appRules.length, 'the #app rules are still in index.html').toBeGreaterThan(0);
    for (const rule of appRules) {
      expect(rule, `no z-index in: ${rule}`).not.toMatch(/z-index/i);
    }
  });
});

describe("applyCamera puts the plate layer BACK into screen space", () => {
  // Only the four fields applyCamera reads. A stub rather than a real Camera on
  // purpose: the subject here is the inverse arithmetic, not Camera's clamps.
  const cam = (zoom: number, shake = { x: 0, y: 0 }): Camera => ({
    screenCenter: { x: 800, y: 450 },
    center: { x: 1234.5, y: -678.25 },
    zoom,
    shake,
  }) as unknown as Camera;

  /** PIXI'S OWN COMPOSITION, never a hand-rolled `position + scale · p`.
   *  Re-implementing the parent∘child math here would bake in the very
   *  assumption most likely to break later — that nothing ever writes a
   *  rotation, skew or pivot onto these containers — and the pin could not then
   *  see it. `getGlobalPosition()` walks the real transform chain and needs no
   *  renderer, so the assertion is against the engine rather than against our
   *  model of it. */
  const composed = (plate: Container, p: { x: number; y: number }): { x: number; y: number } => {
    const probe = new Container();
    probe.position.set(p.x, p.y);
    plate.addChild(probe);
    const g = probe.getGlobalPosition();
    plate.removeChild(probe);
    return { x: g.x, y: g.y };
  };

  const run = (zoom: number, shake?: { x: number; y: number }) => {
    const world = new Container();
    const chart = new Container();
    const plate = new Container();
    chart.addChild(plate);
    applyCamera(cam(zoom, shake), world, chart, plate);
    return { world, chart, plate };
  };

  it('ROUND-TRIPS a child point back onto itself at every zoom in the live '
    + 'range — a plate placed at screen (x, y) renders at screen (x, y)', () => {
    // 0.26x is the omniscient reveal's whole-map framing; 1.5x the manual cap.
    for (const zoom of [0.26, 0.5, 1, 1.25, 1.5]) {
      const { plate } = run(zoom);
      for (const p of [{ x: 0, y: 0 }, { x: 640, y: 360 }, { x: 1599, y: 899 }]) {
        const out = composed(plate, p);
        expect(out.x, `x at zoom ${zoom}`).toBeCloseTo(p.x, 9);
        expect(out.y, `y at zoom ${zoom}`).toBeCloseTo(p.y, 9);
      }
    }
  });

  it('holds through CAMERA SHAKE, so a hit never walks the callsigns off their '
    + 'hulls', () => {
    const { plate } = run(1, { x: 17.5, y: -9.25 });
    const p = { x: 400, y: 300 };
    const out = composed(plate, p);
    expect(out.x).toBeCloseTo(p.x, 9);
    expect(out.y).toBeCloseTo(p.y, 9);
  });

  it('writes the plate scale as exactly 1/zoom, so the 14px text never scales', () => {
    const { plate } = run(0.5);
    expect(plate.scale.x).toBe(2);
    expect(plate.scale.y).toBe(2);
  });

  it('still writes the FORWARD transform onto world and chart, unchanged', () => {
    const { world, chart } = run(1.25);
    expect(world.scale.x).toBe(1.25);
    expect(chart.scale.x).toBe(1.25);
    expect(world.position.x).toBe(chart.position.x);
    expect(world.position.y).toBe(chart.position.y);
  });

  it('REJECTS a degenerate zoom BEFORE writing anything, leaving the whole '
    + 'camera at its last good state', () => {
    // 5e-324 is the trap the guard exists for: finite, positive, and its
    // reciprocal is Infinity. Infinity is the mirror trap: its reciprocal is a
    // perfectly finite 0, so a `Number.isFinite(inv)` test alone lets it past.
    //
    // THE ASSERTION IS ON THE COMPOSED RESULT, not on `plate.scale` alone, and
    // that is the whole point (review-gate finding). This cycle's first attempt
    // wrote the forward transform and THEN reset the plate — which asserts
    // green on `plate.scale === 1` while a NaN sitting in `chart.scale`
    // composes straight through the identity child and puts every callsign at
    // NaN. Only checking the round trip can tell the two apart.
    for (const bad of [0, -1, Number.NaN, Infinity, -Infinity, 5e-324]) {
      const world = new Container();
      const chart = new Container();
      const plate = new Container();
      chart.addChild(plate);
      // A GOOD FRAME FIRST — a virgin Container is already at identity, so
      // asserting on one proves nothing about the guard.
      applyCamera(cam(0.75), world, chart, plate);
      const p = { x: 640, y: 360 };
      expect(composed(plate, p).x, 'the good frame really did round-trip').toBeCloseTo(p.x, 6);

      applyCamera(cam(bad), world, chart, plate);
      const out = composed(plate, p);
      expect(out.x, `zoom ${bad}: still round-trips at the last good camera`).toBeCloseTo(p.x, 6);
      expect(out.y, `zoom ${bad}: still round-trips at the last good camera`).toBeCloseTo(p.y, 6);
      expect(chart.scale.x, `zoom ${bad}: the bad zoom never reached the chart`).toBeCloseTo(0.75, 12);
      expect(world.scale.x, `zoom ${bad}: nor the world`).toBeCloseTo(0.75, 12);
    }
  });
});

describe('the plate feather (what the fog composite used to do for a plate)', () => {
  const start = SIGHT * HOLE_FEATHER_START;

  it('is FULL ALPHA through the clear centre — a near contact is unchanged', () => {
    for (const d of [0, 10, start / 2, start]) {
      expect(hullSightSoftness(d, SIGHT), `at ${d}u`).toBe(1);
    }
  });

  it('lands at exactly `1 − FOG_FILL_ALPHA` at the rim — the fog composite\'s '
    + 'own endpoint, from the fog texture\'s own two constants', () => {
    expect(hullSightSoftness(SIGHT, SIGHT)).toBeCloseTo(1 - FOG_FILL_ALPHA, 12);
    expect(hullSightSoftness(SIGHT * 2, SIGHT), 'and holds past it')
      .toBeCloseTo(1 - FOG_FILL_ALPHA, 12);
  });

  it('NEVER REACHES ZERO, so the feather alone can never delete a callsign — '
    + 'the 150ms fade removes a plate, a feather only softens one', () => {
    for (let d = 0; d <= SIGHT * 3; d += 5) {
      expect(hullSightSoftness(d, SIGHT), `at ${d}u`).toBeGreaterThan(0);
    }
  });

  it('is MONOTONE DOWN, so the product with a decaying fader never INVERTS the '
    + 'fade-out of a pruned contact', () => {
    let prev = Infinity;
    for (let d = 0; d <= SIGHT * 1.2; d += 2) {
      const v = hullSightSoftness(d, SIGHT);
      expect(v, `non-increasing at ${d}u`).toBeLessThanOrEqual(prev + 1e-12);
      expect(v, `and stays in (0, 1] at ${d}u`).toBeLessThanOrEqual(1);
      prev = v;
    }
  });

  it('SCALES WITH THE OBSERVER: a dazzled bubble feathers a plate earlier', () => {
    const dazzled = SIGHT * DAZZLE;
    expect(hullSightSoftness(dazzled, dazzled)).toBeCloseTo(1 - FOG_FILL_ALPHA, 12);
    const d = SIGHT * 0.6;
    expect(hullSightSoftness(d, SIGHT), 'untouched for a base observer').toBe(1);
    expect(hullSightSoftness(d, dazzled), '...deep in the feather for a dazzled one')
      .toBeLessThan(1);
  });

  it('FAILS TOWARD THE NAME BEING READABLE on garbage input — a plate is a '
    + 'label, and an unwired path must never hide one', () => {
    expect(hullSightSoftness(Number.NaN, SIGHT)).toBe(1);
    expect(hullSightSoftness(100, Number.NaN)).toBe(1);
    expect(hullSightSoftness(100, 0), 'no bubble, nothing to feather against').toBe(1);
    expect(hullSightSoftness(100, -1)).toBe(1);
  });

  it('composes with the fader as a plain product, never a second evaluation', () => {
    // The exact arithmetic drivePlate performs, spelled out: mid-fade contact at
    // the rim of the bubble.
    const fader = 0.4;
    expect(fader * hullSightSoftness(SIGHT, SIGHT)).toBeCloseTo(0.4 * (1 - FOG_FILL_ALPHA), 12);
    // ...and the spectate / own-ship case: NO_SOFTENING is 1, so the plate is
    // exactly its fader.
    expect(fader * 1).toBe(fader);
  });
});

describe('NameplateLayer.place writes the composed alpha', () => {
  const layerWithPlate = (): NameplateLayer => {
    textLog.length = 0;
    const plates = new NameplateLayer(stubLayer());
    plates.set('ahab', 'AHAB', 0x00ff88);
    return plates;
  };

  it('stores the alpha it is handed VERBATIM — the composition happens in the '
    + 'driver, so the layer stays a dumb sink', () => {
    const plates = layerWithPlate();
    const alpha = 0.4 * hullSightSoftness(SIGHT, SIGHT);
    plates.place('ahab', 100, 50, alpha);
    expect(textLog[0].alpha).toBe(alpha);
    expect(textLog[0].position.x).toBe(100);
    expect(textLog[0].position.y).toBe(50);
  });

  it('sets `visible = alpha > 0`: a fully faded plate goes off, a feathered one '
    + 'stays on', () => {
    const plates = layerWithPlate();
    plates.place('ahab', 0, 0, hullSightSoftness(SIGHT, SIGHT));
    expect(textLog[0].visible, 'the rim is dim, not gone').toBe(true);
    plates.place('ahab', 0, 0, 0);
    expect(textLog[0].visible, 'the fader ran out').toBe(false);
  });

  it('is a no-op for an id with no latched plate — an unresolved human never '
    + 'gets one, whatever alpha the driver computes', () => {
    const plates = layerWithPlate();
    expect(() => plates.place('nobody', 1, 2, 0.5)).not.toThrow();
    expect(textLog).toHaveLength(1);
  });
});


// THE FEATHER MUST BE SAMPLED AT THE HULL'S WORLD POSE, and nothing else in this
// file can see that: every other assertion here exercises `hullSightSoftness` in
// isolation, so a `drivePlate` that fed it SCREEN pixels — or the plate's own
// offset Y — would ship with the whole suite green. That is the exact defect
// class this block exists for, so the camera below is deliberately a mapping
// where screen != world (x3 and translated), which makes a wrong-coordinate
// feather fail loudly instead of coincidentally agreeing.
describe('drivePlate samples the feather at the hull pose, and multiplies it in', () => {
  const WORLD = { x: 40, y: -20 };
  const droneContact = (): Contact[] => [
    { id: 'f1', x: WORLD.x, y: WORLD.y, heading: 0, speed: 10, cls: 'droneSmall' },
  ];
  // screen != world, by construction.
  const camera = {
    worldToScreen: (p: { x: number; y: number }) => ({ x: p.x * 3 + 1000, y: p.y * 3 - 500 }),
    zoom: 1,
  };
  const plateFrame = { nameOf: (): string | null => null, camera, pad: 8 };
  const rosterIndex = (): number | null => null;

  const drive = (softnessValue: number) => {
    textLog.length = 0;
    const shipLayer = new Container();
    const views = new ContactViews(shipLayer, new NameplateLayer(stubLayer()), () => {});
    const store = new ContactStore();
    const seen: { x: number; y: number }[] = [];
    const softness = (x: number, y: number): number => {
      seen.push({ x, y });
      return softnessValue;
    };
    store.pushFrame(0, droneContact());
    views.render(store, 0, 0, 16, rosterIndex, plateFrame, softness);
    return { seen, shipLayer };
  };

  it('passes the hull view\'s WORLD pose — never the projected screen point, '
    + 'never the plate\'s offset Y', () => {
    const { seen, shipLayer } = drive(1);
    expect(seen.length, 'the feather was consulted at all').toBeGreaterThan(0);
    const hull = shipLayer.children[0];
    for (const p of seen) {
      expect(p.x, 'sampled at the hull x').toBeCloseTo(hull.position.x, 9);
      expect(p.y, 'sampled at the hull y').toBeCloseTo(hull.position.y, 9);
    }
    // ...and that really is the WORLD pose, not the screen projection.
    expect(hull.position.x).toBeCloseTo(WORLD.x, 9);
    expect(camera.worldToScreen(WORLD).x, 'the two are genuinely different')
      .not.toBeCloseTo(WORLD.x, 3);
  });

  it('MULTIPLIES it into the plate alpha: halving the feather halves the '
    + 'callsign, whatever the fade-in is doing that frame', () => {
    // Asserted as a RATIO rather than an absolute, deliberately. A fresh view is
    // mid-fade-IN on its first frame (`Fader`), so the fader term is neither 1
    // nor a number this file should hard-code — pinning it would make this test
    // a hostage of fade timing it has no opinion about. The ratio isolates the
    // one thing that IS the subject: that `softness` enters as a plain factor.
    drive(1);
    const full = textLog[0].alpha;
    drive(0.5);
    const half = textLog[0].alpha;
    expect(full, 'the plate was placed at all').toBeGreaterThan(0);
    expect(half / full, 'softness enters as a plain multiplicative factor').toBeCloseTo(0.5, 9);
  });

  it('...and is a NO-OP at full softness, so the shipped look is unchanged '
    + 'anywhere inside the clear part of the bubble', () => {
    // NO_SOFTENING is `() => 1`, which is what spectate and the pre-feather
    // behaviour both use — the plate must then be exactly its fader.
    drive(1);
    const withFeather = textLog[0].alpha;
    textLog.length = 0;
    const shipLayer = new Container();
    const views = new ContactViews(shipLayer, new NameplateLayer(stubLayer()), () => {});
    const store = new ContactStore();
    store.pushFrame(0, droneContact());
    views.render(store, 0, 0, 16, rosterIndex, plateFrame); // softness omitted => NO_SOFTENING
    expect(textLog[0].alpha, 'a full feather changes nothing').toBeCloseTo(withFeather, 12);
  });
});
