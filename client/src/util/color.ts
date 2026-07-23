// Token color helpers — the ONE place a numeric 0xRRGGBB design token becomes a
// CSS color string. Pixi consumes tokens as raw numbers; DOM/canvas need strings,
// so these two tiny projectors bridge the gap. No string→number parser exists on
// purpose: tokens are authored as numbers in config.ts (CLIENT_CONFIG.colors) and
// only ever flow numbers → strings, never back.
//
// Story 1.12 adds the text-safe derivation (textSafe / contrastRatio): a personal
// hue rendered as TEXT (kill-feed names) must clear WCAG 4.5:1 against the void, so
// hues that fail as text are lightened toward white until they pass. Pure + exported
// for tokens.test.ts. This file stays free of color LITERALS (the guard scan allows
// only the 0xffffff mask here) — the background color is passed in, defaulting to
// the void token, never hardcoded.

// Inputs are masked to the low 24 bits (`(n >>> 0) & 0xffffff`) so a stray sign
// bit, alpha byte, or out-of-range number can never produce malformed output.
// (0xffffff here is the RGB channel mask, NOT a color literal — the guard scan
// allowlists it in this file.)

import { CLIENT_CONFIG } from '../config.js';

/** 0xRRGGBB → '#rrggbb' (lowercase, always 6 digits). */
export function cssHex(n: number): string {
  return '#' + ((n >>> 0) & 0xffffff).toString(16).padStart(6, '0');
}

/** 0xRRGGBB + alpha [0,1] → 'rgba(r, g, b, a)' — the token's alpha variant.
 *  Alpha is clamped to [0,1]; the color is masked to 24 bits. */
export function cssRgba(n: number, alpha: number): string {
  const v = (n >>> 0) & 0xffffff;
  const r = (v >> 16) & 0xff;
  const g = (v >> 8) & 0xff;
  const b = v & 0xff;
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// --- WCAG text-safety (Story 1.12) -------------------------------------------

/** Minimum WCAG 2.x contrast ratio for a personal hue rendered as TEXT. */
const TEXT_CONTRAST_MIN = 4.5;
/** Per-step lightening fraction toward white (the "2% increments" mechanism). */
const LIGHTEN_STEP = 0.02;
/** Hard iteration cap — white on the near-black void is ~19:1, so every hue
 *  passes long before this; the cap only guarantees termination. */
const MAX_LIGHTEN_STEPS = 256;

/** Split a masked 0xRRGGBB into its three 8-bit channels. */
function channels(n: number): [number, number, number] {
  const v = (n >>> 0) & 0xffffff;
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

/** sRGB 8-bit channel → linear-light [0,1] (WCAG relative-luminance transfer). */
function linearize(c8: number): number {
  const c = c8 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance of a 0xRRGGBB color. */
function relLuminance(n: number): number {
  const [r, g, b] = channels(n);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** WCAG 2.x contrast ratio between two 0xRRGGBB colors (order-independent, ≥ 1). */
export function contrastRatio(a: number, b: number): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Mix a color one `t`-fraction toward white (per-channel, rounded). */
function mixTowardWhite(n: number, t: number): number {
  const [r, g, b] = channels(n);
  const lift = (ch: number): number => Math.round(ch + (255 - ch) * t);
  return (lift(r) << 16) | (lift(g) << 8) | lift(b);
}

/**
 * The text-safe variant of a personal hue against `bg` (default: the void): the
 * hue unchanged when it already clears TEXT_CONTRAST_MIN (idempotent for passing
 * hues), else the hue lightened toward white in small uniform steps until it does.
 * Pure — the kill feed (and tokens.test.ts) call it; the outline hues stay the raw
 * graphic values in config.ts, only their TEXT rendering runs through here.
 *
 * CONTRACT: lightening toward white only raises contrast against a DARK background
 * (the void family — the feed's actual backdrop). It is NOT a general contrast
 * fixer; against a light bg it would move the wrong way. If 4.5:1 is somehow
 * unreachable within MAX_LIGHTEN_STEPS, this returns the final (lightest) step's
 * color rather than looping forever — but against the void every hue passes long
 * before the cap, so that path is termination-safety only.
 */
export function textSafe(rgb: number, bg: number = CLIENT_CONFIG.colors.void): number {
  let c = (rgb >>> 0) & 0xffffff;
  if (contrastRatio(c, bg) >= TEXT_CONTRAST_MIN) return c;
  for (let i = 0; i < MAX_LIGHTEN_STEPS; i++) {
    c = mixTowardWhite(c, LIGHTEN_STEP);
    if (contrastRatio(c, bg) >= TEXT_CONTRAST_MIN) break;
  }
  return c;
}
