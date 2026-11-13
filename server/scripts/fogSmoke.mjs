// Fog + radar smoke: live @colyseus/sdk clients against a running dev server,
// verifying the perception tiers end to end over the real wire. Every client
// lives in this process, so the poses and the oracles use ground truth while
// the FRAMES under test stay fogged.
//
// RE-POSED 2026-11-12 (Story 11.2, the hectometer ruler). The smoke was posed
// for sight 500 u / radar 1,500 u and SAILED its two hulls from phase to phase.
// On the hectometer reaches (class sight 200 hm, plain-hull sight 350 hm, radar
// 400 hm — nearly the board's diameter) those transits would take minutes, so
// it is now a SCRIPTED SCENARIO in the Story 9.15 sense: ONE pinned-map sandbox
// room, and every phase SEATS a fresh pair of hulls where it needs them through
// the dev-only `spawnOverride` pose (joinById), watches a few sweeps, and
// leaves. Nothing sails; no hull is piloted (the one scripted input is the
// shell phase's aim + click). Every pose is SEARCHED on the pinned map against
// the same shared primitives perception runs (`islandBlocksSegment`,
// `visibilityTo`, `fogTollAlong`), and every distance is derived from the
// folded stats / `CONFIG` — no reach is a literal here.
//
// THE FOG FIELD IS LIVE in a sandbox room (the zone starts at the 2nd join and
// the weather with it) and at these reaches it tolls real rays, so every phase
// whose claim is about the EYE picks its pair against the live field (welcome
// `fogSeed` + schema `fogCut` + the frame clock, bracketed over a cut slack and
// a time horizon) — and one phase makes the fog itself the subject.
//
// Phases (each line: what it proves — how it is posed):
//   0 FAR      — beyond radar there is nothing: no contact, no plain hull, no
//                blip. Two anchors on a diameter, a pose clearance inside the
//                rim (the board is wider than the radar reach); they stay for
//                the whole run and keep the room and its weather alive.
//   1 FOG      — fog SHORTENS SIGHT: a hull inside geometric class sight on an
//                island-clear ray is NOT a contact when the ray's fog toll puts
//                it past the reach (it is a plain hull if the toll leaves it
//                inside the plain-hull reach, nothing at all otherwise), and
//                radar — fog-blind — still paints it every sweep.
//   2 PLAIN    — the middle band (Story 11.2): between class sight and
//                plain-hull sight on a clear, lightly tolled ray a hull is a
//                `frame.pc` row — keys exactly h,x,y,heading,speed, `h` an
//                anonymous per-visit handle (never a roster id) — and NOT a
//                contact; radar paints it too.
//   3 SIGHT    — inside class sight on a clear, lightly tolled ray: a contact
//                both ways, never also a plain hull, and radar STILL paints
//                (amendment 210: no inner edge — the old "paints stop inside
//                sight" claim was retired with it).
//   4 ISLAND   — (a) HARD cover inside class sight (fog would not have hidden
//                it): no contact, no plain hull, no blip. (b) LOW cover inside
//                class sight (coastline on the ray, but the height-aware radar
//                shadow sees over it): still no contact and no plain hull — the
//                eye keeps binary island LOS — yet radar paints. (c) hard cover
//                in the radar band: radar stays blind.
//   5 BAND     — the radar band: beyond EVERY eye reach (plain-hull sight,
//                muzzle flash, splash) and inside radar on a clear radar line:
//                no contact, no plain hull, one blip per sweep revolution each
//                way, landing on the hull.
//   6 SHELL    — from that same band pose (inside the firer's gun reach) A
//                fires on B: A (owner) gets its shell at launch; B gets the
//                SAME shell id only once it enters B's shell-sight reach,
//                re-parameterized (later t, nearer pos), with no ttl on the
//                wire. A sees no boom beyond its splash reach (no hit
//                confirmation leak).
//
// DROPPED / CHANGED by the re-pose: nothing a phase proved is gone. "Fresh
// spawns start outside radar" became a posed diameter pair (random spawns no
// longer can); the "radar dropout flat band" standoff is gone with
// `CONFIG.vision.dropout` (every in-range, swept, unshadowed hull paints every
// sweep); the park / settle / island-detour pilots are deleted with the sailing.
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
  FOG_NO_CUT,
  HULL_IDS,
  PROTOCOL_VERSION,
  angleDiff,
  bearing,
  dispersionAxes,
  effectiveStats,
  fogTollAlong,
  generateMap,
  hullSilhouette,
  islandBlocksSegment,
  makeFogField,
  mulberry32,
  polygonMaxRadius,
  visibilityTo,
} from '@salvo/shared';

const endpoint = process.env.WS_URL || 'ws://localhost:2567';
// Every hull here is the default class with nothing fitted, so the folded
// stats are the reaches the server gates on (one derivation, both sides).
const STATS = effectiveStats(CONFIG.shipClasses[DEFAULT_CLASS_ID], []);
const SIGHT = STATS.sightRange; // class-and-name reach — a full Contact
const HULL_SIGHT = STATS.hullSightRange; // plain-hull reach — a PlainContact in frame.pc
const RADAR = STATS.radarRange;
const GUN = STATS.equipment.mainBattery;
// The farthest any EYE reaches a hull or what it does: beyond this a hull is
// radar's alone (no plain hull, no muzzle flash, no splash).
const EYE_MAX = Math.max(HULL_SIGHT, CONFIG.vision.muzzleFlash, CONFIG.vision.splashSight);
const PERIOD = STATS.sweepPeriodMs; // ms per radar revolution
// mapSeed 265 (dev-only pin): the latencyHarness scan winner (fewest islands
// for its board). The pin keeps the island field — and with it every pose
// search below — deterministic; the fog is searched live.
const MAP_SEED = 265;
// Slack on the any-hull sight bounds (checkEye). Both sides of the comparison
// come from the SAME frame, so the true slack is zero; this only absorbs a
// frame that carried contacts but no `you`, and is the radius a `pc` row is
// attributed to its (seated, stationary) subject within.
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
// THE fog margin: how far inside / outside a reach a tolled ray must sit for
// the claim to be about the mechanism and not about a boundary — half a bank.
const TOLL_MARGIN = CONFIG.fog.wavelengthU / 2;
// The fog a pair is picked against is bracketed: the cut +/- half the soft
// edge, now and one horizon ahead (the field drifts ~1-2 u/s; the server's
// memo walk agrees with the shared march to a cell at each end).
const FOG_CUT_SLACK = CONFIG.fog.edgeBand / 2;
const FOG_HORIZON_MS = 5 * PERIOD;
// One slew step of the cut: under this between two looks, the onset is over.
const FOG_STEP = (CONFIG.fog.cutRatePerS * CONFIG.fog.refreshMs) / 1000;
const FOG_SETTLE_POLL_MS = 4 * CONFIG.fog.refreshMs;
const FOG_SETTLE_BUDGET_MS = 60000;
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
// combat policy, storm (and fog) at the 2nd join. The 10-minute beat parks the
// first close 30 minutes out, so the whole run is on the full-map ring. Beacons
// and airdrops are switched off: a crate is an anonymous radar return, and this
// smoke counts returns.
const SANDBOX_ZONE = { beatMs: 600000, ringSteps: [1 / 3, 2 / 3], offsetCap: 1, terminalSightFactor: 2 };
const MATCH_OVERRIDE = { sandbox: true, beacons: false, drops: false };

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
      // EVERY contact's / plain hull's range from the observer's OWN pose in
      // the SAME frame (perception materializes at the live sim pose, and
      // `you` is the same tick's pose), which is what lets checkEye police the
      // any-hull bounds. `off` is the row's distance from the SUBJECT — a `pc`
      // row has no id, so attribution to the seated subject is geometric.
      contactD: f.contacts.map((c) => ({ id: c.id, d: dist(c, ctx.you) })),
      plain: (f.pc ?? []).map((p) => ({ h: p.h, keys: Object.keys(p).join(','), d: dist(p, ctx.you), off: dist(p, ctx.other.you) })),
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

/** The pinned map + the room's fog field, and the pose search over them. */
function makeBoard(map, fogSeed, anchor) {
  const rng = mulberry32(MAP_SEED);
  const fog = makeFogField(fogSeed, CONFIG.fog, map.radius);
  const board = {
    map,
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
    /** The live weather as a client knows it: the schema cut + the frame clock. */
    fogView: () => ({ cut: anchor.room.state.fogCut, t: anchor.now }),
    /** The fog toll on the ray p (observer) -> q, bracketed over the cut slack
     *  and the horizon: { min, max }. */
    toll(view, p, q) {
      let min = Infinity;
      let max = 0;
      for (const t of [view.t, view.t + FOG_HORIZON_MS]) {
        for (const cut of [view.cut - FOG_CUT_SLACK, view.cut, view.cut + FOG_CUT_SLACK]) {
          const v = fogTollAlong(fog, p.x, p.y, q.x, q.y, t, cut);
          min = Math.min(min, v);
          max = Math.max(max, v);
        }
      }
      return { min, max };
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
 * subject a contact (`want.contact`), a plain hull (`want.plain`), or neither —
 * exactly as wanted, in EVERY frame (the hulls are seated and stationary, so
 * nothing is in transit). Scoped to the subject — a contact by id, a `pc` row
 * by position — because other seated hulls (the anchors) legitimately sit in
 * someone's reach. Plus the any-hull bounds that scoping would otherwise drop:
 * NO contact beyond class sight and NO plain hull beyond plain-hull sight, for
 * any id, in any frame (fog only ever shortens either; neither client fires a
 * star shell, so the lit-zone parity path cannot arise).
 */
function checkEye(label, frames, me, subject, want) {
  assert(frames.length > MIN_FRAMES, `${label}: only ${frames.length} frames recorded`);
  const id = subject.room.sessionId;
  const nContact = frames.filter((f) => f.contactIds.includes(id)).length;
  const mine = frames.map((f) => f.plain.filter((p) => p.off < SIGHT_TOL));
  const nPlain = mine.filter((rows) => rows.length > 0).length;
  assert(nContact === (want.contact ? frames.length : 0), `${label}: contact in ${nContact}/${frames.length} frames (want ${want.contact ? 'all' : 'none'})`);
  assert(nPlain === (want.plain ? frames.length : 0), `${label}: plain hull in ${nPlain}/${frames.length} frames (want ${want.plain ? 'all' : 'none'})`);
  if (want.plain) {
    const handles = new Set();
    for (const rows of mine) {
      assert(rows.length === 1, `${label}: ${rows.length} plain rows on the subject in one frame`);
      assert(rows[0].keys === 'h,x,y,heading,speed', `${label}: plain row keys [${rows[0].keys}] (want h,x,y,heading,speed)`);
      handles.add(rows[0].h);
    }
    const roster = rosterIds(me);
    for (const h of handles) {
      assert(typeof h === 'string' && h.length > 0, `${label}: plain handle ${JSON.stringify(h)}`);
      assert(h !== id && !roster.includes(h), `${label}: plain handle ${h} is a roster id`);
    }
    assert(handles.size === 1, `${label}: ${handles.size} handles for one unbroken visit (want 1)`);
  }
  for (const f of frames) {
    for (const c of f.contactD) assert(c.d <= SIGHT + SIGHT_TOL, `${label}: contact ${c.id} at ${c.d.toFixed(0)}u > class sight ${SIGHT.toFixed(0)}u`);
    for (const p of f.plain) assert(p.d <= HULL_SIGHT + SIGHT_TOL, `${label}: plain hull at ${p.d.toFixed(0)}u > plain-hull sight ${HULL_SIGHT.toFixed(0)}u`);
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

/** Both sensors, both ways, for a seated pair. `want.plain` may be a pair
 *  [x sees y, y sees x] — the fog toll is directional. */
function checkPair(label, obs, x, y, want) {
  const plain = Array.isArray(want.plain) ? want.plain : [want.plain, want.plain];
  const n = checkEye(`${label}/A`, obs.a, x, y, { contact: want.contact, plain: plain[0] });
  checkEye(`${label}/B`, obs.b, y, x, { contact: want.contact, plain: plain[1] });
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
  checkPair('far', obs, a, b, { contact: false, plain: false, paints: false });
  log.push(`far: dist=${d0.toFixed(0)}u > radar ${RADAR.toFixed(0)}u — no contact, no plain hull, no blip over ${(PERIOD * 1.5) / 1000}s (${obs.a.length}f)`);
}

/** The onset is over once the cut exists and has stopped slewing. */
async function fogSettled(anchor) {
  const start = Date.now();
  let last = NaN;
  for (;;) {
    const cut = anchor.room.state.fogCut;
    if (cut < FOG_NO_CUT && Math.abs(cut - last) < FOG_STEP) return cut;
    last = cut;
    precondition(Date.now() - start < FOG_SETTLE_BUDGET_MS, `fog: the cut never settled (last ${cut})`);
    await sleep(FOG_SETTLE_POLL_MS);
  }
}

/** The weather a pair was picked against must still be the weather it was
 *  observed under (inside the bracket `board.toll` took). */
function fogHeld(board, view, label) {
  const nowView = board.fogView();
  precondition(Math.abs(nowView.cut - view.cut) <= FOG_CUT_SLACK && nowView.t - view.t <= FOG_HORIZON_MS,
    `${label}: the fog moved under the phase (cut ${view.cut.toFixed(3)} -> ${nowView.cut.toFixed(3)}, ${((nowView.t - view.t) / 1000).toFixed(1)}s)`);
}

/** Geometric range `d` reads as inside `reach` on BOTH tolled rays, by the
 *  fog margin: the worst-case toll still leaves it inside. */
const tolledInside = (board, view, p, q, d, reach) =>
  d + Math.max(board.toll(view, p, q).max, board.toll(view, q, p).max) <= reach - TOLL_MARGIN;

/**
 * FOG SHORTENS SIGHT. The pair: inside geometric class sight by the margin, an
 * island-clear ray both ways and a clear radar line — so with no fog it is the
 * SIGHT phase's contact — and enough fog on the ray, in BOTH directions and
 * across the whole bracket, to put it past class sight by the margin. What the
 * outer tier makes of it is decided per direction (the toll is directional):
 * still inside plain-hull sight after the toll -> a plain hull; past it ->
 * nothing; a pair that is neither by the margin is not picked.
 */
async function phaseFog(board, roomId, log) {
  const view = board.fogView();
  const outer = (p, q, d) => {
    const t = board.toll(view, p, q);
    if (d + t.min < SIGHT + TOLL_MARGIN) return null; // not hidden by the margin
    if (d + t.max <= HULL_SIGHT - TOLL_MARGIN) return { plain: true, toll: t };
    if (d + t.min >= HULL_SIGHT + TOLL_MARGIN) return { plain: false, toll: t };
    return null;
  };
  const pred = (p, q, d) => {
    if (!board.los(p, q) || !board.radarClear(p, q)) return false;
    const ab = outer(p, q, d);
    const ba = ab && outer(q, p, d);
    return ba ? { ab, ba } : false;
  };
  const found = board.findPair('fog', TOLL_MARGIN, SIGHT - TOLL_MARGIN, pred);
  const [x, y] = await seat(board, roomId, 'FOGCUT', found, pred);
  const obs = await observe(x, y, 1.5);
  fogHeld(board, view, 'fog');
  const { ab, ba } = found.info;
  const got = checkPair('fog', obs, x, y, { contact: false, plain: [ab.plain, ba.plain], paints: true });
  const side = (s) => `toll ${s.toll.min.toFixed(0)}..${s.toll.max.toFixed(0)}u -> ${s.plain ? 'plain hull' : 'nothing'}`;
  log.push(`fog: dist=${found.d.toFixed(0)}u < class sight ${SIGHT.toFixed(0)}u, ray island-clear, cut ${view.cut.toFixed(3)} — no contact either way (${got.frames}f); A: ${side(ab)}; B: ${side(ba)}; radar paints through (${got.blips})`);
  await leave(x, y);
}

/** The middle band: a plain hull, not a contact. */
async function phasePlain(board, roomId, log) {
  const view = board.fogView();
  const pred = (p, q, d) => board.los(p, q) && board.radarClear(p, q) && tolledInside(board, view, p, q, d, HULL_SIGHT);
  const found = board.findPair('plain', SIGHT + TOLL_MARGIN, HULL_SIGHT - TOLL_MARGIN, pred);
  const [x, y] = await seat(board, roomId, 'PLAIN', found, pred);
  const obs = await observe(x, y, 1.5);
  fogHeld(board, view, 'plain');
  const got = checkPair('plain', obs, x, y, { contact: false, plain: true, paints: true });
  log.push(`plain: dist=${found.d.toFixed(0)}u in (${SIGHT.toFixed(0)}, ${HULL_SIGHT.toFixed(0)}]u — frame.pc row {h,x,y,heading,speed}, anonymous handle, never a contact (${got.frames}f); blips ${got.blips}`);
  await leave(x, y);
}

/** Inside class sight: a contact, never also a plain hull; radar still paints. */
async function phaseSight(board, roomId, log) {
  const view = board.fogView();
  const pred = (p, q, d) => board.los(p, q) && board.radarClear(p, q) && tolledInside(board, view, p, q, d, SIGHT);
  const found = board.findPair('sight', TOLL_MARGIN, SIGHT - TOLL_MARGIN, pred);
  const [x, y] = await seat(board, roomId, 'SIGHT', found, pred);
  const obs = await observe(x, y, 1.5);
  fogHeld(board, view, 'sight');
  const got = checkPair('sight', obs, x, y, { contact: true, plain: false, paints: true });
  log.push(`sight: dist=${found.d.toFixed(0)}u < class sight — contact both ways, not in frame.pc (${got.frames}f); radar still paints (${got.blips})`);
  await leave(x, y);
}

/**
 * The island rules. THE RADAR CLAUSE IS HEIGHT-AWARE (Story 4.11): binary
 * polygon LOS gates the eye, but the radar gate is `visibilityTo(...) > 0` — a
 * low island does not hide a ship from radar. So the two covers are posed
 * apart: HARD (absolute cover both ways) blinds both sensors; LOW (coastline on
 * the ray, radar line clear both ways) blinds the eye only. Both inside class
 * sight on a ray whose worst-case fog toll would still leave a contact — the
 * island is the only thing hiding the hull.
 */
async function phaseIsland(board, roomId, log) {
  const view = board.fogView();
  const near = (cover) => (p, q, d) => !board.los(p, q) && cover(p, q) && tolledInside(board, view, p, q, d, SIGHT);

  const hardPred = near(board.hardCover);
  const hard = board.findPair('island-hard', TOLL_MARGIN, SIGHT - TOLL_MARGIN, hardPred);
  let [x, y] = await seat(board, roomId, 'ROCK', hard, hardPred);
  let obs = await observe(x, y, 1.5);
  fogHeld(board, view, 'island-hard');
  const gotHard = checkPair('island-hard', obs, x, y, { contact: false, plain: false, paints: false });
  log.push(`island: hard cover at ${hard.d.toFixed(0)}u (inside class sight): no contact, no plain hull, no blip (${gotHard.frames}f)`);
  await leave(x, y);

  const lowPred = near(board.radarClear);
  const low = board.findPair('island-low', TOLL_MARGIN, SIGHT - TOLL_MARGIN, lowPred);
  [x, y] = await seat(board, roomId, 'SHOAL', low, lowPred);
  obs = await observe(x, y, 1.5);
  const gotLow = checkPair('island-low', obs, x, y, { contact: false, plain: false, paints: true });
  log.push(`island: low cover at ${low.d.toFixed(0)}u (inside class sight): the eye is blocked (${gotLow.frames}f), radar sees over it (${gotLow.blips})`);
  await leave(x, y);

  // Hard cover in the radar band (beyond every eye reach): radar stays blind.
  const farPred = (p, q) => board.hardCover(p, q);
  const far = board.findPair('island-band', lerp(EYE_MAX, RADAR, 1 / 3), lerp(EYE_MAX, RADAR, 2 / 3), farPred);
  [x, y] = await seat(board, roomId, 'LEE', far, farPred);
  obs = await observe(x, y, 2.2);
  const gotFar = checkPair('island-band', obs, x, y, { contact: false, plain: false, paints: false });
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
  const got = checkPair('band', obs, a, b, { contact: false, plain: false, paints: true });
  log.push(`band: dist=${found.d.toFixed(0)}u in (${EYE_MAX.toFixed(0)}, ${RADAR.toFixed(0)}]u — no contact, no plain hull (${got.frames}f); one blip per ${PERIOD}ms sweep each way (${got.blips})`);

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
    // delay is geometry ((standoff - shell sight) / shellSpeed, less on a
    // fogged ray); the load-bearing anti-cheat check is the reveal POSITION
    // below (the shell materializes at B's shell-sight boundary, not at A's
    // muzzle).
    assert(sb.t - sa.t >= CONFIG.tick.simDtMs, `shell: ${sb.id} revealed to B on its launch tick (+${(sb.t - sa.t).toFixed(0)}ms)`);
    assert(sa.ttl === undefined && sb.ttl === undefined, `shell: ${sb.id} carried a ttl (range-derivable field must not be on the wire)`);
    assert(sb.seenAt && dist(sb, sb.seenAt) <= CONFIG.vision.shellSight + tol, `shell: ${sb.id} revealed ${sb.seenAt ? dist(sb, sb.seenAt).toFixed(0) : '?'}u from B (outside shell sight)`);
  }
  // A must never see an impact beyond its splash reach (no hit confirmation leak).
  const aBooms = a.booms.slice(aBooms0);
  for (const e of aBooms) {
    assert(e.seenAt && dist(e, e.seenAt) <= CONFIG.vision.splashSight + tol, `shell: A saw a boom ${dist(e, e.seenAt).toFixed(0)}u away`);
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
  // The anchors' join started the zone and the weather; every later pair is
  // picked against the settled field. The fog-reading phases run FIRST, well
  // inside the first coverage-target period.
  const cut = await fogSettled(a);
  log.push(`weather: fog cut settled at ${cut.toFixed(3)} (seed ${a.welcome.fogSeed})`);
  await phaseFog(board, roomId, log);
  await phasePlain(board, roomId, log);
  await phaseSight(board, roomId, log);
  await phaseIsland(board, roomId, log);
  await phaseBandAndShell(board, roomId, log);

  console.log('FOG SMOKE OK:', { room: roomId, seed: a.welcome.mapSeed });
  for (const line of log) console.log('  ' + line);
  clearInterval(pump);
  await leave(a, b);
  process.exit(0);
}

main().catch((err) => {
  console.error('FOG SMOKE FAILED:', err.message);
  for (const line of log) console.error('  ' + line);
  process.exit(1);
});
