// THE CONTAINER-FIT LAW for the DOM PORT PANELS (amendment 47: "nothing
// anywhere in the game may render larger than its container — no text or element
// may extend past its box such that it covers, or can be covered by, another
// part of the UX").
//
// jsdom has no layout engine, so these are not measurements — they are pins on
// the two STRUCTURAL rules whose absence caused every real overflow the
// amendment-47 audit found in DOM chrome. Both are one-declaration rules that
// read as cosmetic and are not:
//
//   1. A panel that caps its height in VIEWPORT terms must be `border-box`.
//      Under the CSS default (content-box) a `max-height:100%` caps the CONTENT
//      box, so the panel's BORDER box comes out at `viewport + padding + border`
//      at every viewport size. The three port panels were each guaranteed to be
//      taller than the screen — results by 66px, the class bay by 62, settings
//      by 58 — clipping half of that off each edge, forever, undetectably.
//
//   2. A stack that can outgrow the viewport must be SCROLLABLE and must not
//      centre its overflow. `justify-content:center` distributes the overflow
//      to BOTH ends, and a scroll container cannot scroll back past its start
//      edge — so a centred overflowing column puts content permanently out of
//      reach. `safe center` degrades to flex-start exactly when that happens.
//
// The audit's NEGATIVE results — kill feed, toasts, the BOONS FITTED row, class
// cards, nameplates — are all auto-width or auto-height surfaces with nothing
// to clip against, so there is nothing here to pin for them.

import { describe, expect, it, afterEach } from 'vitest';
import { showResults, hideResults } from '../ui/results.js';
import { showHome } from '../ui/home.js';
import { ColorHoist, openClassSelect } from '../ui/classSelect.js';
import { SettingsOverlay } from '../ui/settings.js';
import { SettingsStore, DEFAULT_SETTINGS } from '../settings/store.js';

/**
 * Every panel that caps its height against the viewport must apply the shared
 * guard (ui/fit.ts applyViewportCap): the cap has to bind the BORDER box, and
 * whatever the cap cuts off has to stay reachable.
 *
 * These read the guard's own two properties rather than the panel's `cssText`
 * on purpose — the panels' style blobs contain `border:1px solid var(--x)`,
 * which the jsdom CSSOM parser rejects, voiding the whole blob. That is exactly
 * why the guard assigns its properties individually.
 */
function assertViewportCapped(el: HTMLElement, label: string): void {
  expect(el.style.boxSizing, `${label} caps its height but is not border-box`).toBe('border-box');
  expect(['auto', 'scroll'], `${label} caps its height with no way to reach the rest`).toContain(
    el.style.overflowY,
  );
}

describe('port panels cap their height against the VIEWPORT, in border-box (amendment 47)', () => {
  afterEach(() => {
    hideResults();
    document.body.replaceChildren();
  });

  it('the results modal', () => {
    showResults(
      {
        banner: 'ELIMINATED',
        victory: false,
        rows: [{ id: 'me', name: 'AAAAAAAAAAAAAA', placement: 1, kills: 3, damageDealt: 0 }],
        canSpectate: true,
        ownId: 'me',
        score: { winner: false, placement: 4, boons: 24, kills: 3, sunkContestants: ['BBBBBBBBBBBBBB'], matchLog: [], afloatMs: null },
      },
      { onSpectate: () => undefined, onReturn: () => undefined },
    );
    const panel = document.querySelector('#results-overlay > div') as HTMLElement;
    assertViewportCapped(panel, 'results panel');
  });

  it('the settings overlay', () => {
    const overlay = new SettingsOverlay({
      store: new SettingsStore({ ...DEFAULT_SETTINGS }),
      inMatch: () => false,
      onAbandon: () => undefined,
      viewportWidth: () => 1366,
      onVisibility: () => undefined,
    });
    overlay.open();
    const panel = document.querySelector('#hc-settings > div') as HTMLElement;
    assertViewportCapped(panel, 'settings panel');
    overlay.destroy();
  });

  it('the class bay', () => {
    const blurTarget = document.createElement('div');
    document.body.appendChild(blurTarget);
    openClassSelect({
      initial: 'torpedoBoat',
      hoist: new ColorHoist(),
      blurTarget,
      onConfirm: () => undefined,
      onClose: () => undefined,
    });
    const panel = document.querySelector('#hc-class-select > div:nth-child(2)') as HTMLElement;
    assertViewportCapped(panel, 'class bay panel');
    document.getElementById('hc-class-select')?.remove();
  });
});

describe('the home stack stays REACHABLE when it outgrows the viewport (amendment 47)', () => {
  afterEach(() => document.body.replaceChildren());

  it('scrolls, and does not centre its overflow out of scroll range', () => {
    const handle = showHome('0.0.0', () => undefined);
    const overlay = document.getElementById('main-menu') as HTMLElement;
    expect(overlay.style.overflowY).toBe('auto');
    // `safe center` (not plain `center`): plain centring pushes the head of an
    // overflowing column above the scroll origin, where it can never be reached.
    expect(overlay.style.justifyContent).toContain('safe');
    handle.hide();
  });
});
