// HULL CONTACT legibility (render/contactFx.ts, Story 9.5 — epic-9 amendment
// 79): the strike spark fires once per contact EDGE over the allowance (hull
// pair or land), the grind scrape retriggers while a contact slides and stops
// after its release, and motion off removes the sparks but not the sound.
// Every threshold is read from CONFIG.ram / CLIENT_CONFIG.contactFx.

import { describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { CONFIG, type HullContact } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { ContactFx, type ContactFxLand, type ContactFxOwn } from '../render/contactFx.js';
import { bleedSpeed } from '../sim/contactBleed.js';

const FX = CLIENT_CONFIG.contactFx;
const ALLOW = CONFIG.ram.allowanceU;
const OWN: ContactFxOwn = { id: 'me', x: 0, y: 0, heading: 0, color: 0x00ff00, halfBeamU: 4.5, halfLengthU: 50 };
const NO_LAND: ContactFxLand = { contact: false, headOn: 0, speed: 0 };
const color = (): number => 0xff0000;

function row(other: string, vn: number, vt = 0): HullContact {
  return { a: 'me' < other ? 'me' : other, b: 'me' < other ? other : 'me', nx: 0, ny: 1, vn, vt };
}

function fx(): { fx: ContactFx; grind: ReturnType<typeof vi.fn> } {
  const grind = vi.fn();
  return { fx: new ContactFx(new Container(), grind), grind };
}

describe('ContactFx — the strike spark', () => {
  it('fires once on the edge a pair first touches, not on every frame of the press', () => {
    const { fx: f } = fx();
    f.update(0, OWN, [row('foe', ALLOW + 10)], NO_LAND, color, true);
    expect(f.sparkCount).toBe(FX.sparkCount);
    f.update(16, OWN, [row('foe', ALLOW + 10)], NO_LAND, color, true);
    f.update(32, OWN, [row('foe', ALLOW + 10)], NO_LAND, color, true);
    expect(f.sparkCount).toBe(FX.sparkCount);
    // Separate, then touch again: a new contact, a new burst.
    f.update(48, OWN, [], NO_LAND, color, true);
    f.update(64, OWN, [row('foe', ALLOW + 10)], NO_LAND, color, true);
    expect(f.sparkCount).toBe(2 * FX.sparkCount);
  });

  it('does not fire at or under the allowance', () => {
    const { fx: f } = fx();
    f.update(0, OWN, [row('foe', ALLOW)], NO_LAND, color, true);
    expect(f.sparkCount).toBe(0);
  });

  it('a touch that began soft does not spark later in the same press', () => {
    const { fx: f } = fx();
    f.update(0, OWN, [row('foe', 0)], NO_LAND, color, true);
    f.update(16, OWN, [row('foe', ALLOW + 10)], NO_LAND, color, true);
    expect(f.sparkCount).toBe(0);
  });

  it('fires on the land edge over the allowance, once, and not under it', () => {
    const { fx: f } = fx();
    const strike: ContactFxLand = { contact: true, headOn: 1, speed: ALLOW + 10 };
    f.update(0, OWN, [], strike, color, true);
    expect(f.sparkCount).toBe(FX.sparkCount);
    f.update(16, OWN, [], strike, color, true);
    expect(f.sparkCount).toBe(FX.sparkCount);

    const { fx: soft } = fx();
    soft.update(0, OWN, [], { contact: true, headOn: 0.5, speed: (2 * ALLOW) * 0.9 }, color, true);
    expect(soft.sparkCount).toBe(0);
  });

  it('sparks die after their life', () => {
    const { fx: f } = fx();
    f.update(0, OWN, [row('foe', ALLOW + 10)], NO_LAND, color, true);
    f.update(FX.sparkLifeMs, OWN, [row('foe', ALLOW + 10)], NO_LAND, color, true);
    expect(f.sparkCount).toBe(0);
  });

  it('motion off throws no sparks (and does not save the edge for later)', () => {
    const { fx: f } = fx();
    f.update(0, OWN, [row('foe', ALLOW + 10)], { contact: true, headOn: 1, speed: ALLOW + 10 }, color, false);
    expect(f.sparkCount).toBe(0);
    f.update(16, OWN, [row('foe', ALLOW + 10)], { contact: true, headOn: 1, speed: ALLOW + 10 }, color, true);
    expect(f.sparkCount).toBe(0);
  });

  it('with no own hull nothing fires and the edges re-arm', () => {
    const { fx: f } = fx();
    f.update(0, OWN, [row('foe', ALLOW + 10)], NO_LAND, color, true);
    f.update(16, null, [row('foe', ALLOW + 10)], NO_LAND, color, true);
    expect(f.sparkCount).toBe(FX.sparkCount);
    f.update(32, OWN, [row('foe', ALLOW + 10)], NO_LAND, color, true);
    expect(f.sparkCount).toBe(2 * FX.sparkCount);
  });
});

describe('ContactFx — the grind scrape', () => {
  const sliding = [row('foe', 0, FX.grindMinVt + 10)];

  it('starts on the first sliding frame and retriggers on its cadence', () => {
    const { fx: f, grind } = fx();
    f.update(0, OWN, sliding, NO_LAND, color, true);
    expect(grind).toHaveBeenCalledTimes(1);
    f.update(FX.grindRetriggerMs / 2, OWN, sliding, NO_LAND, color, true);
    expect(grind).toHaveBeenCalledTimes(1);
    f.update(FX.grindRetriggerMs, OWN, sliding, NO_LAND, color, true);
    expect(grind).toHaveBeenCalledTimes(2);
  });

  it('stays silent at or under the bleed threshold', () => {
    const { fx: f, grind } = fx();
    f.update(0, OWN, [row('foe', 0, FX.grindMinVt)], NO_LAND, color, true);
    expect(grind).not.toHaveBeenCalled();
  });

  it('stops once nothing has slid for the release window', () => {
    const { fx: f, grind } = fx();
    f.update(0, OWN, sliding, NO_LAND, color, true);
    const t = FX.grindReleaseMs + FX.grindRetriggerMs + 1;
    f.update(t, OWN, [], NO_LAND, color, true);
    f.update(t + FX.grindRetriggerMs, OWN, [], NO_LAND, color, true);
    expect(grind).toHaveBeenCalledTimes(1);
  });

  it('scales the gain with the sliding speed, capped at full', () => {
    const { fx: f, grind } = fx();
    f.update(0, OWN, [row('foe', 0, FX.grindFullVt / 2)], NO_LAND, color, true);
    f.update(FX.grindRetriggerMs, OWN, [row('foe', 0, FX.grindFullVt * 3)], NO_LAND, color, true);
    expect(grind.mock.calls[0][0]).toBeCloseTo(0.5, 9);
    expect(grind.mock.calls[1][0]).toBe(1);
  });

  it('plays at motion off — the sound is not motion', () => {
    const { fx: f, grind } = fx();
    f.update(0, OWN, sliding, NO_LAND, color, false);
    expect(grind).toHaveBeenCalledTimes(1);
  });

  it('a hull sliding along a coast grinds by its tangential speed', () => {
    const land: ContactFxLand = { contact: true, headOn: 0.6, speed: 50 };
    expect(bleedSpeed([], land)).toBeCloseTo(50 * 0.8, 9);
    expect(bleedSpeed([], { ...land, contact: false })).toBe(0);
  });

  // Amendment 83: a sustained push bleeds like a scrape — a hull row grinds
  // by `vt + vn`, so a head-on press with no slide keeps the tone.
  it('a head-on PRESS above the threshold keeps the tone; below it, silence', () => {
    const { fx: f, grind } = fx();
    const press = [row('foe', FX.grindMinVt + 1, 0)];
    f.update(0, OWN, press, NO_LAND, color, true);
    f.update(FX.grindRetriggerMs, OWN, press, NO_LAND, color, true);
    expect(grind).toHaveBeenCalledTimes(2);
    const { fx: g, grind: quiet } = fx();
    g.update(0, OWN, [row('foe', FX.grindMinVt - 1, 0)], NO_LAND, color, true);
    expect(quiet).not.toHaveBeenCalled();
  });

  it('a hull row bleeds by vt + vn; the coast stays sliding-only', () => {
    expect(bleedSpeed([row('foe', 3, 4)], NO_LAND)).toBe(7);
    expect(bleedSpeed([], { contact: true, headOn: 1, speed: 50 })).toBe(0);
  });
});
