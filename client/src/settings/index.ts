import { state } from '../state.js';

export function initTheme(): void {
  const saved = localStorage.getItem('hullcracker-theme');
  if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }

  const btn = document.createElement('button');
  btn.className = 'theme-toggle';
  btn.textContent = saved === 'light' ? 'DARK' : 'LIGHT';
  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? '' : 'light';
    if (next) {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('hullcracker-theme', 'light');
      btn.textContent = 'DARK';
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('hullcracker-theme', 'dark');
      btn.textContent = 'LIGHT';
    }
  });
  document.body.appendChild(btn);
}

export function initMuteToggle(): void {
  const btn = document.createElement('button');
  btn.className = 'mute-toggle';
  btn.id = 'global-mute';
  btn.textContent = state.matchSoundMuted ? 'UNMUTE' : 'MUTE';
  btn.addEventListener('click', () => {
    state.matchSoundMuted = !state.matchSoundMuted;
    localStorage.setItem('hullcracker-muted', String(state.matchSoundMuted));
    btn.textContent = state.matchSoundMuted ? 'UNMUTE' : 'MUTE';
  });
  document.body.appendChild(btn);
}
