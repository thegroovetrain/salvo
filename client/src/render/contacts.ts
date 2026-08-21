// Remote-contact rendering: one ShipView per contact id, posed by sampling its
// SnapshotBuffer at serverNow() - interpDelay. Lifecycle wears the 150ms sight
// fade (fade.ts): a view fades IN when its id first appears in the ContactStore
// and fades OUT (holding its last pose) once the store prunes it, then is
// destroyed. A contact that drops from sight but was just painted hands off
// visually for free — the hull fades out while its blip keeps decaying; no
// coupling needed.
//
// TWO MULTIPLIERS DRIVE A HULL'S ALPHA, AND THEY ARE DIFFERENT THINGS. The Fader
// is a LIFECYCLE ramp (a contact appears / is pruned); the `softness` callback is
// a SPATIAL one — the sight-boundary feather hulls used to get for free from the
// fog composite, and lost this cycle when the `ship` layer moved ABOVE it so
// radar paint would stop covering the ships it represents (render/stage.ts).
// They compose multiplicatively into the one `setFade` channel. The NAMEPLATE
// deliberately keeps the Fader alone: plates still render below the fog, so
// softening them here would apply the same feather twice.
//
// Story 1.12 (Regatta Hoist): each contact draws in its pilot's personal hue —
// resolved from the roster via the `rosterIndex` callback threaded into render().
// Drone contacts (drone hull ids) wear the greys; a human whose roster hue has
// not yet synced boots on the amber-hollow fallback and recolors once it lands
// (the `colored` latch avoids a per-frame redraw).
//
// Story 1.13 (Class Silhouettes): each contact also floats a truesight nameplate
// (render/nameplates.ts). The plate rides this view's SAME snapshot sample (its
// last-applied world pose) projected to screen space, and its alpha is this
// view's Fader alpha every frame — so it fades in/out with the hull for free.
// Text + color latch once the roster name/hue resolve (`plated`); an unresolved
// human gets NO plate (never a session id) and retries per frame.

import type { Container } from 'pixi.js';
import { CONFIG, type HullId } from '@salvo/shared';
import type { ContactStore } from '../net/snapshots.js';
import type { Point } from './camera.js';
import { ShipView, contactStyle, hueRevision, isDroneHull } from './ships.js';
import { NameplateLayer, latchPlate, plateScreenY } from './nameplates.js';
import { Fader } from './fade.js';
import { AggroMark, bracketHalfSize } from './aggro.js';

/** Start a contact's fade-out once unseen for this much server time (ms). */
export const CONTACT_STALE_MS = CONFIG.tick.interpDelayMs + 300;

/** Roster hue-index resolver: the contact's Regatta wheel index (0..19), or null
 *  for a drone/roster-miss/not-yet-synced pilot. */
export type RosterIndex = (id: string) => number | null;

/**
 * The SPATIAL alpha multiplier for a hull at a world point — the sight-boundary
 * feather (render/fog.ts `hullSightSoftness`), with the caller's exemptions
 * applied (an owned star-shell zone reveals a hull beyond the bubble, and a
 * spectator has no bubble at all). main.ts owns it because only main.ts knows the
 * own pose, the effective sight radius and the active zones; this module only
 * multiplies it in.
 *
 * THREE CONSUMERS, ONE VALUE PER HULL PER FRAME: the silhouette, the aggro
 * bracket, and — since the plate rose above the fog this cycle — the nameplate.
 * All three read it at the SAME world point (the hull view's last-applied pose),
 * so a hull and its label can never disagree about how far into the feather they
 * are.
 */
export type HullSoftness = (x: number, y: number) => number;

/** No bubble, no softening — spectate frames are unfogged, and any caller that
 *  has no observer fails toward the hull being fully VISIBLE. */
export const NO_SOFTENING: HullSoftness = () => 1;

/** Per-frame nameplate driving context (Story 1.13). */
export interface PlateFrame {
  /** Roster callsign for a contact id, or null while unsynced — NOT the id
   *  fallback (an unresolved human gets no plate, never a session id). */
  nameOf: (id: string) => string | null;
  /** World→screen projector + current zoom (the same camera transform the hull
   *  gets), for screen-space plate placement. */
  camera: { worldToScreen(p: Point): Point; zoom: number };
  /** Screen-px gap above the hull (CLIENT_CONFIG.nameplate.padPx). */
  pad: number;
}

interface FadingView {
  view: ShipView;
  fader: Fader;
  /** The contact's hull id, cached at creation (a contact never changes hull
   *  mid-life). Used for the plate offset instead of re-reading store.classOf()
   *  per frame: once the store prunes the contact its class entry is DELETED, so
   *  a live re-read falls back to 'torpedoBoat' during the fade-out and pops the
   *  plate to the wrong (smaller) hull radius. */
  hull: HullId;
  /** True once a non-fallback style (drone greys or a resolved personal hue) has
   *  been applied — stops the per-frame recolor probe. */
  colored: boolean;
  /** True once the nameplate's text + color have resolved and been set —
   *  latched, so a later roster leave keeps the plate (position/alpha only). */
  plated: boolean;
  /** THE AGGRO BRACKET (Story 5.6, amendment 40), created LAZILY on this hull's
   *  first acquire and kept afterwards. Lazy because the overwhelming majority
   *  of contacts — every captain, and every fleet hull hunting somebody else —
   *  never wear one, and an eagerly-built Graphics per contact would put twenty
   *  empty display objects on the ship layer for nothing. */
  aggro: AggroMark | null;
}

/** A lock changed hands on some hull. `acquired` = a fleet ship just took US as
 *  its target; `released` = one just lost us. Fired at most once per hull per
 *  transition; the caller (main.ts) sounds the cue — this module owns no audio,
 *  because the one-way data flow runs net → sim → render and never back. */
export type AggroCue = (kind: 'acquired' | 'released') => void;

/**
 * Pure: the latch state a view must fall back to when the hue table is swapped
 * (Story 2.3 — the colorblind-assist toggle must be LIVE, not next-contact).
 * A drone keeps its `colored` latch: the greys are outside the personal-hue
 * table and never move. Everything else re-resolves on the next frame.
 */
export function relatchForHueSwap(isDrone: boolean): { colored: boolean; plated: boolean } {
  return { colored: isDrone, plated: false };
}

export class ContactViews {
  private views = new Map<string, FadingView>();
  /** The hue-table revision every live view is currently painted against. */
  private hueRev = hueRevision();
  /**
   * THIS FRAME's monotonic timestamp, sampled ONCE at the top of `render` and
   * read by every aggro mark driven under it.
   *
   * A per-frame field rather than a ninth `updateView` argument, and a field
   * rather than a `performance.now()` call per mark: the whole point of the
   * project's sample-exactly-once discipline is that two marks in one frame
   * cannot disagree about what instant it is (one bracket completing its snap
   * while its neighbour, armed on the same tick, has not).
   */
  private frameNowMs = 0;

  constructor(
    private readonly layer: Container,
    private readonly nameplates: NameplateLayer,
    /** Sounds the aggro lock/release stings. Defaults to a no-op so headless
     *  tests and any caller with no audio behave exactly as before. */
    private readonly aggroCue: AggroCue = () => {},
  ) {}

  /** How many contact views are live, including fading ones (tests/debug). */
  get count(): number {
    return this.views.size;
  }

  /** Brief hit flash on a contact (no-op if not currently viewed). */
  flash(id: string): void {
    this.views.get(id)?.view.flash();
  }

  /**
   * THE KILL FLASH (Story 5.2 fix): the confirmation beat on an enemy hull at
   * SINK-ENTRY. No-op if the hull is not currently viewed, exactly like
   * `flash`/`markSunk` — a sinking we witnessed but whose contact we do not
   * hold draws nothing rather than inventing a view at an invented position.
   */
  sinkFlash(id: string): void {
    this.views.get(id)?.view.sinkFlash();
  }

  /**
   * THE PROGRESSIVE SETTLE (Story 5.2 fix): drive a witnessed enemy's window
   * fraction, 0 at sink-entry → 1 at founder. Pushed per frame by
   * net/roomBindings.ts, which owns the deferred-wreck queue and the only exact
   * reading of the server clock. Silently no-ops for an unviewed hull.
   */
  setSink(id: string, progress: number): void {
    this.views.get(id)?.view.setSink(progress);
  }

  /** Tint a contact as sunk; it fades until the store prunes it. The terminal
   *  value of the settle above (`setSink(1)`), so the founder handover is a
   *  continuation rather than a step — see render/ships.ts `hullLook`. */
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
   * contact's personal hue (Story 1.12); `plates` drives the truesight
   * nameplate per contact (Story 1.13) — a drone/miss/not-yet-synced pilot
   * resolves to null (drone greys via the hull id, else the amber fallback).
   * `softness` is the frame's sight-boundary feather (see `HullSoftness`);
   * omitted, hulls draw at full strength, which is the pre-lift behaviour and
   * the right degradation for a caller with no observer.
   */
  render(
    store: ContactStore,
    renderTime: number,
    serverNow: number,
    dtMs: number,
    rosterIndex: RosterIndex,
    plates: PlateFrame,
    softness: HullSoftness = NO_SOFTENING,
  ): void {
    this.syncHueRevision();
    this.frameNowMs = performance.now();
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
      if (this.updateView(id, fv, store, renderTime, dtMs, rosterIndex, plates, softness)) {
        this.nameplates.remove(id);
        fv.view.destroy();
        fv.aggro?.destroy();
        this.views.delete(id);
      }
    }
  }

  /**
   * One int compare per FRAME (not per entity): if the colorblind-assist toggle
   * swapped the hue tables since the last frame, drop the per-view hull-color
   * and nameplate latches so every VISIBLE contact re-resolves into the new
   * family on this same frame. Without it the latches (which exist to stop a
   * per-frame recolor probe) would freeze already-sighted contacts and their
   * plates in the old palette until they died and re-appeared.
   */
  private syncHueRevision(): void {
    const rev = hueRevision();
    if (rev === this.hueRev) return;
    this.hueRev = rev;
    for (const fv of this.views.values()) Object.assign(fv, relatchForHueSwap(isDroneHull(fv.hull)));
  }

  /** Advance one view (recolor probe, pose, fade, nameplate); returns true once
   *  the view has fully faded out and should be destroyed. */
  private updateView(
    id: string,
    fv: FadingView,
    store: ContactStore,
    renderTime: number,
    dtMs: number,
    rosterIndex: RosterIndex,
    plates: PlateFrame,
    softness: HullSoftness,
  ): boolean {
    if (!fv.colored) this.tryRecolor(id, fv, store, rosterIndex);
    const s = store.get(id)?.sampleAt(renderTime);
    if (s) fv.view.update(s.x, s.y, s.heading);
    else if (!store.get(id)) fv.fader.hide(); // pruned: hold last pose, fade out
    // The feather reads the view's LAST-APPLIED pose (the same one the plate
    // rides), so a fading-out hull keeps softening against where it actually is
    // rather than snapping to full strength for its last 150ms.
    const p = fv.view.gfx.position;
    fv.view.setFade(fv.fader.update(dtMs) * softness(p.x, p.y));
    this.drivePlate(id, fv, rosterIndex, plates, softness);
    this.driveAggro(id, fv, store, softness);
    return fv.fader.hidden;
  }

  /**
   * THE AGGRO BRACKET (Story 5.6, amendment 40): drive this hull's mark from the
   * store's per-frame `aggro` truth, creating it on the first acquire.
   *
   * A PRUNED CONTACT READS AS NO LONGER LOCKED, and that is the honest answer
   * rather than a shortcut: `store.aggroOf` goes false the tick prune drops the
   * id, so a hull that sails out of sight while hunting us takes its bracket
   * with it — we have stopped being told, and a bracket held on a fading ghost
   * would be an assertion the wire is no longer making. The mark's alpha rides
   * the same fader × feather product the hull does, so the two leave together.
   */
  private driveAggro(id: string, fv: FadingView, store: ContactStore, softness: HullSoftness): void {
    const locked = store.aggroOf(id);
    if (!locked && fv.aggro === null) return; // the overwhelmingly common case
    const p = fv.view.gfx.position;
    if (fv.aggro === null) fv.aggro = new AggroMark(this.layer, bracketHalfSize(fv.hull));
    fv.aggro.place(p.x, p.y);
    const cue = fv.aggro.set(locked, this.frameNowMs);
    if (cue !== null) this.aggroCue(cue);
    fv.aggro.render(this.frameNowMs, fv.fader.alpha * softness(p.x, p.y));
  }

  /**
   * Latch (once) the plate's text/color, then position + fade it every frame.
   * Placement rides the hull view's last-applied WORLD pose (gfx.position) — the
   * SAME snapshot sample the hull drew — projected to screen.
   *
   * ALPHA IS `fader × softness`, THE SAME PRODUCT THE HULL AND THE AGGRO MARK
   * WEAR, and the feather half of it arrived this cycle because the plate moved
   * ABOVE the fog (render/stage.ts — Eric: a name is *"never obscured by
   * terrain"*). Under the shipped root order the fog composite physically painted
   * over `plateRoot`, so a plate near the rim of the sight bubble dimmed for
   * free; lifting it into `chartRoot` lifts it over `fogSprite` too, and
   * DESIGN.md's Nameplate row still promises plates fade with truesight
   * resolution. This is the identical bill epic-5 amendment 22 paid when the
   * hulls moved. The `softness` value is the frame's, computed ONCE per hull by
   * `updateView` — never a second evaluation here — and the fader half still
   * holds through the 150ms fade-out on prune, which the product can never
   * invert (softness ∈ (0, 1]).
   *
   * SAMPLED AT `gp` — THE HULL'S WORLD POSE — RATHER THAN AT THE PLATE'S OWN
   * POSITION, deliberately. The plate is drawn above the hull's bounding circle
   * (up to ~73u in world terms for a battleship at typical zoom, against an
   * 82.5u feather band), so a screen-space fog texture used to fade it by its
   * own position and this does not reproduce that. It reproduces something
   * better: the label fades WITH the hull it labels, which is the whole point
   * of the one-softness-per-hull contract above — a hull and its own callsign
   * can never disagree about how far into the feather they are. Feeding it the
   * projected `sc` here would be the classic wrong-coordinate bug and every
   * feather assertion would still pass, so `nameplatesAboveTerrain.test.ts`
   * pins the sample point directly against a camera where screen != world.
   */
  private drivePlate(
    id: string,
    fv: FadingView,
    rosterIndex: RosterIndex,
    plates: PlateFrame,
    softness: HullSoftness,
  ): void {
    if (!fv.plated) {
      const r = latchPlate(false, plates.nameOf(id), rosterIndex(id), isDroneHull(fv.hull));
      if (r.plate) this.nameplates.set(id, r.plate.text, r.plate.color);
      fv.plated = r.latched;
    }
    const gp = fv.view.gfx.position;
    const sc = plates.camera.worldToScreen({ x: gp.x, y: gp.y });
    const y = plateScreenY(sc.y, fv.hull, plates.camera.zoom, plates.pad);
    this.nameplates.place(id, sc.x, y, fv.fader.alpha * softness(gp.x, gp.y));
  }

  /** A contact booted on the amber fallback because its roster hue had not synced
   *  yet — retry each frame until it resolves, then latch (`colored`). */
  private tryRecolor(id: string, fv: FadingView, store: ContactStore, rosterIndex: RosterIndex): void {
    const idx = rosterIndex(id);
    if (idx === null) return; // still unresolved — keep the fallback, retry next frame
    const style = contactStyle(store.classOf(id) ?? 'torpedoBoat', idx);
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
      const style = contactStyle(hullId, idx);
      // Colored already iff a drone (greys) or the personal hue resolved now;
      // a still-null human hue leaves the amber fallback for tryRecolor to fix.
      fv = { view: new ShipView(style, hullId), fader: new Fader(false), hull: hullId, colored: isDroneHull(hullId) || idx !== null, plated: false, aggro: null };
      this.layer.addChild(fv.view.gfx);
      this.views.set(id, fv);
    }
    return fv;
  }
}
