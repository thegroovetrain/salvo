// Story 11.1 — R19 ("ring follows the turret"), review F-A (the main battery's
// reach is measured from the FIRING TURRET's station, as the server measures
// it), and the contract that only the torpedo launchers paint arc wedges.

import { describe, expect, it } from 'vitest';
import {
  CONFIG,
  DEFAULT_CLASS_ID,
  aimPointOf,
  effectiveStats,
  gunReachU,
  initialTurrets,
  pickTurret,
  turretSalvo,
  type LitCircle,
} from '@salvo/shared';
import { computeAimPreview, type AimPreviewInput } from '../render/aimPreview.js';
import {
  batteryClampMark,
  launcherWedges,
  mainBatteryAim,
  type MainBatteryAimInput,
} from '../render/weaponArc.js';
import { paintedWedges, type WedgeContext } from '../render/firing.js';

const CLS = DEFAULT_CLASS_ID;
const STATS = effectiveStats(CONFIG.shipClasses[CLS], []);
const REACH = STATS.equipment.mainBattery.rangeU;
const SHIP = { x: 0, y: 0, heading: 0, cls: CLS };
const MAP_R = REACH * 10; // far from every shot: no rim clamp in play

function preview(over: Partial<AimPreviewInput>): AimPreviewInput {
  return {
    id: 'mainBattery',
    ship: SHIP,
    aim: 0.3,
    aimDist: REACH / 2,
    stats: STATS,
    mapRadius: MAP_R,
    islands: [],
    legal: true,
    turrets: initialTurrets(CLS),
    ...over,
  };
}

function batteryInput(inp: AimPreviewInput, zones: readonly LitCircle[] = []): MainBatteryAimInput {
  return {
    stats: inp.stats,
    hullId: inp.ship.cls,
    pose: inp.ship,
    aim: inp.aim,
    aimDist: inp.aimDist,
    turrets: inp.turrets ?? initialTurrets(inp.ship.cls),
    mapRadius: inp.mapRadius,
    ownLitZones: zones,
  };
}

describe('R19 — the range-clamp marker sits on the oval', () => {
  it('beyond reach, the marker is exactly the oval center (the firing turret\'s reach)', () => {
    for (const aim of [0, 0.4, Math.PI / 2, 2.2, Math.PI, -1.1]) {
      const inp = preview({ aim, aimDist: REACH * 1.6 });
      const oval = computeAimPreview(inp).oval;
      const mark = batteryClampMark(mainBatteryAim(batteryInput(inp)));
      expect(oval, String(aim)).toBeDefined();
      expect(mark, String(aim)).not.toBeNull();
      expect(mark?.x).toBe(oval?.x);
      expect(mark?.y).toBe(oval?.y);
      expect(mark?.bearing).toBe(oval?.rotation);
    }
  });

  it('inside reach there is no marker (the shot is not cut short)', () => {
    const inp = preview({ aimDist: REACH / 3 });
    expect(batteryClampMark(mainBatteryAim(batteryInput(inp)))).toBeNull();
  });
});

describe('F-A — the main battery\'s reach is measured from the firing turret, as the server does', () => {
  it('with an own lit zone at a far aim point, the oval center is the shared server-side call\'s', () => {
    // A quarter aim the BOW turret fires on: its station sits forward of the
    // ship center, so it is FARTHER from the aim point than the center is —
    // a center-measured reach comes up short of the station-measured one.
    const aim = 2.2;
    const aimDist = REACH * 1.5;
    const aimPt = aimPointOf(SHIP, aim, aimDist);
    const zones: LitCircle[] = [{ x: aimPt.x, y: aimPt.y, r: 40 }];
    const turrets = initialTurrets(CLS);
    const pick = pickTurret(turrets, CLS, SHIP, aimPt);
    expect(pick).not.toBeNull();
    if (pick === null) return;
    expect(pick.aimDistU - aimDist).toBeGreaterThan(1); // the premise: the two rays differ

    // The server's fire path (server/src/game/equipment/mainBattery.ts), call for call.
    const serverReach = gunReachU(pick.station, pick.bearing, pick.aimDistU, REACH, MAP_R, zones);
    const server = turretSalvo(pick, CLS, SHIP, serverReach, MAP_R).center;
    const oval = computeAimPreview(preview({ aim, aimDist, turrets, ownLitZones: zones })).oval;
    expect(oval?.x).toBeCloseTo(server.x, 9);
    expect(oval?.y).toBeCloseTo(server.y, 9);

    // ...and a reach read along the ship-center ray would have put it elsewhere.
    const centerReach = gunReachU(SHIP, aim, aimDist, REACH, MAP_R, zones);
    const wrong = turretSalvo(pick, CLS, SHIP, centerReach, MAP_R).center;
    expect(Math.hypot(wrong.x - server.x, wrong.y - server.y)).toBeGreaterThan(1);
  });
});

describe('the painted wedges are the torpedo launchers\' alone', () => {
  it('a torpedo paints its launcher wedges; the gun family paints none', () => {
    const ctx: WedgeContext = { launcherHull: CLS, launchers: 2 };
    const torpLen = paintedWedges('heavyTorpedo', ctx)?.wedges[0].r ?? NaN;
    for (const id of ['lightTorpedo', 'heavyTorpedo', 'supercavTorpedo'] as const) {
      expect(paintedWedges(id, ctx)?.wedges, id).toEqual(launcherWedges(CLS, 2, torpLen));
    }
    for (const id of ['mainBattery', 'gun', 'machineGun', 'flak', 'starShells'] as const) {
      expect(paintedWedges(id, ctx), id).toBeNull();
    }
  });
});
