// Portal seam contracts: the null adapter (portal/nullAdapter.ts) is callable
// and always settles, and safeAdapter (portal/safeAdapter.ts) makes ANY
// adapter — throwing, rejecting, or hanging — safe for the game to call. The
// DOM-bound wiring in main.ts (boot bracket, match edges, returnToPort
// ad-break) is left to typecheck + smoke per the spec.

import { describe, it, expect } from 'vitest';
import { createNullAdapter } from '../portal/nullAdapter.js';
import { safeAdapter } from '../portal/safeAdapter.js';
import type { PortalAdapter } from '../portal/portalAdapter.js';

describe('createNullAdapter — no-throw / always-settle contract', () => {
  it('init() resolves', async () => {
    const portal: PortalAdapter = createNullAdapter();
    await expect(portal.init()).resolves.toBeUndefined();
  });

  it('requestAdBreak() resolves (caller can await death→requeue safely)', async () => {
    const portal = createNullAdapter();
    await expect(portal.requestAdBreak()).resolves.toBeUndefined();
  });

  it('the void lifecycle methods return nothing and never throw', () => {
    const portal = createNullAdapter();
    expect(portal.matchStart()).toBeUndefined();
    expect(portal.matchEnd()).toBeUndefined();
    expect(() => portal.matchStart()).not.toThrow();
    expect(() => portal.matchEnd()).not.toThrow();
  });

  it('loadingProgress accepts the bracket endpoints 0 and 1 (and mid values)', () => {
    const portal = createNullAdapter();
    expect(() => portal.loadingProgress(0)).not.toThrow();
    expect(() => portal.loadingProgress(1)).not.toThrow();
    expect(() => portal.loadingProgress(0.5)).not.toThrow();
    expect(portal.loadingProgress(0)).toBeUndefined();
  });

  it('is safe to call repeatedly — no per-instance latch or throw on re-entry', async () => {
    const portal = createNullAdapter();
    portal.matchStart();
    portal.matchStart();
    portal.matchEnd();
    portal.matchEnd();
    await expect(portal.requestAdBreak()).resolves.toBeUndefined();
    await expect(portal.requestAdBreak()).resolves.toBeUndefined();
  });

  it('each call builds an independent adapter object', () => {
    expect(createNullAdapter()).not.toBe(createNullAdapter());
  });
});

/** An adapter violating the whole contract: every method throws or rejects. */
function hostileAdapter(): PortalAdapter {
  return {
    init: () => Promise.reject(new Error('init rejected')),
    loadingProgress: () => {
      throw new Error('loadingProgress threw');
    },
    matchStart: () => {
      throw new Error('matchStart threw');
    },
    matchEnd: () => {
      throw new Error('matchEnd threw');
    },
    requestAdBreak: () => {
      throw new Error('requestAdBreak threw synchronously');
    },
  };
}

describe('safeAdapter — the game side of the seam survives any adapter', () => {
  it('swallows synchronous throws from the void methods', () => {
    const portal = safeAdapter(hostileAdapter());
    expect(() => portal.loadingProgress(0.5)).not.toThrow();
    expect(() => portal.matchStart()).not.toThrow();
    expect(() => portal.matchEnd()).not.toThrow();
  });

  it('resolves init() even when the inner adapter rejects', async () => {
    const portal = safeAdapter(hostileAdapter());
    await expect(portal.init()).resolves.toBeUndefined();
  });

  it('resolves requestAdBreak() even on synchronous throw or rejection', async () => {
    const throwing = safeAdapter(hostileAdapter());
    await expect(throwing.requestAdBreak()).resolves.toBeUndefined();
    const rejecting = safeAdapter({
      ...createNullAdapter(),
      requestAdBreak: () => Promise.reject(new Error('ad failed')),
    });
    await expect(rejecting.requestAdBreak()).resolves.toBeUndefined();
  });

  it('caps a hanging requestAdBreak() with the timeout so the player is never stranded', async () => {
    const hanging = safeAdapter(
      { ...createNullAdapter(), requestAdBreak: () => new Promise<void>(() => undefined) },
      10,
    );
    await expect(hanging.requestAdBreak()).resolves.toBeUndefined();
  });

  it('passes calls and arguments through to a well-behaved adapter', async () => {
    const calls: Array<string | number> = [];
    const portal = safeAdapter({
      init: () => {
        calls.push('init');
        return Promise.resolve();
      },
      loadingProgress: (fraction) => {
        calls.push(fraction);
      },
      matchStart: () => {
        calls.push('matchStart');
      },
      matchEnd: () => {
        calls.push('matchEnd');
      },
      requestAdBreak: () => {
        calls.push('adBreak');
        return Promise.resolve();
      },
    });
    await portal.init();
    portal.loadingProgress(0);
    portal.loadingProgress(1);
    portal.matchStart();
    portal.matchEnd();
    await portal.requestAdBreak();
    expect(calls).toEqual(['init', 0, 1, 'matchStart', 'matchEnd', 'adBreak']);
  });
});
