// Remote-contact rendering: one hollow amber ShipView per contact id, posed
// by sampling its SnapshotBuffer at serverNow() - interpDelay. Lifecycle is
// plain add/remove for now — step 9/11's 150ms fade in/out replaces the
// instant addChild/destroy here (the store's appear/prune moments are the
// fade triggers).

import type { Container } from 'pixi.js';
import { CONFIG } from '@salvo/shared';
import type { ContactStore } from '../net/snapshots.js';
import { ShipView, CONTACT_STYLE } from './ships.js';

/** Drop a contact's view once unseen for this much server time (ms). */
export const CONTACT_STALE_MS = CONFIG.tick.interpDelayMs + 300;

export class ContactViews {
  private views = new Map<string, ShipView>();

  constructor(private readonly layer: Container) {}

  /** How many contact views are live (tests/debug). */
  get count(): number {
    return this.views.size;
  }

  /** Sample + draw every contact at `renderTime`; prune + drop stale views. */
  render(store: ContactStore, renderTime: number, serverNow: number): void {
    store.prune(serverNow, CONTACT_STALE_MS);
    for (const id of store.ids()) {
      const s = store.get(id)?.sampleAt(renderTime);
      if (!s) continue;
      this.viewFor(id).update(s.x, s.y, s.heading);
    }
    this.removeGone(store);
  }

  private viewFor(id: string): ShipView {
    let v = this.views.get(id);
    if (!v) {
      v = new ShipView(CONTACT_STYLE);
      this.layer.addChild(v.gfx);
      this.views.set(id, v);
    }
    return v;
  }

  private removeGone(store: ContactStore): void {
    for (const [id, v] of this.views) {
      if (store.get(id)) continue;
      v.destroy();
      this.views.delete(id);
    }
  }
}
