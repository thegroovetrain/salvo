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
  MONO_ADVANCE_EM,
  REFIT_TYPE,
  cardNameSize,
  cardNameWidth,
  ladderRowWidth,
  monoWrapLines,
  refitCardInnerBox,
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

describe('the ratified face is a FIXED box, and its content is a constant', () => {
  it('covers every offerable line at every rung, on every class, both extremes', () => {
    // Catalog v3: 29 lines, 16 of them live (13 stubs stay set — amendment 41).
    expect(LINES).toHaveLength(29);
    expect(LIVE).toHaveLength(16);
    expect(FACES.length).toBe(LIVE.reduce((n, d) => n + d.cap, 0) * CLASSES.length * 2);
  });

  it('measures the mock\'s own box: 216 × 226, inner 192 wide', () => {
    expect(R.card).toBe(216);
    expect(R.cardHeight).toBe(226);
    expect(refitCardInnerBox().w).toBe(192);
  });

  it('renders EVERY card at the same height, inside its inner box, with headroom', () => {
    const heights = new Set(FACES.map(({ face }) => refitCardMetrics(face).height));
    // One height for the whole catalog — that is what `nowrap` + fixed rows buy.
    expect(heights.size).toBe(1);
    const inner = refitCardInnerBox();
    const h = [...heights][0];
    expect(h).toBeLessThanOrEqual(inner.h);
    // Documents the budget: whoever spends the last of it has to look here.
    expect(inner.h - h).toBeGreaterThanOrEqual(2);
  });

  it('NO mark on any card is wider than the 192px inner box', () => {
    const over = FACES.map(({ label, face }) => ({ label, m: refitCardMetrics(face) }))
      .filter((r) => r.m.overflowX > 0)
      .map((r) => `${r.label}: widest mark overruns by ${r.m.overflowX.toFixed(1)}px`);
    expect(over).toEqual([]);
  });
});

describe('the NAME — one line, at 15px or the mock\'s own .cn.long step', () => {
  it('fits every catalog name inside 192px at the size the face picks for it', () => {
    const inner = refitCardInnerBox().w;
    const tooWide = LINE_IDS
      .map((id) => boonName(id))
      .filter((name) => cardNameWidth(name) > inner);
    expect(tooWide).toEqual([]);
  });

  it('takes the 12.5px step ONLY where 15px genuinely does not fit', () => {
    const long = LINE_IDS.map((id) => boonName(id)).filter((n) => cardNameSize(n) === R.nameSizeLong);
    // SUPERCAVITATING TORPEDO is the one name catalog v3 authors that cannot sit
    // on a 192px line at 15px. If a second one appears, it is deliberate and
    // this list is where it gets recorded.
    expect(long).toEqual(['SUPERCAVITATING TORPEDO']);
    // ...and it really is too wide at 15px, so the exemption cannot rot.
    for (const name of long) {
      expect(cardNameSize(name)).toBeLessThan(R.nameSize);
    }
  });

  it('never wraps: the size decision is made instead', () => {
    for (const name of LINE_IDS.map((id) => boonName(id))) {
      const size = cardNameSize(name);
      const tracking = size === R.nameSize ? REFIT_TYPE.nameLetterSpacing : REFIT_TYPE.nameLetterSpacingLong;
      expect(monoWrapLines(name, size, tracking, refitCardInnerBox().w), name).toBeLessThanOrEqual(1);
    }
  });
});

describe('the ROWS — every label fits beside its value inside 192px', () => {
  it('leaves no row overrunning the inner box, in any presentation state', () => {
    const inner = refitCardInnerBox().w;
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
    const m = refitCardMetrics({ kind: 'CONSUMABLE', name: 'HULL REPAIR', tier: null, cap: 1, rows: [], foot: SLOTS_FULL });
    expect(m.footWidth).toBeGreaterThan(0);
    expect(m.footWidth).toBeLessThanOrEqual(m.innerW);
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
    'lightTorpedo', 'supercavTorpedo', 'captiveMines', 'missile', 'machineGun', 'flak', 'monitor',
    'hullRepair', 'shieldBlock', 'smokeScreen', 'chaff', 'decoyBuoy', 'heatSeeking',
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
