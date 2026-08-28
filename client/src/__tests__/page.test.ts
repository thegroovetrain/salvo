// THE STANDARD PAGE CHROME (Story 7.2, Eric ruling R12).
//
// What is pinned here is what Story 7.3 inherits, so the pins are the CONTRACT
// rather than the current styling: the 1100px column comes from the config token
// and nowhere else, the bed is the settings-overlay grammar including the
// container-fit `box-sizing`, ESC returns home, and `destroy()` takes the ESC
// binding with it (a page that outlived its listener would keep answering a key
// for a screen that is gone).
//
// Geometry is assertable at all only because ui/page.ts avoids the two CSSOM
// blob hazards ui/queueModal.ts documents — the `border:` shorthand with a var
// and the `background:` shorthand. If a later edit reintroduces either, these
// assertions go quiet rather than failing, which is why the border is asserted
// property-by-property below.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { CLIENT_CONFIG } from '../config.js';
import {
  makeKeyTable,
  makePageHeading,
  makePageLink,
  makePageList,
  makePageNote,
  makePageParagraph,
  makePageSection,
  renderPage,
  type MountedPage,
} from '../ui/page.js';

const P = CLIENT_CONFIG.page;

let mounted: MountedPage | null = null;

function build(over: Partial<Parameters<typeof renderPage>[0]> = {}): MountedPage {
  mounted = renderPage({
    id: 'test-page',
    title: 'PRIVACY POLICY',
    body: [makePageParagraph('a body block')],
    onBack: () => {},
    ...over,
  });
  return mounted;
}

function panelOf(page: MountedPage): HTMLElement {
  return page.root.firstElementChild as HTMLElement;
}

function backButton(page: MountedPage): HTMLButtonElement {
  return panelOf(page).querySelector('button') as HTMLButtonElement;
}

function esc(): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

afterEach(() => {
  mounted?.destroy();
  mounted = null;
  document.getElementById('test-page')?.remove();
});

// --- the column ---------------------------------------------------------------

describe('the 1100px port-chrome column', () => {
  it('takes its cap from CLIENT_CONFIG.page and states it nowhere else', () => {
    const panel = panelOf(build());
    expect(panel.style.maxWidth).toBe(`${P.maxWidthPx}px`);
    expect(panel.style.width).toBe(`${P.maxWidthPx}px`);
    // The token is the ratified {spacing.chrome-max-width} (DESIGN.md:94/:201).
    expect(P.maxWidthPx).toBe(1100);
  });

  it('centres the column in a fixed full-viewport root with a gutter', () => {
    const root = build().root;
    expect(root.style.position).toBe('fixed');
    expect(root.style.justifyContent).toBe('center');
    expect(root.style.padding).toBe(`${P.gutter}px`);
    // NOT a scrim: DESIGN dims behind the results screen only.
    expect(root.style.backgroundColor).toBe('transparent');
  });
});

// --- the bed ------------------------------------------------------------------

describe('the settings-overlay bed grammar', () => {
  it('is a panel bed with a 1px hairline and {rounded.lg}', () => {
    const panel = panelOf(build());
    expect(panel.style.backgroundColor).toBe('var(--hc-panel)');
    expect(panel.style.borderWidth).toBe('1px');
    expect(panel.style.borderStyle).toBe('solid');
    expect(panel.style.borderColor).toBe('var(--hc-hairline)');
    expect(panel.style.borderRadius).toBe(`${P.radius}px`);
  });

  it('owns its own scroll surface under the container-fit law (amendment 47)', () => {
    const panel = panelOf(build());
    expect(panel.style.boxSizing).toBe('border-box');
    expect(panel.style.overflowY).toBe('auto');
    expect(panel.style.maxHeight).toBe('100%');
  });
});

// --- content ------------------------------------------------------------------

describe('content', () => {
  it('renders the title, the optional sub-line and the body blocks in order', () => {
    const page = build({
      subtitle: 'Last updated today',
      body: [makePageParagraph('first'), makePageParagraph('second')],
    });
    expect(page.root.querySelector('h1')?.textContent).toBe('PRIVACY POLICY');
    expect(page.root.textContent).toContain('Last updated today');
    const paras = [...page.root.querySelectorAll('p')].map((p) => p.textContent);
    expect(paras).toEqual(['first', 'second']);
  });

  it('omits the sub-line entirely when none is given', () => {
    const page = build();
    // header = titles column + back button; the titles column holds only the h1.
    const header = panelOf(page).querySelector('header') as HTMLElement;
    expect((header.firstElementChild as HTMLElement).children).toHaveLength(1);
  });

  it('keeps prose off text-muted (DESIGN.md:153 bars it from load-bearing copy)', () => {
    const para = makePageParagraph('body copy');
    const note = makePageNote('an aside');
    expect(para.style.color).toBe('var(--hc-text-primary)');
    expect(note.style.color).toBe('var(--hc-text-secondary)');
    expect(para.style.color).not.toContain('muted');
    expect(note.style.color).not.toContain('muted');
  });

  it('gives headings the mono system register and phosphor', () => {
    const h = makePageHeading('WHAT STAYS ON YOUR DEVICE');
    expect(h.style.color).toBe('var(--hc-phosphor)');
    expect(h.style.textTransform).toBe('uppercase');
    // The `font:` SHORTHAND carries the family, and a `var()` inside a shorthand
    // is not decomposed into `fontFamily` by the CSSOM — so the assertion has to
    // read the declaration text, not the longhand.
    expect(h.style.cssText).toContain('--hc-font-mono');
  });

  it('builds a section as heading-then-children, and a list as one li per item', () => {
    const section = makePageSection('HEADING', makePageList(['one', 'two', 'three']));
    expect(section.children).toHaveLength(2);
    expect(section.children[0].textContent).toBe('HEADING');
    expect(section.querySelectorAll('li')).toHaveLength(3);
  });
});

// --- links --------------------------------------------------------------------

describe('inline links (Story 7.3 — the register `textContent` could not reach)', () => {
  it('is a real anchor carrying the href, in the body register and phosphor', () => {
    const a = makePageLink('Google privacy policy', 'https://policies.google.com/privacy');
    expect(a.tagName).toBe('A');
    expect(a.getAttribute('href')).toBe('https://policies.google.com/privacy');
    expect(a.textContent).toBe('Google privacy policy');
    expect(a.style.color).toBe('var(--hc-phosphor)');
    // Body copy, not the mono system voice — the `font:` shorthand carries the
    // family, so read the declaration text (see the heading assertion above).
    expect(a.style.cssText).toContain('--hc-font-display');
  });

  it('never leans on colour alone — phosphor is the heading colour too', () => {
    const a = makePageLink('write to us', 'mailto:port@example.test');
    expect(a.style.textDecoration).toContain('underline');
    expect(a.getAttribute('rel')).toContain('noopener');
  });

  it('composes INSIDE a paragraph as well as standing alone', () => {
    const p = makePageParagraph('See the ');
    p.appendChild(makePageLink('policy', 'https://policies.google.com/privacy'));
    p.appendChild(document.createTextNode(' for details.'));
    expect(p.querySelectorAll('a')).toHaveLength(1);
    expect(p.textContent).toBe('See the policy for details.');
  });
});

// --- the controls table -------------------------------------------------------

function capsOf(table: HTMLElement): HTMLElement[] {
  return [...table.querySelectorAll('td:first-child span')] as HTMLElement[];
}

describe('keycaps (Eric ruling 2026-08-19 — keys render as BOXES, not text)', () => {
  it('wears the in-game keycap treatment: 22px box, 1px hairline, mono 14', () => {
    const cap = capsOf(makeKeyTable([{ keys: ['W'], action: 'Ahead' }]))[0];
    // ui/upgradeMenu.ts's refit digit — restated here, never imported.
    expect(cap.style.minWidth).toBe('22px');
    expect(cap.style.height).toBe('22px');
    // Property-by-property: the `border:` shorthand would void the whole blob
    // and make this assertion go quiet rather than fail.
    expect(cap.style.borderWidth).toBe('1px');
    expect(cap.style.borderStyle).toBe('solid');
    expect(cap.style.borderColor.toLowerCase()).toBe('currentcolor');
    expect(cap.style.cssText).toContain('--hc-font-mono');
    expect(cap.style.boxSizing).toBe('border-box');
  });

  it('lets a wide cap grow sideways while the box height never moves', () => {
    const caps = capsOf(makeKeyTable([{ keys: ['TAB', 'ENTER'], action: 'Wide keys' }]));
    expect(caps.map((c) => c.textContent)).toEqual(['TAB', 'ENTER']);
    for (const cap of caps) {
      // `min-width`, not `width` — a wide cap widens, it does not shrink its type.
      expect(cap.style.width).toBe('');
      expect(cap.style.minWidth).toBe('22px');
      expect(cap.style.height).toBe('22px');
    }
  });

  it('renders one row per binding, with every cap side by side and the action', () => {
    const table = makeKeyTable([
      { keys: ['W', 'S'], action: 'Engine order' },
      { keys: ['1', '2', '3', '4'], action: 'Select a weapon' },
      { keys: ['TAB'], action: 'Open the refit window' },
    ]);
    const rows = [...table.querySelectorAll('tr')];
    expect(rows).toHaveLength(3);
    expect([...rows[0].querySelectorAll('span')].map((s) => s.textContent)).toEqual(['W', 'S']);
    expect(rows[1].querySelectorAll('span')).toHaveLength(4);
    expect(rows[2].children[1].textContent).toBe('Open the refit window');
    // The action is body copy, off text-muted like every other page register.
    const action = rows[2].children[1] as HTMLElement;
    expect(action.style.color).toBe('var(--hc-text-primary)');
  });

  it('cannot force the 1100px column to scroll sideways at the 1366x768 floor', () => {
    const table = makeKeyTable([{ keys: ['SHIFT'], action: 'A long action description' }]);
    expect(table.style.width).toBe('100%');
    expect(table.style.maxWidth).toBe('100%');
    // The keys cell is content-sized and nowrap; the ACTION cell absorbs the
    // rest and wraps, so the table's own width is never content-driven.
    const keysCell = table.querySelector('td') as HTMLElement;
    expect(keysCell.style.whiteSpace).toBe('nowrap');
    expect(keysCell.style.width).toBe('1%');
  });

  it('renders an empty table for no bindings rather than throwing', () => {
    expect(makeKeyTable([]).querySelectorAll('tr')).toHaveLength(0);
  });
});

// --- the way back -------------------------------------------------------------

describe('ESC / back returns home (EXPERIENCE.md:37)', () => {
  it('ESC calls onBack', () => {
    const onBack = vi.fn();
    build({ onBack });
    esc();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('the back affordance calls onBack and never keeps focus', () => {
    const onBack = vi.fn();
    const page = build({ onBack });
    const btn = backButton(page);
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    btn.dispatchEvent(down);
    // A focused <button> would trip the keyboard chokepoint's text-entry guard
    // and swallow the ESC this very page binds.
    expect(down.defaultPrevented).toBe(true);
    btn.click();
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(document.activeElement).not.toBe(btn);
  });

  it('wears the SECONDARY button treatment — the one ratified shape, unlit', () => {
    const btn = backButton(build());
    // DESIGN.md:111/:244 — outline + glow, NEVER a filled slab. The secondary is
    // the same shape without the bloom (ui/results.ts:733-770's precedent).
    expect(btn.style.backgroundColor).toBe('transparent');
    expect(btn.style.borderWidth).toBe('1px');
    expect(btn.style.borderColor).toBe('var(--hc-phosphor)');
    expect(btn.style.boxShadow).toBe('');
    expect(btn.textContent).toContain('BACK TO PORT');
    expect(btn.textContent).toContain('ESC');
  });

  it('takes a custom back label', () => {
    expect(backButton(build({ backLabel: 'CLOSE' })).textContent).toContain('CLOSE');
  });
});

// --- lifetime -----------------------------------------------------------------

describe('lifetime', () => {
  it('mounts into the given host, defaulting to document.body', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const page = build({ host });
    expect(host.contains(page.root)).toBe(true);
    page.destroy();
    host.remove();
    expect(document.getElementById('test-page')).toBeNull();
  });

  it('destroy() removes the page AND unbinds ESC, and is idempotent', () => {
    const onBack = vi.fn();
    const page = build({ onBack });
    page.destroy();
    expect(document.getElementById('test-page')).toBeNull();
    esc();
    expect(onBack).not.toHaveBeenCalled();
    page.destroy(); // second call is a no-op, not a throw
    expect(onBack).not.toHaveBeenCalled();
  });

  // The 7.2 review-gate defect: `src/privacy/main.ts` discards the handle, so
  // `destroy()` is unreachable and a second mount would stack two `inset:0`
  // roots with duplicate ids and TWO capture-phase ESC listeners.
  it('a second renderPage replaces the first — one root, one ESC, one onBack', () => {
    const first = vi.fn();
    const second = vi.fn();
    const a = renderPage({
      id: 'test-page',
      title: 'FIRST',
      body: [makePageParagraph('one')],
      onBack: first,
    });
    mounted = renderPage({
      id: 'test-page',
      title: 'SECOND',
      body: [makePageParagraph('two')],
      onBack: second,
    });
    // The stale sheet is GONE, not stacked behind the fresh one.
    expect(a.root.isConnected).toBe(false);
    expect(document.querySelectorAll('#test-page')).toHaveLength(1);
    expect(document.querySelector('#test-page')?.textContent).toContain('SECOND');
    esc();
    // Exactly one handler answered: the dead page's binding went with it.
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    // The replaced handle stays safe to call — it just has nothing left to do.
    a.destroy();
    expect(document.querySelectorAll('#test-page')).toHaveLength(1);
  });

  // DISPOSAL IS REACHABLE WITHOUT THE CALLER (Story 7-8). Neither
  // `src/privacy/main.ts` nor `src/how-to-play/main.ts` keeps the handle, so
  // before this the capture-phase ESC listener had no teardown path at all.
  it('pagehide disposes the page and its ESC binding', () => {
    const onBack = vi.fn();
    const page = build({ onBack });
    window.dispatchEvent(new Event('pagehide'));
    expect(page.root.isConnected).toBe(false);
    expect(document.getElementById('test-page')).toBeNull();
    esc();
    expect(onBack).not.toHaveBeenCalled();
    // ...and the handle stays safe to call afterwards (afterEach does exactly
    // that): disposal is idempotent whichever leg got there first.
    expect(() => page.destroy()).not.toThrow();
  });

  // A `pagehide` with `persisted: true` means the document is entering the
  // back/forward cache and may be shown again EXACTLY as it is — including this
  // handler's mutations. Tearing the root out there restores a blank page.
  it('leaves the page alone on a bfcache pagehide, and still disposes later', () => {
    const onBack = vi.fn();
    const page = build({ onBack });
    window.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: true }));
    expect(page.root.isConnected).toBe(true);
    esc();
    expect(onBack).toHaveBeenCalledTimes(1);
    // The listener was not consumed by the bfcache pass: real termination still
    // disposes.
    window.dispatchEvent(new Event('pagehide'));
    expect(page.root.isConnected).toBe(false);
  });

  it('disowns its ESC binding if the root is dropped without destroy()', () => {
    const onBack = vi.fn();
    const page = build({ onBack });
    page.root.remove(); // a host tearing the DOM down its own way
    esc();
    expect(onBack).not.toHaveBeenCalled();
    // It UNBOUND itself rather than merely skipping one press: re-attaching the
    // orphaned root does not bring the capture-phase listener back to life.
    document.body.appendChild(page.root);
    esc();
    expect(onBack).not.toHaveBeenCalled();
  });
});
