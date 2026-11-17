// Self-event toast — small DOM text lines (center-top) in phosphor green: the
// fitted-boon receipt (boonFitToastLine, ui/boonCopy.ts) and the kill-leader
// line (main.ts `bountyToastLine`). Story 10.10 (R10) KILLED the banked-level prompt (`pointToastLine`):
// the offer group's arrival is the level-up cue. The line builders are pure
// (unit-tested); the DOM stack is a thin adapter mirroring ui/killFeed.ts. Lines
// expire after ~3s; the stack is capped at 4 so a burst cannot wallpaper the
// screen — 4, not 3, since cycle 163 (Eric ruling 2026-10-01, epic-8 amendment
// 227): a large drone's three `◆ … STOCKED` drops plus the same kill's
// `▲ LEVEL UP` can land in one frame, and at 3 the first receipt was evicted
// before it ever rendered.
//
// Story 2.8: the killer-private `upg` event and its 14-entry LABELS map died
// with the legacy upgrade strip (PV 16) — nothing on the wire grants a stat
// upgrade outside the refit flow any more.

const TOAST_ID = 'upgrade-toast';
const LINE_TTL_MS = 3000;
const FADE_MS = 600;
const MAX_LINES = 4;

function ensureStack(): HTMLDivElement {
  let el = document.getElementById(TOAST_ID) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = TOAST_ID;
    el.style.cssText = [
      'position:fixed',
      'top:72px', // below the top-center zone/match lines
      'left:50%',
      // HUD-tier DOM chrome scales with the accessibility UI scale (Story 2.3);
      // the centering translate composes with it.
      'transform-origin:top center',
      'transform:translateX(-50%) scale(var(--hc-ui-scale, 1))',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'gap:4px',
      'font:400 18px var(--hc-font-mono)', // Story 2.3 lift (14px micro floor)
      'letter-spacing:2px',
      'color:var(--hc-phosphor)', // phosphor green — a reward, not a warning
      'text-align:center',
      'z-index:900',
      'pointer-events:none',
    ].join(';');
    document.body.appendChild(el);
  }
  return el;
}

/** Push one toast line; it fades out and removes itself after the TTL. */
export function pushUpgradeToast(text: string): void {
  const stack = ensureStack();
  const line = document.createElement('div');
  line.textContent = text;
  line.style.cssText = `opacity:0.95;transition:opacity ${FADE_MS}ms ease`;
  stack.appendChild(line);
  while (stack.children.length > MAX_LINES) stack.removeChild(stack.children[0]);
  setTimeout(() => {
    line.style.opacity = '0';
  }, LINE_TTL_MS - FADE_MS);
  setTimeout(() => line.remove(), LINE_TTL_MS);
}
