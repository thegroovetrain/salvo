// Tiny DOM helpers for the dispersion bench: labeled sliders with live readouts.

export function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`dispersion bench: #${id} is missing`);
  return el as T;
}

export interface SliderSpec {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  fmt: (v: number) => string;
  onInput: (v: number) => void;
}

export interface SliderHandle {
  set(v: number): void;
}

/** Append a labeled range slider with a live value readout to `parent`. */
export function slider(parent: HTMLElement, spec: SliderSpec): SliderHandle {
  const wrap = document.createElement('label');
  wrap.className = 'slider';
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = spec.label;
  const value = document.createElement('span');
  value.className = 'value';
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(spec.min);
  input.max = String(spec.max);
  input.step = String(spec.step);
  const show = (v: number): void => {
    value.textContent = spec.fmt(v);
  };
  const set = (v: number): void => {
    input.value = String(v);
    show(v);
  };
  input.addEventListener('input', () => {
    const v = Number(input.value);
    show(v);
    spec.onInput(v);
  });
  wrap.append(label, value, input);
  parent.append(wrap);
  set(spec.value);
  return { set };
}

export function button(parent: HTMLElement, text: string, onClick: () => void): void {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  b.addEventListener('click', onClick);
  parent.append(b);
}

/** Share as a whole-number-ish percent. */
export function pct(share: number): string {
  return `${(share * 100).toFixed(1)} %`;
}
