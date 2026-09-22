// PER-LINE CATALOG REPORTING (Story 7-5 evidence pass) — the rendering half of
// catalogMetrics.ts, plus the two rows that need no simulation at all.
//
// Determinism contract (NFR5), inherited from report.ts: pure over the
// collected samples, explicitly sorted keys, fixed-decimal formatting, no wall
// clock. Identical run key => byte-identical body.
//
// THREE BLOCKS, and they answer different questions on purpose:
//
// A. THE STRUCTURAL BLOCK IS GONE (Story 8.14, amendment 89a). It printed each
//    CLASS'S DECK, and there are no decks: every captain draws from the one
//    common pool, so "is this line reachable by construction" is answered by
//    `isStubLine` alone and needs no table. Story 8.19 re-cuts the harness bars
//    for the pool era; nothing is invented here in the meantime.
//
// B. OFFERS AND FITS IN PLAY. Offers are policy-free (the draw alone); fits
//    carry whatever the spender's policy is — spendPolicy.pickSpendChoice for
//    the scripted control, per-profile weights for bots. Both columns are printed side by
//    side and the caveat is printed WITH them.
//
// C. THE ORDNANCE + GUARDRAIL LEDGER. See catalogMetrics.ts for how damage is
//    attributed with no weapon field on the wire.

import { CATALOG } from '@salvo/shared';
import { fmt } from './stats.js';
import type { CatalogSample } from './catalogMetrics.js';
import type { BatchResult } from './runner.js';

const pct = (f: number): string => `${fmt(f * 100, 1)}%`;

const addInto = (into: Record<string, number>, from: Record<string, number> | undefined): void => {
  if (from === undefined) return;
  for (const k of Object.keys(from)) into[k] = (into[k] ?? 0) + from[k];
};

/** Key-wise sum of a two-level slice (class -> id -> n and friends). */
const addSlices = (
  into: Record<string, Record<string, number>>,
  from: Record<string, Record<string, number>> | undefined,
): void => {
  if (from === undefined) return;
  for (const k of Object.keys(from)) addInto((into[k] ??= {}), from[k]);
};

export interface CatalogAggregate extends CatalogSample {
  /** Matches that contributed a ledger (samples predating the field are skipped). */
  sampled: number;
  /** Required on the aggregate (optional on the per-match sample only because
   *  literals predating the field exist in tests). */
  fitsByClass: Record<string, Record<string, number>>;
  fitsByProfile: Record<string, Record<string, number>>;
}

/** Key-wise sum of every match's ledger. */
export function buildCatalogAggregate(result: BatchResult): CatalogAggregate {
  const agg: CatalogAggregate = {
    sampled: 0,
    offers: {}, fits: {}, offerHands: 0, offersByClass: {},
    fitsByClass: {}, fitsByProfile: {},
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
    addSlices(agg.offersByClass, c.offersByClass);
    addSlices(agg.fitsByClass, c.fitsByClass);
    addSlices(agg.fitsByProfile, c.fitsByProfile);
    for (const hull of Object.keys(c.maxTickByHull)) {
      agg.maxTickByHull[hull] = Math.max(agg.maxTickByHull[hull] ?? 0, c.maxTickByHull[hull]);
    }
  }
  return agg;
}

/** BLOCK B — offers and fits observed in play. */
export function renderCatalogLines(label: string, agg: CatalogAggregate): string[] {
  const lines: string[] = [`== CATALOG LINES ${label} ==`];
  lines.push(`ledgered matches: ${agg.sampled} | materialized offer hands: ${agg.offerHands}`);
  lines.push('OFFER% is policy-free (the common-pool draw alone). FIT% carries the spender policy');
  lines.push('(spendPolicy.pickSpendChoice for the scripted control, profile weights for bots) — never read it as taste.');
  const ids = Object.keys(CATALOG).sort();
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

/** BLOCK B½ (wave 4) — fits sliced by CLASS and by SPENDER (profile id for a
 *  bot — in-game or test-only row — else the ship's role). Deterministic:
 *  outer and inner keys both sorted, plain tallies, no wall clock. The class
 *  slice is the observed numerator the structural deck-composition block is
 *  the denominator for; the profile slice is the blind-vacuum rig's per-row
 *  read. */
export function renderFitSlices(label: string, agg: CatalogAggregate): string[] {
  const lines: string[] = [`== FITS BY CLASS / SPENDER ${label} ==`];
  lines.push(...sliceLines('by class', agg.fitsByClass));
  lines.push(...sliceLines('by spender', agg.fitsByProfile));
  return lines;
}

/** One slice: `key: id=n id=n ...` per sorted outer key (sorted inner ids). */
function sliceLines(title: string, slice: Record<string, Record<string, number>>): string[] {
  const outer = Object.keys(slice).sort();
  if (outer.length === 0) return [`${title}: (none)`];
  const lines: string[] = [`${title}:`];
  for (const key of outer) {
    const ids = Object.keys(slice[key]).sort();
    const cells = ids.map((id) => `${id}=${slice[key][id]}`);
    lines.push(`  ${key.padEnd(18)} ${cells.length === 0 ? '(none)' : cells.join(' ')}`);
  }
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
