// THE CARD COPY LAYER (ui/boonCopy.ts, Story 2.8) — the ratified ladders
// (amendment 42, verbatim canon) and the "name is flavor, rules text is the
// contract" law. Three properties carry the whole module:
//
//   1. COVERAGE — every shipped catalog line has a real name at EVERY stack
//      position it can reach, a category label, and non-empty rules text. A
//      missing rung would print the humanized id mid-match.
//   2. NAME-BY-STACK-POSITION — the card shows the NEXT rung (held occurrences
//      + 1), and the ladders are exactly the ones the brainstorm ratified.
//   3. LIVE VALUES — the rules text is computed through a REAL effectiveStats
//      preview diff, so it can never promise a number the firewall would not
//      produce (clamps and caps included).

import { describe, it, expect } from 'vitest';
import { BOON_CATALOG, CONFIG, effectiveStats, resolveBoons } from '@salvo/shared';
import {
  boonCategoryLabel,
  boonDescription,
  boonEffectLine,
  boonFitToastLine,
  boonLineageLine,
  boonName,
  boonRarityLabel,
  boonTooltipText,
} from '../ui/boonCopy.js';

const TB = { cls: 'torpedoBoat' as const, boons: [] as string[] };

describe('ladder coverage — every catalog line, every stack position', () => {
  it('names every shipped line at every rung it can reach (never the humanized fallback)', () => {
    for (const [id, def] of Object.entries(BOON_CATALOG)) {
      for (let stack = 0; stack < def.copies; stack += 1) {
        const name = boonName(id, stack);
        expect(name.length, `${id}@${stack}`).toBeGreaterThan(0);
        // The fallback humanizer produces a Title Case de-camelCased id; a real
        // ratified name is authored uppercase (with period-authentic Mk marks).
        expect(name, `${id}@${stack}`).toBe(name.toUpperCase().replace(/MK /g, 'Mk '));
      }
    }
  });

  it('gives a multi-copy line a DISTINCT name at each rung (a ladder, not a repeat)', () => {
    for (const [id, def] of Object.entries(BOON_CATALOG)) {
      if (def.copies < 2) continue;
      const rungs = Array.from({ length: def.copies }, (_, k) => boonName(id, k));
      expect(new Set(rungs).size, id).toBe(def.copies);
    }
  });

  it('carries the ratified ladders verbatim (spot checks across the naming styles)', () => {
    // STORY 7-5 WAVE 1 — Eric's own card names, verbatim canon
    // (_bmad-output/implementation-artifacts/7-5-decks.md). The v1 spot checks
    // for the SEVEN deleted lines (HEAVY SHELLS, HEAVY WARHEAD, COMMAND
    // DETONATION, TNT FILLER, DECK RACKS, WIDE BURST, CLEAN BOILERS) are
    // RETIRED with their catalog lines, as are the RANGE I..IV checks (the
    // INTEL RANGE line was deleted in cycle 119 — the `intel` category
    // survives on INTEL I..V below).
    expect(boonName('shipHull', 0)).toBe('HULL I');
    expect(boonName('shipHull', 3)).toBe('HULL IV');
    expect(boonName('shipSpeed', 0)).toBe('SPEED I');
    expect(boonName('shipSpeed', 3)).toBe('SPEED IV');
    expect(boonName('intelSweep', 0)).toBe('INTEL I');
    expect(boonName('intelSweep', 4)).toBe('INTEL V');
    expect(boonName('shipCooldown', 0)).toBe('RELOAD I');
    expect(boonName('shipCooldown', 4)).toBe('RELOAD V');
    expect(boonName('gunBarrel', 0)).toBe('BARREL I');
    expect(boonName('gunBarrel', 1)).toBe('BARREL II');
    expect(boonName('gunTurret')).toBe('EXTRA TURRET');
    expect(boonName('torpedoSpeed', 0)).toBe('TORPEDO I');
    expect(boonName('torpedoSpeed', 3)).toBe('TORPEDO IV');
    expect(boonName('torpedoTube')).toBe('EXTRA TUBE');
    expect(boonName('boostDuration', 0)).toBe('BOOST DURATION I');
    expect(boonName('boostDuration', 3)).toBe('BOOST DURATION IV');
    expect(boonName('boostSpeed', 0)).toBe('BOOST SPEED I');
    expect(boonName('boostSpeed', 1)).toBe('BOOST SPEED II');
    expect(boonName('starDuration', 0)).toBe('STAR SHELLS I');
    expect(boonName('starDuration', 3)).toBe('STAR SHELLS IV');
    expect(boonName('mineBlast', 0)).toBe('MINES I');
    expect(boonName('mineBlast', 3)).toBe('MINES IV');
    // The doctrine forks. PHOSPHOR SHELLS is a DISPLAY rename of the
    // `starIncendiary` line — the id is deliberately unchanged (project law:
    // a copy rename is never an id rename, the KILL LEADER precedent).
    expect(boonName('torpedoHoming')).toBe('ACOUSTIC HOMING');
    expect(boonName('minePropFouling')).toBe('PROP FOULING MINES');
    expect(boonName('starIncendiary')).toBe('PHOSPHOR SHELLS');
    expect(boonName('starDazzle')).toBe('DAZZLE SHELLS');
    // STORY 7-5 WAVE 2 — Eric's names for the two reworked equipments, verbatim.
    // The PLUNGING FIRE / ARMOR-PIERCING / HEAVY CHARGE / EXTENDED BATTERY /
    // SELF-PROPELLED MINES spot checks are RETIRED with their catalog lines.
    expect(boonName('broadsideSpread', 0)).toBe('BROADSIDE SPREAD I');
    expect(boonName('broadsideSpread', 3)).toBe('BROADSIDE SPREAD IV');
    expect(boonName('broadsideTurrets', 0)).toBe('BROADSIDE TURRETS I');
    expect(boonName('broadsideTurrets', 1)).toBe('BROADSIDE TURRETS II');
    expect(boonName('buoyDuration', 0)).toBe('BUOY I');
    expect(boonName('buoyDuration', 3)).toBe('BUOY IV');
    expect(boonName('buoyGun')).toBe('GUN BUOY');
    expect(boonName('buoyJamming')).toBe('JAMMING BUOY');
    expect(boonName('mineCaptive')).toBe('CAPTIVE MINES');
    // Acquisitions — amendment 42 named the Speed Boost card EMERGENCY THROTTLE.
    expect(boonName('acquireTorpedo')).toBe('TORPEDO TUBES');
    expect(boonName('acquireMine')).toBe('MINE RACKS');
    expect(boonName('acquireStarShells')).toBe('STAR SHELL MORTAR');
    expect(boonName('acquireBroadside')).toBe('BROADSIDE BARRAGE');
    expect(boonName('acquireRadarBuoy')).toBe('RADAR BUOY');
    expect(boonName('acquireBoost')).toBe('EMERGENCY THROTTLE');
  });

  it('clamps a stack past the end of a ladder to its last rung (never blank)', () => {
    expect(boonName('shipCooldown', 99)).toBe('RELOAD V');
    expect(boonName('gunTurret', 3)).toBe('EXTRA TURRET');
    expect(boonName('shipCooldown', -1)).toBe('RELOAD I');
  });

  it('fails OPEN on an unknown id (a readable fallback, never an empty card)', () => {
    expect(boonName('someFutureBoon')).toBe('Some Future Boon');
  });

  // The nine survive wave 2 one-for-one: `cannon` → `broadside`, `decoyBuoy` →
  // `radarBuoy`.
  it('labels all NINE catalog categories, and fails open on an unknown one', () => {
    const categories = new Set(Object.values(BOON_CATALOG).map((d) => d.category));
    expect(categories.size).toBe(9);
    for (const c of categories) {
      expect(boonCategoryLabel(c), c).not.toBe(c); // a real label, not the raw key
      expect(boonCategoryLabel(c)).toBe(boonCategoryLabel(c).toUpperCase());
    }
    expect(boonCategoryLabel('someFutureCategory')).toBe('SOMEFUTURECATEGORY');
  });

  it('shows a rarity tag for RARE/EXCLUSIVE and NOTHING for a plain common', () => {
    expect(boonRarityLabel('common')).toBe('');
    expect(boonRarityLabel('rare')).toBe('RARE');
    expect(boonRarityLabel('exclusive')).toBe('EXCLUSIVE');
  });
});

/** The catalog partition R2.17 draws: a line either moves a NUMBER (its face
 *  prints `current → next`) or it is a VERB / an ACQUISITION (its face prints
 *  nothing at all and the hover tooltip does the talking). Derived from the
 *  EFFECT SHAPE, never from the rarity tier — wave 1 dropped the verbs from
 *  `exclusive` to `rare`, so a rarity-keyed split would demand a stat sentence
 *  off a card with no number to print. */
const VERBS_AND_ACQUISITIONS = Object.values(BOON_CATALOG).filter((d) =>
  d.effects.some((e) => e.kind === 'doctrine' || e.kind === 'slotFill'),
);
const STAT_CARDS = Object.values(BOON_CATALOG).filter((d) => !VERBS_AND_ACQUISITIONS.includes(d));

describe('the card FACE — minimal, and only the numbers (R2.17)', () => {
  // Eric ruling 2026-08-19: *"I want the card itself to be pretty minimal in the
  // upgrade tab, just the name and stat change as before (previous -> new) if
  // applicable."* So the face's ONE text row is the stat sentence, and a card
  // that moves no number carries no prose at all.
  it('prints a live current → next sentence for every STAT line', () => {
    // A NON-DEGENERACY FLOOR, deliberately slack — not a catalog count pin. The
    // set is derived from the catalog, so a card deletion moves it (cycle 119's
    // INTEL RANGE removal took it 16 → 15); its only job is to prove the filter
    // did not return an empty set and make the loop below vacuous. The
    // authoritative counts live in shared/src/__tests__/{boons,deck}.test.ts.
    expect(STAT_CARDS.length).toBeGreaterThanOrEqual(12);
    for (const def of STAT_CARDS) {
      const text = boonDescription(def, TB);
      expect(text.length, def.id).toBeGreaterThan(0);
      expect(text, def.id).toContain('→');
    }
  });

  it('prints NOTHING for a verb or an acquisition — name and tag are the whole face', () => {
    expect(VERBS_AND_ACQUISITIONS.length).toBeGreaterThanOrEqual(13);
    for (const def of VERBS_AND_ACQUISITIONS) {
      expect(boonDescription(def, TB), def.id).toBe('');
    }
  });

  // THE RIDERS ARE GONE FROM THE FACE. Every one of these used to trail the
  // number on the card ("Repairs the hull it adds.", "The trip ring widens with
  // it.", …) and every one is now in the hover explanation instead — moved, not
  // dropped, which is what the second half of each assertion proves.
  it('carries no standing note beside the number — the riders moved to the tooltip', () => {
    const moved: [string, string][] = [
      ['shipHull', 'repairs'],
      ['mineBlast', 'trip ring'],
      ['shipCooldown', 'every weapon'],
      ['broadsideTurrets', 'its own arc'],
      ['gunBarrel', 'parallel'],
    ];
    for (const [id, phrase] of moved) {
      const face = boonDescription(BOON_CATALOG[id], TB);
      expect(face, id).toMatch(/^[^.]+: .+ → .+\.$/); // exactly ONE sentence, the diff
      expect(boonTooltipText(id).toLowerCase(), id).toContain(phrase);
    }
  });
});

describe('rules text — the contract, with live values', () => {

  it('prints the canonical current → next sentence off a real preview diff', () => {
    const sweep = boonDescription(BOON_CATALOG.intelSweep, TB);
    const base = effectiveStats(CONFIG.shipClasses.torpedoBoat);
    const next = effectiveStats(CONFIG.shipClasses.torpedoBoat, resolveBoons(['intelSweep'], BOON_CATALOG));
    expect(sweep).toBe(`Radar sweep: ${base.sweepRpm} RPM → ${next.sweepRpm} RPM.`);
    expect(next.sweepRpm).toBeGreaterThan(base.sweepRpm);
  });

  it('the printed values MOVE with the player\'s existing build (not a static table)', () => {
    const fresh = boonDescription(BOON_CATALOG.shipHull, TB);
    const stacked = boonDescription(BOON_CATALOG.shipHull, { cls: 'torpedoBoat', boons: ['shipHull', 'shipHull'] });
    expect(stacked).not.toBe(fresh);
    const two = effectiveStats(CONFIG.shipClasses.torpedoBoat, resolveBoons(['shipHull', 'shipHull'], BOON_CATALOG));
    expect(stacked).toContain(`${two.maxHp} →`);
  });

  it('tells the TRUTH at a firewall clamp — a capped sweep prints an unchanged number', () => {
    // The ratified 30-RPM ceiling: the card cannot promise what effectiveStats
    // would refuse to produce, because it asks effectiveStats.
    const capped = { cls: 'torpedoBoat' as const, boons: Array.from({ length: 5 }, () => 'intelSweep') };
    const stats = effectiveStats(CONFIG.shipClasses.torpedoBoat, resolveBoons(capped.boons, BOON_CATALOG));
    expect(stats.sweepRpm).toBe(CONFIG.vision.sweepRpmMax);
    expect(boonDescription(BOON_CATALOG.intelSweep, capped)).toBe(
      `Radar sweep: ${CONFIG.vision.sweepRpmMax} RPM → ${CONFIG.vision.sweepRpmMax} RPM.`,
    );
  });

  it('prints durations as seconds and the global cooldown as a PERCENT', () => {
    expect(boonDescription(BOON_CATALOG.starDuration, TB)).toContain('s →');
    // The one card that scales seven different reloads has no single second
    // count to headline, so it prints the scale itself, reading downward.
    expect(boonDescription(BOON_CATALOG.shipCooldown, TB)).toBe('All cooldowns: 100% → 90%.');
  });

  // STORY 7-5 WAVE 2 + the 2026-08-20 per-turret-arc ruling — the BROADSIDE
  // pair. The number SPREAD prints is NOT the stat the card writes:
  // `broadside.spreadRung` is an index into a ladder of authored degrees, so
  // "1 → 2" would say nothing. It prints the DERIVED per-turret traverse
  // half-angle instead, through the same preview diff.
  it('BROADSIDE SPREAD prints the traverse WIDENING, not the rung it writes', () => {
    const text = boonDescription(BOON_CATALOG.broadsideSpread, TB);
    expect(text).toContain('Turret traverse');
    expect(text).toContain('°');
    expect(text).not.toMatch(/\b1 → 2\b/); // never the raw rung
    // The traverse really WIDENS (each gun's own arc — the card brings more
    // guns onto a click), and it is the firewall's own number.
    const before = effectiveStats(CONFIG.shipClasses.battleship);
    const after = effectiveStats(CONFIG.shipClasses.battleship, resolveBoons(['broadsideSpread'], BOON_CATALOG));
    expect(after.broadside.traverseRad).toBeGreaterThan(before.broadside.traverseRad);
  });

  it('BROADSIDE TURRETS prints shells per barrage, and nothing else', () => {
    expect(boonDescription(BOON_CATALOG.broadsideTurrets, TB)).toBe('Shells per barrage: 3 → 4.');
  });
});

// --- THE HOVER TOOLTIP (Story 7-5 wave 2, R2.17) --------------------------------
//
// *"hovering one with the mouse should give a tooltip explaining the card, so
// that there are no questions like 'what the fuck does a captive mine do?'"*
//
// The explanation left the card face, so the whole "rules text is the contract"
// law moved with it: these are the pins that keep it honest in its new home.
describe('the hover explanation — TOTAL over the catalog, and the honest one', () => {
  it('writes a real explanation for EVERY shipped line, stat lines included', () => {
    // TOTALITY is the point: a `current → next` number does not tell a new
    // player what `cooldownScale` or a trip ring IS, so a stat card needs one
    // exactly as much as CAPTIVE MINES does.
    for (const def of Object.values(BOON_CATALOG)) {
      const text = boonTooltipText(def.id);
      expect(text.trim().length, def.id).toBeGreaterThan(0);
      // Not a stub, and not the face's sentence copied over: an explanation is
      // prose, so it runs well past the ~90-character card-face budget.
      expect(text.length, def.id).toBeGreaterThan(100);
      expect(text, def.id).not.toContain('→');
    }
  });

  it('answers Eric\'s own question — CAPTIVE MINES says what a captive mine does', () => {
    const text = boonTooltipText('mineCaptive').toLowerCase();
    expect(text).toContain('torpedo');
    expect(text).toContain('never blows up on contact'); // the counter-intuitive half
    expect(text).toContain('trip ring');
  });

  it('explains the behaviour change of every verb and what every acquisition fits', () => {
    expect(boonTooltipText('torpedoHoming')).toContain('steers');
    expect(boonTooltipText('minePropFouling')).toContain('fouled');
    expect(boonTooltipText('starDazzle')).toContain('dazzle');
    expect(boonTooltipText('starIncendiary')).toContain('burns');
    expect(boonTooltipText('buoyGun')).toContain('5 damage');
    expect(boonTooltipText('buoyJamming')).toContain('false radar returns');
    expect(boonTooltipText('acquireBroadside')).toContain('open slot');
    expect(boonTooltipText('acquireRadarBuoy')).toContain('open slot');
  });

  it('fails open on an unwritten id rather than throwing mid-hover', () => {
    expect(boonTooltipText('notARealBoon')).toBe('');
  });

  // THE TWO BUOY VERBS' COPY RULES, pinned because both are easy to "improve"
  // back into a lie (Story 7-5 wave 2). They now bind BOTH surfaces the words
  // can reach — the hover explanation and the hotbar's holding line — because
  // R2.17 split one string into two and a rule that checked only one of them
  // would let the other drift.
  const buoySurfaces = (id: string): string[] => [
    boonTooltipText(id).toLowerCase(),
    boonEffectLine(id, effectiveStats(CONFIG.shipClasses.torpedoBoat)).toLowerCase(),
  ];

  it('GUN BUOY never claims an aggro or hostility gate — it shoots anything but you (R2.21)', () => {
    // Eric ruling 2026-08-19 SUPERSEDED R2.10: the gun buoy is autonomous and
    // fires at the nearest hull its own radar sees, NEUTRAL FLEET DRONES
    // INCLUDED. Every one of these words promises a gate it does not have.
    for (const text of buoySurfaces('buoyGun')) {
      for (const word of ['hostile', 'enemy', 'attacker', 'threat']) expect(text).not.toContain(word);
      expect(text).toContain('nearest'); // the selection rule IS the interesting half
    }
  });

  it('JAMMING BUOY never claims concealment — it denies reading, it does not hide (R2.11)', () => {
    // It ADDS fakes and never deletes a real return, and it is RADAR ONLY: the
    // ratified counter is to sail in and look, so the copy must not sell it as
    // cover and must leave truesight standing.
    for (const text of buoySurfaces('buoyJamming')) {
      for (const word of ['hide', 'hides', 'conceal', 'invisible', 'cloak']) expect(text).not.toContain(word);
    }
    // The counter rides the EXPLANATION, which is where there is room to state
    // it; the holding line has one clause and spends it on what the buoy does.
    expect(boonTooltipText('buoyJamming').toLowerCase()).toContain('sight sees the truth');
  });

  // STORY 7-5 WAVE 1 — the verbs STACK, so no verb card may still sell itself as
  // a trade against its former rival. WAVE 2 made this TOTAL: exclusivity is
  // deleted (R2.6), so EVERY doctrine card in the catalog is a stacking verb.
  it('no verb sells itself as a trade against a rival — and the two pairs say so', () => {
    const verbs = Object.values(BOON_CATALOG).filter((d) => d.effects.some((e) => e.kind === 'doctrine'));
    expect(verbs.length).toBeGreaterThanOrEqual(7);
    for (const def of verbs) {
      // "replaces" is the word the retired exclusivity grammar used, on the face
      // AND in the copy; nothing may reintroduce it. (A verb may of course say
      // what it changes about its OWN weapon — CAPTIVE MINES has to.)
      expect(boonTooltipText(def.id), def.id).not.toMatch(/\breplaces?\b/i);
    }
    // The two former exclusive pairs now state the stacking outright, which is
    // the strongest form of "this is not an either/or".
    expect(boonTooltipText('starIncendiary')).toContain('stacks with DAZZLE SHELLS');
    expect(boonTooltipText('starDazzle')).toContain('stacks with PHOSPHOR SHELLS');
  });

  // PROP FOULING is a PURE behaviour verb since cycle 95 deleted its damage
  // penalty — the shipped v1 text still claimed "Mines hit softer", which was a
  // lie on the card. It states the real slow now.
  it('PROP FOULING states the real slow and claims no damage penalty', () => {
    const text = boonTooltipText('minePropFouling');
    expect(text).toContain('25%');
    expect(text).toContain('5 seconds');
    expect(text).not.toMatch(/softer|less damage/i);
  });
});

describe('lineage handrail + doctrine-swap line', () => {
  it('marks the position a card would take out of its line\'s copies', () => {
    expect(boonLineageLine(BOON_CATALOG.shipCooldown, 0)).toBe('I/V');
    expect(boonLineageLine(BOON_CATALOG.shipCooldown, 1)).toBe('II/V');
    expect(boonLineageLine(BOON_CATALOG.torpedoSpeed, 3)).toBe('IV/IV');
    expect(boonLineageLine(BOON_CATALOG.gunBarrel, 1)).toBe('II/II');
  });

  it('shows NOTHING for a single-copy line (there is no lineage to hold)', () => {
    expect(boonLineageLine(BOON_CATALOG.gunTurret, 0)).toBeNull();
    expect(boonLineageLine(BOON_CATALOG.torpedoHoming, 0)).toBeNull();
    expect(boonLineageLine(BOON_CATALOG.acquireMine, 0)).toBeNull();
  });

  it('clamps a full stack to the last position rather than overflowing', () => {
    expect(boonLineageLine(BOON_CATALOG.shipCooldown, 9)).toBe('V/V');
  });

  // THE "REPLACES: <rival>" PINS ARE RETIRED (Story 7-5 wave 2, R2.6).
  // `boonReplacesLine` existed to name the rival of an EXCLUSIVE pair; the
  // cannon's PLUNGING FIRE / ARMOR-PIERCING was the last pair in the game, and
  // `BoonDef.exclusiveWith` left the type with it. The function is deleted
  // rather than kept as one that can only ever return null, so these two pins
  // have nothing left to assert. What replaces them is the STRUCTURAL claim
  // below: no card face can carry a swap line, because no line is exclusive.
  it('NO catalog line is exclusive any more — the swap grammar has no subject', () => {
    const tiers = new Set(Object.values(BOON_CATALOG).map((d) => d.rarity));
    expect(tiers.has('exclusive')).toBe(false);
    // The rarity LABEL is still supported (a future tier can use it) — it just
    // has no line behind it today.
    expect(boonRarityLabel('exclusive')).toBe('EXCLUSIVE');
  });
});

describe('the fitted toast', () => {
  it('names the rung that was fitted and carries the accrued-boon diamond', () => {
    expect(boonFitToastLine('shipCooldown', 1)).toBe('◆ RELOAD I FITTED');
    expect(boonFitToastLine('shipCooldown', 3)).toBe('◆ RELOAD III FITTED');
    expect(boonFitToastLine('acquireBoost', 1)).toBe('◆ EMERGENCY THROTTLE FITTED');
  });

  it('floors a defensive 0 to the ladder\'s first name', () => {
    expect(boonFitToastLine('shipCooldown', 0)).toBe('◆ RELOAD I FITTED');
  });
});

describe('the tooltip effect line (Story 2.9) — the HOLDING, not the sales pitch', () => {
  const bare = effectiveStats(CONFIG.shipClasses.torpedoBoat);

  it('reports a stat line\'s LIVE value, with no current→next arrow', () => {
    expect(boonEffectLine('shipHull', bare)).toBe(`Max hull: ${bare.maxHp}`);
    expect(boonEffectLine('shipHull', bare)).not.toContain('→');
    expect(boonEffectLine('intelSweep', bare)).toBe(`Radar sweep: ${bare.sweepRpm} RPM`);
    expect(boonEffectLine('shipCooldown', bare)).toBe('All cooldowns: 100%');
  });

  it('MOVES with the fitted stack (it reads the firewall\'s output, not CONFIG)', () => {
    const stacked = effectiveStats(CONFIG.shipClasses.torpedoBoat, resolveBoons(['shipHull', 'shipHull']));
    expect(boonEffectLine('shipHull', stacked)).not.toBe(boonEffectLine('shipHull', bare));
    expect(boonEffectLine('shipHull', stacked)).toBe(`Max hull: ${stacked.maxHp}`);
  });

  it('reports the value only — never the card\'s sales pitch or its explanation', () => {
    expect(boonEffectLine('shipHull', bare)).toBe(`Max hull: ${bare.maxHp}`);
    expect(boonEffectLine('shipHull', bare)).not.toContain('Repairs');
  });

  // R2.17 SPLIT what used to be one string. A verb card's face now prints
  // NOTHING, so the holding row cannot reuse it; and the hover EXPLANATION is
  // prose written for a first-time reader, far too long to ride inside a panel
  // whose own fit pin trims accrued rows as they grow. So the holding line is
  // its own short table, and this is the pin that says the three surfaces are
  // genuinely three.
  it('is its OWN short line for a verb — not the blank face, not the long explanation', () => {
    for (const id of ['mineCaptive', 'acquireTorpedo', 'buoyJamming']) {
      const holding = boonEffectLine(id, bare);
      expect(holding.trim().length, id).toBeGreaterThan(0);
      expect(boonDescription(BOON_CATALOG[id], { cls: 'battleship', boons: [] }), id).toBe('');
      expect(holding, id).not.toBe(boonTooltipText(id));
      // It stays SHORT: the hotbar panel's budget is what this table exists for.
      expect(holding.length, id).toBeLessThan(80);
      expect(boonTooltipText(id).length, id).toBeGreaterThan(holding.length);
    }
  });

  it('is TOTAL over the catalog — no line can be presentation-silent (FR22)', () => {
    const blank = Object.keys(BOON_CATALOG).filter((id) => boonEffectLine(id, bare).trim() === '');
    expect(blank).toEqual([]);
  });

  it('fails open on an unwritten id rather than throwing mid-hover', () => {
    expect(boonEffectLine('notARealBoon', bare)).toBe('');
  });
});
