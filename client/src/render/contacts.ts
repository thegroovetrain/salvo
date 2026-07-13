// Remote-contact rendering: one hollow amber ShipView per contact id, posed
// by sampling its SnapshotBuffer at serverNow() - interpDelay. Lifecycle wears
// the 150ms sight fade (fade.ts): a view fades IN when its id first appears in
// the ContactStore and fades OUT (holding its last pose) once the store prunes
// it, then is destroyed. A contact that drops from sight but was just painted
// hands off visually for free — the hull fades below the fog while its blip
// (chartRoot, above the fog) keeps decaying; no coupling needed.

import type { Container } from 'pixi.js';
import { CONFIG } from '@salvo/shared';
import type { ContactStore } from '../net/snapshots.js';
import { ShipView, CONTACT_STYLE } from './ships.js';
import { Fader } from './fade.js';

/** Start a contact's fade-out once unseen for this much server time (ms). */
export const CONTACT_STALE_MS = CONFIG.tick.interpDelayMs + 300;

interface FadingView {
  view: ShipView;
  fader: Fader;
}

export class ContactViews {
  private views = new Map<string, FadingView>();

  constructor(private readonly layer: Container) {}

  /** How many contact views are live, including fading ones (tests/debug). */
  get count(): number {
    return this.views.size;
  }

  /** Brief hit flash on a contact (no-op if not currently viewed). */
  flash(id: string): void {
    this.views.get(id)?.view.flash();
  }

  /** Tint a contact as sunk; it fades until the store prunes it. */
  markSunk(id: string): void {
    this.views.get(id)?.view.setDowned(true);
  }

  /** Restore a contact on (re)spawn. */
  markSpawn(id: string): void {
    this.views.get(id)?.view.setDowned(false);
  }

  /**
   * Sample + draw every contact at `renderTime`, advance fades by `dtMs`,
   * destroy views that have fully faded out.
   */
  render(store: ContactStore, renderTime: number, serverNow: number, dtMs: number): void {
    store.prune(serverNow, CONTACT_STALE_MS);
    // Only start/keep a view for ids whose buffer can actually produce a pose.
    // A respawn's frame-contacts push can land in the same tick as the spawn
    // event's buffer clear (see net/roomBindings.ts), leaving a briefly empty
    // buffer for a returning id; skipping view creation here (rather than
    // relying on push/clear ordering) means we never draw a fresh view at its
    // ShipView default (0,0) before real position data exists.
    for (const id of store.ids()) {
      const buf = store.get(id);
      if (buf && buf.size > 0) this.viewFor(id).fader.show();
    }
    for (const [id, fv] of this.views) {
      const s = store.get(id)?.sampleAt(renderTime);
      if (s) fv.view.update(s.x, s.y, s.heading);
      else if (!store.get(id)) fv.fader.hide(); // pruned: hold last pose, fade out
      fv.view.setFade(fv.fader.update(dtMs));
      if (fv.fader.hidden) {
        fv.view.destroy();
        this.views.delete(id);
      }
    }
  }

  private viewFor(id: string): FadingView {
    let fv = this.views.get(id);
    if (!fv) {
      fv = { view: new ShipView(CONTACT_STYLE), fader: new Fader(false) };
      this.layer.addChild(fv.view.gfx);
      this.views.set(id, fv);
    }
    return fv;
  }
}
