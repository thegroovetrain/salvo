import { state } from '../state.js';

export function renderSurrenderModal(): string {
  if (!state.showSurrenderModal) return '';
  return `
    <div class="modal-overlay" id="surrender-modal-overlay">
      <div class="modal">
        <h2 class="label" style="margin-bottom:12px">Surrender?</h2>
        <p style="margin-bottom:16px;color:var(--text-muted);font-size:14px">Are you sure you want to surrender? Your ships will be removed from the game.</p>
        <div style="display:flex;gap:8px;justify-content:center">
          <button class="btn btn-danger" id="btn-surrender-confirm">Surrender</button>
          <button class="btn btn-secondary" id="btn-surrender-cancel">Cancel</button>
        </div>
      </div>
    </div>`;
}
