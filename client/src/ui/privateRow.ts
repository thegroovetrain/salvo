// THE PRIVATE ROW (cycle 167, Eric ruling 7): the deploy stack's third line —
// two buttons, CREATE and JOIN, and nothing else.
//
// They take SOLO VS AI's register, not SOLO's: the phosphor outline, no glow,
// the panel-deep bed, {rounded.md} 8px — amber stays reserved for the one
// primary door. The pair splits the 480px door width between them, so the
// stack keeps one column edge.
//
// They follow the other doors' contract exactly: home.ts routes both presses
// through the same `deploy()` body (first-run → the class bay; a press while a
// join is in flight re-asserts the status line instead of starting another) and
// dims them with the other doors in `setBusy`. Neither ever writes
// `hullcracker.mode` — a private lobby is not a mode a reload or a collapse
// re-enters.

const DOOR_WIDTH = 480;
const DOOR_GAP = 14;

export interface PrivateRow {
  root: HTMLElement;
  create: HTMLButtonElement;
  join: HTMLButtonElement;
  setBusy(busy: boolean): void;
}

function makeDoor(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.style.cssText =
    `width:${(DOOR_WIDTH - DOOR_GAP) / 2}px;max-width:calc(50vw - 31px);min-height:64px;padding:8px 0;` +
    'box-sizing:border-box;background-color:var(--hc-panel-deep);border-radius:8px;' +
    'display:flex;align-items:center;justify-content:center;cursor:pointer';
  btn.style.borderWidth = '1px';
  btn.style.borderStyle = 'solid';
  btn.style.borderColor = 'var(--hc-phosphor)';
  const big = document.createElement('span');
  big.textContent = label;
  big.style.cssText =
    'font:800 34px var(--hc-font-mono);letter-spacing:0.34em;text-indent:0.34em;color:var(--hc-phosphor)';
  btn.append(big);
  btn.addEventListener('click', onClick);
  return btn;
}

export function makePrivateRow(onCreate: () => void, onJoin: () => void): PrivateRow {
  const root = document.createElement('div');
  root.style.cssText =
    `display:flex;flex-direction:row;justify-content:center;gap:${DOOR_GAP}px;max-width:100%`;
  const create = makeDoor('CREATE', onCreate);
  const join = makeDoor('JOIN', onJoin);
  root.append(create, join);
  return {
    root,
    create,
    join,
    setBusy: (busy) => {
      for (const btn of [create, join]) {
        btn.style.opacity = busy ? '0.4' : '1';
        btn.style.cursor = busy ? 'default' : 'pointer';
      }
    },
  };
}
