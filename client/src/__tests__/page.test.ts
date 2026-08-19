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
  makePageHeading,
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
});
