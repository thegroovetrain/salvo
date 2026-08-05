// Kill feed — small DOM text lines (top-right) fed from sunk events. Story 1.12
// (UX-DR17): a line is a list of SEGMENTS ({ text, id? }) — the NAME segments
// carry a roster id so pushKillLine can color each name span in the pilot's
// text-safe personal hue (600-weight); the connective text inherits the
// container's text-secondary. Newest line on top. killLine() stays pure
// (unit-tested) — it only shapes segments + mid-ellipsizes long names; the DOM
// stack is a thin adapter. Lines expire after a few seconds; the stack is capped
// so a bloodbath cannot fill the screen.

import { CLIENT_CONFIG } from '../config.js';
import { cssHex, textSafe } from '../util/color.js';
// Display cap + surrogate-safe mid-ellipsis hoisted to the shared util (Story
// 1.13) so the feed and the on-water nameplates share one cap source. Re-exported
// here so existing feed consumers/tests keep importing ellipsizeName unchanged.
import { ellipsizeName } from '../util/text.js';

export { ellipsizeName };

const FEED_ID = 'kill-feed';
// A GLOBAL feed (PV 23) carries every captain's sinking, not just the ones in
// sight — more traffic needs the headroom (Eric ruling): 8s TTL, 6 lines.
const LINE_TTL_MS = 8000;
const MAX_LINES = 6;

/** A vessel reference in a feed line — its display name + roster id (for color). */
export interface NameRef {
  name: string;
  id: string;
}

/** One rendered piece of a feed line. `id` present ⇒ a NAME segment (colored in
 *  the roster hue); absent ⇒ connective text (inherits text-secondary). */
export interface KillSegment {
  text: string;
  id?: string;
}

/**
 * Pure: the feed segments for a sinking. Storm/unattributed deaths have no
 * killer. NAME segments carry the vessel id so the DOM adapter can color them;
 * connective segments carry only text.
 */
export function killLine(victim: NameRef, killer: NameRef | null): KillSegment[] {
  const v: KillSegment = { text: ellipsizeName(victim.name), id: victim.id };
  if (!killer) return [v, { text: ' LOST WITH ALL HANDS' }];
  return [v, { text: ' SUNK BY ' }, { text: ellipsizeName(killer.name), id: killer.id }];
}

function ensureFeed(): HTMLDivElement {
  let el = document.getElementById(FEED_ID) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = FEED_ID;
    el.style.cssText = [
      'position:fixed',
      'top:16px',
      'right:20px',
      'display:flex',
      'flex-direction:column',
      'align-items:flex-end',
      'gap:4px',
      'font:400 16px var(--hc-font-mono)', // Story 2.3 lift; the micro floor is 14px
      'letter-spacing:1px',
      // Amendment 17: the connective text is load-bearing, so it reads
      // text-primary now — the retired grey is gone from the feed.
      'color:var(--hc-text-primary)', // connective base (names override per-span)
      'text-align:right',
      'z-index:900',
      'pointer-events:none',
      // HUD-tier DOM chrome scales with the accessibility UI scale (Story 2.3).
      'transform-origin:top right',
      'transform:scale(var(--hc-ui-scale, 1))',
    ].join(';');
    document.body.appendChild(el);
  }
  return el;
}

/** Build the DOM spans for one line: NAME segments colored in their text-safe
 *  personal hue (600-weight); a roster miss (color null) leaves the name in the
 *  container's text-secondary. */
function renderSegments(line: HTMLDivElement, segments: KillSegment[], colorFor: (id: string) => number | null): void {
  for (const seg of segments) {
    const span = document.createElement('span');
    span.textContent = seg.text;
    if (seg.id !== undefined) {
      const color = colorFor(seg.id);
      if (color !== null) {
        // A drone name is pinned to the droneOutline token VERBATIM — the spec
        // forbids running the drone grey through textSafe. Only human personal
        // hues get the WCAG lighten-toward-void pass.
        const isDrone = color === CLIENT_CONFIG.colors.droneOutline;
        span.style.color = cssHex(isDrone ? color : textSafe(color));
        span.style.fontWeight = '600';
      }
    }
    line.appendChild(span);
  }
}

/**
 * Push one line onto the feed; it fades out and removes itself after the TTL.
 * `colorFor(id)` resolves a vessel id → its personal hue (drone-outline for a
 * drone, null for a roster miss). Newest line renders on TOP.
 */
export function pushKillLine(segments: KillSegment[], colorFor: (id: string) => number | null): void {
  const feed = ensureFeed();
  const line = document.createElement('div');
  renderSegments(line, segments, colorFor);
  line.style.cssText = 'opacity:0.95;transition:opacity 1.2s ease';
  feed.insertBefore(line, feed.firstChild); // newest on top
  while (feed.children.length > MAX_LINES) feed.removeChild(feed.lastChild as ChildNode);
  setTimeout(() => {
    line.style.opacity = '0';
  }, LINE_TTL_MS - 1200);
  setTimeout(() => line.remove(), LINE_TTL_MS);
}
