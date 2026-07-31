// THE OWN-FIRE LATCH (Story 2.9 review) — the click-time claim main.ts holds so
// a reveal landing on our own bow can be attributed to the weapon that made it.
//
// Three rules, and every one of them exists because the alternative is the
// client TELLING THE PLAYER SOMETHING FALSE about what is in the water:
//   • one click is one round, so exactly ONE reveal may wear the claim;
//   • the claim goes stale, so a shot from a second ago cannot dress a reveal;
//   • death/respawn drops it, so the previous life's click cannot dress the
//     first reveal of the next one.

import { describe, expect, it } from 'vitest';
import { OWN_FIRE_WINDOW_MS, OwnFireLatch, isBallisticFire } from '../sim/ownFire';

describe('OwnFireLatch — the one-shot claim', () => {
  it('hands the claim to the FIRST reveal and to nothing after it', () => {
    const latch = new OwnFireLatch();
    latch.latch('cannon', 1000);
    expect(latch.claim(1000)).toBe('cannon');
    // A second shell inside the same window — ours only if we fired twice, and
    // we did not. Before this rule, ONE cannon click dressed every own-looking
    // reveal for the next 400ms, enemy shells on our bow included.
    expect(latch.claim(1000)).toBeNull();
    expect(latch.claim(1200)).toBeNull();
  });

  it('is re-armed by the next click, and only by it', () => {
    const latch = new OwnFireLatch();
    latch.latch('gun', 1000);
    expect(latch.claim(1000)).toBe('gun');
    latch.latch('gun', 1300);
    expect(latch.claim(1300)).toBe('gun'); // the second shot gets its own weight
  });

  it('goes stale at the window edge rather than dressing an old shot', () => {
    const latch = new OwnFireLatch();
    latch.latch('cannon', 1000);
    expect(latch.claim(1000 + OWN_FIRE_WINDOW_MS)).toBe('cannon'); // the last instant
    latch.latch('cannon', 1000);
    expect(latch.claim(1000 + OWN_FIRE_WINDOW_MS + 1)).toBeNull();
  });

  it('is CLEARED at the hard boundary (own sunk / spawn / match teleport)', () => {
    const latch = new OwnFireLatch();
    latch.latch('cannon', 1000);
    expect(latch.pending).toBe(true);
    latch.clear();
    expect(latch.pending).toBe(false);
    // The next life's first reveal — quite possibly somebody else's shell,
    // landing where we just spawned — reads generic.
    expect(latch.claim(1000)).toBeNull();
  });

  it('claims only the BALLISTIC ids — an ability never dresses a projectile', () => {
    expect(isBallisticFire('gun')).toBe(true);
    expect(isBallisticFire('cannon')).toBe(true);
    expect(isBallisticFire('torpedo')).toBe(true);
    expect(isBallisticFire('starShells')).toBe(true); // rides the `shell` kind
    expect(isBallisticFire('speedBoost')).toBe(false);
    expect(isBallisticFire('decoyBuoy')).toBe(false);
    expect(isBallisticFire('mine')).toBe(false); // placed, never revealed as a track
    const latch = new OwnFireLatch();
    latch.latch('speedBoost', 1000);
    expect(latch.claim(1000)).toBeNull();
  });

  it('claims nothing before the first click', () => {
    expect(new OwnFireLatch().claim(1000)).toBeNull();
    expect(new OwnFireLatch().pending).toBe(false);
  });
});
