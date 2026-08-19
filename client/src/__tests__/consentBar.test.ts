// THE CONSENT BAR (Story 7.2, Eric ruling R2: NON-BLOCKING).
//
// THE LOAD-BEARING PIN IS THE NON-BLOCKING ONE, and it is structural rather than
// visual: the bar must add EXACTLY ONE element, anchored to the bottom edge, with
// no `top` and no `inset` — because a `position:fixed` element hit-tests every
// pixel it covers whether it paints or not (ui/queueModal.ts leans on precisely
// that to take the home's doors out of reach). One `inset:0` scrim, added for any
// reason, silently converts this bar into the blocking modal Eric ruled against,
// and nothing on screen would look different.
//
// The second pin is the seam: this module must stay callable with no analytics
// layer at all. Every test below drives it with bare `vi.fn()` callbacks — if a
// future edit reaches into `analytics/`, these stop compiling in isolation.
//
// Copy is asserted as EXPORTED CONSTANTS rather than by scraping the DOM, so the
// legally load-bearing clauses (R7's "nothing loads until you accept", R3's
// cookie disclosure, NFR19's "never your callsign") have named pins a reviewer
// can find.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { CLIENT_CONFIG } from '../config.js';
import {
  CONSENT_ACCEPT_LABEL,
  CONSENT_BAR_ID,
  CONSENT_DECLINE_LABEL,
  CONSENT_NOTICE,
  consentBarVisible,
  hideConsentBar,
  showConsentBar,
} from '../ui/consentBar.js';

function bar(): HTMLElement | null {
  return document.getElementById(CONSENT_BAR_ID);
}

function accept(): HTMLButtonElement {
  return document.getElementById(`${CONSENT_BAR_ID}-accept`) as HTMLButtonElement;
}

function decline(): HTMLButtonElement {
  return document.getElementById(`${CONSENT_BAR_ID}-decline`) as HTMLButtonElement;
}

function show(over: Partial<Parameters<typeof showConsentBar>[0]> = {}): () => void {
  return showConsentBar({ onAccept: vi.fn(), onDecline: vi.fn(), ...over });
}

afterEach(() => {
  hideConsentBar();
  document.body.innerHTML = '';
});

// --- R2: it does not block the home ------------------------------------------

describe('R2 — the bar is non-blocking', () => {
  it('adds exactly ONE element and it is anchored to ONE corner only', () => {
    // Re-placed by Eric (2026-08-18) from a full-width bottom strip to a
    // BOTTOM-RIGHT corner card: the strip ran under the centred port column and
    // covered the underplay links — including PRIVACY, the AC's own required
    // policy link — at the 1366x768 floor viewport. A corner card cannot reach
    // them at any ratified width. The non-blocking claim is unchanged and is
    // still asserted structurally, by the ABSENCE of `top`/`left`/`inset`.
    show();
    expect(document.body.children).toHaveLength(1);
    const el = bar() as HTMLElement;
    expect(el.style.position).toBe('fixed');
    expect(el.style.bottom).not.toBe('');
    expect(el.style.right).not.toBe('');
    // NO `top`, NO `left`, NO `inset` — the three ways this becomes a scrim or
    // re-spans the width.
    expect(el.style.top).toBe('');
    expect(el.style.left).toBe('');
    expect(el.style.inset).toBe('');
  });

  it('is narrow enough that it can never reach the centred port column', () => {
    // The load-bearing geometric claim of the corner placement. The port column
    // is centred and ~480px wide at the 1366px floor; a card capped at 380px on
    // the right edge leaves it untouched. If someone widens the cap past the
    // free margin, this fails before a screenshot has to catch it again.
    const FLOOR_W = 1366;
    const COLUMN_W = 480; // the port's rigid column at the floor viewport
    const free = (FLOOR_W - COLUMN_W) / 2; // margin on each side of the column
    expect(CLIENT_CONFIG.consent.maxWidth + CLIENT_CONFIG.consent.inset).toBeLessThanOrEqual(free);
    // Asserted off CONFIG rather than off the element: the width is a `min()`
    // expression and jsdom's CSSOM does not serialize those, so reading it back
    // would test the parser rather than the geometry.
  });

  it('leaves the home\'s own controls reachable', () => {
    const homeButton = document.createElement('button');
    const pressed = vi.fn();
    homeButton.addEventListener('click', pressed);
    document.body.appendChild(homeButton);
    show();
    homeButton.click();
    expect(pressed).toHaveBeenCalledTimes(1);
    // …and the bar did not detach, reparent or disable it.
    expect(document.body.contains(homeButton)).toBe(true);
    expect(homeButton.hasAttribute('disabled')).toBe(false);
  });

  it('sits above every port rung, because those rungs hit-test the whole viewport', () => {
    show();
    expect((bar() as HTMLElement).style.zIndex).toBe(String(CLIENT_CONFIG.consent.zIndex));
    // The ratified ladder tops out at the class bay (1200) before this.
    expect(CLIENT_CONFIG.consent.zIndex).toBeGreaterThan(1200);
    expect(CLIENT_CONFIG.settings.zIndex).toBeLessThan(CLIENT_CONFIG.consent.zIndex);
  });
});

// --- the two actions ----------------------------------------------------------

describe('the two actions', () => {
  it('ACCEPT fires its callback once and takes the bar down', () => {
    const onAccept = vi.fn();
    const onDecline = vi.fn();
    show({ onAccept, onDecline });
    accept().click();
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onDecline).not.toHaveBeenCalled();
    expect(bar()).toBeNull();
    expect(consentBarVisible()).toBe(false);
  });

  it('DECLINE fires its callback once and takes the bar down', () => {
    const onAccept = vi.fn();
    const onDecline = vi.fn();
    show({ onAccept, onDecline });
    decline().click();
    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
    expect(bar()).toBeNull();
  });

  it('are the ONE ratified button twice — ACCEPT lit amber, DECLINE the same shape unlit', () => {
    show();
    // DESIGN.md:111/:244 — outline + glow, NEVER a filled slab.
    for (const btn of [accept(), decline()]) {
      expect(btn.style.backgroundColor).toBe('transparent');
      expect(btn.style.borderWidth).toBe('1px');
      expect(btn.style.borderStyle).toBe('solid');
      expect(btn.style.textTransform).toBe('uppercase');
    }
    expect(accept().style.borderColor).toBe('var(--hc-amber)');
    expect(accept().style.color).toBe('var(--hc-amber)');
    expect(accept().style.boxShadow).not.toBe('');
    // The secondary treatment (ui/results.ts:733-770): same shape, no bloom.
    expect(decline().style.borderColor).toBe('var(--hc-phosphor)');
    expect(decline().style.boxShadow).toBe('');
  });

  it('never keep focus — a focused button swallows the port\'s ESC', () => {
    show();
    for (const btn of [accept(), decline()]) {
      const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      btn.dispatchEvent(down);
      expect(down.defaultPrevented).toBe(true);
    }
    accept().click();
    expect(document.activeElement).not.toBe(accept());
  });

  it('wear the uppercase-mono action labels', () => {
    show();
    expect(accept().textContent).toBe(CONSENT_ACCEPT_LABEL);
    expect(decline().textContent).toBe(CONSENT_DECLINE_LABEL);
    expect(CONSENT_ACCEPT_LABEL).toBe(CONSENT_ACCEPT_LABEL.toUpperCase());
    expect(CONSENT_DECLINE_LABEL).toBe(CONSENT_DECLINE_LABEL.toUpperCase());
  });
});

// --- the policy link ----------------------------------------------------------

describe('the policy link', () => {
  it('is a real anchor to /privacy (R8), not a click handler', () => {
    show();
    const a = document.getElementById(`${CONSENT_BAR_ID}-policy`) as HTMLAnchorElement;
    expect(a.tagName).toBe('A');
    expect(a.getAttribute('href')).toBe('/privacy');
    expect(CLIENT_CONFIG.consent.policyHref).toBe('/privacy');
  });

  it('honours an overridden destination', () => {
    show({ policyHref: '/legal' });
    const a = document.getElementById(`${CONSENT_BAR_ID}-policy`) as HTMLAnchorElement;
    expect(a.getAttribute('href')).toBe('/legal');
  });
});

// --- lifetime -----------------------------------------------------------------

describe('lifetime', () => {
  it('returns a disposer that removes the bar and fires no callback', () => {
    const onAccept = vi.fn();
    const onDecline = vi.fn();
    const dispose = show({ onAccept, onDecline });
    expect(consentBarVisible()).toBe(true);
    dispose();
    expect(bar()).toBeNull();
    expect(consentBarVisible()).toBe(false);
    dispose(); // idempotent
    expect(onAccept).not.toHaveBeenCalled();
    expect(onDecline).not.toHaveBeenCalled();
  });

  it('never stacks — a second show replaces the first', () => {
    show();
    show();
    expect(document.querySelectorAll(`#${CONSENT_BAR_ID}`)).toHaveLength(1);
  });

  it('mounts into a given host', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    show({ host });
    expect(host.contains(bar())).toBe(true);
  });
});

// --- motion + copy ------------------------------------------------------------

describe('the entrance is safe unconditionally', () => {
  it('is an opacity fade and nothing else — no slide, no pulse, no flash', () => {
    show();
    const el = bar() as HTMLElement;
    // The bar appears before a first-time player can have set a motion
    // preference, so the entrance may not read that setting — which leaves the
    // opacity fade, the only DOM animation that ships anywhere in this client.
    expect(el.style.transition).toBe(`opacity ${CLIENT_CONFIG.consent.fadeMs}ms ease`);
    expect(el.style.opacity).toBe('1');
    expect(el.style.transform).toBe('');
    expect(el.style.animation).toBe('');
  });
});

describe('the notice is legally accurate, not merely terse', () => {
  it('names the processor, the pre-consent silence, the cookie, and the exclusions', () => {
    const notice = CONSENT_NOTICE.toLowerCase();
    expect(notice).toContain('google analytics'); // the actual processor, named
    expect(notice).toContain('nothing loads until you accept'); // R7, Consent Mode BASIC
    expect(notice).toContain('cookie'); // R3 — the first identifier this project persists
    expect(notice).toContain('callsign'); // NFR19
    expect(notice).toContain('match');
  });

  it('is rendered in the load-bearing text register, never muted (DESIGN.md:153)', () => {
    show();
    const el = bar() as HTMLElement;
    const rendered = [...el.querySelectorAll('div')].find(
      (d) => d.textContent === CONSENT_NOTICE,
    ) as HTMLElement;
    expect(rendered).toBeDefined();
    expect(rendered.style.color).toBe('var(--hc-text-primary)');
  });
});
