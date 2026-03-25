import { state } from './state.js';

export function showError(message: string): void {
  state.errorMessage = message;
  if (state.errorTimeout) clearTimeout(state.errorTimeout);

  // Update error in-place without re-rendering (preserves input values)
  let errorEl = document.querySelector('.alert-error') as HTMLElement | null;
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  } else {
    const screen = document.querySelector('.screen');
    if (screen) {
      const titleEl = screen.querySelector('.game-title');
      const subtitleEl = screen.querySelector('.game-subtitle');
      const insertAfter = subtitleEl ?? titleEl;
      if (insertAfter) {
        const div = document.createElement('div');
        div.className = 'alert alert-error';
        div.textContent = message;
        insertAfter.insertAdjacentElement('afterend', div);
        errorEl = div;
      }
    }
  }

  state.errorTimeout = setTimeout(() => {
    state.errorMessage = null;
    const el = document.querySelector('.alert-error');
    if (el) el.remove();
  }, 4000);
}
