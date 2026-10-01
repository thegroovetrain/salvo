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

import { describe, it, expect, afterEach } from 'vitest';
import { CONFIG, effectiveStats, type ResultsMsg, type ResultsRow, type SlotItemId, type WeaponAmmo } from '@salvo/shared';
import { LOADOUT_PX, LOADOUT_TEXT_FLOOR_PX, ladderEntries } from '../ui/loadoutBlock.js';
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
  const slots: (SlotItemId | null)[] = ['gun', 'boost', null, null, null, null, null, null, null];
  return {
    name: 'TIN SPARROW',
    cls: 'torpedoBoat',
    hue: 0x00d0ff,
    cards,
    gun: 'deckGun',
    slots,
    ammo: slots.map(() => null),
    stats: effectiveStats(CONFIG.shipClasses.torpedoBoat, cards),
    ...over,
  };
}

const rep = (id: string, n: number): string[] => Array.from({ length: n }, () => id);

/**
 * THE MOCK'S FIXTURE (countdown-results-1.html frame 2): gun IV, Shift, Q light
 * torpedo III, E II, R heavy torpedo I, belt HULL REPAIR ×1 then three empties,
 * and the ladder line `ARMOR III · SPEED IV · TURNING II · RADAR SWEEP II ·
 * RELOAD III`. The mock's E is a machine gun II, which since Story 8.15 is a gun
 * pick and can no longer sit in E — naval mines II stand in for it (same tier).
 */
function mockOwn(over: { radarSweep?: number; hullRepair?: number } = {}): ResultsOwn {
  const cards = [
    ...rep('deckGun', 3), // gun: 1 + copies = IV
    ...rep('lightTorpedo', 3),
    ...rep('navalMines', 2),
    'heavyTorpedo',
    ...rep('hullRepair', over.hullRepair ?? 1),
    ...rep('armor', 2), // base line: 1 + copies = III
    ...rep('speed', 3), // IV
    'turning', // II
    ...rep('radarSweep', over.radarSweep ?? 2), // starts from nothing: copies = II
    ...rep('reload', 3), // III
  ];
  const repair = over.hullRepair ?? 1;
  const slots: (SlotItemId | null)[] = [
    'gun', 'boost', 'lightTorpedo', 'navalMines', 'heavyTorpedo', repair > 0 ? 'hullRepair' : null, null, null, null,
  ];
  const ammo: (WeaponAmmo | null)[] = slots.map((id) => (id === null ? null : { n: 1, reloadMsLeft: 0 }));
  ammo[5] = repair > 0 ? { n: repair, reloadMsLeft: 0 } : null;
  return own({ cards, slots, ammo });
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

  it('is VICTORY for the winner, WINNER: name for everyone else', () => {
    expect(winnerBanner(msg, 'a')).toBe('VICTORY');
    expect(winnerBanner(msg, 'b')).toBe('WINNER: A');
  });

  it('degrades gracefully when the winner is not in the rows', () => {
    expect(winnerBanner({ winnerId: 'x', rows: [row('b', 2)] }, 'b')).toBe('WINNER: UNKNOWN');
  });

  // Story 5.2 / amendment 14: an EMPTY winner is a DRAW — every remaining
  // captain sank on the same tick — not a failed name lookup. A fixed-length
  // sinking window is a constant delay, so exact ties are PRESERVED rather than
  // scattered, which is what makes this shape genuinely reachable.
  it('reads DRAW for an empty winnerId, never `WINNER: UNKNOWN`', () => {
    const draw: ResultsMsg = { winnerId: '', rows: [row('a', 1), row('b', 1)] };
    expect(winnerBanner(draw, 'b')).toBe('DRAW');
    expect(winnerBanner(draw, 'b')).not.toContain('UNKNOWN');
  });

  it('a draw never reads as anybody\'s VICTORY, even for an empty own id', () => {
    // The draw clause is tested FIRST on purpose: an own id that is somehow also
    // empty (no session, a torn-down room) must read the match's outcome rather
    // than claim a victory nobody won.
    expect(winnerBanner({ winnerId: '', rows: [] }, '')).toBe('DRAW');
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
    expect(BANNER_HUES.draw).toBe(0x38bdf8); // DESIGN.md `info` #38BDF8
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

describe('the personal-score copy (amendment 23, re-taken by amendment 29)', () => {
  it('a winner is INDICATED as such instead of getting a placement number', () => {
    expect(placementLine(score({ winner: true, placement: null }))).toContain('WON');
    expect(placementLine(score({ winner: true, placement: null }))).not.toContain('#');
  });

  // PIN FLIPPED (amendment 29): the shipped `ELIMINATED — PLACE #4` prose line
  // is retired for mockup F3's `9TH OF 14` register — EXPERIENCE.md:52's
  // dry-naval death voice, which the deleted reveal stage used to carry.
  it('an eliminated player reads their place as an ordinal of the field', () => {
    expect(placementLine(score({ placement: 9 }), 14)).toBe('9TH OF 14');
    expect(placementLine(score({ placement: 4 }), 14)).not.toContain('PLACE #');
  });

  it('degrades to the bare ordinal rather than an `OF n` it cannot stand behind', () => {
    expect(placementLine(score({ placement: 4 }), null)).toBe('4TH');
    // A field smaller than the placement can only be a roster still settling.
    expect(placementLine(score({ placement: 9 }), 3)).toBe('9TH');
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
  it('reports KILLS / PLACEMENT / TIME AFLOAT, the ratified tile set', () => {
    expect(statTiles(score({ kills: 2, placement: 9, afloatMs: 387_000 }), 14)).toEqual([
      { key: 'KILLS', value: '2', phosphor: true },
      { key: 'PLACEMENT', value: '9', tail: '/14' },
      { key: 'TIME AFLOAT', value: '6:27' },
    ]);
  });

  // REGRESSION PIN (review finding): TIME AFLOAT used the RING clock, which has
  // the right shape and the wrong direction — it CEILS, because it counts down.
  // The tile latches the same millisecond as the MATCH LOG's `SUNK BY` stamp
  // directly beneath it, so ceiling made the two read a second apart on every
  // death that did not land exactly on a second boundary. The test above could
  // not see it: 387_000 is a boundary, where ceil and floor agree.
  it('FLOORS the elapsed span, agreeing with the match log stamp beside it', () => {
    const t = 387_400; // mid-second: ceil would say 6:28, the log says T+06:27
    expect(statTiles(score({ afloatMs: t }), 14)).toContainEqual({ key: 'TIME AFLOAT', value: '6:27' });
    expect(matchLogRow({ tMs: t, kind: 'sunkBy', name: 'KRAKEN' }).stamp).toBe('T+06:27');
    // 1ms in is still 0:00 — a clock counting UP shows the second that has passed.
    expect(statTiles(score({ afloatMs: 1 }), 14)).toContainEqual({ key: 'TIME AFLOAT', value: '0:00' });
  });

  it('omits TIME AFLOAT when the match clock was never anchored (null, not 0)', () => {
    expect(statTiles(score({ afloatMs: null }), 14).map((t) => t.key)).toEqual(['KILLS', 'PLACEMENT']);
    // 0 is a legitimate value and must still render — it cannot double as the sentinel.
    expect(statTiles(score({ afloatMs: 0 }), 14)).toContainEqual({ key: 'TIME AFLOAT', value: '0:00' });
  });

  it('a winner placed FIRST, and an underivable placement drops its tile', () => {
    expect(statTiles(score({ winner: true, placement: null }), 14)).toContainEqual({ key: 'PLACEMENT', value: '1', tail: '/14' });
    expect(statTiles(score({ placement: null }), 14).map((t) => t.key)).toEqual(['KILLS']);
  });

  it('the sunk roll lists contestants, or an explicit NONE (never a blank block)', () => {
    expect(sunkLines(score({ sunkContestants: ['A', 'B'] }))).toEqual(['· A', '· B']);
    expect(sunkLines(score({ sunkContestants: [] }))).toEqual(['— NONE —']);
  });
});

// --- THE MATCH LOG (amendment 28) --------------------------------------------

describe('matchLogRow — Eric\'s chosen composition, verbatim', () => {
  it('stamps each line with the BR chrome bar\'s T+ clock', () => {
    expect(matchLogRow(log(161_000, 'sank', 'SALT SHAKER'))).toEqual({ stamp: 'T+02:41', text: 'SANK SALT SHAKER' });
    expect(matchLogRow(log(252_000, 'sank', 'IRON KETTLE'))).toEqual({ stamp: 'T+04:12', text: 'SANK IRON KETTLE' });
    expect(matchLogRow(log(387_000, 'sunkBy', "KRAKEN'S BANE"))).toEqual({ stamp: 'T+06:27', text: "SUNK BY KRAKEN'S BANE" });
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
    expect(text).not.toContain('ELIMINATED'); // ...which retires the shipped banner
    expect(text).toContain('4TH OF 14');
    expect(text).toContain('KILLS');
    expect(text).toContain('SHIPS YOU SANK'); // epic-2 amendment 23 — kept by name
    expect(text).toContain('RIVAL');
    expect(spectateButton()?.textContent).toBe('SPECTATE');
    expect(returnButton()?.textContent).toBe('RETURN TO PORT');
    expect(resultsVisible()).toBe(true);
  });

  // AMENDMENT 30, in the strongest terms the ledger has recorded: *"I DO NOT
  // WANT INSTANT REQUE. You MUST return to the home screen to requeue. MUST."*
  // The guarantee has always been structural (there is no code path from this
  // modal into a match); this pin is what stops a later story drifting one in.
  it('THE ACTION SET IS EXACTLY SPECTATE + RETURN TO PORT — never a re-queue', () => {
    showResults(view({ own: own(), fieldSize: 14 }), { onSpectate: () => undefined, onReturn: () => undefined });
    const actions = [...document.querySelectorAll('#results-overlay button')];
    expect(actions.map((b) => b.textContent)).toEqual(['SPECTATE', 'RETURN TO PORT']);
    // Nothing that starts a match: no SET SAIL, no PLAY, no AGAIN, and not the
    // mockup's `SET SAIL IS ONE PRESS AWAY` sub-line (deleted by amendment 30).
    const text = document.getElementById('results-overlay')?.textContent ?? '';
    for (const forbidden of ['SET SAIL', 'PLAY AGAIN', 'AGAIN', 'REQUEUE', 'RE-QUEUE', 'NEXT MATCH']) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('at GAME END the action set is RETURN TO PORT alone, and only there does it wear the ⏎ chip', () => {
    // Enter returns to port ONLY when the match is over (main.ts handleConfirm),
    // so the key chip is game-end only: a chip on the elimination modal would
    // promise a key that does nothing. Amendment 23 froze the key law; the
    // affordance follows it rather than the other way round.
    expect(returnButton()).toBeNull();
    showResults(view({ canSpectate: true }), { onSpectate: () => undefined, onReturn: () => undefined });
    expect(returnButton()?.textContent).toBe('RETURN TO PORT');
    hideResults();
    showResults(view({ rows: [row('a', 1), row('b', 2)], canSpectate: false }), {
      onSpectate: () => undefined,
      onReturn: () => undefined,
    });
    expect([...document.querySelectorAll('#results-overlay button')]).toHaveLength(1);
    expect(returnButton()?.textContent).toBe('⏎RETURN TO PORT');
  });

  it('lands the identity line — callsign in the own hue, then the class', () => {
    // A DARK hue on purpose: the callsign wears the WCAG-lifted variant the kill
    // feed and the chrome bar use, so the rendered colour must differ from the
    // raw personal hue (the mockup's own legend calls for exactly this).
    const hue = 0x4b3073;
    showResults(view({ own: own({ hue }) }), { onSpectate: () => undefined, onReturn: () => undefined });
    const text = document.getElementById('results-overlay')?.textContent ?? '';
    expect(text).toContain(`TIN SPARROW · ${CLASS_DISPLAY_NAMES.torpedoBoat}`);
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
    expect(text).not.toContain('LOADOUT');
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
    const ladder = (): string => block().querySelector('[data-loadout-ladder]')?.textContent ?? '';
    const open = (o: ResultsOwn): void => showResults(view({ own: o }), { onSpectate: () => undefined, onReturn: () => undefined });

    it('heads the block LOADOUT and draws nine squares in the bar order, each over its key chip', () => {
      open(mockOwn());
      expect(block().firstElementChild?.textContent).toBe('LOADOUT');
      expect(block().querySelectorAll('[data-loadout-slot]')).toHaveLength(9);
      const chips = [...block().querySelectorAll('[data-loadout-chip]')].map((c) => c.textContent);
      expect(chips).toEqual(['·', 'Shift', 'Q', 'E', 'R', '1', '2', '3', '4']);
      // The gun's chip is a GHOST: laid out for the baseline, never seen.
      expect((block().querySelector('[data-loadout-chip="0"]') as HTMLElement).style.color).toBe('transparent');
    });

    it('squares are the bar × .72 (54→39, belt 44→32) and every fitted square wears its glyph', () => {
      open(mockOwn());
      expect(LOADOUT_PX.slot).toBe(Math.round(CLIENT_CONFIG.hudBar.slot * 0.72));
      expect(LOADOUT_PX.beltSlot).toBe(Math.round(CLIENT_CONFIG.hudBar.beltSlot * 0.72));
      expect(square(0).style.width).toBe(`${LOADOUT_PX.slot}px`);
      expect(square(5).style.width).toBe(`${LOADOUT_PX.beltSlot}px`);
      // Every fitted square — the belt's HULL REPAIR included, which takes the
      // mock's plus from the ONE glyph source (equipmentIcons.ts), never art
      // drawn by this block.
      for (const slot of [0, 1, 2, 3, 4, 5]) expect(square(slot).querySelector('svg'), `slot ${slot}`).not.toBeNull();
      expect(square(5).style.borderStyle).toBe('solid');
    });

    it('prints the tier numerals on the absolute ramp — gun IV, Q III, E II, R I — and none on Shift', () => {
      open(mockOwn());
      const expected: [number, string, number][] = [[0, 'IV', 3], [2, 'III', 2], [3, 'II', 1], [4, 'I', 0]];
      for (const [slot, numeral, rung] of expected) {
        expect(tierOf(slot)?.textContent, `slot ${slot}`).toBe(numeral);
        expect(tierOf(slot)?.style.color, `slot ${slot}`).toBe(LINEAGE_TIERS[rung]);
      }
      expect(tierOf(1)).toBeNull(); // Shift carries no rung
      for (const slot of [5, 6, 7, 8]) expect(tierOf(slot), `belt ${slot}`).toBeNull();
    });

    it('badges the belt stock `×1` and draws the three empties as the bar\'s dash (no ×0, no word)', () => {
      open(mockOwn());
      expect(square(5).querySelector('[data-loadout-badge]')?.textContent).toBe('×1');
      for (const slot of [6, 7, 8]) {
        expect(square(slot).textContent, `belt ${slot}`).toBe('—');
        expect(square(slot).querySelector('svg')).toBeNull();
        expect(square(slot).style.borderStyle).toBe('dashed');
      }
      expect(block().textContent).not.toContain('×0');
      expect(block().textContent).not.toContain('EMPTY');
    });

    it('a belt stack fired to zero reads as the empty square (Eric R4)', () => {
      open(mockOwn({ hullRepair: 0 }));
      expect(square(5).textContent).toBe('—');
      expect(block().querySelectorAll('[data-loadout-badge]')).toHaveLength(0);
    });

    it('renders no line NAME on the row — the glyph is the name', () => {
      open(mockOwn());
      const row = block().querySelector('[data-loadout-row]')?.textContent ?? '';
      for (const name of ['CANNON', 'TORPEDO', 'MINES', 'REPAIR', 'BOOST']) expect(row).not.toContain(name);
    });

    it('the ladder line reads the mock verbatim: ARMOR III · SPEED IV · TURNING II · RADAR SWEEP II · RELOAD III', () => {
      open(mockOwn());
      expect(ladder()).toBe('ARMORIII·SPEEDIV·TURNINGII·RADAR SWEEPII·RELOADIII');
      const numerals = [...block().querySelectorAll<HTMLElement>('[data-loadout-ladder] > span > span')];
      expect(numerals.map((n) => n.style.color)).toEqual([2, 3, 1, 1, 2].map((i) => LINEAGE_TIERS[i]));
    });

    it('an untaken RADAR SWEEP reads `RADAR SWEEP —` in the muted label colour (Eric R2), all five still listed', () => {
      open(mockOwn({ radarSweep: 0 }));
      expect(ladder()).toBe('ARMORIII·SPEEDIV·TURNINGII·RADAR SWEEP—·RELOADIII');
      const entries = ladderEntries([]);
      expect(entries.map((e) => e.label)).toEqual(['ARMOR', 'SPEED', 'TURNING', 'RADAR SWEEP', 'RELOAD']);
      // Base lines sail at Tier I; the two that start from nothing dash.
      expect(entries.map((e) => e.tier)).toEqual([1, 1, 1, null, null]);
      const dash = [...block().querySelectorAll<HTMLElement>('[data-loadout-ladder] > span > span')][3];
      expect(dash.textContent).toBe('—');
      expect(dash.style.color).toBe('var(--hc-text-muted)');
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
      expect(texted.length).toBeGreaterThan(20); // head + 9 chips + 4 marks + 1 badge + 3 dashes + ladder
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
    expect(text).toContain('MATCH LOG');
    expect(text).toContain('T+02:41');
    expect(text).toContain('SANK SALT SHAKER');
    expect(text).toContain('SUNK BY KRAKENS BANE');
    expect(text.indexOf('T+02:41')).toBeLessThan(text.indexOf('T+04:12'));
    expect(text.indexOf('T+04:12')).toBeLessThan(text.indexOf('T+06:27'));

    hideResults();
    showResults(view(), { onSpectate: () => undefined, onReturn: () => undefined });
    expect(document.getElementById('results-overlay')?.textContent ?? '').not.toContain('MATCH LOG');
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
    expect(text).toContain('WINNER: A');
    expect(text).toContain('CAPTAIN'); // the table header
    expect(document.querySelector('#results-spectate')).toBeNull();
    expect(document.querySelector('#results-return')).not.toBeNull();
  });

  it('the game-end modal draws the same LOADOUT block, after the score card and before the table', () => {
    showResults(view({ banner: winnerBanner(msg, 'b'), rows: msg.rows, canSpectate: false, own: mockOwn() }), {
      onSpectate: () => undefined,
      onReturn: () => undefined,
    });
    const text = document.getElementById('results-overlay')?.textContent ?? '';
    expect(document.querySelectorAll('[data-loadout-block]')).toHaveLength(1);
    expect(text.indexOf('SHIPS YOU SANK')).toBeLessThan(text.indexOf('LOADOUT'));
    expect(text.indexOf('LOADOUT')).toBeLessThan(text.indexOf('CAPTAIN'));
  });

  it('a WINNER gets the winner indication rather than a placement', () => {
    showResults(
      view({ banner: 'VICTORY', victory: true, score: score({ winner: true, placement: null }), rows: msg.rows, canSpectate: false }),
      { onSpectate: () => undefined, onReturn: () => undefined },
    );
    const text = document.getElementById('results-overlay')?.textContent ?? '';
    expect(text).toContain('VICTORY');
    expect(text).toContain('YOU WON');
    expect(text).not.toContain('PLACE #');
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
    expect(text()).toContain('4TH OF 14');
    // The roster applied the same-tick deaths and the mutual-kill credit.
    updateResultsScore(score({ placement: 2, kills: 4, sunkContestants: ['RIVAL', 'HORNET'] }));
    expect(text()).toContain('2ND OF 14'); // the field is remembered across the refresh
    expect(text()).not.toContain('4TH');
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
    expect(t.match(/SANK SALT SHAKER/g)).toHaveLength(1); // no duplicate rows
    expect(t.match(/SUNK BY KRAKENS BANE/g)).toHaveLength(1);
    expect(t).toContain('SANK IRON KETTLE');
    // Order preserved — the new line lands after the old ones, not before them.
    expect(t.indexOf('SALT SHAKER')).toBeLessThan(t.indexOf('KRAKENS BANE'));
    expect(t.indexOf('KRAKENS BANE')).toBeLessThan(t.indexOf('IRON KETTLE'));
    // And the panel's section order is untouched (the card is REPLACED in place,
    // so the LOADOUT block stays below it rather than being shuffled above).
    expect([...(panel?.children ?? [])].length).toBe(before);
    expect(t.indexOf('MATCH LOG')).toBeLessThan(t.indexOf('SHIPS YOU SANK'));
    expect(t.indexOf('SHIPS YOU SANK')).toBeLessThan(t.indexOf('LOADOUT'));
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
