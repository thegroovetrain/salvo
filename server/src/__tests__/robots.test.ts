// Cycle 127 — the HC_NOINDEX search-engine guard for the staging host.
//
// Two properties matter and they pull in opposite directions, so both are
// pinned here: the dev host MUST be excluded from search, and production MUST
// be byte-identical to before this existed. The second is the one a future
// edit is likely to break — flipping the default, or accepting a looser truthy
// test, would silently de-index hullcracker.io.

import { describe, it, expect, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { ROBOTS_TAG, noIndexEnabled, robotsTagMiddleware } from '../robots.js';

const ORIGINAL = process.env.HC_NOINDEX;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.HC_NOINDEX;
  else process.env.HC_NOINDEX = ORIGINAL;
});

/** Minimal express-shaped fake: records what the middleware set, and whether
 *  it handed the request onward. */
function fakeExchange() {
  const headers = new Map<string, string>();
  let nextCalls = 0;
  const res = {
    setHeader: (k: string, v: string) => {
      headers.set(k, v);
    },
  } as unknown as Response;
  const next: NextFunction = () => {
    nextCalls += 1;
  };
  return { res, next, headers, calls: () => nextCalls };
}

describe('noIndexEnabled', () => {
  it('is false when HC_NOINDEX is unset — production stays indexable', () => {
    delete process.env.HC_NOINDEX;
    expect(noIndexEnabled()).toBe(false);
  });

  it('is true only for the exact opt-in string', () => {
    process.env.HC_NOINDEX = '1';
    expect(noIndexEnabled()).toBe(true);
  });

  // A typo must fail toward PRODUCTION behaviour. If any truthy-ish string
  // enabled it, a stray HC_NOINDEX=0 on the real service would de-index the
  // live game, which is far worse than a staging host briefly being crawlable.
  it.each(['0', '', 'true', 'yes', 'noindex', ' 1'])(
    'is false for %o',
    (value) => {
      process.env.HC_NOINDEX = value;
      expect(noIndexEnabled()).toBe(false);
    },
  );

  it('reads the env lazily, so a flip takes effect without re-importing', () => {
    delete process.env.HC_NOINDEX;
    expect(noIndexEnabled()).toBe(false);
    process.env.HC_NOINDEX = '1';
    expect(noIndexEnabled()).toBe(true);
  });
});

describe('robotsTagMiddleware', () => {
  it('sets X-Robots-Tag to the noindex directive', () => {
    const { res, next, headers } = fakeExchange();
    robotsTagMiddleware({} as Request, res, next);
    expect(headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it('sends the exported directive, so the constant is the single source', () => {
    const { res, next, headers } = fakeExchange();
    robotsTagMiddleware({} as Request, res, next);
    expect(headers.get('X-Robots-Tag')).toBe(ROBOTS_TAG);
  });

  it('sets nothing else — it is a header stamp, not a response', () => {
    const { res, next, headers } = fakeExchange();
    robotsTagMiddleware({} as Request, res, next);
    expect([...headers.keys()]).toEqual(['X-Robots-Tag']);
  });

  it('always calls next exactly once, so it never swallows a request', () => {
    const { res, next, calls } = fakeExchange();
    robotsTagMiddleware({} as Request, res, next);
    expect(calls()).toBe(1);
  });
});
