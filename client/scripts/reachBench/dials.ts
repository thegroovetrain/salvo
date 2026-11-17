// Section 1's dials: one row per reach (ring on/off, its color, a slider in hm
// with the u value beside it), the hull picker, and the torpedo runs.

import { CONFIG, SHIP_CLASS_IDS, formatHm, hmToU, type HullId } from '@salvo/shared';
import { byId } from '../dispersionBench/controls.js';
import { DIALS, TIERS, TORPS, hullRatio, ringU, tierRunHm, type BenchState, type ReachDial, type TorpDial } from './model.js';

const uText = (u: number): string => `${Math.round(u).toLocaleString('en-US')} u`;
const hmText = (hm: number): string => `${Math.round(hm)} hm`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

interface RowSpec {
  label: string;
  color: string;
  value: number;
  max: number;
  on: boolean;
  note?: string;
  onToggle?: (on: boolean) => void;
  onInput: (hm: number) => void;
}

/** One dial row; returns a setter for the slider value. */
function dialRow(parent: HTMLElement, spec: RowSpec): (hm: number) => void {
  const row = el('div', 'dial');
  const head = el('label', 'dial-head');
  if (spec.onToggle) {
    const box = el('input');
    box.type = 'checkbox';
    box.checked = spec.on;
    box.setAttribute('aria-label', `Show the ${spec.label} ring`);
    box.addEventListener('change', () => spec.onToggle?.(box.checked));
    head.append(box);
  }
  const chip = el('span', 'chip');
  chip.style.background = spec.color;
  const value = el('span', 'value');
  head.append(chip, el('span', 'label', spec.label), value);
  const input = el('input');
  input.type = 'range';
  input.min = '0';
  input.max = String(spec.max);
  input.step = '1';
  input.setAttribute('aria-label', spec.label);
  const show = (hm: number): void => {
    value.textContent = `${hmText(hm)} · ${uText(hmToU(hm))}`;
  };
  input.addEventListener('input', () => {
    show(Number(input.value));
    spec.onInput(Number(input.value));
  });
  row.append(head, input);
  if (spec.note) row.append(el('p', 'dial-note', spec.note));
  parent.append(row);
  const set = (hm: number): void => {
    input.value = String(hm);
    show(hm);
  };
  set(spec.value);
  return set;
}

export function buildReachDials(s: BenchState, render: () => void): void {
  const host = byId('reachDials');
  const groups = new Map<ReachDial['group'], HTMLElement>();
  for (const d of DIALS) {
    let g = groups.get(d.group);
    if (!g) {
      host.append(el('h3', 'group', d.group));
      g = el('div', 'dial-grid');
      host.append(g);
      groups.set(d.group, g);
    }
    dialRow(g, {
      label: d.label, color: d.color, value: s.hm[d.key], max: d.max, on: s.on[d.key], note: d.note,
      onToggle: (on) => ((s.on[d.key] = on), render()),
      onInput: (hm) => ((s.hm[d.key] = hm), render()),
    });
  }
}

export function buildHullPicker(s: BenchState, render: () => void): void {
  const sel = byId<HTMLSelectElement>('hull');
  for (const id of SHIP_CLASS_IDS) {
    const o = el('option', undefined, `${id[0].toUpperCase()}${id.slice(1)} — ${Math.round(hullRatio(id) * 100)} %`);
    o.value = id;
    sel.append(o);
  }
  sel.value = s.hull;
  sel.addEventListener('change', () => ((s.hull = sel.value as HullId), render()));
}

export function renderHullLine(s: BenchState): void {
  const r = ringU(s, 'main');
  byId('hullLine').textContent = `This hull’s main battery: ${formatHm(r)} hm (${uText(r)}) = ${s.hm.main} hm × ${Math.round(hullRatio(s.hull) * 100)} %.`;
}

function torpBlock(parent: HTMLElement, t: TorpDial, s: BenchState, render: () => void): HTMLTableSectionElement {
  const box = el('div', 'torp');
  const run = s.torps[t.kind];
  const head = el('label', 'check');
  const cb = el('input');
  cb.type = 'checkbox';
  cb.checked = run.on;
  cb.addEventListener('change', () => ((run.on = cb.checked), render()));
  head.append(cb, el('span', undefined, `${t.label} — show its run as rings (tier I dashed, tier V solid)`));
  box.append(el('h3', 'group', `${t.label} · ${t.speedUps} u/s`), head);
  const grid = el('div', 'dial-grid');
  dialRow(grid, { label: 'Run at tier I', color: t.color, value: run.tierI, max: 300, on: true, onInput: (hm) => ((run.tierI = hm), render()) });
  dialRow(grid, { label: 'Run at tier V', color: t.color, value: run.tierV, max: 300, on: true, onInput: (hm) => ((run.tierV = hm), render()) });
  box.append(grid);
  const table = el('table', 'tiers');
  const thead = el('thead');
  const hr = el('tr');
  for (const h of ['Tier', 'Run', 'Step from the tier before', 'Time to run it out']) hr.append(el('th', undefined, h));
  thead.append(hr);
  const body = el('tbody');
  table.append(thead, body);
  const wrap = el('div', 'table-wrap');
  wrap.append(table);
  box.append(wrap);
  parent.append(box);
  return body;
}

const torpBodies = new Map<TorpDial['kind'], HTMLTableSectionElement>();

export function buildTorps(s: BenchState, render: () => void): void {
  const host = byId('torps');
  for (const t of TORPS) torpBodies.set(t.kind, torpBlock(host, t, s, render));
  byId('torpNote').textContent = `Travel times use each torpedo’s tier I speed from today’s settings (heavy ${CONFIG.torpedo.speed}, light ${CONFIG.lightTorpedo.speed}, supercavitating ${CONFIG.supercavTorpedo.speed} u/s).`;
}

export function renderTorps(s: BenchState): void {
  for (const t of TORPS) {
    const body = torpBodies.get(t.kind);
    if (!body) continue;
    const run = s.torps[t.kind];
    const rows = TIERS.map((name, i) => {
      const hm = tierRunHm(run, i);
      const step = i === 0 ? '—' : `+${(hm - tierRunHm(run, i - 1)).toFixed(1)} hm`;
      const tr = el('tr');
      for (const c of [name, `${hm.toFixed(1)} hm · ${uText(hmToU(hm))}`, step, `${(hmToU(hm) / t.speedUps).toFixed(1)} s`]) tr.append(el('td', undefined, c));
      return tr;
    });
    body.replaceChildren(...rows);
  }
}
