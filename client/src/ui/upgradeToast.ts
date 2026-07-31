// Self-event toast — small DOM text lines (center-top) in phosphor green: the
// banked-level prompt (pointToastLine) and the fitted-boon receipt
// (boonFitToastLine, ui/boonCopy.ts). Both line builders are pure (unit-
// tested); the DOM stack is a thin adapter mirroring ui/killFeed.ts. Lines
// expire after ~3s; the stack is capped at 3 so a burst cannot wallpaper the
// screen.
//
// Story 2.8: the killer-private `upg` event and its 14-entry LABELS map died
// with the legacy upgrade strip (PV 16) — nothing on the wire grants a stat
// upgrade outside the refit flow any more.

const TOAST_ID = 'upgrade-toast';
const LINE_TTL_MS = 3000;
const FADE_MS = 600;
const MAX_LINES = 3;

/** Pure: the toast line for a banked level (Story 2.6 — a LEVEL UP is now the
 *  only thing that banks a point, whether it came from the passive tick or a
 *  kill, so the copy names the level, not the currency; amendment 33's
 *  vocabulary, no "banked" wording). TAB is the refit-modal toggle. */
export function pointToastLine(): string {
  return '▲ LEVEL UP — TAB TO REFIT';
}

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
