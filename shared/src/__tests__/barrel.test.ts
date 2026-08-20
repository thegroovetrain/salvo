import { describe, it, expect } from 'vitest';
import * as shared from '../index.js';
import {
  PROTOCOL_VERSION,
  CONFIG,
  DRONE_HULL_IDS,
  fleetHullIds,
  fleetLevels,
  MSG,
  SLOT_COUNT,
  effectiveStats,
  equipmentMaxAmmo,
  equipmentReloadMs,
  burstVictims,
  parallelOffsets,
  straddleOffsets,
  mapRadius,
  stepShip,
  generateMap,
  wrapAngle,
  mulberry32,
  segCircleHit,
  HULL_IDS,
  hullEnvelope,
  hullSilhouette,
  transformPolygon,
  segPolygonHit,
  polygonMaxRadius,
  perpendicularExtent,
  loadoutFor,
  boostedKinematics,
  slowedKinematics,
  EQUIPMENT_IS_WEAPON,
  BOON_CATALOG,
  BOON_STAT_PATHS,
  DOCTRINE_MODES,
  EQUIPMENT_CATEGORY,
  HOOK_REGISTRY,
  NO_BOONS,
  UNIVERSAL_CATEGORIES,
  applyBoonStats,
  applySlotEffect,
  boonBehaviors,
  boonStackCount,
  buildDeck,
  consumeAcquisition,
  consumeCard,
  drawOffer,
  hookKinematics,
  isAcquisitionDef,
  resolveBoons,
  slotsWithBoons,
  validateBoonDef,
  validateCatalog,
} from '../index.js';

describe('shared barrel', () => {
  it('exposes the protocol version', () => {
    // Class-legible blips (Story 4.2): BlipEvent gains cls/heading/speed,
    // appended after `t` so the historical {k,id,x,y,t} prefix stays
    // byte-stable.
    // Global cooldown reduction (Eric rulings 2026-08-04): BOON_CATALOG
    // content changed — the seven per-equipment reload lines died and the
    // universal shipCooldown line replaced them (42 → 36) — and catalog
    // content IS wire contract. CONFIG.gun/cannon reloadMs retunes ride the
    // welcome config snapshot with it.
    // The gunnery conversation (Story 4.3, amendments 15-20): three new
    // GameEvent kinds — sp (fall of shot, self-private, gun family only),
    // hc (Hit Call, shooter-only, all ordnance, never severity/victim), mz
    // (neutral muzzle flash, no identity for anyone) — plus the derived
    // CONFIG.vision.muzzleFlash halo in the welcome config snapshot.
    // The public register (PV 23): SunkEvent gains the optional per-observer
    // seen?: true flag (key order k,id,by?,seen?) and the sunk row widens to
    // witnessed / credited-killer / human-victim-public — the 4th declared
    // perception exception.
    // DAMAGE CONTROL (PV 24, Eric rulings 2026-08-04): the heal returns as an
    // always-available spend (NOT a card) — HEAL_CHOICE (-1) on
    // SpendMsg.choice, required self-private OwnShip.repairHp, the
    // self-private 'heal' GameEvent, and CONFIG.damageControl in the
    // welcome config snapshot.
    // WOUNDED SMOKE (PV 25, Eric rulings 2026-08-05, amendments 40-49): the
    // new 'sm' GameEvent ({k,x,y,tier} — no identity for ANY observer, tier a
    // two-value enum) plus CONFIG.damageBands and CONFIG.smoke in the welcome
    // config snapshot. Reach reuses CONFIG.vision.muzzleFlash — no new vision
    // constant.
    // THE HEIGHT FIELD (PV 29, cycle 59, Eric ruling 2026-08-06): the capsule
    // generator is replaced by a genuine fBm height field — Island loses
    // `skeleton`, gains `pole`/`contours`, coverage retunes 3-5% -> 2-3%, and
    // GameMap gains the retained height raster + max pyramid. The SAME
    // mapSeed builds a COMPLETELY different ocean, so an un-bumped client
    // would desync catastrophically. Map geometry still never travels on the
    // wire.
    // FRACTAL ISLANDS (PV 28, cycle 52): islands became polygon coastlines, so
    // the SAME mapSeed now builds a different ocean — an un-bumped old client
    // would generate circles where the server has coastlines and desync
    // catastrophically. Map geometry still never travels on the wire. Every
    // LOS-gated sensor (radar paint, truesight, muzzle flash, wounded smoke,
    // the foghorn's one-tier muffle) is now polygon-EXACT where it was
    // bounding-circle conservative, so islands block strictly less.
    // THE EIGHTHS LADDER (PV 30, Story 4.9, Eric rulings 2026-08-06,
    // amendments 113/118/119/121/122/123): CONFIG.vision becomes one ruler of
    // SIGHT-derived eighths — new `detect` (3/8) + `detectFactor` and new
    // `farRadar` (7/8, deliberately unconsumed), `muzzleFlash` moves 6/8 -> 5/8
    // (dragging wounded-smoke reach with it), `sight`/`radar` untouched. The
    // bump is required on two independent grounds: FoghornEvent.v widens from a
    // 3-value tier to an 8-value band, and the client's torpedo dead-reckoning
    // cull becomes detect-derived — a stale client would MISRENDER either way.
    // THE SERVER RASTERIZES THE HULL (PV 31, cycle 63, Eric ruling
    // 2026-08-07, amendments 151-155): the `return`-grammar blip payload is
    // REPLACED — {k,id,x,y,t,ext} becomes {k,t,gx,gy,w,h,bits}, a
    // world-anchored coverage footprint rasterized server-side from the true
    // hull polygon on the shared radar grid (new CONFIG.vision.radarCellU +
    // sim/radarRaster.ts). Disclosure REDUCES: no id, no ext, no exact
    // position — a stale client would read the old fields as undefined and
    // paint nothing, so the bump is a hard gate.
    // RADAR WAKES (PV 32, Story 4.12, Eric rulings 2026-08-08, amendments
    // 194-196): new `wk` GameEvent (WakeBlipEvent {k,t,a,gx,gy,w,h,bits}) —
    // a wake ribbon segment the observer's sweep crossed this tick, geometry
    // plus a quantized water-age bucket and NO identity of any kind; CONFIG
    // gains vision.wakeLifeMs/wakeSampleU/wakeTorpLifeFactor (ride the
    // welcome snapshot). A stale client would drop `wk` events and draw a
    // scope disagreeing with the server's disclosure, so the bump is a hard
    // gate.
    // THE BOUNTY (PV 33, Story 4.6, Eric ruling 2026-08-10): ArenaState gains
    // `bountyId` (the throne holder's session id, appended after winnerId —
    // IDENTITY ONLY, '' while vacant) and SunkEvent gains an optional trailing
    // `bty?: true` (the victim held the bounty at the instant of sinking).
    // CONFIG gains the `bounty` block (killLevels / minCaptainKills), riding
    // the welcome config snapshot. A stale client would miss the schema field
    // and drop `bty`, silently mis-rendering the bounty registers.
    // THE SINKING WINDOW (PV 34, Story 5.2, Eric rulings 2026-08-12,
    // amendments 10-17): OwnShip gains the optional SELF-PRIVATE trailing
    // `sinkingUntil` (absolute server-clock ms the hull founders; omitted when
    // not sinking — the slowedUntil precedent, rides `you` and nothing else,
    // master perception invariant stays at exactly SIX exceptions). Needed
    // because `alive` goes false at sink-entry (amendment 11) while every
    // weapon and the horn stay live for the flat 5 s window (amendment 10) —
    // a stale client would read a sinking captain as plain dead and snap to
    // spectate five seconds early. CONFIG.ship.sinkingWindowMs (5000, all
    // classes — amendment 13) rides the welcome config snapshot; new shared
    // sim/sinking.ts rides the barrel.
    // ROVING PvE FLEETS + THE BIGGER OCEAN (PV 36, Story 5.6, Eric rulings
    // 2026-08-14, amendments 33-44): TWO independent wire breaks. (a)
    // CONFIG.map.baseRadius 2400 -> 2800 — the same seed now builds a
    // different ocean (the cycle-59 precedent), and the client sanity-checks
    // welcome.mapRadius. (b) Contact gains an optional self-private trailing
    // `aggro`: true only on a PvE fleet hull's row for the observer it has
    // acquired, omitted otherwise (the sinkingUntil precedent) — discloses
    // nothing spatially new, master perception invariant stays at exactly SIX
    // exceptions. Also riding this bump: fleet hulls fit
    // [gun, empty, empty, empty] (was the universal [gun, torpedo, mine,
    // empty]); drone envelopes retune (hp 60/75/90, maxSpeed 40/35/30); the
    // match-start drone fill is deleted (no more roster rows for drones).
    // SUDDEN DEATH — THE FINAL COLLAPSE (PV 35, Eric ruling 2026-08-14): the
    // storm timeline gains a FOURTH ring group whose ring is the terminal
    // ring's own center at radius 0 (marked at 14:00, closing 15:00-16:00, all
    // storm from 16:00). NO schema field, NO new event, NO perception change —
    // the collapse ring rides the wire as the existing `zoneNextR === 0`
    // unrevealed sentinel and both sides synthesize it. The bump is needed
    // because the group count and total length change (zoneClosedAtMs 720_000 →
    // 960_000): a stale client would derive the wrong rhythm from its own
    // bundled CONFIG.zone and the same zoneStartT. (NOT because CONFIG gained a
    // field: no client code reads `welcome.config` — see index.ts's PV 35 note.) and draw an open 660u safe circle over an all-storm map.
    // THE REQUEUE SIGNAL RIDES THE ARENA (PV 37, Story 6.3, epic-6 amendments
    // 15/17/18): new server->client channel MSG.requeue ('rq') carrying
    // RequeueMsg { reason: 'cohortLost' } — a queue-formed room that falls below
    // minHumans during the countdown is sealed and can never refill, so it
    // collapses, and the survivor must be able to tell that apart from a normal
    // match-end disconnect (which returns home and WAITS for input). Story 6.1
    // held the constant at 36 because MSG.queueStatus/seat ride the QUEUE room
    // only (amendment 6); this one rides the ARENA, so that reasoning does not
    // cover it.
    // 37 -> 38: THE INTEL RANGE MERGE (Eric rulings 2026-08-16). Boon ids ride
    // the wire and the client resolves them fail-closed, so retiring
    // `intelTruesight`/`intelRadar` in favour of `intelRange` is a wire-contract
    // break — the PV join gate is the only thing that stops a stale bundle
    // silently dropping the card.
    // 40 -> 41: THE ONE RADAR (cycle 105, Eric ruling 2026-08-19: "the radar
    // on prod is the ONLY radar"): the retired `silhouette` grammar and the
    // `roster` id namespace are deleted end to end. WelcomeMsg LOSES its two
    // required radar-mode fields (the room-wide announcement the client used
    // to narrow blips on) and BlipEvent collapses to ReturnBlipEvent alone —
    // a stale client would wait on welcome fields that never arrive and
    // mis-narrow every paint, so the PV join gate is the guard.
    // 41 -> 42: UPGRADE CARDS v2, WAVE 1 (Story 7-5, Eric's card rewrite).
    // Three breaks at once: BOON_CATALOG is rewritten (7 lines deleted, 2 new,
    // copy counts and ladder FORMS moved — a stale client resolves a deleted id
    // fail-closed and silently drops the whole boon, so its prediction and HUD
    // disagree with the sim); the doctrine `mode` enums on torpedo/mine/
    // starShells become INDEPENDENT VERB BOOLEANS (verbs stack now, which one
    // enum field cannot express); and LitZoneView trades `mode` for the two
    // optional flags `phos`/`daz`, which is the payload shape of that change.
    // 43 -> 44: THE BUOY'S OWN SCOPE (Story 7-5 fix cycle, Eric playtest —
    // "It gets its own returns. I just get to see them as the owner.").
    // ReturnBlipEvent gains the OPTIONAL `src` sensor attribution (present
    // only in the owning observer's frames; says which of YOUR sensors made
    // the return, never whether the subject is real) and BuoyView gains
    // `sweep` (the buoy's live antenna angle, the owner's wedge render input).
    // 44 -> 45: PER-TURRET FIRING ARCS (Eric ruling 2026-08-20). The
    // broadside's designed fan is deleted for per-turret aim: CONFIG.broadside
    // loses `fanHalfAngleDeg` and gains `turretMountSpreadDeg` + `traverseDeg`
    // (rides the welcome config snapshot), and the firewall's
    // `broadside.fanHalfAngleRad` becomes `traverseRad` — a stale client's
    // preview would draw a fan the server no longer fires.
    expect(PROTOCOL_VERSION).toBe(45);
    // THE RADAR REALISM CYCLE (PV 27, Eric rulings 2026-08-05, amendments
    // 62-75): BlipEvent became a tagless two-member union ({k,id,x,y,t,ext} —
    // ext pure aspect geometry, no range term, amendment 66's anti-cheat
    // bound) and WelcomeMsg gained required radar-mode fields, the room-wide
    // announcement the client narrowed on (both deleted again at PV 41). One
    // bump covers "a blip may carry either shape" (amendment 72). Landed in
    // parallel with the foghorn below: both branched from PV 25 and claimed
    // 26; 4.5 merged first, so this cycle took 27.
    // THE FOGHORN (PV 26, Eric rulings 2026-08-05, amendments 51-58): the new
    // 'fh' GameEvent ({k,h,self?,b?,v?,x?,y?} — bearing + volume tier for a
    // fogged listener, NEVER a position or ship id; the 6th declared
    // perception exception and the first per-observer-varying payload) plus
    // required InputMsg.hornSeq, the shared HORN_IDS catalog, and
    // CONFIG.foghorn in the welcome config snapshot. No vision constant added.
  });

  it('re-exports config, wire tags, and functions', () => {
    expect(CONFIG.tick.simDtMs).toBe(50);
    expect(MSG.input).toBe('i');
    expect(SLOT_COUNT).toBe(4);
    expect(typeof mapRadius).toBe('function');
    expect(typeof stepShip).toBe('function');
    expect(typeof generateMap).toBe('function');
    expect(typeof wrapAngle).toBe('function');
    expect(typeof mulberry32).toBe('function');
    expect(typeof segCircleHit).toBe('function');
    expect(typeof effectiveStats).toBe('function');
    expect(typeof equipmentMaxAmmo).toBe('function');
    expect(typeof equipmentReloadMs).toBe('function');
  });

  it('the legacy upgrade system is STRIPPED (Story 2.8, FR20)', () => {
    // The 14-id vocabulary is gone from CONFIG and from the barrel namespace.
    expect('upgrades' in CONFIG).toBe(false);
    const ns = shared as Record<string, unknown>;
    for (const gone of ['UPGRADE_IDS', 'UPGRADE_CATEGORY_IDS', 'UPGRADE_CATEGORIES', 'zeroUpgrades', 'rollBoonOffer']) {
      expect(ns[gone], gone).toBeUndefined();
    }
    // The sweep ceiling SURVIVES the strip at its new home.
    expect(CONFIG.vision.sweepRpmMax).toBe(30);
    expect(CONFIG.vision.sweepRpm).toBeLessThanOrEqual(CONFIG.vision.sweepRpmMax);
  });

  it('carries the XP economy block (Story 2.6) — the shape, tiers included', () => {
    expect(CONFIG.xp.levelMs).toBe(60000);
    expect(CONFIG.xp.levelMs % CONFIG.tick.simDtMs).toBe(0);
    expect(CONFIG.xp.killLevels).toBe(1);
    for (const id of DRONE_HULL_IDS) {
      expect(CONFIG.xp.droneTierLevels[id]).toBeGreaterThan(0);
      expect(CONFIG.xp.droneTierLevels[id]).toBeLessThan(CONFIG.xp.killLevels);
    }
    expect(Object.keys(CONFIG.xp).sort()).toEqual(['droneTierLevels', 'killLevels', 'levelMs']);
  });

  it('carries the bounty block (Story 4.6, Eric ruling 2026-08-10) — identity-only economy, no location knob', () => {
    expect(CONFIG.bounty.killLevels).toBe(1); // on top of the standard captain kill
    expect(CONFIG.bounty.minCaptainKills).toBe(1); // a zero-kill field has no bounty
    // The shape pin doubles as the no-location guard: any radius/range/bloom
    // tunable appearing here would violate the 2026-08-10 ruling by its key
    // alone.
    expect(Object.keys(CONFIG.bounty).sort()).toEqual(['killLevels', 'minCaptainKills']);
  });

  it('re-exports the universal standard gun model (single-shot pin retired in 2.8)', () => {
    expect(CONFIG.gun.maxAmmo).toBe(1); // still the BASE — gunTurret raises it via stats
    expect(CONFIG.gun.burstRadius).toBe(15);
    expect(CONFIG.gun.contactDamage).toBe(6); // RETUNED 10 -> 6 (Eric ruling 2026-08-04)
    expect(typeof burstVictims).toBe('function');
    // BARREL's parallel-track spacing replaced the fan step (Story 7-5 wave 2).
    expect(CONFIG.gun.barrelSpacingU).toBe(12);
    expect('shellRange' in CONFIG.gun).toBe(false);
    expect('mounts' in CONFIG.gun).toBe(false);
  });

  it('re-exports the firing-under-latency wire contract (Story 1.5)', () => {
    expect(MSG.ping).toBe('p');
    expect(CONFIG.net.fireBackdateCeilingMs).toBe(150);
    expect(CONFIG.net.fireJitterAllowanceMs).toBe(30);
    expect(CONFIG.net.pingIntervalMs).toBe(1000);
    expect(CONFIG.net.rttWindowMs).toBe(10000);
  });

  it('re-exports the silhouette system (Story 1.3)', () => {
    expect(HULL_IDS).toHaveLength(6);
    expect(typeof hullEnvelope).toBe('function');
    expect(typeof hullSilhouette).toBe('function');
    expect(typeof transformPolygon).toBe('function');
    expect(typeof segPolygonHit).toBe('function');
    expect(typeof polygonMaxRadius).toBe('function');
    // The return-grammar echo-size primitive (radar realism cycle, PV 26).
    expect(typeof perpendicularExtent).toBe('function');
    expect(CONFIG.drones.medium.hp).toBe(60); // RETUNED 100 -> 75 -> 60 (epic-6 amendment 24)
  });

  it('re-exports the loadout + kinematics-fold systems (boost AND the 2.8 slow)', () => {
    expect(typeof loadoutFor).toBe('function');
    expect(typeof boostedKinematics).toBe('function');
    expect(typeof slowedKinematics).toBe('function');
    expect(CONFIG.speedBoost).toEqual({ speedBonus: 10, durationMs: 6000, maxAmmo: 1, reloadMs: 18000 });
  });

  it('EQUIPMENT_IS_WEAPON: mine FLIPPED to a click-aimed weapon (Story 2.8, amendment 45)', () => {
    expect(EQUIPMENT_IS_WEAPON).toEqual({
      gun: true,
      torpedo: true,
      mine: true, // FLIPPED (was false since 1.8): aimed rear-arc placement
      speedBoost: false,
      broadside: true,
      starShells: true,
      radarBuoy: true, // FLIPPED (was false as the decoy): click-placed (7-5 w2)
    });
  });

  it('CONFIG.broadside carries the barrage block; its range stays DERIVED at the 5/8 rung', () => {
    expect(CONFIG.broadside).toEqual({
      arcOffsetDeg: 90,
      arcHalfArcDeg: 60,
      shellSpeed: 500,
      maxAmmo: 1,
      reloadMs: 30000, // Eric: "lets set the cooldown to 30 seconds"
      turrets: 3,
      // [DRAFT] fraction of hull length the battery spans (Eric's 2026-08-19
      // turret correction): three separate, evenly-spaced muzzle points across
      // the midship section, RE-SPACED (never lengthened) at 4 and 5 turrets.
      turretSpanFactor: 0.6,
      damage: 20, // Eric: "lets say 20 damage"
      burstRadius: 15, // DRAFT — the gun's own ("bursts like the gun")
      shellRadius: 2,
      // RETUNED on Eric's playtest 2026-08-20 (*"the convergence is slightly too
      // high at level 1"*): mounts widened 27 -> 28 while arcs narrowed 34 ->
      // 33.5, which tightens the OVERLAP (traverse - mountSpread, what
      // convergence needs) without shrinking the SUM (what keeps a gun on every
      // legal click). Base abeam convergence ~303u -> ~386u.
      turretMountSpreadDeg: 28, // [DRAFT] mount half-spread about the beam
      traverseDeg: [33.5, 39.5, 45.5, 51.5, 57.5], // [DRAFT] per-turret traverse ladder, index = SPREAD copies
    });
    // NO range field — it is derived from radarRange × muzzleFlashFactor, and
    // NO arc field either: the beams are a twin-sector descriptor, not 'full'.
    expect('rangeU' in CONFIG.broadside).toBe(false);
    expect('arc' in CONFIG.broadside).toBe(false);
    // One entry per reachable SPREAD rung: 0..4 copies of a ×4 card.
    expect(CONFIG.broadside.traverseDeg).toHaveLength(BOON_CATALOG.broadsideSpread.copies + 1);
  });

  it('CONFIG.radarBuoy carries the buoy\'s OWN sensor set (Story 7-5 wave 2)', () => {
    expect(CONFIG.radarBuoy).toEqual({
      radarRange: 330,
      sweepRpm: 15,
      durationMs: 20000,
      hp: 50,
      reloadMs: 30000,
      maxAmmo: 1,
      gunDamage: 5,
      gunReloadMs: 5000,
      jamFakes: 10,
    });
    // FLIPPED PIN (Eric ruling 2026-08-19, amending R2.7 mid-flight). The
    // draft had a 30s life on a 20s reload, so TWO buoys could overlap; the
    // ruling swapped both numbers, which makes one-at-a-time STRUCTURAL and
    // opens a ~10s dead gap between one expiring and the next being available.
    // The gap is intended — a buoy is a commitment, not permanent cover — so do
    // not close it with a bigger pool or a shorter reload.
    expect(CONFIG.radarBuoy.reloadMs).toBeGreaterThan(CONFIG.radarBuoy.durationMs);
    expect(CONFIG.radarBuoy.reloadMs - CONFIG.radarBuoy.durationMs).toBe(10000);
    expect(CONFIG.radarBuoy.maxAmmo).toBe(1);
  });

  it('CONFIG.starShells: DAMAGELESS (amendment 39) + the incendiary/dazzle doctrine fields', () => {
    expect(CONFIG.starShells).toEqual({
      arc: 'full',
      shellSpeed: 500,
      maxAmmo: 1,
      reloadMs: 20000,
      litRadius: 165,
      litDurationMs: 10000,
      shellRadius: 2,
      incendiaryRadiusFactor: 0.8,
      incendiaryDps: 5,
      dazzleSightFactor: 0.5,
    });
    expect('damage' in CONFIG.starShells).toBe(false);
    expect('rangeU' in CONFIG.starShells).toBe(false);
    // The ratified SIGHT/2 structural derivation survives.
    expect(CONFIG.starShells.litRadius).toBe(CONFIG.vision.sight / 2);
  });

  it('CONFIG.mine: aimed-placement + chain-era fields (Story 2.8) over the 1.8 geometry', () => {
    expect(CONFIG.mine.triggerRadius).toBe(32);
    expect(CONFIG.mine.blastRadius).toBe(48);
    expect(CONFIG.mine.blastRadius).toBeGreaterThan(CONFIG.mine.triggerRadius);
    expect(CONFIG.mine.maxLive).toBe(5);
    expect(CONFIG.mine.damage).toBe(55); // RETUNED 45 -> 55 (Eric ruling 2026-08-04)
    // The placement leash (Eric ruling 2026-08-02): 90u put the drop point
    // inside your own wake; 150u lets a Mine Layer actually seed water.
    expect(CONFIG.mine.placeRange).toBe(150);
    expect(CONFIG.mine.placeHalfArcDeg).toBe(60);
    // RETUNED (Eric ruling 2026-08-19, Story 7-5): 25% slower for 5s — a
    // weaker slow held longer, and no longer paired with a damage penalty.
    expect(CONFIG.mine.foulFactor).toBe(0.75);
    expect(CONFIG.mine.foulDurationMs).toBe(5000);
    // RETIRED (Story 7-5 wave 2): the three creep pins — creepSpeed 14 u/s,
    // creepAcquireRange 150u, and acquire > blast. They pinned the SELF-
    // PROPELLED doctrine's tuning, and that doctrine left the game with its
    // card; the constants are deleted, so the pins go with them rather than
    // being adapted. Their ABSENCE is what is pinned now — a mine cannot move.
    expect((CONFIG.mine as Record<string, unknown>).creepSpeed).toBeUndefined();
    expect((CONFIG.mine as Record<string, unknown>).creepAcquireRange).toBeUndefined();
    // CAPTIVE MINES (Story 7-5 wave 2): the swap-and-triple multiplier. Pinned
    // here as a CONFIG value; the transform itself is pinned in stats.test.ts.
    expect(CONFIG.mine.captiveTriggerFactor).toBe(3);
    // BARREL's parallel-track spacing (R2.16) — a LATERAL distance, replacing
    // the retired 3° angular fan step.
    expect(CONFIG.gun.barrelSpacingU).toBe(12);
    expect((CONFIG as Record<string, unknown>).cannon).toBeUndefined();
    expect((CONFIG as Record<string, unknown>).decoyBuoy).toBeUndefined();
  });

  it('CONFIG.torpedo: the homing doctrine fields (command detonation retired)', () => {
    expect(CONFIG.torpedo.homingTurnRate).toBe(0.5);
    expect(CONFIG.torpedo.homingAcquireRange).toBe(120);
    expect(CONFIG.torpedo.homingUpdateAngleDeg).toBe(5);
    // `commandBurstRadius` is RETIRED with COMMAND DETONATION (Story 7-5): the
    // weapon left the game, so the constant has no consumer to pin.
    // The homing travel budget (review P8): finite, so a fish can never orbit
    // forever — and long enough to cross the map twice over.
    expect(CONFIG.torpedo.homingMaxRangeU).toBe(1300);
  });

  it('re-exports the boon effect engine + Catalog v1 (Stories 2.5/2.8)', () => {
    // 42 - 7 reloads + shipCooldown; 36->35 intel merge; 35->34 cannonBlast
    // deleted; 34->33 mine ring cards merged (Eric 2026-08-16); 33->28 Story
    // 7-5 wave 1 (7 deleted, 2 new); 28->29 wave 2 (5 deleted, 6 new) — FINAL.
    expect(Object.keys(BOON_CATALOG)).toHaveLength(29);
    expect(Object.keys(HOOK_REGISTRY)).toHaveLength(0); // still EMPTY (amendment 30 satisfied data-side)
    expect(Object.isFrozen(BOON_CATALOG)).toBe(true);
    expect(Object.isFrozen(HOOK_REGISTRY)).toBe(true);
    expect(Object.isFrozen(NO_BOONS)).toBe(true);
    expect(BOON_STAT_PATHS.length).toBeGreaterThan(0);
    expect(BOON_STAT_PATHS).not.toContain('sweepPeriodMs');
    expect(UNIVERSAL_CATEGORIES).toEqual(['intel', 'ship', 'guns']);
    expect(Object.keys(EQUIPMENT_CATEGORY)).toHaveLength(7);
    expect(Object.keys(DOCTRINE_MODES)).toHaveLength(4);
    // sim/spread.ts — the ONE straddle rule both sides call (Story 7-5 wave 2).
    for (const fn of [straddleOffsets, parallelOffsets]) {
      expect(typeof fn).toBe('function');
    }
    for (const fn of [
      resolveBoons,
      applyBoonStats,
      applySlotEffect,
      slotsWithBoons,
      boonBehaviors,
      boonStackCount,
      hookKinematics,
      isAcquisitionDef,
      validateBoonDef,
      validateCatalog,
    ]) {
      expect(typeof fn).toBe('function');
    }
  });

  it('re-exports THE DECK MODEL engine + the offer/spend wire shape (Story 2.8)', () => {
    for (const fn of [buildDeck, drawOffer, consumeCard, consumeAcquisition]) {
      expect(typeof fn).toBe('function');
    }
    // RETIRED with the exclusivity mechanism (Story 7-5 wave 2, R2.6):
    // `returnCards` was the doctrine swap-out's give-back and the cannon pair
    // was the mechanism's last user, so the deck now has no inflow at all.
    expect((shared as Record<string, unknown>).returnCards).toBeUndefined();
    // ...and the AP sweep it sat beside is gone the same way.
    expect((shared as Record<string, unknown>).pierceDamage).toBeUndefined();
    expect((shared as Record<string, unknown>).PIERCE_FALLOFF).toBeUndefined();
    // The BARREL fan step is retired for a LATERAL spacing (R2.16).
    expect((shared as Record<string, unknown>).BARREL_FAN_STEP_RAD).toBeUndefined();
    // RETIRED by the lazy-draw bugfix (cycle 69/72 house style — no dead knob
    // survives): only the FRONT offer is ever materialized, so there is no
    // second banked offer to scrub stale acquisition cards out of.
    expect((shared as Record<string, unknown>).scrubAcquisitions).toBeUndefined();
    // dial ratified 0.35 -> 0.7 by Eric from 2-10 batch-sim evidence (amendment 57)
    expect(CONFIG.deck).toEqual({ rareWeightBase: 1, rareWeightPerDryLevel: 0.7 });
    expect(CONFIG.offer.size).toBe(4); // four cards, four DIFFERENT lines
    expect(MSG.spend).toBe('u');
    expect('upgradePoints' in CONFIG).toBe(false);
  });

  // NO HARDCODED XP TOTAL (Eric ruling 2026-08-16, epic-6 amendment 24: *"XP
  // is calculated from fleet comp. No need to hardcode any amount of xp into
  // the contract."*).
  //
  // Amendment 33's `expect(fleetLevels()).toBe(3)` is RETIRED, and it had gone
  // vacuous on its own terms. It existed because droneMedium paid 1/3 — a
  // NON-DYADIC rational — so a composition edit could quietly start paying
  // float dust. The current tiers are 1/4, 1/2, 3/4: all dyadic, so EVERY
  // integer composition is exactly representable and no total can carry dust.
  //
  // So the invariant moves up a level and is pinned where it can still bite:
  // the TIERS must stay exactly representable. A future tier that is not a
  // power-of-two fraction (1/3, 1/5, 0.1) reintroduces the exact hazard 33 was
  // written against, and THIS test is what fails.
  it('CONFIG.fleet block + the tier-exactness invariant (amendment 24 retires the total pin)', () => {
    for (const tier of Object.values(CONFIG.xp.droneTierLevels)) {
      // Dyadic <=> some power-of-two multiple is a whole number. 2^10 is far
      // past any plausible tier denominator and keeps the check cheap.
      expect(Number.isInteger(tier * 1024)).toBe(true);
    }
    // ...and therefore the derived total is exact, whatever it happens to be.
    expect(Number.isInteger(fleetLevels() * 1024)).toBe(true);
    expect(fleetLevels()).toBeGreaterThan(0);

    const hulls = fleetHullIds();
    expect(hulls).toHaveLength(6); // the SIX-hull spawn unit (amendment 24)
    expect(hulls.filter((id) => id === 'droneLarge')).toHaveLength(1);
    expect(hulls.filter((id) => id === 'droneMedium')).toHaveLength(2);
    expect(hulls.filter((id) => id === 'droneSmall')).toHaveLength(3);
    // fleetHullIds() is the SPAWN ORDER and is largest-first by contract, so
    // the biggest hull always gets the first (least-constrained) scatter slot.
    expect(hulls).toEqual([
      'droneLarge',
      'droneMedium',
      'droneMedium',
      'droneSmall',
      'droneSmall',
      'droneSmall',
    ]);

    expect(Object.keys(CONFIG.fleet).sort()).toEqual([
      'aimScatterU',
      'composition',
      'memoryMs',
      'spawnRetryTicks',
      'spreadU',
      'waves',
    ]);
    expect(CONFIG.fleet.composition).toEqual({ large: 1, medium: 2, small: 3 });
    expect(CONFIG.fleet.spreadU).toBe(500); // 400 -> 500 (amendment 24)
    // 8/4/2 GROUPS. The wave sizes are a RATIO — one twelve-hull fleet (i.e.
    // TWO of these groups) per ~5 captains, held constant as the storm halves
    // the field — so level totals are a consequence, never the input. Counts
    // doubled from 4/2/1 when the spawn unit halved to six hulls.
    expect(CONFIG.fleet.waves).toEqual([
      { atMs: 60000, fleets: 8 },
      { atMs: 300000, fleets: 4 },
      { atMs: 540000, fleets: 2 },
    ]);
  });
});
