// THE BR CHROME BAR (Story 3.3, amendments 19–21) — the pure composer for the
// one restrained mono row that sits top-center for the whole match:
//
//     12 AFLOAT · 2 KILLS · T+04:12 · RING CLOSES IN 2:34
//
// PURE by construction (the ui/phase.ts precedent): no Pixi, no DOM, no clock
// and no state. Everything here is a total function of numbers the client
// already legitimately holds — the public roster's alive flags and kill tally,
// the schema's `zoneStartT` against the server-clock estimate, and the locally
// derived ZoneView. render/hud.ts owns the Texts; main.ts owns the payload.
//
// THE THREE RATIFIED RULES THIS MODULE ENCODES
//
//  • AFLOAT counts CAPTAINS — humans only, the local player included (the
//    public-register cycle, superseding amendment 19's all-hulls count: drones
//    are not combatants). The rule and its doctrine note live in score.ts
//    (isAfloatHull), beside the rival count it remains half-asymmetric with.
//  • THE RING READOUT IS A CONTINUOUS COUNTDOWN (amendment 26, superseding
//    amendment 20's reveal-beat announcement): every pre-close beat — clear,
//    supply, AND reveal — counts down to the next close START as
//    `RING CLOSES IN m:ss`, unbroken from cycle start; the last 10s turn amber
//    (the get-moving moment). The `RING REVEALED` register is retired — Eric hit
//    the gap it created live ("timer ticks down to the reveal text, then there's
//    no indicator of when it will close"). The shrink counts down to the close
//    END and is never amber; after final closure the readout just says so.
//  • STORM INFORMATION WEARS THE STORM REGISTER (amendment 21): the ring segment
//    is storm-readout violet, amber only inside the urgency window. The
//    AFLOAT/KILLS/T+ numbers are phosphor tabular (Geist Mono is monospaced, so
//    the figures are tabular for free) and their LABELS are dim-alpha phosphor —
//    never `textMuted`, which amendment 17 retired for load-bearing HUD text.

import type { ZonePhase } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { textSafe } from '../util/color.js';
import { ellipsizeName } from '../util/text.js';
import { KILL_LEADER_MARK } from './bounty.js';
import { monoTextWidth } from './refitCardFit.js';

const CB = CLIENT_CONFIG.chromeBar;
const C = CLIENT_CONFIG.colors;

/**
 * THE ring pulse rate (Hz) — the amber urgency breath, at exactly 1 Hz.
 *
 * Expressed as a MINIMUM against the one shared photosensitivity ceiling rather
 * than as a bare `1`: `settings.pulseCapHz` is the accessibility floor's single
 * promise ("nothing on screen pulses faster"), and a second literal here would
 * be a rate that silently survives a future tightening of that ceiling. Written
 * this way, dropping the cap below 1 Hz drags this pulse down with it.
 */
export const RING_PULSE_HZ = Math.min(1, CLIENT_CONFIG.settings.pulseCapHz);

/** The LIT keyframe of the ring segment's breath — full alpha. This is the
 *  INFORMATION endpoint: it is what the segment holds at motion=off, what the
 *  Tier-1 hold eases to, and where the pulse's phase starts (see
 *  advanceRingPhase). The breath only ever dips DOWN from here. */
export const RING_LIT_ALPHA = 1;

/** Largest frame gap (s) the ring pulse integrator advances across — the HP
 *  rail's guard (hud.ts MAX_PULSE_DT), restated for this channel: a backgrounded
 *  tab must not jump the phase by a wild amount on the frame it returns. */
const MAX_PULSE_DT = 0.5;

/** Whole seconds REMAINING in a countdown window: clamped at 0, CEILED (a live
 *  second reads as that second, and nothing ever renders a negative clock).
 *  Elapsed time is the other direction — see elapsedSeconds. */
function clockSeconds(ms: number): number {
  return Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 1000)) : 0;
}

/** Whole seconds ELAPSED: clamped at 0, FLOORED. A clock counting UP shows the
 *  second that has actually passed — ceiling it would read one second fast for
 *  the whole match (1ms in would already say `T+00:01`). */
function elapsedSeconds(ms: number): number {
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
}

/**
 * Pure: the BAR clock — `mm:ss`, minutes ZERO-PADDED (`T+04:12`, `T+00:00`).
 * The match timer is derived every frame from `serverNow − zoneStartT`, so it is
 * reconnect-safe by construction: there is no local accumulator to lose.
 *
 * ELAPSED, so it FLOORS (the ceil rationale belongs to the countdowns alone):
 * `T+00:00` holds for the whole first second and flips at exactly 1.000s.
 */
export function fmtBarClock(ms: number): string {
  const total = elapsedSeconds(ms);
  const m = Math.floor(total / 60);
  return `${String(m).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Pure: the RING clock — `m:ss`, minutes UNPADDED (`2:34`, `0:10`). Deliberately
 * a different shape from the match timer: `T+` is a running match clock (padded
 * so its width never twitches) and this is a countdown to an event, which reads
 * naturally as `0:41`.
 */
export function fmtRingClock(ms: number): string {
  const total = clockSeconds(ms);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Pure: an ELAPSED span in the ring clock's unpadded `m:ss` shape (`6:27`) —
 * the third corner this module needed and did not have, added for Story 5.3's
 * TIME AFLOAT tile.
 *
 * THE TWO AXES ARE SHAPE AND DIRECTION, AND THEY ARE INDEPENDENT. `fmtBarClock`
 * is elapsed+padded, `fmtRingClock` is countdown+unpadded, and a tile wanting
 * elapsed+unpadded had neither. Reaching for `fmtRingClock` because its SHAPE
 * was right silently bought its CEIL — which made TIME AFLOAT read one second
 * later than the `SUNK BY` stamp printed directly beneath it from the same
 * latched millisecond (found at the review gate). Elapsed floors, always:
 * see elapsedSeconds.
 */
export function fmtElapsedClock(ms: number): string {
  const total = elapsedSeconds(ms);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** The ring segment's copy plus the one bit that drives its color and pulse. */
export interface RingReadout {
  /** The register string ('' only while the timeline is idle). */
  text: string;
  /** Inside the final-10s urgency window: amber, breathing at RING_PULSE_HZ. */
  urgent: boolean;
}

/**
 * Pure: the ring readout for a zone phase (amendment 26's grammar, exactly).
 *
 * `closesInMs` is DUAL-MEANING by design (shared zone.ts: to the close START
 * during clear/supply/reveal, to the close END while closing) and this composer
 * takes it verbatim — it never re-derives a beat boundary, so a retuned timeline
 * or a test beat config can never put the copy and the countdown out of step.
 *
 * The urgency window is defined on the value itself — any PRE-CLOSE beat with
 * `closesInMs ≤ urgentMs` — rather than on any beat identity. Same behavior on
 * the shipped timeline, robust on any other.
 */
export function ringReadout(state: ZonePhase, closesInMs: number, urgentMs: number = CB.urgentMs): RingReadout {
  if (state === 'idle') return { text: '', urgent: false };
  if (state === 'closed') return { text: 'RING CLOSED', urgent: false };
  // The shrink: counts to the close END, violet, never amber — the ring is
  // already moving, and the urgency cue belongs to the moment before it does.
  if (state === 'closing') return { text: `RING CLOSING ${fmtRingClock(closesInMs)}`, urgent: false };
  // Every pre-close beat — clear, supply, reveal alike (amendment 26: the
  // countdown never breaks; the reveal beat's on-water dashed telegraph is the
  // reveal's whole HUD story). Supply stays BYTE-IDENTICAL to clear, which is
  // the whole of "the parked supply beat has zero HUD trace".
  const urgent = Number.isFinite(closesInMs) && closesInMs <= urgentMs;
  return { text: `RING CLOSES IN ${fmtRingClock(closesInMs)}`, urgent };
}

/** One laid-out piece of the bar. Pixi Text is single-style, so a multi-color
 *  row is a row of Texts — and this is the ordered list of them. */
export interface ChromeSegment {
  text: string;
  /** Fill color (a `colors` token — never a literal). */
  color: number;
  /** Steady alpha. The ring segment's is overridden by the live pulse while the
   *  urgency window is open (see ringSegmentAlpha). */
  alpha: number;
  /** This segment is the RING readout — the only one the pulse/hold touches. */
  pulsed?: boolean;
}

/**
 * THE BOUNTY HOLDER, for the bar's register (Story 4.6) — IDENTITY ONLY.
 *
 * A callsign and the pilot's RAW personal hue (exactly what the kill feed's
 * `feedColor` resolves); the WCAG lift is applied here rather than by the
 * caller, so the bar and the feed cannot drift apart on how a name is made
 * legible against the void. `null` means the throne is vacant OR the roster
 * lookup missed — either way the WHOLE segment (its separator included) is
 * omitted, because a bar that printed a bare `☠︎ ` with nothing after it
 * would be a register with no register.
 *
 * There is deliberately no drone case: a drone can never hold the throne (the
 * server counts CAPTAIN kills only), so the feed's "drone grey is pinned
 * verbatim, never run through textSafe" exception has no analogue here.
 */
export interface BountyHolder {
  /** Roster callsign (mid-ellipsized here, at the one shared name cap). */
  name: string;
  /** The pilot's raw personal hue — lifted through textSafe() below. */
  hue: number;
}

/** Everything the bar renders this frame (main.ts assembles it per frame). */
export interface ChromeBarView {
  /** The bar is shown at all — false while the zone timeline is idle, i.e. the
   *  whole pre-live ready room (waiting/gathering/countdown), where the match
   *  phase lines own top-center. */
  visible: boolean;
  /** Captains still afloat — humans only, the local player included (the
   *  public-register cycle; drones are excluded — score.ts isAfloatHull). */
  afloat: number;
  /** Own kills, the server-authoritative public roster tally — EVERY hull the
   *  server credited, DRONES INCLUDED (the same number the results modal
   *  reports). Never a client recount. HONEST CAVEAT: this denominator now
   *  deliberately differs from the AFLOAT segment beside it — AFLOAT counts
   *  captains only (the public-register cycle) while KILLS still counts every
   *  hull, so a solo captain can read `1 AFLOAT · 5 KILLS` off five drone
   *  kills. Whether KILLS should go captains-only awaits an owner ruling
   *  (ledgered); until then the roster tally stands unchanged. */
  kills: number;
  /** Elapsed match time (ms) = serverNow − zoneStartT, clamped at 0. */
  matchMs: number;
  ring: RingReadout;
  /** The bounty holder (Story 4.6) — identity only, `null` when the throne is
   *  vacant or the roster lookup missed. NEVER a position, bearing or range:
   *  Eric's 2026-08-10 ruling deleted every on-water cue for the bounty, and
   *  this text register is the only place on screen it appears at all. */
  bounty: BountyHolder | null;
  /** A Tier-1 (threat) channel is animating this frame — the amber segment
   *  holds at its lit keyframe while it is (attention.ts's tier table). */
  tier1: boolean;
}

/**
 * Pure: is the bar shown at all?
 *
 * TWO conditions, both required. The zone timeline must be live (idle = the
 * pre-live ready room, where the match-phase lines own top-center) AND its
 * anchor must be a real timestamp: `zoneStartT` is 0 until the server anchors
 * the timeline, and a non-idle state presented against that sentinel would print
 * `T+` as the whole server uptime (`now − 0`). The bar simply waits a frame for
 * the anchor rather than rendering a number it cannot mean.
 */
export function barVisible(state: ZonePhase, startT: number): boolean {
  return state !== 'idle' && Number.isFinite(startT) && startT > 0;
}

/** Whole, non-negative integer for a displayed tally (a schema miss reads 0). */
function tally(n: number): string {
  return String(Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);
}

/** The separator between segments — punctuation, at the dimmest alpha in the
 *  row. The spacing around it is part of the string: the row lays out
 *  contiguously, so every gap in the bar is a real (mono, letter-spaced) space
 *  and the layout model never has to guess one. */
const SEP = ' · ';

function sep(): ChromeSegment {
  return { text: SEP, color: C.phosphor, alpha: CB.sepAlpha };
}

/** A phosphor NUMBER (full alpha) + its dim-phosphor LABEL, in that order. */
function readout(value: string, label: string): ChromeSegment[] {
  return [
    { text: value, color: C.phosphor, alpha: 1 },
    { text: label, color: C.phosphor, alpha: CB.labelAlpha },
  ];
}

/**
 * The KILL LEADER register (Story 4.6, 2026-08-10 rework) — `· ☠︎ <NAME>`,
 * or NOTHING. (The `BOUNTY: <NAME>` label grammar is retired: the skull mark
 * IS the register's whole caption now, and it rides the name segment so it
 * wears the holder's hue exactly as it does in the feed.)
 *
 * Two segments or zero, never anything between: the separator belongs to the
 * register, so a vacant throne leaves no dangling ` · ` at the end of the row.
 * The NAME is the first per-player hue the bar has ever carried, lifted
 * through textSafe() exactly as the kill feed lifts it.
 */
function bountyRegister(holder: BountyHolder | null): ChromeSegment[] {
  if (!holder) return [];
  return [
    sep(),
    { text: `${KILL_LEADER_MARK} ${ellipsizeName(holder.name)}`, color: textSafe(holder.hue), alpha: 1 },
  ];
}

/**
 * Pure: the whole bar, as an ordered segment list.
 *
 * Order and register (the ratified mock, as amended): `n AFLOAT · n KILLS ·
 * T+mm:ss · <ring> · ☠︎ <NAME>`. The `T+` prefix is a LABEL (dim phosphor)
 * and the clock after it is the number, so the three left-hand segments read
 * identically: bright value, dim caption.
 *
 * The bounty rides at the TAIL deliberately: it is the only OPTIONAL register
 * in the row, and appending it leaves the ten shipped segments at byte-
 * identical indices whether the throne is held or vacant — which matters
 * because render/hud.ts caches each pooled Text's last fill BY INDEX.
 */
export function chromeBarSegments(view: ChromeBarView): ChromeSegment[] {
  return [
    ...readout(tally(view.afloat), ' AFLOAT'),
    sep(),
    ...readout(tally(view.kills), ' KILLS'),
    sep(),
    { text: 'T+', color: C.phosphor, alpha: CB.labelAlpha },
    { text: fmtBarClock(view.matchMs), color: C.phosphor, alpha: 1 },
    sep(),
    { text: view.ring.text, color: view.ring.urgent ? C.amber : C.stormReadout, alpha: 1, pulsed: true },
    ...bountyRegister(view.bounty),
  ];
}

/** How many Texts the row ever needs — the renderer's fixed pool size (Texts are
 *  created once and reused; nothing in the bar allocates per frame). Pinned
 *  against the composer by chromeBar.test.ts.
 *
 *  This is the MAXIMUM, not the invariant count: 10 fixed segments plus the
 *  kill-leader register's 2 (separator + marked name). It moved from 10 the
 *  moment the bounty shipped (as 13, when the register carried a separate
 *  label segment) and to 12 with the 2026-08-10 `☠︎ <NAME>` rework —
 *  layoutChromeBar bounds both its loops by the pool, so a stale literal here
 *  would SILENTLY DROP the tail rather than fail (and an oversized one wastes
 *  pooled Texts). */
export const CHROME_BAR_SEGMENTS = 12;

/** A laid-out row: the x of each segment (left edge) and the row's total width. */
export interface ChromeBarLayout {
  xs: number[];
  width: number;
}

/**
 * Pure: lay the segments out as one contiguous row CENTERED on `screenW / 2`.
 *
 * Widths come from the repo's mono width MODEL (refitCardFit's
 * `monoTextWidth` — chars × 0.605em + letter-spacing) rather than from a Pixi
 * measurement. Two reasons, in order of importance: it is the SAME model the
 * container-fit law's pins use, so the fit proof and the actual layout can never
 * disagree; and it keeps the whole layout a pure function of strings, which is
 * what lets it be tested at all (Pixi's text metrics need a real canvas). The
 * model is a conservative UPPER bound on Geist Mono's true 0.6em advance, so the
 * row is centered to within a pixel or two — invisible on a centered readout,
 * and never an overflow.
 */
export function chromeBarLayout(segments: readonly ChromeSegment[], screenW: number): ChromeBarLayout {
  const widths = segments.map((s) => monoTextWidth(s.text, CB.fontSize, CB.letterSpacing));
  const width = widths.reduce((a, b) => a + b, 0);
  let x = Math.max(0, screenW / 2 - width / 2); // never off the left edge
  const xs: number[] = [];
  for (const w of widths) {
    xs.push(x);
    x += w;
  }
  return { xs, width };
}

/**
 * Pure: advance the ring pulse's PHASE (radians) by one frame — the HP rail's
 * integrated-phase pattern (hud.ts advancePulsePhase), for this channel.
 *
 * The phase is INTEGRATED rather than computed from absolute time, and it HOLDS
 * AT ZERO whenever the breath is not actually being drawn — the urgency window
 * is shut, OR the effective amplitude is zero (motion=off). Phase 0 is the LIT
 * keyframe (the breath is a cosine), so the first amber breath always starts
 * fully lit and dips from there — the segment can never snap on at whatever
 * alpha a free-running phase had drifted to.
 *
 * The amplitude is a PARAMETER (the function stays pure): integrating through a
 * motion=off stretch would leave the phase parked at an arbitrary angle, and
 * re-enabling motion mid-urgency would then apply full amplitude there — a
 * one-frame snap down from lit, which is exactly the onset rule this gate
 * exists to enforce.
 */
export function advanceRingPhase(phase: number, urgent: boolean, dt: number, amp: number): number {
  if (!urgent || !(amp > 0)) return 0;
  const step = Math.min(MAX_PULSE_DT, Math.max(0, Number.isFinite(dt) ? dt : 0));
  return (phase + RING_PULSE_HZ * step * Math.PI * 2) % (Math.PI * 2);
}

/** Clamp to [0,1] (a blend factor, or a caller's degenerate input). */
function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

/**
 * Pure: the ring segment's alpha at a pulse phase, a motion-scaled amplitude and
 * an eased Tier-1 hold blend.
 *
 * OPACITY ONLY, and only ever DOWNWARD from the lit keyframe:
 *   alpha = LIT − amp · (1 − cos φ) / 2
 * so φ=0 is lit, φ=π is `lit − amp`, and at motion=off (amp 0) the segment is
 * statically lit — the amber color, the word and the countdown are all fully
 * present at every motion level, and only the breathing is motion.
 *
 * TIER-GATED (the attention seam): `hold` blends the breathing value toward the
 * lit keyframe (1 = fully held) while a Tier-1 threat channel owns the eye.
 * The caller eases that blend (render/zone.ts easeHold, τ = chromeBar.holdEaseMs)
 * rather than switching it, so denied-click spam cannot square-wave the segment
 * past the photosensitivity floor — the 3.2 vignette-hold precedent, verbatim.
 * At amp 0 both endpoints are the same number, so the hold is a literal no-op at
 * motion=off rather than a hidden motion exception.
 */
export function ringSegmentAlpha(phase: number, amp: number, hold = 0): number {
  const breathing = RING_LIT_ALPHA - Math.max(0, amp) * (1 - Math.cos(phase)) / 2;
  return breathing + (RING_LIT_ALPHA - breathing) * clamp01(hold);
}

/** The full breathing amplitude before motion scaling: lit → floor. The caller
 *  passes this through `motionScaled` (halved at `reduced`, zero at `off`). */
export const RING_PULSE_AMP = RING_LIT_ALPHA - CB.pulseFloorAlpha;
