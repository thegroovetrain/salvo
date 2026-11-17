// Section 3's controls and animation loop around scope.ts.

import { uToHm } from '@salvo/shared';
import { byId } from '../dispersionBench/controls.js';
import { SPAN_MAX_U, SPAN_MIN_U, drawScopeFrame, layoutScope, type LabelPos, type RingStyle, type ScopeInput, type ScopeState, type SweepStyle } from './scope.js';

/** Starts at the game's default framing: client/src/config.ts:1512 `zoom.defaultSpanU` (copied, not imported — the page must not pull the client bundle). */
export const scope: ScopeState = { spanU: 1320, ringStyle: 'A', labelPos: 'bow', bearing: false, headingLine: false, sweep: 3 };

let input: ScopeInput | null = null;

export function renderScope(next: ScopeInput): void {
  input = next;
  layoutScope(byId<HTMLCanvasElement>('scope'), next, scope);
  drawScopeFrame(next, scope, performance.now());
  byId('spanValue').textContent = `${Math.round(scope.spanU).toLocaleString('en-US')} u across (${Math.round(uToHm(scope.spanU))} hm)`;
}

function radios<T>(name: string, apply: (v: string) => T, set: (v: T) => void, onChange: () => void): void {
  document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`).forEach((r) =>
    r.addEventListener('change', () => {
      if (!r.checked) return;
      set(apply(r.value));
      onChange();
    }),
  );
}

function checkbox(id: string, set: (on: boolean) => void, onChange: () => void): void {
  const box = byId<HTMLInputElement>(id);
  box.addEventListener('change', () => (set(box.checked), onChange()));
}

export function buildScopeControls(onChange: () => void): void {
  const span = byId<HTMLInputElement>('span');
  span.min = String(SPAN_MIN_U);
  span.max = String(SPAN_MAX_U);
  span.step = '10';
  span.value = String(scope.spanU);
  span.addEventListener('input', () => ((scope.spanU = Number(span.value)), onChange()));
  radios('ringStyle', (v) => v as RingStyle, (v) => (scope.ringStyle = v), onChange);
  radios('labelPos', (v) => v as LabelPos, (v) => (scope.labelPos = v), onChange);
  radios('sweep', (v) => Number(v) as SweepStyle, (v) => (scope.sweep = v), onChange);
  checkbox('bearing', (on) => (scope.bearing = on), onChange);
  checkbox('headingLine', (on) => (scope.headingLine = on), onChange);
}

/** Animate the sweep at the real rate; layout only changes through renderScope. */
export function startScope(get: () => ScopeInput): void {
  input = input ?? get();
  const tick = (t: number): void => {
    if (input) drawScopeFrame(input, scope, t);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
