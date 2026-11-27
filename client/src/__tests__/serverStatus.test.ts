// THE SERVER ICON (Eric 2026-11-27): the home top bar's left slot. Contracts:
// the tint follows the probe state by TOKEN (one distinct token per state); the
// tooltip has one row per service and each row reads what the pure
// `serviceStatusLines` says for that state; hover and keyboard focus open it,
// leave and blur close it; it re-renders while open. No copy is pinned.

import { describe, it, expect } from 'vitest';
import { makeServerStatus, probeColor, serviceStatusLines, type ProbeState } from '../ui/serverStatus.js';

const STATES: readonly ProbeState[] = ['probing', 'ready', 'unreachable'];

function parts(root: HTMLElement): { icon: HTMLElement; tip: HTMLElement } {
  return {
    icon: root.querySelector('[tabindex="0"]') as HTMLElement,
    tip: root.querySelector('[role="tooltip"]') as HTMLElement,
  };
}

/** The tooltip's rows as [name, status] pairs (two cells per row). */
function rows(tip: HTMLElement): [string, string][] {
  const cells = [...tip.children].map((c) => c.textContent ?? '');
  const out: [string, string][] = [];
  for (let i = 0; i < cells.length; i += 2) out.push([cells[i], cells[i + 1]]);
  return out;
}

describe('serviceStatusLines', () => {
  it('lists the same services for every state, each with a non-empty status word', () => {
    const names = serviceStatusLines('ready').map((l) => l.name);
    expect(names.length).toBeGreaterThan(0);
    for (const s of STATES) {
      expect(serviceStatusLines(s).map((l) => l.name)).toEqual(names);
      for (const l of serviceStatusLines(s)) expect(l.status.length).toBeGreaterThan(0);
    }
  });

  it('reads differently in each state', () => {
    const words = STATES.map((s) => serviceStatusLines(s)[0].status);
    expect(new Set(words).size).toBe(STATES.length);
  });
});

describe('probeColor', () => {
  it('is a distinct --hc-* token per state, never a literal', () => {
    const colors = STATES.map(probeColor);
    expect(new Set(colors).size).toBe(STATES.length);
    for (const c of colors) expect(c).toMatch(/^var\(--hc-[a-z-]+\)$/);
    expect(probeColor('ready')).toBe('var(--hc-phosphor)');
    expect(probeColor('unreachable')).toBe('var(--hc-denied)');
  });
});

describe('makeServerStatus', () => {
  it('boots probing: tinted and listed as the probing state', () => {
    const { root } = makeServerStatus();
    const { icon, tip } = parts(root);
    expect(icon.style.color).toBe(probeColor('probing'));
    expect(rows(tip)).toEqual(serviceStatusLines('probing').map((l) => [l.name, l.status]));
  });

  it('the icon is an inline svg with an accessible name, keyboard-focusable', () => {
    const { icon } = parts(makeServerStatus().root);
    expect(icon.querySelector('svg')).not.toBeNull();
    expect(icon.getAttribute('aria-label')).toBeTruthy();
    expect(icon.tabIndex).toBe(0);
  });

  it('tint and rows follow every probe state', () => {
    const s = makeServerStatus();
    const { icon, tip } = parts(s.root);
    for (const state of STATES) {
      s.setProbe(state);
      expect(icon.style.color).toBe(probeColor(state));
      const lines = serviceStatusLines(state);
      expect(rows(tip)).toEqual(lines.map((l) => [l.name, l.status]));
      expect((tip.children[1] as HTMLElement).style.color).toBe(lines[0].color);
    }
  });

  it('opens on hover and on focus, closes on leave and on blur, and never takes the pointer', () => {
    const { icon, tip } = parts(makeServerStatus().root);
    expect(tip.style.display).toBe('none');
    expect(tip.style.pointerEvents).toBe('none');
    icon.dispatchEvent(new Event('mouseenter'));
    expect(tip.style.display).not.toBe('none');
    icon.dispatchEvent(new Event('mouseleave'));
    expect(tip.style.display).toBe('none');
    icon.dispatchEvent(new Event('focus'));
    expect(tip.style.display).not.toBe('none');
    icon.dispatchEvent(new Event('blur'));
    expect(tip.style.display).toBe('none');
  });

  it('re-renders its rows while open', () => {
    const s = makeServerStatus();
    const { icon, tip } = parts(s.root);
    icon.dispatchEvent(new Event('mouseenter'));
    s.setProbe('unreachable');
    expect(tip.style.display).not.toBe('none');
    expect(rows(tip)[0][1]).toBe(serviceStatusLines('unreachable')[0].status);
  });

  it('the tooltip floats off the icon wrapper, the one anchored element', () => {
    const { root } = makeServerStatus();
    const { tip } = parts(root);
    expect(root.style.position).toBe('relative');
    expect(tip.style.position).toBe('absolute');
    expect(tip.parentElement).toBe(root);
  });
});
