// Shared-password access gate for non-production hosts (cycle 127).
// An ops surface, NOT sim — the log.ts / metrics.ts / liveness.ts / robots.ts
// family. Inert unless HC_STAGING_KEY is set, which only the staging service in
// render.yaml does.
//
// WHY THIS IS NOT JUST AN EXPRESS MIDDLEWARE. There are TWO doors into this
// app, and only one of them is Express:
//
//   1. the built client (HTML/JS)  -> express.static, an Express layer
//   2. matchmaking + the socket    -> @colyseus/core's own request listener
//
// `bindRouterToTransport` REMOVES the Express app from the http server's
// 'request' listeners and prepends its own, falling through to Express only on
// a router miss (@colyseus/core/build/router/index.mjs:34-48). So an
// Express-only password would lock the WEB PAGE while leaving the GAME SERVER
// open to anyone pointing a client at the host — a facade, and a worse outcome
// than no gate at all, because it looks protected.
//
// So the gate has two halves that share ONE secret:
//   - this middleware, covering the page
//   - `stagingGateError()`, called from BOTH rooms' `static onAuth`, covering
//     matchmaking and therefore the socket (no seat, no room)
//
// It is deliberately the same shape as the PROTOCOL_VERSION gate that already
// lives in both those onAuth methods, for the same reason that one is
// duplicated: matchMaker.reserveSeatFor bypasses the arena's door entirely, so
// the queue's door has to carry its own copy or the check silently stops
// running for every real player.
//
// ONE COOKIE COVERS BOTH HALVES, AND THE CLIENT NEEDS NO CHANGE AT ALL.
// The browser gets a cookie so the page loads. The same cookie then rides the
// matchmaking request automatically: the Colyseus SDK posts to
// /matchmake/:method/:roomName with `credentials: "include"`
// (@colyseus/sdk/build/HTTP.mjs:161) and staging is same-origin, so the browser
// attaches it. Colyseus hands that request's headers to `static onAuth` as its
// THIRD argument (`AuthContext.headers`, a WHATWG Headers — see
// @colyseus/core/build/Room.d.ts:285 and Transport.d.ts:28), which this app was
// simply not reading before. So the game half reads the very same cookie the
// page half issued, and nothing in client/ has to know the gate exists.
//
// The cookie is NOT HttpOnly. Nothing reads it from JS today, but a non-browser
// client (a smoke script) may need to present it, and it guards a shared
// staging password rather than a per-person session — so the usual reason for
// HttpOnly (stopping XSS from stealing a credential unique to you) does not
// apply, while the flexibility does.
//
// WHAT IS STORED IS A DIGEST, NEVER THE PASSWORD. The cookie carries
// sha256(key), so the shared secret itself never sits in a cookie jar. It also
// makes ROTATION free: change HC_STAGING_KEY and every issued cookie stops
// matching at once, so everyone is re-prompted and any live client is refused
// at its next join. No redeploy of code, no per-person state to clean up.
//
// WHAT IT DOES NOT COVER, stated plainly: `/liveness` and `/metrics` are
// router-served and stay open (they carry player counts and ops counters, not
// game access, and the home screen polls /liveness). A mid-match RECONNECT also
// bypasses it, because matchMaker.reconnect() never calls onAuth — but the
// reconnection token can only exist if the gate let you in already. Both are
// the same posture the PROTOCOL_VERSION gate has always had.

import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

/** The cookie the browser holds and the client JS forwards. */
export const GATE_COOKIE = 'hc_gate';
/** Where the password is posted. Must stay reachable without the cookie. */
export const GATE_PATH = '/gate';
/** Refusal message for a client that presents no/!stale digest at matchmake. */
export const GATE_JOIN_ERROR =
  'this staging server is password-protected — open it in a browser and sign in first';

/** Empty (or unset) means the gate is OFF, which is how production runs. */
function stagingKey(): string {
  return process.env.HC_STAGING_KEY ?? '';
}

/** True only when a non-empty key is configured. */
export function gateEnabled(): boolean {
  return stagingKey().length > 0;
}

/** The value the cookie and the join option must carry: sha256 of the key. */
export function gateDigest(): string {
  return createHash('sha256').update(stagingKey()).digest('hex');
}

/** Constant-time compare of two hex digests of equal length. */
function digestMatches(candidate: string | undefined): boolean {
  if (!candidate) return false;
  const expected = gateDigest();
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
}

/** Pull one cookie out of a raw Cookie header without adding a dependency. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

/**
 * THE GAME-SIDE HALF. Returns a refusal message, or null to allow.
 *
 * Called from BOTH rooms' `static onAuth`, beside the PROTOCOL_VERSION gate and
 * for the same reason that one is duplicated: `matchMaker.reserveSeatFor`
 * bypasses the arena's door, so the queue carries the copy that runs for a
 * multiplayer player — while SOLO VS AI goes `client.create('arena')` and hits
 * the arena's door instead. Gating only one leaves the other wide open.
 *
 * Takes the raw Cookie header (`AuthContext.headers.get('cookie')`) rather than
 * an AuthContext, so it stays a pure string function that tests can drive.
 * Returns null when the gate is off, so production is untouched.
 */
export function stagingGateError(cookieHeader: string | undefined): string | null {
  if (!gateEnabled()) return null;
  if (!digestMatches(readCookie(cookieHeader, GATE_COOKIE))) return GATE_JOIN_ERROR;
  return null;
}

/** Deliberately plain — an ops page, not game chrome, so it invents no design
 *  tokens and imitates no part of the real UI. `autofocus` so it is one keypress
 *  and one Enter. */
function gatePage(failed: boolean): string {
  const note = failed
    ? '<p class="err">Wrong password.</p>'
    : '<p class="hint">This is a test server for Hullcracker.io.</p>';
  return `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Hullcracker.io — staging</title>
<style>
 body{background:#05080a;color:#c8d2d8;font:16px/1.5 system-ui,sans-serif;
      display:grid;place-items:center;min-height:100vh;margin:0}
 form{display:grid;gap:12px;width:min(320px,86vw)}
 h1{font:600 14px/1 system-ui,sans-serif;letter-spacing:.16em;margin:0 0 4px}
 input,button{font:inherit;padding:10px 12px;border-radius:4px;border:1px solid #2a3a42}
 input{background:#0b1216;color:#e6eef2}
 button{background:#1d2c34;color:#e6eef2;cursor:pointer}
 .err{color:#e0777c;margin:0}
 .hint{color:#6b7d87;margin:0}
</style>
<form method="POST" action="${GATE_PATH}">
 <h1>STAGING ACCESS</h1>
 ${note}
 <input type="password" name="password" autofocus autocomplete="current-password"
        aria-label="Staging password">
 <button type="submit">Enter</button>
</form>`;
}

/** Serialize the gate cookie. `Secure` only behind TLS so a local run works. */
function cookieHeader(req: Request): string {
  const https = req.headers['x-forwarded-proto'] === 'https';
  const attrs = [
    `${GATE_COOKIE}=${gateDigest()}`,
    'Path=/',
    'Max-Age=2592000', // 30 days; rotating the key invalidates it sooner
    'SameSite=Lax',
  ];
  if (https) attrs.push('Secure');
  return attrs.join('; ');
}

/** POST handler for the password form. */
export function handleGateSubmit(req: Request, res: Response): void {
  const body = req.body as { password?: unknown } | undefined;
  const supplied = typeof body?.password === 'string' ? body.password : '';
  const ok = digestMatches(createHash('sha256').update(supplied).digest('hex'));
  if (!ok) {
    res.status(401).type('html').send(gatePage(true));
    return;
  }
  res.setHeader('Set-Cookie', cookieHeader(req));
  res.redirect(302, '/');
}

/**
 * THE PAGE-SIDE HALF. Everything served by Express below this needs the cookie.
 * The gate route itself must stay open or there is no way to obtain one.
 */
export function stagingGateMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.path === GATE_PATH) {
    next();
    return;
  }
  if (digestMatches(readCookie(req.headers.cookie, GATE_COOKIE))) {
    next();
    return;
  }
  res.status(401).type('html').send(gatePage(false));
}
