// Minimal on-screen status/error banner (plain DOM, outside the Pixi canvas).
// Connection errors and mode toggles surface here; a real UI layer arrives
// with the menu step (14).

const ID = 'net-banner';
let hideTimer: ReturnType<typeof setTimeout> | undefined;

function ensureEl(): HTMLDivElement {
  let el = document.getElementById(ID) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = ID;
    el.style.cssText = [
      'position:fixed',
      'top:16px',
      'left:50%',
      'transform:translateX(-50%)',
      'padding:6px 14px',
      'font:600 13px "Geist Mono", monospace',
      'letter-spacing:1.5px',
      'border:1px solid',
      'background:rgba(1,6,4,0.9)',
      'z-index:1000',
      'pointer-events:none',
    ].join(';');
    document.body.appendChild(el);
  }
  return el;
}

export interface BannerOptions {
  error?: boolean;
  autoHideMs?: number;
}

/** Show (or replace) the banner text. */
export function showBanner(text: string, opts: BannerOptions = {}): void {
  const el = ensureEl();
  const color = opts.error ? '#ff3b30' : '#00ff88';
  el.style.color = color;
  el.style.borderColor = color;
  el.textContent = text;
  el.style.display = 'block';
  if (hideTimer) clearTimeout(hideTimer);
  if (opts.autoHideMs) hideTimer = setTimeout(hideBanner, opts.autoHideMs);
}

export function hideBanner(): void {
  const el = document.getElementById(ID);
  if (el) el.style.display = 'none';
}
