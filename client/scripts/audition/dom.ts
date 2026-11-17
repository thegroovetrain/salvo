// Tiny DOM helpers for the audition page (Story 10.13). No framework: the
// page is a few hundred elements built once.

type Props = Record<string, string | number | boolean | undefined>;

/** Create an element; `props` become attributes (false/undefined skipped). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === false) continue;
    el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) el.append(c);
  return el;
}

export function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`audition page: #${id} is missing`);
  return el as T;
}

/** A labelled range slider. `onInput` receives the numeric value. */
export function slider(
  label: string,
  opts: { min: number; max: number; step: number; value: number; left?: string; right?: string },
  onInput: (v: number) => void,
): { root: HTMLElement; input: HTMLInputElement } {
  const input = h('input', { type: 'range', min: opts.min, max: opts.max, step: opts.step, value: opts.value });
  input.addEventListener('input', () => onInput(Number(input.value)));
  const ends = h('span', { class: 'ends' }, [h('span', {}, [opts.left ?? '']), h('span', {}, [opts.right ?? ''])]);
  const root = h('label', { class: 'slider' }, [h('span', { class: 'slider-label' }, [label]), input, ends]);
  return { root, input };
}

/** A radio group; returns the root and a getter for the checked value. */
export function radios(
  name: string,
  legend: string,
  options: ReadonlyArray<{ value: string; label: string }>,
  checked: string | null,
  onChange: (value: string) => void,
): HTMLElement {
  const items = options.map((o) => {
    const input = h('input', { type: 'radio', name, value: o.value, checked: o.value === checked });
    input.addEventListener('change', () => {
      if (input.checked) onChange(o.value);
    });
    return h('label', { class: 'choice' }, [input, h('span', {}, [o.label])]);
  });
  return h('fieldset', { class: 'radios' }, [h('legend', {}, [legend]), ...items]);
}

/** A button that runs `onClick`. */
export function button(text: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = h('button', { type: 'button', class: cls }, [text]);
  b.addEventListener('click', onClick);
  return b;
}
