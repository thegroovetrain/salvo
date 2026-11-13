// THE PLAIN HULL VIEWS (Story 11.2, Eric 2026-11-12, ruling R3) — one
// `PlainHullView` per handle of the store's plain channel (net/plainContacts.ts),
// posed by sampling its SnapshotBuffer at the same render time a full contact
// is sampled at, so both tiers wear the same snapshot interpolation. The same
// 150 ms sight fade as a contact (render/fade.ts) when a handle appears or its
// row stops arriving — EXCEPT across a TIER HANDOFF, where the outgoing view
// goes at once and the incoming one is born at full alpha (the store pairs the
// two), so one hull is never drawn twice. No nameplate, no relation repaint:
// the view knows nothing but a pose.

import type { Container } from 'pixi.js';
import type { PlainContactStore } from '../net/plainContacts.js';
import { Fader } from './fade.js';
import { PlainHullView } from './plainHull.js';

interface FadingPlain {
  view: PlainHullView;
  fader: Fader;
}

export class PlainHullViews {
  private views = new Map<string, FadingPlain>();

  constructor(private readonly layer: Container) {}

  /** Live plain views, including fading ones (tests/debug). */
  get count(): number {
    return this.views.size;
  }

  /** Sample + draw every plain hull at `renderTime`; advance fades by `dtMs`. */
  render(store: PlainContactStore, renderTime: number, dtMs: number): void {
    for (const h of store.ids()) {
      const buf = store.get(h);
      if (buf && buf.size > 0) this.viewFor(h, store).fader.show();
    }
    for (const [h, fp] of this.views) {
      if (store.takeRetiredByHandoff(h) || this.updateView(h, fp, store, renderTime, dtMs)) {
        fp.view.destroy();
        this.views.delete(h);
      }
    }
  }

  /** Pose + fade one view; true once it has fully faded out. */
  private updateView(h: string, fp: FadingPlain, store: PlainContactStore, renderTime: number, dtMs: number): boolean {
    const s = store.get(h)?.sampleAt(renderTime);
    if (s) fp.view.update(s.x, s.y, s.heading);
    else fp.fader.hide(); // the row stopped arriving: hold the last pose, fade out
    fp.view.setFade(fp.fader.update(dtMs));
    return fp.fader.hidden;
  }

  private viewFor(h: string, store: PlainContactStore): FadingPlain {
    let fp = this.views.get(h) ?? this.carryOver(h, store);
    if (!fp) {
      fp = { view: new PlainHullView(), fader: new Fader(store.takeBornByHandoff(h)) };
      this.layer.addChild(fp.view.gfx);
      this.views.set(h, fp);
    }
    return fp;
  }

  /** PLAIN RE-ENTRY: re-key the departed handle's view to `h` (one hull, never two). */
  private carryOver(h: string, store: PlainContactStore): FadingPlain | undefined {
    const from = store.takeCarriedFrom(h);
    const fp = from === undefined ? undefined : this.views.get(from);
    if (from === undefined || !fp) return undefined;
    this.views.delete(from);
    this.views.set(h, fp);
    return fp;
  }
}
