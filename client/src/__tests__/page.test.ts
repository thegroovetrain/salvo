// THE STANDARD PAGE CHROME (Story 7.2, Eric ruling R12; Story 13.1).
//
// What is pinned here is the CONTRACT rather than the current styling: the
// 1100px column comes from the config token and nowhere else, the bed is the
// settings-overlay grammar including the container-fit `box-sizing`, the way
// back is a real link home, ESC returns home, and `attachPage` wires behavior
// onto the SERVED page without adding, removing or redrawing a node.
//
// The page is now ONE build string (`ui/pageMarkup.ts`). Mounting it here goes
// through the same `style` attributes the served document carries, which jsdom
// parses through the same CSSOM a `cssText` write uses — so the two blob
// hazards (the `border:` shorthand with a var, the `background:` shorthand)
// would still make these assertions go quiet rather than fail, which is why the
// border is asserted property-by-property below.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { CLIENT_CONFIG } from '../config.js';
import {
  keyTable,
  pageHeading,
  pageLink,
  pageList,
  pageMarkup,
  pageNote,
  pageParagraph,
  pageParagraphHtml,
  pageSection,
  type PageMarkupOptions,
} from '../ui/pageMarkup.js';
import { attachPage, type AttachedPage } from '../ui/page.js';

const P = CLIENT_CONFIG.page;
const ID = 'test-page';

let attached: AttachedPage | null = null;

function markup(over: Partial<PageMarkupOptions> = {}): string {
  return pageMarkup({ id: ID, title: 'PRIVACY POLICY', body: [pageParagraph('a body block')], ...over });
}

/** One block's markup as a detached element. */
function node(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host.firstElementChild as HTMLElement;
}

/** Serve a page (as the build does: first thing in body), then attach. */
function serveAndAttach(over: Partial<PageMarkupOptions> = {}, onBack = vi.fn()): AttachedPage {
  document.body.insertAdjacentHTML('afterbegin', markup(over));
  attached = attachPage({ id: ID, markup: () => markup(over), onBack });
  return attached;
}

function rootOf(): HTMLElement {
  return document.getElementById(ID) as HTMLElement;
}

function panelOf(): HTMLElement {
  return rootOf().firstElementChild as HTMLElement;
}

function backLink(): HTMLAnchorElement {
  return panelOf().querySelector('header nav a') as HTMLAnchorElement;
}

/**
 * The 1px outline, read from the `style` ATTRIBUTE — the text the browser
 * parses. jsdom's CSSOM folds `border-*` longhands that carry a `var()` into
 * per-side shorthands and then answers '' for every border longhand getter
 * (measured), so the getters cannot see a var-colored border; a `currentColor`
 * one they can (the keycap test below). Never the `border:` shorthand.
 */
function expectHairline(el: HTMLElement, color: string): void {
  const style = el.getAttribute('style') ?? '';
  expect(style).toContain(`border-width:1px;border-style:solid;border-color:${color}`);
  expect(style).not.toMatch(/(^|;)border:/);
}

function esc(): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

afterEach(() => {
  attached?.detach();
  attached = null;
  for (const el of document.querySelectorAll(`#${ID}`)) el.remove();
});

// --- the column ---------------------------------------------------------------

describe('the 1100px port-chrome column', () => {
  it('takes its cap from CLIENT_CONFIG.page and states it nowhere else', () => {
    const panel = node(markup()).firstElementChild as HTMLElement;
    expect(panel.style.maxWidth).toBe(`${P.maxWidthPx}px`);
    expect(panel.style.width).toBe(`${P.maxWidthPx}px`);
  });

  it('centres the column in a fixed full-viewport root with a gutter', () => {
    const root = node(markup());
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
    const panel = node(markup()).firstElementChild as HTMLElement;
    expect(panel.style.backgroundColor).toBe('var(--hc-panel)');
    expectHairline(panel, 'var(--hc-hairline)');
    expect(panel.style.borderRadius).toBe(`${P.radius}px`);
  });

  it('owns its own scroll surface under the container-fit law (amendment 47)', () => {
    const panel = node(markup()).firstElementChild as HTMLElement;
    expect(panel.style.boxSizing).toBe('border-box');
    expect(panel.style.overflowY).toBe('auto');
    expect(panel.style.maxHeight).toBe('100%');
  });
});

// --- structure ------------------------------------------------------------------

describe('structure', () => {
  it('one h1 in the header, the body as the one main, the way back in a nav', () => {
    const root = node(markup({ body: [pageSection('A', pageParagraph('x')), pageSection('B', pageParagraph('y'))] }));
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    expect(root.querySelector('header h1')).not.toBeNull();
    expect(root.querySelectorAll('main')).toHaveLength(1);
    expect(root.querySelectorAll('main > section')).toHaveLength(2);
    expect(root.querySelectorAll('nav')).toHaveLength(1);
    expect(root.querySelector('nav a')?.getAttribute('href')).toBe('/');
  });

  it('carries no script, and escapes every text argument', () => {
    const nasty = '<script>x</script>&"';
    const html = markup({ title: nasty, subtitle: nasty, body: [pageParagraph(nasty), pageList([nasty])] });
    expect(html).not.toMatch(/<script\b/i);
    const root = node(html);
    expect(root.querySelector('h1')?.textContent).toBe(nasty);
    expect(root.querySelector('li')?.textContent).toBe(nasty);
  });
});

// --- content ------------------------------------------------------------------

describe('content', () => {
  it('renders the title, the optional sub-line and the body blocks in order', () => {
    const root = node(markup({ subtitle: 'Last updated today', body: [pageParagraph('first'), pageParagraph('second')] }));
    expect(root.querySelector('h1')?.textContent).toBe('PRIVACY POLICY');
    expect(root.querySelector('h1')?.nextElementSibling?.textContent).toBe('Last updated today');
    const paras = [...root.querySelectorAll('main p')].map((p) => p.textContent);
    expect(paras).toEqual(['first', 'second']);
  });

  it('omits the sub-line entirely when none is given', () => {
    // header = titles column + the way back; the titles column holds only the h1.
    const header = node(markup()).querySelector('header') as HTMLElement;
    expect((header.firstElementChild as HTMLElement).children).toHaveLength(1);
  });

  it('keeps prose off text-muted (DESIGN.md:153 bars it from load-bearing copy)', () => {
    const para = node(pageParagraph('body copy'));
    const note = node(pageNote('an aside'));
    expect(para.style.color).toBe('var(--hc-text-primary)');
    expect(note.style.color).toBe('var(--hc-text-secondary)');
  });

  it('gives headings the mono system register and phosphor', () => {
    const h = node(pageHeading('WHAT STAYS ON YOUR DEVICE'));
    expect(h.style.color).toBe('var(--hc-phosphor)');
    expect(h.style.textTransform).toBe('uppercase');
    // The `font:` SHORTHAND carries the family, and a `var()` inside a shorthand
    // is not decomposed into `fontFamily` by the CSSOM — read the declaration text.
    expect(h.style.cssText).toContain('--hc-font-mono');
  });

  it('builds a section as heading-then-children, and a list as one li per item', () => {
    const section = node(pageSection('HEADING', pageList(['one', 'two', 'three'])));
    expect(section.children).toHaveLength(2);
    expect(section.children[0].textContent).toBe('HEADING');
    expect(section.querySelectorAll('li')).toHaveLength(3);
  });
});

// --- links --------------------------------------------------------------------

describe('inline links', () => {
  it('is a real anchor carrying the href, in the body register and phosphor', () => {
    const a = node(pageLink('Google privacy policy', 'https://policies.google.com/privacy'));
    expect(a.tagName).toBe('A');
    expect(a.getAttribute('href')).toBe('https://policies.google.com/privacy');
    expect(a.textContent).toBe('Google privacy policy');
    expect(a.style.color).toBe('var(--hc-phosphor)');
    expect(a.style.cssText).toContain('--hc-font-display');
  });

  it('never leans on colour alone — phosphor is the heading colour too', () => {
    const a = node(pageLink('write to us', 'mailto:port@example.test'));
    expect(a.style.textDecoration).toContain('underline');
    expect(a.getAttribute('rel')).toContain('noopener');
  });

  it('composes INSIDE a paragraph', () => {
    const p = node(pageParagraphHtml(`See the ${pageLink('policy', 'https://policies.google.com/privacy')} for details.`));
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
    const cap = capsOf(node(keyTable([{ keys: ['W'], action: 'Ahead' }])))[0];
    expect(cap.style.minWidth).toBe('22px');
    expect(cap.style.height).toBe('22px');
    expect(cap.style.borderWidth).toBe('1px');
    expect(cap.style.borderStyle).toBe('solid');
    expect(cap.style.borderColor.toLowerCase()).toBe('currentcolor');
    expect(cap.style.cssText).toContain('--hc-font-mono');
    expect(cap.style.boxSizing).toBe('border-box');
  });

  it('lets a wide cap grow sideways while the box height never moves', () => {
    const caps = capsOf(node(keyTable([{ keys: ['TAB', 'ENTER'], action: 'Wide keys' }])));
    expect(caps.map((c) => c.textContent)).toEqual(['TAB', 'ENTER']);
    for (const cap of caps) {
      expect(cap.style.width).toBe('');
      expect(cap.style.minWidth).toBe('22px');
      expect(cap.style.height).toBe('22px');
    }
  });

  it('renders one row per binding, with every cap side by side and the action', () => {
    const table = node(
      keyTable([
        { keys: ['W', 'S'], action: 'Engine order' },
        { keys: ['1', '2', '3', '4'], action: 'Select a weapon' },
        { keys: ['TAB'], action: 'Open the refit window' },
      ]),
    );
    const rows = [...table.querySelectorAll('tr')];
    expect(rows).toHaveLength(3);
    expect([...rows[0].querySelectorAll('span')].map((s) => s.textContent)).toEqual(['W', 'S']);
    expect(rows[1].querySelectorAll('span')).toHaveLength(4);
    expect(rows[2].children[1].textContent).toBe('Open the refit window');
    expect((rows[2].children[1] as HTMLElement).style.color).toBe('var(--hc-text-primary)');
  });

  it('cannot force the 1100px column to scroll sideways at the 1366x768 floor', () => {
    const table = node(keyTable([{ keys: ['SHIFT'], action: 'A long action description' }]));
    expect(table.style.width).toBe('100%');
    expect(table.style.maxWidth).toBe('100%');
    const keysCell = table.querySelector('td') as HTMLElement;
    expect(keysCell.style.whiteSpace).toBe('nowrap');
    expect(keysCell.style.width).toBe('1%');
  });

  it('renders an empty table for no bindings rather than throwing', () => {
    expect(node(keyTable([])).querySelectorAll('tr')).toHaveLength(0);
  });
});

// --- the way back -------------------------------------------------------------

describe('the way back (EXPERIENCE.md:37)', () => {
  it('is a real link home in a nav, so it works without scripting', () => {
    serveAndAttach();
    expect(backLink().getAttribute('href')).toBe('/');
    expect(backLink().parentElement?.tagName).toBe('NAV');
  });

  it('wears the SECONDARY button treatment — the one ratified shape, unlit', () => {
    serveAndAttach();
    const a = backLink();
    expect(a.style.backgroundColor).toBe('transparent');
    expectHairline(a, 'var(--hc-phosphor)');
    expect(a.style.boxShadow).toBe('');
    expect(a.style.textDecoration).toBe('none');
    expect(a.textContent).toContain('ESC'); // the key chip names the key it binds
  });

  it('takes a custom back label', () => {
    expect(node(markup({ backLabel: 'CLOSE' })).querySelector('nav a')?.textContent).toContain('CLOSE');
  });

  it('ESC calls onBack', () => {
    const onBack = vi.fn();
    serveAndAttach({}, onBack);
    esc();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  // It was a <button>, which Space activates; an anchor only answers Enter.
  // Enter on a link IS a click on it, so Space must be the same click.
  function clicksOnBack(): ReturnType<typeof vi.fn> {
    const clicked = vi.fn();
    backLink().addEventListener('click', (e) => {
      e.preventDefault(); // jsdom cannot navigate; the click itself is the contract
      clicked();
    });
    return clicked;
  }

  function space(target: EventTarget): KeyboardEvent {
    const e = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    return e;
  }

  it('Space on the focused way back clicks it, as Enter does, and claims the key', () => {
    serveAndAttach();
    const clicked = clicksOnBack();
    backLink().focus();
    expect(space(backLink()).defaultPrevented).toBe(true);
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('Space anywhere else does nothing, and detach() unbinds it', () => {
    const page = serveAndAttach();
    const clicked = clicksOnBack();
    expect(space(document.body).defaultPrevented).toBe(false);
    page.detach();
    backLink().focus();
    expect(space(backLink()).defaultPrevented).toBe(false);
    expect(clicked).not.toHaveBeenCalled();
  });
});

// --- attach -------------------------------------------------------------------

describe('attachPage wires behavior onto the served page', () => {
  it('adds, removes and redraws nothing: the served nodes are the attached ones', () => {
    document.body.insertAdjacentHTML('afterbegin', markup());
    const h1 = document.querySelector('h1');
    const before = document.body.innerHTML;
    attached = attachPage({ id: ID, markup, onBack: vi.fn() });
    expect(attached.root).toBe(rootOf());
    expect(document.querySelector('h1')).toBe(h1);
    expect(document.body.innerHTML).toBe(before);
  });

  it('with no served root (a bare document), inserts the same build string first', () => {
    attached = attachPage({ id: ID, markup, onBack: vi.fn() });
    expect(document.body.firstElementChild).toBe(rootOf());
    expect(rootOf().outerHTML).toBe(node(markup()).outerHTML);
  });

  it('with no served root, themes the document before inserting (the head theme is absent too)', () => {
    const html = document.documentElement;
    html.removeAttribute('style');
    attached = attachPage({ id: ID, markup, onBack: vi.fn() });
    // Every var the page's styles name is defined on :root.
    for (const v of new Set(rootOf().outerHTML.match(/--hc-[\w-]+/g) ?? [])) {
      expect(html.style.getPropertyValue(v), v).not.toBe('');
    }
  });

  it('a served root is left to its served head: attaching themes nothing', () => {
    const html = document.documentElement;
    html.removeAttribute('style');
    serveAndAttach();
    expect(html.getAttribute('style') ?? '').toBe('');
  });

  it('a second attach re-finds the same root — one page, one ESC, one onBack', () => {
    const first = vi.fn();
    const second = vi.fn();
    const a = serveAndAttach({}, first);
    attached = attachPage({ id: ID, markup, onBack: second });
    expect(attached.root).toBe(a.root);
    expect(document.querySelectorAll(`#${ID}`)).toHaveLength(1);
    esc();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    a.detach(); // the replaced handle stays safe to call
    expect(document.querySelectorAll(`#${ID}`)).toHaveLength(1);
  });

  it('detach() unbinds ESC, keeps the served page, and is idempotent', () => {
    const onBack = vi.fn();
    const page = serveAndAttach({}, onBack);
    page.detach();
    expect(page.root.isConnected).toBe(true);
    esc();
    expect(onBack).not.toHaveBeenCalled();
    expect(() => page.detach()).not.toThrow();
  });
});

// --- lifetime -----------------------------------------------------------------

describe('lifetime', () => {
  // Story 7-8: neither page main keeps the handle, so `pagehide` is what makes
  // disposal reachable at all.
  it('a terminating pagehide unbinds ESC and leaves the page in place', () => {
    const onBack = vi.fn();
    const page = serveAndAttach({}, onBack);
    window.dispatchEvent(new Event('pagehide'));
    expect(page.root.isConnected).toBe(true);
    esc();
    expect(onBack).not.toHaveBeenCalled();
    expect(() => page.detach()).not.toThrow();
  });

  // A `pagehide` with `persisted: true` means the document is entering the
  // back/forward cache and may be shown again EXACTLY as it is.
  it('changes nothing on a bfcache pagehide, and still disposes later', () => {
    const onBack = vi.fn();
    const page = serveAndAttach({}, onBack);
    const h1 = document.querySelector('h1');
    window.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: true }));
    expect(page.root.isConnected).toBe(true);
    expect(document.querySelector('h1')).toBe(h1);
    esc();
    expect(onBack).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('pagehide'));
    esc();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('disowns its ESC binding if the root is dropped without detach()', () => {
    const onBack = vi.fn();
    const page = serveAndAttach({}, onBack);
    page.root.remove();
    esc();
    expect(onBack).not.toHaveBeenCalled();
    // It UNBOUND itself: re-attaching the orphaned root does not revive it.
    document.body.appendChild(page.root);
    esc();
    expect(onBack).not.toHaveBeenCalled();
  });
});
