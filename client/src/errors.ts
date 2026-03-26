import { state } from './state.js';

type MessageType = 'error' | 'info';

export function showMessage(message: string, type: MessageType = 'error'): void {
  const className = type === 'info' ? 'alert-info' : 'alert-error';

  if (type === 'error') {
    state.errorMessage = message;
  }
  if (state.errorTimeout) clearTimeout(state.errorTimeout);

  // Update in-place without re-rendering (preserves input values)
  let el = document.querySelector(`.${className}`) as HTMLElement | null;
  if (el) {
    el.textContent = message;
    el.classList.remove('hidden');
  } else {
    const screen = document.querySelector('.screen');
    if (screen) {
      const titleEl = screen.querySelector('.game-title');
      const subtitleEl = screen.querySelector('.game-subtitle');
      const insertAfter = subtitleEl ?? titleEl;
      if (insertAfter) {
        const div = document.createElement('div');
        div.className = `alert ${className}`;
        div.textContent = message;
        div.setAttribute('role', 'status');
        div.setAttribute('aria-live', 'polite');
        insertAfter.insertAdjacentElement('afterend', div);
        el = div;
      }
    }
  }

  state.errorTimeout = setTimeout(() => {
    if (type === 'error') state.errorMessage = null;
    const toRemove = document.querySelector(`.${className}`);
    if (toRemove) toRemove.remove();
  }, type === 'info' ? 5000 : 4000);
}

/** Convenience wrapper for error messages (backwards compatible). */
export function showError(message: string): void {
  showMessage(message, 'error');
}
