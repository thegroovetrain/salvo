// Remote-contact rendering: one ShipView per contact id, posed by sampling its
// SnapshotBuffer at serverNow() - interpDelay. Lifecycle wears the 150ms sight
// fade (fade.ts): a view fades IN when its id first appears in the ContactStore
// and fades OUT (holding its last pose) once the store prunes it, then is
// destroyed. A contact that drops from sight but was just painted hands off
// visually for free — the hull fades below the fog while its blip (chartRoot,
// above the fog) keeps decaying; no coupling needed.
//
// Story 1.12 (Regatta Hoist): each contact draws in its pilot's personal hue —
// resolved from the roster via the `rosterIndex` callback threaded into render().
// Drone contacts (drone hull ids) wear the greys; a human whose roster hue has
// not yet synced boots on the amber-hollow fallback and recolors once it lands
// (the `colored` latch avoids a per-frame redraw).

import type { Container } from 'pixi.js';
import { CONFIG, type HullId } from '@salvo/shared';
import type { ContactStore } from '../net/snapshots.js';
import { ShipView, contactStyle, isDroneHull, type ShipStyle } from './ships.js';
import { Fader } from './fade.js';

/** Start a contact's fade-out once unseen for this much server time (ms). */
export const CONTACT_STALE_MS = CONFIG.tick.interpDelayMs + 300;

/** Roster hue-index resolver: the contact's Regatta wheel index (0..19), or null
 *  for a drone/roster-miss/not-yet-synced pilot. */
export type RosterIndex = (id: string) => number | null;

interface FadingView {
  view: ShipView;
  fader: Fader;
  /** True once a non-fallback style (drone greys or a resolved personal hue) has
   *  been applied — stops the per-frame recolor probe. */
  colored: boolean;
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
   * destroy views that have fully faded out. `rosterIndex` resolves each
   * contact's personal hue (Story 1.12) — a drone/miss/not-yet-synced pilot
   * resolves to null (drone greys via the hull id, else the amber fallback).
   */
  render(
    store: ContactStore,
    renderTime: number,
    serverNow: number,
    dtMs: number,
    rosterIndex: RosterIndex,
  ): void {
    store.prune(serverNow, CONTACT_STALE_MS);
    // Only start/keep a view for ids whose buffer can actually produce a pose.
    // A respawn's frame-contacts push can land in the same tick as the spawn
    // event's buffer clear (see net/roomBindings.ts), leaving a briefly empty
    // buffer for a returning id; skipping view creation here (rather than
    // relying on push/clear ordering) means we never draw a fresh view at its
    // ShipView default (0,0) before real position data exists.
    for (const id of store.ids()) {
      const buf = store.get(id);
      if (buf && buf.size > 0) this.viewFor(id, store, rosterIndex).fader.show();
    }
    for (const [id, fv] of this.views) {
      if (!fv.colored) this.tryRecolor(id, fv, store, rosterIndex);
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

  /** A contact booted on the amber fallback because its roster hue had not synced
   *  yet — retry each frame until it resolves, then latch (`colored`). */
  private tryRecolor(id: string, fv: FadingView, store: ContactStore, rosterIndex: RosterIndex): void {
    const idx = rosterIndex(id);
    if (idx === null) return; // still unresolved — keep the fallback, retry next frame
    const style = hullStyleFor(store.classOf(id) ?? 'torpedoBoat', idx);
    fv.view.setColors(style.stroke, style.fill);
    fv.colored = true;
  }

  private viewFor(id: string, store: ContactStore, rosterIndex: RosterIndex): FadingView {
    let fv = this.views.get(id);
    if (!fv) {
      // A contact's hull id is static (set on first sighting) — render its true
      // silhouette. Drone ids (droneSmall/Medium/Large) render the legacy
      // chevron; classes render their board silhouette. Default guards a
      // never-sighted id; drone ids must NOT be sanitized to a ship class.
      const hullId = store.classOf(id) ?? 'torpedoBoat';
      const idx = rosterIndex(id);
      const style = hullStyleFor(hullId, idx);
      // Colored already iff a drone (greys) or the personal hue resolved now;
      // a still-null human hue leaves the amber fallback for tryRecolor to fix.
      fv = { view: new ShipView(style, hullId), fader: new Fader(false), colored: isDroneHull(hullId) || idx !== null };
      this.layer.addChild(fv.view.gfx);
      this.views.set(id, fv);
    }
    return fv;
  }
}

/** The style for a contact hull + resolved index (drone greys win; else the
 *  personal-hue style or amber fallback). Thin wrapper over ships.contactStyle. */
function hullStyleFor(hullId: HullId, index: number | null): ShipStyle {
  return contactStyle(hullId, index);
}
