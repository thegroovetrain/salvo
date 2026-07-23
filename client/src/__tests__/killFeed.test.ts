// Kill feed (ui/killFeed.ts) — Story 1.12 UX-DR17. killLine() is pure: it shapes
// a sinking into colored SEGMENTS and mid-ellipsizes long callsigns. pushKillLine
// is a thin DOM adapter: name spans take their pilot's text-safe hue (600-weight),
// connective text inherits the container's text-secondary, newest line on top,
// capped at MAX_LINES.

import { describe, it, expect, beforeEach } from 'vitest';
import { killLine, ellipsizeName, pushKillLine } from '../ui/killFeed.js';
import { CLIENT_CONFIG } from '../config.js';
import { cssHex } from '../util/color.js';

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
    const droneOutline = CLIENT_CONFIG.colors.droneOutline;
    pushKillLine(killLine({ name: 'DRONE-01', id: 'd' }, null), () => droneOutline);
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

  it('caps the stack at 5 lines (oldest at the bottom evicted)', () => {
    for (let i = 0; i < 8; i++) pushKillLine([{ text: `L${i}` }], () => null);
    expect(feed().children).toHaveLength(5);
    expect(feed().firstChild!.textContent).toBe('L7'); // newest
    expect(feed().lastChild!.textContent).toBe('L3'); // oldest surviving
  });
});
