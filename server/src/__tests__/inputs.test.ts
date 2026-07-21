import { describe, it, expect } from 'vitest';
import { CONFIG, SLOT_COUNT } from '@salvo/shared';
import {
  InputStore,
  clampFireTime,
  sanitizeInput,
  neutralInput,
  AIM_DIST_MAX,
  INPUT_RATE_CAP,
  INPUT_RATE_WINDOW_MS,
  type FireTimeClaim,
} from '../game/inputs.js';

const valid = (seq = 1) => ({
  seq,
  throttle: 1,
  rudder: -0.5,
  aim: 0.25,
  fireSeq: 3,
  aimDist: 240,
  slot: 0,
  fireT: 850,
  actSeq: 5,
  actSlot: 2,
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
    ['missing fireT', { ...valid(), fireT: undefined }],
    ['NaN fireT', { ...valid(), fireT: NaN }],
    ['Infinity fireT', { ...valid(), fireT: Infinity }],
    ['-Infinity fireT', { ...valid(), fireT: -Infinity }],
    ['string fireT', { ...valid(), fireT: '850' }],
    ['negative fireT (whole message drops — the sanitize law)', { ...valid(), fireT: -1 }],
    // Story 1.6 ability-activation fields: strict monotonic-counter + slot-index
    // sanitize, whole message dropped on anything malformed.
    ['missing actSeq', { ...valid(), actSeq: undefined }],
    ['NaN actSeq', { ...valid(), actSeq: NaN }],
    ['Infinity actSeq', { ...valid(), actSeq: Infinity }],
    ['negative actSeq', { ...valid(), actSeq: -1 }],
    ['fractional actSeq', { ...valid(), actSeq: 1.5 }],
    ['string actSeq', { ...valid(), actSeq: '5' }],
    ['boolean actSeq', { ...valid(), actSeq: true }],
    ['missing actSlot', { ...valid(), actSlot: undefined }],
    ['actSlot out of range (7)', { ...valid(), actSlot: 7 }],
    ['actSlot just past the last index', { ...valid(), actSlot: 4 }],
    ['negative actSlot', { ...valid(), actSlot: -1 }],
    ['fractional actSlot', { ...valid(), actSlot: 1.5 }],
    ['NaN actSlot', { ...valid(), actSlot: NaN }],
    ['Infinity actSlot', { ...valid(), actSlot: Infinity }],
    ['string actSlot', { ...valid(), actSlot: '1' }],
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

  it('AIM_DIST_MAX is a map-scale transport bound (4× base map radius), NOT a weapon stat', () => {
    // Map-scale, so stacked gunRange upgrades (which can briefly outrange radar)
    // never get silently clamped at the transport layer; the real clamp to
    // effective gun range is per-shot in equipment/guns.ts.
    expect(AIM_DIST_MAX).toBe(4 * CONFIG.map.baseRadius);
    expect(AIM_DIST_MAX).toBeGreaterThan(CONFIG.vision.radar); // admits any radar-range click unclamped
    expect(sanitizeInput({ ...valid(), aimDist: CONFIG.vision.radar }, 0)?.aimDist).toBe(CONFIG.vision.radar);
  });

  it('accepts every in-range integer slot 0..SLOT_COUNT-1', () => {
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      expect(sanitizeInput({ ...valid(), slot }, 0)?.slot).toBe(slot);
    }
  });

  it('accepts the actSeq sentinel (0) and positive counters verbatim; every in-range actSlot', () => {
    expect(sanitizeInput({ ...valid(), actSeq: 0 }, 0)?.actSeq).toBe(0);
    expect(sanitizeInput({ ...valid(), actSeq: 42 }, 0)?.actSeq).toBe(42);
    for (let actSlot = 0; actSlot < SLOT_COUNT; actSlot++) {
      expect(sanitizeInput({ ...valid(), actSlot }, 0)?.actSlot).toBe(actSlot);
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

  it('accepts the fireT sentinel (0) and positive claims verbatim', () => {
    expect(sanitizeInput({ ...valid(), fireT: 0 }, 0)?.fireT).toBe(0);
    expect(sanitizeInput({ ...valid(), fireT: 123.5 }, 0)?.fireT).toBe(123.5);
  });
});

// ---------- clampFireTime — the D1 trust boundary, tested by table ------------

describe('clampFireTime', () => {
  /** Baseline claim: now=1000, honest 40ms RTT, CONFIG-shaped knobs. */
  const base = (over: Partial<FireTimeClaim> = {}): FireTimeClaim => ({
    claimed: 960,
    now: 1000,
    rttMs: 40,
    jitterMs: 30,
    ceilingMs: 150,
    prevFireT: 0,
    ...over,
  });

  it('sentinel (claimed 0 or negative) => fire at now, zero compensation', () => {
    expect(clampFireTime(base({ claimed: 0 }))).toBe(1000);
    expect(clampFireTime(base({ claimed: -50 }))).toBe(1000);
  });

  it('honest claim within the allowance is honored in full', () => {
    // 40ms ago, RTT 40 + jitter 30 allows up to 70 => full 40ms back-date.
    expect(clampFireTime(base({ claimed: 960 }))).toBe(960);
  });

  it('jitter allowance grants headroom beyond the raw RTT', () => {
    // 60ms ago with RTT 40: raw RTT alone would clamp, +30 jitter admits it.
    expect(clampFireTime(base({ claimed: 940 }))).toBe(940);
  });

  it('LIAR: claims 150ms ago on a measured 40ms RTT => clamped to RTT+jitter (70)', () => {
    expect(clampFireTime(base({ claimed: 850 }))).toBe(930);
  });

  it('a FUTURE claim compensates nothing (comp clamps at 0, result = now)', () => {
    expect(clampFireTime(base({ claimed: 1200 }))).toBe(1000);
  });

  it('the hard ceiling caps even a huge measured RTT', () => {
    // RTT 500 + jitter 30 = 530, ceiling 150 wins; claim 600ms ago => now-150.
    expect(clampFireTime(base({ claimed: 400, rttMs: 500 }))).toBe(850);
  });

  it('null RTT (never measured) => zero compensation regardless of the claim', () => {
    expect(clampFireTime(base({ claimed: 850, rttMs: null }))).toBe(1000);
  });

  it('never earlier than the previous accepted fire (THE monotonicity floor)', () => {
    // Candidate 930 (the liar clamp) floored up to the previous accepted fire.
    expect(clampFireTime(base({ claimed: 850, prevFireT: 940 }))).toBe(940);
    // The floor also binds the never-measured and sentinel branches.
    expect(clampFireTime(base({ claimed: 850, rttMs: null, prevFireT: 1005 }))).toBe(1005);
  });

  it('the floor never pushes the result past an honest candidate that already clears it', () => {
    expect(clampFireTime(base({ claimed: 960, prevFireT: 910 }))).toBe(960);
  });

  it('AR3 purpose (removes the input-delay penalty): an honest 150ms client streaming at the 50ms cadence gets FULL min(RTT+jitter, ceiling) compensation', () => {
    // Adjudicated 2026-07-21: "never earlier than the previous input" binds to
    // the previous input's carried fire-time (prevFireT), NOT its server-apply
    // time. A server-apply floor would sit ~50ms behind `now` for any client
    // streaming inputs every 50ms, capping compensation at ~one input interval
    // and granting input-throttlers MORE back-dating than honest streamers.
    // Honest 150ms-RTT streamer: claim is 150ms old, last accepted fire long
    // ago => full allowance min(150 + 30, 150) = 150 back-dates to now - 150.
    expect(clampFireTime(base({ claimed: 850, rttMs: 150, prevFireT: 400 }))).toBe(850);
    // Same client, inputs still streaming (a fresh input applied ~50ms ago
    // changes NOTHING — no apply-time floor exists to eat the compensation).
    expect(clampFireTime(base({ claimed: 850, rttMs: 150, prevFireT: 700 }))).toBe(850);
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

  it('neutralInput is a fresh zeroed input (fireT 0 = the no-claim sentinel)', () => {
    const a = neutralInput();
    expect(a).toEqual({
      seq: 0, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0,
    });
    expect(neutralInput()).not.toBe(a);
  });
});
