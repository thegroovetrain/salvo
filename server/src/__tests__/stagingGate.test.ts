// Cycle 127 — the HC_STAGING_KEY shared-password gate for the staging host.
//
// The property that actually matters is that BOTH halves are covered by ONE
// secret, because the two doors into this app are served by different stacks:
// the page by Express, matchmaking by Colyseus's own request listener. A test
// suite that only exercised the middleware would pass while the game server sat
// wide open — which is the exact failure this feature exists to avoid.
//
// And, as with robots.ts, the inverse matters just as much: with the key unset,
// production must behave EXACTLY as it did before this existed.

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Request, Response, NextFunction } from 'express';
import {
  GATE_COOKIE,
  GATE_JOIN_ERROR,
  GATE_PATH,
  gateDigest,
  gateEnabled,
  handleGateSubmit,
  readCookie,
  stagingGateError,
  stagingGateMiddleware,
} from '../stagingGate.js';

const ORIGINAL = process.env.HC_STAGING_KEY;
const KEY = 'correct horse battery staple';

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.HC_STAGING_KEY;
  else process.env.HC_STAGING_KEY = ORIGINAL;
});

function enable(key = KEY): string {
  process.env.HC_STAGING_KEY = key;
  return gateDigest();
}

/** Minimal express-shaped fake capturing status, headers, body and next(). */
function fakeExchange(opts: { path?: string; cookie?: string; password?: unknown } = {}) {
  const headers = new Map<string, string>();
  const state = { status: 200, body: '', type: '', nextCalls: 0, redirect: '' };
  const req = {
    path: opts.path ?? '/',
    headers: { cookie: opts.cookie, 'x-forwarded-proto': 'https' },
    body: { password: opts.password },
  } as unknown as Request;
  const res = {
    status(code: number) {
      state.status = code;
      return this;
    },
    type(t: string) {
      state.type = t;
      return this;
    },
    send(b: string) {
      state.body = b;
      return this;
    },
    setHeader(k: string, v: string) {
      headers.set(k, v);
    },
    redirect(code: number, to: string) {
      state.status = code;
      state.redirect = to;
    },
  } as unknown as Response;
  const next: NextFunction = () => {
    state.nextCalls += 1;
  };
  return { req, res, next, headers, state };
}

describe('gateEnabled', () => {
  it('is false when HC_STAGING_KEY is unset — production runs open', () => {
    delete process.env.HC_STAGING_KEY;
    expect(gateEnabled()).toBe(false);
  });

  it('is false for an empty key, so a blank env var cannot half-enable it', () => {
    process.env.HC_STAGING_KEY = '';
    expect(gateEnabled()).toBe(false);
  });

  it('is true once a key is set', () => {
    enable();
    expect(gateEnabled()).toBe(true);
  });
});

describe('readCookie', () => {
  it('finds the cookie among several', () => {
    expect(readCookie('a=1; hc_gate=abc; z=9', GATE_COOKIE)).toBe('abc');
  });

  it('returns undefined for a missing cookie or absent header', () => {
    expect(readCookie('a=1; b=2', GATE_COOKIE)).toBeUndefined();
    expect(readCookie(undefined, GATE_COOKIE)).toBeUndefined();
  });

  // A cookie named `xhc_gate` must not satisfy a lookup for `hc_gate`.
  it('does not match on a name suffix', () => {
    expect(readCookie('xhc_gate=abc', GATE_COOKIE)).toBeUndefined();
  });

  it('tolerates whitespace and an empty value', () => {
    expect(readCookie('  hc_gate = abc ', GATE_COOKIE)).toBe('abc');
    expect(readCookie('hc_gate=', GATE_COOKIE)).toBe('');
  });
});

describe('stagingGateError — the GAME half', () => {
  it('allows everything when the gate is off', () => {
    delete process.env.HC_STAGING_KEY;
    expect(stagingGateError(undefined)).toBeNull();
    expect(stagingGateError('garbage')).toBeNull();
  });

  it('allows a request carrying the right cookie', () => {
    const digest = enable();
    expect(stagingGateError(`${GATE_COOKIE}=${digest}`)).toBeNull();
  });

  it('refuses a request with no cookie header at all', () => {
    enable();
    expect(stagingGateError(undefined)).toBe(GATE_JOIN_ERROR);
  });

  it('refuses a wrong or truncated digest', () => {
    const digest = enable();
    expect(stagingGateError(`${GATE_COOKIE}=nope`)).toBe(GATE_JOIN_ERROR);
    expect(stagingGateError(`${GATE_COOKIE}=${digest.slice(0, -1)}`)).toBe(GATE_JOIN_ERROR);
  });

  // ROTATION is the promise made in render.yaml: change the key and every
  // previously issued cookie stops working, with nothing else to clean up.
  it('refuses a cookie issued under the previous key after rotation', () => {
    const old = enable('first-password');
    expect(stagingGateError(`${GATE_COOKIE}=${old}`)).toBeNull();
    enable('second-password');
    expect(stagingGateError(`${GATE_COOKIE}=${old}`)).toBe(GATE_JOIN_ERROR);
  });

  it('never puts the password itself in the cookie value', () => {
    const digest = enable();
    expect(digest).not.toContain(KEY);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('stagingGateMiddleware — the PAGE half', () => {
  it('serves the password page with 401 when there is no cookie', () => {
    enable();
    const { req, res, next, state } = fakeExchange();
    stagingGateMiddleware(req, res, next);
    expect(state.status).toBe(401);
    expect(state.body).toContain('STAGING ACCESS');
    expect(state.nextCalls).toBe(0);
  });

  it('passes the request through when the cookie is valid', () => {
    const digest = enable();
    const { req, res, next, state } = fakeExchange({ cookie: `${GATE_COOKIE}=${digest}` });
    stagingGateMiddleware(req, res, next);
    expect(state.nextCalls).toBe(1);
    expect(state.body).toBe('');
  });

  // Otherwise there is no way to ever obtain a cookie.
  it('always lets the gate route itself through', () => {
    enable();
    const { req, res, next, state } = fakeExchange({ path: GATE_PATH });
    stagingGateMiddleware(req, res, next);
    expect(state.nextCalls).toBe(1);
  });

  it('marks its own password page noindex', () => {
    enable();
    const { req, res, next, state } = fakeExchange();
    stagingGateMiddleware(req, res, next);
    expect(state.body).toContain('noindex');
  });
});

describe('handleGateSubmit', () => {
  it('sets the cookie and redirects on the right password', () => {
    const digest = enable();
    const { req, res, headers, state } = fakeExchange({ password: KEY });
    handleGateSubmit(req, res);
    expect(state.status).toBe(302);
    expect(state.redirect).toBe('/');
    const cookie = headers.get('Set-Cookie') ?? '';
    expect(cookie).toContain(`${GATE_COOKIE}=${digest}`);
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure'); // the fake sends x-forwarded-proto: https
  });

  it('re-serves the form with an error on a wrong password, setting no cookie', () => {
    enable();
    const { req, res, headers, state } = fakeExchange({ password: 'wrong' });
    handleGateSubmit(req, res);
    expect(state.status).toBe(401);
    expect(state.body).toContain('Wrong password');
    expect(headers.get('Set-Cookie')).toBeUndefined();
  });

  it('refuses a missing or non-string password without throwing', () => {
    enable();
    for (const password of [undefined, 42, null, {}]) {
      const { req, res, headers, state } = fakeExchange({ password });
      handleGateSubmit(req, res);
      expect(state.status).toBe(401);
      expect(headers.get('Set-Cookie')).toBeUndefined();
    }
  });

  // The empty string must not authenticate against an enabled gate.
  it('refuses an empty password', () => {
    enable();
    const { req, res, state } = fakeExchange({ password: '' });
    handleGateSubmit(req, res);
    expect(state.status).toBe(401);
  });
});

// STRUCTURAL PINS. The unit tests above cannot see whether the gate is actually
// WIRED to both doors, and a gate wired to only one is the failure mode that
// looks fine in every other test.
describe('both doors are wired', () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const read = (p: string) => readFileSync(resolve(dir, p), 'utf-8');

  it.each([
    ['../rooms/StandardQueueRoom.ts', 'the queue door (multiplayer)'],
    ['../rooms/ArenaRoom.ts', 'the arena door (SOLO VS AI)'],
  ])('%s calls stagingGateError in static onAuth — %s', (file) => {
    const src = read(file);
    expect(src).toContain('stagingGateError(');
    // It must read the request cookie, not a client-supplied join option: an
    // option is attacker-chosen, the cookie header is not forgeable by the page.
    expect(src).toMatch(/stagingGateError\(context\?\.headers\?\.get\('cookie'\)/);
  });

  it('the arena checks the gate BEFORE honouring solo:true', () => {
    // Otherwise `solo:true` walks straight past the gate onto the staging host.
    const src = read('../rooms/ArenaRoom.ts');
    expect(src.indexOf('stagingGateError(')).toBeLessThan(src.indexOf('options?.solo === true'));
  });

  it('app.config.ts mounts the page half behind gateEnabled(), before static', () => {
    const src = read('../app.config.ts');
    const mount = src.indexOf('app.use(stagingGateMiddleware)');
    const post = src.indexOf('app.post(GATE_PATH');
    const staticMount = src.indexOf('app.use(express.static(');
    expect(mount).toBeGreaterThan(-1);
    expect(src.slice(Math.max(0, mount - 300), mount)).toMatch(/if \(gated/);
    // The POST route must be registered BEFORE the blocking middleware.
    expect(post).toBeLessThan(mount);
    expect(mount).toBeLessThan(staticMount);
  });
});
