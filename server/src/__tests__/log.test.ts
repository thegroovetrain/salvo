// The structured stdout logger (server/src/log.ts) — story 0.3's logging
// substrate. Everything else (metrics, ArenaRoom lifecycle lines) builds on
// this format contract, so it's pinned exactly: `level event {json}`, no
// timestamp, stdout via console.log.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logInfo, logWarn, logError, logDebug, createLogger } from '../log.js';

describe('logInfo/logWarn/logError — format exactness', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('logInfo renders "info event {json}" with no timestamp', () => {
    logInfo('match.end', { matchId: 'abc', rosterSize: 4 });
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('info match.end {"matchId":"abc","rosterSize":4}');
  });

  it('logWarn renders with the warn level word', () => {
    logWarn('room.optionsRejected', { rejectedKeys: ['matchOverride'] });
    expect(logSpy).toHaveBeenCalledWith('warn room.optionsRejected {"rejectedKeys":["matchOverride"]}');
  });

  it('logError renders with the error level word', () => {
    logError('tick.error', { tick: 42 });
    expect(logSpy).toHaveBeenCalledWith('error tick.error {"tick":42}');
  });

  it('defaults fields to {} when omitted', () => {
    logInfo('match.create');
    expect(logSpy).toHaveBeenCalledWith('info match.create {}');
  });

  it('info/warn/error always emit regardless of HC_DEBUG', () => {
    const prev = process.env.HC_DEBUG;
    delete process.env.HC_DEBUG;
    logInfo('a');
    logWarn('b');
    logError('c');
    expect(logSpy).toHaveBeenCalledTimes(3);
    if (prev === undefined) delete process.env.HC_DEBUG;
    else process.env.HC_DEBUG = prev;
  });
});

describe('logDebug — HC_DEBUG gating (checked lazily per call)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let prevDebug: string | undefined;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    prevDebug = process.env.HC_DEBUG;
  });

  afterEach(() => {
    logSpy.mockRestore();
    if (prevDebug === undefined) delete process.env.HC_DEBUG;
    else process.env.HC_DEBUG = prevDebug;
  });

  it('emits nothing when HC_DEBUG is unset', () => {
    delete process.env.HC_DEBUG;
    logDebug('tick.summary', { p50: 12 });
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('emits nothing when HC_DEBUG is set to a non-"1" value', () => {
    process.env.HC_DEBUG = 'true';
    logDebug('tick.summary', { p50: 12 });
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('emits when HC_DEBUG=1', () => {
    process.env.HC_DEBUG = '1';
    logDebug('tick.summary', { p50: 12 });
    expect(logSpy).toHaveBeenCalledWith('debug tick.summary {"p50":12}');
  });

  it('re-checks the env on every call — toggling mid-run takes effect immediately', () => {
    delete process.env.HC_DEBUG;
    logDebug('a');
    expect(logSpy).not.toHaveBeenCalled();

    process.env.HC_DEBUG = '1';
    logDebug('b');
    expect(logSpy).toHaveBeenCalledTimes(1);

    delete process.env.HC_DEBUG;
    logDebug('c');
    expect(logSpy).toHaveBeenCalledTimes(1);
  });
});

describe('createLogger — bound context + dynamic context', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.env.HC_DEBUG = '1';
  });

  afterEach(() => {
    logSpy.mockRestore();
    delete process.env.HC_DEBUG;
  });

  it('merges bound context into every line for all four levels', () => {
    const logger = createLogger({ roomId: 'r1', matchId: 'm1' });
    logger.info('match.end', { rosterSize: 2 });
    logger.warn('x');
    logger.error('y');
    logger.debug('z');

    expect(logSpy).toHaveBeenNthCalledWith(
      1,
      'info match.end {"roomId":"r1","matchId":"m1","rosterSize":2}',
    );
    expect(logSpy).toHaveBeenNthCalledWith(2, 'warn x {"roomId":"r1","matchId":"m1"}');
    expect(logSpy).toHaveBeenNthCalledWith(3, 'error y {"roomId":"r1","matchId":"m1"}');
    expect(logSpy).toHaveBeenNthCalledWith(4, 'debug z {"roomId":"r1","matchId":"m1"}');
  });

  it('call-site fields win over bound context on key collision', () => {
    const logger = createLogger({ tick: 1 });
    logger.info('e', { tick: 99 });
    expect(logSpy).toHaveBeenCalledWith('info e {"tick":99}');
  });

  it('invokes dynamic() fresh on every call so values reflect current state', () => {
    let tick = 0;
    const logger = createLogger({ roomId: 'r1' }, () => ({ tick }));

    tick = 5;
    logger.info('a');
    expect(logSpy).toHaveBeenNthCalledWith(1, 'info a {"roomId":"r1","tick":5}');

    tick = 6;
    logger.info('b');
    expect(logSpy).toHaveBeenNthCalledWith(2, 'info b {"roomId":"r1","tick":6}');
  });

  it('dynamic fields win over bound context but lose to call-site fields', () => {
    const logger = createLogger({ tick: 1 }, () => ({ tick: 2 }));
    logger.info('a');
    expect(logSpy).toHaveBeenNthCalledWith(1, 'info a {"tick":2}');

    logger.info('b', { tick: 3 });
    expect(logSpy).toHaveBeenNthCalledWith(2, 'info b {"tick":3}');
  });

  it('swallows a throwing dynamic() and still logs without its fields', () => {
    const logger = createLogger({ roomId: 'r1' }, () => {
      throw new Error('boom');
    });
    expect(() => logger.info('a', { extra: 1 })).not.toThrow();
    expect(logSpy).toHaveBeenCalledWith('info a {"roomId":"r1","extra":1}');
  });

  it('logger.debug respects HC_DEBUG gating same as the module-level function', () => {
    delete process.env.HC_DEBUG;
    const logger = createLogger({ roomId: 'r1' });
    logger.debug('tick.summary');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('does NOT invoke dynamic() for a gated-off debug call (gate before merge)', () => {
    delete process.env.HC_DEBUG;
    const dynamic = vi.fn(() => ({ tick: 7 }));
    const logger = createLogger({ roomId: 'r1' }, dynamic);
    logger.debug('tick.summary', { p50: 12 });
    // The gate must short-circuit before merge() runs — no wasted dynamic() call.
    expect(dynamic).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('DOES invoke dynamic() for a debug call when HC_DEBUG=1', () => {
    process.env.HC_DEBUG = '1';
    const dynamic = vi.fn(() => ({ tick: 7 }));
    const logger = createLogger({ roomId: 'r1' }, dynamic);
    logger.debug('tick.summary', { p50: 12 });
    expect(dynamic).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('debug tick.summary {"roomId":"r1","tick":7,"p50":12}');
  });
});

describe('unserializable fields — the logger never throws', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('falls back to a fixed marker payload on circular-reference fields', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => logInfo('e', circular)).not.toThrow();
    expect(logSpy).toHaveBeenCalledWith('info e {"logError":"unserializable-fields"}');
  });

  it('createLogger call also survives circular fields', () => {
    const logger = createLogger({ roomId: 'r1' });
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => logger.error('e', circular)).not.toThrow();
    expect(logSpy).toHaveBeenCalledWith('error e {"logError":"unserializable-fields"}');
  });
});
