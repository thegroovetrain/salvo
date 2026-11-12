// The game's own look values for the "Aim marker ideas" card, copied LITERALLY
// (not imported: this page must not pull Pixi or the client bundle). Every
// value cites the file:line it was copied from, so a drift is one grep away.
// Paths are relative to client/src/ unless they say otherwise.

/** config.ts:32 `COLORS.void` — the ocean disc (render/map.ts:35 OCEAN_FILL, map.ts:103). */
export const OCEAN = '#050807';
/** config.ts:33 `COLORS.fogBase` at render/textures.ts:46 FOG_FILL_ALPHA 0.85 (textures.ts:50 FOG_FILL). */
export const FOG_FILL = 'rgba(2, 6, 4, 0.85)';
/** render/textures.ts:49 — the sight hole is fully clear to 0.75 × sight, fading to full fog at sight. */
export const HOLE_FEATHER_START = 0.75;
/** config.ts:39 `COLORS.silver` — range rings (render/map.ts:110: width 1.5 u, alpha 0.06). */
export const RANGE_RING = { color: '192, 192, 192', widthU: 1.5, alpha: 0.06 };
/** config.ts:44 `COLORS.phosphor` — the sight ring (render/radar.ts:533: width 2 u, alpha 0.12). */
export const SIGHT_RING = { color: '0, 255, 136', widthU: 2, alpha: 0.12 };
/** config.ts:95–99 `COLORS.terrain` — shore → summit, stroke + fill per band. */
export const TERRAIN = [
  { stroke: '#4a6b33', fill: '#242f22' },
  { stroke: '#7b8a3e', fill: '#363c29' },
  { stroke: '#ae9c58', fill: '#484534' },
  { stroke: '#dcd2ac', fill: '#5b5a52' },
];
/** config.ts:1543–1544 coastPx 2, contourPx 1.5 — SCREEN px (strokeWorldWidth, render/map.ts:136–137). */
export const COAST_PX = 2;
export const CONTOUR_PX = 1.5;
/** config.ts:117–119 echoFaint / echoFuzzy / echoSolid — the radar's three paints. */
export const RADAR = { green: '0, 255, 0', blue: '0, 0, 255', red: '255, 0, 0' };
/** config.ts:2680 `blip.heatmap.bandAlpha` — every radar paint at 0.8. */
export const RADAR_ALPHA = 0.8;
/** config.ts:3316 `heatmap.dim.minScale` — paint inside the sight bubble is dimmed to 0.2 of that. */
export const RADAR_DIM_IN_SIGHT = 0.2;
/** config.ts:49 `COLORS.storm` fill (render/zone.ts:54, config.ts:1579 fillAlpha 0.12). */
export const STORM_FILL = 'rgba(123, 47, 190, 0.12)';
/** config.ts:50 `COLORS.stormReadout` edge (render/zone.ts:52; config.ts:1618 edgePx 2 SCREEN px; config.ts:1637 edgeAlpha 0.9). */
export const STORM_EDGE = { color: 'rgba(176, 110, 232, 0.9)', px: 2 };
/** render/litZones.ts:42–44, 47 — own star-shell lit zone: white, fill 0.12 (added light), ring 2 u at 0.38. */
export const LIT = { fillAlpha: 0.12, ringAlpha: 0.38, ringU: 2 };
/** config.ts:138 `COLORS.fogBank` and the fog field's look (config.ts:2518 maxAlpha 0.6, 2529–2533 puffs 25–70 u at 0.25–0.6). */
export const FOG_BANK = { color: '220, 218, 212', maxAlpha: 0.6 };
/** config.ts:1920 `settings.pulseCapHz` — the one shared ceiling on any pulse. */
export const PULSE_CAP_HZ = 1.1;

/** Today's reticle: config.ts:48 amber (render/firing.ts:58 AMBER); render/firing.ts:68 RETICLE_R 7 u; firing.ts:612–615 strokes. */
export const RETICLE = { color: '#ffb800', r: 7, ring: { widthU: 1.5, alpha: 0.8 }, cross: { widthU: 1, alpha: 0.6 } };

export interface Swatch {
  key: string;
  name: string;
  hex: string;
  /** What this color already means in the game (one short line), or that it is new. */
  meaning: string;
}

// Meanings: _bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/DESIGN.md
// colors table (lines 202–207) plus the code that consumes each token.
export const SWATCHES: Swatch[] = [
  { key: 'amber', name: 'Amber', hex: '#ffb800', meaning: "Already means selected / armed / warning, and it is today's reticle and aim preview color (DESIGN.md:205)." },
  { key: 'white', name: 'White', hex: '#ffffff', meaning: 'Already means YOUR OWN marks on the water: your mines and your star-shell glow (render/alertBlend.ts:50).' },
  { key: 'info', name: 'Sky blue', hex: '#38bdf8', meaning: "Already means information / waiting, and loot tier II (DESIGN.md:207). The radar's blue paint is a much darker pure blue." },
  { key: 'mint', name: 'Pale mint', hex: '#7fffc4', meaning: 'Already the menu and wordmark glow (DESIGN.md:203). Close to the radar sweep green.' },
  { key: 'cyan', name: 'Own cyan', hex: '#00e8ff', meaning: "Already means YOUR ship's outline (render/relationColor.ts:37)." },
  { key: 'yellow', name: 'Alert yellow', hex: '#fff04d', meaning: "Already means another captain's mine or zone, blinking yellow to orange (config.ts:148)." },
  { key: 'pink', name: 'Pink', hex: '#ff4fa3', meaning: 'Already means the ARMOR airdrop crate (config.ts:56).' },
  { key: 'magenta', name: 'Hot magenta (new color)', hex: '#ff40ff', meaning: 'Means nothing in the game yet (new color, not in the palette).' },
];

export function swatch(key: string): Swatch {
  return SWATCHES.find((s) => s.key === key) ?? SWATCHES[0];
}

/** '#rrggbb' → 'r, g, b' for rgba(). */
export function rgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}
