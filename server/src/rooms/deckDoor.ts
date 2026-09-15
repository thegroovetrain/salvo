// THE DECK DOOR (Story 8.2) — the one sequence both rooms run when a captain
// knocks: sanitize the deck-shaped join options, resolve the list through the
// ONE loader, check it against the four deck rules, and either hand back the
// frozen list or REFUSE the join. Shared so the two doors cannot drift: the
// queue (the production path) and the arena's own `onJoin` (Solo vs AI, the
// dev direct join, and the belt-and-braces re-check of a seat-carried deck)
// call exactly this.
//
// NEVER SUBSTITUTE. A deck that fails a rule is refused, never replaced with
// the default: silently sailing a different deck than the one a captain
// chose is worse than a refused join (spec Never list). The refusal is a
// ServerError carrying DECK_REFUSED_CODE — an app code, NOT the auth/version
// code — so the client renders it through its generic branch; core answers a
// throw from `onJoin` by tearing down just that client (`_onLeave` with
// WITH_ERROR, reservation dropped, the error forwarded) and leaves the room
// and every other seat alone (verified in @colyseus/core 0.18.13
// Room.mjs:1125-1137; the queue's pool is untouched because the refusal fires
// BEFORE the push).
//
// Logged EXACTLY ONCE per refusal (`deck.illegal { rule, sessionId }`) and
// once per dropped dev override (`deck.devOptionsRejected { rejected }`, the
// `room.devOptionsRejected` precedent) — never the deck contents.

import { ServerError } from 'colyseus';
import { DEFAULT_OWNED, checkDeck, type LineId, type ShipClassId } from '@salvo/shared';
import { DECK_REFUSED_CODE, loadDeckFor, type DeckRefusal } from '../game/decks.js';
import type { Logger } from '../log.js';
import { sanitizeDeckOptions, type JoinOptions } from './roomOptions.js';

/** The refusal, as the door throws it. */
export function deckRefusal(log: Logger, rule: DeckRefusal, sessionId: string): ServerError {
  log.warn('deck.illegal', { rule, sessionId });
  return new ServerError(DECK_REFUSED_CODE, `deck illegal: ${rule}`);
}

/**
 * Check an already-resolved list at the door: legal → the same reference
 * back (frozen upstream); illegal → the refusal, thrown by the caller. Used
 * by `admitDeck` below and by the arena for a seat-carried list.
 */
export function checkAtDoor(deck: readonly LineId[], log: Logger, sessionId: string): readonly LineId[] {
  const verdict = checkDeck(deck, DEFAULT_OWNED);
  if (!verdict.ok) throw deckRefusal(log, verdict.rule, sessionId);
  return deck;
}

/**
 * Admit a captain's deck from raw join options. Throws the refusal
 * ServerError; returns the frozen list to store on the record / in the seat.
 *
 *   1. a client `deck` key → refuse `clientSupplied` (any value);
 *   2. a `deckOverride` without HC_DEV_OPTIONS → dropped + logged, never
 *      honoured (the default is used — that is a silent DROP of a dev knob,
 *      not a substitution of a chosen deck);
 *   3. the list = the honoured override, else `loadDeckFor(null, deckId, hull)`
 *      (no account module: the hull's default);
 *   4. `checkDeck` against DEFAULT_OWNED → refuse on the first failing rule.
 */
export function admitDeck(
  options: JoinOptions,
  hull: ShipClassId,
  devEnabled: boolean,
  log: Logger,
  sessionId: string,
): readonly LineId[] {
  const deckOpts = sanitizeDeckOptions(options, devEnabled);
  if (deckOpts.rejectedKeys.length > 0) log.warn('deck.devOptionsRejected', { rejected: deckOpts.rejectedKeys });
  if (deckOpts.clientDeck) throw deckRefusal(log, 'clientSupplied', sessionId);
  const deck = deckOpts.deckOverride ?? loadDeckFor(null, deckOpts.deckId, hull);
  return checkAtDoor(deck, log, sessionId);
}
