// THE OWN-FIRE LATCH (Story 2.9) — the client's own click intent, held just long
// enough for the resulting reveal to claim it.
//
// The `shell`/`torp` wire shape is deliberately constant-free: it cannot say
// which barrel a shell left, and MUST NOT, or an onlooker could read a build off
// a shot (see BallisticEvent's anti-cheat note). So the OWN client pairs a
// self-private click with the reveal that materializes on its own bow
// (net/roomBindings' ownFireWeapon dep). It is a heuristic, and it fails SAFE in
// both directions: a miss renders the ordinary shell look and plays the gun
// crack (pre-2.9 behavior), and it can never misattribute another ship's shell,
// because a reveal that is not on our own hull never consults it.
//
// The claim is ONE-SHOT. A latch describes ONE round leaving ONE barrel, so at
// most one reveal may wear it: the first claimant consumes it and every later
// reveal inside the same window falls back to the generic read. Without that,
// a single cannon click dressed EVERY own-looking reveal for the next 400ms —
// including an enemy shell that happened to materialize on our bow — as our
// cannon shot, which is exactly the misinformation the latch exists to avoid.

import type { EquipmentId } from '@salvo/shared';
import type { OwnFire } from '../render/projectiles.js';

/**
 * How long (ms) an own-fire latch stays claimable. It has to cover the click →
 * server tick → frame round trip that carries the resulting reveal back (a 50ms
 * tick plus real-world RTT), and no longer: the latch is only ever consulted for
 * a reveal that already materialized ON OUR OWN HULL, and the next click
 * overwrites it, so the window is a staleness bound rather than a correctness
 * one. Its two failure modes both land on pre-2.9 behavior (ordinary shell look,
 * gun crack).
 */
export const OWN_FIRE_WINDOW_MS = 400;

/** The BALLISTIC equipment ids a reveal can be attributed to — the only ids that
 *  ever produce a `shell`/`torp` event. An ability (boost/decoy) and the mine
 *  (placed, never revealed as a track) can never leak through into a
 *  projectile's identity, so they are rejected at the claim. */
const BALLISTIC: readonly EquipmentId[] = ['gun', 'cannon', 'torpedo', 'starShells'];

/** Pure: is this equipment id one a `shell`/`torp` reveal could have come from? */
export function isBallisticFire(id: EquipmentId): boolean {
  return BALLISTIC.includes(id);
}

/**
 * The click-time own-fire latch: which weapon the local captain just fired, and
 * the server-clock instant they fired it. Mutable by design (one instance lives
 * on the Game record); every rule about it is on the three methods below.
 */
export class OwnFireLatch {
  private held: { id: EquipmentId; t: number } | null = null;

  /**
   * Latch which weapon this click fired. Only a click the client PREDICTS will
   * fire should reach here (a denied press produces no shell, so latching it
   * would leave a stale claim for the next reveal to pick up) — that gate lives
   * at the callsite, which is the only place the prediction exists.
   */
  latch(id: EquipmentId, t: number): void {
    this.held = { id, t };
  }

  /**
   * CLAIM the latch for a reveal at server time `now`, consuming it: the weapon
   * behind our most recent shot, or null once it has gone stale, was already
   * claimed, or was never set. The caller decides whether the claimed id agrees
   * with the reveal's KIND (a torpedo latch cannot dress a shell) — a
   * disagreement still consumes, because the round it describes is spoken for
   * either way.
   */
  claim(now: number): OwnFire {
    const h = this.held;
    if (!h || now - h.t > OWN_FIRE_WINDOW_MS) return null;
    if (!isBallisticFire(h.id)) return null;
    this.held = null;
    return h.id as OwnFire;
  }

  /** Drop any standing claim — the hard state boundaries (own sunk / spawn /
   *  the match-activation teleport), where a click from the previous life must
   *  not dress the next life's first reveal. */
  clear(): void {
    this.held = null;
  }

  /** Is a claim still standing? (test/debug seam — the latch's own state is
   *  otherwise invisible, since claiming is destructive.) */
  get pending(): boolean {
    return this.held !== null;
  }
}
