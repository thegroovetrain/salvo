// THE AGGRO BRACKET, END TO END THROUGH THE RENDERER (Story 5.6, amendment 39).
//
// render/aggro.test.ts pins the pure look and the mark's own state machine; this
// file pins the WIRING — that `Contact.aggro` reaching the ContactStore actually
// produces a bracket on the right hull, that losing the key breaks it, that the
// audio cue fires exactly once per transition, and that a hull we never locked
// on to pays nothing at all.
//
// jsdom has no canvas text metrics, so Pixi's Text cannot rasterize here (every
// other client render test constructs only Graphics). Partial-mock pixi.js —
// keep the real Container/Graphics scene graph, swap ONLY Text for a metric-free
// stub, exactly as nameplates.test.ts does.

import { describe, it, expect, vi } from 'vitest';
import type { Container } from 'pixi.js';
import type { Contact } from '@salvo/shared';

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
    }
    destroy(): void {}
  }
  return { ...actual, Text: StubText };
});

const { ContactViews } = await import('../render/contacts.js');
const { NameplateLayer } = await import('../render/nameplates.js');
const { ContactStore } = await import('../net/snapshots.js');
const { Container: PixiContainer } = await import('pixi.js');
const { CLIENT_CONFIG } = await import('../config.js');

const A = CLIENT_CONFIG.aggro;

const camera = { worldToScreen: (p: { x: number; y: number }) => p, zoom: 1 };
const plates = { nameOf: (): string | null => null, camera, pad: 8 };
const rosterIndex = (): number | null => null;

const hunter = (aggro?: true): Contact[] => [
  aggro
    ? { id: 'f1', x: 40, y: -20, heading: 0, speed: 10, cls: 'droneSmall', aggro }
    : { id: 'f1', x: 40, y: -20, heading: 0, speed: 10, cls: 'droneSmall' },
];

interface Rig {
  layer: Container;
  views: InstanceType<typeof ContactViews>;
  store: InstanceType<typeof ContactStore>;
  cues: string[];
  /** How many Graphics live on the ship layer (one per hull view, plus one per
   *  bracket that has ever been armed). */
  children: () => number;
}

/** The nameplate layer is a bare add/remove sink — the stub Text is not a real
 *  Pixi child and a real Container would try to wire events onto it. Plates are
 *  nameplates.test.ts's subject; here they are only in the way. */
const plateSink = (): Container => ({ addChild() {}, removeChild() {} }) as unknown as Container;

function rig(): Rig {
  const layer = new PixiContainer();
  const cues: string[] = [];
  const views = new ContactViews(layer, new NameplateLayer(plateSink()), (k) => cues.push(k));
  return { layer, views, store: new ContactStore(), cues, children: () => layer.children.length };
}

describe('ContactViews — the aggro bracket is wired to Contact.aggro', () => {
  it('a hull that has NEVER locked on pays nothing: no Graphics, no cue', () => {
    const r = rig();
    r.store.pushFrame(0, hunter());
    r.views.render(r.store, 0, 0, 16, rosterIndex, plates);
    expect(r.children()).toBe(1); // the hull view alone
    expect(r.cues).toEqual([]);
  });

  it('an aggro\'d contact grows a bracket at the hull\'s pose and sounds ONE lock', () => {
    const r = rig();
    r.store.pushFrame(0, hunter(true));
    r.views.render(r.store, 0, 0, 16, rosterIndex, plates);
    expect(r.children()).toBe(2); // hull + bracket
    expect(r.cues).toEqual(['acquired']);
    // The mark rides the SAME sample the hull drew, so the two cannot separate.
    const [hull, bracket] = r.layer.children;
    expect(bracket.position.x).toBe(hull.position.x);
    expect(bracket.position.y).toBe(hull.position.y);
    expect(bracket.visible).toBe(true);

    // Held frames re-fire nothing.
    r.store.pushFrame(50, hunter(true));
    r.views.render(r.store, 50, 50, 16, rosterIndex, plates);
    expect(r.cues).toEqual(['acquired']);
  });

  it('losing the key breaks the bracket, sounds ONE release, and clears', async () => {
    const r = rig();
    r.store.pushFrame(0, hunter(true));
    r.views.render(r.store, 0, 0, 16, rosterIndex, plates);
    // The server stops sending `aggro` — the absence IS the de-aggro.
    r.store.pushFrame(50, hunter());
    r.views.render(r.store, 50, 50, 16, rosterIndex, plates);
    expect(r.cues).toEqual(['acquired', 'released']);
    const bracket = r.layer.children[1];
    expect(bracket.visible).toBe(true); // still mid-break

    // ...and once the break has run its ~400ms the mark stops drawing. The
    // driver clocks off `performance.now()`, so wait it out rather than
    // pretending the frame timestamps drive it.
    await new Promise((done) => setTimeout(done, A.breakMs + 60));
    r.store.pushFrame(100, hunter());
    r.views.render(r.store, 100, 100, 16, rosterIndex, plates);
    expect(bracket.visible).toBe(false);
    expect(r.cues).toEqual(['acquired', 'released']); // and nothing further
  });

  it('a PRUNED hunter reads as no longer locked — the bracket leaves with the hull', () => {
    const r = rig();
    r.store.pushFrame(0, hunter(true));
    r.views.render(r.store, 0, 0, 16, rosterIndex, plates);
    expect(r.cues).toEqual(['acquired']);
    // Stop hearing about it entirely and advance past the stale TTL. We have
    // stopped being TOLD it has us, so holding a bracket on the fading ghost
    // would be an assertion the wire is no longer making.
    const late = 10_000;
    r.views.render(r.store, late, late, 16, rosterIndex, plates);
    expect(r.cues).toEqual(['acquired', 'released']);
  });

  it('only the hull the mark is ON gets one — a bystander stays bare', () => {
    const r = rig();
    r.store.pushFrame(0, [
      ...hunter(true),
      { id: 'f2', x: -80, y: 10, heading: 0, speed: 10, cls: 'droneSmall' },
    ]);
    r.views.render(r.store, 0, 0, 16, rosterIndex, plates);
    // Two hull views + exactly ONE bracket.
    expect(r.children()).toBe(3);
    expect(r.cues).toEqual(['acquired']);
  });
});
