export function on(id: string, event: string, handler: (e?: Event) => void): void {
  document.getElementById(id)?.addEventListener(event, handler);
}

export function onKey(id: string, key: string, handler: () => void): void {
  document.getElementById(id)?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === key) handler();
  });
}

export function val(id: string): string {
  return (document.getElementById(id) as HTMLInputElement)?.value?.trim() ?? '';
}

export function playerIcon(isBot: boolean): string {
  if (isBot) {
    return `<span class="player-icon"><svg viewBox="0 0 16 16" fill="var(--green)"><rect x="3" y="5" width="10" height="8" rx="2"/><rect x="6" y="1" width="4" height="4" rx="1"/><rect x="5" y="7" width="2" height="2" rx="0.5"/><rect x="9" y="7" width="2" height="2" rx="0.5"/><rect x="6" y="11" width="4" height="1"/></svg></span>`;
  }
  return `<span class="player-icon"><svg viewBox="0 0 16 16" fill="var(--green)"><circle cx="8" cy="4" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg></span>`;
}

export function esc(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
