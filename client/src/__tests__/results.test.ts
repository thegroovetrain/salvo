// Results modal pure helpers (ui/results.ts) + its DOM wiring. Story 2.3
// (amendments 22/23) reworked it into the ONE debrief surface: the elimination
// modal (personal score + placement + SPECTATE/RETURN TO PORT) and the game-end
// modal (the same score card + the placement table + RETURN TO PORT). Both
// action buttons are pinned by stable id — they are the player's only paths out.
//
// STORY 5.3 re-takes the CONTENT pins against mockup F3 (amendments 28/29/30):
// the banner reads SUNK over `9TH OF 14`, an identity line lands under it, the
// two label/value rows become three stat tiles, and the MATCH LOG arrives. The
// VERB pins above are untouched by design (amendment 23) and one new pin —
// "the action set is exactly SPECTATE + RETURN TO PORT" — makes amendment 30's
// no-instant-re-queue guarantee a test rather than a construction.
//
// STORY 9.14 (ruling R3): no banner, heading or label WORDING is pinned. Pure
// reducers are pinned on their formats (ordinals, m:ss, T+mm:ss, n/field) and
// on their branches; the DOM is pinned on structure, ids and data-* hooks, with
// the reducers themselves as the oracle for what a region paints.

import { describe, it, expect, afterEach } from 'vitest';
import {
  CONFIG,
  CONSUMABLE_SLOTS,
  DEFAULT_KIT,
  SLOT_COUNT,
  SLOT_GUN,
  consumableKindAt,
  consumableSlotFor,
  effectiveStats,
  type ConsumableKit,
  type ResultsMsg,
  type ResultsRow,
  type SlotItemId,
  type WeaponAmmo,
} from '@salvo/shared';
import { SLOT_KEY_GLYPHS } from '../render/equipmentInfo.js';
import { equipmentGlyphSvg } from '../render/equipmentIcons.js';
import { LADDER_LINE_PX, LOADOUT_PX, LOADOUT_TEXT_FLOOR_PX, ladderEntries } from '../ui/loadoutBlock.js';
import { monoTextWidth } from '../ui/refitCardFit.js';
import { LINEAGE_TIERS } from '../ui/tierRamp.js';
import {
  BANNER_HUES,
  bannerOutcome,
  closeResultsAsSpectate,
  DEATH_BANNER,
  DRAW_BANNER,
  fmtDamage,
  hideResults,
  matchLogRow,
  ordinalPlace,
  placementLine,
  resultsVisible,
  scoreSignature,
  showResults,
  sortRows,
  statTiles,
  sunkLines,
  updateResultsScore,
  winnerBanner,
  type ResultsOwn,
  type ResultsView,
} from '../ui/results.js';
import { CLIENT_CONFIG } from '../config.js';
import type { MatchLogEntry, PersonalScore } from '../score.js';
import { sanitizeName, NAME_MAX } from '../ui/home.js';
import { textSafe } from '../util/color.js';
import { CLASS_DISPLAY_NAMES } from '../ui/classSelect.js';
import { boonName } from '../ui/boonCopy.js';

/** The ship ladders in their ruled order (Stories 9.6 / 9.7 / 9.9), by ID. */
const LADDER_IDS = ['hullPoints', 'armor', 'armorPiercing', 'speed', 'turning', 'radarSweep', 'reload', 'passiveHealing'];

/** Occurrences of `needle` in `hay`. */
function count(hay: string, needle: string): number {
  return hay.split(needle).length - 1;
}

/** jsdom reports every colour back as `rgb(r, g, b)`, never as the hex it was
 *  written with — so a colour pin compares against this, not against cssHex. */
function rgbOf(v: number): string {
  return `rgb(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255})`;
}

function row(id: string, placement: number): ResultsRow {
  return { id, name: id.toUpperCase(), placement, kills: 0, damageDealt: 0 };
}

function score(over: Partial<PersonalScore> = {}): PersonalScore {
  return { boons: 2, kills: 3, sunkContestants: ['RIVAL'], placement: 4, winner: false, matchLog: [], afloatMs: null, ...over };
}

function view(over: Partial<ResultsView> = {}): ResultsView {
  return { banner: 'ELIMINATED', victory: false, score: score(), rows: null, ownId: 'b', canSpectate: true, ...over };
}

function log(tMs: number, kind: 'sank' | 'sunkBy', name: string): MatchLogEntry {
  return { tMs, kind, name };
}

/** An own hull with a build — the identity line + the LOADOUT block. The stats
 *  are the real fold over `cards`, exactly as main.ts's `g.ownStats` is. */
function own(over: Partial<ResultsOwn> = {}): ResultsOwn {
  const cards = over.cards ?? [];
  const slots: (SlotItemId | null)[] = ['gun', 'boost', ...Array.from({ length: SLOT_COUNT - 2 }, () => null)];
  return {
    name: 'TIN SPARROW',
    cls: 'torpedoBoat',
    hue: 0x00d0ff,
    cards,
    gun: 'deckGun',
    kit: DEFAULT_KIT,
    slots,
    ammo: slots.map(() => null),
    stats: effectiveStats(CONFIG.shipClasses.torpedoBoat, cards),
    ...over,
  };
}

const rep = (id: string, n: number): string[] => Array.from({ length: n }, () => id);

/** The mock fixture's KIT (Story 10.1): a NON-DEFAULT four with HULL REPAIR
 *  off key 1, so the twin is proven to read the view's kit and never a default. */
const MOCK_KIT: ConsumableKit = ['foulingShell', 'hullRepair', 'supercavTorpedo', 'shieldBlock'];
/** Where HULL REPAIR sits under MOCK_KIT — derived, never a literal slot. */
const REPAIR_SLOT = consumableSlotFor(MOCK_KIT, 'hullRepair') as number;

/**
 * THE MOCK'S FIXTURE (countdown-results-1.html frame 2): gun IV, Shift, Q light
 * torpedo III, E II, R heavy torpedo I, belt HULL REPAIR ×1 then three empties,
 * and the ladder line `ARMOR III · SPEED IV · TURNING II · RADAR SWEEP II ·
 * RELOAD III` — read since Story 9.6 (epic-9 amendments 93/94) as `HULL II ·
 * SPEED III · TURNING I · RADAR SWEEP II · RELOAD III · PASSIVE HEALING —`:
 * every ship ladder counts its own copies from nothing now. The mock's E is a machine gun II, which since Story 8.15 is a gun
 * pick and can no longer sit in E — naval mines II stand in for it (same tier).
 */
function mockOwn(
  over: { radarSweep?: number; hullRepair?: number; speed?: number; passiveHealing?: number; armor?: number } = {},
): ResultsOwn {
  const cards = [
    ...rep('deckGun', 3), // gun: 1 + copies = IV
    ...rep('lightTorpedo', 3),
    ...rep('navalMines', 2),
    'heavyTorpedo',
    ...rep('hullRepair', over.hullRepair ?? 1),
    ...rep('hullPoints', 2), // every ship ladder starts from nothing: copies = II
    ...rep('armor', over.armor ?? 1), // I (Story 9.7)
    ...rep('speed', over.speed ?? 3), // III
    'turning', // I
    ...rep('radarSweep', over.radarSweep ?? 2), // II
    ...rep('reload', 3), // III
    ...rep('passiveHealing', over.passiveHealing ?? 0), // — at zero
  ];
  const repair = over.hullRepair ?? 1;
  const slots: (SlotItemId | null)[] = [
    'gun', 'boost', 'lightTorpedo', 'navalMines', 'heavyTorpedo', ...CONSUMABLE_SLOTS.map(() => null),
  ];
  slots[REPAIR_SLOT] = repair > 0 ? 'hullRepair' : null;
  const ammo: (WeaponAmmo | null)[] = slots.map((id) => (id === null ? null : { n: 1, reloadMsLeft: 0 }));
  ammo[REPAIR_SLOT] = repair > 0 ? { n: repair, reloadMsLeft: 0 } : null;
  return own({ cards, slots, ammo, kit: MOCK_KIT });
}

describe('sortRows', () => {
  it('orders by placement ascending (winner first) without mutating the input', () => {
    const rows = [row('c', 3), row('a', 1), row('b', 2)];
    const sorted = sortRows(rows);
    expect(sorted.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(rows.map((r) => r.id)).toEqual(['c', 'a', 'b']); // untouched
  });
});

describe('winnerBanner', () => {
  const msg: ResultsMsg = { winnerId: 'a', rows: [row('a', 1), row('b', 2)] };

  it('the winner and everyone else read different banners, and the others are told who won', () => {
    const named: ResultsMsg = { winnerId: 'a', rows: [{ ...row('a', 1), name: 'KRAKEN' }, row('b', 2)] };
    const mine = winnerBanner(named, 'a');
    const theirs = winnerBanner(named, 'b');
    expect(mine).not.toBe(theirs);
    expect(theirs).toContain('KRAKEN'); // the winner's name, off the rows
    expect(mine).not.toContain('KRAKEN');
    expect(mine).not.toBe(DRAW_BANNER);
    expect(theirs).not.toBe(DRAW_BANNER);
    expect(winnerBanner(msg, 'b')).not.toBe(winnerBanner(msg, 'a'));
  });

  it('degrades gracefully when the winner is not in the rows', () => {
    const lost = winnerBanner({ winnerId: 'x', rows: [row('b', 2)] }, 'b');
    expect(lost.length).toBeGreaterThan(0);
    expect(lost).not.toMatch(/undefined|null/);
    expect(lost).not.toBe(DRAW_BANNER);
  });

  // Story 5.2 / amendment 14: an EMPTY winner is a DRAW — every remaining
  // captain sank on the same tick — not a failed name lookup. A fixed-length
  // sinking window is a constant delay, so exact ties are PRESERVED rather than
  // scattered, which is what makes this shape genuinely reachable.
  it('reads the DRAW banner for an empty winnerId, never the unknown-winner fallback', () => {
    const draw: ResultsMsg = { winnerId: '', rows: [row('a', 1), row('b', 1)] };
    expect(winnerBanner(draw, 'b')).toBe(DRAW_BANNER);
    expect(winnerBanner(draw, 'b')).not.toBe(winnerBanner({ winnerId: 'x', rows: [row('b', 2)] }, 'b'));
  });

  it('a draw never reads as anybody\'s VICTORY, even for an empty own id', () => {
    // The draw clause is tested FIRST on purpose: an own id that is somehow also
    // empty (no session, a torn-down room) must read the match's outcome rather
    // than claim a victory nobody won.
    expect(winnerBanner({ winnerId: '', rows: [] }, '')).toBe(DRAW_BANNER);
    expect(winnerBanner({ winnerId: '', rows: [] }, '')).not.toBe(winnerBanner(msg, 'a'));
  });
});

// --- STORY 6.3: A DRAW MUST NOT LOOK LIKE A LOSS (epic-6 amendment 14) --------
//
// The draw's RESOLUTION has been correct since Story 5.2 and `winnerBanner`
// above has always returned DRAW for it. What shipped wrong was the READ: the
// banner rendered in AMBER, byte-identical to a loss, so the one outcome a
// player could not tell apart from losing was the one where nobody won.
describe('bannerOutcome / BANNER_HUES — three outcomes, three hues', () => {
  it('takes the draw from the DESIGN.md `info` token, distinct from both victory and defeat', () => {
    expect(BANNER_HUES.draw).toBe(CLIENT_CONFIG.colors.info);
    expect(BANNER_HUES.victory).toBe(CLIENT_CONFIG.colors.phosphor);
    expect(BANNER_HUES.defeat).toBe(CLIENT_CONFIG.colors.amber);
    expect(new Set(Object.values(BANNER_HUES)).size).toBe(3); // no two outcomes share a hue
  });

  it('reads a game-end DRAW banner as a draw, and victory/defeat exactly as before', () => {
    const rows = [row('a', 1), row('b', 1)];
    expect(bannerOutcome(view({ banner: DRAW_BANNER, rows, canSpectate: false }))).toBe('draw');
    expect(bannerOutcome(view({ banner: 'VICTORY', victory: true, rows, canSpectate: false }))).toBe('victory');
    expect(bannerOutcome(view({ banner: 'WINNER: A', rows, canSpectate: false }))).toBe('defeat');
  });

  it('a draw is read FIRST — an empty own id can never turn it into a victory', () => {
    // Mirrors winnerBanner's own ordering rationale: `personalScoreFromResults`
    // sets `winner = msg.winnerId === ownId`, so a torn-down room with no
    // session id makes `victory` true against a drawn match.
    const drawn = view({ banner: DRAW_BANNER, victory: true, rows: [], ownId: '', canSpectate: false });
    expect(bannerOutcome(drawn)).toBe('draw');
  });

  it('an ELIMINATION is never a draw, whatever copy the caller carried', () => {
    // bannerText() owns the death register: `rows: null` always renders SUNK, so
    // the caller's banner field is not even read. Amber, exactly as it ships.
    expect(bannerOutcome(view({ banner: DRAW_BANNER }))).toBe('defeat');
    expect(bannerOutcome(view())).toBe('defeat');
  });
});

describe('fmtDamage', () => {
  it('rounds to whole hp', () => {
    expect(fmtDamage(109.6)).toBe('110');
    expect(fmtDamage(0)).toBe('0');
  });
});

describe('the personal-score reducers (amendment 23, re-taken by amendment 29)', () => {
  it('a winner is INDICATED as such instead of getting a placement number', () => {
    const line = placementLine(score({ winner: true, placement: null }));
    expect(line.length).toBeGreaterThan(0);
    expect(line).not.toMatch(/\d/);
  });

  // PIN FLIPPED (amendment 29): the shipped prose line is retired for mockup
  // F3's ordinal-of-the-field register — EXPERIENCE.md:52's dry-naval death
  // voice, which the deleted reveal stage used to carry.
  it('an eliminated player reads their place as an ordinal of the field', () => {
    const line = placementLine(score({ placement: 9 }), 14);
    expect(line.startsWith(ordinalPlace(9))).toBe(true);
    expect(line).toMatch(/\b14$/);
  });

  it('degrades to the bare ordinal rather than an `OF n` it cannot stand behind', () => {
    expect(placementLine(score({ placement: 4 }), null)).toBe(ordinalPlace(4));
    // A field smaller than the placement can only be a roster still settling.
    expect(placementLine(score({ placement: 9 }), 3)).toBe(ordinalPlace(9));
  });

  it('an underivable placement yields NO line — the banner already said SUNK', () => {
    expect(placementLine(score({ placement: null }), 14)).toBe('');
  });

  it('ordinals handle the teens, which are the whole reason this is a function', () => {
    expect([1, 2, 3, 4, 9, 11, 12, 13, 21, 22, 23].map(ordinalPlace)).toEqual([
      '1ST', '2ND', '3RD', '4TH', '9TH', '11TH', '12TH', '13TH', '21ST', '22ND', '23RD',
    ]);
  });

  // PIN FLIPPED (Story 5.3): the two label/value rows (BOONS FITTED / KILLS)
  // become mockup F3's three centered tiles — the set UX-DR27 ratified and
  // amendment 28 explicitly kept ("TIME AFLOAT STAYS").
  it('reports kills / placement / time afloat, the ratified three-tile set, in order', () => {
    const tiles = statTiles(score({ kills: 2, placement: 9, afloatMs: 387_000 }), 14);
    expect(tiles.map(({ value, tail, phosphor }) => ({ value, tail, phosphor }))).toEqual([
      { value: '2', tail: undefined, phosphor: true },
      { value: '9', tail: '/14', phosphor: undefined },
      { value: '6:27', tail: undefined, phosphor: undefined },
    ]);
    expect(new Set(tiles.map((t) => t.key)).size).toBe(3);
  });

  // REGRESSION PIN (review finding): TIME AFLOAT used the RING clock, which has
  // the right shape and the wrong direction — it CEILS, because it counts down.
  // The tile latches the same millisecond as the MATCH LOG's `SUNK BY` stamp
  // directly beneath it, so ceiling made the two read a second apart on every
  // death that did not land exactly on a second boundary. The test above could
  // not see it: 387_000 is a boundary, where ceil and floor agree.
  it('FLOORS the elapsed span, agreeing with the match log stamp beside it', () => {
    const t = 387_400; // mid-second: ceil would say 6:28, the log says T+06:27
    expect(statTiles(score({ afloatMs: t }), 14)[2].value).toBe('6:27');
    expect(matchLogRow({ tMs: t, kind: 'sunkBy', name: 'KRAKEN' }).stamp).toBe('T+06:27');
    // 1ms in is still 0:00 — a clock counting UP shows the second that has passed.
    expect(statTiles(score({ afloatMs: 1 }), 14)[2].value).toBe('0:00');
  });

  const keysOf = (s: PersonalScore): string[] => statTiles(s, 14).map((t) => t.key);

  it('omits the time-afloat tile when the match clock was never anchored (null, not 0)', () => {
    const full = keysOf(score({ afloatMs: 0 }));
    expect(full).toHaveLength(3);
    expect(keysOf(score({ afloatMs: null }))).toEqual(full.slice(0, 2));
    // 0 is a legitimate value and must still render — it cannot double as the sentinel.
    expect(statTiles(score({ afloatMs: 0 }), 14)[2].value).toBe('0:00');
  });

  it('a winner placed FIRST, and an underivable placement drops its tile', () => {
    const [, placed] = statTiles(score({ winner: true, placement: null, afloatMs: null }), 14);
    expect(placed).toMatchObject({ value: '1', tail: '/14' });
    expect(keysOf(score({ placement: null, afloatMs: null }))).toEqual(keysOf(score({ afloatMs: null })).slice(0, 1));
  });

  it('the sunk roll lists contestants one per line, or one non-blank line for none', () => {
    const lines = sunkLines(score({ sunkContestants: ['KRAKEN', 'HORNET'] }));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('KRAKEN');
    expect(lines[1]).toContain('HORNET');
    const none = sunkLines(score({ sunkContestants: [] }));
    expect(none).toHaveLength(1);
    expect(none[0].trim().length).toBeGreaterThan(0);
  });
});

// --- THE MATCH LOG (amendment 28) --------------------------------------------

describe('matchLogRow — the T+ stamp and the named contestant', () => {
  it('stamps each line with the BR chrome bar\'s T+ clock and names the other captain', () => {
    expect(matchLogRow(log(161_000, 'sank', 'SALT SHAKER')).stamp).toBe('T+02:41');
    expect(matchLogRow(log(252_000, 'sank', 'IRON KETTLE')).stamp).toBe('T+04:12');
    expect(matchLogRow(log(387_000, 'sunkBy', "KRAKEN'S BANE")).stamp).toBe('T+06:27');
    expect(matchLogRow(log(161_000, 'sank', 'SALT SHAKER')).text).toContain('SALT SHAKER');
    expect(matchLogRow(log(387_000, 'sunkBy', "KRAKEN'S BANE")).text).toContain("KRAKEN'S BANE");
    // The two kinds read differently for the same name.
    expect(matchLogRow(log(1, 'sank', 'X')).text).not.toBe(matchLogRow(log(1, 'sunkBy', 'X')).text);
  });

  it('zero-pads the minutes so the stamps column stays a column', () => {
    expect(matchLogRow(log(9_000, 'sank', 'X')).stamp).toBe('T+00:09');
  });
});

describe('showResults — the elimination modal', () => {
  afterEach(() => {
    hideResults();
    document.body.replaceChildren();
  });

  const returnButton = (): HTMLButtonElement | null => document.querySelector('#results-return');
  const spectateButton = (): HTMLButtonElement | null => document.querySelector('#results-spectate');

  it('renders the personal score, the placement, and BOTH actions while the match is live', () => {
    showResults(view({ fieldSize: 14 }), { onSpectate: () => undefined, onReturn: () => undefined });
    const text = document.getElementById('results-overlay')?.textContent ?? '';
    expect(text).toContain(DEATH_BANNER); // amendment 29 — the death register
    expect(text).not.toContain('ELIMINATED'); // ...the caller's banner field is never read on a death
    expect(text).toContain(placementLine(score(), 14));
    expect(text).toContain('RIVAL'); // the sunk roll, off the score
    expect(spectateButton()).not.toBeNull();
    expect(returnButton()).not.toBeNull();
    expect(resultsVisible()).toBe(true);
  });

  // AMENDMENT 30, in the strongest terms the ledger has recorded: *"I DO NOT
  // WANT INSTANT REQUE. You MUST return to the home screen to requeue. MUST."*
  // The guarantee has always been structural (there is no code path from this
  // modal into a match); this pin is what stops a later story drifting one in.
  it('THE ACTION SET IS EXACTLY SPECTATE + RETURN TO PORT — never a re-queue', () => {
    showResults(view({ own: own(), fieldSize: 14 }), { onSpectate: () => undefined, onReturn: () => undefined });
    const actions = [...document.querySelectorAll('#results-overlay button')];
    // Exactly the two exits, by id — nothing else on the modal is a control.
    expect(actions).toEqual([spectateButton(), returnButton()]);
  });

  it('at GAME END the action set is RETURN TO PORT alone, and only there does it wear the ⏎ chip', () => {
    // Enter returns to port ONLY when the match is over (main.ts handleConfirm),
    // so the key chip is game-end only: a chip on the elimination modal would
    // promise a key that does nothing. Amendment 23 froze the key law; the
    // affordance follows it rather than the other way round.
    expect(returnButton()).toBeNull();
    showResults(view({ canSpectate: true }), { onSpectate: () => undefined, onReturn: () => undefined });
    expect(returnButton()?.textContent).not.toContain('⏎');
    hideResults();
    showResults(view({ rows: [row('a', 1), row('b', 2)], canSpectate: false }), {
      onSpectate: () => undefined,
      onReturn: () => undefined,
    });
    expect([...document.querySelectorAll('#results-overlay button')]).toHaveLength(1);
    expect(returnButton()?.textContent?.startsWith('⏎')).toBe(true);
  });

  it('lands the identity line — callsign in the own hue, then the class', () => {
    // A DARK hue on purpose: the callsign wears the WCAG-lifted variant the kill
    // feed and the chrome bar use, so the rendered colour must differ from the
    // raw personal hue (the mockup's own legend calls for exactly this).
    const hue = 0x4b3073;
    showResults(view({ own: own({ hue }) }), { onSpectate: () => undefined, onReturn: () => undefined });
    const text = document.getElementById('results-overlay')?.textContent ?? '';
    expect(text).toContain('TIN SPARROW');
    expect(text.indexOf('TIN SPARROW')).toBeLessThan(text.indexOf(CLASS_DISPLAY_NAMES.torpedoBoat));
    const name = [...document.querySelectorAll<HTMLElement>('#results-overlay span')].find(
      (s) => s.textContent === 'TIN SPARROW',
    );
    expect(name?.style.color).toBe(rgbOf(textSafe(hue)));
    expect(textSafe(hue)).not.toBe(hue);
    expect(name?.style.fontWeight).toBe('600');
  });

  it('omits the identity line and the LOADOUT block when there is no own hull to describe', () => {
    showResults(view(), { onSpectate: () => undefined, onReturn: () => undefined });
    const text = document.getElementById('results-overlay')?.textContent ?? '';
    expect(text).not.toContain('TIN SPARROW');
    expect(document.querySelector('[data-loadout-block]')).toBeNull();
  });

  // STORY 8.21 — THE LOADOUT BLOCK (UX-DR55, FR60): the bar's own slot row at
  // .72 plus the five-ladder line, replacing the two pre-pool build blocks.
  describe('the LOADOUT block', () => {
    const block = (): HTMLElement => {
      const el = document.querySelector<HTMLElement>('[data-loadout-block]');
      if (el === null) throw new Error('no LOADOUT block');
      return el;
    };
    const square = (slot: number): HTMLElement => {
      const el = block().querySelector<HTMLElement>(`[data-loadout-slot="${slot}"]`);
      if (el === null) throw new Error(`no square ${slot}`);
      return el;
    };
    const tierOf = (slot: number): HTMLElement | null => square(slot).querySelector<HTMLElement>('[data-loadout-tier]');
    const open = (o: ResultsOwn): void => showResults(view({ own: o }), { onSpectate: () => undefined, onReturn: () => undefined });

    it('draws one square per slot on ONE row, weapons then the framed kit belt, each over its key chip', () => {
      open(mockOwn());
      expect(block().querySelectorAll('[data-loadout-slot]')).toHaveLength(SLOT_COUNT);
      // The live bar's one row (Story 9.11, epic-9 amendment 151): the main
      // group first, then the framed belt in key order — the bar's own chips,
      // with the gun's ghost.
      const chips = [...block().querySelectorAll('[data-loadout-chip]')].map((c) => c.textContent);
      expect(chips).toEqual(SLOT_KEY_GLYPHS.map((g, slot) => (slot === SLOT_GUN ? '·' : g)));
      const slots = [...block().querySelectorAll<HTMLElement>('[data-loadout-slot]')].map((e) => Number(e.dataset.loadoutSlot));
      expect(slots).toEqual([0, 1, 2, 3, 4, ...CONSUMABLE_SLOTS]);
      // One row: a horizontal flex, not a column.
      const row = block().querySelector<HTMLElement>('[data-loadout-row]');
      expect(row?.style.flexDirection).not.toBe('column');
      // The gun's chip is a GHOST: laid out for the baseline, never seen.
      expect((block().querySelector('[data-loadout-chip="0"]') as HTMLElement).style.color).toBe('transparent');
    });

    it('frames the kit\'s belt squares (and only them) in the bar\'s 1px silver hairline', () => {
      open(mockOwn());
      const belt = block().querySelector<HTMLElement>('[data-loadout-belt]');
      if (belt === null) throw new Error('no belt frame');
      expect(belt.style.borderStyle).toBe('solid');
      expect(belt.style.borderWidth).toBe('1px');
      const inside = [...belt.querySelectorAll<HTMLElement>('[data-loadout-slot]')].map((e) => Number(e.dataset.loadoutSlot));
      expect(inside).toEqual([...CONSUMABLE_SLOTS]);
      const chipsInside = [...belt.querySelectorAll('[data-loadout-chip]')].map((c) => c.textContent);
      expect(chipsInside).toEqual(CONSUMABLE_SLOTS.map((slot) => SLOT_KEY_GLYPHS[slot]));
    });

    it('the one row (main group, group gap, framed belt) fits the panel\'s 530 px content column', () => {
      const P = LOADOUT_PX;
      const main = 5 * P.slot + 4 * P.slotGap;
      const belt = 2 * P.beltPadSide + CONSUMABLE_SLOTS.length * P.beltSlot + (CONSUMABLE_SLOTS.length - 1) * P.beltGap + 2; // + its 1px borders
      expect(main + P.groupGap + belt).toBeLessThanOrEqual(530);
    });

    it('squares are the bar × .72 (weapons 54→39, belt 44→32) and every fitted square wears its glyph', () => {
      open(mockOwn());
      expect(LOADOUT_PX.slot).toBe(Math.round(CLIENT_CONFIG.hudBar.slot * 0.72));
      expect(LOADOUT_PX.beltSlot).toBe(Math.round(CLIENT_CONFIG.hudBar.beltSlot * 0.72));
      expect(square(0).style.width).toBe(`${LOADOUT_PX.slot}px`);
      expect(square(REPAIR_SLOT).style.width).toBe(`${LOADOUT_PX.beltSlot}px`);
      // Every fitted square — the belt's HULL REPAIR included, which takes its
      // rod of Asclepius (cycle 162) from the ONE glyph source
      // (equipmentIcons.ts), never art drawn by this block.
      for (const slot of [0, 1, 2, 3, 4, REPAIR_SLOT]) expect(square(slot).querySelector('svg'), `slot ${slot}`).not.toBeNull();
      expect(square(REPAIR_SLOT).style.borderStyle).toBe('solid');
    });

    it('prints the tier numerals on the absolute ramp — gun IV, Q III, E II, R I — and none on Shift', () => {
      open(mockOwn());
      const expected: [number, string, number][] = [[0, 'IV', 3], [2, 'III', 2], [3, 'II', 1], [4, 'I', 0]];
      for (const [slot, numeral, rung] of expected) {
        expect(tierOf(slot)?.textContent, `slot ${slot}`).toBe(numeral);
        expect(tierOf(slot)?.style.color, `slot ${slot}`).toBe(LINEAGE_TIERS[rung]);
      }
      expect(tierOf(1)).toBeNull(); // Shift carries no rung
      for (const slot of CONSUMABLE_SLOTS) expect(tierOf(slot), `consumable ${slot}`).toBeNull();
    });

    it('badges the stock `×1` and draws the other zero-stock kinds DASHED with their own faint glyph (no ×0, no word)', () => {
      open(mockOwn());
      expect(square(REPAIR_SLOT).querySelector('[data-loadout-badge]')?.textContent).toBe('×1');
      for (const slot of CONSUMABLE_SLOTS.filter((s) => s !== REPAIR_SLOT)) {
        const svg = square(slot).querySelector<SVGElement>('svg');
        expect(svg, `consumable ${slot}`).not.toBeNull(); // the kind's own glyph…
        expect(svg?.dataset.loadoutZeroStock, `consumable ${slot}`).toBe('');
        expect(Number(svg?.style.opacity), `consumable ${slot}`).toBeCloseTo(0.45, 9); // …faint
        expect(square(slot).querySelector('[data-loadout-badge]')).toBeNull();
        expect(square(slot).style.borderStyle).toBe('dashed');
      }
      expect(block().textContent).not.toContain('×0');
    });

    it('a zero-stock square wears THE VIEW\'S kit\'s kind at that slot (Story 10.1), not a default kit\'s', () => {
      open(mockOwn({ hullRepair: 0 }));
      for (const slot of CONSUMABLE_SLOTS) {
        const kind = consumableKindAt(MOCK_KIT, slot);
        if (kind === null) throw new Error(`no kind at ${slot}`);
        const want = equipmentGlyphSvg(kind, LOADOUT_PX.beltIcon)?.innerHTML;
        expect(square(slot).querySelector('svg')?.innerHTML, `slot ${slot}`).toBe(want);
      }
      expect(CONSUMABLE_SLOTS.some((s) => consumableKindAt(MOCK_KIT, s) !== consumableKindAt(DEFAULT_KIT, s))).toBe(true);
    });

    it('a stack fired to zero reads as its ZERO-STOCK square (Eric R4, amendment 34)', () => {
      open(mockOwn({ hullRepair: 0 }));
      expect(square(REPAIR_SLOT).querySelector('svg')?.dataset.loadoutZeroStock).toBe('');
      expect(square(REPAIR_SLOT).style.borderStyle).toBe('dashed');
      expect(block().querySelectorAll('[data-loadout-badge]')).toHaveLength(0);
    });

    it('renders no line NAME on the row — the glyph is the name', () => {
      open(mockOwn());
      // Strip the three text-bearing parts the row is allowed (key chip, tier
      // numeral, stock badge): nothing else on it may carry text.
      const row = block().querySelector('[data-loadout-row]')?.cloneNode(true) as HTMLElement;
      row.querySelectorAll('[data-loadout-chip], [data-loadout-tier], [data-loadout-badge]').forEach((el) => el.remove());
      expect(row.querySelectorAll('svg').length).toBeGreaterThan(0); // the glyphs are still there
      expect((row.textContent ?? '').trim()).toBe('');
    });

    it('the ladder line reads each ship ladder\'s copies as its numeral, on the tier ramp', () => {
      // Story 9.6 (epic-9 amendments 93/94): HULL / SPEED / TURNING count from
      // nothing like RADAR SWEEP and RELOAD, and PASSIVE HEALING joins last;
      // ARMOR sits right after HULL (Story 9.7, Eric 2026-10-13); ARMOR
      // PIERCING right after ARMOR (Story 9.9, epic-9 amendment 159).
      open(mockOwn());
      const numerals = [...block().querySelectorAll<HTMLElement>('[data-loadout-ladder] > div > span > span')];
      // In the ruled ladder order: HULL II, ARMOR I, ARMOR PIERCING —, SPEED III,
      // TURNING I, RADAR SWEEP II, RELOAD III, PASSIVE HEALING —.
      expect(numerals.map((n) => n.textContent)).toEqual(['II', 'I', '—', 'III', 'I', 'II', 'III', '—']);
      // TWO ROWS, FOUR OVER FOUR (Eric's pick, Story 9.9, epic-9 amendment 160;
      // four over three since amendment 114, two rows of three since amendment
      // 99): no separator crosses the row break.
      const rows = [...block().querySelectorAll<HTMLElement>('[data-loadout-ladder] > div')];
      expect(rows).toHaveLength(2);
      for (const r of rows) {
        const kids = [...r.children];
        expect(kids.filter((k) => k.children.length > 0)).toHaveLength(4); // an entry carries its numeral
        expect(kids[0].children.length, 'no separator leads a row').toBeGreaterThan(0);
        expect(kids.at(-1)!.children.length, 'no separator trails a row').toBeGreaterThan(0);
      }
      // HULL, ARMOR, (ARMOR PIERCING dashes), SPEED, TURNING, RADAR SWEEP, RELOAD.
      expect([0, 1, 3, 4, 5, 6].map((k) => numerals[k].style.color)).toEqual(
        [1, 0, 2, 0, 1, 2].map((i) => LINEAGE_TIERS[i]),
      );
    });

    // THE 4 + 4 SPLIT FITS (Story 9.9, epic-9 amendment 160): each row of the
    // ladder line, at its WIDEST numerals (III on every entry — the longest
    // roman up to the cap of V), stays inside the panel's 530 px content
    // column. The mono model mirrors makeLadderLine/makeLadderEntry's CSS:
    // labels 10 px at .16em, numerals 11 px at .1em after a 6 px margin, and a
    // `·` separator at the label type with 12 px margins either side.
    it('each row of the 4 + 4 ladder line fits the 530 px column at its widest numerals', () => {
      const COLUMN = 530;
      const L = LADDER_LINE_PX;
      const label = (t: string): number => monoTextWidth(t, L.labelPx, L.labelPx * L.labelTrackingEm);
      const numeral = L.numeralGapPx + monoTextWidth('III', L.numeralPx, L.numeralPx * L.numeralTrackingEm);
      const sep = label('·') + 2 * L.separatorMarginPx;
      const rowW = (labels: readonly string[]): number =>
        labels.reduce((w, l) => w + label(l) + numeral, 0) + sep * (labels.length - 1);
      const labels = ladderEntries([]).map((e) => e.label);
      expect(labels).toEqual(LADDER_IDS.map((id) => boonName(id))); // the ruled order, by line id
      const rows = [labels.slice(0, 4), labels.slice(4)];
      for (const r of rows) expect(rowW(r), r.join(' · ')).toBeLessThanOrEqual(COLUMN);
    });

    it('a ladder at zero copies reads `—` in the muted label colour (Eric R2), all eight still listed', () => {
      // The I/O matrix row: 0 × SPEED dashes, 3 × PASSIVE HEALING prints III.
      open(mockOwn({ speed: 0, passiveHealing: 3 }));
      const shownMarks = [...block().querySelectorAll<HTMLElement>('[data-loadout-ladder] > div > span > span')];
      expect(shownMarks.map((m) => m.textContent)).toEqual(['II', 'I', '—', '—', 'I', 'II', 'III', 'III']);
      const entries = ladderEntries([]);
      expect(entries).toHaveLength(LADDER_IDS.length);
      // Every ship ladder starts from nothing (amendment 94; ARMOR too, Story
      // 9.7, epic-9 amendments 110–117; ARMOR PIERCING too, Story 9.9, epic-9
      // amendment 159), so all eight dash.
      expect(entries.map((e) => e.tier)).toEqual([null, null, null, null, null, null, null, null]);
      const marks = [...block().querySelectorAll<HTMLElement>('[data-loadout-ladder] > div > span > span')];
      for (const dash of [marks[2], marks[3]]) { // ARMOR PIERCING (no copies) and SPEED (0)
        expect(dash.textContent).toBe('—');
        expect(dash.style.color).toBe('var(--hc-text-muted)');
      }
    });

    // THE 9 PX FLOOR (amendment 43): the squares scale, the text does not. Every
    // element that carries text reads its size from itself or its nearest sized
    // ancestor inside the block — and none is under the floor.
    it('THE 9 PX FLOOR — no text in the block renders under 9 px', () => {
      open(mockOwn({ radarSweep: 0 }));
      // jsdom keeps a `font:` shorthand whose family is a `var()` verbatim but
      // never expands it into `fontSize`, so the size is read off the declaration
      // text: a `font-size` longhand, else the shorthand's first px length.
      const ownSize = (e: HTMLElement): number | null => {
        const css = e.getAttribute('style') ?? '';
        const m = /font-size:\s*([\d.]+)px/.exec(css) ?? /font:[^;]*?([\d.]+)px/.exec(css);
        return m === null ? null : parseFloat(m[1]);
      };
      const sizeOf = (el: HTMLElement | null): number => {
        for (let e = el; e !== null; e = e.parentElement) {
          const px = ownSize(e);
          if (px !== null) return px;
        }
        return Number.NaN;
      };
      const texted = [block(), ...block().querySelectorAll<HTMLElement>('*')].filter((el) =>
        [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== ''),
      );
      expect(texted.length).toBeGreaterThan(20); // head + 11 chips + 4 marks + 1 badge + ladder
      for (const el of texted) {
        const px = sizeOf(el);
        expect(Number.isFinite(px), `"${el.textContent}" has no font size`).toBe(true);
        expect(px, `"${el.textContent}"`).toBeGreaterThanOrEqual(LOADOUT_TEXT_FLOOR_PX);
      }
    });
  });

  it('renders the MATCH LOG in order, and omits the whole block when it is empty', () => {
    showResults(
      view({
        score: score({
          matchLog: [log(161_000, 'sank', 'SALT SHAKER'), log(252_000, 'sank', 'IRON KETTLE'), log(387_000, 'sunkBy', 'KRAKENS BANE')],
        }),
      }),
      { onSpectate: () => undefined, onReturn: () => undefined },
    );
    const text = document.getElementById('results-overlay')?.textContent ?? '';
    const card = (): HTMLElement => document.getElementById('results-overlay')?.children[0]?.children[2] as HTMLElement;
    const withLog = card().children.length;
    expect(text).toContain('T+02:41');
    expect(text).toContain(matchLogRow(log(161_000, 'sank', 'SALT SHAKER')).text);
    expect(text).toContain(matchLogRow(log(387_000, 'sunkBy', 'KRAKENS BANE')).text);
    expect(text.indexOf('T+02:41')).toBeLessThan(text.indexOf('T+04:12'));
    expect(text.indexOf('T+04:12')).toBeLessThan(text.indexOf('T+06:27'));

    hideResults();
    showResults(view(), { onSpectate: () => undefined, onReturn: () => undefined });
    expect(document.getElementById('results-overlay')?.textContent ?? '').not.toContain('T+');
    expect(card().children.length).toBe(withLog - 1); // the whole block, not just its rows
  });

  it('SPECTATE closes the modal and hands control to the spectate view', () => {
    let spectates = 0;
    showResults(view(), { onSpectate: () => (spectates += 1), onReturn: () => undefined });
    spectateButton()?.click();
    expect(spectates).toBe(1);
    expect(resultsVisible()).toBe(false);
  });

  it('ESC on the modal is EXACTLY pressing SPECTATE (amendment 23)', () => {
    let spectates = 0;
    showResults(view(), { onSpectate: () => (spectates += 1), onReturn: () => undefined });
    closeResultsAsSpectate();
    expect(spectates).toBe(1);
    expect(resultsVisible()).toBe(false);
    closeResultsAsSpectate(); // idempotent: nothing open, nothing fires
    expect(spectates).toBe(1);
  });

  it('fires the return callback exactly once per click', () => {
    let returns = 0;
    showResults(view(), { onSpectate: () => undefined, onReturn: () => (returns += 1) });
    returnButton()?.click();
    expect(returns).toBe(1);
  });

  it('a second showResults leaves exactly ONE overlay, whose buttons are live', () => {
    let first = 0;
    let second = 0;
    showResults(view(), { onSpectate: () => undefined, onReturn: () => (first += 1) });
    const stale = returnButton();
    showResults(view(), { onSpectate: () => undefined, onReturn: () => (second += 1) }); // resume re-delivery
    expect(document.querySelectorAll('#results-overlay')).toHaveLength(1);
    const live = returnButton();
    expect(live).not.toBe(stale); // the old overlay (and its listener) is gone
    live?.click();
    expect(second).toBe(1);
    expect(first).toBe(0); // the replaced overlay can never fire a second chain
  });
});

describe('showResults — the game-end modal', () => {
  afterEach(() => {
    hideResults();
    document.body.replaceChildren();
  });

  const msg: ResultsMsg = { winnerId: 'a', rows: [row('a', 1), row('b', 2)] };

  it('adds the placement table and drops SPECTATE (nothing left to watch)', () => {
    showResults(view({ banner: winnerBanner(msg, 'b'), rows: msg.rows, canSpectate: false }), {
      onSpectate: () => undefined,
      onReturn: () => undefined,
    });
    const text = document.getElementById('results-overlay')?.textContent ?? '';
    expect(text).toContain(winnerBanner(msg, 'b'));
    // The placement table: a header row plus one row per captain.
    expect(document.querySelectorAll('#results-overlay table tr')).toHaveLength(1 + msg.rows.length);
    expect(document.querySelector('#results-spectate')).toBeNull();
    expect(document.querySelector('#results-return')).not.toBeNull();
  });

  it('the game-end modal draws the same LOADOUT block, after the score card and before the table', () => {
    showResults(view({ banner: winnerBanner(msg, 'b'), rows: msg.rows, canSpectate: false, own: mockOwn() }), {
      onSpectate: () => undefined,
      onReturn: () => undefined,
    });
    expect(document.querySelectorAll('[data-loadout-block]')).toHaveLength(1);
    const kids = [...(document.getElementById('results-overlay')?.children[0]?.children ?? [])];
    const iCard = kids.findIndex((k) => (k.textContent ?? '').includes('RIVAL')); // the sunk roll lives in the card
    const iLoadout = kids.indexOf(document.querySelector('[data-loadout-block]') as Element);
    const iTable = kids.indexOf(document.querySelector('#results-overlay table')?.parentElement as Element);
    expect(iCard).toBeGreaterThanOrEqual(0);
    expect(iCard).toBeLessThan(iLoadout);
    expect(iLoadout).toBeLessThan(iTable);
  });

  it('a WINNER gets the winner indication rather than a placement', () => {
    showResults(
      view({ banner: 'VICTORY', victory: true, score: score({ winner: true, placement: null }), rows: msg.rows, canSpectate: false }),
      { onSpectate: () => undefined, onReturn: () => undefined },
    );
    const text = document.getElementById('results-overlay')?.textContent ?? '';
    expect(text).toContain('VICTORY'); // the banner the caller passed
    expect(text).toContain(placementLine(score({ winner: true, placement: null })));
  });

  // STORY 6.3 / amendment 14 — the hue on the actual rendered banner, not just
  // on the pure helper. The banner is the panel's first child.
  const bannerEl = (): HTMLElement | undefined =>
    document.getElementById('results-overlay')?.children[0]?.children[0] as HTMLElement | undefined;

  it('renders a DRAW in `info` — never the amber a LOSS wears', () => {
    const drawn: ResultsMsg = { winnerId: '', rows: [row('a', 1), row('b', 1)] };
    showResults(view({ banner: winnerBanner(drawn, 'b'), rows: drawn.rows, canSpectate: false }), {
      onSpectate: () => undefined,
      onReturn: () => undefined,
    });
    expect(bannerEl()?.textContent).toBe(DRAW_BANNER);
    expect(bannerEl()?.style.color).toBe(rgbOf(CLIENT_CONFIG.colors.info));
    expect(bannerEl()?.style.color).not.toBe(rgbOf(CLIENT_CONFIG.colors.amber));
    expect(bannerEl()?.style.color).not.toBe(rgbOf(CLIENT_CONFIG.colors.phosphor));
  });

  it('leaves VICTORY phosphor and DEFEAT amber exactly as they ship', () => {
    showResults(view({ banner: 'VICTORY', victory: true, rows: msg.rows, canSpectate: false }), {
      onSpectate: () => undefined,
      onReturn: () => undefined,
    });
    expect(bannerEl()?.style.color).toBe(rgbOf(CLIENT_CONFIG.colors.phosphor));
    hideResults();
    showResults(view({ banner: winnerBanner(msg, 'b'), rows: msg.rows, canSpectate: false }), {
      onSpectate: () => undefined,
      onReturn: () => undefined,
    });
    expect(bannerEl()?.style.color).toBe(rgbOf(CLIENT_CONFIG.colors.amber));
    hideResults();
    showResults(view(), { onSpectate: () => undefined, onReturn: () => undefined }); // elimination
    expect(bannerEl()?.textContent).toBe(DEATH_BANNER);
    expect(bannerEl()?.style.color).toBe(rgbOf(CLIENT_CONFIG.colors.amber));
  });
});

describe('sanitizeName', () => {
  it('trims whitespace and caps the length', () => {
    expect(sanitizeName('  SALTY DOG  ')).toBe('SALTY DOG');
    expect(sanitizeName('X'.repeat(40))).toHaveLength(NAME_MAX);
    expect(sanitizeName('   ')).toBe('');
  });

  // REGRESSION (Story 2.3 review gate): the client entry sanitizer must strip
  // exactly what the server strips, or what you type is not what anyone sees.
  it('strips control / format code points before trimming and capping', () => {
    expect(sanitizeName('\u200b\u200b\u200b')).toBe(''); // zero-width only ⇒ server assigns
    expect(sanitizeName('AB\u202eCD')).toBe('ABCD'); // bidi override removed
    expect(sanitizeName('OLD\u0000SALT')).toBe('OLDSALT');
    // The strip runs BEFORE the cap, so invisibles can't eat visible characters.
    expect(sanitizeName('\u200b'.repeat(20) + 'HORNET')).toBe('HORNET');
  });
});

// --- REGRESSION: the open modal converges on server truth ---------------------

describe('updateResultsScore — an open elimination modal re-renders in place', () => {
  afterEach(() => {
    hideResults();
    document.body.replaceChildren();
  });

  function text(): string {
    return document.getElementById('results-overlay')?.textContent ?? '';
  }

  it('is a no-op when nothing is open', () => {
    expect(() => updateResultsScore(score())).not.toThrow();
    expect(resultsVisible()).toBe(false);
  });

  it('refreshes placement, kills and the sunk roll as the roster catches up', () => {
    showResults(view({ fieldSize: 14 }), { onSpectate: () => undefined, onReturn: () => undefined });
    expect(text()).toContain(placementLine(score(), 14));
    // The roster applied the same-tick deaths and the mutual-kill credit.
    updateResultsScore(score({ placement: 2, kills: 4, sunkContestants: ['RIVAL', 'HORNET'] }));
    expect(text()).toContain(placementLine(score({ placement: 2 }), 14)); // the field is remembered across the refresh
    expect(text()).not.toContain(placementLine(score(), 14));
    expect(text()).toContain('HORNET');
  });

  // A kill scored during our own five-second sinking window (Story 5.2,
  // amendment 11 — you go down SHOOTING) folds in AFTER the modal is up, so the
  // log has to reach the screen through the in-place refresh. It must arrive
  // exactly once, in order, and leave the section order alone.
  it('a MATCH LOG line landing after the modal opened is appended once, in place', () => {
    const first = [log(161_000, 'sank', 'SALT SHAKER'), log(387_000, 'sunkBy', 'KRAKENS BANE')];
    showResults(view({ score: score({ matchLog: first }), own: mockOwn() }), {
      onSpectate: () => undefined,
      onReturn: () => undefined,
    });
    const panel = document.getElementById('results-overlay')?.children[0];
    const before = [...(panel?.children ?? [])].length;
    updateResultsScore(score({ matchLog: [...first, log(390_000, 'sank', 'IRON KETTLE')] }));

    const t = text();
    expect(count(t, 'SALT SHAKER')).toBe(1); // no duplicate rows
    expect(count(t, 'KRAKENS BANE')).toBe(1);
    expect(t).toContain(matchLogRow(log(390_000, 'sank', 'IRON KETTLE')).text);
    // Order preserved — the new line lands after the old ones, not before them.
    expect(t.indexOf('SALT SHAKER')).toBeLessThan(t.indexOf('KRAKENS BANE'));
    expect(t.indexOf('KRAKENS BANE')).toBeLessThan(t.indexOf('IRON KETTLE'));
    // And the panel's section order is untouched (the card is REPLACED in place,
    // so the LOADOUT block stays below it rather than being shuffled above).
    expect([...(panel?.children ?? [])].length).toBe(before);
    expect(t.indexOf('T+06:30')).toBeLessThan(t.indexOf('RIVAL')); // the log above the sunk roll
    const kids = [...(panel?.children ?? [])];
    const iCard = kids.findIndex((k) => (k.textContent ?? '').includes('RIVAL'));
    expect(iCard).toBeLessThan(kids.indexOf(document.querySelector('[data-loadout-block]') as Element));
  });

  it('leaves the ACTIONS alone — the only paths out survive a refresh', () => {
    let spectates = 0;
    showResults(view(), { onSpectate: () => (spectates += 1), onReturn: () => undefined });
    const spectate = document.querySelector<HTMLButtonElement>('#results-spectate');
    updateResultsScore(score({ placement: 1 }));
    expect(document.querySelector('#results-spectate')).toBe(spectate); // same node
    spectate?.click();
    expect(spectates).toBe(1);
  });

  it('touches nothing when the numbers have not moved (signature guard)', () => {
    showResults(view(), { onSpectate: () => undefined, onReturn: () => undefined });
    const card = document.getElementById('results-overlay')?.children[0]?.children[2];
    updateResultsScore(score()); // identical score
    expect(document.getElementById('results-overlay')?.children[0]?.children[2]).toBe(card);
    expect(scoreSignature(score())).toBe(scoreSignature(score()));
  });

  it('a closed modal drops its mount — a later refresh cannot resurrect it', () => {
    showResults(view(), { onSpectate: () => undefined, onReturn: () => undefined });
    hideResults();
    updateResultsScore(score({ placement: 1 }));
    expect(resultsVisible()).toBe(false);
  });
});
