// THE BOUNTY (Story 4.6, Eric ruling 2026-08-10) — the client's whole side of
// the held throne, as PURE functions: the transition edge detector plus the
// three copy builders. Zero DOM, zero Pixi, zero state (the audio/tones.ts
// `audioCues` precedent: a pure function that returns WHAT FIRED, and the
// caller owns the previous value and the side effects).
//
// WHAT THIS MODULE MAY KNOW, AND WHAT IT MAY NEVER: the bounty is IDENTITY
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
// ordering — which is exactly why the flag exists.

import { ellipsizeName } from '../util/text.js';
import type { KillSegment, NameRef } from './killFeed.js';

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
   *  that emptied it already printed its own bounty-kill line. */
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
 * rather than throwing: the bar simply shows no bounty for a frame.
 */
export function bountyTransition(prev: string, next: string, selfId: string): BountyTransition {
  const holder = typeof next === 'string' ? next : '';
  const changed = holder !== prev;
  const claimed = changed && holder !== '';
  return { changed, holder, claimed, self: claimed && holder === selfId };
}

/**
 * Pure: the CLAIM register — `BOUNTY: <NAME>`.
 *
 * Shaped exactly like killLine's output so it rides the same feed adapter: the
 * NAME segment carries the roster id (so pushKillLine colors it in the pilot's
 * text-safe personal hue) and the label is a connective segment with NO id.
 * The name is mid-ellipsized through the one shared cap, like every other name
 * the feed prints.
 */
export function bountyClaimLine(holder: NameRef): KillSegment[] {
  return [{ text: 'BOUNTY: ' }, { text: ellipsizeName(holder.name), id: holder.id }];
}

/**
 * Pure: the trailing connective appended to a sinking whose victim held the
 * bounty. `attributed` = the sinking names a killer.
 *
 * CLAIMED vs LIFTED is the whole distinction: someone collected the price, or
 * the storm (or the holder's own hand) took the throne off the board with
 * nobody paid. A connective segment, so it carries no `id` and renders in the
 * feed's connective register rather than as a name.
 */
export function bountyKillSuffix(attributed: boolean): KillSegment {
  return { text: attributed ? ' — BOUNTY CLAIMED' : ' — BOUNTY LIFTED' };
}

/** The self-claim toast copy — the one line that tells you the field is now
 *  hunting YOU. Stated once here so the string cannot drift between the toast
 *  and its test. */
export const BOUNTY_TOAST = 'YOU ARE THE BOUNTY';

/** Pure: the toast line for the local player taking the throne (ui/upgradeToast
 *  is a general center-top toast surface — no API change was needed). */
export function bountyToastLine(): string {
  return BOUNTY_TOAST;
}
