// Kill feed — small DOM text lines (top-right) fed from sunk events. Story 1.12
// (UX-DR17): a line is a list of SEGMENTS ({ text, id? }) — the NAME segments
// carry a roster id so pushKillLine can color each name span in the pilot's
// text-safe personal hue (600-weight); the connective text inherits the
// container's text-secondary. Newest line on top. killLine() stays pure
// (unit-tested) — it only shapes segments + mid-ellipsizes long names; the DOM
// stack is a thin adapter. Lines expire after a few seconds; the stack is capped
// so a bloodbath cannot fill the screen.

import { droneSizeOf, type HullId } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { cssHex, cssRgba, textSafe } from '../util/color.js';
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

/**
 * The feed's neutral stand-in for a vessel whose roster entry is already gone
 * (a departed captain has no callsign). A GLOBAL feed (PV 23) delivers every
 * sinking to every client, so a raw session id fallback would print transport
 * plumbing into everyone's feed — the label stands in instead, and the segment
 * stays uncolored (a roster miss also resolves no hue).
 */
export const UNKNOWN_VESSEL = 'UNKNOWN VESSEL';

/**
 * Pure: the feed's name for a PvE fleet victim WITH ITS SIZE — `SMALL DRONE`,
 * `MEDIUM DRONE`, `LARGE DRONE` — or null when the hull is not a fleet hull (or
 * is absent).
 *
 * ERIC'S RULING (2026-08-14): *"I want to know the kills I get when I get them.
 * Meaning I want to know I killed a Small Drone if a Small Drone is killed by my
 * mine."* THE SIZE IS THE POINT, because **the size IS the payout** — ¼ / ⅓ / ½
 * of a level — so a line that said only `DRONE` would omit the one fact the
 * moment is actually about.
 *
 * Fed from `SunkEvent.vcls`, which the server stamps ONLY on the credited
 * killer's copy of the row. That is why this can be reliable where the client
 * alone never could: you can mine a fleet ship you never once saw.
 *
 * DERIVED FROM `droneSizeOf`, NOT FROM A SECOND TABLE — a fourth drone size
 * would name itself here rather than silently falling through to `DRONE`. The
 * uppercase is the feed's own register (every name in a line is uppercase).
 *
 * IT NAMES NOTHING ELSE. A captain victim returns null and keeps their roster
 * callsign, and none of this touches the KILLS tally, the MATCH LOG or SHIPS YOU
 * SANK — amendment 38 is unmoved and Eric re-confirmed all three in the same
 * breath (*"it doesn't increment my kill count... doesn't need to show up in my
 * end-game kills record"*).
 */
export function fleetSizeName(cls: HullId | undefined): string | null {
  const size = cls === undefined ? null : droneSizeOf(cls);
  return size === null ? null : `${size.toUpperCase()} DRONE`;
}

/**
 * Pure: a colour resolver that pins ONE id to the drone grey and defers every
 * other id to `base`.
 *
 * The feed colours a name by looking its id up in the roster/contact set, and a
 * fleet hull named from `vcls` is precisely the hull that is in NEITHER — so the
 * lookup would come back null and the one line that finally knows what it sank
 * would render it in plain body text. This keeps requirement 3 true (fleet
 * victims wear the drone grey exactly as they always have) without giving the
 * segment shape a new colour channel: `renderSegments`' drone-verbatim rule
 * still keys off the resolved value BEING `droneOutline`, unchanged.
 */
export function pinDroneColor(id: string, base: (id: string) => number | null): (id: string) => number | null {
  return (probe) => (probe === id ? CLIENT_CONFIG.colors.droneOutline : base(probe));
}

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
  /** This NAME segment is the KILL LEADER's (Story 4.6, 2026-08-10 rework):
   *  the segment text already carries the skull mark (ui/bounty.ts
   *  leaderNameSegment), and this flag licenses the STATIC glow below. Only
   *  ever set alongside `id`. */
  leader?: true;
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
        const textColor = isDrone ? color : textSafe(color);
        span.style.color = cssHex(textColor);
        span.style.fontWeight = '600';
        // THE KILL LEADER'S FAINT GLOW (Eric ruling 2026-08-10): a STATIC
        // text-shadow in the name's own text-safe hue — never breathing,
        // never pulsing, so it is not an animated channel at all and stays
        // out of the attention-tier arbitration and the photosensitivity
        // budget. Radius/alpha are DESIGN.md's glow register, not invented:
        // 10px is the hotbar ready-weapon glow (the faint end of the
        // 10/14/16px ladder in the component inventory) and .4 is the
        // canonical glow alpha from the DESIGN.md "Glow" motif's selected-slot
        // example (the 16px amber bloom at .4). A DRONE name can never be a
        // leader (captain kills only) and must never glow.
        if (seg.leader && !isDrone) span.style.textShadow = `0 0 10px ${cssRgba(textColor, 0.4)}`;
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
