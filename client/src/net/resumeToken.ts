// THE RESUME TOKEN (Story 6.7, Eric ruling R2) — the SDK's reconnection token,
// persisted so a PAGE REFRESH resumes the match instead of losing it.
//
// WHY THE REFRESH CASE NEEDED ANYTHING AT ALL: `room.reconnectionToken` lives on
// the Room object, so it dies with the tab's JS heap. The SDK's in-page
// auto-reconnect never notices (it still holds the Room), but a reload starts
// from nothing — which is why a refresh used to lose a live match outright while
// a wifi blip did not.
//
// `sessionStorage`, NOT `localStorage` (R2). It survives a refresh, is scoped
// PER TAB so a second tab cannot inherit a session it never held, and dies with
// the tab — tab-close resume was offered and declined. The server's 60s grace
// bounds the token's usefulness either way, so this is a SCOPING choice, not a
// credential-lifetime one.
//
// AND ROOT MEANS RESUME. There is no match URL (R0 — withdrawn): `hullcracker.io/`
// is the only address, so a reload of it can only mean "put me back". Leaving is
// the explicit act it has been since amendment 19 — the results modal's RETURN TO
// PORT or settings' ABANDON MATCH, *never ESC, never a page refresh*
// (`ui/settings.ts`). Every one of those deliberate exits clears this key, so a
// player who left can never be dragged back by a later reload.
//
// FAIL OPEN, like every other `hullcracker.*` key (ui/home.ts loadSavedName,
// net/connection.ts loadColorPref): blocked/private-mode storage throws on
// `getItem`/`setItem` itself, and a browser that cannot persist a token simply
// behaves the way the game did before this story.

/** sessionStorage key for the persisted reconnection token — the same
 *  `hullcracker.*` family as the name/class/color/horn/session keys. */
export const RESUME_TOKEN_KEY = 'hullcracker.resume';

/**
 * Is this a token the SDK could even try?
 *
 * `Client.reconnect()` splits on `:` and THROWS on anything that is not
 * `roomId:token` (verified in @colyseus/sdk 0.17.43 `build/Client.mjs`), so the
 * shape is checked here rather than discovered as an exception on the boot path.
 * A malformed value reads as ABSENT — which is the same landing as an expired
 * one: the home screen.
 */
function wellFormed(raw: string | null): raw is string {
  if (raw === null) return false;
  const [roomId, token] = raw.split(':');
  return !!roomId && !!token;
}

/** The persisted reconnection token, or null when there is nothing to resume
 *  (absent key, malformed value, or storage we cannot read). */
export function loadResumeToken(): string | null {
  try {
    const raw = sessionStorage.getItem(RESUME_TOKEN_KEY);
    return wellFormed(raw) ? raw : null;
  } catch {
    return null; // blocked/private-mode storage — nothing to resume
  }
}

/**
 * Persist the token. Called on EVERY ack, not once at connect (ruling R9): a
 * successful in-page resume ROTATES the token server-side, so a write-once
 * client would carry a dead pre-resume token into the next refresh and fast-fail
 * deterministically on a session that was fully entitled to resume.
 */
export function saveResumeToken(token: string): void {
  if (!wellFormed(token)) return; // never persist something reconnect() would throw on
  try {
    sessionStorage.setItem(RESUME_TOKEN_KEY, token);
  } catch {
    // storage unavailable — a refresh simply loses the match, as it always did
  }
}

/** Forget the stored token. Called on ANY resume failure AND on every deliberate
 *  leave, so a departure can never be undone by a later reload. */
export function clearResumeToken(): void {
  try {
    sessionStorage.removeItem(RESUME_TOKEN_KEY);
  } catch {
    // storage unavailable — there was nothing to clear anyway
  }
}
