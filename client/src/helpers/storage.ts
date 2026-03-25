import { state } from '../state.js';

export function migrateStorageKeys(): void {
  const migrations = [
    ['salvo-player-name', 'hullcracker-player-name'],
    ['salvo-muted', 'hullcracker-muted'],
    ['salvo-theme', 'hullcracker-theme'],
    ['salvo-playerId', 'hullcracker-playerId'],
    ['salvo-gameId', 'hullcracker-gameId'],
  ];
  for (const [oldKey, newKey] of migrations) {
    const lsVal = localStorage.getItem(oldKey);
    if (lsVal !== null && localStorage.getItem(newKey) === null) {
      localStorage.setItem(newKey, lsVal);
      localStorage.removeItem(oldKey);
    }
    const ssVal = sessionStorage.getItem(oldKey);
    if (ssVal !== null && sessionStorage.getItem(newKey) === null) {
      sessionStorage.setItem(newKey, ssVal);
      sessionStorage.removeItem(oldKey);
    }
  }
}

export function saveName(name: string): void {
  state.savedPlayerName = name;
  localStorage.setItem('hullcracker-player-name', name);
}
