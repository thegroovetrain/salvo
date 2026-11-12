// The engine retune's PICK (audition page): a "My pick" radio group and one
// copyable line, `engine=A; engineVolume=80`, that Eric pastes into the chat.
// The copy runs inside the click (the clipboard needs the gesture); when the
// clipboard is missing or blocked, the line is selected for Ctrl/Cmd+C instead.

import { button, h, radios } from './dom.js';

/** Pure: the picks line. `pick` null = not picked yet ('?'). */
export function engineLine(pick: string | null, volumePct: number): string {
  return `engine=${pick ?? '?'}; engineVolume=${Math.round(volumePct)}`;
}

export class EnginePicks {
  private pick: string | null = null;
  private volumePct = 100;
  private box: HTMLInputElement | null = null;

  /** The "My pick" radios: each take's id, plus "none of these". */
  pickRadios(ids: readonly string[]): HTMLElement {
    const options = [...ids.map((id) => ({ value: id, label: id })), { value: 'none', label: 'None of these' }];
    return radios('engine-pick', 'My pick', options, null, (v) => {
      this.pick = v;
      this.refresh();
    });
  }

  setVolume(pct: number): void {
    this.volumePct = pct;
    this.refresh();
  }

  /** The one-line box, the COPY button and its status line. */
  render(): HTMLElement {
    const box = h('input', { type: 'text', readonly: true, class: 'picks-line', 'aria-label': 'Engine pick, to paste into the chat' });
    this.box = box;
    const note = h('p', { class: 'status', role: 'status' });
    const copy = button('COPY', () => copyLine(box, note), 'primary');
    this.refresh();
    return h('div', { class: 'block' }, [
      h('h3', {}, ['Your engine pick']),
      h('p', { class: 'note' }, ['Copy this line and paste it into the chat.']),
      h('div', { class: 'controls' }, [box, copy, note]),
    ]);
  }

  private refresh(): void {
    if (this.box) this.box.value = engineLine(this.pick, this.volumePct);
  }
}

function copyLine(box: HTMLInputElement, note: HTMLElement): void {
  // A missing clipboard API throws synchronously; the wrapper turns that into a rejection.
  new Promise<void>((ok, fail) => navigator.clipboard.writeText(box.value).then(ok, fail))
    .then(() => (note.textContent = 'Copied. Paste it into the chat.'))
    .catch(() => {
      box.focus();
      box.select();
      note.textContent = 'Copy was blocked; the text is selected, press Ctrl+C or Cmd+C.';
    });
}
