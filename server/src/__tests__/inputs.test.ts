import { describe, it, expect } from 'vitest';
import { CONFIG, SLOT_COUNT } from '@salvo/shared';
import {
  InputStore,
  sanitizeInput,
  neutralInput,
  AIM_DIST_MAX,
  INPUT_RATE_CAP,
  INPUT_RATE_WINDOW_MS,
} from '../game/inputs.js';

const valid = (seq = 1) => ({
  seq,
  throttle: 1,
  rudder: -0.5,
  aim: 0.25,
  fireSeq: 3,
  aimDist: 240,
  slot: 0,
});

describe('sanitizeInput — validation table', () => {
  it('accepts a well-formed message', () => {
    expect(sanitizeInput(valid(), 0)).toEqual(valid());
  });

  const rejects: Array<[string, unknown]> = [
    ['null', null],
    ['undefined', undefined],
    ['a string', 'i'],
    ['a number', 42],
    ['missing seq', { ...valid(), seq: undefined }],
    ['missing throttle', { ...valid(), throttle: undefined }],
    ['missing rudder', { ...valid(), rudder: undefined }],
    ['missing aim', { ...valid(), aim: undefined }],
    ['missing fireSeq', { ...valid(), fireSeq: undefined }],
    ['missing aimDist', { ...valid(), aimDist: undefined }],
    ['missing slot', { ...valid(), slot: undefined }],
    ['NaN seq', { ...valid(), seq: NaN }],
    ['NaN throttle', { ...valid(), throttle: NaN }],
    ['NaN rudder', { ...valid(), rudder: NaN }],
    ['NaN aim', { ...valid(), aim: NaN }],
    ['NaN fireSeq', { ...valid(), fireSeq: NaN }],
    ['NaN aimDist', { ...valid(), aimDist: NaN }],
    ['Infinity throttle', { ...valid(), throttle: Infinity }],
    ['-Infinity aim', { ...valid(), aim: -Infinity }],
    ['Infinity fireSeq', { ...valid(), fireSeq: Infinity }],
    ['Infinity aimDist', { ...valid(), aimDist: Infinity }],
    ['string throttle', { ...valid(), throttle: '1' }],
    ['string fireSeq', { ...valid(), fireSeq: '3' }],
    ['boolean fireSeq (old wire shape)', { ...valid(), fireSeq: true }],
    ['string aimDist', { ...valid(), aimDist: '240' }],
    ['slot out of range (7)', { ...valid(), slot: 7 }],
    ['slot just past the last index', { ...valid(), slot: 4 }],
    ['negative slot', { ...valid(), slot: -1 }],
    ['fractional slot', { ...valid(), slot: 1.5 }],
    ['NaN slot', { ...valid(), slot: NaN }],
    ['Infinity slot', { ...valid(), slot: Infinity }],
    ['string slot', { ...valid(), slot: '1' }],
  ];
  it.each(rejects)('drops %s', (_label, raw) => {
    expect(sanitizeInput(raw, 0)).toBeNull();
  });

  it('clamps throttle and rudder to [-1, 1]', () => {
    const out = sanitizeInput({ ...valid(), throttle: 5, rudder: -3 }, 0);
    expect(out?.throttle).toBe(1);
    expect(out?.rudder).toBe(-1);
  });

  it('floors fireSeq to an integer and clamps negatives to 0', () => {
    expect(sanitizeInput({ ...valid(), fireSeq: 2.9 }, 0)?.fireSeq).toBe(2);
    expect(sanitizeInput({ ...valid(), fireSeq: -7 }, 0)?.fireSeq).toBe(0);
    expect(sanitizeInput({ ...valid(), fireSeq: -0.5 }, 0)?.fireSeq).toBe(0);
    expect(sanitizeInput({ ...valid(), fireSeq: 0 }, 0)?.fireSeq).toBe(0);
  });

  it('does NOT enforce fireSeq monotonicity (consumption handles staleness)', () => {
    // seq 1 with fireSeq 9 accepted, then seq 2 with fireSeq 3 also accepted —
    // the World's lastFireSeq = max(...) makes the lower value a harmless no-op.
    expect(sanitizeInput({ ...valid(1), fireSeq: 9 }, 0)?.fireSeq).toBe(9);
    expect(sanitizeInput({ ...valid(2), fireSeq: 3 }, 1)?.fireSeq).toBe(3);
  });

  it('clamps aimDist into [0, AIM_DIST_MAX] (static sanity bound)', () => {
    expect(sanitizeInput({ ...valid(), aimDist: -50 }, 0)?.aimDist).toBe(0);
    expect(sanitizeInput({ ...valid(), aimDist: AIM_DIST_MAX + 1 }, 0)?.aimDist).toBe(AIM_DIST_MAX);
    expect(sanitizeInput({ ...valid(), aimDist: 123.5 }, 0)?.aimDist).toBe(123.5);
  });

  it('AIM_DIST_MAX admits a radar-range click unclamped (gun range = radar range)', () => {
    expect(AIM_DIST_MAX).toBe(2 * CONFIG.vision.radar);
    expect(sanitizeInput({ ...valid(), aimDist: CONFIG.vision.radar }, 0)?.aimDist).toBe(CONFIG.vision.radar);
  });

  it('accepts every in-range integer slot 0..SLOT_COUNT-1', () => {
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      expect(sanitizeInput({ ...valid(), slot }, 0)?.slot).toBe(slot);
    }
  });

  it('wraps aim into [-pi, pi)', () => {
    const out = sanitizeInput({ ...valid(), aim: 3 * Math.PI }, 0);
    expect(out?.aim).toBeGreaterThanOrEqual(-Math.PI);
    expect(out?.aim).toBeLessThan(Math.PI);
    expect(Math.cos(out!.aim)).toBeCloseTo(Math.cos(3 * Math.PI), 10);
    expect(Math.sin(out!.aim)).toBeCloseTo(Math.sin(3 * Math.PI), 10);
  });

  it('drops stale and duplicate seqs', () => {
    expect(sanitizeInput(valid(5), 5)).toBeNull(); // equal = stale
    expect(sanitizeInput(valid(4), 5)).toBeNull(); // older = stale
    expect(sanitizeInput(valid(6), 5)).not.toBeNull();
  });
});

describe('InputStore', () => {
  it('keeps the latest input and echoes its seq as ack', () => {
    const store = new InputStore();
    expect(store.ackFor('a')).toBe(0);
    expect(store.submit('a', valid(1), 0)).toBe(true);
    expect(store.submit('a', { ...valid(2), throttle: -1 }, 0)).toBe(true);
    expect(store.get('a')?.throttle).toBe(-1);
    expect(store.ackFor('a')).toBe(2);
  });

  it('rejects a stale seq without disturbing the stored input', () => {
    const store = new InputStore();
    store.submit('a', valid(3), 0);
    expect(store.submit('a', valid(2), 0)).toBe(false);
    expect(store.ackFor('a')).toBe(3);
  });

  it('rate-caps at 40 messages per second per client', () => {
    const store = new InputStore();
    for (let i = 1; i <= INPUT_RATE_CAP; i++) {
      expect(store.submit('a', valid(i), 0)).toBe(true);
    }
    expect(store.submit('a', valid(INPUT_RATE_CAP + 1), 0)).toBe(false);
    // a different client is unaffected
    expect(store.submit('b', valid(1), 0)).toBe(true);
    // window rolls over
    expect(store.submit('a', valid(INPUT_RATE_CAP + 2), INPUT_RATE_WINDOW_MS)).toBe(true);
  });

  it('malformed messages still count against the rate cap', () => {
    const store = new InputStore();
    for (let i = 0; i < INPUT_RATE_CAP; i++) {
      store.submit('a', null, 0);
    }
    expect(store.submit('a', valid(1), 0)).toBe(false);
  });

  it('remove() forgets the client', () => {
    const store = new InputStore();
    store.submit('a', valid(9), 0);
    store.remove('a');
    expect(store.get('a')).toBeUndefined();
    expect(store.ackFor('a')).toBe(0);
    expect(store.submit('a', valid(1), 0)).toBe(true); // seq counter reset
  });

  it('neutralInput is a fresh zeroed input', () => {
    const a = neutralInput();
    expect(a).toEqual({ seq: 0, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0 });
    expect(neutralInput()).not.toBe(a);
  });
});
