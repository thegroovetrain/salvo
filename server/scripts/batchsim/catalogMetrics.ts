// CATALOG + ORDNANCE TELEMETRY (Story 7-5 evidence pass) — the instrument the
// story's acceptance criterion ("no dead cards, no dominant cards, the damage
// guardrail holds in play") rests on. Sibling of botMetrics.ts: a READ-ONLY
// observer over a live World, constructed by the runner and folded into the
// MatchSample. Nothing here can influence the simulation and nothing in
// server/src imports it.
//
// WHY IT EXISTS. The shipped report answers "how fast does the economy run"
// (levels, picks, deck depletion) and "how well do bots fight", but it has no
// per-LINE resolution at all: a card that is never offered, never picked, or
// picked every single time is invisible in every existing row. Story 7-5
// rewrote the catalog wholesale (33 -> 29 lines, every equipment subdeck to
// exactly 6, every hull deck to exactly 41), so per-line reachability is the
// question and there was no row for it.
//
// THREE LEDGERS, all pure observation:
//
// 1. OFFERS AND FITS PER LINE. `ship.offer` is materialized ONCE per banked
//    level and frozen until spent (world.ts materializeOffer), so a REFERENCE
//    comparison counts each distinct hand exactly once — no id-set hashing, no
//    double counting across the ticks a hand sits open. Fits are read by
//    diffing `ship.boons`, which is append-only within a life.
//    READ THE PICK COLUMN AS "POLICY + REACHABILITY", NEVER AS PLAYER TASTE:
//    captains spend through spendPolicy.pickSpendChoice (rarity-preferring, 75%
//    top-rank) and bots through their per-profile weights. The OFFER column is
//    the policy-free half — it is deck composition and the offer roll alone.
//
// 2. THE DAMAGE LEDGER, attributed BY AMOUNT. DamageEvent carries no weapon
//    field, and adding one would mean touching server/src. It does not need
//    one: after Story 7-5 deleted the gun / torpedo / mine damage cards, every
//    damage source in the game emits a BOON-INVARIANT constant — and every
//    amount here is now READ FROM CONFIG rather than typed in, because the
//    literal list drifted (it still said broadside 20 nine cycles after balance
//    cycle 1 set 15). CONFIG cannot drift from itself.
//    THE AMOUNTS ARE NOT ALL UNIQUE, AND THE LEDGER SAYS SO: balance cycle 1
//    made `broadside.damage` exactly equal `gun.damage` (both 15), so a first-
//    match lookup would silently file every broadside burst under 'gun'. Sources
//    that collide on an amount are reported under ONE merged label
//    ('gun/broadside') — an honest ambiguity beats a confident wrong answer. Any
//    amount that matches nothing is bucketed by its own value under
//    `other:<amount>` and
//    printed, so a future damage card cannot silently corrupt the attribution.
//
// 3. THE ONE-HIT-KILL GUARDRAIL, MEASURED IN PLAY. The shared test pins it
//    analytically over CONFIG; this measures what actually lands. Damage is
//    aggregated PER VICTIM PER TICK because a multi-barrel gun click is N
//    separate bursts (N separate DamageEvents) inside one tick — the "does the
//    max BARREL click one-shot a 45hp small drone" question is a TICK question,
//    not an event question, and both readings are reported separately.

import { CONFIG } from '@salvo/shared';
import type { World, ShipRecord } from '../../src/game/world.js';

const AMOUNT_EPS = 1e-6;
/** Per-tick damage is dps × the 50ms fixed step (storm / incendiary DoT). */
const TICK_S = 0.05;

/** Every damage source, with its amount READ FROM CONFIG (see header, ledger 2)
 *  — a typed-in list drifted twice, and CONFIG cannot drift from itself. */
const RAW_SOURCES: { label: string; amount: number }[] = [
  { label: 'gun', amount: CONFIG.gun.damage },
  { label: 'gunBodyblock', amount: CONFIG.gun.contactDamage },
  { label: 'broadside', amount: CONFIG.broadside.damage },
  { label: 'torpedo', amount: CONFIG.torpedo.damage },
  { label: 'mine', amount: CONFIG.mine.damage },
  { label: 'buoyGun', amount: CONFIG.radarBuoy.gunDamage },
  { label: 'fleetGun', amount: CONFIG.drones.small.gun.damage },
  { label: 'storm', amount: CONFIG.zone.stormDps * TICK_S },
  { label: 'incendiary', amount: CONFIG.starShells.incendiaryDps * TICK_S },
];

/**
 * The sources, with any that COLLIDE on an amount merged into one honest label.
 * Balance cycle 1 set `broadside.damage` to exactly `gun.damage` (both 15), and
 * a first-match lookup would have filed every broadside burst under 'gun' in
 * silence. 'gun/broadside' says what the ledger actually knows.
 */
const DAMAGE_SOURCES: { label: string; amount: number }[] = (() => {
  const out: { label: string; amount: number }[] = [];
  for (const s of RAW_SOURCES) {
    const hit = out.find((o) => Math.abs(o.amount - s.amount) < AMOUNT_EPS);
    if (hit) hit.label = `${hit.label}/${s.label}`;
    else out.push({ ...s });
  }
  return out;
})();

function classifyDamage(amount: number): string {
  for (const s of DAMAGE_SOURCES) if (Math.abs(amount - s.amount) < AMOUNT_EPS) return s.label;
  return `other:${amount.toFixed(3)}`;
}

/** Ordnance classification from the ShellState signature (no weapon id exists
 *  on a shell either — same constraint, same solution). */
function classifyShell(kind: string, damage: number, lit: boolean): string {
  // A CAPTIVE MINE's torpedo is a `torp` carrying MINE damage (55) rather than
  // torpedo damage (70) — R2.12. Splitting them here is the only way to see
  // whether captive mines ever actually fire, since neither the shell nor the
  // DamageEvent names its weapon.
  if (kind === 'torp') return damage === CONFIG.mine.damage ? 'captiveTorpedo' : 'torpedo';
  if (lit) return 'starShell';
  // Same CONFIG-derived, collision-honest classification as the damage ledger:
  // gun and broadside shells both carry 15 and are indistinguishable here.
  if (damage === CONFIG.radarBuoy.gunDamage) return 'buoyGun';
  return classifyDamage(damage);
}

/** One match's catalog + ordnance ledger. Every field is a plain tally so the
 *  aggregate is a key-wise sum. */
export interface CatalogSample {
  /** boon id -> times it appeared in a materialized offer. */
  offers: Record<string, number>;
  /** boon id -> times it was fitted. */
  fits: Record<string, number>;
  /** distinct materialized offers observed (the offers denominator). */
  offerHands: number;
  /** ship class -> boon id -> offers (deck composition is per class). */
  offersByClass: Record<string, Record<string, number>>;
  /** ship class -> boon id -> fits (wave 4: the observed numerator beside the
   *  structural deck-composition denominator). OPTIONAL because sample
   *  literals predating the field exist in the harness's own tests — read it
   *  defensively (`?? {}`), like `bots` on MatchSample. */
  fitsByClass?: Record<string, Record<string, number>>;
  /** spender label -> boon id -> fits. The label is a bot's PROFILE id (an
   *  in-game or test-only row), or the ship's role ('captain'; 'fleet' is
   *  structurally empty — fleet hulls have no decks) — so a blind-vacuum run
   *  reads per-test-row and a mixed lobby splits policy from policy. Same
   *  optionality as fitsByClass. */
  fitsByProfile?: Record<string, Record<string, number>>;
  /** damage source label -> event count / total hp. */
  hits: Record<string, number>;
  hp: Record<string, number>;
  /** ordnance label -> projectiles spawned. */
  launched: Record<string, number>;
  /** mines laid / buoys deployed (not projectiles — counted by id diff). */
  minesLaid: number;
  buoysDeployed: number;
  /** largest SINGLE DamageEvent, and largest per-victim PER-TICK total. */
  maxEventDamage: number;
  maxTickDamage: number;
  /** victim hull id -> largest per-tick total it took. */
  maxTickByHull: Record<string, number>;
  /** victim hull id -> kills from FULL hp inside ONE tick (any event count). */
  oneTickKills: Record<string, number>;
  /** victim hull id -> kills from FULL hp by a SINGLE DamageEvent. */
  oneEventKills: Record<string, number>;
  /** victim hull id -> total kills observed (the denominator for the two above). */
  killsByHull: Record<string, number>;
  /** THE BARREL QUESTION (Story 7-5). A multi-barrel gun CLICK is N separate
   *  15hp bursts inside one tick, so it is invisible in every per-event row and
   *  indistinguishable from N shooters in the per-tick row. These three isolate
   *  it: a victim-tick whose damage is gun bursts and NOTHING else, with two or
   *  more of them, IS a multi-barrel click landing (a second shooter's gun
   *  burst in the exact same 50ms tick on the exact same hull is possible and
   *  is the known contaminant — reported, not hidden). */
  multiBarrelTicks: Record<string, number>;
  /** victim hull id -> largest gun-ONLY per-tick total. 45 is the theoretical
   *  max (3 barrels x 15). */
  maxGunOnlyTick: Record<string, number>;
  /** victim hull id -> kills from FULL hp by a gun-only multi-burst tick. */
  gunClickKills: Record<string, number>;
}

const emptySample = (): CatalogSample => ({
  offers: {},
  fits: {},
  offerHands: 0,
  offersByClass: {},
  fitsByClass: {},
  fitsByProfile: {},
  hits: {},
  hp: {},
  launched: {},
  minesLaid: 0,
  buoysDeployed: 0,
  maxEventDamage: 0,
  maxTickDamage: 0,
  maxTickByHull: {},
  oneTickKills: {},
  oneEventKills: {},
  killsByHull: {},
  multiBarrelTicks: {},
  maxGunOnlyTick: {},
  gunClickKills: {},
});

const bump = (rec: Record<string, number>, key: string, by = 1): void => {
  rec[key] = (rec[key] ?? 0) + by;
};

/** Per-victim accumulation inside ONE tick (see header, ledger 3). */
interface TickDamage {
  total: number;
  events: number;
  maxEvent: number;
  hpBefore: number;
  hpAfter: number;
  /** Gun-burst (15hp) events in this tick, and whether anything else landed. */
  gunEvents: number;
  gunHp: number;
  nonGun: boolean;
}

export class CatalogCollector {
  private readonly sample = emptySample();
  /** ship id -> the offer array reference last counted. */
  private readonly seenOffer = new Map<string, unknown>();
  /** ship id -> boons.length last counted. */
  private readonly seenBoons = new Map<string, number>();
  private readonly seenShells = new Set<string>();
  private readonly seenMines = new Set<string>();
  private readonly seenBuoys = new Set<string>();

  observe(world: World, active: boolean): void {
    if (!active) return;
    // The spender label for the fits slices: a bot's profile id (read off the
    // controller's inspection seam), else the ship's role. Resolved here so
    // observeShip stays pure over its ship.
    for (const ship of world.ships.values()) {
      this.observeShip(ship, world.bots.profileOf(ship.id) ?? ship.role);
    }
    this.observeOrdnance(world);
    this.observeDamage(world);
  }

  private observeShip(ship: ShipRecord, spender: string): void {
    const offer = ship.offer;
    if (offer !== null && this.seenOffer.get(ship.id) !== offer) {
      this.seenOffer.set(ship.id, offer);
      this.sample.offerHands += 1;
      const byClass = (this.sample.offersByClass[ship.hullId] ??= {});
      for (const id of offer) {
        bump(this.sample.offers, id);
        bump(byClass, id);
      }
    }
    const seen = this.seenBoons.get(ship.id) ?? 0;
    if (ship.boons.length > seen) {
      const byClass = (this.sample.fitsByClass![ship.hullId] ??= {});
      const byProfile = (this.sample.fitsByProfile![spender] ??= {});
      for (let i = seen; i < ship.boons.length; i += 1) {
        bump(this.sample.fits, ship.boons[i]);
        bump(byClass, ship.boons[i]);
        bump(byProfile, ship.boons[i]);
      }
    }
    // Assign unconditionally: redeployShip WIPES boons, and a stale high-water
    // mark would then silently swallow every refit of the next life.
    this.seenBoons.set(ship.id, ship.boons.length);
  }

  private observeOrdnance(world: World): void {
    for (const [id, shell] of world.shells) {
      if (this.seenShells.has(id)) continue;
      this.seenShells.add(id);
      bump(this.sample.launched, classifyShell(shell.kind, shell.damage, shell.lit !== undefined));
    }
    for (const id of world.mines.keys()) {
      if (this.seenMines.has(id)) continue;
      this.seenMines.add(id);
      this.sample.minesLaid += 1;
    }
    for (const id of world.buoys.keys()) {
      if (this.seenBuoys.has(id)) continue;
      this.seenBuoys.add(id);
      this.sample.buoysDeployed += 1;
    }
  }

  private observeDamage(world: World): void {
    const perVictim = new Map<string, TickDamage>();
    for (const e of world.tickEvents) {
      if (e.k !== 'dmg') continue;
      const label = classifyDamage(e.amount);
      bump(this.sample.hits, label);
      bump(this.sample.hp, label, e.amount);
      if (e.amount > this.sample.maxEventDamage) this.sample.maxEventDamage = e.amount;
      this.foldVictim(perVictim, e.id, e.amount, e.hp, label === 'gun');
    }
    for (const [id, d] of perVictim) this.settleVictim(world, id, d);
  }

  private foldVictim(per: Map<string, TickDamage>, id: string, amount: number, hp: number, isGun: boolean): void {
    const cur = per.get(id);
    if (cur === undefined) {
      per.set(id, {
        total: amount, events: 1, maxEvent: amount, hpBefore: hp + amount, hpAfter: hp,
        gunEvents: isGun ? 1 : 0, gunHp: isGun ? amount : 0, nonGun: !isGun,
      });
      return;
    }
    cur.total += amount;
    cur.events += 1;
    cur.maxEvent = Math.max(cur.maxEvent, amount);
    cur.hpAfter = hp;
    if (isGun) {
      cur.gunEvents += 1;
      cur.gunHp += amount;
    } else cur.nonGun = true;
  }

  private settleVictim(world: World, id: string, d: TickDamage): void {
    const ship = world.ships.get(id);
    const hull = ship?.hullId ?? 'unknown';
    this.sample.maxTickDamage = Math.max(this.sample.maxTickDamage, d.total);
    this.sample.maxTickByHull[hull] = Math.max(this.sample.maxTickByHull[hull] ?? 0, d.total);
    const gunOnlyBurst = d.gunEvents >= 2 && !d.nonGun;
    if (gunOnlyBurst) this.recordGunClick(hull, d.gunHp);
    if (d.hpAfter > 0) return;
    // FROM FULL: the victim was undamaged when this tick began. maxHp comes off
    // the ship's own effective stats, so a hull card (shipHull) moves the bar
    // with it rather than against a stale CONFIG base.
    this.recordKill(hull, d, ship?.stats.maxHp ?? 0, gunOnlyBurst);
  }

  private recordKill(hull: string, d: TickDamage, maxHp: number, gunOnlyBurst: boolean): void {
    bump(this.sample.killsByHull, hull);
    if (d.hpBefore < maxHp - AMOUNT_EPS) return;
    bump(this.sample.oneTickKills, hull);
    if (d.events === 1) bump(this.sample.oneEventKills, hull);
    if (gunOnlyBurst) bump(this.sample.gunClickKills, hull);
  }

  /** One gun-only multi-burst tick on `hull` (see CatalogSample.multiBarrelTicks). */
  private recordGunClick(hull: string, gunHp: number): void {
    bump(this.sample.multiBarrelTicks, hull);
    this.sample.maxGunOnlyTick[hull] = Math.max(this.sample.maxGunOnlyTick[hull] ?? 0, gunHp);
  }

  result(): CatalogSample {
    return this.sample;
  }
}
