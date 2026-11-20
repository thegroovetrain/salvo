// Rain + radar smoke: live @colyseus/sdk clients against a running dev server,
// verifying the perception tiers end to end over the real wire. Every client
// lives in this process, so the poses and the oracles use ground truth while
// the FRAMES under test stay fogged.
//
// A SCRIPTED SCENARIO in the Story 9.15 sense (re-posed 2026-11-12, Story 11.2,
// for the hectometer reaches): ONE pinned-map sandbox room, and every phase
// SEATS a fresh pair of hulls where it needs them through the dev-only
// `spawnOverride` pose (joinById), watches a few sweeps, and leaves. Nothing
// sails; no hull is piloted (the one scripted input is the shell phase's aim +
// click). Every pose is SEARCHED on the pinned map against the same shared
// primitives perception runs (`islandBlocksSegment`, `visibilityTo`, the shared
// rain field), and every distance is derived from the folded stats / `CONFIG` —
// no reach is a literal here.
//
// THE RAIN IS LIVE in a sandbox room FROM THE START (Story 11.6 — the storm
// eye; Eric 2026-11-15: no roll-in, the bands are there before the zone starts;
// the zone itself starts at the 2nd join). THERE IS NO CUT ANY MORE: the whole field is a pure function of PUBLIC inputs — the welcome's
// `fogSeed`, the schema's zone clock and revealed rings, and the time — so this
// smoke evaluates it exactly as a client does (`fogFrameAt` on the live ring,
// `fogDepthAlong` for a ray's optical depth tau, `fogHullGrid` for a hull's
// sight grid) and a thing is seen while tau <= T (`fogMaxDepth`). A HULL ALSO
// PAYS DISTANCE HAZE (Eric 2026-11-15 — the anonymous plain hull and its
// `frame.pc` channel are gone): `fogHazeDepth` adds 0 out to the class-and-name
// sight and T at the hull sight, so a hull is a full contact that fades out
// between the two. The server
// gates on its EPOCH frame (at most `refreshMs` old) and the clouds drift while
// a phase watches, so every claim about the EYE is TIME-BRACKETED: a pair is
// picked only when the claim holds, by a margin, at every sampled instant from
// one refresh BEFORE the pick to a horizon AFTER it, and the phase re-checks
// that it finished inside that window — and one phase makes the rain itself the
// subject.
//
// Phases (each line: what it proves — how it is posed):
//   0 FAR      — beyond radar there is nothing: no contact, no blip. Two
//                anchors on a diameter, a pose clearance inside the rim (the
//                board is wider than the radar reach); they stay for the whole
//                run and keep the room and its weather alive.
//   1 RAIN     — rain HIDES: a hull inside class sight on an island-clear ray
//                is NOT a contact when every point of its sight grid is past
//                T; radar — weather-blind — still paints it every sweep.
//   2 HAZE     — the fading band (Eric 2026-11-15): between class sight and
//                hull sight, on a clear ray where the rain plus the distance
//                haze leave every grid point under T, a hull is a FULL contact
//                (its roster id and class on the row) — and no frame carries
//                a `pc` key any more; radar paints it too. Past the hull
//                sight it is hidden: phase 5.
//   3 SIGHT    — inside class sight on a clear ray the rain lets through: a
//                contact both ways, and radar STILL paints (amendment 210: no
//                inner edge).
//   4 ISLAND   — (a) HARD cover inside class sight (rain would not have hidden
//                it): no contact, no blip. (b) LOW cover inside class sight
//                (coastline on the ray, but the height-aware radar shadow sees
//                over it): still no contact — the eye keeps binary island LOS
//                — yet radar paints. (c) hard cover in the radar band: radar
//                stays blind.
//   5 BAND     — the radar band: beyond EVERY eye reach (the hull sight —
//                where the haze has taken the hull — muzzle flash, splash)
//                and inside radar on a clear radar line: no contact, one blip
//                per sweep revolution each way, landing on the hull.
//   6 SHELL    — from that same band pose (inside the firer's gun reach) A
//                fires on B: A (owner) gets its shell at launch; B gets the
//                SAME shell id only once it enters B's shell-sight reach,
//                re-parameterized (later t, nearer pos), with no ttl on the
//                wire. Beyond its splash reach A sees only the END of its own
//                shells (epic-11 amendment 11), never a victim id (no hit
//                confirmation leak).
//
// HISTORY: until Story 11.6 phase 1 was "fog SHORTENS sight" (a toll in extra
// distance, directional — the observer's own bank was free), the weather was
// read off a schema `fogCut` the smoke waited to settle, phase 2 was the PLAIN
// tier (an anonymous `frame.pc` row between the two sights), and the rain
// rolled in after the zone start. All of that is gone: rain gates by optical
// depth, the same from either end, from the first tick.
//
// Run against a booted server (tsx server/src/index.ts + shared/dist built),
// with HC_DEV_OPTIONS=1 in ITS env — this smoke's sandbox matchOverride,
// zoneOverride, mapSeed and spawnOverride are otherwise stripped by the room
// (see server/src/rooms/roomOptions.ts):
//   HC_DEV_OPTIONS=1 npm run dev -w server   (separate terminal)
//   node server/scripts/fogSmoke.mjs
import { Client } from '@colyseus/sdk';
import {
  CONFIG,
  DEFAULT_CLASS_ID,
  HULL_IDS,
  PROTOCOL_VERSION,
  angleDiff,
  bearing,
  dispersionAxes,
  effectiveStats,
  fogDepthAlong,
  fogFrameAt,
  fogHazeDepth,
  fogHullGrid,
  fogMaxDepth,
  generateMap,
  hullEnvelope,
  hullSilhouette,
  islandBlocksSegment,
  makeFogField,
  mulberry32,
  polygonMaxRadius,
  visibilityTo,
  zoneLiveState,
} from '@salvo/shared';

const endpoint = process.env.WS_URL || 'ws://localhost:2567';
// Every hull here is the default class with nothing fitted, so the folded
// stats are the reaches the server gates on (one derivation, both sides).
const STATS = effectiveStats(CONFIG.shipClasses[DEFAULT_CLASS_ID], []);
const SIGHT = STATS.sightRange; // class-and-name reach — a hull is crisp out to here
const HULL_SIGHT = STATS.hullSightRange; // hull sight — a contact fades to gone here (the distance haze)
const RADAR = STATS.radarRange;
const GUN = STATS.equipment.mainBattery;
// The farthest any EYE reaches a hull or what it does: beyond this a hull is
// radar's alone (no contact, no muzzle flash, no splash).
const EYE_MAX = Math.max(HULL_SIGHT, CONFIG.vision.muzzleFlash, CONFIG.vision.splashSight);
const PERIOD = STATS.sweepPeriodMs; // ms per radar revolution
// mapSeed 265 (dev-only pin): the latencyHarness scan winner (fewest islands
// for its board). The pin keeps the island field — and with it every pose
// search below — deterministic; the rain is searched live.
const MAP_SEED = 265;
// Slack on the any-hull sight bounds (checkEye). Both sides of the comparison
// come from the SAME frame, so the true slack is zero; this only absorbs a
// frame that carried contacts but no `you`.
const SIGHT_TOL = 15;
// A seated hull must land on its pose (the dev door honored `spawnOverride`).
const POSE_TOL = 2;
// A paint whose cell-rect center is within this of the subject is the
// subject's (the `return` grammar carries no identity). A hull's rasterized
// footprint centers within about a hull radius of its own hull.
const ATTRIBUTE_U = 60;
// Pose clearance from the rim and from every island's BOUNDING circle: twice
// the largest hull radius — comfortably inside the server's own placement test
// (`isSpawnClear`: one hull radius off the exact coastline), so a searched
// pose is never rejected.
const HULL_R = Math.max(...HULL_IDS.map((id) => polygonMaxRadius(hullSilhouette(id))));
const POSE_CLEAR = 2 * HULL_R;
// A firing lane is checked as a strip of parallel island-LOS lines, this many
// each side of the centre line (see `laneClear`).
const LANE_LINES = 8;
// No two seated hulls closer than this, so geometric paint attribution (and
// its 2x off-target shell) can only ever mean the subject.
const SEAT_SEP = 4 * ATTRIBUTE_U;
// T — the optical depth at which a thing vanishes behind rain: every eye gate
// on the server is `tau <= T` (one shared derivation).
const RAIN_T = fogMaxDepth(CONFIG.fog);
// THE rain margin (optical depth): how far under / over T a ray must sit, at
// every sampled instant, for the claim to be about the mechanism and not about
// a boundary. It covers what the bracket cannot sample — the drift between two
// sampled instants, and the server reading the field through its 10 u memo
// cells where this smoke runs the shared midpoint march.
const RAIN_MARGIN = RAIN_T / 5;
// The window a pair is picked for: from one server refresh BEFORE the pick
// (the server gates on its epoch frame, up to `refreshMs` old) to a horizon
// after it that holds the seating and the watch, sampled at RAIN_SAMPLES
// evenly spaced instants.
const RAIN_HORIZON_MS = 5 * PERIOD;
const RAIN_SAMPLES = 6;
// The hull every client here sails, and its sight grid (the shared layout).
const HULL = hullEnvelope(DEFAULT_CLASS_ID).hull;
const GRID_COLS = CONFIG.fog.hullGridCols;
const GRID_ROWS = CONFIG.fog.hullGridRows;
const ZONE_START_BUDGET_MS = 60000;
// The HAZE phase's band: from just past class sight to this share of the way
// to the hull sight (the haze is this share of T there, so the rain has room).
const HAZE_BAND_FRAC = 0.5;
const FIND_TRIES = 60000;
const MIN_FRAMES = 20;
// A shell's reveal may sit this many ticks of flight off the boundary.
const SHELL_TOL_TICKS = 2;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
/** A scenario that could not be POSED (no pair on this map / this weather, a
 *  pose not honored) — not a claim about the server. */
function precondition(cond, msg) {
  if (!cond) throw new Error(`precondition: ${msg}`);
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, f) => a + (b - a) * f;
/** World-space center of a `ReturnBlipEvent`'s cell rect.
 *  A blip has carried NO x/y since the `return` radar grammar replaced the
 *  retired `silhouette` shape (cycle 105, PV 44): the payload is an ABSOLUTE
 *  world cell rect on the `CONFIG.vision.radarCellU` lattice
 *  (`shared/src/types.ts` ReturnBlipEvent — k,t,gx,gy,w,h,bits) plus a packed
 *  coverage mask, and it carries no identity either. The rect center is the
 *  proxy for "the paint landed on the target hull". */
const blipCenter = (e) => ({
  x: (e.gx + e.w / 2) * CONFIG.vision.radarCellU,
  y: (e.gy + e.h / 2) * CONFIG.vision.radarCellU,
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- clients ---

// Sandbox (dev-only): pre-step-14 room behavior — no match lifecycle, permissive
// combat policy, storm (and rain) at the 2nd join. The 10-minute beat parks the
// first close 30 minutes out, so the whole run is on the full-map ring. Supply
// drops and airdrops are switched off: a crate is an anonymous radar return,
// and this smoke counts returns.
const SANDBOX_ZONE = { beatMs: 600000, ringSteps: [1 / 3, 2 / 3], offsetCap: 1, terminalSightFactor: 2 };
const MATCH_OVERRIDE = { sandbox: true, supplyDrops: false, drops: false };

/** Every joined client still in the room — the input pump's list and the
 *  seat-separation oracle. */
const live = new Set();

/** Join one client SEATED at `pose`. `roomId` — join THAT room, else CREATE a
 *  fresh one (never joinOrCreate: a stale sandbox room must not be reused). */
async function joinClient(name, pose, roomId) {
  const client = new Client(endpoint);
  const opts = {
    name, pv: PROTOCOL_VERSION, cls: DEFAULT_CLASS_ID,
    mapSeed: MAP_SEED, matchOverride: MATCH_OVERRIDE, zoneOverride: SANDBOX_ZONE, spawnOverride: pose,
  };
  const room = roomId ? await client.joinById(roomId, opts) : await client.create('arena', opts);
  const ctx = {
    name, room, pose, welcome: null, you: null, now: 0,
    blips: [], shells: [], booms: [],
    frames: null, // when set, per-frame records are pushed here
    script: null, // (ctx, inp) => void — the one scripted input (shell phase)
    seq: 0, fireSeq: 0, other: null,
  };
  room.onMessage('w', (m) => { ctx.welcome = m; });
  room.onMessage('p', () => {}); // presence broadcast — not under test
  room.onMessage('f', (f) => onFrame(ctx, f));
  live.add(ctx);
  return ctx;
}

async function leave(...clients) {
  for (const c of clients) {
    live.delete(c);
    await c.room.leave();
  }
}

function onFrame(ctx, f) {
  ctx.now = f.t;
  if (f.you) ctx.you = f.you;
  for (const e of f.events) {
    if (e.k === 'blip') ctx.blips.push(e);
    else if (e.k === 'shell') ctx.shells.push({ ...e, seenAt: ctx.you ? { x: ctx.you.x, y: ctx.you.y } : null }); // the observer's pose AT REVEAL
    else if (e.k === 'boom') ctx.booms.push({ ...e, seenAt: ctx.you ? { x: ctx.you.x, y: ctx.you.y } : null });
  }
  if (ctx.frames && ctx.you && ctx.other?.you) {
    ctx.frames.push({
      t: f.t,
      contactIds: f.contacts.map((c) => c.id),
      // EVERY contact's range from the observer's OWN pose in the SAME frame
      // (perception materializes at the live sim pose, and `you` is the same
      // tick's pose), which is what lets checkEye police the any-hull bound;
      // and whether the row is a FULL contact (its class on it).
      contactD: f.contacts.map((c) => ({ id: c.id, d: dist(c, ctx.you), cls: c.cls })),
      hasPc: 'pc' in f, // the removed plain-hull channel: never on a frame again
    });
  }
}

/** One idle input per client per tick (nothing sails: throttle and rudder stay
 *  0), plus the client's scripted aim / click when it has one. */
function control(ctx) {
  const inp = { seq: ++ctx.seq, throttle: 0, rudder: 0, aim: 0, fireSeq: ctx.fireSeq, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false };
  ctx.script?.(ctx, inp);
  ctx.room.send('i', inp);
}

async function waitFor(done, timeoutMs, label) {
  const start = Date.now();
  while (!done()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout: ${label}`);
    await sleep(CONFIG.tick.simDtMs);
  }
}

/** Record both clients' frames for `periods` sweep revolutions. */
async function observe(a, b, periods) {
  a.frames = [];
  b.frames = [];
  const w0 = { a: a.now, b: b.now };
  await sleep(PERIOD * periods);
  const out = { a: a.frames, b: b.frames, w0, w1: { a: a.now, b: b.now } };
  a.frames = null;
  b.frames = null;
  return out;
}

// ------------------------------------------------------------ the oracles ---
// (the rain's own are on the board: `rainView`, `depth`, `hullDepth`, `pairDepth`)

/** The pinned map + the room's rain field, and the pose search over them. */
function makeBoard(map, fogSeed, anchor) {
  const rng = mulberry32(MAP_SEED);
  const fog = makeFogField(fogSeed, CONFIG.fog, map.radius);
  const board = {
    map,
    anchor,
    /** Island-clear EYE line (the shared polygon LOS seam perception runs). */
    los: (p, q) => map.islands.every((i) => !islandBlocksSegment(p, q, i)),
    /** The height-aware radar shadow, each way. */
    radarClear: (p, q) => visibilityTo(map.heightRaster, p.x, p.y, q.x, q.y) > 0 && visibilityTo(map.heightRaster, q.x, q.y, p.x, p.y) > 0,
    /**
     * A FIRING LANE p -> q: island-clear not only on the centre line but over
     * the whole strip the salvo flies — the dispersion ellipse's across
     * semi-axis at that range plus half a hull radius each side (the firer is
     * seated BOW-ON, so its forward turrets sit on the lane's own line and the
     * guns only a few u off it; the rest is margin). A lane that threads a
     * strait narrower than the salvo puts every shell on a rock (seen: a 30 u
     * gap on this seed). Bow-on rather than broadside because a broadside
     * spreads the turrets a hull radius each way, and this seed has next to no
     * lane that wide and that long.
     */
    laneClear(p, q) {
      const d = dist(p, q);
      const half = HULL_R / 2 + dispersionAxes(d).acrossU;
      const nx = -(q.y - p.y) / d;
      const ny = (q.x - p.x) / d;
      for (let k = -LANE_LINES; k <= LANE_LINES; k++) {
        const o = (half * k) / LANE_LINES;
        if (!board.los({ x: p.x + nx * o, y: p.y + ny * o }, { x: q.x + nx * o, y: q.y + ny * o })) return false;
      }
      return true;
    },
    hardCover: (p, q) => visibilityTo(map.heightRaster, p.x, p.y, q.x, q.y) === 0 && visibilityTo(map.heightRaster, q.x, q.y, p.x, p.y) === 0,
    /**
     * The live weather as a client knows it, BRACKETED IN TIME: the shared
     * field's frames at RAIN_SAMPLES instants from one refresh before now to
     * the horizon after it, each on the live ring center derived from the
     * schema's zone clock and revealed rings by the shared `zoneLiveState`
     * (exactly the client's derivation; the room's timeline is SANDBOX_ZONE).
     */
    rainView() {
      const st = anchor.room.state;
      const cur = { cx: st.zoneCurCx, cy: st.zoneCurCy, r: st.zoneCurR };
      const next = st.zoneNextR > 0 ? { cx: st.zoneNextCx, cy: st.zoneNextCy, r: st.zoneNextR } : null;
      const t0 = anchor.now - CONFIG.fog.refreshMs;
      const t1 = anchor.now + RAIN_HORIZON_MS;
      const frames = [];
      for (let k = 0; k < RAIN_SAMPLES; k++) {
        const t = lerp(t0, t1, k / (RAIN_SAMPLES - 1));
        const eye = zoneLiveState(t, st.zoneStartT, cur, next, SANDBOX_ZONE).current;
        frames.push(fogFrameAt(fog, t, st.zoneStartT, eye.cx, eye.cy, SANDBOX_ZONE));
      }
      return { t: anchor.now, until: t1, frames };
    },
    /** The optical depth of the ray p -> q over the bracket: { min, max }. */
    depth(view, p, q) {
      let min = Infinity;
      let max = 0;
      for (const frame of view.frames) {
        const v = fogDepthAlong(frame, p.x, p.y, q.x, q.y);
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
      return { min, max };
    },
    /**
     * The optical depth from an eye at `p` to a HULL seated at `q` on
     * `heading`, over its sight grid and the bracket — the RAIN on each grid
     * ray PLUS that point's DISTANCE HAZE (the shared `fogHazeDepth` between
     * the two sights; 0 inside class sight): `nearest` — the least depth any
     * grid point ever has (the hull is LOST when even that is past T),
     * `farthest` — the most any grid point ever has (the WHOLE hull is
     * through when even that is under T), `haze` — the largest haze term.
     */
    hullDepth(view, p, q, heading) {
      const pts = [];
      const n = fogHullGrid(q.x, q.y, heading, HULL.length, HULL.beam, GRID_COLS, GRID_ROWS, pts);
      let nearest = Infinity;
      let farthest = 0;
      let haze = 0;
      for (let k = 0; k < n; k++) {
        const pt = { x: pts[2 * k], y: pts[2 * k + 1] };
        const h = fogHazeDepth(dist(p, pt), SIGHT, HULL_SIGHT, RAIN_T);
        const d = board.depth(view, p, pt);
        nearest = Math.min(nearest, d.min + h);
        farthest = Math.max(farthest, d.max + h);
        haze = Math.max(haze, h);
      }
      return { nearest, farthest, haze };
    },
    /** Both hulls of a pair facing each other (as `seat` poses them), each
     *  from the other's eye: the pair's { nearest, farthest } over both. */
    pairDepth(view, p, q) {
      const toQ = bearing(p, q);
      const ab = board.hullDepth(view, p, q, toQ + Math.PI);
      const ba = board.hullDepth(view, q, p, toQ);
      return { nearest: Math.min(ab.nearest, ba.nearest), farthest: Math.max(ab.farthest, ba.farthest), haze: Math.max(ab.haze, ba.haze) };
    },
    /** May a hull be seated at `p`? Inside the rim and off every island by the
     *  pose clearance, and clear of every hull already in the room. */
    seatable(p) {
      if (Math.hypot(p.x, p.y) > map.radius - POSE_CLEAR) return false;
      if (!map.islands.every((i) => Math.hypot(p.x - i.x, p.y - i.y) > i.r + POSE_CLEAR)) return false;
      for (const c of live) if (dist(p, c.pose) < SEAT_SEP) return false;
      return true;
    },
    /**
     * A seatable pair `lo..hi` apart that satisfies `pred(p, q, d)` (truthy —
     * its value rides back as `info`). Deterministic sampling (seeded from the
     * map pin): a distance in the band, a MIDPOINT uniform over the disc that
     * keeps both ends inside the rim (so a pair nearly as long as the board is
     * as cheap to draw as a short one), a uniform bearing. The predicate is
     * the phase's whole precondition, and `seat` re-runs it on the poses the
     * server actually gave.
     */
    findPair(label, lo, hi, pred) {
      for (let i = 0; i < FIND_TRIES; i++) {
        const d = rng.float(lo, hi);
        const ang = rng.float(0, 2 * Math.PI);
        const r = Math.sqrt(rng.next()) * Math.max(0, map.radius - POSE_CLEAR - d / 2);
        const mid = { x: Math.cos(ang) * r, y: Math.sin(ang) * r };
        const brg = rng.float(0, 2 * Math.PI);
        const half = { x: (Math.cos(brg) * d) / 2, y: (Math.sin(brg) * d) / 2 };
        const p = { x: mid.x - half.x, y: mid.y - half.y };
        const q = { x: mid.x + half.x, y: mid.y + half.y };
        if (!board.seatable(p) || !board.seatable(q)) continue;
        const info = pred(p, q, d);
        if (info) return { p, q, d, info };
      }
      throw new Error(`precondition: ${label}: no pair ${lo.toFixed(0)}..${hi.toFixed(0)}u apart on seed ${MAP_SEED} fits the pose in ${FIND_TRIES} tries`);
    },
  };
  return board;
}

/** Wait for both welcomes + first own frames and check each hull landed on its
 *  pose on the pinned map. */
async function awaitPosed(label, ...clients) {
  await waitFor(() => clients.every((c) => c.welcome && c.you), 15000, `${label}: first frames`);
  for (const c of clients) {
    precondition(c.welcome.mapSeed === MAP_SEED, `${label}: ${c.name} got mapSeed ${c.welcome.mapSeed}, expected ${MAP_SEED} (is HC_DEV_OPTIONS=1 set on the server?)`);
    precondition(dist(c.you, c.pose) < POSE_TOL && Math.abs(angleDiff(c.you.heading, c.pose.heading)) < 0.01,
      `${label}: ${c.name} spawned at (${c.you.x.toFixed(0)},${c.you.y.toFixed(0)}), not its pose (${c.pose.x.toFixed(0)},${c.pose.y.toFixed(0)}) — spawnOverride stripped or rejected?`);
  }
}

/**
 * SEAT a fresh pair in the room on a found pair of points — X at `p`, Y at `q`
 * — facing each other, and re-prove the phase's precondition on the poses the
 * server gave.
 */
async function seat(board, roomId, tag, found, pred) {
  const toQ = bearing(found.p, found.q);
  const x = await joinClient(`${tag}-A`, { x: found.p.x, y: found.p.y, heading: toQ }, roomId);
  const y = await joinClient(`${tag}-B`, { x: found.q.x, y: found.q.y, heading: toQ + Math.PI }, roomId);
  x.other = y;
  y.other = x;
  await awaitPosed(tag, x, y);
  precondition(pred(x.you, y.you, dist(x.you, y.you)), `${tag}: the pose no longer fits on the seated hulls`);
  return [x, y];
}

// -------------------------------------------------------------- assertions ---

const rosterIds = (ctx) => {
  const ids = [];
  ctx.room.state.players.forEach((_meta, id) => ids.push(id));
  return ids;
};

/**
 * THE EYE, one direction: over every recorded frame of observer `me`, is the
 * subject a contact — exactly as wanted, in EVERY frame (the hulls are seated
 * and stationary, so nothing is in transit) — and, when it is, a FULL one (its
 * class on the row: there is one hull tier). Scoped to the subject by id,
 * because other seated hulls (the anchors) legitimately sit in someone's reach.
 * Plus the bounds that scoping would otherwise drop: NO contact beyond the
 * hull sight, for any id, in any frame (rain and haze only ever hide; neither
 * client fires a star shell, so the lit-zone parity path cannot arise), and no
 * frame carries the removed `pc` channel.
 */
function checkEye(label, frames, me, subject, want) {
  assert(frames.length > MIN_FRAMES, `${label}: only ${frames.length} frames recorded`);
  const id = subject.room.sessionId;
  const rows = frames.map((f) => f.contactD.find((c) => c.id === id)).filter((c) => c !== undefined);
  assert(rows.length === (want.contact ? frames.length : 0), `${label}: contact in ${rows.length}/${frames.length} frames (want ${want.contact ? 'all' : 'none'})`);
  for (const c of rows) assert(c.cls === DEFAULT_CLASS_ID, `${label}: the contact row carries class ${JSON.stringify(c.cls)} (want a full contact: ${DEFAULT_CLASS_ID})`);
  for (const f of frames) {
    assert(!f.hasPc, `${label}: a frame carries the removed 'pc' channel`);
    for (const c of f.contactD) assert(c.d <= HULL_SIGHT + SIGHT_TOL, `${label}: contact ${c.id} at ${c.d.toFixed(0)}u > hull sight ${HULL_SIGHT.toFixed(0)}u`);
  }
  return frames.length;
}

/**
 * THE RADAR, one direction, over the observer's window [w0, w1] (server ms).
 * `paints` — one return per sweep revolution, ON the subject: the count is the
 * number of revolutions the window holds (floor..ceil), consecutive paints are
 * a period apart, and NO return near the subject is off it (the unfiltered
 * 2x-attribution shell — a mis-rasterized or wrong-pose return fails instead
 * of being silently excluded from the count). Otherwise: no return anywhere
 * near the subject. Returns the attributed paints.
 */
function checkRadar(label, me, subject, w0, w1, paints) {
  const inWindow = me.blips.filter((e) => e.t >= w0 && e.t <= w1);
  const near = inWindow.filter((e) => dist(blipCenter(e), subject.you) < 2 * ATTRIBUTE_U);
  if (!paints) {
    assert(near.length === 0, `${label}: ${near.length} radar return(s) on a subject radar must not paint`);
    return near;
  }
  const offTarget = near.filter((e) => dist(blipCenter(e), subject.you) >= ATTRIBUTE_U);
  assert(offTarget.length === 0,
    `${label}: ${offTarget.length} return(s) near the subject but off it (${offTarget.map((e) => dist(blipCenter(e), subject.you).toFixed(0)).join(',')}u; attribute<${ATTRIBUTE_U}u)`);
  const revs = (w1 - w0) / PERIOD;
  assert(near.length >= Math.floor(revs) && near.length <= Math.ceil(revs),
    `${label}: ${near.length} paints over ${revs.toFixed(2)} revolutions (want ${Math.floor(revs)}-${Math.ceil(revs)})`);
  for (let i = 1; i < near.length; i++) {
    const gap = near[i].t - near[i - 1].t;
    assert(Math.abs(gap - PERIOD) < PERIOD / 10, `${label}: paint gap ${gap}ms (want ~${PERIOD})`);
  }
  return near;
}

/** Both sensors, both ways, for a seated pair. */
function checkPair(label, obs, x, y, want) {
  const n = checkEye(`${label}/A`, obs.a, x, y, { contact: want.contact });
  checkEye(`${label}/B`, obs.b, y, x, { contact: want.contact });
  const ba = checkRadar(`${label}/A`, x, y, obs.w0.a, obs.w1.a, want.paints);
  const bb = checkRadar(`${label}/B`, y, x, obs.w0.b, obs.w1.b, want.paints);
  return { frames: n, blips: `A=${ba.length} B=${bb.length}` };
}

// ------------------------------------------------------------------ phases ---

/** Two water points on a diameter, a pose clearance inside the rim. */
function diameterPair(map) {
  const r = map.radius - POSE_CLEAR;
  const clear = (p) => map.islands.every((i) => Math.hypot(p.x - i.x, p.y - i.y) > i.r + POSE_CLEAR);
  for (let k = 0; k < 360; k++) {
    const ang = (k * Math.PI) / 180;
    const p = { x: Math.cos(ang) * r, y: Math.sin(ang) * r };
    const q = { x: -p.x, y: -p.y };
    if (clear(p) && clear(q)) return { p, q, d: 2 * r };
  }
  throw new Error(`precondition: far: no island-clear diameter on seed ${MAP_SEED}`);
}

async function phaseFar(a, b, log) {
  const d0 = dist(a.you, b.you);
  precondition(d0 > RADAR + SIGHT_TOL, `far: anchors ${d0.toFixed(0)}u apart <= radar ${RADAR.toFixed(0)}u`);
  const obs = await observe(a, b, 1.5);
  checkPair('far', obs, a, b, { contact: false, paints: false });
  log.push(`far: dist=${d0.toFixed(0)}u > radar ${RADAR.toFixed(0)}u — no contact, no blip over ${(PERIOD * 1.5) / 1000}s (${obs.a.length}f)`);
}

/** The zone is running (the anchors' 2nd join started it) — read off the
 *  schema, as a client: from here the eye rides the live ring. The rain itself
 *  needs no wait: it is there from the first tick. */
async function zoneRunning(anchor) {
  const start = Date.now();
  for (;;) {
    if (anchor.room.state.zoneState !== 'idle') return anchor.now - anchor.room.state.zoneStartT;
    precondition(Date.now() - start < ZONE_START_BUDGET_MS, `rain: the zone never started (zone ${anchor.room.state.zoneState})`);
    await sleep(CONFIG.fog.refreshMs);
  }
}

/** A phase must finish inside the window its pair was picked for. */
function rainHeld(board, view, label) {
  const now = board.anchor.now;
  precondition(now <= view.until, `${label}: the phase outran its weather window (${((now - view.t) / 1000).toFixed(1)}s > ${(RAIN_HORIZON_MS / 1000).toFixed(1)}s)`);
}

/** Is the weather surely NOT what hides anything on this pair: even the
 *  deepest grid point of either hull (rain + distance haze), at any sampled
 *  instant, is under T by the margin. */
const rainLetsThrough = (board, view, p, q) => {
  if (board.depth(view, p, q).max > RAIN_T - RAIN_MARGIN) return false; // the cheap center ray first
  return board.pairDepth(view, p, q).farthest <= RAIN_T - RAIN_MARGIN;
};

/**
 * RAIN HIDES. The pair: inside class sight, an island-clear ray both ways and
 * a clear radar line — so with no rain it is the SIGHT phase's contact — and
 * enough rain on it that EVERY point of each hull's sight grid, from the
 * other's eye and at every sampled instant, is past T by the margin. Radar
 * paints it all the same.
 */
async function phaseRain(board, roomId, log) {
  const view = board.rainView();
  const pred = (p, q) => {
    if (!board.los(p, q) || !board.radarClear(p, q)) return false;
    if (board.depth(view, p, q).min < RAIN_T + RAIN_MARGIN) return false; // the cheap center ray first
    const depth = board.pairDepth(view, p, q);
    return depth.nearest >= RAIN_T + RAIN_MARGIN ? depth : false;
  };
  const found = board.findPair('rain', RAIN_T, SIGHT - HULL.length, pred);
  const [x, y] = await seat(board, roomId, 'RAIN', found, pred);
  const obs = await observe(x, y, 1.5);
  rainHeld(board, view, 'rain');
  const got = checkPair('rain', obs, x, y, { contact: false, paints: true });
  log.push(`rain: dist=${found.d.toFixed(0)}u < class sight ${SIGHT.toFixed(0)}u, ray island-clear, optical depth >= ${found.info.nearest.toFixed(0)} at every grid point over the window (T ${RAIN_T.toFixed(0)}) — no contact either way (${got.frames}f); radar paints through (${got.blips})`);
  await leave(x, y);
}

/**
 * THE FADING BAND (Eric 2026-11-15): beyond class sight, inside the hull
 * sight, on an island-clear ray where rain + distance haze leave every grid
 * point of each hull under T by the margin at every sampled instant — a FULL
 * contact both ways (checkEye pins the class on the row and that no frame
 * carries `pc`), and radar paints it too. The pair is taken from the near
 * half of the band so the haze leaves the rain room. Past the hull sight the
 * haze alone is T: that hull is the BAND phase's (no contact).
 */
async function phaseHaze(board, roomId, log) {
  const view = board.rainView();
  const pred = (p, q) => {
    if (!board.los(p, q) || !board.radarClear(p, q)) return false;
    if (board.depth(view, p, q).max > RAIN_T - RAIN_MARGIN) return false; // the cheap center ray first
    const depth = board.pairDepth(view, p, q);
    return depth.haze > 0 && depth.farthest <= RAIN_T - RAIN_MARGIN ? depth : false;
  };
  const found = board.findPair('haze', SIGHT + HULL.length, lerp(SIGHT, HULL_SIGHT, HAZE_BAND_FRAC), pred);
  const [x, y] = await seat(board, roomId, 'HAZE', found, pred);
  const obs = await observe(x, y, 1.5);
  rainHeld(board, view, 'haze');
  const got = checkPair('haze', obs, x, y, { contact: true, paints: true });
  log.push(`haze: dist=${found.d.toFixed(0)}u in (class sight ${SIGHT.toFixed(0)}, hull sight ${HULL_SIGHT.toFixed(0)}]u — a FULL contact both ways (id + class), fading: distance haze up to ${found.info.haze.toFixed(0)} + rain <= ${found.info.farthest.toFixed(0)} of T ${RAIN_T.toFixed(0)} at every grid point over the window; no frame.pc (${got.frames}f); blips ${got.blips}`);
  await leave(x, y);
}

/** Inside class sight: a contact; radar still paints. */
async function phaseSight(board, roomId, log) {
  const view = board.rainView();
  // Longer than T, so the rain COULD have hidden it — and does not.
  const pred = (p, q) => board.los(p, q) && board.radarClear(p, q) && rainLetsThrough(board, view, p, q);
  const found = board.findPair('sight', RAIN_T, SIGHT - HULL.length, pred);
  const [x, y] = await seat(board, roomId, 'SIGHT', found, pred);
  const obs = await observe(x, y, 1.5);
  rainHeld(board, view, 'sight');
  const got = checkPair('sight', obs, x, y, { contact: true, paints: true });
  log.push(`sight: dist=${found.d.toFixed(0)}u < class sight — contact both ways (${got.frames}f); radar still paints (${got.blips})`);
  await leave(x, y);
}

/**
 * The island rules. THE RADAR CLAUSE IS HEIGHT-AWARE (Story 4.11): binary
 * polygon LOS gates the eye, but the radar gate is `visibilityTo(...) > 0` — a
 * low island does not hide a ship from radar. So the two covers are posed
 * apart: HARD (absolute cover both ways) blinds both sensors; LOW (coastline on
 * the ray, radar line clear both ways) blinds the eye only. Both inside class
 * sight on a ray the rain surely lets through — the island is the only thing
 * hiding the hull.
 */
async function phaseIsland(board, roomId, log) {
  const view = board.rainView();
  const near = (cover) => (p, q) => !board.los(p, q) && cover(p, q) && rainLetsThrough(board, view, p, q);

  const hardPred = near(board.hardCover);
  const hard = board.findPair('island-hard', HULL.length, SIGHT - HULL.length, hardPred);
  let [x, y] = await seat(board, roomId, 'ROCK', hard, hardPred);
  let obs = await observe(x, y, 1.5);
  rainHeld(board, view, 'island-hard');
  const gotHard = checkPair('island-hard', obs, x, y, { contact: false, paints: false });
  log.push(`island: hard cover at ${hard.d.toFixed(0)}u (inside class sight): no contact, no blip (${gotHard.frames}f)`);
  await leave(x, y);

  const lowPred = near(board.radarClear);
  const low = board.findPair('island-low', HULL.length, SIGHT - HULL.length, lowPred);
  [x, y] = await seat(board, roomId, 'SHOAL', low, lowPred);
  obs = await observe(x, y, 1.5);
  const gotLow = checkPair('island-low', obs, x, y, { contact: false, paints: true });
  log.push(`island: low cover at ${low.d.toFixed(0)}u (inside class sight): the eye is blocked (${gotLow.frames}f), radar sees over it (${gotLow.blips})`);
  await leave(x, y);

  // Hard cover in the radar band (beyond every eye reach): radar stays blind.
  const farPred = (p, q) => board.hardCover(p, q);
  const far = board.findPair('island-band', lerp(EYE_MAX, RADAR, 1 / 3), lerp(EYE_MAX, RADAR, 2 / 3), farPred);
  [x, y] = await seat(board, roomId, 'LEE', far, farPred);
  obs = await observe(x, y, 2.2);
  const gotFar = checkPair('island-band', obs, x, y, { contact: false, paints: false });
  log.push(`island: hard cover at ${far.d.toFixed(0)}u (radar band): no blip over ${(PERIOD * 2.2) / 1000}s (${gotFar.frames}f)`);
  await leave(x, y);
}

/**
 * The radar band + the shell reveal, on one pair: beyond every eye reach,
 * inside radar AND inside the firer's gun reach, on a lane island-clear over
 * the salvo's whole width (so the shells fly it) with a clear radar line.
 */
async function phaseBandAndShell(board, roomId, log) {
  const lo = EYE_MAX;
  const hi = Math.min(RADAR, GUN.rangeU);
  precondition(hi > lo, `band: no room between the eye reaches (${lo.toFixed(0)}u) and min(radar, gun reach) (${hi.toFixed(0)}u)`);
  const pred = (p, q) => board.los(p, q) && board.radarClear(p, q) && board.laneClear(p, q);
  const found = board.findPair('band', lerp(lo, hi, 1 / 3), lerp(lo, hi, 2 / 3), pred);
  const [a, b] = await seat(board, roomId, 'BAND', found, pred);

  const obs = await observe(a, b, 2.5);
  const got = checkPair('band', obs, a, b, { contact: false, paints: true });
  log.push(`band: dist=${found.d.toFixed(0)}u in (${EYE_MAX.toFixed(0)}, ${RADAR.toFixed(0)}]u — past the hull sight ${HULL_SIGHT.toFixed(0)}u the haze has taken the hull: no contact (${got.frames}f); one blip per ${PERIOD}ms sweep each way (${got.blips})`);

  await phaseShellReveal(a, b, log);
  await leave(a, b);
}

async function phaseShellReveal(a, b, log) {
  const aShells0 = a.shells.length;
  const bShells0 = b.shells.length;
  const aBooms0 = a.booms.length;
  const hp0 = b.you.hp;
  const d = dist(a.you, b.you);
  const aim = bearing(a.you, b.you);
  let firing = true;
  a.script = (ctx, inp) => {
    inp.slot = 0;
    inp.aim = aim;
    inp.aimDist = d; // the shell bursts AT the click point
    // The hull is seated bow-on, so its forward turrets bear: click every
    // tick while allowed; each turret's reload paces its own shots.
    if (firing) inp.fireSeq = ++ctx.fireSeq;
  };
  await waitFor(() => a.shells.length > aShells0, 10000, 'shell: A never fired');
  firing = false;
  // The owner's launch event carries the shell's velocity: the flight time and
  // the per-tick travel come from the wire, not from a constant.
  const speed = Math.hypot(a.shells[aShells0].vx, a.shells[aShells0].vy);
  assert(speed > 0 && Number.isFinite(speed), `shell: A's launch event carries no velocity (${speed})`);
  const tol = (speed * CONFIG.tick.simDtMs * SHELL_TOL_TICKS) / 1000;
  await sleep((d / speed) * 1000 + PERIOD / 2); // let every shell land
  a.script = null;
  const aShells = a.shells.slice(aShells0);
  const bShells = b.shells.slice(bShells0);
  assert(bShells.length > 0, 'shell: no shell ever entered B shell sight');
  for (const sb of bShells) {
    const sa = aShells.find((e) => e.id === sb.id);
    assert(sa, `shell: B saw ${sb.id} that A (owner) never did`);
    // Reveal must be LATER than launch — never on the launch tick. The exact
    // delay is geometry ((standoff - shell sight) / shellSpeed, later still on
    // a rained ray); the load-bearing anti-cheat check is the reveal POSITION
    // below (the shell materializes at B's shell-sight boundary, not at A's
    // muzzle).
    assert(sb.t - sa.t >= CONFIG.tick.simDtMs, `shell: ${sb.id} revealed to B on its launch tick (+${(sb.t - sa.t).toFixed(0)}ms)`);
    assert(sa.ttl === undefined && sb.ttl === undefined, `shell: ${sb.id} carried a ttl (range-derivable field must not be on the wire)`);
    assert(sb.seenAt && dist(sb, sb.seenAt) <= CONFIG.vision.shellSight + tol, `shell: ${sb.id} revealed ${sb.seenAt ? dist(sb, sb.seenAt).toFixed(0) : '?'}u from B (outside shell sight)`);
  }
  // Beyond its splash reach A sees ONLY the end of its own gun shells (epic-11
  // amendment 11, the owner arm: a firer is always sent where his own shell
  // ended) — and never a victim id: B sits in the radar band, beyond A's class
  // reach, so no boom may name it (no hit confirmation leak).
  const aBooms = a.booms.slice(aBooms0);
  const ownIds = new Set(aShells.map((e) => e.id));
  for (const e of aBooms) {
    const inSplash = e.seenAt && dist(e, e.seenAt) <= CONFIG.vision.splashSight + tol;
    assert(inSplash || ownIds.has(e.id), `shell: A saw a boom ${e.seenAt ? dist(e, e.seenAt).toFixed(0) : '?'}u away that is not the end of one of its own shells`);
    assert(e.hit === undefined, `shell: A's boom ${e.id} named a victim (${e.hit}) beyond A's class reach`);
  }
  const revealed = bShells.map((sb) => {
    const sa = aShells.find((e) => e.id === sb.id);
    return `${sb.id}:+${(sb.t - sa.t).toFixed(0)}ms@${dist(sb, sb.seenAt).toFixed(0)}u`;
  });
  log.push(`shell: A fired ${aShells.length} from ${d.toFixed(0)}u, revealed to B ${bShells.length} [${revealed.join(' ')}] (shell sight ${CONFIG.vision.shellSight.toFixed(0)}u), B.hp ${hp0}->${b.you.hp}, A booms seen=${aBooms.length}`);
}

// -------------------------------------------------------------------- main ---

const log = [];

async function main() {
  const map = generateMap(MAP_SEED, CONFIG.map.playerCap);
  const far = diameterPair(map);
  const toQ = bearing(far.p, far.q);
  const a = await joinClient('FOG-A', { x: far.p.x, y: far.p.y, heading: toQ });
  const roomId = a.room.roomId;
  const b = await joinClient('FOG-B', { x: far.q.x, y: far.q.y, heading: toQ + Math.PI }, roomId);
  a.other = b;
  b.other = a;
  assert(a.room.roomId === b.room.roomId, 'clients joined different rooms');
  const pump = setInterval(() => { for (const c of live) control(c); }, CONFIG.tick.simDtMs);
  await awaitPosed('far', a, b);
  precondition(a.welcome.mapRadius === undefined || a.welcome.mapRadius === map.radius, `the room's map radius ${a.welcome.mapRadius} is not the pinned map's ${map.radius}`);
  const board = makeBoard(map, a.welcome.fogSeed, a);

  await phaseFar(a, b, log);
  // The anchors' join started the zone; the rain was there before it. Every
  // later pair is picked against the live field, each inside its own bracket.
  const since = await zoneRunning(a);
  log.push(`weather: raining from the start line; zone running ${(since / 1000).toFixed(1)}s (seed ${a.welcome.fogSeed}, T ${RAIN_T.toFixed(0)})`);
  await phaseRain(board, roomId, log);
  await phaseHaze(board, roomId, log);
  await phaseSight(board, roomId, log);
  await phaseIsland(board, roomId, log);
  await phaseBandAndShell(board, roomId, log);

  console.log('RAIN SMOKE OK:', { room: roomId, seed: a.welcome.mapSeed });
  for (const line of log) console.log('  ' + line);
  clearInterval(pump);
  await leave(a, b);
  process.exit(0);
}

main().catch((err) => {
  console.error('RAIN SMOKE FAILED:', err.message);
  for (const line of log) console.error('  ' + line);
  process.exit(1);
});
