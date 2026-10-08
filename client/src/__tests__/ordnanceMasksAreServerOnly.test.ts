// THE ORDNANCE MASKS ARE SERVER-ONLY (Story 8.4, AR44) — a grep pin over the
// whole client source.
//
// Story 8.4 added a `hits` row to six `CONFIG.<ordnance>` blocks (the KINDS of
// thing each weapon's projectiles may touch) and a `hits` field to
// `ShellState`. It deliberately did NOT bump `PROTOCOL_VERSION`, on one
// condition: THE CLIENT NEVER READS EITHER. A mask is a server-side collision
// decision; the client predicts no ordnance and resolves no hits, so nothing on
// this side has a use for it.
//
// WHY A TEXT SCAN AND NOT A TYPE CHECK. `CONFIG` is shared, so `CONFIG.gun.hits`
// compiles perfectly well in a client module — a reader would be legal, silent,
// and would quietly turn a server-side tuning field into a wire contract that
// a protocol bump has to protect. The scan catches the intent at the moment it
// is written, in a render module, a prediction path or an aim preview alike.
//
// If a later story genuinely needs a mask client-side (a render tell that
// depends on what a weapon can hit), that is a wire-contract change: bump
// `PROTOCOL_VERSION` and retire this pin deliberately, with a note.
//
// The `__tests__` tree is excluded, so this file does not trip its own pin.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROTOCOL_VERSION } from '@salvo/shared';

const SRC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..'); // client/src

/** Every `.ts` under client/src except the `__tests__` tree. */
function collect(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') collect(full, out);
    } else if (entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

const FILES = collect(SRC_DIR, []);

function rel(p: string): string {
  return p.startsWith(SRC_DIR) ? join('src', p.slice(SRC_DIR.length + 1)) : p;
}

describe('the ordnance `hits` masks never reach the client (Story 8.4)', () => {
  it('scans a non-trivial number of sources (the pin is not silently empty)', () => {
    expect(FILES.length).toBeGreaterThan(20);
  });

  it('no client source reads a `.hits` mask', () => {
    const offenders = FILES.filter((f) => /\.hits\b/.test(readFileSync(f, 'utf8'))).map(rel);
    expect(offenders).toEqual([]);
  });

  it('no client source names `TargetKind` or builds an ordnance `Target`', () => {
    const offenders = FILES.filter((f) => /\bTargetKind\b/.test(readFileSync(f, 'utf8'))).map(rel);
    expect(offenders).toEqual([]);
  });

  // FOUR STORIES HAVE MOVED THIS NUMBER, each for a reason this pin is happy
  // with: Story 8.5's nine-slot re-cut widened `OwnShip.ammo` from four entries
  // to nine (51 → 52), Story 8.8 deleted the `HEAL_CHOICE` wire sentinel and
  // made `hullRepair` a dealable catalog line (52 → 53), and Story 8.9 deleted
  // the `speedBoost` equipment id and re-cut `CONFIG.boost`, which the CLIENT
  // READS to derive the boosted cap (53 → 54, epic-8 amendments 54-55), and
  // Story 8.10 re-opened ONE negative on `SpendMsg.choice` — `MULLIGAN_CHOICE`
  // (-2), the countdown redraw — while deleting the interim spawn seed
  // (54 → 55, epic-8 amendment 60). The ordnance MASK is still server-only —
  // that is what the three scans above assert, and they are the substance of
  // this file. This line only witnesses that a bump, when it happens, happens
  // deliberately.
  it('PROTOCOL_VERSION is 73 — bumped by the Story 9.1 session 2 ocean and storm ramp (72 by the big ocean; 71 by the private-lobby contract; 70 by cycle 166 the deck-gun catalog retune; 69 by cycle 163 the drone-drop `dp` event; 68 by cycle 162: MineView.c for every observer, OwnShip.chaffGhosts, chaff/smoke radii ×1.5), not by masks', () => {
    // 55 until Story 8.13, whose ONE bump covered the catalog content, the id
    // moves and `MineView`'s own-only kind field (epic-8 amendment 76); 56
    // until Story 8.14, whose ONE bump covers the seat's `gun` join option,
    // `OwnShip.gun` and the retired deck door (epic-8 amendments 89d/95). The
    // `hits` masks still never reach the client — that is the claim this file
    // makes, and no bump has ever been theirs. 57 until Story 8.15, whose ONE
    // bump covers `InputMsg.held`, the reveal's `w`, `OwnShip.damageCutUntil`,
    // the Shift ids and the catalog cuts (epic-8 amendments 97-110) — the
    // flak row's new `ordnance` bit in its mask is server-only like every mask.
    // 58 until Story 8.16, whose ONE bump covers `OwnShip.shield`,
    // `FrameMsg.decoys` and the radar buoy's deletion (`FrameMsg.buoys`,
    // `BuoyView`, the `src` blip tag — epic-8 amendments 116-124).
    // 59 until Story 8.17, whose ONE bump covers `LitZoneView` losing
    // `phos`/`daz`, `FrameMsg.burnZones`, the phosphor/flash id moves and the
    // new CONFIG blocks (epic-8 amendments 129-135) — the phosphor and flash
    // shells' `hits` masks stay server-only like every mask.
    // 60 until Story 8.18, whose ONE bump covers `FrameMsg.smoke` (`SmokeView`),
    // the SMOKE SCREEN stub flip and `CONFIG.smokeScreen` (epic-8 amendments
    // 138-145) — smoke carries no mask at all.
    // 61 until Story 8.19, whose ONE bump covers the self-private
    // `OwnShip.draft` (the wake-draft lift the predictor folds) and
    // `CONFIG.wake.draft` (epic-8 amendments 151-156) — a wake carries no mask.
    // 62 until cycle 156, whose ONE bump covers the smoke puff radii 40/60 ->
    // 82.5/165 u (1/8 -> 2/8 of intel range, Eric 2026-09-30), which the
    // client reads to derive the disc — no wire shape moved, no mask either.
    // 63 until cycle 158, whose ONE bump covers the machine-gun ladder's new
    // `rateMs` steps (catalog content) and `idleReloadMs` leaving the stats
    // row (Eric 2026-09-30), plus the self-private `OwnShip.chaff` cloud
    // (amendment 191) — the machine gun's mask stays server-only.
    // 64 until the gun-ladder fold (2026-09-30, amendment 197), whose ONE bump
    // covers DECK GUN TURRET and DECK GUN BARREL leaving the catalog's card
    // vocabulary — catalog content, no mask.
    // 65 until cycle 160 (amendment 200), whose ONE bump covers the client
    // reading CONFIG.mine.hitRadiusU for its mine ring. The same cycle moves
    // `mine` in three masks (machine gun gains it, broadside and phosphor
    // lose it) — server-only like every mask, never the reason for a bump.
    // 66 until cycle 161 (amendment 208), whose ONE bump covers the STAR
    // SHELLS / PHOSPHOR SHELLS burst-damage base swap (CONFIG values the refit
    // card prints) — no mask moved. 67 until cycle 162, whose ONE bump covers
    // MineView.c on every observer's mine row (Eric 2026-10-01, superseding
    // amendment 76), the self-private OwnShip.chaffGhosts, and the client
    // drawing chaff.radius 180 / smoke-screen 123.75→247.5 u from CONFIG;
    // the machine gun's mask is unchanged — still not a mask bump. 68 -> 69
    // (cycle 163) is the self-private `dp` drone-drop event; 69 -> 70 (cycle 166) is the deck-gun catalog content — no mask moved;
    // 70 -> 71 (cycle 167) is the private-lobby contract (MSG lr/ls/lb/lg,
    // CONFIG.lobby read by the client, arena mode 'private') — no mask moved.
    expect(PROTOCOL_VERSION).toBe(73);
  });
});
