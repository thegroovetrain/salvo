// THE KILL LEADER (Story 4.6, Eric rulings 2026-08-10 — the same-day rework of
// the shipped "BOUNTY" copy grammar) — the client's whole side of the held
// throne, as PURE functions: the transition edge detector plus the copy
// builders. Zero DOM, zero Pixi, zero state (the audio/tones.ts `audioCues`
// precedent: a pure function that returns WHAT FIRED, and the caller owns the
// previous value and the side effects).
//
// THE COPY SAYS "KILL LEADER"; THE CODE SAYS "BOUNTY". Eric's rework ruling is
// about PLAYER-FACING WORDS ONLY ("'is the new bounty' … is really, um, stupid
// wording? KILL LEADER is boring but better") — all internal naming
// (CONFIG.bounty, bountyId, this module's name, the `bty` wire key) stays.
// The grammar itself: a skull mark rides the leader's name wherever it appears
// in a feed line (killer or victim alike), the claim register reads
// `☠ <NAME> IS THE NEW KILL LEADER`, and the leader's name glows faintly
// (statically — see killFeed.ts) in the feed.
//
// WHAT THIS MODULE MAY KNOW, AND WHAT IT MAY NEVER: the throne is IDENTITY
// ONLY. Eric's 2026-08-10 ruling deleted the Bounty Bloom outright — no radar
// paint, ring, halo, rim tick, bearing or range band marks the holder — so the
// throne reaches exactly three presentation surfaces and NONE of them draws on
// the water: the chrome-bar register (ui/chromeBar.ts), the kill feed
// (ui/killFeed.ts), and the toast + tone when the throne lands on you. Nothing
// under render/ that draws contacts, blips, effects or the scope learns that
// the bounty exists.
//
// THE CLIENT NEVER RE-DERIVES THE THRONE RULE. `bountyId` is authoritative and
// arrives on the room schema every tick; `bty` on a `sunk` row is the server's
// PRE-SINK truth. Comparing a sunk id against the local `bountyId` would be a
// race — the schema patch and the event ride the same frame with no guaranteed
// ordering — which is exactly why the wire channel exists.

import { ellipsizeName } from '../util/text.js';
import { killLine, type KillSegment, type NameRef } from './killFeed.js';

/**
 * THE ONE GLYPH that marks the kill leader, everywhere it is marked — swap it
 * here and every surface (feed lines, claim register, chrome bar) follows.
 *
 * U+2620 SKULL AND CROSSBONES + U+FE0E VARIATION SELECTOR-15, forcing TEXT
 * presentation. The UI font is Geist Mono (DESIGN.md typography), which very
 * likely does NOT cover U+2620 — the browser will substitute a system symbol
 * font for this one character; the variation selector keeps that substitution
 * monochrome linework rather than a color emoji. If the substituted rendering
 * displeases, '†' (U+2020 DAGGER) is the guaranteed-Geist-covered fallback.
 */
export const KILL_LEADER_MARK = '☠︎';

/** What the throne did this frame. `changed` false ⇒ every other field is
 *  inert and the caller does nothing (the common case, every frame). */
export interface BountyTransition {
  /** The holder id moved this frame — including to/from vacant (''). */
  changed: boolean;
  /** The holder AFTER the transition ('' when the throne is vacant). The
   *  caller stores this back as its new previous value. */
  holder: string;
  /** The throne LANDED on someone (a change to a non-empty id) — the claim
   *  register fires. A vacating throne changes but never claims: the sinking
   *  that emptied it already printed its own marked feed line. */
  claimed: boolean;
  /** The claim landed on the LOCAL player — the toast + tone, and only then. */
  self: boolean;
}

/**
 * Pure edge detector: previous holder id, this frame's holder id, and who we
 * are ⇒ what fired. Total over every combination the matrix names — vacant →
 * held, held → a different holder, held → vacant, and the no-change case that
 * runs on all but a handful of frames in a match.
 *
 * A non-string `next` (a schema field that has not synced yet) reads as vacant
 * rather than throwing: the bar simply shows no leader for a frame.
 */
export function bountyTransition(prev: string, next: string, selfId: string): BountyTransition {
  const holder = typeof next === 'string' ? next : '';
  const changed = holder !== prev;
  const claimed = changed && holder !== '';
  return { changed, holder, claimed, self: claimed && holder === selfId };
}

/**
 * Pure: the leader's NAME segment — `☠︎ <NAME>`, ONE segment.
 *
 * The mark and the name deliberately share a segment so the mark inherits the
 * pilot's text-safe personal hue and 600 weight — emitting it as a colorless
 * connective would detach the skull from the name it crowns. The `leader` flag
 * is the feed adapter's license to apply the static glow (killFeed.ts
 * renderSegments); the name is mid-ellipsized through the one shared cap, like
 * every other name the feed prints.
 */
export function leaderNameSegment(ref: NameRef): KillSegment {
  return { text: `${KILL_LEADER_MARK} ${ellipsizeName(ref.name)}`, id: ref.id, leader: true };
}

/**
 * Pure: the CLAIM register — `☠︎ <NAME> IS THE NEW KILL LEADER` (the
 * 2026-08-10 rework; the `BOUNTY: <NAME>` grammar is retired).
 *
 * Shaped exactly like killLine's output so it rides the same feed adapter: the
 * marked NAME segment carries the roster id (so pushKillLine colors it in the
 * pilot's text-safe personal hue) and the label is a connective segment with
 * NO id.
 */
export function bountyClaimLine(holder: NameRef): KillSegment[] {
  return [leaderNameSegment(holder), { text: ' IS THE NEW KILL LEADER' }];
}

/**
 * Pure: a sinking's feed line with the kill leader's name MARKED — the skull
 * rides the leader's name wherever it appears, as killer OR as victim
 * (`BOAT BOATERSON SUNK ☠ CAPTAINAHAB` / `☠ BOAT BOATERSON SUNK CAPTAINAHAB`).
 * This replaced the retired CLAIMED/LIFTED trailing connectives: the mark IS
 * the whole register now, and it carries no paid/unpaid distinction.
 *
 * `bty` is the server's pre-sink truth ('v' the victim led, 'k' the killer
 * led — never both; see SunkEvent). Built ON killLine's own output so the
 * grammar cannot drift from an unmarked sinking: the victim is always the
 * first segment and the killer, when named, always the last. A degenerate
 * `'k'` with no killer (the server never emits it) falls back to the unmarked
 * line rather than throwing.
 */
export function bountyKillLine(victim: NameRef, killer: NameRef | null, bty: 'v' | 'k'): KillSegment[] {
  const line = killLine(victim, killer);
  if (bty === 'v') line[0] = leaderNameSegment(victim);
  else if (killer) line[line.length - 1] = leaderNameSegment(killer);
  return line;
}

/** The self-claim toast copy — the one line that tells you the field now has a
 *  name for you. Stated once here so the string cannot drift between the toast
 *  and its test. (The shipped "bounty" wording is retired — the 2026-08-10
 *  wording ruling.) */
export const BOUNTY_TOAST = 'YOU ARE THE KILL LEADER';

/** Pure: the toast line for the local player taking the throne (ui/upgradeToast
 *  is a general center-top toast surface — no API change was needed). */
export function bountyToastLine(): string {
  return BOUNTY_TOAST;
}
