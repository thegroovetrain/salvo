import { state } from '../state.js';
import type { ShotResult } from '@salvo/shared';

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioContext();
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

export function playTone(
  freqStart: number, freqMid: number, freqEnd: number,
  duration: number, volume: number, type: OscillatorType = 'sine'
): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freqMid, ctx.currentTime + duration * 0.3);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + duration * 0.7);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Audio not supported — silently ignore
  }
}

export function playMatchSound(): void {
  if (state.matchSoundMuted) return;
  playTone(600, 1200, 800, 0.5, 0.3);
}

export function playTurnSound(): void {
  if (state.matchSoundMuted) return;
  playTone(400, 800, 600, 0.4, 0.2);
}

export function playSalvoSound(shots: ShotResult[]): void {
  if (state.matchSoundMuted) return;
  const hasSunk = shots.some(s => s.hits.some(h => h.sunk));
  const hasHit = shots.some(s => s.hits.length > 0);
  if (hasSunk) {
    playTone(600, 900, 500, 0.6, 0.25);
  } else if (hasHit) {
    playTone(400, 600, 300, 0.35, 0.25);
  } else {
    playTone(200, 300, 150, 0.3, 0.15);
  }
}

export function playPlacementSound(): void {
  if (state.matchSoundMuted) return;
  playTone(300, 350, 250, 0.15, 0.15);
}
