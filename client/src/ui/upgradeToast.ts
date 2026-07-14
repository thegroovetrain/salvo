// Upgrade toast — small DOM text lines (center-top) fed from killer-private
// `upg` events: "⬆ +GUN AMMO" in phosphor green. upgradeLabel() is pure
// (unit-tested); the DOM stack is a thin adapter mirroring ui/killFeed.ts.
// Lines expire after ~3s; the stack is capped at 3 so a kill streak cannot
// wallpaper the screen.

import type { UpgradeId } from '@salvo/shared';

const TOAST_ID = 'upgrade-toast';
const LINE_TTL_MS = 3000;
const FADE_MS = 600;
const MAX_LINES = 3;

/** Human-readable uppercase label per upgrade id (explicit — no string munging). */
const LABELS: Record<UpgradeId, string> = {
  hullPoints: 'HULL POINTS',
  radarRange: 'RADAR RANGE',
  sweepSpeed: 'SWEEP SPEED',
  sightRange: 'SIGHT RANGE',
  maxSpeed: 'MAX SPEED',
  gunReload: 'GUN RELOAD',
  gunRange: 'GUN RANGE',
  gunAmmo: 'GUN AMMO',
  torpedoReload: 'TORPEDO RELOAD',
  torpedoAmmo: 'TORPEDO AMMO',
  torpedoSpeed: 'TORPEDO SPEED',
  mineReload: 'MINE RELOAD',
  mineAmmo: 'MINE AMMO',
  maxMines: 'MAX MINES',
};

/** Pure: the toast line for a granted upgrade type. */
export function upgradeLabel(type: UpgradeId): string {
  return `⬆ +${LABELS[type]}`;
}

/** Pure: the toast line for a banked upgrade point (a kill reward, unspent). */
export function pointToastLine(): string {
  return '▲ UPGRADE POINT — CTRL TO SPEND';
}

/** Pure: the toast line for an applied hull heal ({amount} = clamped delta). */
export function healToastLine(amount: number): string {
  return `⛨ HULL REPAIRED +${amount}`;
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
      'transform:translateX(-50%)',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'gap:4px',
      'font:400 16px "Geist Mono", monospace', // >= DESIGN.md 14px floor
      'letter-spacing:2px',
      'color:#00FF88', // phosphor green — a reward, not a warning
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
