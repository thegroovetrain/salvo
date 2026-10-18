// THE 9.13 BOT READOUTS (Story 9.13 wave 3) — the numbers Eric reads before
// and after the bot posture workover. MEASURED, NEVER JUDGED: no bar here has
// a PASS/FAIL, and none may be invented (spec AC: "the harness reports ... for
// Eric to read").
//
// A SIBLING OF BotCollector, not a rewrite of it: BotCollector owns the six
// spec-6.4 bars and the ledger-comparable land PROXY (`landTicks`), which stay
// byte-unchanged so a before/after across this story compares like with like.
// Everything here is ADDITIVE and rides into BotSample (per bot) and
// MatchSample (per match) through BotCollector.
//
// READ-ONLY, like every number in the harness: it reads ShipRecord, the World's
// public stores and the BotController's two read-only seams (`postureOf`,
// `lastTacticOf`), and writes only into its own tracks.

import {
  CONFIG,
  FOG_SOLID_DENSITY,
  isAfloat,
  type ShellFamily,
  type ShellState,
} from '@salvo/shared';
import type { World, ShipRecord } from '../../src/game/world.js';
import type { BotPosture } from '../../src/game/ai/types.js';
import { isFleetHull } from '../../src/game/participants.js';

/** Every posture, zero-filled. A Record literal, so a posture added to the
 *  union without a row here is a COMPILE error (the tally must stay exhaustive
 *  for "postureTicks sums to afloat ticks" to hold). */
const POSTURE_ZERO: Record<BotPosture, number> = {
  engage: 0,
  pursue: 0,
  disengage: 0,
  reposition: 0,
  farm: 0,
  ringRun: 0,
  ram: 0,
  kite: 0,
  hide: 0,
  hold: 0,
};

/** The named posture edges (spec Harness paragraph). One change may light more
 *  than one edge (→ hide is both `brokenOff` and `hid`). */
export type PostureEdge = 'opened' | 'brokenOff' | 'kited' | 'hid' | 'held' | 'rammed';

const EDGE_ZERO: Record<PostureEdge, number> = { opened: 0, brokenOff: 0, kited: 0, hid: 0, held: 0, rammed: 0 };

const FAMILY_ZERO: Record<ShellFamily, number> = { cannon: 0, mg: 0, flak: 0 };

const OPEN_SET: readonly string[] = ['pursue', 'engage'];
const BREAK_SET: readonly string[] = ['disengage', 'hide'];

export const emptyPostureTally = (): Record<BotPosture, number> => ({ ...POSTURE_ZERO });
export const emptyEdgeTally = (): Record<PostureEdge, number> => ({ ...EDGE_ZERO });
export const emptyFamilyTally = (): Record<ShellFamily, number> => ({ ...FAMILY_ZERO });

/** The edges a `prev → next` posture change lights (prev !== next). */
export function postureEdges(prev: string, next: string): PostureEdge[] {
  const out: PostureEdge[] = [];
  if (OPEN_SET.includes(next) && !OPEN_SET.includes(prev)) out.push('opened');
  if (BREAK_SET.includes(next) && !BREAK_SET.includes(prev)) out.push('brokenOff');
  if (next === 'kite') out.push('kited');
  if (next === 'hide') out.push('hid');
  if (next === 'hold') out.push('held');
  if (next === 'ram') out.push('rammed');
  return out;
}

/** The per-bot 9.13 readouts, spread flat into BotSample. Every field numeric
 *  (or a map of numbers) — `botHarness.test.ts` pins the shape. */
export interface BotReadouts {
  /** Afloat ticks with the AUTHORITATIVE `ship.landContact` set (the resolver's
   *  own answer; the geometric `landTicks` proxy is kept beside it). */
  groundedTicks: number;
  /** Unbroken landContact runs that lasted ≥ CONFIG.bots.stuckMs (the un-beach
   *  arming dwell) — a bot truly stuck, not a brush. Counted once per run. */
  stuckEpisodes: number;
  /** Afloat ticks outside `world.zoneLiveRing` (hypot from its centre > r). */
  outsideRingTicks: number;
  /** 1 iff this bot died to the storm while its last afloat tick was aground
   *  OR outside the live ring, else 0. */
  stormDeathStuck: number;
  /** 1 iff this bot died to the storm while its last afloat tick was aground
   *  (the narrower "beached in the storm" half of stormDeathStuck), else 0. */
  stormDeathAground: number;
  /** PARTICIPANT kills by the victim's `lastDamageSrc` at the `sunk` event
   *  (shell / burst / torpedo / mine / burn / storm / contact / grind;
   *  'unknown' when the record or the stamp is gone). Sums to `kills`. */
  killsBySource: Record<string, number>;
  /** Deck-gun shells this bot put in the air (cannon row, MG, flak — never a
   *  broadside, star, phosphor or fouling shell): the denominator for the
   *  two counters below. Per SHELL, so a two-barrel cannon click is two. */
  gunShells: number;
  /** Shells (any gun-pattern shell with an aim point) whose aim point fell
   *  within CONFIG.decoyBuoy.sizeU + CONFIG.vision.radarCellU of an ENEMY decoy
   *  buoy — the bait taken. */
  shotsAtDecoy: number;
  /** As shotsAtDecoy, but at the bot's OWN decoy (counted first; a shell near
   *  both is own). Should be ~0: the brain excludes its own buoys. */
  shotsAtOwnDecoy: number;
  /** Deck-gun shells whose aim distance from the muzzle exceeded the gun's
   *  `attenRangeU` (fired past full range, into the attenuated reach), per family. */
  shotsBeyondRange: Record<ShellFamily, number>;
  /** Deck-gun shells with NO `attenRangeU` — fired into the bot's own lit zone
   *  (amendment 187: no attenuation there; the flare-to-shoot doctrine). */
  litShots: number;
  /** Star shells launched (shells carrying the `lit` tag). */
  starShellsFired: number;
  /** Afloat ticks per deliberated posture (`BotController.postureOf`). Sums
   *  to `ticks` for every enrolled bot. */
  postureTicks: Record<BotPosture, number>;
  /** Named posture edges, counted on each tick-to-tick change. */
  postureTransitions: Record<PostureEdge, number>;
  /** Tactic-row ids by count of CHANGES in `lastTacticOf` (the same row firing
   *  on consecutive stamps without another in between counts once). */
  tacticCounts: Record<string, number>;
  /** Afloat ticks standing in solid fog (`world.fogDensityAt` ≥ FOG_SOLID_DENSITY = 0.5). */
  fogTicks: number;
  /** fogTicks split by the posture held on that tick. */
  fogTicksByPosture: Record<BotPosture, number>;
  /** Ability presses (`ship.lastActSeq` advance — consumed presses, refused
   *  ones included, like `shots`). */
  actPresses: number;
  /** Those presses by the item fitted in the pressed slot (`input.actSlot`
   *  read off `ship.loadout`); 'empty' for an empty / out-of-range slot. */
  pressesByItem: Record<string, number>;
  /** Activations that TOOK EFFECT, read off what they left behind: clouds
   *  (countermeasure), lit zones (starZone), burn zones (phosphorZone), foul
   *  zones (foulZone) by ownerId; `boost` / `hunker` window opens and `shield`
   *  raises off the hull's own stamps; `heal` off the `heal` event (HULL
   *  REPAIR). Decoys and mines are `decoysDeployed` / `minesLaid`. */
  activations: Record<string, number>;
}

export function emptyBotReadouts(): BotReadouts {
  return {
    groundedTicks: 0,
    stuckEpisodes: 0,
    outsideRingTicks: 0,
    stormDeathStuck: 0,
    stormDeathAground: 0,
    killsBySource: {},
    gunShells: 0,
    shotsAtDecoy: 0,
    shotsAtOwnDecoy: 0,
    shotsBeyondRange: emptyFamilyTally(),
    litShots: 0,
    starShellsFired: 0,
    postureTicks: emptyPostureTally(),
    postureTransitions: emptyEdgeTally(),
    tacticCounts: {},
    fogTicks: 0,
    fogTicksByPosture: emptyPostureTally(),
    actPresses: 0,
    pressesByItem: {},
    activations: {},
  };
}

/** Match-level 9.13 readouts, spread flat into MatchSample (bot lobbies only). */
export interface MatchReadouts {
  /** sim-seconds with ≤ 2 afloat non-fleet hulls (the endgame). */
  lastTwoS: number;
  /** Longest run inside that phase, sim-seconds, with no non-storm `dmg` event
   *  on either survivor (a dmg whose victim's lastDamageSrc reads 'storm' that
   *  tick does not break the run) — the "endgame stall". */
  endgameNoContactMaxS: number;
  /** Afloat PvE fleet-hull ticks with `ship.landContact` set. */
  droneGroundedTicks: number;
  /** Fleet hulls sunk with no killer and `lastDamageSrc === 'storm'`. */
  droneStormDeaths: number;
}

/** Mutable per-bot state behind a BotReadouts row. */
interface ReadoutTrack {
  out: BotReadouts;
  groundRun: number;
  wasAground: boolean;
  wasOutside: boolean;
  posture: string | null;
  tactic: string | null;
  actSeq: number;
  boostUntil: number;
  hunkerUntil: number;
  shieldUp: boolean;
}

const bump = (rec: Record<string, number>, key: string, by = 1): void => {
  rec[key] = (rec[key] ?? 0) + by;
};

/** True for a DECK-GUN ROW shell (the cannon's own volley, the MG, the flak):
 *  keyed on the family AND the row's own fields, because the broadside, the
 *  star / phosphor / fouling shells all fly `family: 'cannon'` and also lack
 *  `attenRangeU`. The tagged three carry `lit` / `burn` / `foul`; the broadside
 *  carries CONFIG.broadside.hits, never the cannon row's CONFIG.gun.hits. */
export function isDeckGunShell(s: ShellState): boolean {
  if (s.family === null || s.kind !== 'shell') return false;
  if (s.lit !== undefined || s.burn !== undefined || s.foul !== undefined) return false;
  return s.family !== 'cannon' || s.hits === CONFIG.gun.hits;
}

/** Ticks a landContact run must last to count as a stuck episode. */
const stuckTicks = (): number => Math.max(1, Math.ceil(CONFIG.bots.stuckMs / CONFIG.tick.simDtMs));

export class BotReadoutCollector {
  private readonly tracks = new Map<string, ReadoutTrack>();
  /** Ids seen LAST tick per store — a first sighting is a new entity. Rebuilt
   *  every tick from the live store, so it is bounded by what is live. */
  private seen: Record<'shell' | 'cloud' | 'lit' | 'burn' | 'foul', Set<string>> = {
    shell: new Set(),
    cloud: new Set(),
    lit: new Set(),
    burn: new Set(),
    foul: new Set(),
  };
  private readonly match: MatchReadouts = { lastTwoS: 0, endgameNoContactMaxS: 0, droneGroundedTicks: 0, droneStormDeaths: 0 };
  private lastTwoTicks = 0;
  private gapTicks = 0;
  private maxGapTicks = 0;

  constructor(botIds: readonly string[]) {
    for (const id of botIds) {
      this.tracks.set(id, {
        out: emptyBotReadouts(),
        groundRun: 0,
        wasAground: false,
        wasOutside: false,
        posture: null,
        tactic: null,
        actSeq: 0,
        boostUntil: 0,
        hunkerUntil: 0,
        shieldUp: false,
      });
    }
  }

  /** One tick, AFTER BotCollector consumed the tick's events (so a storm
   *  victim's wasAground/wasOutside is still its last AFLOAT tick's). */
  observe(world: World): void {
    this.noteNewShells(world);
    this.noteNewZones(world);
    this.noteEvents(world);
    for (const [id, t] of this.tracks) {
      const ship = world.ships.get(id);
      if (ship === undefined || !isAfloat(ship.lifecycle)) continue;
      this.noteAfloat(world, id, t, ship);
    }
    this.noteMatch(world);
  }

  /** The victim path: a storm death while aground or outside the ring. */
  noteStormDeath(id: string): void {
    const t = this.tracks.get(id);
    if (t === undefined) return;
    if (t.wasAground || t.wasOutside) t.out.stormDeathStuck = 1;
    if (t.wasAground) t.out.stormDeathAground = 1;
  }

  /** The killer path: a participant kill, bucketed by the victim's last blow. */
  noteKill(killerId: string, victim: ShipRecord | undefined): void {
    const t = this.tracks.get(killerId);
    if (t !== undefined) bump(t.out.killsBySource, victim?.lastDamageSrc ?? 'unknown');
  }

  /** A deep copy of one bot's readouts (empty for an unknown id). */
  sample(id: string): BotReadouts {
    const r = this.tracks.get(id)?.out ?? emptyBotReadouts();
    return {
      ...r,
      killsBySource: { ...r.killsBySource },
      shotsBeyondRange: { ...r.shotsBeyondRange },
      postureTicks: { ...r.postureTicks },
      postureTransitions: { ...r.postureTransitions },
      tacticCounts: { ...r.tacticCounts },
      fogTicksByPosture: { ...r.fogTicksByPosture },
      pressesByItem: { ...r.pressesByItem },
      activations: { ...r.activations },
    };
  }

  matchSample(): MatchReadouts {
    const s = CONFIG.tick.simDtMs / 1000;
    return {
      ...this.match,
      lastTwoS: Math.round(this.lastTwoTicks * s * 10) / 10,
      endgameNoContactMaxS: Math.round(this.maxGapTicks * s * 10) / 10,
    };
  }

  private noteAfloat(world: World, id: string, t: ReadoutTrack, ship: ShipRecord): void {
    const o = t.out;
    this.noteGround(t, ship.landContact);
    const ring = world.zoneLiveRing;
    t.wasOutside = Math.hypot(ship.state.x - ring.cx, ship.state.y - ring.cy) > ring.r;
    if (t.wasOutside) o.outsideRingTicks += 1;
    const posture = world.bots.postureOf(id);
    if (posture !== null) {
      bump(o.postureTicks, posture);
      if (t.posture !== null && t.posture !== posture) {
        for (const e of postureEdges(t.posture, posture)) o.postureTransitions[e] += 1;
      }
      t.posture = posture;
    }
    if (world.fogDensityAt(ship.state.x, ship.state.y) >= FOG_SOLID_DENSITY) {
      o.fogTicks += 1;
      if (posture !== null) bump(o.fogTicksByPosture, posture);
    }
    const tactic = world.bots.lastTacticOf(id);
    if (tactic !== null && tactic !== t.tactic) bump(o.tacticCounts, tactic);
    t.tactic = tactic;
    this.notePresses(t, ship);
    this.noteHullStamps(t, ship);
  }

  private noteGround(t: ReadoutTrack, aground: boolean): void {
    t.wasAground = aground;
    if (!aground) {
      t.groundRun = 0;
      return;
    }
    t.out.groundedTicks += 1;
    t.groundRun += 1;
    if (t.groundRun === stuckTicks()) t.out.stuckEpisodes += 1;
  }

  private notePresses(t: ReadoutTrack, ship: ShipRecord): void {
    const diff = ship.lastActSeq - t.actSeq;
    t.actSeq = ship.lastActSeq;
    if (diff <= 0) return;
    t.out.actPresses += diff;
    const item = ship.loadout[ship.input.actSlot]?.equipmentId ?? 'empty';
    bump(t.out.pressesByItem, item, diff);
  }

  /** Window OPENS (a stamp that moved forward) and a shield going up. */
  private noteHullStamps(t: ReadoutTrack, ship: ShipRecord): void {
    if (ship.boostUntil > t.boostUntil) bump(t.out.activations, 'boost');
    if (ship.hunkerUntil > t.hunkerUntil) bump(t.out.activations, 'hunker');
    const up = ship.shield !== null;
    if (up && !t.shieldUp) bump(t.out.activations, 'shield');
    t.boostUntil = ship.boostUntil;
    t.hunkerUntil = ship.hunkerUntil;
    t.shieldUp = up;
  }

  private noteNewShells(world: World): void {
    const next = new Set<string>();
    for (const s of world.shells.values()) {
      next.add(s.id);
      if (this.seen.shell.has(s.id)) continue;
      const t = this.tracks.get(s.ownerId);
      if (t !== undefined) creditShell(world, t.out, s);
    }
    this.seen.shell = next;
  }

  private noteNewZones(world: World): void {
    this.creditStore('cloud', world.clouds.values(), 'countermeasure');
    this.creditStore('lit', world.litZones.values(), 'starZone');
    this.creditStore('burn', world.burnZones.values(), 'phosphorZone');
    this.creditStore('foul', world.foulZones.values(), 'foulZone');
  }

  private creditStore(
    store: 'cloud' | 'lit' | 'burn' | 'foul',
    entities: Iterable<{ id: string; ownerId: string }>,
    kind: string,
  ): void {
    const next = new Set<string>();
    for (const e of entities) {
      next.add(e.id);
      if (this.seen[store].has(e.id)) continue;
      const t = this.tracks.get(e.ownerId);
      if (t !== undefined) bump(t.out.activations, kind);
    }
    this.seen[store] = next;
  }

  private noteEvents(world: World): void {
    for (const e of world.tickEvents) {
      if (e.k === 'heal') {
        const t = this.tracks.get(e.id);
        if (t !== undefined) bump(t.out.activations, 'heal');
      } else if (e.k === 'sunk' && e.by === undefined) {
        const v = world.ships.get(e.id);
        if (v !== undefined && isFleetHull(v) && v.lastDamageSrc === 'storm') this.match.droneStormDeaths += 1;
      }
    }
  }

  /** Endgame clock + drone grounding (one pass over every hull). */
  private noteMatch(world: World): void {
    const survivors: ShipRecord[] = [];
    for (const ship of world.ships.values()) {
      if (!isAfloat(ship.lifecycle)) continue;
      if (isFleetHull(ship)) {
        if (ship.landContact) this.match.droneGroundedTicks += 1;
      } else {
        survivors.push(ship);
      }
    }
    if (survivors.length > 2) return;
    this.lastTwoTicks += 1;
    if (survivorsTookFire(world, survivors)) {
      this.gapTicks = 0;
      return;
    }
    this.gapTicks += 1;
    this.maxGapTicks = Math.max(this.maxGapTicks, this.gapTicks);
  }
}

/** True iff a survivor took a non-storm `dmg` this tick. */
function survivorsTookFire(world: World, survivors: readonly ShipRecord[]): boolean {
  for (const e of world.tickEvents) {
    if (e.k !== 'dmg') continue;
    const v = survivors.find((s) => s.id === e.id);
    if (v !== undefined && v.lastDamageSrc !== 'storm') return true;
  }
  return false;
}

/** The decoy radius a shell's aim point is matched within. */
const decoyReach = (): number => CONFIG.decoyBuoy.sizeU + CONFIG.vision.radarCellU;

/** Fold one newly launched shell into its owner's shot counters. */
function creditShell(world: World, o: BotReadouts, s: ShellState): void {
  if (s.lit !== undefined) o.starShellsFired += 1;
  noteDecoyAim(world, o, s);
  if (!isDeckGunShell(s) || s.family === null) return;
  o.gunShells += 1;
  if (s.attenRangeU === undefined) {
    o.litShots += 1;
    return;
  }
  if (s.targetX === null || s.targetY === null || s.originX === undefined || s.originY === undefined) return;
  if (Math.hypot(s.targetX - s.originX, s.targetY - s.originY) > s.attenRangeU) o.shotsBeyondRange[s.family] += 1;
}

function noteDecoyAim(world: World, o: BotReadouts, s: ShellState): void {
  if (s.targetX === null || s.targetY === null) return;
  const reach = decoyReach();
  let enemy = false;
  for (const d of world.decoys.values()) {
    if (Math.hypot(d.x - s.targetX, d.y - s.targetY) > reach) continue;
    if (d.ownerId === s.ownerId) {
      o.shotsAtOwnDecoy += 1;
      return;
    }
    enemy = true;
  }
  if (enemy) o.shotsAtDecoy += 1;
}
