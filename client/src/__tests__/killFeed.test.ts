// Kill feed (ui/killFeed.ts) — Story 1.12 UX-DR17. killLine() is pure: it shapes
// a sinking into colored SEGMENTS and mid-ellipsizes long callsigns. pushKillLine
// is a thin DOM adapter: name spans take their pilot's text-safe hue (600-weight),
// connective text inherits the container's text-secondary, newest line on top,
// capped at MAX_LINES.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KILL_LEADER_MARK, bountyClaimLine, bountyKillLine } from '../ui/bounty.js';
import { UNKNOWN_VESSEL, fleetSizeName, killLine, ellipsizeName, pinDroneColor, pushKillLine } from '../ui/killFeed.js';
import { DRONE_PLATE_TEXT } from '../render/nameplates.js';
import { ContactStore } from '../net/snapshots.js';
import { isDroneHull } from '../render/ships.js';
import { CLIENT_CONFIG } from '../config.js';
import { cssHex, cssRgba, textSafe } from '../util/color.js';
import type { HullId } from '@salvo/shared';

describe('ellipsizeName — mid-ellipsize > 14 code points to exactly 14', () => {
  it('leaves names of 14 chars or fewer untouched', () => {
    expect(ellipsizeName('SHORT')).toBe('SHORT');
    expect(ellipsizeName('EXACTLY14CHARS')).toBe('EXACTLY14CHARS'); // 14 chars
  });

  it('mid-ellipsizes to 7 head + … + 6 tail (14 total)', () => {
    expect(ellipsizeName('ABCDEFGHIJKLMNOPQRSTUVWXYZ')).toBe('ABCDEFG…UVWXYZ');
    expect(ellipsizeName('ABCDEFG…UVWXYZ')).toHaveLength(14);
  });

  it('slices on CODE POINTS — an emoji-bearing long name never yields a lone surrogate', () => {
    // 16 ship emoji: >14 code points (and 32 UTF-16 units). A UTF-16 slice would
    // split a surrogate pair mid-glyph; the code-point slice must not.
    const name = '🚢'.repeat(16);
    const out = ellipsizeName(name);
    expect([...out].length).toBe(14); // 7 head + … + 6 tail, counted in code points
    // No LONE surrogate (a UTF-16 slice would split a pair mid-glyph) — equivalent
    // to String.prototype.isWellFormed(), without needing the es2024 lib.
    const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    expect(loneSurrogate.test(out)).toBe(false);
    expect(out).not.toContain('�'); // no replacement char when rendered
  });
});

describe('killLine — colored segments', () => {
  it('names the killer when attributable (victim SUNK BY killer), carrying both ids', () => {
    expect(killLine({ name: 'ALPHA', id: 'a' }, { name: 'BRAVO', id: 'b' })).toEqual([
      { text: 'ALPHA', id: 'a' },
      { text: ' SUNK BY ' },
      { text: 'BRAVO', id: 'b' },
    ]);
  });

  it('reports a storm/unattributed loss when there is no killer', () => {
    expect(killLine({ name: 'ALPHA', id: 'a' }, null)).toEqual([
      { text: 'ALPHA', id: 'a' },
      { text: ' LOST WITH ALL HANDS' },
    ]);
  });

  it('mid-ellipsizes an over-length name in the segment text (id preserved)', () => {
    const [victim] = killLine({ name: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', id: 'v' }, null);
    expect(victim).toEqual({ text: 'ABCDEFG…UVWXYZ', id: 'v' });
  });
});

// --- THE KILL LEADER REGISTERS (Story 4.6, 2026-08-10 rework) ----------------
// The feed carries two of the throne's three surfaces. Both are built from the
// pure ui/bounty.ts builders and pushed through the UNCHANGED pushKillLine
// adapter — these are the DOM proofs that the composition renders the way the
// grammar says: the skull rides the leader's NAME span (hue, 600 weight, and
// the static faint glow), connectives stay connectives, and a drone name can
// never glow.

describe('the kill-leader feed registers render through the shipped adapter', () => {
  beforeEach(() => {
    document.getElementById('kill-feed')?.remove();
  });

  const feed = (): HTMLElement => document.getElementById('kill-feed') as HTMLElement;
  const line = (): string => feed().firstChild!.textContent ?? '';

  it('the CLAIM register prints `☠︎ <NAME> IS THE NEW KILL LEADER`, the marked name in the pilot\'s hue', () => {
    pushKillLine(bountyClaimLine({ name: 'ALPHA', id: 'a' }), () => 0x00d0ff);
    expect(line()).toBe(`${KILL_LEADER_MARK} ALPHA IS THE NEW KILL LEADER`);
    const spans = feed().firstChild!.childNodes as NodeListOf<HTMLSpanElement>;
    expect(spans).toHaveLength(2);
    expect(spans[0].style.fontWeight).toBe('600'); // mark + name, one NAME span
    expect(spans[0].style.color).not.toBe(''); // ...so the skull wears the hue too
    expect(spans[1].style.color).toBe(''); // the label is connective text
    expect(spans[1].style.fontWeight).toBe('');
  });

  it("a victim-leads sinking ('v') marks the VICTIM span: `☠ ALPHA SUNK BY BRAVO`", () => {
    pushKillLine(bountyKillLine({ name: 'ALPHA', id: 'a' }, { name: 'BRAVO', id: 'b' }, 'v'), () => 0x00d0ff);
    expect(line()).toBe(`${KILL_LEADER_MARK} ALPHA SUNK BY BRAVO`);
    const spans = feed().firstChild!.childNodes as NodeListOf<HTMLSpanElement>;
    expect(spans).toHaveLength(3);
    expect(spans[0].style.textShadow).not.toBe(''); // the leader glows
    expect(spans[2].style.textShadow).toBe(''); // the other captain does not
  });

  it("a killer-leads sinking ('k') marks the KILLER span: `ALPHA SUNK BY ☠ BRAVO`", () => {
    pushKillLine(bountyKillLine({ name: 'ALPHA', id: 'a' }, { name: 'BRAVO', id: 'b' }, 'k'), () => 0x00d0ff);
    expect(line()).toBe(`ALPHA SUNK BY ${KILL_LEADER_MARK} BRAVO`);
    const spans = feed().firstChild!.childNodes as NodeListOf<HTMLSpanElement>;
    expect(spans[0].style.textShadow).toBe('');
    expect(spans[2].style.textShadow).not.toBe('');
  });

  it("a storm sink of the leader ('v', no killer) marks the LOST line", () => {
    pushKillLine(bountyKillLine({ name: 'ALPHA', id: 'a' }, null, 'v'), () => 0x00d0ff);
    expect(line()).toBe(`${KILL_LEADER_MARK} ALPHA LOST WITH ALL HANDS`);
  });

  it('the leader glow is STATIC, in the name\'s own text-safe hue, at DESIGN.md\'s glow register', () => {
    // Ruling 2026-08-10: a faint STATIC text-shadow — never breathing, never
    // pulsing — so it is not an animated channel and stays out of the
    // photosensitivity budget. Radius 10px = the hotbar ready-weapon glow;
    // alpha .4 = the canonical DESIGN.md glow example (0 0 16px rgba(...,.4)).
    const hue = 0x00d0ff;
    pushKillLine(bountyClaimLine({ name: 'ALPHA', id: 'a' }), () => hue);
    const span = feed().firstChild!.firstChild as HTMLSpanElement;
    const ref = document.createElement('span');
    ref.style.textShadow = `0 0 10px ${cssRgba(textSafe(hue), 0.4)}`;
    expect(span.style.textShadow).toBe(ref.style.textShadow);
  });

  it('a DRONE name NEVER glows — even if a leader flag somehow reached it', () => {
    // A drone can never hold the throne (captain kills only); the adapter
    // enforces it independently, so a bad flag cannot glow the pinned grey.
    const droneOutline = CLIENT_CONFIG.colors.droneOutline;
    pushKillLine([{ text: `${KILL_LEADER_MARK} DRONE`, id: 'd', leader: true }], () => droneOutline);
    const span = feed().firstChild!.firstChild as HTMLSpanElement;
    expect(span.style.textShadow).toBe('');
    // ...and the drone grey stays pinned verbatim, un-lightened.
    const ref = document.createElement('span');
    ref.style.color = cssHex(droneOutline);
    expect(span.style.color).toBe(ref.style.color);
  });

  it('an UNMARKED name never glows — the flag is the only license', () => {
    pushKillLine(killLine({ name: 'ALPHA', id: 'a' }, null), () => 0x00d0ff);
    const span = feed().firstChild!.firstChild as HTMLSpanElement;
    expect(span.style.textShadow).toBe('');
  });

  it('says nothing about WHERE any of it happened', () => {
    // The 2026-08-10 ruling: the throne is identity only. The feed's copy is
    // the whole of what a bystander learns, and it carries no number at all.
    pushKillLine(bountyClaimLine({ name: 'ALPHA', id: 'a' }), () => null);
    expect(line()).not.toMatch(/\d/);
  });
});

describe('pushKillLine — DOM span building', () => {
  beforeEach(() => {
    document.getElementById('kill-feed')?.remove();
  });

  const feed = (): HTMLElement => document.getElementById('kill-feed') as HTMLElement;

  it('colors NAME spans (600-weight) and leaves connective text uncolored', () => {
    pushKillLine(killLine({ name: 'ALPHA', id: 'a' }, { name: 'BRAVO', id: 'b' }), () => 0x00d0ff);
    const spans = feed().firstChild!.childNodes as NodeListOf<HTMLSpanElement>;
    expect(spans).toHaveLength(3);
    expect(spans[0].style.fontWeight).toBe('600'); // victim name
    expect(spans[0].style.color).not.toBe('');
    expect(spans[1].style.fontWeight).toBe(''); // ' SUNK BY ' connective
    expect(spans[1].style.color).toBe('');
    expect(spans[2].style.fontWeight).toBe('600'); // killer name
  });

  it('pins a DRONE name to the droneOutline token VERBATIM (never run through textSafe)', () => {
    // The name is the bare literal `DRONE` since Story 5.6 (amendment 38: "a
    // fleet sinking reads DRONE, never DRONE-07") — fleet hulls hold no roster
    // row, so the feed sources the label from the hull exactly as the nameplate
    // always has.
    const droneOutline = CLIENT_CONFIG.colors.droneOutline;
    pushKillLine(killLine({ name: 'DRONE', id: 'd' }, null), () => droneOutline);
    const span = feed().firstChild!.firstChild as HTMLSpanElement;
    // jsdom normalizes color strings, so compare against a reference span set to
    // the raw token — the drone name must render the token itself, un-lightened.
    const ref = document.createElement('span');
    ref.style.color = cssHex(droneOutline);
    expect(span.style.color).toBe(ref.style.color);
    expect(span.style.fontWeight).toBe('600');
  });

  it('leaves a roster-miss name (color null) uncolored — inherits text-secondary', () => {
    pushKillLine(killLine({ name: 'GHOST', id: 'g' }, null), () => null);
    const spans = feed().firstChild!.childNodes as NodeListOf<HTMLSpanElement>;
    expect(spans[0].style.color).toBe('');
    expect(spans[0].style.fontWeight).toBe('');
  });

  it('renders the newest line on TOP', () => {
    pushKillLine([{ text: 'FIRST' }], () => null);
    pushKillLine([{ text: 'SECOND' }], () => null);
    expect(feed().firstChild!.textContent).toBe('SECOND');
    expect(feed().lastChild!.textContent).toBe('FIRST');
  });

  it('caps the stack at 6 lines (the global feed carries more traffic — PV 23)', () => {
    for (let i = 0; i < 8; i++) pushKillLine([{ text: `L${i}` }], () => null);
    expect(feed().children).toHaveLength(6);
    expect(feed().firstChild!.textContent).toBe('L7'); // newest
    expect(feed().lastChild!.textContent).toBe('L2'); // oldest surviving
  });

  it('a line lives 8 seconds (fades late, removes at exactly the TTL)', () => {
    vi.useFakeTimers();
    try {
      pushKillLine([{ text: 'TTL' }], () => null);
      const line = feed().firstChild as HTMLDivElement;
      vi.advanceTimersByTime(7999);
      expect(line.isConnected).toBe(true); // still on screen a tick before the TTL
      expect(line.style.opacity).toBe('0'); // ...already fading (TTL − 1.2s fade lead)
      vi.advanceTimersByTime(1);
      expect(line.isConnected).toBe(false); // gone at 8s, not the old 6s
    } finally {
      vi.useRealTimers();
    }
  });
});

// THE VICTIM'S NAME — the full four-step resolution order (Eric ruling
// 2026-08-14, layered over the Story 5.6 hull memo).
//
//   1. `SunkEvent.vcls`  → SMALL / MEDIUM / LARGE DRONE  (our own kills only)
//   2. the HULL MEMO     → DRONE                         (witnessed, uncredited)
//   3. the roster CALLSIGN
//   4. UNKNOWN VESSEL
//
// The order itself lives in net/roomBindings.ts `victimNameRef`, which holds the
// event; it is not exported, so this models the identical composition from its
// three real parts — `fleetSizeName`, a real `ContactStore`, and a roster stub.
// If the production order ever changes, these expectations are what should have
// to change with it.
describe('the kill feed names its victim: vcls, then the memo, then the roster', () => {
  const store = new ContactStore();
  const roster: Record<string, string> = { cap: 'SALT SHAKER' };

  /** main.ts `feedName`: the memo's DRONE, else the roster callsign, else null. */
  const names = (id: string): string | null => {
    const hull = store.everSeenClassOf(id);
    return hull !== undefined && isDroneHull(hull) ? DRONE_PLATE_TEXT : (roster[id] ?? null);
  };
  /** roomBindings `victimNameRef`, verbatim. */
  const victimName = (id: string, vcls?: HullId): string =>
    fleetSizeName(vcls) ?? names(id) ?? UNKNOWN_VESSEL;

  const sight = (id: string, cls: HullId): void => {
    store.pushFrame(100, [{ id, x: 0, y: 0, heading: 0, speed: 0, cls }]);
  };

  it('names OUR OWN kill by SIZE for each of the three fleet hulls, unseen or not', () => {
    // The whole reason the wire field exists: you can mine a fleet ship you
    // never once saw, and the size IS the payout (1/4, 1/3, 1/2 of a level).
    const sizes: [HullId, string][] = [
      ['droneSmall', 'SMALL DRONE'],
      ['droneMedium', 'MEDIUM DRONE'],
      ['droneLarge', 'LARGE DRONE'],
    ];
    for (const [cls, expected] of sizes) {
      const id = `never-seen-${cls}`;
      expect(store.everSeenClassOf(id)).toBeUndefined(); // never in our contact set
      expect(victimName(id, cls)).toBe(expected);
    }
  });

  it('vcls OUTRANKS the memo, so a fleet hull we DID see still reads its size', () => {
    sight('f-seen', 'droneMedium');
    expect(victimName('f-seen')).toBe(DRONE_PLATE_TEXT); // step 2 on its own
    expect(victimName('f-seen', 'droneMedium')).toBe('MEDIUM DRONE'); // step 1 wins
  });

  it('a fleet sinking we WITNESSED but did not cause reads plain DRONE (no vcls)', () => {
    // No `vcls` — the server stamps it only for the credited killer — so the
    // memo answers, and it still answers after the hull has aged out.
    sight('f-other', 'droneLarge');
    expect(victimName('f-other')).toBe(DRONE_PLATE_TEXT);
    store.prune(100_000, 500);
    expect(store.classOf('f-other')).toBeUndefined();
    expect(victimName('f-other')).toBe(DRONE_PLATE_TEXT); // the mined-trap case
  });

  it('never renames a CAPTAIN: fleetSizeName is null for every non-drone hull', () => {
    for (const cls of ['torpedoBoat', 'battleship', 'mineLayer'] as const) expect(fleetSizeName(cls)).toBeNull();
    expect(fleetSizeName(undefined)).toBeNull();
    // ...so a captain victim keeps their callsign even on a row carrying vcls.
    expect(victimName('cap', 'battleship')).toBe('SALT SHAKER');
  });

  it('falls through to UNKNOWN VESSEL only for a hull that is neither ours nor seen', () => {
    expect(victimName('ghost')).toBe(UNKNOWN_VESSEL);
  });
});

describe('a vcls-named fleet victim keeps the drone grey (pinDroneColor)', () => {
  beforeEach(() => {
    document.getElementById('kill-feed')?.remove();
  });

  const feed = (): HTMLElement => document.getElementById('kill-feed') as HTMLElement;
  const grey = CLIENT_CONFIG.colors.droneOutline;

  it('pins ONLY the victim id and defers every other id to the shipped resolver', () => {
    const base = (id: string): number | null => (id === 'k' ? 7 : null);
    const pinned = pinDroneColor('v', base);
    expect(pinned('v')).toBe(grey); // the victim the roster/contact set both miss
    expect(pinned('k')).toBe(7); // the killer resolves exactly as before
    expect(pinned('other')).toBeNull();
  });

  it('renders that grey VERBATIM, un-lightened, exactly as a seen drone always has', () => {
    pushKillLine(killLine({ name: 'SMALL DRONE', id: 'v' }, null), pinDroneColor('v', () => null));
    const span = feed().firstChild!.firstChild as HTMLSpanElement;
    const ref = document.createElement('span');
    ref.style.color = cssHex(grey); // NOT textSafe(grey) — the drone token is pinned
    expect(span.style.color).toBe(ref.style.color);
    expect(span.style.fontWeight).toBe('600');
    expect(span.style.textShadow).toBe(''); // a drone can never glow as kill leader
  });
});
