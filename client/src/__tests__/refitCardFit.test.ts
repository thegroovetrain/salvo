// THE CONTAINER-FIT PIN for the refit card (amendment 47: "nothing anywhere in
// the game may render larger than its container — no text or element may extend
// past its box such that it covers, or can be covered by, another part of the
// UX").
//
// RE-CUT WHOLESALE IN STORY 8.7 (ruling 11). The card this suite used to guard
// was a 216×236 box holding WRAPPING prose, and the failure it existed to stop
// was vertical: rules text running 50–97px past the card bottom. The ratified
// face is a 216×226 STAT BLOCK — an icon box, an uppercase name, a cap-rung
// ladder, a KIND word, five fixed 17px rows and a foot — and EVERY text mark on
// it is `nowrap`. That inverts the risk:
//
//   • VERTICALLY the card is now a constant. Nothing wraps, every block declares
//     its height, and the sum is the same for a consumable and for a maxed
//     ARMOR. So the height pin is one assertion with real headroom, not a walk.
//   • HORIZONTALLY every mark is a potential overflow, because a `nowrap` line
//     wider than the 192px inner box paints straight out through the card's
//     side. So the WALK moved to the horizontal axis, and it covers every
//     non-stub line × every rung × every ship class, with the name resolved
//     through the mock's own `.cn.long` 12.5px step.
//
// The law that constrains the FIX is pinned too: the face may not buy its fit
// back by shrinking type below the mock's ratified register (amendment 31 binds
// us to the mock's numbers, which is what makes "just make it 8px" unavailable).

import { describe, expect, it } from 'vitest';
import { CATALOG, CONFIG, LINE_IDS, type CatalogLine, type ShipClassId } from '@salvo/shared';
import {
  boonKindLabel,
  boonName,
  boonTooltipText,
  cardStatRows,
  cardTierLabel,
} from '../ui/boonCopy.js';
import {
  FOOT_BOX_GROWTH,
  MONO_ADVANCE_EM,
  REFIT_REGISTERS,
  REFIT_TYPE,
  cardNameSize,
  cardNameWidth,
  cardRenderedPx,
  domMicroScale,
  ladderRowWidth,
  monoWrapLines,
  refitCardInnerBox,
  refitCardRowBox,
  refitCardMetrics,
  statRowWidth,
  type RefitCardCopy,
} from '../ui/refitCardFit.js';
import { SLOTS_FULL, UpgradeMenu, offerView } from '../ui/upgradeMenu.js';
import { CLIENT_CONFIG } from '../config.js';

const R = CLIENT_CONFIG.refit;
const LINES: CatalogLine[] = Object.values(CATALOG);
/** The lines that can actually be OFFERED today. A stub is excluded from every
 *  deck, so its face is unreachable — and it prints no rows, which would make
 *  the walk's row assertions vacuous rather than strict. */
const LIVE: CatalogLine[] = LINES.filter((l) => l.stub !== true);
const CLASSES = Object.keys(CONFIG.shipClasses) as ShipClassId[];

/** A maximally stacked build — EVERY line at its full copy count. Not a
 *  reachable deck state; it is the UPPER BOUND on the number of glyphs a row's
 *  `cur → next` can print, which is exactly what a fit pin wants. */
const MAXED = LINES.flatMap((d) => Array<string>(d.cap).fill(d.id));

/** The fitted-card list a worst case is measured against: the line under test
 *  sits at `stack` copies, on top of a bare or a maximally stacked build. */
function heldCards(line: CatalogLine, stack: number, maxed: boolean): string[] {
  const base = maxed ? MAXED.filter((id) => id !== line.id) : [];
  return [...base, ...Array<string>(stack).fill(line.id)];
}

/** The card face exactly as ui/upgradeMenu.ts's toCard() builds it — including
 *  the GREYED foot, whose boxed reason word is the widest thing that row can
 *  ever hold. */
function faceOf(line: CatalogLine, stack: number, cls: ShipClassId, maxed: boolean): RefitCardCopy {
  const cards = heldCards(line, stack, maxed);
  return {
    kind: boonKindLabel(line.kind),
    name: boonName(line.id, stack),
    tier: cardTierLabel(line, stack),
    cap: line.cap,
    rows: cardStatRows(line, stack, { cls, cards }),
    foot: line.kind === 'consumable' ? SLOTS_FULL : '',
  };
}

interface FaceCase {
  id: string;
  label: string;
  face: RefitCardCopy;
}

/** Every worst-case presentation state of every OFFERABLE catalog line. */
function everyFace(): FaceCase[] {
  const out: FaceCase[] = [];
  for (const def of LIVE) {
    for (let stack = 0; stack < def.cap; stack += 1) {
      for (const cls of CLASSES) {
        for (const maxed of [false, true]) {
          const label = `${def.id}@${stack}/${cls}${maxed ? '/maxed' : ''}`;
          out.push({ id: def.id, label, face: faceOf(def, stack, cls, maxed) });
        }
      }
    }
  }
  return out;
}

const FACES = everyFace();

/** The one face that prints a FOOT: a consumable the belt has no room for. */
const GREYED_FACE: RefitCardCopy = {
  kind: 'CONSUMABLE', name: 'HULL REPAIR', tier: null, cap: 1, rows: [], foot: SLOTS_FULL,
};

describe('the ratified face is a FIXED box, and its content is a constant', () => {
  it('covers every offerable line at every rung, on every class, both extremes', () => {
    // Catalog v3: 29 lines. SIXTEEN were live at 8.7 (13 stubs, amendment 41);
    // Story 8.8 flipped `hullRepair`'s stub (seventeen); Story 8.13 flipped
    // LIGHT TORPEDO, CAPTIVE MINES and the SUPERCAV TORPEDO and added the stub
    // DEPTH CHARGE — NINETEEN live against ten stubs.
    expect(LINES).toHaveLength(29);
    expect(LIVE).toHaveLength(19);
    expect(LIVE.some((l) => l.id === 'hullRepair')).toBe(true);
    expect(FACES.length).toBe(LIVE.reduce((n, d) => n + d.cap, 0) * CLASSES.length * 2);
  });

  // THE MODEL MEASURES WHAT THE DOM RENDERS (review patch P6). The mock quotes
  // `216 − 2×12 = 192`, but the card is a BORDER-BOX with a 1px edge, so the
  // body it stretches is 190 — and each stat row spends another `0 1px` of its
  // own, leaving 188 for a label beside its value. Two numbers, both of them
  // real, neither of them 192.
  it('measures the mock\'s own box: 216 × 226, inner 190 wide, rows 188', () => {
    expect(R.card).toBe(216);
    expect(R.cardHeight).toBe(226);
    expect(refitCardInnerBox().w).toBe(R.card - 2 * R.pad.side - 2 * REFIT_TYPE.border);
    expect(refitCardInnerBox().w).toBe(190);
    expect(refitCardRowBox()).toBe(refitCardInnerBox().w - 2 * REFIT_TYPE.rowPadX);
    expect(refitCardRowBox()).toBe(188);
  });

  it('renders EVERY card at one of TWO heights — the boxed foot is the only step', () => {
    const heightsOf = (footed: boolean): Set<number> =>
      new Set(
        FACES.filter(({ face }) => (face.foot !== '') === footed)
          .map(({ face }) => refitCardMetrics(face).height),
      );
    // `nowrap` + fixed row heights make the face a CONSTANT — one height for
    // every card that prints no foot, and one for every card that can print the
    // boxed SLOTS FULL reason word, which is FOOT_BOX_GROWTH taller (review
    // patch P6). Only a CONSUMABLE can be refused, and Story 8.8 put the first
    // live one in the offer, so both branches are now reachable.
    const bare = heightsOf(false);
    const footed = heightsOf(true);
    expect(bare.size).toBe(1);
    expect(footed.size).toBe(1);
    expect([...footed][0] - [...bare][0]).toBe(FOOT_BOX_GROWTH);
    const inner = refitCardInnerBox();
    const tallest = Math.max([...bare][0], [...footed][0]);
    expect(tallest).toBeLessThanOrEqual(inner.h);
    // DOCUMENTS THE BUDGET, and it is not the same on both branches: a bare
    // face leaves 2px+, a GREYED one spends FOOT_BOX_GROWTH of that and leaves
    // whatever remains. Both fit, and whoever spends the last of it has to look
    // here. (The greyed height was always this tall — GREYED_FACE has measured
    // it since 8.7 — but Story 8.8 is what made it reachable from a real
    // offer, since only a consumable can be refused and only now is one dealt.)
    expect(inner.h - [...bare][0]).toBeGreaterThanOrEqual(2);
    expect(inner.h - [...footed][0]).toBeGreaterThanOrEqual(1);
  });

  it('NO mark on any card is wider than the box it renders in', () => {
    const over = FACES.map(({ label, face }) => ({ label, m: refitCardMetrics(face) }))
      .filter((r) => r.m.overflowX > 0)
      .map((r) => `${r.label}: widest mark overruns by ${r.m.overflowX.toFixed(1)}px`);
    expect(over).toEqual([]);
  });
});

describe('the NAME — one line, at 15px or the mock\'s own .cn.long step', () => {
  it('fits every catalog name inside the inner box at the size the face picks for it', () => {
    const inner = refitCardInnerBox().w;
    const tooWide = LINE_IDS
      .map((id) => boonName(id))
      .filter((name) => cardNameWidth(name) > inner);
    expect(tooWide).toEqual([]);
  });

  it('takes the 12.5px step NOWHERE — no shipped name needs it', () => {
    const long = LINE_IDS.map((id) => boonName(id)).filter((n) => cardNameSize(n) === R.nameSizeLong);
    // THE EXEMPTION IS RETIRED (Story 8.13, Eric ruling 2026-09-19, epic-8
    // amendment 75). `SUPERCAVITATING TORPEDO` was the ONE name catalog v3
    // authored that could not sit on the inner line at 15px, and it carried a
    // Story 8.1 fit exemption for it. Eric's answer was to shorten the NAME —
    // it is `SUPERCAV TORPEDO` now — rather than keep the exemption or add a
    // type-size step, so EVERY shipped name fits at the ordinary size.
    expect(long).toEqual([]);
    expect(cardNameSize(boonName('supercavTorpedo'))).toBe(R.nameSize);
    expect(cardNameWidth(boonName('supercavTorpedo'))).toBeLessThanOrEqual(refitCardInnerBox().w);
    // ...and the step itself still exists for a future long name.
    expect(R.nameSizeLong).toBeLessThan(R.nameSize);
  });

  it('never wraps: the size decision is made instead', () => {
    for (const name of LINE_IDS.map((id) => boonName(id))) {
      const size = cardNameSize(name);
      const tracking = size === R.nameSize ? REFIT_TYPE.nameLetterSpacing : REFIT_TYPE.nameLetterSpacingLong;
      expect(monoWrapLines(name, size, tracking, refitCardInnerBox().w), name).toBeLessThanOrEqual(1);
    }
  });
});

describe('the ROWS — every label fits beside its value inside the 188px row box', () => {
  it('leaves no row overrunning its own padded box, in any presentation state', () => {
    const inner = refitCardRowBox();
    const over: string[] = [];
    for (const { label, face } of FACES) {
      for (const row of face.rows) {
        const w = statRowWidth(row);
        if (w > inner) over.push(`${label} "${row.label}": ${w.toFixed(1)}px > ${inner}px`);
      }
    }
    expect(over).toEqual([]);
  });

  it('never asks the grid for more rows than it has', () => {
    const over = FACES.filter(({ face }) => face.rows.length > R.rowCount).map((f) => f.label);
    expect(over).toEqual([]);
  });

  it('gives every LADDER and WEAPON card at least one row to print', () => {
    const silent = FACES.filter(({ id, face }) => {
      const kind = CATALOG[id].kind;
      return (kind === 'ladder' || kind === 'equipment') && face.rows.length === 0;
    }).map((f) => f.label);
    expect(silent).toEqual([]);
  });
});

// THE FIVE TIERED WEAPON LINES' TIER FACES (Story 8.13, epic-8 amendment 85).
// The face grew from ONE row to as many as five, which is exactly the change
// that can push a `cur → next` pair out through the card's side — so the fit
// claim is made HERE, explicitly, on top of the blanket walk above: every tier
// II–V card of the five authored lines, measured against the real 188px row
// box at the mock's ratified 9px label / 11px value.
describe('the TIER faces of the five authored weapon lines fit the shipped grid', () => {
  const TIERED = ['lightTorpedo', 'heavyTorpedo', 'navalMines', 'captiveMines', 'foulingMines'] as const;

  /** Every tier II–V face of the five lines, on every class, both extremes —
   *  built the same way `everyFace` builds the blanket walk, but STACK ≥ 1, so
   *  a line's copy-1 FIT face (five ABSOLUTE rows) cannot sneak in and make the
   *  `cur → next` assertions below vacuous. */
  const TIER_FACES: FaceCase[] = TIERED.flatMap((id) =>
    Array.from({ length: CATALOG[id].cap - 1 }, (_, i) => i + 1).flatMap((stack) =>
      CLASSES.flatMap((cls) =>
        [false, true].map((maxed) => ({
          id,
          label: `${id}@${stack}/${cls}${maxed ? '/maxed' : ''}`,
          face: faceOf(CATALOG[id], stack, cls, maxed),
        })),
      ),
    ),
  );

  it('is NON-VACUOUS: every one of the five prints MORE than the old single reload row at every rung', () => {
    const thin: string[] = [];
    for (const id of TIERED) {
      for (let k = 1; k < CATALOG[id].cap; k += 1) {
        for (const cls of CLASSES) {
          const rows = faceOf(CATALOG[id], k, cls, false).rows;
          if (rows.length < 4) thin.push(`${id}@${k}/${cls}: ${rows.length}`);
        }
      }
    }
    expect(thin).toEqual([]);
    expect(TIER_FACES.length).toBe(TIERED.length * 4 * CLASSES.length * 2);
  });

  it('leaves NO tier row overrunning the 188px row box, and reports the tightest one', () => {
    const box = refitCardRowBox();
    let worst = { label: '', w: 0 };
    for (const { label, face } of TIER_FACES) {
      for (const row of face.rows) {
        const w = statRowWidth(row);
        if (w > worst.w) worst = { label: `${label} "${row.label} ${row.cur ?? ''}→${row.next}"`, w };
      }
    }
    // The widest tier row must fit with room left, and the margin is DOCUMENTED
    // so whoever spends the last of it has to look here. (A `rad/s` unit on
    // BOTH halves of the homing pair measured ~197px — which is why the unit
    // rides the `next` value alone; see boonCopy's FIELD_UNITS.)
    expect(worst.w, worst.label).toBeLessThanOrEqual(box);
    // Measured at authoring time: the widest tier row is ~161.8px against the
    // 188px box — 26px of headroom. The floor below is deliberately loose (a
    // retune may move a number), but the row that spends the rest of it will
    // trip the assertion above and land here.
    expect(box - worst.w).toBeGreaterThanOrEqual(2);
  });

  it('never asks the grid for a sixth row, and every tier row is a `cur → next` diff', () => {
    for (const { label, face } of TIER_FACES) {
      expect(face.rows.length, label).toBeLessThanOrEqual(R.rowCount);
      for (const row of face.rows) expect(row.cur, `${label} ${row.label}`).not.toBeNull();
    }
  });

  it('buys the fit with NO type-size step — the 9px label and 11px value register is untouched', () => {
    // Amendment 31 binds the face to the mock's numbers, so "just make it 8px"
    // is unavailable; this is the pin that says the five-row tier face did not
    // reach for it. (The whole register is pinned below; these are the two the
    // rows themselves spend.)
    expect(R.labelSize).toBe(9);
    expect(R.valueSize).toBe(11);
    expect(R.rowCount).toBe(5);
  });
});

describe('the LADDER row and the FOOT', () => {
  it('fits the widest ladder (five rungs + its numerals) inside the inner box', () => {
    const inner = refitCardInnerBox().w;
    const widest = Math.max(
      ...LIVE.flatMap((line) =>
        Array.from({ length: line.cap }, (_, k) => ladderRowWidth(line.cap, cardTierLabel(line, k))),
      ),
    );
    expect(widest).toBeLessThanOrEqual(inner);
  });

  it('draws NO ladder for a consumable or an add-on — the row is empty, not absent', () => {
    for (const line of LIVE) {
      const blank = line.kind === 'consumable' || line.kind === 'addon';
      expect(cardTierLabel(line, 0) === null, line.id).toBe(blank);
      const w = ladderRowWidth(line.cap, cardTierLabel(line, 0));
      if (blank) expect(w, line.id).toBe(0);
      else expect(w, line.id).toBeGreaterThan(0);
    }
  });

  it('fits the boxed SLOTS FULL reason word', () => {
    const m = refitCardMetrics(GREYED_FACE);
    expect(m.footWidth).toBeGreaterThan(0);
    expect(m.footWidth).toBeLessThanOrEqual(m.innerW);
  });

  // The BOXED foot is 2px taller than the bare word (ui/upgradeMenu's
  // `footH + 2`), and the model has to spend those 2px or it reports a fitting
  // card that renders 2px long (review patch P6).
  it('measures the greyed foot at its BOXED height, and the card still fits', () => {
    const blank: RefitCardCopy = { ...GREYED_FACE, foot: '' };
    const m = refitCardMetrics(GREYED_FACE);
    expect(m.height - refitCardMetrics(blank).height).toBe(2);
    expect(m.overflow).toBeLessThanOrEqual(0);
  });
});

describe('the laws that constrain the fix', () => {
  it('keeps the mock\'s ratified type register (epic-8 amendment 31)', () => {
    // The face takes the MOCK's numbers, not the July micro lift. Shrinking any
    // of these to buy a fit back is the deviation this pin exists to catch.
    expect(R.nameSize).toBe(15);
    expect(R.nameSizeLong).toBe(12.5);
    expect(R.kindSize).toBe(10);
    expect(R.tierSize).toBe(12);
    expect(R.labelSize).toBe(9);
    expect(R.valueSize).toBe(11);
    expect(R.footSize).toBe(9);
    expect(R.keyChipSize).toBe(11);
  });

  it('keeps the mock\'s ratified geometry', () => {
    expect(R.pad).toEqual({ top: 10, side: 12, bottom: 8 });
    expect(R.keyChip).toBe(22);
    expect(R.keyChipOffset).toBe(8);
    expect(R.iconBox).toBe(40);
    expect(R.iconGlyph).toBe(24);
    expect(R.ladderH).toBe(16);
    expect(R.rungW).toBe(14);
    expect(R.rungH).toBe(7);
    expect(R.ladderGap).toBe(3);
    expect(R.rowH).toBe(17);
    expect(R.rowCount).toBe(5);
    expect(R.footH).toBe(14);
  });

  it('DELETED the interim face\'s type keys with the marks they sized', () => {
    for (const dead of ['categorySize', 'descSize', 'lineageSize', 'metaGap']) {
      expect(R, dead).not.toHaveProperty(dead);
    }
  });

  it('greys a refused card ABOVE the spend-latch dim — a refusal must stay readable', () => {
    expect(R.greyedAlpha).toBe(0.55);
    expect(R.greyedAlpha).toBeGreaterThan(R.lockedAlpha);
  });

  // The seam check that R2.17's split still holds: what left the face is on the
  // hover panel. PARTIAL since catalog v3 — a line whose MECHANISM is not built
  // has nothing honest to explain, and the exemptions are named exactly so the
  // list cannot rot (an agent who builds one has to delete its entry).
  const NO_EXPLANATION: readonly string[] = [
    'turning', 'deckGun', // new in v3: no v2 line to carry text from
    // LIVE BUT UNEXPLAINED since Story 8.13: the mechanisms exist, the WORDS
    // are Eric's to write. FOULING MINES joined them when its add-on text died
    // with the card (epic-8 amendment 81 — the naval mine no longer fouls, so
    // the shipped sentence would have been a lie on two counts).
    'lightTorpedo', 'supercavTorpedo', 'captiveMines', 'foulingMines',
    'missile', 'machineGun', 'flak', 'monitor',
    // `hullRepair` left this list in Story 8.8 — its mechanism is built now.
    'shieldBlock', 'smokeScreen', 'chaff', 'decoyBuoy', 'depthCharge', 'heatSeeking',
  ];

  it('keeps the contract: what left the face is on the hover tooltip, for every built line', () => {
    const silent = LINES.filter((line) => boonTooltipText(line.id).trim() === '').map((d) => d.id);
    expect(silent.sort()).toEqual([...NO_EXPLANATION].sort());
  });
});

describe('the belt-and-braces clip (NOT the fix — the pins above are)', () => {
  it('hangs every mark off a clipped body, and leaves the key chip outside the clip', () => {
    const menu = new UpgradeMenu(() => {});
    const you = {
      id: 'me', x: 0, y: 0, heading: 0, speed: 0, hp: 80, alive: true, ammo: [], sweep: 0,
      cls: 'torpedoBoat' as const, pts: 1, offer: ['captiveMines', 'radarSweep'], boostUntil: 0,
      cards: [], lvl: 0, xp: 0, repairHp: 0,
    };
    menu.toggle(offerView(you, false, false, false, [])!);
    const card = document.querySelector('#upgrade-menu button') as HTMLElement;
    // The chip is still the card's FIRST child (the pinned digit→slot mapping)
    // and it is NOT inside the clipped body — it overhangs the corner by design.
    expect((card.firstElementChild as HTMLElement).textContent).toBe('1');
    expect(card.style.overflow).toBe('');
    const body = card.lastElementChild as HTMLElement;
    expect(body.tagName).toBe('DIV');
    expect(body.style.overflow).toBe('hidden');
    expect(body.style.minHeight).toBe('0px');
    // The card box itself is the fixed container the pins measure against.
    expect(card.style.height).toBe(`${R.cardHeight}px`);
    expect(card.style.boxSizing).toBe('border-box');
    menu.hide();
    document.body.replaceChildren();
  });
});

describe('the wrap math itself', () => {
  it('models the declared mono stack (Geist Mono 0.6em, Menlo 0.6021em) with margin', () => {
    expect(MONO_ADVANCE_EM).toBeGreaterThanOrEqual(0.6021);
    expect(MONO_ADVANCE_EM).toBeLessThan(0.62); // still tight enough to be useful
  });

  it('breaks greedily on whitespace — the conservative (upper-bound) line count', () => {
    // 20 chars per line at 15px/0 tracking inside 186px.
    expect(monoWrapLines('', 15, 0, 186)).toBe(0);
    expect(monoWrapLines('short', 15, 0, 186)).toBe(1);
    expect(monoWrapLines('12345678901234567890', 15, 0, 186)).toBe(1);
    expect(monoWrapLines('12345678901234567890 x', 15, 0, 186)).toBe(2);
  });

  it('hard-breaks a single token wider than the box (what overflow-wrap:anywhere does)', () => {
    expect(monoWrapLines('1234567890123456789012345', 15, 0, 186)).toBe(2);
    expect(monoWrapLines('x '.repeat(0) + 'y'.repeat(61), 15, 0, 186)).toBe(4);
  });
});

// THE 9px FLOOR IS A FLOOR ON THE RENDERED SIZE (epic-8 amendment 43, Eric
// 2026-09-17: "Text *MUST* be readable").
//
// The band is DOM scaled as ONE block by `--hc-ui-scale`, so at the 90% tier
// every mark on the card drew at 0.9x — and the two registers the ratified face
// seats ON the mono floor (the stat-row LABELS and the reason-word FOOT, both
// 9px) came out at 8.1px. `domMicroScale` is the DOM twin of the HUD bar's Pixi
// `microScale` (Story 8.6, ruling 2): a register at or under the floor divides
// its size by the scale, so the rendered glyph is never smaller than 9px — and
// the container-fit law (epic-4 amendment 47) is re-checked with the
// counter-scaled size, because the mock's 17px row and 14px foot box do NOT
// grow with it.
describe('the 9px mono floor at every UI tier (amendment 43)', () => {
  const FLOOR = CLIENT_CONFIG.settings.monoFloorPx;
  const TIERS = CLIENT_CONFIG.settings.scaleTiers.map((pct) => pct / 100);

  it('is the bar\'s own law, on a DOM surface', () => {
    expect(TIERS).toEqual([0.9, 1, 1.25]);
    expect(domMicroScale(0.9)).toBeCloseTo(1 / 0.9, 12);
    expect(domMicroScale(1)).toBe(1);
    expect(domMicroScale(1.25)).toBe(1);
    // Garbage reads as "no counter-scale" — the same fallback uiScaleFactor has.
    expect(domMicroScale(0)).toBe(1);
    expect(domMicroScale(-1)).toBe(1);
    expect(domMicroScale(Number.NaN)).toBe(1);
  });

  it('counter-scales EVERY register seated on the floor, and ONLY those', () => {
    const micro = Object.entries(REFIT_REGISTERS).filter(([, px]) => px <= FLOOR).map(([k]) => k);
    // The ratified face seats exactly two marks on the floor. A third one
    // arriving is a decision, and this is where it gets recorded.
    expect(micro.sort()).toEqual(['foot', 'label']);
    for (const [name, px] of Object.entries(REFIT_REGISTERS)) {
      for (const tier of TIERS) {
        const rendered = cardRenderedPx(px, tier);
        if (px <= FLOOR) expect(rendered, `${name}@${tier}`).toBeGreaterThanOrEqual(FLOOR - 1e-9);
        // Above the floor the type rides the geometry, untouched.
        else expect(rendered, `${name}@${tier}`).toBeCloseTo(px * tier, 12);
      }
    }
  });

  it('keeps the counter-scaled glyph INSIDE the mock\'s 17px row and 14px foot', () => {
    const over: string[] = [];
    for (const tier of TIERS) {
      const m = refitCardMetrics(GREYED_FACE, tier);
      if (m.labelBoxOverflow > 0) over.push(`label@${tier} overruns the row by ${m.labelBoxOverflow}px`);
      if (m.footBoxOverflow > 0) over.push(`foot@${tier} overruns its box by ${m.footBoxOverflow}px`);
    }
    expect(over).toEqual([]);
  });

  it('still fits every card inside 192px with the labels counter-scaled', () => {
    const inner = refitCardInnerBox().w;
    const over: string[] = [];
    for (const tier of TIERS) {
      for (const { label, face } of FACES) {
        for (const row of face.rows) {
          const w = statRowWidth(row, tier);
          if (w > inner) over.push(`@${tier} ${label} "${row.label}": ${w.toFixed(1)}px > ${inner}px`);
        }
        const m = refitCardMetrics(face, tier);
        if (m.overflowX > 0) over.push(`@${tier} ${label}: widest mark overruns by ${m.overflowX.toFixed(1)}px`);
      }
    }
    expect(over).toEqual([]);
  });

  // STORY 8.8's TWO NEW ROWS, named explicitly. They are inside the FACES walk
  // above (hullRepair is LIVE now), but the story's own requirement is that the
  // heal card's rows fit AT EVERY TIER, so the pin says so rather than relying
  // on a reader spotting them inside a 500-case sweep.
  it('fits HULL REPAIR\'s INSTANT / OVER TIME rows at every tier', () => {
    const face = FACES.find(({ id }) => id === 'hullRepair')!.face;
    expect(face.rows.map((r) => r.label)).toEqual(['INSTANT', 'OVER TIME']);
    const rowBox = refitCardRowBox();
    for (const tier of TIERS) {
      for (const row of face.rows) {
        const w = statRowWidth(row, tier);
        expect(w, `${row.label}@${tier}: ${w.toFixed(1)}px of ${rowBox}px`).toBeLessThanOrEqual(rowBox);
      }
      const m = refitCardMetrics(face, tier);
      expect(m.overflowX, `hullRepair@${tier}`).toBeLessThanOrEqual(0);
      expect(m.overflow, `hullRepair@${tier}`).toBeLessThanOrEqual(0);
      expect(m.labelBoxOverflow, `hullRepair label@${tier}`).toBeLessThanOrEqual(0);
    }
  });

  it('still fits the boxed SLOTS FULL foot at the counter-scaled size', () => {
    for (const tier of TIERS) {
      const m = refitCardMetrics(GREYED_FACE, tier);
      expect(m.footWidth, `@${tier}`).toBeGreaterThan(0);
      expect(m.footWidth, `@${tier}`).toBeLessThanOrEqual(m.innerW);
    }
  });
});
