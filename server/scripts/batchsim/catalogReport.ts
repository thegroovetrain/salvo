// PER-LINE CATALOG REPORTING (Story 7-5 evidence pass) — the rendering half of
// catalogMetrics.ts, plus the two rows that need no simulation at all.
//
// Determinism contract (NFR5), inherited from report.ts: pure over the
// collected samples, explicitly sorted keys, fixed-decimal formatting, no wall
// clock. Identical run key => byte-identical body.
//
// THREE BLOCKS, and they answer different questions on purpose:
//
// A. DECK COMPOSITION is STRUCTURAL, not sampled. It is `buildDeck` over each
//    class's fresh fit, printed straight out — no matches, no rng, no policy.
//    If a line is missing from every class's deck it is unreachable by
//    CONSTRUCTION, and no sample size can rescue it. This is the strongest
//    possible answer to "is any card unreachable" and it is free.
//
// B. OFFERS AND FITS IN PLAY. Offers are policy-free (deck + offer roll); fits
//    carry whatever the spender's policy is — spendPolicy.pickSpendChoice for
//    the scripted control, per-profile weights for bots. Both columns are printed side by
//    side and the caveat is printed WITH them.
//
// C. THE ORDNANCE + GUARDRAIL LEDGER. See catalogMetrics.ts for how damage is
//    attributed with no weapon field on the wire.

import { BOON_CATALOG, SHIP_CLASS_IDS, buildDeck, effectiveStats, hullEnvelope, loadoutFor, type EquipmentId, type ShipClassId } from '@salvo/shared';
import { fmt } from './stats.js';
import type { CatalogSample } from './catalogMetrics.js';
import type { BatchResult } from './runner.js';
import type { DeckAggregate } from './deckSim.js';

const pct = (f: number): string => `${fmt(f * 100, 1)}%`;

const addInto = (into: Record<string, number>, from: Record<string, number> | undefined): void => {
  if (from === undefined) return;
  for (const k of Object.keys(from)) into[k] = (into[k] ?? 0) + from[k];
};

export interface CatalogAggregate extends CatalogSample {
  /** Matches that contributed a ledger (samples predating the field are skipped). */
  sampled: number;
}

/** Key-wise sum of every match's ledger. */
export function buildCatalogAggregate(result: BatchResult): CatalogAggregate {
  const agg: CatalogAggregate = {
    sampled: 0,
    offers: {}, fits: {}, offerHands: 0, offersByClass: {},
    hits: {}, hp: {}, launched: {}, minesLaid: 0, buoysDeployed: 0,
    maxEventDamage: 0, maxTickDamage: 0, maxTickByHull: {},
    oneTickKills: {}, oneEventKills: {}, killsByHull: {},
    multiBarrelTicks: {}, maxGunOnlyTick: {}, gunClickKills: {},
  };
  for (const m of result.matches) {
    const c = m.catalog;
    if (c === undefined) continue;
    agg.sampled += 1;
    agg.offerHands += c.offerHands;
    agg.minesLaid += c.minesLaid;
    agg.buoysDeployed += c.buoysDeployed;
    agg.maxEventDamage = Math.max(agg.maxEventDamage, c.maxEventDamage);
    agg.maxTickDamage = Math.max(agg.maxTickDamage, c.maxTickDamage);
    addInto(agg.offers, c.offers);
    addInto(agg.fits, c.fits);
    addInto(agg.hits, c.hits);
    addInto(agg.hp, c.hp);
    addInto(agg.launched, c.launched);
    addInto(agg.oneTickKills, c.oneTickKills);
    addInto(agg.oneEventKills, c.oneEventKills);
    addInto(agg.killsByHull, c.killsByHull);
    addInto(agg.multiBarrelTicks, c.multiBarrelTicks);
    addInto(agg.gunClickKills, c.gunClickKills);
    for (const hull of Object.keys(c.maxGunOnlyTick)) {
      agg.maxGunOnlyTick[hull] = Math.max(agg.maxGunOnlyTick[hull] ?? 0, c.maxGunOnlyTick[hull]);
    }
    for (const cls of Object.keys(c.offersByClass)) addInto((agg.offersByClass[cls] ??= {}), c.offersByClass[cls]);
    for (const hull of Object.keys(c.maxTickByHull)) {
      agg.maxTickByHull[hull] = Math.max(agg.maxTickByHull[hull] ?? 0, c.maxTickByHull[hull]);
    }
  }
  return agg;
}

/** Carried equipment ids for a class's fresh fit (deckSim.carriedFor twin —
 *  duplicated rather than exported across, so deck-only mode and this block
 *  cannot drift apart silently through a shared mutable helper). */
function carriedFor(cls: ShipClassId): EquipmentId[] {
  const loadout = loadoutFor(cls, effectiveStats(hullEnvelope(cls)));
  const out: EquipmentId[] = [];
  for (const slot of loadout) if (slot.equipmentId !== null) out.push(slot.equipmentId);
  return out;
}

/** BLOCK A — structural reachability. No simulation involved. */
export function renderDeckComposition(): string[] {
  const lines: string[] = ['== DECK COMPOSITION (structural — buildDeck over each class fresh fit) =='];
  const ids = Object.keys(BOON_CATALOG).sort();
  const decks = new Map<string, Map<string, number>>();
  for (const cls of SHIP_CLASS_IDS) {
    const counts = new Map<string, number>();
    for (const id of buildDeck(BOON_CATALOG, carriedFor(cls)).cards) counts.set(id, (counts.get(id) ?? 0) + 1);
    decks.set(cls, counts);
  }
  lines.push(`catalog lines: ${ids.length}`);
  for (const cls of SHIP_CLASS_IDS) {
    const d = decks.get(cls)!;
    let cards = 0;
    for (const n of d.values()) cards += n;
    lines.push(`  ${cls.padEnd(12)} deck=${String(cards).padStart(3)} cards across ${d.size} lines`);
  }
  const idW = Math.max(...ids.map((i) => i.length));
  lines.push(`${'line'.padEnd(idW)} | rarity    | copies | ${SHIP_CLASS_IDS.map((c) => c.padEnd(12)).join(' | ')}`);
  for (const id of ids) {
    const def = BOON_CATALOG[id];
    const cells = SHIP_CLASS_IDS.map((c) => String(decks.get(c)!.get(id) ?? 0).padEnd(12));
    lines.push(`${id.padEnd(idW)} | ${def.rarity.padEnd(9)} | ${String(def.copies).padStart(6)} | ${cells.join(' | ')}`);
  }
  return lines;
}

/** BLOCK B — offers and fits observed in play. */
export function renderCatalogLines(label: string, agg: CatalogAggregate): string[] {
  const lines: string[] = [`== CATALOG LINES ${label} ==`];
  lines.push(`ledgered matches: ${agg.sampled} | materialized offer hands: ${agg.offerHands}`);
  lines.push('OFFER% is policy-free (deck + offer roll). FIT% carries the spender policy');
  lines.push('(spendPolicy.pickSpendChoice for the scripted control, profile weights for bots) — never read it as taste.');
  const ids = Object.keys(BOON_CATALOG).sort();
  const idW = Math.max(...ids.map((i) => i.length));
  lines.push(`${'line'.padEnd(idW)} | offers | offer% | fits  | fit/offer`);
  for (const id of ids) {
    const o = agg.offers[id] ?? 0;
    const f = agg.fits[id] ?? 0;
    const rate = agg.offerHands === 0 ? 0 : o / agg.offerHands;
    const conv = o === 0 ? 0 : f / o;
    lines.push(
      `${id.padEnd(idW)} | ${String(o).padStart(6)} | ${pct(rate).padStart(6)} | ${String(f).padStart(5)} | ${fmt(conv, 3)}`,
    );
  }
  const never = ids.filter((id) => (agg.offers[id] ?? 0) === 0);
  const unpicked = ids.filter((id) => (agg.offers[id] ?? 0) > 0 && (agg.fits[id] ?? 0) === 0);
  lines.push(`NEVER OFFERED: ${never.length === 0 ? '(none)' : never.join(' ')}`);
  lines.push(`OFFERED BUT NEVER FITTED: ${unpicked.length === 0 ? '(none)' : unpicked.join(' ')}`);
  return lines;
}

/** BLOCK C — ordnance launched, damage attributed, and the guardrail. */
export function renderOrdnanceLedger(label: string, agg: CatalogAggregate): string[] {
  const lines: string[] = [`== ORDNANCE + DAMAGE ${label} ==`];
  const launched = Object.keys(agg.launched).sort();
  lines.push(`launched: ${launched.length === 0 ? '(none)' : launched.map((k) => `${k}=${agg.launched[k]}`).join(' ')}`);
  lines.push(`mines laid: ${agg.minesLaid} | buoys deployed: ${agg.buoysDeployed}`);
  const sources = Object.keys(agg.hits).sort();
  lines.push('damage by source (attributed by amount — see catalogMetrics.ts):');
  for (const k of sources) {
    const n = agg.hits[k];
    const hp = agg.hp[k];
    const perLaunch = agg.launched[k] === undefined ? '' : ` hpPerLaunch=${fmt(hp / agg.launched[k], 2)}`;
    lines.push(`  ${k.padEnd(14)} hits=${String(n).padStart(7)} hp=${fmt(hp, 1).padStart(10)}${perLaunch}`);
  }
  lines.push(...renderGuardrail(agg));
  return lines;
}

function renderGuardrail(agg: CatalogAggregate): string[] {
  const lines: string[] = ['ONE-HIT-KILL GUARDRAIL (measured in play):'];
  lines.push(`  largest single DamageEvent: ${fmt(agg.maxEventDamage, 1)} hp`);
  lines.push(`  largest per-victim PER-TICK total: ${fmt(agg.maxTickDamage, 1)} hp`);
  const hulls = Object.keys(agg.killsByHull).sort();
  for (const h of hulls) {
    const kills = agg.killsByHull[h];
    const tick = agg.oneTickKills[h] ?? 0;
    const event = agg.oneEventKills[h] ?? 0;
    const share = kills === 0 ? 0 : tick / kills;
    lines.push(
      `  ${h.padEnd(12)} kills=${String(kills).padStart(5)} fromFull-in-ONE-TICK=${String(tick).padStart(5)} (${pct(share)}) ` +
        `of which SINGLE-EVENT=${event} | maxTick=${fmt(agg.maxTickByHull[h] ?? 0, 1)}`,
    );
  }
  lines.push('THE BARREL CLICK (gun-only multi-burst ticks — see catalogMetrics.ts):');
  for (const h of Object.keys(agg.multiBarrelTicks).sort()) {
    lines.push(
      `  ${h.padEnd(12)} multi-burst ticks=${String(agg.multiBarrelTicks[h]).padStart(5)} ` +
        `maxGunOnlyTick=${fmt(agg.maxGunOnlyTick[h] ?? 0, 1).padStart(5)} ` +
        `fromFull kills by such a tick=${agg.gunClickKills[h] ?? 0}`,
    );
  }
  return lines;
}

/** Deck-only mode's per-line block (huge N, no World). */
export function renderDeckLines(label: string, agg: DeckAggregate): string[] {
  const lines: string[] = [`== DECK-ONLY CATALOG LINES ${label} ==`];
  lines.push(`hands: ${agg.hands} | by class: ${Object.keys(agg.handsByClass).sort().map((c) => `${c}=${agg.handsByClass[c]}`).join(' ')}`);
  const ids = Object.keys(BOON_CATALOG).sort();
  const idW = Math.max(...ids.map((i) => i.length));
  const classes = Object.keys(agg.handsByClass).sort();
  lines.push(`${'line'.padEnd(idW)} | offer% | pick% | ${classes.map((c) => `${c} offer%`.padEnd(20)).join(' | ')}`);
  for (const id of ids) {
    const o = agg.lineOffers[id] ?? 0;
    const p = agg.linePicks[id] ?? 0;
    const cells = classes.map((c) => {
      const hands = agg.handsByClass[c] ?? 0;
      const n = agg.lineOffersByClass[c]?.[id] ?? 0;
      return `${pct(hands === 0 ? 0 : n / hands)}`.padEnd(20);
    });
    lines.push(
      `${id.padEnd(idW)} | ${pct(agg.hands === 0 ? 0 : o / agg.hands).padStart(6)} | ` +
        `${pct(agg.hands === 0 ? 0 : p / agg.hands).padStart(5)} | ${cells.join(' | ')}`,
    );
  }
  return lines;
}
