// Radar rendering: the rotating sweep wedge on the own ship, the pooled
// phosphor blips it paints, and the own-ship range rings. All of it lives in
// chartRoot (fog-immune, camera-transformed), so blips/sweep stay readable
// over the fogged ocean while remaining in world coordinates.
//
// TWO RADAR GRAMMARS LIVE HERE (cycle 51, amendments 62-70 + 63), selected by the
// SERVER and announced once in the welcome handshake. The room picks one for the
// whole match, so `BlipEvent` is a TAGLESS union and this file narrows on the
// announced mode — never by probing which fields an event carries.
//
// `silhouette` — THE SHIPPED STORY 4.2 GRAMMAR (FR14, amendments 7-13), the
// default and byte-identical to the pre-cycle build. A paint is not an anonymous
// dot: each blip draws the contact's TRUE-SCALE hull silhouette at its true
// position and heading, using the SHARED `hullSilhouette()` polygon verbatim
// (the same one the hull renderer draws and the server hit-tests: UX-DR9, the
// silhouette IS the hitbox). No blip-specific geometry exists — no per-class
// pixel table, no floor-clamp, no exaggerated notch; at true scale a 124u
// battleship and a 100u torpedo boat are unmistakable without them. Three
// grammars ride on that outline:
//   • a NON-SCALING 1px hairline (`pixelLine`), so the outline reads the same
//     at every camera zoom while the FOOTPRINT scales like the real hull;
//   • the owner's LUMINANCE-FLOORED personal hue (drone grey for the roster
//     sentinel, amber on a roster miss — the FALLBACK_STYLE grammar);
//   • an ARPA speed vector (render/blipMarks.ts), astern for a reversing hull.
//
// `return` — THE REALISM GRAMMAR, reversed onto the scope on playtest evidence
// (amendment 62). A paint is an ECHO: a seeded irregular blob (render/
// returnMarks.ts) whose channels are SIZE and HUE — both return strength, the
// wire's aspect-projected `ext` attenuated by range here at render time — plus
// ALPHA (age). No silhouette, no personal hue, no ARPA vector — the wire does
// not carry class, heading or speed at all in this mode. Course and speed are
// DEMOTED from readout to inference, off ghost SPACING across the three
// persisted paints, which is precisely the justification amendment 9 gave that
// persistence in the first place.
//
// THE ECHO WEARS THE GARMIN SCALE, THE SWEEP DOES NOT (amendment 74, superseding
// amendment 65's monochrome clause for returns only). Weak → strong runs blue →
// green → yellow → red off `returnStrength`/`echoColor`; the sweep wedge, both
// range rings and every other piece of radar chrome stay phosphor green. Coast
// marks take the same scale — terrain is just a strong return, which is why a
// real marine plate is mostly green and red coastline. Islands paint their near
// arc here too (amendment 69) — pure client presentation off the map seed, no
// wire field, no server involvement.
//
// Blips persist independent of the beam graphic: each `blip` event acquires its
// own Graphics whose alpha/tint are pure functions of serverNow − blip.t
// (phosphor.ts). A repaint spawns a NEW blip while the old ones keep decaying —
// three sweeps of them now (amendment 9), so a contact leaves a plottable track
// whose ghost SPACING encodes its speed. Geometry is built once at acquire; the
// per-frame work is one alpha + one tint per live blip.
//
// Range rings (documented choice): the plan calls for CIC-style range rings;
// own-ship-centered beats map-centered for readability, so ONE ring at
// exactly sightRange and ONE at exactly radarRange follow the own ship here
// (kept subtle). The faint map-centered rings in map.ts remain as the chart
// grid. Thin Pixi adapter (not unit tested; the math lives in phosphor.ts and
// blipMarks.ts).

import { Graphics, Sprite } from 'pixi.js';
import type { Container } from 'pixi.js';
import {
  CONFIG,
  hullSilhouette,
  transformPolygon,
  type BlipEvent,
  type Circle,
  type HullId,
  type RadarGrammar,
  type ReturnBlipEvent,
  type SilhouetteBlipEvent,
  type Vec2,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { settings } from '../settings/store.js';
import { Pool, capOldest, capOldestByKey } from '../util/pool.js';
import { extentAlong, luminanceFloor, speedVector, type SpeedVector } from './blipMarks.js';
import { resolveHue, retryHue, type HueFor, type HueState } from './hueLatch.js';
import { blipAlpha, blipCool, blipLifeMs, sweepRotation } from './phosphor.js';
import {
  blobSeed,
  echoColor,
  echoSize,
  islandReturns,
  returnPolygon,
  returnStrength,
  type ReturnMark,
} from './returnMarks.js';
import { SWEEP_TEXTURE_RADIUS, bakeSweepTexture } from './textures.js';

export type { HueFor };

/**
 * Hard cap on live (decaying) blips. Radar paints arrive from network
 * messages regardless of render-loop cadence — a backgrounded tab (rAF
 * throttled/paused) can otherwise accumulate blips faster than they age out,
 * growing the pool unbounded. Oldest-inserted is evicted first.
 *
 * Sized for the worst legitimate case under 3-sweep persistence. Note the
 * per-contact cap keys on blip `id`, and a decoy buoy paints under its OWNER's
 * ship id (amendment 11) — so a hull and its own buoy SHARE one 3-paint budget
 * rather than holding two. The true ceiling is therefore 19 distinct ids × 3 =
 * 57, not the 114 a per-source reading would suggest. 128 keeps the backstop
 * comfortably above that: it stays a backstop, never the thing that trims a
 * legitimate scope (the per-contact cap does that).
 */
const MAX_LIVE_BLIPS = 128;
const RING_SIGHT_COLOR = CLIENT_CONFIG.colors.phosphor; // sight ring — HUD chart chrome
const RING_RADAR_COLOR = CLIENT_CONFIG.colors.silver; // radar ring — neutral linework

/** The `silhouette`-grammar payload of a paint: everything the 4.2 outline
 *  needs. Absent (null) on a `return`-grammar echo, whose whole point is that
 *  none of it reaches the client. */
interface BlipPose {
  cls: HullId; // hull id at paint time (drones carry a drone hull id)
  heading: number; // rad — at paint time
  speed: number; // u/s, signed — at paint time
  /** Firer-hue latch (render/hueLatch.ts): a paint whose owner is not on the
   *  roster yet boots amber and repaints once the hue resolves — and repaints
   *  again on a colorblind-assist table swap. */
  hue: HueState;
}

/** A `return` echo whose OBSERVER-RELATIVE geometry (bearing, range) is not
 *  resolved yet: the wire payload alone, held until a frame with a real own
 *  pose can turn it into a `ReturnMark`. Null once resolved — and a blip whose
 *  seed is still set is NOT DRAWN, because a blob posed from a guessed observer
 *  would be wrong for its whole ~12s decay, not for a frame. */
interface EchoSeed {
  x: number;
  y: number;
  ext: number;
}

interface LiveBlip {
  gfx: Graphics;
  /** Contact id — the TRACK key (3 paints per id) and the hue lookup key. For a
   *  coast mark it is the near-arc sample's own key instead. */
  id: string;
  t: number; // ms — server paint time (drives decay)
  /** `silhouette` pose + hue latch, or null for a `return`-grammar echo. This
   *  is the ONLY per-blip branch: a null pose means blob geometry in the Garmin
   *  strength color, a present one means outline + personal hue. Both cool
   *  through the same hue-preserving tint (amendment 74). */
  pose: BlipPose | null;
  /** Pending `return` geometry, or null when there is nothing to resolve (every
   *  `silhouette` blip, every coast mark, and every echo already posed). */
  echo: EchoSeed | null;
}

interface OwnPoint {
  x: number;
  y: number;
}

/** The decay inputs shared by every live mark for one frame. */
interface DecayFrame {
  life: number;
  floor: number;
  cool: number;
}

export class Radar {
  private readonly sweep: Sprite;
  private readonly rings: Graphics;
  private readonly pool: Pool<Graphics>;
  private readonly blips: LiveBlip[] = [];
  /** Coast returns (amendment 69) — a SEPARATE list with its own caps, so an
   *  island field can never evict a ship paint from the contact scope. Empty in
   *  `silhouette` mode. */
  private readonly marks: LiveBlip[] = [];
  /** Resolve a contact id → its paint color, or null on a roster miss (amber).
   *  Unused in `return` mode: an echo carries no identity to color. */
  private readonly hueFor: HueFor;
  /** The room's radar grammar, from the welcome handshake. Constant for the
   *  match — the server picks it, the client never infers it. */
  private readonly grammar: RadarGrammar;
  /** Client-known island field (map seed), for coast returns. `setIslands`
   *  supplies it; it is never on the wire and no server ever sees it. */
  private islands: readonly Circle[] = [];
  /** Scratch for the pose transform — consumed synchronously by the trace, so
   *  one array serves every blip (the 20Hz loop stays allocation-light). */
  private readonly scratch: Vec2[] = [];
  /** Latest authoritative sweep sample (angle at server time t). */
  private lastSweep: { angle: number; t: number } | null = null;
  /** Beam angle at the PREVIOUS frame — coast returns are born on the arc the
   *  beam swept between frames. Null whenever the sweep is hidden, so resuming
   *  never replays a whole revolution's worth of crossings at once. */
  private lastRotation: number | null = null;
  /** Last rendered own position — the observer an echo's bearing and range are
   *  measured from. A paint arrives on network cadence, not render cadence, so
   *  this is at most one frame stale (~16ms). Null before the first render (and
   *  in any later gap where the own pose is unknown), in which case an echo's
   *  geometry is DEFERRED rather than guessed — see `resolveEcho`. */
  private own: OwnPoint | null = null;
  // Effective vision numbers (Stage D upgrades), swapped via setRanges();
  // bases = CONFIG.vision. sweepPeriodMs drives both the wedge rotation rate
  // and the blip phosphor decay, so upgraded paints fade on the upgraded beat.
  private sightRange: number = CONFIG.vision.sight;
  private radarRange: number = CONFIG.vision.radar;
  private sweepPeriodMs: number = 60000 / CONFIG.vision.sweepRpm;

  constructor(
    blipLayer: Container,
    sweepLayer: Container,
    hueFor: HueFor,
    grammar: RadarGrammar = 'silhouette',
  ) {
    this.hueFor = hueFor;
    this.grammar = grammar;
    this.pool = new Pool<Graphics>(() => this.makeBlipGraphics(blipLayer));

    this.rings = new Graphics();
    this.rings.visible = false;

    this.sweep = new Sprite(bakeSweepTexture());
    this.sweep.anchor.set(0.5);
    this.sweep.blendMode = 'add';
    this.sweep.visible = false;

    sweepLayer.addChild(this.rings, this.sweep);
    this.applyRanges();
  }

  /**
   * Adopt the observer's effective vision stats (sight/radar range + sweep
   * period): redraws the range rings and rescales the baked sweep wedge to the
   * new radar radius. Cheap (one small Graphics redraw), called only when the
   * own stats actually change.
   */
  setRanges(sightRange: number, radarRange: number, sweepPeriodMs: number): void {
    this.sightRange = sightRange;
    this.radarRange = radarRange;
    this.sweepPeriodMs = sweepPeriodMs;
    this.applyRanges();
  }

  private applyRanges(): void {
    this.rings.clear();
    this.rings.circle(0, 0, this.sightRange).stroke({ width: 2, color: RING_SIGHT_COLOR, alpha: 0.12 });
    this.rings.circle(0, 0, this.radarRange).stroke({ width: 2, color: RING_RADAR_COLOR, alpha: 0.07 });
    this.sweep.scale.set(this.radarRange / SWEEP_TEXTURE_RADIUS);
  }

  /**
   * Adopt the client-known island field for coast returns (amendment 69).
   * Islands are rebuilt locally from `welcome.mapSeed`, so this carries ZERO
   * disclosure: no wire field, no server work, no perception-invariant surface.
   * A no-op in `silhouette` mode, where nothing reads it.
   */
  setIslands(islands: readonly Circle[]): void {
    this.islands = islands;
  }

  /** How many blips are currently decaying (debug/tests). */
  get liveBlips(): number {
    return this.blips.length;
  }

  /** How many coast returns are currently decaying (debug/tests). */
  get liveMarks(): number {
    return this.marks.length;
  }

  private makeBlipGraphics(layer: Container): Graphics {
    const g = new Graphics();
    g.blendMode = 'add';
    g.visible = false;
    layer.addChild(g);
    return g;
  }

  /** The live colorblind-assist state, read STRAIGHT from the store rather than
   *  cached per frame: a paint can arrive between frames (network cadence is
   *  not render cadence), and a cached flag would draw it at the wrong floor and
   *  then latch there. The assist no longer swaps a blip TEXTURE (the soft dot
   *  it existed for is gone): it raises the decayed alpha floor and the hue
   *  luminance floor — the only two channels a 1px `pixelLine` hairline has,
   *  since `pixelLine` IGNORES stroke width. A hue-table swap bumps
   *  `hueRevision()`, which is what repaints the already-live blips at the new
   *  floor (via `retryHue` in updateBlips). */
  private get assist(): boolean {
    return settings.current.colorblind;
  }

  /** Ingest the authoritative sweep angle from a frame (server time `t`). */
  onSweepSample(angle: number, t: number): void {
    this.lastSweep = { angle, t };
  }

  /**
   * A radar paint arrived: spawn an independent decaying blip at its position.
   *
   * `BlipEvent` is a TAGLESS union — the server picks one grammar for the whole
   * room and announces it in the welcome, so a per-event discriminator would be
   * dead weight on a 20Hz channel. The cast below is therefore keyed on the
   * ANNOUNCED mode and never on which fields happen to be present: field-probing
   * would be a second source of truth for the same question, and it would
   * mis-read a legitimate `ext: 0` echo.
   */
  onBlip(e: BlipEvent): void {
    if (this.grammar === 'return') this.addReturnBlip(e as ReturnBlipEvent);
    else this.addSilhouetteBlip(e as SilhouetteBlipEvent);
  }

  /** The `silhouette` (Story 4.2) acquire path — outline + hue + ARPA vector. */
  private addSilhouetteBlip(e: SilhouetteBlipEvent): void {
    const { color, colored, rev } = resolveHue(e.id, this.hueFor);
    const pose: BlipPose = {
      cls: e.cls,
      heading: e.heading,
      speed: e.speed,
      hue: { by: e.id, colored, rev },
    };
    const b = this.acquireBlip(e.x, e.y, e.id, e.t, pose);
    this.drawBlip(b, pose, color);
    // Per-track cap first (this id's 4th paint releases its oldest), then the
    // global backstop — so a flood on one contact can never evict another's.
    this.enroll(this.blips, b, CLIENT_CONFIG.blip.paintsPerContact, MAX_LIVE_BLIPS);
  }

  /**
   * The `return` acquire path for a CONTACT echo.
   *
   * Geometry is NOT baked here. A paint arrives on network cadence, so it can
   * land before the first render (join) or in any later gap where the own pose
   * is unknown — and `drawReturn` traces a blob exactly once, so a pose guessed
   * at acquire would be frozen into the mark for its ENTIRE decay: unattenuated,
   * and oriented on a bearing the contact does not hold. Deferring costs at most
   * one invisible frame on a fresh paint; guessing costs ~12s of a wrong scope.
   */
  private addReturnBlip(e: ReturnBlipEvent): void {
    const b = this.acquireBlip(e.x, e.y, e.id, e.t, null);
    b.echo = { x: e.x, y: e.y, ext: e.ext };
    b.gfx.visible = false; // nothing legitimate to draw until the pose resolves
    this.resolveEcho(b);
    this.enroll(this.blips, b, CLIENT_CONFIG.blip.paintsPerContact, MAX_LIVE_BLIPS);
  }

  /** The `return` acquire path for a COASTLINE mark (amendment 69). Its geometry
   *  needs no deferral: `paintIslands` only ever runs with a known own pose. */
  private addCoastMark(m: ReturnMark, t: number, perKey: number, cap: number): void {
    const b = this.acquireBlip(m.x, m.y, m.key, t, null);
    this.drawReturn(b, m);
    this.enroll(this.marks, b, perKey, cap);
  }

  /**
   * Resolve a pending echo the FIRST time an own pose is actually available,
   * draw it once, and reveal it. Frozen from then on — a phosphor paint is a
   * historical snapshot (amendment 70), so it must NOT re-pose as the observer
   * moves; the deferral exists only to stop a mark being born wrong.
   */
  private resolveEcho(b: LiveBlip): void {
    const own = this.own;
    const seed = b.echo;
    if (own === null || seed === null) return;
    b.echo = null;
    b.gfx.visible = true;
    this.drawReturn(b, this.shipMark(seed, b.id, own));
  }

  /** Add a fresh mark to its list and apply the per-track then global caps. */
  private enroll(list: LiveBlip[], b: LiveBlip, perKey: number, cap: number): void {
    list.push(b);
    this.retire(capOldestByKey(list, keyOf, b.id, perKey));
    this.retire(capOldest(list, cap));
  }

  /** Pool a Graphics for a fresh paint and reset the state a previous life left
   *  on it. `updateBlips` overwrites alpha/tint before the stage draws (our
   *  render callback runs at ticker priority NORMAL, Pixi's own render at LOW),
   *  so this is not reachable today — but resetting here makes "a fresh paint is
   *  fresh" a local invariant of acquire instead of a silent dependency on that
   *  ordering, which nothing else in this file would notice breaking. */
  private acquireBlip(x: number, y: number, id: string, t: number, pose: BlipPose | null): LiveBlip {
    const gfx = this.pool.acquire();
    gfx.position.set(x, y);
    gfx.visible = true;
    gfx.alpha = 1;
    gfx.tint = CLIENT_CONFIG.colors.white; // the un-cooled multiplier
    return { gfx, id, t, pose, echo: null };
  }

  /** A `return` paint as a render-frame echo: the wire carries pure aspect
   *  geometry (`ext`), and the OBSERVER-relative terms — bearing and range —
   *  are derived here, where both positions are known (ruling R2). `own` is a
   *  REQUIRED argument, not a field read: the only caller is `resolveEcho`,
   *  which has already established that a real pose exists. */
  private shipMark(seed: EchoSeed, key: string, own: OwnPoint): ReturnMark {
    const dx = seed.x - own.x;
    const dy = seed.y - own.y;
    return {
      x: seed.x,
      y: seed.y,
      ext: seed.ext,
      bearing: Math.atan2(dy, dx),
      dist: Math.hypot(dx, dy),
      key,
    };
  }

  /** Hide + pool a batch of retired blips. */
  private retire(gone: readonly LiveBlip[]): void {
    for (const b of gone) {
      b.gfx.visible = false;
      this.pool.release(b.gfx);
    }
  }

  /** Draw one paint: the true-scale silhouette rotated to its heading, plus the
   *  ARPA speed vector, as ONE path stroked in a single non-scaling hairline.
   *  The Graphics carries no rotation of its own — the polygon is pre-rotated
   *  through the shared `transformPolygon`, which keeps the silhouette and the
   *  vector in one frame of reference and the stroke free of any node
   *  transform. Called once at acquire (and again only if the hue resolves or
   *  the hue table swaps), never per frame. */
  private drawBlip(b: LiveBlip, pose: BlipPose, color: number): void {
    const g = b.gfx;
    g.clear();
    // `hullSilhouette` is a plain record lookup and returns undefined for an
    // id outside the registry, which would throw one frame later inside a
    // Colyseus message handler and take blip ingest down for the session. A
    // conforming server can't send one (the PV-20 gate gives both sides the
    // same HullId union), so this is purely a fail-soft on the ingest path:
    // draw SOMETHING readable rather than lose the scope.
    const local = hullSilhouette(pose.cls) ?? hullSilhouette('torpedoBoat');
    tracePolygon(g, transformPolygon(local, 0, 0, pose.heading, this.scratch));
    const mark = this.speedMark(local, pose.heading, pose.speed);
    if (mark !== null) traceVector(g, mark);
    const floor = this.assist ? CLIENT_CONFIG.blip.assistLumaFloor : CLIENT_CONFIG.blip.lumaFloor;
    g.stroke({ width: 1, pixelLine: true, color: luminanceFloor(color, floor), alpha: 1 });
  }

  /**
   * Draw one `return` echo: a seeded irregular blob, FILLED with a 1px edge, in
   * the Garmin strength color (amendment 74).
   *
   * Filled, not outlined, because that is what an echo is — and amendment 71
   * leaves the colorblind assist's outline-boost clause inert here for exactly
   * that reason (the assist's raised decayed-alpha floor still applies, via
   * `updateBlips`). The strength color is baked into the FILL AND STROKE, not
   * into the tint: the tint is now the hue-PRESERVING grey multiplier
   * (`blipCool`) in BOTH grammars, because the ramp this mark carries is an
   * information channel exactly as `silhouette` mode's personal hue is. Driving
   * it from the color-SETTING `blipTint` would erase the scale over the first
   * ~30% of the paint's life — the Story 4.2 trap, second grammar.
   *
   * Size and hue both read `ext`/`dist` and say the same thing twice, which is
   * the ruling's intent (a real set returns one echo, and its size and color are
   * two readings of it) and dual-codes the channel for CVD.
   *
   * Called ONCE at acquire and never again — the blob is stable for its whole
   * decay (amendment 70), and the per-frame cost stays one alpha + one tint.
   */
  private drawReturn(b: LiveBlip, m: ReturnMark): void {
    const o = CLIENT_CONFIG.blip.returns;
    const poly = returnPolygon(
      blobSeed(m.key, b.t),
      echoSize(m.ext, m.dist, this.radarRange, o),
      m.bearing,
      o,
    );
    const color = echoColor(returnStrength(m.ext, m.dist, this.radarRange, o), o.ramp);
    const g = b.gfx;
    g.clear();
    tracePolygon(g, poly);
    g.fill({ color, alpha: o.fillAlpha });
    g.stroke({ width: 1, pixelLine: true, color, alpha: 1 });
  }

  /** The speed vector for a paint, rooted on the hull outline in the direction
   *  of travel (astern for a reversing hull), or null when it is stopped. */
  private speedMark(local: readonly Vec2[], heading: number, speed: number): SpeedVector | null {
    const root = extentAlong(local, speed < 0 ? Math.PI : 0);
    return speedVector(heading, speed, root, CLIENT_CONFIG.blip.vector);
  }

  /** Drop every live blip at once (entering spectate: contacts go live/unfogged). */
  clearBlips(): void {
    this.retire(this.blips);
    this.blips.length = 0;
    this.retire(this.marks);
    this.marks.length = 0;
  }

  /** Per-frame: rotate/position the sweep + rings, paint the coastline the beam
   *  just crossed, then decay/release every live mark. */
  render(own: OwnPoint | null, serverNow: number): void {
    this.own = own;
    const rot = this.updateSweep(own, serverNow);
    if (rot !== null && own !== null) this.paintIslands(own, rot, serverNow);
    this.lastRotation = rot;
    this.updateBlips(serverNow);
  }

  /** Position/rotate the sweep + rings; returns the beam angle this frame, or
   *  null when the sweep is hidden (which also breaks the coast-return arc, so
   *  resuming can never replay a whole revolution of crossings at once). */
  private updateSweep(own: OwnPoint | null, serverNow: number): number | null {
    const visible = own !== null && this.lastSweep !== null;
    this.sweep.visible = visible;
    this.rings.visible = visible;
    if (!visible || own === null || this.lastSweep === null) return null;
    this.sweep.position.set(own.x, own.y);
    this.rings.position.set(own.x, own.y);
    const rot = sweepRotation(
      this.lastSweep.angle,
      this.lastSweep.t,
      serverNow,
      this.sweepPeriodMs,
    );
    this.sweep.rotation = rot;
    return rot;
  }

  /**
   * Coast returns for the arc the beam swept this frame (amendment 69).
   *
   * PURE PRESENTATION — the island field is rebuilt locally from the map seed,
   * so nothing here touches the wire or the perception invariant. Only the NEAR
   * arc paints, and only where the sightline is clear of the REST of the field:
   * the shadow behind an island is the existing rule (islands block every sensor
   * at all ranges), not a new one, and it applies to terrain exactly as it does
   * to hulls — hence the whole island list goes into the geometry.
   *
   * Cost per frame is one hypot + three angle compares PER ISLAND: a 60fps frame
   * advances the beam ~1.5° at 15rpm, so the near-arc sampling loop (and the LOS
   * work behind it) runs only for the island the beam is actually on — typically
   * none, at most one or two.
   */
  private paintIslands(own: OwnPoint, rot: number, serverNow: number): void {
    const from = this.lastRotation;
    if (this.grammar !== 'return' || from === null) return;
    const o = CLIENT_CONFIG.blip.returns.island;
    for (const isl of this.islands) {
      for (const m of islandReturns(isl, this.islands, own, from, rot, this.radarRange, o)) {
        this.addCoastMark(m, serverNow, o.paintsPerSample, o.maxMarks);
      }
    }
  }

  private updateBlips(serverNow: number): void {
    // A paint lives persistSweeps periods now, not one (amendment 9).
    const life = blipLifeMs(this.sweepPeriodMs);
    // Colorblind assist raises the minimum decayed-blip opacity (amendment 18):
    // a cooling contact stays readable instead of dimming into the fog. This
    // half of the assist survives into `return` mode; the outline-boost half is
    // inert there (amendment 71 — a blob has no outline).
    const assist = this.assist;
    const d: DecayFrame = {
      life,
      floor: assist ? CLIENT_CONFIG.blip.assistMinAlpha : CLIENT_CONFIG.blip.minAlpha,
      // The assist cools on a shallower ramp so the luminance floor baked into
      // the stroke color survives the paint's whole life (see config comment).
      cool: assist ? CLIENT_CONFIG.blip.assistCoolFloor : CLIENT_CONFIG.blip.coolFloor,
    };
    this.decay(this.blips, serverNow, d);
    this.decay(this.marks, serverNow, d);
  }

  /** Age one list of live marks: alpha, tint, and release at end of life.
   *
   *  BOTH GRAMMARS COOL THROUGH THE HUE-PRESERVING GREY MULTIPLIER (amendment
   *  74). They used to part company here — a posed blip kept its owner's hue
   *  under `blipCool` while a monochrome echo ran the color-SETTING `blipTint`.
   *  The echo now carries the Garmin strength ramp, so it has a hue to protect
   *  too, and `blipTint` would overwrite it with green inside the first ~30% of
   *  every paint. One ramp, both grammars: the tint scales every channel
   *  equally, leaving hue exact and saying only "how old". */
  private decay(list: LiveBlip[], serverNow: number, d: DecayFrame): void {
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      const age = serverNow - b.t;
      const alpha = blipAlpha(age, d.life, d.floor);
      if (alpha <= 0) {
        this.retire([b]);
        list.splice(i, 1);
        continue;
      }
      b.gfx.alpha = alpha;
      b.gfx.tint = blipCool(age, d.life, d.cool);
      const pose = b.pose;
      if (pose === null) {
        // A paint that arrived without an own pose is still waiting for one:
        // this is the first frame it can be posed correctly, so pose it here.
        if (b.echo !== null) this.resolveEcho(b);
        continue;
      }
      retryHue(pose.hue, this.hueFor, (color) => this.drawBlip(b, pose, color));
    }
  }
}

/** Track key for the per-track caps (contact id, or a coast sample's key). */
function keyOf(b: LiveBlip): string {
  return b.id;
}

/** Trace a closed world-frame polygon (offsets from the blip position). */
function tracePolygon(g: Graphics, poly: readonly Vec2[]): void {
  g.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) g.lineTo(poly[i].x, poly[i].y);
  g.closePath();
}

/** Trace the speed vector as two open subpaths: the shaft, then the arrowhead
 *  (barb → tip → barb). Open subpaths and a closed hull outline are different
 *  line grammars, which is what stops the vector reading as another hull edge. */
function traceVector(g: Graphics, v: SpeedVector): void {
  g.moveTo(v.from.x, v.from.y).lineTo(v.to.x, v.to.y);
  g.moveTo(v.barbs[0].x, v.barbs[0].y).lineTo(v.to.x, v.to.y).lineTo(v.barbs[1].x, v.barbs[1].y);
}
