// Kill feed — small DOM text lines (top-right) fed from sunk events, names
// resolved from the public roster. killLine() is pure (unit-tested); the DOM
// stack is a thin adapter. Lines expire after a few seconds; the stack is
// capped so a bloodbath cannot fill the screen.

const FEED_ID = 'kill-feed';
const LINE_TTL_MS = 6000;
const MAX_LINES = 5;

/** Pure: the feed line for a sinking. Storm/unattributed deaths have no killer. */
export function killLine(victimName: string, killerName: string | null): string {
  return killerName ? `${victimName} SUNK BY ${killerName}` : `${victimName} LOST WITH ALL HANDS`;
}

function ensureFeed(): HTMLDivElement {
  let el = document.getElementById(FEED_ID) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = FEED_ID;
    el.style.cssText = [
      'position:fixed',
      'top:16px',
      'right:20px',
      'display:flex',
      'flex-direction:column',
      'align-items:flex-end',
      'gap:4px',
      'font:400 12px "Geist Mono", monospace',
      'letter-spacing:1px',
      'color:#FFB800',
      'text-align:right',
      'z-index:900',
      'pointer-events:none',
    ].join(';');
    document.body.appendChild(el);
  }
  return el;
}

/** Push one line onto the feed; it fades out and removes itself after the TTL. */
export function pushKillLine(text: string): void {
  const feed = ensureFeed();
  const line = document.createElement('div');
  line.textContent = text;
  line.style.cssText = 'opacity:0.95;transition:opacity 1.2s ease';
  feed.appendChild(line);
  while (feed.children.length > MAX_LINES) feed.removeChild(feed.children[0]);
  setTimeout(() => {
    line.style.opacity = '0';
  }, LINE_TTL_MS - 1200);
  setTimeout(() => line.remove(), LINE_TTL_MS);
}
