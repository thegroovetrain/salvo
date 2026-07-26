// THE client settings store (Story 2.3) — one module owning the schema, the
// defaults, load/save/migrate, and the subscribe seam every live consumer reads.
//
// Shape: a PURE CORE (schema, defaults, coercion, migration, the derived
// helpers) with a thin localStorage shell on top. Nothing here touches the wire:
// settings are a client-only, per-browser preference set (no accounts, nothing
// synced). Namespace `hullcracker.*`, matching the callsign/class/color keys.
//
// The legacy standalone mute key (`hullcracker-muted`, audio/context.ts's
// pre-2.3 home) is read ONCE as a fallback when the new store key is absent, and
// never written again — the new key is authoritative from the first save.

import { CLIENT_CONFIG } from '../config.js';

const S = CLIENT_CONFIG.settings;

/** Motion / screen-shake level. `reduced` halves every flash+pulse amplitude
 *  and overrides any juice rule; `off` removes motion, never information. */
export type MotionLevel = 'full' | 'reduced' | 'off';

/** The three committed UI-scale tiers (percent). */
export type UiScale = 90 | 100 | 125;

/** The complete, committed v1 settings set (Story 2.3 AC — exactly these). */
export interface Settings {
  motion: MotionLevel;
  /** UI scale in PERCENT (90 | 100 | 125). */
  uiScale: UiScale;
  /** Colorblind assist: remap personal hues to the separated families + boost
   *  the radar blip's outline / minimum decayed opacity. */
  colorblind: boolean;
  /** Master bus volume, 0..100. */
  masterVolume: number;
  /** Effects-category volume, 0..100 (every tone today is an effect). */
  effectsVolume: number;
  /** Downmix the audio bus to mono. */
  monoAudio: boolean;
  /** Master mute — ONE persisted value, shared with the M key. */
  muted: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  motion: 'full',
  uiScale: 100,
  colorblind: false,
  masterVolume: 100,
  effectsVolume: 100,
  monoAudio: false,
  muted: false,
};

const MOTION_LEVELS: readonly MotionLevel[] = ['full', 'reduced', 'off'];

// --- pure coercion ------------------------------------------------------------

function coerceMotion(v: unknown): MotionLevel {
  return MOTION_LEVELS.includes(v as MotionLevel) ? (v as MotionLevel) : DEFAULT_SETTINGS.motion;
}

function coerceScale(v: unknown): UiScale {
  return (S.scaleTiers as readonly number[]).includes(v as number) ? (v as UiScale) : DEFAULT_SETTINGS.uiScale;
}

function coerceBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

/** Volume coercion: a finite number clamped to [0, volumeMax] and rounded;
 *  anything else falls back to the default (100). */
export function coerceVolume(v: unknown, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.round(Math.min(S.volumeMax, Math.max(0, v)));
}

/**
 * Pure: a fully-valid Settings from ANY stored payload (a foreign object, a
 * truncated JSON write, a hand-edited value, `null`). Every field falls back to
 * its default independently, so one bad key never discards the rest.
 * `legacyMuted` is the read-once `hullcracker-muted` fallback: it only applies
 * when the parsed payload carries no boolean `muted` of its own.
 */
export function sanitizeSettings(raw: unknown, legacyMuted = false): Settings {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  return {
    motion: coerceMotion(o.motion),
    uiScale: coerceScale(o.uiScale),
    colorblind: coerceBool(o.colorblind, DEFAULT_SETTINGS.colorblind),
    masterVolume: coerceVolume(o.masterVolume, DEFAULT_SETTINGS.masterVolume),
    effectsVolume: coerceVolume(o.effectsVolume, DEFAULT_SETTINGS.effectsVolume),
    monoAudio: coerceBool(o.monoAudio, DEFAULT_SETTINGS.monoAudio),
    muted: coerceBool(o.muted, legacyMuted),
  };
}

// --- pure derived helpers -----------------------------------------------------

/** Pure: the motion-intensity multiplier for a level (1 / 0.5 / 0). THE single
 *  source every flash/pulse/shake callsite scales its amplitude by. */
export function motionIntensity(level: MotionLevel): number {
  return S.motionIntensity[level];
}

/** Pure: scale an amplitude by the motion level (0 at `off`). */
export function motionScaled(base: number, level: MotionLevel): number {
  return base * motionIntensity(level);
}

/** Pure: is any motion allowed at all? (`false` only at `off`.) */
export function motionAllowed(level: MotionLevel): boolean {
  return motionIntensity(level) > 0;
}

/** Pure: the UI-scale FACTOR (90 → 0.9). */
export function scaleFactor(scale: UiScale): number {
  return scale / 100;
}

/**
 * Pure: is a scale tier selectable at this viewport width? The 125% tier is
 * SHOWN but disabled below `scaleGateWidthPx` (1600) — at the 1366 floor a
 * quarter-larger HUD would collide with itself. 90/100 are always selectable.
 */
export function scaleTierEnabled(tier: number, viewportW: number): boolean {
  return tier <= 100 || viewportW >= S.scaleGateWidthPx;
}

/** Pure: the explanatory note for a gated tier ('' when the tier is selectable). */
export function scaleTierNote(tier: number, viewportW: number): string {
  return scaleTierEnabled(tier, viewportW) ? '' : `NEEDS A ${S.scaleGateWidthPx}px-WIDE VIEWPORT`;
}

/**
 * Pure: the effective scale for a viewport — a stored 125% on a narrow window
 * falls back to 100% rather than rendering a HUD that doesn't fit. (The stored
 * choice is left alone; only the APPLIED factor yields.)
 */
export function effectiveScale(settings: Settings, viewportW: number): UiScale {
  return scaleTierEnabled(settings.uiScale, viewportW) ? settings.uiScale : 100;
}

/** Pure: does a mono type size survive a scale tier without breaking the 9px
 *  floor? (`monoFloorPx` — no mono type may render below it post-scale.) */
export function monoFloorOk(px: number, scale: UiScale): boolean {
  return px * scaleFactor(scale) >= S.monoFloorPx;
}

/** Pure: linear gain [0,1] for a 0..100 volume setting. */
export function volumeGain(volume: number): number {
  return Math.min(1, Math.max(0, volume / S.volumeMax));
}

// --- localStorage shell -------------------------------------------------------

/** Read the legacy standalone mute flag (pre-2.3 audio/context.ts key). */
function loadLegacyMuted(): boolean {
  try {
    return localStorage.getItem(S.legacyMuteKey) === '1';
  } catch {
    return false;
  }
}

/** Pure-ish: parse the stored payload. `usable` is false when the new key is
 *  ABSENT *or* CORRUPT — both mean "the new key told us nothing", which is
 *  exactly when the legacy mute flag still has a say. */
function parseStored(raw: string | null): { parsed: unknown; usable: boolean } {
  if (raw === null) return { parsed: null, usable: false };
  try {
    return { parsed: JSON.parse(raw), usable: true };
  } catch {
    return { parsed: null, usable: false }; // truncated/hand-edited write
  }
}

/**
 * Load + migrate the persisted settings (defaults when storage is unavailable).
 *
 * The legacy `hullcracker-muted` flag is consulted whenever the new key yields
 * nothing usable — absent OR corrupt. (Consulting it only on absence let a
 * single truncated write silently un-mute a player who had muted pre-2.3.)
 * When it IS consulted the migrated value is written back IMMEDIATELY, so the
 * new key is authoritative from this boot rather than from whenever the player
 * next happens to change a setting.
 */
export function loadSettings(): Settings {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(S.storeKey);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  const { parsed, usable } = parseStored(raw);
  const migrated = sanitizeSettings(parsed, usable ? false : loadLegacyMuted());
  if (!usable) saveSettings(migrated);
  return migrated;
}

/** Best-effort persist (storage may be unavailable / full). */
export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(S.storeKey, JSON.stringify(s));
  } catch {
    // best-effort persistence only — the live session still honors the value
  }
}

/**
 * The live settings store: current value, patch/reset writers, and a subscribe
 * seam. Every consumer (audio buses, motion gates, CVD remap, UI scale, the
 * overlay itself) reads THIS — the AC's "takes effect live" is one notify.
 */
export class SettingsStore {
  private value: Settings;
  private readonly listeners = new Set<(s: Settings) => void>();

  constructor(initial: Settings = loadSettings()) {
    this.value = initial;
  }

  /** The current settings (a frozen-by-convention snapshot — never mutate it). */
  get current(): Settings {
    return this.value;
  }

  /** Apply a partial change, persist, and notify. A no-op patch still notifies
   *  nothing — equality is checked field-by-field so a slider drag that lands on
   *  the same integer doesn't churn every subscriber. */
  set(patch: Partial<Settings>): void {
    const next = sanitizeSettings({ ...this.value, ...patch }, this.value.muted);
    if (sameSettings(next, this.value)) return;
    this.value = next;
    saveSettings(next);
    this.emit();
  }

  /** RESET SETTINGS: restore the defaults (callsign / class / color preference
   *  live under their own keys and are deliberately untouched). */
  reset(): void {
    this.value = { ...DEFAULT_SETTINGS };
    saveSettings(this.value);
    this.emit();
  }

  /** Subscribe to every change; returns the unsubscribe function. */
  subscribe(fn: (s: Settings) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of [...this.listeners]) fn(this.value);
  }
}

/** Pure: field-by-field settings equality (no deep values in the schema). */
export function sameSettings(a: Settings, b: Settings): boolean {
  return (
    a.motion === b.motion &&
    a.uiScale === b.uiScale &&
    a.colorblind === b.colorblind &&
    a.masterVolume === b.masterVolume &&
    a.effectsVolume === b.effectsVolume &&
    a.monoAudio === b.monoAudio &&
    a.muted === b.muted
  );
}

/**
 * THE process-wide store instance. A single module-level store keeps the home
 * gear, the in-match overlay, the M key, and every render/audio consumer on one
 * value — there is exactly one settings state per tab.
 */
export const settings = new SettingsStore();
