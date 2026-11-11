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
  abilityFromCode,
  isAfloat,
  turretBears,
  turretMounts,
  type ShellFamily,
  type ShellState,
} from '@salvo/shared';
import type { World, ShipRecord } from '../../src/game/world.js';
import type { BotPosture } from '../../src/game/ai/types.js';

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
  /** Slot-0 gun shells this bot put in the air (the main battery and the
   *  secondaries since Story 10.4; the cannon row, MG, flak — never a
   *  broadside, star, phosphor or fouling shell): the denominator for the
   *  two counters below. Per SHELL, so a three-gun turret salvo is three. */
  gunShells: number;
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
  /** Those presses by the ability they named (`input.act` through the shared
   *  `abilityFromCode`, Story 10.5: shift / repair / smoke); 'unknown' for a
   *  code the shared table does not name. */
  pressesByAbility: Record<string, number>;
  /** Activations that TOOK EFFECT, read off what they left behind: clouds
   *  (countermeasure — the SMOKE ability), lit zones (starZone), burn zones
   *  (phosphorZone), foul zones (foulZone) by ownerId; `boost` / `hunker`
   *  window opens off the hull's own stamps; `heal` off the `heal` event
   *  (HULL REPAIR). Mines are `minesLaid`. */
  activations: Record<string, number>;
  /** GUNS BEARING (Story 10.12, the story's headline readout). Over the afloat
   *  ticks in which this bot has a LIVE target hull inside its own main-battery
   *  reach — read off WORLD TRUTH, as every readout here is: the NEAREST afloat
   *  non-self hull whose centre lies within `stats.equipment.mainBattery.rangeU`
   *  of the bot's centre (no line-of-fire or sight term; the bot need not have
   *  it plotted) — `gunsInReach` sums the hull's total main-battery guns and
   *  `gunsBearing` the guns on turrets whose arc holds that hull's centre per
   *  the shared `turretBears`, from the bot's real post-step pose. The share is
   *  gunsBearing / gunsInReach (a gun-tick share). */
  gunsBearing: number;
  gunsInReach: number;
  /** MINES SWEPT (Story 10.12): HOSTILE mines (another owner's) that left the
   *  water on a tick in which one of this bot's mine-hitting shells landed on
   *  their 10 u marker — see `BotReadoutCollector.noteSwept` for the exact
   *  attribution and its one blind spot. */
  minesSwept: number;
  /** HULL REPAIR at the press (Story 10.12): accepted presses (the `heal`
   *  event — one per press the World took, refused presses never emit it) and
   *  the sum of hp / maxHp read on the bot's LAST afloat tick before the press
   *  (the hull it decided on, before the instant heal). Mean = sum / count. */
  repairPresses: number;
  repairHullFracSum: number;
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
    shotsBeyondRange: emptyFamilyTally(),
    litShots: 0,
    starShellsFired: 0,
    postureTicks: emptyPostureTally(),
    postureTransitions: emptyEdgeTally(),
    tacticCounts: {},
    fogTicks: 0,
    fogTicksByPosture: emptyPostureTally(),
    actPresses: 0,
    pressesByAbility: {},
    activations: {},
    gunsBearing: 0,
    gunsInReach: 0,
    minesSwept: 0,
    repairPresses: 0,
    repairHullFracSum: 0,
  };
}

/** Match-level 9.13 readouts, spread flat into MatchSample (bot lobbies only). */
export interface MatchReadouts {
  /** sim-seconds with ≤ 2 afloat hulls (the endgame). */
  lastTwoS: number;
  /** Longest run inside that phase, sim-seconds, with no non-storm `dmg` event
   *  on either survivor (a dmg whose victim's lastDamageSrc reads 'storm' that
   *  tick does not break the run) — the "endgame stall". */
  endgameNoContactMaxS: number;
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
  /** hp / maxHp on the last afloat tick observed (null before the first). */
  hullFrac: number | null;
}

/** Last tick's view of a mine, for the swept attribution. */
interface MineSeen {
  x: number;
  y: number;
  ownerId: string;
}

/** Last tick's view of a mine-hitting shell (its owner and blast). */
interface ShellSeen {
  ownerId: string;
  burstRadius: number;
}

const bump = (rec: Record<string, number>, key: string, by = 1): void => {
  rec[key] = (rec[key] ?? 0) + by;
};

/** True for a SLOT-0 GUN shell — the captain's MAIN BATTERY (Story 10.4) and
 *  any `mg` / `flak` round (the secondaries fly `mg`):
 *  keyed on the family AND the row's own fields, because the broadside, the
 *  star / phosphor / fouling shells all fly `family: 'cannon'` and also lack
 *  `attenRangeU`. The tagged three carry `lit` / `burn` / `foul`. The cannon
 *  row is CONFIG.gun.hits. The main battery shares its mask object with the
 *  broadside, so it is told apart by the broadside's own rule — a broadside
 *  interceptor takes the shell's full damage (contactDamage === damage) and
 *  a broadside shell never carries `attenRangeU`; a main-battery shell has a
 *  smaller bodyblock or an attenuation reference. */
export function isDeckGunShell(s: ShellState): boolean {
  if (s.family === null || s.kind !== 'shell') return false;
  if (s.lit !== undefined || s.burn !== undefined || s.foul !== undefined) return false;
  if (s.family !== 'cannon' || s.hits === CONFIG.gun.hits) return true;
  return s.hits === CONFIG.mainBattery.hits && (s.attenRangeU !== undefined || s.contactDamage !== s.damage);
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
  /** Live mines and mine-hitting shells as of LAST tick (noteSwept). */
  private minesSeen = new Map<string, MineSeen>();
  private mineShellsSeen = new Map<string, ShellSeen>();
  private readonly match: MatchReadouts = { lastTwoS: 0, endgameNoContactMaxS: 0 };
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
        hullFrac: null,
      });
    }
  }

  /** One tick, AFTER BotCollector consumed the tick's events (so a storm
   *  victim's wasAground/wasOutside is still its last AFLOAT tick's). */
  observe(world: World): void {
    this.noteSwept(world);
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
      pressesByAbility: { ...r.pressesByAbility },
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
    noteGunsBearing(world, o, ship);
    t.hullFrac = hullFracOf(ship);
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
    bump(t.out.pressesByAbility, abilityFromCode(ship.input.act) ?? 'unknown', diff);
  }

  /** Window OPENS (a stamp that moved forward). */
  private noteHullStamps(t: ReadoutTrack, ship: ShipRecord): void {
    if (ship.boostUntil > t.boostUntil) bump(t.out.activations, 'boost');
    if (ship.hunkerUntil > t.hunkerUntil) bump(t.out.activations, 'hunker');
    t.boostUntil = ship.boostUntil;
    t.hunkerUntil = ship.hunkerUntil;
  }

  private noteNewShells(world: World): void {
    const next = new Set<string>();
    for (const s of world.shells.values()) {
      next.add(s.id);
      if (this.seen.shell.has(s.id)) continue;
      const t = this.tracks.get(s.ownerId);
      if (t !== undefined) creditShell(t.out, s);
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

  /** `heal` = an ACCEPTED HULL REPAIR press: the activation, and the hull
   *  fraction the bot pressed at (its last afloat reading — this runs before
   *  noteAfloat refreshes it). */
  private noteEvents(world: World): void {
    for (const e of world.tickEvents) {
      if (e.k !== 'heal') continue;
      const t = this.tracks.get(e.id);
      if (t === undefined) continue;
      bump(t.out.activations, 'heal');
      if (t.hullFrac === null) continue;
      t.out.repairPresses += 1;
      t.out.repairHullFracSum += t.hullFrac;
    }
  }

  /**
   * MINES SWEPT, attributed off world truth with no server seam. A mine leaves
   * the water by a trip, a chain, a captive launch or gunfire; only gunfire
   * spends its hp, and only a shell whose `hits` mask names `mine` can (World
   * landOnMines) — on the four hulls that is the SECONDARIES alone
   * (`CONFIG.mainBattery.hits` carries no mine bit, R3), so this IS "mines
   * swept by a bot's secondaries". A landing is published the same tick as
   * the owner's `sp` (a landing that touched no hull) or, for a BURST shell
   * only, `hc` (its blast also caught a hull; a direct shell that strikes a
   * hull never lands, so its `hc` is ignored) — at the point landOnMines
   * tests against. So a mine LAST SEEN last tick and GONE now is credited to
   * the first bot (in event order) that, this tick, both lost a mine-hitting
   * shell and published a landing within that shell's
   * `burstRadius + CONFIG.mine.hitRadiusU` of the mine's centre — never to the
   * mine's own layer (the sweep never shoots its own; popping one's own is the
   * friendly-fire exception, not a sweep).
   *
   * THE BLIND SPOT, stated: a mine that left the water for ANOTHER reason (a
   * trip, a chain) on the very tick a bot's shell landed on its marker is
   * credited to the shooter; a chain set off by a swept naval mine credits
   * only the mine the shell landed on. Both need two events on one 50 ms tick.
   */
  private noteSwept(world: World): void {
    const landedBy = this.mineShellsLanded(world);
    if (landedBy.size > 0) {
      for (const [id, m] of this.minesSeen) {
        if (world.mines.has(id)) continue;
        const who = sweeperOf(world, m, landedBy);
        if (who !== null) this.tracks.get(who)!.out.minesSwept += 1;
      }
    }
    this.minesSeen = new Map([...world.mines.values()].map((m) => [m.id, { x: m.x, y: m.y, ownerId: m.ownerId }]));
  }

  /** Bot id → the widest blast among its mine-hitting shells that left the
   *  water this tick (last tick's snapshot vs the live store); re-snapshots. */
  private mineShellsLanded(world: World): Map<string, number> {
    const landed = new Map<string, number>();
    for (const [id, s] of this.mineShellsSeen) {
      if (world.shells.has(id) || !this.tracks.has(s.ownerId)) continue;
      landed.set(s.ownerId, Math.max(landed.get(s.ownerId) ?? 0, s.burstRadius));
    }
    const next = new Map<string, ShellSeen>();
    for (const s of world.shells.values()) {
      if (s.hits.includes('mine')) next.set(s.id, { ownerId: s.ownerId, burstRadius: s.burstRadius });
    }
    this.mineShellsSeen = next;
    return landed;
  }

  /** The endgame clock (one pass over every hull). */
  private noteMatch(world: World): void {
    const survivors: ShipRecord[] = [];
    for (const ship of world.ships.values()) {
      if (isAfloat(ship.lifecycle)) survivors.push(ship);
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

/** hp / maxHp (0 for a hull with no hp to lose). */
const hullFracOf = (ship: ShipRecord): number => (ship.stats.maxHp > 0 ? ship.hp / ship.stats.maxHp : 0);

/** The bot whose landing (`sp` / `hc` this tick) touched a gone mine's
 *  marker, or null (see noteSwept). */
function sweeperOf(world: World, m: MineSeen, landedBy: ReadonlyMap<string, number>): string | null {
  for (const e of world.tickEvents) {
    if (e.k !== 'sp' && e.k !== 'hc') continue;
    const blast = landedBy.get(e.id);
    if (blast === undefined || e.id === m.ownerId) continue;
    if (e.k === 'hc' && blast === 0) continue; // a direct shell's hull strike is no landing
    if (Math.hypot(e.x - m.x, e.y - m.y) <= blast + CONFIG.mine.hitRadiusU) return e.id;
  }
  return null;
}

/**
 * One afloat tick of the GUNS BEARING readout (see BotReadouts.gunsBearing):
 * the nearest afloat non-self hull inside this bot's main-battery reach, and
 * how many of the bot's guns bear on its centre (shared `turretBears`).
 */
function noteGunsBearing(world: World, o: BotReadouts, ship: ShipRecord): void {
  const target = nearestInReach(world, ship, ship.stats.equipment.mainBattery.rangeU);
  if (target === null) return;
  const mounts = turretMounts(ship.hullId);
  const pose = { x: ship.state.x, y: ship.state.y, heading: ship.state.heading };
  const at = { x: target.state.x, y: target.state.y };
  for (let i = 0; i < mounts.length; i += 1) {
    o.gunsInReach += mounts[i].guns;
    if (turretBears(ship.hullId, i, pose, at)) o.gunsBearing += mounts[i].guns;
  }
}

/** The nearest afloat hull other than `self` whose centre is within `reach`. */
function nearestInReach(world: World, self: ShipRecord, reach: number): ShipRecord | null {
  let best: ShipRecord | null = null;
  let bestD = reach;
  for (const other of world.ships.values()) {
    if (other.id === self.id || !isAfloat(other.lifecycle)) continue;
    const d = Math.hypot(other.state.x - self.state.x, other.state.y - self.state.y);
    if (d <= bestD) {
      best = other;
      bestD = d;
    }
  }
  return best;
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

/** Fold one newly launched shell into its owner's shot counters. */
function creditShell(o: BotReadouts, s: ShellState): void {
  if (s.lit !== undefined) o.starShellsFired += 1;
  if (!isDeckGunShell(s) || s.family === null) return;
  o.gunShells += 1;
  if (s.attenRangeU === undefined) {
    o.litShots += 1;
    return;
  }
  if (s.targetX === null || s.targetY === null || s.originX === undefined || s.originY === undefined) return;
  if (Math.hypot(s.targetX - s.originX, s.targetY - s.originY) > s.attenRangeU) o.shotsBeyondRange[s.family] += 1;
}
