// THE CLIENT'S THIRD LIFECYCLE STATE (Story 5.2, Eric rulings 2026-08-12,
// amendments 10/11/16) — the pure predicates every seam in main.ts consults so
// "am I still conning a hull?" is answered in exactly one place.
//
// Before this story the client had TWO states and one boolean: `you.alive`
// drove the hull, the hotbar, the firing arc, the aim preview, the helm
// feedback, the zoom gate and the ELIMINATED modal all at once. Amendment 11
// keeps `alive` going FALSE at sink-entry (the kill is real immediately — the
// AFLOAT count, the kill feed and the killer's credit all land on that tick),
// and amendment 10 keeps every weapon, ability and the foghorn LIVE for the
// five seconds that follow. Those two rulings are only compatible if `alive`
// stops being the thing the controls key on:
//
//   alive    — full HUD, exactly as before.
//   sinking  — hull visible and controllable, helm live (decaying), hotbar
//              live, firing arc + aim preview live, foghorn live, camera held
//              on the own hull, fog still on (you are NOT spectating), and the
//              REFIT INERT ("once sinking, you're done" — amendment 10).
//   dead     — spectate, exactly as before.
//
// The wire carries the third state as ONE self-private optional key,
// `OwnShip.sinkingUntil` (shared/src/types.ts): the absolute server-clock ms
// the hull founders, present IFF the hull is inside the window. It rides `you`
// and nothing else, so it adds no perception exception — the master invariant
// stays at exactly SIX.
//
// THE TRAP THESE FUNCTIONS EXIST TO AVOID (spec Design Notes): main.ts builds
// its HUD status with `alive: you?.alive ?? true`, so a frame shape that omits
// `you` reads as ALIVE. That default is correct for the pre-first-frame gap and
// is left alone — but the third state must NOT inherit it. Every predicate here
// therefore treats a missing `you` as "no sinking window", never as one, and
// `conningFlag` preserves the caller's own `undefined` default rather than
// choosing for them.

/**
 * The two `you` fields the third state is derived from — structural, so this
 * module stays free of the wire types and every test can hand it a literal.
 */
export interface SinkingOwn {
  alive: boolean;
  /** ms — absolute server-clock time this hull founders; ABSENT when not
   *  sinking (never `undefined` on the wire — the msgpack rule). */
  sinkingUntil?: number;
}

/**
 * Pure: is the own hull inside its sinking window at `now` (a server-clock
 * estimate — `clock.serverNow()`, the same clock the deadline was stamped on)?
 *
 * Both clauses are load-bearing and the three states are DISJOINT by
 * construction: `alive` false is what the window is (amendment 11 flips it at
 * sink-entry), and the deadline is what keeps the hull playable. No `you` is
 * FALSE — deliberately not the `?? true` default the HUD's `alive` carries, so
 * a dropped/omitted `you` can never fabricate a sinking window that keeps a
 * torn-down hull's controls alive.
 */
export function isSinkingNow(you: SinkingOwn | null | undefined, now: number): boolean {
  if (!you || you.alive) return false;
  return now < (you.sinkingUntil ?? 0);
}

/**
 * Pure: `you.alive` WIDENED through the sinking window — the value every
 * control-side gate should read where it used to read `you?.alive`.
 *
 * It returns `boolean | undefined` on purpose: the shipped gates each pick
 * their OWN default for a missing own ship (`?? true` for the ability press,
 * `?? false` for the horn, `=== true` for the helm/zoom, `=== false` for the
 * server-denial guard), and those defaults are all deliberate. Widening the
 * flag while preserving the absence lets every one of them keep its rule.
 */
export function conningFlag(you: SinkingOwn | null | undefined, now: number): boolean | undefined {
  if (!you) return undefined;
  return you.alive || isSinkingNow(you, now);
}

/**
 * Pure: is a DEFERRED elimination modal due to open?
 *
 * The ELIMINATED modal is focused — it calls `keyboard.clearKeys()` and
 * suppresses every non-overlay key — so a live helm is impossible while it is
 * up. The server still emits the `sunk` event at sink-entry (unmoved, by
 * amendment 11), so the client cannot key the modal on the EVENT: it latches
 * the elimination there and opens the modal at FOUNDER, which is exactly "the
 * window we latched against is no longer running". Keyed on the window rather
 * than on the arrival of a spectate frame so a late/dropped frame cannot strand
 * a captain with no debrief.
 */
export function founderDue(deferred: boolean, sinking: boolean): boolean {
  return deferred && !sinking;
}
