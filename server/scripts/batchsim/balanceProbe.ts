// BALANCE PROBE (Story 7-5 evidence pass) — the calibration instrument for the
// things a campaign cannot see: the [DRAFT] broadside arc numbers (the
// BROADSIDE BARRAGE's per-turret `turretMountSpreadDeg`/`traverseDeg` — Eric's
// 2026-08-20 per-turret-arc model) and BARREL's lateral spacing
// `CONFIG.gun.barrelSpacingU`, and the MAX-STACK STAT
// ENVELOPE each hull can now reach under the ADDITIVE speed/range ladders.
//
// WHY A PROBE AND NOT A BATCH RUN. A campaign reports how much damage landed;
// it cannot tell you WHY a fan misses, and it cannot sweep a value that is not
// a `--set` tunable (the catalog and the weapon geometry are not). This probe
// answers the design question directly and exactly: place one stationary hull
// at range R, aim the barrage at its centre, and count how many of the shells
// the sim would actually resolve onto it — using the SHIPPED functions
// (`turretAimPoints` / `parallelOffsets` / `burstVictims` / `hullSilhouette`), never
// a re-derivation, so the answer cannot drift from what the weapon does.
//
// Deterministic, no rng, no World. Run:
//   node_modules/.bin/tsx --tsconfig server/scripts/batchsim/tsconfig.json \
//     server/scripts/batchsim/balanceProbe.ts

import {
  BOON_CATALOG,
  CONFIG,
  effectiveStats,
  hullEnvelope,
  resolveBoons,
  DRONE_HULL_IDS,
  HULL_IDS,
  SHIP_CLASS_IDS,
  burstVictims,
  hullSilhouette,
  turretAimPoints,
  parallelOffsets,
  transformPolygon,
  type HullId,
  type Vec2,
} from '@salvo/shared';

const deg = (d: number): number => (d * Math.PI) / 180;
const fmt = (n: number, d = 1): string => n.toFixed(d);

/** A stationary hull at `pos`, heading `head` (rad). */
function hullAt(hullId: HullId, pos: Vec2, head: number): { id: string; poly: Vec2[] } {
  const poly = transformPolygon(hullSilhouette(hullId), pos.x, pos.y, head, []);
  return { id: 'target', poly };
}

/** How many of `targets` (burst points) land on the hull. */
function shellsOn(targets: readonly Vec2[], burstRadius: number, hull: { id: string; poly: Vec2[] }): number {
  let n = 0;
  for (const t of targets) if (burstVictims(t, burstRadius, [hull], 'shooter').length > 0) n += 1;
  return n;
}

const PROBE_POSE = { x: 0, y: 0, heading: 0 };

/** Adjacent mounts' angular separation at a battery of `n` guns — the straddle
 *  spans 2·spread whatever the count, so one gun has no neighbour and no gap. */
function mountGapDeg(spreadDeg: number, n: number): number {
  return n > 1 ? (2 * spreadDeg) / (n - 1) : 0;
}

/** deg — the verdict tolerance. The touching rung is an EXACT equality by
 *  authoring (2·7.5 = 2·22.5/3) but both sides are float arithmetic, so a
 *  retuned ladder that still means "touching" must not print as a gap. */
const VERDICT_EPS = 1e-9;

/** The RUNG's PAIR — the two arc ladders are indexed together, exactly as
 *  effectiveStats() pairs them. Never mix a traverse with another rung's
 *  mounts: that is a geometry the game can never produce. Indexed defensively:
 *  sim/stats.ts asserts the two ladders are the same length at load, so an
 *  undefined here would mean the probe outran that contract. */
function rungArc(s: number): { tau: number; ms: number } {
  const t = CONFIG.broadside.traverseDeg[s];
  const m = CONFIG.broadside.turretMountSpreadDeg[s];
  if (t === undefined || m === undefined) throw new Error(`broadside ladder mismatch at rung ${s + 1}`);
  return { tau: deg(t), ms: deg(m) };
}

/** The ruled overlap schedule at the BASE battery (Eric ruling 2026-08-27). */
function overlapSchedule(): void {
  const b = CONFIG.broadside;
  console.log('OVERLAP SCHEDULE at the base battery (Eric ruling 2026-08-27: zero overlap through rung 3):');
  console.log('rung | mountSpread | traverse | gap = 2*spread/(n-1) | 2*traverse | overlap?');
  for (let s = 0; s < b.traverseDeg.length; s += 1) {
    const gap = mountGapDeg(b.turretMountSpreadDeg[s], b.turrets);
    const span = 2 * b.traverseDeg[s];
    const verdict = span > gap + VERDICT_EPS ? 'OVERLAP' : span > gap - VERDICT_EPS ? 'touching' : 'gap';
    console.log(
      `  ${s + 1}  | ${fmt(b.turretMountSpreadDeg[s], 2).padStart(11)} | ${fmt(b.traverseDeg[s], 2).padStart(8)} | ${fmt(gap, 3).padStart(20)} | ${fmt(span, 2).padStart(10)} | ${verdict}`,
    );
  }
}

/** One rung's row of "guns on the click" counts, across bearing × range. */
function onClickRow(turrets: number, s: number): string {
  const b = CONFIG.broadside;
  const { tau, ms } = rungArc(s);
  const cells: string[] = [];
  for (const phiDeg of [0, 15, 30, 45, 60]) {
    const phi = deg(phiDeg);
    const counts = [100, 200, 300, 412.5].map((r) => {
      const click = { x: r * Math.sin(phi), y: r * Math.cos(phi) };
      return turretAimPoints(PROBE_POSE, 'battleship', turrets, 1, click, tau, ms, 5000).filter((t) => t.onClick).length;
    });
    cells.push(`${String(phiDeg).padStart(2)}°:${counts.join('/')}`);
  }
  return `  rung ${s + 1} (±${fmt(b.traverseDeg[s]).padStart(4)}° / mounts ±${fmt(b.turretMountSpreadDeg[s]).padStart(4)}°) | ${cells.join(' | ')}`;
}

/** One (hull, aspect, turrets, R) row of shells actually landing, per rung. */
function landedRow(hullId: HullId, aspectName: string, head: number, turrets: number, R: number): string {
  const b = CONFIG.broadside;
  const cells: string[] = [];
  for (let s = 0; s < b.traverseDeg.length; s += 1) {
    const click = { x: 0, y: R }; // dead abeam of the firing battleship
    const { tau, ms } = rungArc(s);
    const aims = turretAimPoints(PROBE_POSE, 'battleship', turrets, 1, click, tau, ms, 5000);
    const landed = shellsOn(aims.map((t) => t.target), b.burstRadius, hullAt(hullId, click, head));
    cells.push(String(landed).padStart(7));
  }
  return `${hullId.padEnd(12)} | ${aspectName.padEnd(9)} | ${String(turrets).padStart(7)} | ${fmt(R).padStart(5)} | ${cells.join(' | ')}`;
}

function broadsideBlock(): void {
  const b = CONFIG.broadside;
  console.log(
    `== BROADSIDE PER-TURRET ARCS (DRAFT mountSpreadDeg = [${b.turretMountSpreadDeg.join(', ')}], traverseDeg = [${b.traverseDeg.join(', ')}], burstRadius ${b.burstRadius}u) ==`,
  );
  console.log('Each turret fires exactly at the click when its own arc bears, else at its arc limit');
  console.log('at the click\'s range (sim/aim.ts turretAimPoints — the shipped function, no re-derivation).');
  console.log('');
  overlapSchedule();
  console.log('');
  console.log('GUNS ON THE CLICK (battleship battery, port beam; click at bearing phi off abeam):');
  for (const turrets of [4, 5, 6]) {
    console.log(`turrets=${turrets}: rows = spread rung, cols = phi; cell = "bear" counts at R=100/200/300/412.5`);
    for (let s = 0; s < b.traverseDeg.length; s += 1) console.log(onClickRow(turrets, s));
  }
  console.log('');
  console.log('SHELLS THAT ACTUALLY LAND ON ONE STATIONARY HULL (aim = hull centre, shipped burstVictims):');
  console.log('hull         | aspect    | turrets |     R | spread0 | spread1 | spread2 | spread3 | spread4');
  for (const hullId of HULL_IDS) {
    for (const [aspectName, head] of [['broadside', Math.PI / 2] as const, ['bow-on', 0] as const]) {
      for (const turrets of [4, 6]) {
        for (const R of [150, 300, 412.5]) console.log(landedRow(hullId, aspectName, head, turrets, R));
      }
    }
  }
}

function barrelBlock(): void {
  const g = CONFIG.gun;
  console.log('');
  console.log(`== BARREL PARALLEL TRACKS (DRAFT barrelSpacingU = ${g.barrelSpacingU}u, burstRadius ${g.burstRadius}u) ==`);
  console.log(`spacing ${g.barrelSpacingU}u vs burst DIAMETER ${g.burstRadius * 2}u: adjacent bursts ${g.barrelSpacingU < g.burstRadius * 2 ? 'OVERLAP' : 'are separate'}`);
  console.log('barrels | damage/click | shells landing on one hull (aim = hull centre, R=300u)');
  for (const barrels of [1, 2, 3]) {
    const offsets = parallelOffsets(0, barrels, g.barrelSpacingU);
    const cells: string[] = [];
    for (const hullId of HULL_IDS) {
      const targets = offsets.map((o) => ({ x: 300 + o.x, y: o.y }));
      const hits = shellsOn(targets, g.burstRadius, hullAt(hullId, { x: 300, y: 0 }, 0));
      cells.push(`${hullId}=${hits}(${hits * g.damage}hp)`);
    }
    console.log(`${String(barrels).padStart(7)} | ${String(barrels * g.damage).padStart(12)} | ${cells.join(' ')}`);
  }
  console.log('');
  console.log('OFF-CENTRE CLICK — how far the aim can miss a stationary hull centre and still land N shells (3 barrels, R=300u):');
  const offsets = parallelOffsets(0, 3, g.barrelSpacingU);
  for (const hullId of [...SHIP_CLASS_IDS, 'droneSmall' as HullId]) {
    const row: string[] = [];
    for (const miss of [0, 10, 20, 30, 40, 60]) {
      const targets = offsets.map((o) => ({ x: 300 + o.x, y: o.y + miss }));
      row.push(`${miss}u:${shellsOn(targets, g.burstRadius, hullAt(hullId, { x: 300, y: 0 }, 0))}`);
    }
    console.log(`  ${hullId.padEnd(12)} lateral miss -> shells on target: ${row.join('  ')}`);
  }
}

/** The stat envelope a class can actually reach: base vs every universal ladder
 *  stacked to its copy cap (the ADDITIVE speed/range ladders of Story 7-5). */
function statsBlock(): void {
  console.log('== MAX-STACK STAT ENVELOPE (universal lines only, each to its copy cap) ==');
  const universal = ['shipHull', 'shipSpeed', 'shipCooldown', 'intelSweep'];
  const maxBoons: string[] = [];
  for (const id of universal) {
    // Fail LOUDLY on an id the catalog no longer holds. This list is hand-kept
    // and a deleted line reads back as `undefined.copies` — a bare TypeError
    // that says nothing about which id went away (INTEL RANGE's removal on
    // 2026-08-20 landed exactly here).
    const def = BOON_CATALOG[id];
    if (def === undefined) throw new Error(`balanceProbe: '${id}' is not in BOON_CATALOG (deleted line?)`);
    maxBoons.push(...new Array<string>(def.copies).fill(id));
  }
  console.log(`stack: ${universal.map((id) => `${id}x${BOON_CATALOG[id].copies}`).join(' ')}`);
  // detect is SIGHT-scaled (`sightOf(me) * detectFactor`), NOT radar-scaled —
  // the one rung that hangs off sight rather than radar range. Derived here the
  // same way the server does it so the ladder ordering is checkable by eye.
  console.log('class        |  maxHp |  speed | radar |  sight | detect | 5/8 rung | gun rangeU | broadside rangeU | cooldownScale');
  for (const cls of SHIP_CLASS_IDS) {
    for (const [tag, boons] of [['base', [] as string[]] as const, ['MAXED', maxBoons] as const]) {
      const st = effectiveStats(hullEnvelope(cls), resolveBoons(boons));
      const rung = st.radarRange * CONFIG.vision.muzzleFlashFactor;
      console.log(
        `${(cls + ' ' + tag).padEnd(12)} | ${fmt(st.maxHp).padStart(6)} | ${fmt(st.kinematics.maxSpeed).padStart(6)} | ` +
          `${fmt(st.radarRange).padStart(5)} | ${fmt(st.sightRange).padStart(6)} | ${fmt(st.sightRange * CONFIG.vision.detectFactor).padStart(6)} | ` +
          `${fmt(rung).padStart(8)} | ${fmt(st.gun.rangeU).padStart(10)} | ${fmt(st.broadside.rangeU).padStart(16)} | ${fmt(st.cooldownScale, 3)}`,
      );
    }
  }
  console.log('');
}

for (const hullId of HULL_IDS) {
  const poly = hullSilhouette(hullId);
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  console.log(
    `hull ${hullId.padEnd(12)} silhouette length=${fmt(Math.max(...xs) - Math.min(...xs))}u beam=${fmt(Math.max(...ys) - Math.min(...ys))}u`,
  );
}
console.log('HULLS PROBED: ' + HULL_IDS.join(' ') + ` (classes: ${SHIP_CLASS_IDS.join(' ')}; fleet: ${DRONE_HULL_IDS.join(' ')})`);
statsBlock();
broadsideBlock();
barrelBlock();
