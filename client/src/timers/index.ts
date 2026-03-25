import { state } from '../state.js';

// ============================================================
// Turn Timer
// ============================================================

export function startTimer(seconds: number): void {
  stopTimer();
  state.timerSeconds = seconds;
  state.timerInterval = setInterval(() => {
    if (state.timerSeconds !== null && state.timerSeconds > 0) {
      state.timerSeconds--;
      renderTimer();
    }
  }, 1000);
}

export function stopTimer(): void {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
  state.timerSeconds = null;
}

function renderTimer(): void {
  const el = document.querySelector('.turn-timer');
  if (!el || state.timerSeconds === null) return;
  const mins = Math.floor(state.timerSeconds / 60);
  const secs = state.timerSeconds % 60;
  el.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
  el.classList.toggle('warning', state.timerSeconds <= 10);
}

// ============================================================
// Placement Timer
// ============================================================

export function startPlacementTimer(seconds: number): void {
  stopPlacementTimer();
  state.placementTimerSeconds = seconds;
  state.placementTimerInterval = setInterval(() => {
    if (state.placementTimerSeconds !== null && state.placementTimerSeconds > 0) {
      state.placementTimerSeconds--;
      renderPlacementTimer();
    }
  }, 1000);
}

export function stopPlacementTimer(): void {
  if (state.placementTimerInterval) {
    clearInterval(state.placementTimerInterval);
    state.placementTimerInterval = null;
  }
  state.placementTimerSeconds = null;
}

function renderPlacementTimer(): void {
  const el = document.querySelector('.placement-timer');
  if (!el || state.placementTimerSeconds === null) return;
  const mins = Math.floor(state.placementTimerSeconds / 60);
  const secs = state.placementTimerSeconds % 60;
  el.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
  el.classList.toggle('warning', state.placementTimerSeconds <= 10);
}
