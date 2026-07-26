// Colour-vision-deficiency math (Story 2.3, amendment 18). Pure, Pixi-free, and
// free of colour LITERALS (the tokens guard scan covers this file): everything
// here is a projection of a 0xRRGGBB number the CALLER supplies.
//
// Two pieces:
//   1. simulateDeuteranopia() — the standard LMS pipeline (sRGB → linear →
//      Hunt-Pointer-Estevez LMS → drop the M cone onto the L/S plane → back).
//      This is the acceptance instrument for the assist palette, not a render
//      path: nothing in the game ever draws a simulated colour.
//   2. labDistance() — CIE-Lab ΔE (CIE76) between two 0xRRGGBB colours, the
//      measure the palette's "pairwise distinguishable" criterion is stated in.

/** Split a 0xRRGGBB into its three 8-bit channels (masked, order R,G,B). */
function channels(n: number): [number, number, number] {
  return [(n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}

/** sRGB 8-bit → linear-light [0,1]. */
function linearize(c8: number): number {
  const c = c8 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** linear-light [0,1] → sRGB 8-bit (clamped). */
function delinearize(c: number): number {
  const v = Math.min(1, Math.max(0, c));
  const s = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.round(Math.min(255, Math.max(0, s * 255)));
}

/** Hunt-Pointer-Estevez (D65-normalised) linear-RGB → LMS. */
function toLms(r: number, g: number, b: number): [number, number, number] {
  return [
    0.31399022 * r + 0.63951294 * g + 0.04649755 * b,
    0.15537241 * r + 0.75789446 * g + 0.08670142 * b,
    0.01775239 * r + 0.10944209 * g + 0.87256922 * b,
  ];
}

/** LMS → linear RGB (the inverse of toLms). */
function fromLms(l: number, m: number, s: number): [number, number, number] {
  return [
    5.47221206 * l - 4.6419601 * m + 0.16963708 * s,
    -1.1252419 * l + 2.29317094 * m - 0.1678952 * s,
    0.02980165 * l - 0.19318073 * m + 1.16364789 * s,
  ];
}

/**
 * The colour a DEUTERANOPE perceives for `rgb` (0xRRGGBB → 0xRRGGBB). The M
 * cone response is replaced by its projection onto the dichromat's L/S plane
 * (the classic Viénot–Brettel–Mollon reduction), so red↔green separation
 * collapses and only the blue↔yellow axis plus lightness survive.
 */
export function simulateDeuteranopia(rgb: number): number {
  const [r8, g8, b8] = channels(rgb);
  const [l, , s] = toLms(linearize(r8), linearize(g8), linearize(b8));
  // Deuteranopia: M is not independent — it lies on the L/S plane.
  const m = 0.9513092 * l + 0.04866992 * s;
  const [r, g, b] = fromLms(l, m, s);
  return (delinearize(r) << 16) | (delinearize(g) << 8) | delinearize(b);
}

/** CIE-Lab (D65) coordinates of a 0xRRGGBB colour. */
function toLab(rgb: number): [number, number, number] {
  const [r8, g8, b8] = channels(rgb);
  const r = linearize(r8);
  const g = linearize(g8);
  const b = linearize(b8);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 ΔE between two 0xRRGGBB colours (perceptual distance, ≥ 0). */
export function labDistance(a: number, b: number): number {
  const A = toLab(a);
  const B = toLab(b);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}

/** HSV hue angle (degrees, [0,360)) of a 0xRRGGBB colour; 0 for a grey. */
export function hueAngle(rgb: number): number {
  const [r, g, b] = channels(rgb).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** Smallest absolute separation (degrees) between two hue angles, in [0,180]. */
export function hueSeparation(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360 + 360) % 360);
  return d > 180 ? 360 - d : d;
}
