// THE DECK LOADER (Story 8.2) — the ONE port a deck enters a match through.
//
// Placement rule (epic-8 Technical Decisions): "a deck enters a match only
// through the one shared deck loader". Both doors — StandardQueueRoom's
// `onJoin` (the production path: the queue freezes the list into the seat
// reservation's server-only `auth` payload) and ArenaRoom's `onJoin` (Solo
// vs AI and the dev direct join, where no reservation carried one) — call
// `loadDeckFor` and nothing else ever resolves a deck.
//
// WITH NO ACCOUNT MODULE THERE IS EXACTLY ONE ANSWER: the hull's default deck
// (sim/catalog.ts DEFAULT_DECKS, Eric ruling 2026-09-15, epic-8 amendment
// 10). `userId` and `deckId` are accepted and IGNORED — they are the Epic 9
// port: Story 9.x plugs an account store in here, resolves `deckId` against
// the user's named decks, and returns THAT list (or a refusal reason such as
// `deck.missing` / `account.unavailable` for the door to render). The
// signature is final so that story changes this file's body and nothing at
// either door.
//
// THE LOADER DOES NOT CHECK LEGALITY — THE DOOR DOES. `checkDeck` runs at the
// door (rooms/deckDoor.ts) against `DEFAULT_OWNED`, so every refusal reason
// lives in one place whatever its source; a default deck always passes
// (pinned in decks.test.ts and at module load in sim/deckRules.ts), so today
// only a dev `deckOverride` can be refused.
//
// ZERO COLYSEUS IMPORTS (the game/ layering rule): the refusal's transport —
// a ServerError with DECK_REFUSED_CODE — is the room's business.

import { DEFAULT_DECKS, type DeckRule, type LineId, type ShipClassId } from '@salvo/shared';

/**
 * The app-level error code a deck refusal rides to the client. NOT
 * ErrorCode.AUTH_FAILED (525): the client maps THAT code to "VERSION
 * MISMATCH — PLEASE REFRESH" and a refused deck is not a stale bundle. Chosen
 * outside every code @colyseus/shared-types defines (ErrorCode 520–526 and
 * 4217; CloseCode 1000–1006 and 4000–4010), so it can never be mistaken for a
 * framework verdict on either side. The client renders it through its
 * generic connection-failed branch (pinned in client connection.test.ts);
 * Epic 9's Ship & Deck screen owns the real copy (UX-DR71).
 */
export const DECK_REFUSED_CODE = 4402;

/**
 * Why a door refused a deck: one of the four `checkDeck` rules, or
 * `clientSupplied` — the join options carried a `deck` key, which a client
 * may never do (the sanitizer refuses the KEY, whatever its value). Logged as
 * `deck.illegal { rule, sessionId }` exactly once per refusal.
 */
export type DeckRefusal = DeckRule | 'clientSupplied';

/**
 * Resolve the deck a captain sails. With no account module: the hull's
 * default deck, always; `userId` and `deckId` are the Epic 9 port and are
 * ignored today (see the header). Returns the FROZEN shared list — the door
 * copies nothing, the world stores the reference on `ShipRecord.deckList`.
 */
export function loadDeckFor(
  userId: string | null,
  deckId: string | undefined,
  hull: ShipClassId,
): readonly LineId[] {
  void userId; // Epic 9: the account whose decks `deckId` names
  void deckId; // Epic 9: which of that account's decks
  return DEFAULT_DECKS[hull];
}
