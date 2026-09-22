import { describe, it, expect } from 'vitest';
import * as shared from '../index.js';
import type { EquipmentId } from '../index.js';
import {
  PROTOCOL_VERSION,
  CONFIG,
  DRONE_HULL_IDS,
  fleetHullIds,
  fleetLevels,
  MSG,
  SLOT_COUNT,
  SLOT_BOOST,
  WEAPON_SLOTS,
  CONSUMABLE_SLOTS,
  MULLIGAN_CHOICE,
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
  hullIsFull,
  hullSilhouette,
  transformPolygon,
  segPolygonHit,
  polygonMaxRadius,
  perpendicularExtent,
  loadoutFor,
  boostedKinematics,
  slowedKinematics,
  CONSUMABLE_IDS,
  CONSUMABLE_IS_WEAPON,
  canStock,
  isConsumableId,
  isWeaponItem,
  slotMaxAmmo,
  stockSlotFor,
  EQUIPMENT_IS_WEAPON,
  BOON_STAT_PATHS,
  CATALOG,
  DOCTRINE_MODES,
  EQUIPMENT_IDS,
  EQUIPMENT_STAT_FIELDS,
  HOOK_REGISTRY,
  LINE_IDS,
  NO_CARDS,
  applyCardStats,
  applySlotEffect,
  cardBehaviors,
  cardCounts,
  catalogCardCount,
  DEFAULT_GUN,
  GUN_IDS,
  MOUNTED_GUN,
  drawOffer,
  eligibleLines,
  isGunId,
  lineWeight,
  usableLines,
  hookKinematics,
  isStubLine,
  resolveCards,
  slotsWithCards,
  validateCatalog,
  validateLine,
  captiveTriggerRadius,
  mineTriggerRadius,
  type MineKind,
  type MineView,
  type SlotItemId,
} from '../index.js';

/** deg -> rad, the SAME association shared/src uses (`(d * PI) / 180`) — the
 *  two round differently in the last bit, and these are exact-equality pins. */
const deg = (d: number): number => (d * Math.PI) / 180;

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
    // always-available spend (NOT a card) — a reserved negative sentinel (-1)
    // on SpendMsg.choice, required self-private OwnShip.repairHp, the
    // self-private 'heal' GameEvent, and the paid heal's CONFIG block in the
    // welcome config snapshot. PV 53 (Story 8.8) made the heal A CARD: the
    // sentinel is deleted, the block is CONFIG.hullRepair, and CONFIG.regen
    // joins it.
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
    // 45 -> 46: RANGE I-IV IS DELETED (Eric ruling 2026-08-20). The
    // `intelRange` line leaves BOON_CATALOG (29 -> 28); it was the ONLY card
    // writing `radarRange`, so the eighths ladder is frozen at its base for
    // every observer and base range does NOT compensate. Catalog content is
    // wire contract and the client resolves boon ids fail-closed, so a stale
    // client would silently drop the id and disagree with the sim about radar,
    // truesight and every rangeU.
    //
    // 47 -> 48: A DRONE KILLER CAN BE NAMED (Eric ruling 2026-08-21).
    // `SunkEvent` gains an optional `kcls` (HullId) appended LAST after `vcls`,
    // carrying the KILLER'S hull class and ONLY when the killer is a PvE fleet
    // hull -- never a captain's. A wire SHAPE change on a row every client
    // decodes, so it is a join gate even though it is purely additive.
    //
    // 48 -> 49: THE BROADSIDE'S ZERO-OVERLAP ARC LADDER (Eric rulings
    // 2026-08-24 + 2026-08-27). `CONFIG.broadside.turretMountSpreadDeg` becomes
    // a PER-RUNG ARRAY and `traverseDeg` retunes, so BROADSIDE SPREAD climbs
    // BOTH ladders off one rung and `EffectiveStats.broadside` gains a derived
    // `mountSpreadRad`. No wire SHAPE change: both sides compile the ladder and
    // both run `turretAimPoints`, so a stale client previews and predicts a
    // barrage the server does not fire -- the same break class as PV 45.
    // 50 -> 51: CATALOG V3 AND THE CARD MODEL (Story 8.1). Catalog CONTENT is
    // wire contract, and this replaces the catalog wholesale: 29 lines / 114
    // cards, `OwnShip.boons` -> `OwnShip.cards`, the `torpedo`/`mine`
    // equipment ids renamed `heavyTorpedo`/`navalMines`, `EffectiveStats`
    // re-shaped onto one total `equipment` record, and CONFIG.deck/CONFIG.catalog
    // moving in the welcome snapshot (the deck block is itself deleted at PV
    // 57). Both sides resolve card ids fail-closed, so a stale client would
    // silently mis-simulate every build it was dealt.
    // 51 -> 52: NINE SLOTS (Story 8.5). The loadout becomes one flat
    // nine-slot array with fixed roles (gun, boost, three weapons, four
    // consumables), identical for every captain hull, so `OwnShip.ammo`
    // widens from 4 slot-aligned entries to 9 and `InputMsg.slot`/`actSlot`
    // widen to 0..8. No field is added, removed or renamed: a stale client
    // would read a nine-entry `ammo` through a four-slot hotbar.
    // 52 -> 53: HEAL IS A CARD (Story 8.8). The reserved -1 heal sentinel
    // leaves `SpendMsg.choice` (an offer index and nothing else now), and
    // `hullRepair` loses its stub flag — catalog CONTENT, so the deal itself is
    // the break (every default deck goes 23 -> 26 drawable cards). The paid
    // heal's CONFIG block becomes CONFIG.hullRepair and CONFIG.regen arrives
    // beside it in the welcome snapshot. No wire SHAPE moves: a stale client
    // would key a rail the server no longer honours and mis-derive both heal
    // channels.
    // 53 -> 54: THE SHIFT BOOST, UNIVERSAL (Story 8.9). The legacy
    // `speedBoost` equipment id dies into the v3 `boost` in slot 1 on every
    // captain hull, and CONFIG.speedBoost becomes CONFIG.boost (+25 % of the
    // post-fold max speed for 10 s on a 25 s reload).
    // 54 -> 55: THE OPENING (Story 8.10). `MULLIGAN_CHOICE` (-2) joins
    // `SpendMsg.choice` — the negative sentinel channel PV 53 closed is
    // re-opened for exactly this one value, the countdown REDRAW — and
    // the interim spawn seed is DELETED, so no hull sails with class weapons
    // and the
    // first weapon is a card off the level-zero offer granted at countdown
    // start. Catalog CONTENT is wire contract and this one is a DESYNC class:
    // a stale client would replay its own loadout with seed weapons the server
    // never fitted (and would read `lvl 0 / pts 1 / offer[4]` as an ordinary
    // level, with no REDRAW to press). Every default deck goes 26 -> 27
    // drawable cards. No wire SHAPE moves and the perception exception count
    // stays at SIX.
    // UNCHANGED BY STORY 8.11 (the match consumable pool): nothing of the pool
    // rode — not a frame, not the welcome, not the schema, not a log line
    // (count only) — and although `CONFIG.pool.size` travelled inside the
    // welcome CONFIG snapshot, the client read no pool field and predicted
    // nothing from it, so there was no stale client to gate out. The pool is
    // RETIRED outright at PV 57 (amendment 89a).
    // UNCHANGED BY STORY 8.12 (the ladders + deck gun): the story authors
    // nothing — two CLIENT readings change and catalog content does not.
    // 55 -> 56: CATALOG V3 — TORPEDOES AND MINES (Story 8.13, Eric rulings
    // 2026-09-19, epic-8 amendments 74-84). Two independent breaks under one
    // bump. (1) CATALOG CONTENT: five equipment lines gain their tiers II-V,
    // and FOUR LINES CHANGE KIND OR EXISTENCE — `supercavTorpedo` moves to the
    // CONSUMABLE id space (no reload, no tiers, no stat row), `foulingMines`
    // moves the other way into `EquipmentId` as its own tiered line,
    // `acousticHoming` is DELETED (homing is a numeric tier stat now) and a
    // stub `depthCharge` takes its LINE_IDS place. 29 lines still; 114 -> 122
    // physical cards; both default decks re-cut; `DEFAULT_OWNED`,
    // `EQUIPMENT_STAT_FIELDS` and `DOCTRINE_MODES` all change shape. A stale
    // client would fold a different catalog and fit weapons into the wrong id
    // space. (2) `MineView` gains an optional `c` (the mine's kind), emitted
    // ONLY when `own` is true and stripped for every other observer. No new
    // event kind, no change to the reveal shape, and the perception exception
    // count stays at SIX.
    // 56 -> 57: THE COMMON POOL (Story 8.14, Eric rulings 2026-09-21/22,
    // epic-8 amendments 89-95). Decks and the hidden match pool are RETIRED:
    // no card is class-locked and none is brought, so every dealable line is
    // drawable by every captain through the two-stage draw in sim/draw.ts.
    // Catalog CONTENT does not move, but the JOIN CONTRACT does, three ways a
    // stale client cannot survive: the seat now carries `gun`
    // (deckGun|machineGun|flak, default deckGun) which a stale client never
    // sends, `OwnShip.gun` arrives on the own frame and is what the client
    // replays its own loadout from, and the deck door (with its 4402 refusal)
    // and the `deckId`/`deckOverride`/`poolOverride` join keys are gone.
    // `CONFIG.deck` and `CONFIG.pool` are DELETED from the welcome CONFIG
    // snapshot and `CONFIG.offer` gains the `weighting` block the client reads.
    // No new event kind, no spatial shape moves, and THE PERCEPTION EXCEPTION
    // COUNT STAYS AT SIX — the take ledger, the per-ship weights and every
    // other captain's `gun` never leave the server.
    expect(PROTOCOL_VERSION).toBe(57);
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
    expect(SLOT_COUNT).toBe(9); // Story 8.5: was 4 (gun, two specials, one extra)
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
    // THE ASSIST SPLIT IS ONE DIAL (Eric answer A1, 2026-08-23). Pinning the
    // VALUE is what makes "60 s is the ruled window" a test rather than a
    // claim: the same number is the per-attacker restart gap, the eligibility
    // window at the sink, and the on-switch, so a second gap dial appearing
    // here would fail the shape pin by its key alone.
    expect(CONFIG.xp.assistWindowMs).toBe(60000);
    expect(CONFIG.xp.killerShare).toBe(0.1);
    // 60 s clears every weapon cycle with room — the reason it beat the
    // first-ruled 30 s, which left the torpedo exactly at the boundary.
    // STRUCTURAL SWEEP over the weapon registry (EQUIPMENT_IS_WEAPON), not a
    // hand-enumerated list, so a future weapon's reload is covered
    // automatically. This also now covers the radar buoy's 30s reload, which
    // the old five-reload enumeration omitted.
    // Read off the FIREWALL rather than a hand-built CONFIG table (Story 8.1:
    // `EffectiveStats.equipment` is total over EquipmentId), so the seven
    // UNBUILT v3 weapons are already covered and stay covered the day their
    // modules land. The tightest of them is the MONITOR GUN's 50 s (catalog-v3
    // R30) — still inside the 60 s window, with the least room of any weapon.
    const stats = effectiveStats(CONFIG.shipClasses.battleship);
    for (const id of EQUIPMENT_IDS) {
      if (!EQUIPMENT_IS_WEAPON[id]) continue;
      expect(CONFIG.xp.assistWindowMs, id).toBeGreaterThan(stats.equipment[id].reloadMs);
    }
    expect(stats.equipment.monitor.reloadMs).toBe(50000); // R30 — the tightest margin
    expect(Object.keys(CONFIG.xp).sort()).toEqual(['assistWindowMs', 'droneTierLevels', 'killLevels', 'killerShare', 'levelMs']);
  });

  it('carries the two heal blocks — the paid HULL REPAIR card plus the out-of-combat regen', () => {
    // The PAID heal, unchanged by every move it has made (a level spend, then a
    // card): 50 instant + 50 into the pool = 100 hp, drained at the fixed
    // regenHp/regenMs 0.01 hp/ms.
    expect(CONFIG.hullRepair.instantHp).toBe(50);
    expect(CONFIG.hullRepair.regenHp).toBe(50);
    expect(CONFIG.hullRepair.regenMs).toBe(5000);
    // THE OUT-OF-COMBAT REGEN (epic-8 amendments 46-48, replacing the cycle-129
    // per-level auto-heal): 1 % of MISSING hull per second, once 30 s have
    // passed since the hull last took landed damage. A fraction of MISSING (not
    // of max, not a flat amount) is the ruled shape and is what makes it need no
    // repricing when hull HP next moves.
    expect(CONFIG.regen.missingPctPerS).toBe(0.01);
    expect(CONFIG.regen.outOfCombatMs).toBe(30000);
    // THE SHAPE PINS. The paid block is now the paid heal and NOTHING else (the
    // free per-level channel's two dials lived inside it and are deleted), and
    // the regen carries no pool dial of its own — it pays straight into hp. A
    // percentage MENU heal — measured across nine variants and DEFERRED by
    // Eric to after the upgrade-card balance pass — still cannot arrive
    // silently: healFlatPct / healMissingPct / healPoolPct would fail by key
    // alone.
    expect(Object.keys(CONFIG.hullRepair).sort()).toEqual(['instantHp', 'regenHp', 'regenMs']);
    expect(Object.keys(CONFIG.regen).sort()).toEqual(['missingPctPerS', 'outOfCombatMs']);
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

  it('re-exports `hullIsFull` — the ONE definition of a full hull (amendment 53)', () => {
    // Three callers across two workspaces read it (the HULL REPAIR row's
    // refusal, the out-of-combat regen's snap, the client's belt pre-denial),
    // so it has to be on the barrel or one of them re-derives it.
    expect(typeof hullIsFull).toBe('function');
    expect(hullIsFull(349, 350)).toBe(false);
    expect(hullIsFull(349.5, 350)).toBe(true);
  });

  it('re-exports the NINE-SLOT grammar — and the interim spawn seed is GONE (Story 8.10)', () => {
    expect(SLOT_BOOST).toBe(1);
    expect(WEAPON_SLOTS).toEqual([2, 3, 4]);
    expect(CONSUMABLE_SLOTS).toEqual([5, 6, 7, 8]);
    // The per-hull fit died with the extra slot (Story 8.5)...
    const ns = shared as Record<string, unknown>;
    for (const gone of ['SLOT_EXTRA', 'specialsFor']) expect(ns[gone], gone).toBeUndefined();
    // ...and the interim SPAWN-SEED TABLE died with the level-zero offer
    // (Story 8.10, epic-8 amendment 62): every hull sails with the gun and
    // Shift only, and its first weapon is a CARD off the opening offer. Its
    // name is gone from the whole repo, so the pin is the grep, not an
    // `toBeUndefined` on an identifier no source may write any more.
  });

  it('re-exports MULLIGAN_CHOICE — the one legal negative on the spend channel (Story 8.10)', () => {
    expect(MULLIGAN_CHOICE).toBe(-2);
    // A NEGATIVE INTEGER STRICTLY BELOW -1, and outside every offer slot: -1
    // stays malformed (the DAMAGE CONTROL sentinel left the wire at PV 53,
    // epic-8 amendment 46) and no offer index can ever collide with it.
    expect(Number.isInteger(MULLIGAN_CHOICE)).toBe(true);
    expect(MULLIGAN_CHOICE).toBeLessThan(-1);
    expect(MULLIGAN_CHOICE >= 0 && MULLIGAN_CHOICE < CONFIG.offer.size).toBe(false);
    expect(typeof usableLines).toBe('function'); // the guarantee's one shared helper
  });

  it('re-exports the loadout + kinematics-fold systems (boost AND the 2.8 slow)', () => {
    expect(typeof loadoutFor).toBe('function');
    expect(typeof boostedKinematics).toBe('function');
    expect(typeof slowedKinematics).toBe('function');
    // THE SHIFT BOOST (Story 8.9, epic-8 amendment 54 — Eric verbatim: "Build
    // as-written, except 25s reload"). The legacy flat `CONFIG.speedBoost`
    // block is DELETED; `factor` is a FRACTION of the post-fold max speed.
    expect(CONFIG.boost).toEqual({ factor: 0.25, durationMs: 10000, maxAmmo: 1, reloadMs: 25000 });
    expect((CONFIG as Record<string, unknown>).speedBoost).toBeUndefined();
  });

  it('EQUIPMENT_IS_WEAPON: mine FLIPPED to a click-aimed weapon (Story 2.8, amendment 45)', () => {
    // WIDENED to catalog v3 (Story 8.1): 7 ids -> 15, the shipped torpedo/mine
    // renamed heavyTorpedo/navalMines. The per-id pins live in loadout.test.ts;
    // here the barrel pins TOTALITY and the split's shape.
    expect(Object.keys(EQUIPMENT_IS_WEAPON)).toEqual([...EQUIPMENT_IDS]);
    // 15 -> 14 (Story 8.9): the legacy flat-bonus boost id is gone and the v3
    // `boost` id IS the Shift boost — the one non-weapon left.
    expect(EQUIPMENT_IDS).toHaveLength(14);
    expect(EQUIPMENT_IDS.filter((id) => !EQUIPMENT_IS_WEAPON[id])).toEqual(['boost']);
    expect(EQUIPMENT_IS_WEAPON.navalMines).toBe(true); // aimed rear-arc placement (2.8, a45)
    expect(EQUIPMENT_IS_WEAPON.radarBuoy).toBe(true); // click-placed (7-5 w2)
  });

  it('the BELT surface (Story 8.7): the rack predicate, the slot-item guard and the two split tables', () => {
    // Story 8.7 adds the consumable half of the slot vocabulary. It is a
    // WIRE-NEUTRAL addition — PROTOCOL_VERSION stayed 52 at 8.7 (no new field,
    // no catalog content change; every consumable line was still a stub then,
    // epic-8 amendment 41; Story 8.8 flipped hullRepair live and took the
    // bump) — but both sides import these names, so the barrel pins them here.
    expect(typeof canStock).toBe('function');
    expect(typeof stockSlotFor).toBe('function');
    expect(typeof isConsumableId).toBe('function');
    expect(typeof isWeaponItem).toBe('function');
    expect(typeof slotMaxAmmo).toBe('function');
    expect(Object.keys(CONSUMABLE_IS_WEAPON)).toEqual([...CONSUMABLE_IDS]);
    // THE TWO ID SPACES STAY DISJOINT: EquipmentId is never widened, so every
    // EquipmentId-keyed record (EQUIPMENT_IS_WEAPON, EQUIPMENT_STAT_FIELDS,
    // the server rows, the glyphs) stays honest and each read of one narrows
    // through the guard.
    for (const id of CONSUMABLE_IDS) expect((EQUIPMENT_IDS as readonly string[]).includes(id), id).toBe(false);
    for (const id of EQUIPMENT_IDS) expect(isConsumableId(id), id).toBe(false);
    // The belt predicate reads the four consumable slots and nothing else.
    const empty: (SlotItemId | null)[] = ['gun', 'boost', null, null, null, null, null, null, null];
    expect(canStock(empty, 'hullRepair')).toBe(true);
    expect(stockSlotFor(empty, 'hullRepair')).toBe(CONSUMABLE_SLOTS[0]);
  });

  it('CONFIG.broadside carries the barrage block; its range stays DERIVED at the 5/8 rung', () => {
    expect(CONFIG.broadside).toEqual({
      hits: ['hull', 'mine', 'decoy'], // AR44 gun-family mask (Story 8.4)
      arcOffsetDeg: 90,
      arcHalfArcDeg: 60,
      shellSpeed: 500,
      maxAmmo: 1,
      reloadMs: 18000, // balance cycle 1 (Eric 2026-08-21); was 30000
      turrets: 4, // balance cycle 1 (Eric 2026-08-20); was 3, max 6 via the ×2 card
      // [DRAFT] fraction of hull length the battery spans (Eric's 2026-08-19
      // turret correction): three separate, evenly-spaced muzzle points across
      // the midship section, RE-SPACED (never lengthened) at 5 and 6 turrets.
      turretSpanFactor: 0.6,
      damage: 15, // balance cycle 1 (Eric 2026-08-20); was 20 — base alpha held at 4×15 = 60
      burstRadius: 15, // DRAFT — the gun's own ("bursts like the gun")
      shellRadius: 2,
      // THE ZERO-OVERLAP LADDER (Eric rulings 2026-08-24 + 2026-08-27): the
      // SPREAD card climbs BOTH ladders off one rung — the mounts swing INWARD
      // toward the beam while the arcs WIDEN. At the base 4-gun battery the
      // per-turret wedges do not overlap at all until the third card (rung 3
      // exactly touches), and at the cap the whole battery converges on an abeam
      // click from ~265u out. Both [DRAFT]; the overlap SCHEDULE is what is
      // ruled, and it is pinned in aim.test.ts.
      turretMountSpreadDeg: [28, 25, 22.5, 15, 6], // [DRAFT] mount half-spread ladder, index = SPREAD copies
      traverseDeg: [6, 7, 7.5, 9, 14], // [DRAFT] per-turret traverse ladder, index = SPREAD copies
    });
    // NO range field — it is derived from radarRange × muzzleFlashFactor, and
    // NO arc field either: the beams are a twin-sector descriptor, not 'full'.
    expect('rangeU' in CONFIG.broadside).toBe(false);
    expect('arc' in CONFIG.broadside).toBe(false);
    // One entry per reachable SPREAD rung: 0..4 copies of a ×4 card. BOTH
    // ladders, and the SAME length — one rung indexes them together
    // (effectiveStats pairs them by index; a length mismatch would silently
    // clamp one and run off the other).
    //
    // RE-PINNED AGAINST THE BROADSIDE LINE (Story 8.1). The v2 `broadsideSpread`
    // card the old coupling counted is gone; catalog v3 folds the spread rung
    // into the BROADSIDE equipment line's tiers II-V (catalog-v3 R35, "+1 spread
    // rung" per tier), which Story 8.16 authors. Five rungs = the line's tier I
    // plus its four upgrade steps, so the ladder length is `cap`, not `copies+1`.
    expect(CATALOG.broadside.cap).toBe(5);
    expect(CONFIG.broadside.traverseDeg).toHaveLength(CATALOG.broadside.cap);
    expect(CONFIG.broadside.turretMountSpreadDeg).toHaveLength(CATALOG.broadside.cap);
    expect(CONFIG.broadside.turretMountSpreadDeg).toHaveLength(CONFIG.broadside.traverseDeg.length);
  });

  it('CONFIG.radarBuoy carries the buoy\'s OWN sensor set (Story 7-5 wave 2)', () => {
    expect(CONFIG.radarBuoy).toEqual({
      hits: ['hull', 'mine', 'decoy'], // AR44 — the gun buoy fires gun-pattern shells
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
      // AR44 (Story 8.4): NO 'mine' bit — illumination detonates nothing.
      hits: ['hull', 'decoy'],
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
    // RETIRED (Story 8.4, FR57/AR48): `CONFIG.mine.maxLive` and
    // `CONFIG.mine.globalCap` are DELETED — mines have no cap at all. The pin
    // is inverted so the fields can never quietly come back.
    expect('maxLive' in CONFIG.mine).toBe(false);
    expect('globalCap' in CONFIG.mine).toBe(false);
    expect(CONFIG.mine.hits).toEqual(['hull']);
    expect(CONFIG.mine.damage).toBe(55); // RETUNED 45 -> 55 (Eric ruling 2026-08-04)
    // The placement leash (Eric ruling 2026-08-02): 90u put the drop point
    // inside your own wake; 150u lets a Mine Layer actually seed water.
    expect(CONFIG.mine.placeRange).toBe(150);
    expect(CONFIG.mine.placeHalfArcDeg).toBe(60);
    // PROP FOULING LEFT CONFIG.mine (Eric ruling 2026-09-19, epic-8 amendment
    // 81): FOULING MINES is its own tiered EQUIPMENT line now and a naval mine
    // no longer slows anything, so `foulFactor`/`foulDurationMs` moved into
    // `CONFIG.foulingMines` as `slowFactor`/`slowDurationMs` (same values).
    // The pin is INVERTED so they can never quietly come back here.
    expect('foulFactor' in CONFIG.mine).toBe(false);
    expect('foulDurationMs' in CONFIG.mine).toBe(false);
    // RETIRED (Story 7-5 wave 2): the three creep pins — creepSpeed 14 u/s,
    // creepAcquireRange 150u, and acquire > blast. They pinned the SELF-
    // PROPELLED doctrine's tuning, and that doctrine left the game with its
    // card; the constants are deleted, so the pins go with them rather than
    // being adapted. Their ABSENCE is what is pinned now — a mine cannot move.
    expect((CONFIG.mine as Record<string, unknown>).creepSpeed).toBeUndefined();
    expect((CONFIG.mine as Record<string, unknown>).creepAcquireRange).toBeUndefined();
    // THE CAPTIVE TRANSFORM LEFT TOO (epic-8 amendment 84d): CAPTIVE MINES has
    // its own `CONFIG.captiveMines` ring pair (144 u trip / 32 u fixed burst,
    // the trip stepping x1.1 per tier off the ROW'S TIER), so the old
    // swap-and-triple multiplier has no consumer. Inverted pin, same reason.
    expect('captiveTriggerFactor' in CONFIG.mine).toBe(false);
    // BARREL's parallel-track spacing (R2.16) — a LATERAL distance, replacing
    // the retired 3° angular fan step.
    expect(CONFIG.gun.barrelSpacingU).toBe(12);
    expect((CONFIG as Record<string, unknown>).cannon).toBeUndefined();
    expect((CONFIG as Record<string, unknown>).decoyBuoy).toBeUndefined();
  });

  it('CONFIG.torpedo: the family\'s shared homing fields (command detonation retired)', () => {
    // 0.5 is now the TIER-V REFERENCE rate, not a doctrine's flat value: the
    // ACOUSTIC HOMING card is deleted and every torpedo ROW starts at 0
    // (Eric ruling 2026-09-19, epic-8 amendment 80). The acquire range, the
    // die-distance and the update threshold stay SHARED by the whole family
    // (amendment 84e), which is why they live in the heavy's block.
    expect(CONFIG.torpedo.homingTurnRate).toBe(0.5);
    expect(CONFIG.torpedo.homingAcquireRange).toBe(120);
    expect(CONFIG.torpedo.homingUpdateAngleDeg).toBe(5);
    // `commandBurstRadius` is RETIRED with COMMAND DETONATION (Story 7-5): the
    // weapon left the game, so the constant has no consumer to pin.
    // The homing travel budget (review P8): finite, so a fish can never orbit
    // forever — and long enough to cross the map twice over.
    expect(CONFIG.torpedo.homingMaxRangeU).toBe(1300);
  });

  it('CONFIG.lightTorpedo (R18): the twin-sector fish, tier-I numbers', () => {
    expect(CONFIG.lightTorpedo).toEqual({
      offset: deg(90), // the twin sector's centre: BOTH beams
      halfArc: deg(45), // 90 deg dead zones fore and aft
      speed: 45,
      damage: 40,
      maxAmmo: 1,
      reloadMs: 25000,
      hits: ['hull', 'decoy'], // AR44 — it runs UNDER a minefield
    });
    // NO MAX RANGE, and no chassis duplication: hit radius, spawn clearance
    // and the homing acquire/die/update thresholds are the FAMILY's, read from
    // CONFIG.torpedo (epic-8 amendments 84e/84f).
    for (const k of ['hitRadius', 'spawnClearance', 'homingAcquireRange', 'homingMaxRangeU', 'rangeU']) {
      expect(k in CONFIG.lightTorpedo, k).toBe(false);
    }
  });

  it('CONFIG.supercavTorpedo (amendment 74): a CONSUMABLE — no reload, no pool, no tiers', () => {
    expect(CONFIG.supercavTorpedo).toEqual({
      offset: deg(0), // bow-centered
      halfArc: deg(15),
      speed: 195,
      damage: 50,
      hits: ['hull', 'decoy'],
    });
    // THE ABSENCES ARE THE RULING (Eric 2026-09-19): a consumable never
    // reloads (catalog-v3 R40) and its copies STOCK rather than step, so R19's
    // 45 s reload and its tiers II-V are VOID.
    for (const k of ['reloadMs', 'maxAmmo', 'homingTurnRate']) {
      expect(k in CONFIG.supercavTorpedo, k).toBe(false);
    }
  });

  it('CONFIG.captiveMines (R25, amendments 77/84d): its OWN ring pair and clock', () => {
    expect(CONFIG.captiveMines).toEqual({
      reloadMs: 20000, // amendment 77 lifted the [DRAFT]: 20 s, NOT the naval 15 s
      maxAmmo: 1, // ...and 1 held, NOT the naval 2
      triggerRadius: 144, // the TRIP ring — the BIG one
      triggerStepPerTier: 1.1, // x1.1 per tier off the ROW'S TIER -> 210.8 u at V
      blastRadius: 32, // the fish's burst — FIXED, it never steps
      damage: 55,
    });
    // The trip ring is the big one and the burst the small one — the reverse
    // of a contact mine.
    expect(CONFIG.captiveMines.triggerRadius).toBeGreaterThan(CONFIG.captiveMines.blastRadius);
  });

  it('CONFIG.foulingMines (amendment 81, ALL [DRAFT]): its own line, the naval mine\'s old foul', () => {
    expect(CONFIG.foulingMines).toEqual({
      damage: 10, // "minimal damage" — FIXED at every tier
      blastRadius: 72, // bigger than the naval mine's 48 by design
      slowFactor: 0.75, // the value that left CONFIG.mine verbatim
      slowDurationMs: 5000, // ...and so did this one; the tiers deepen the FACTOR only
      maxAmmo: 2,
      reloadMs: 15000,
      hits: ['hull'], // AR44 — a mine trips on hulls only
    });
    // ONE SOURCE FOR THE TRIP FRACTION: it reuses CONFIG.mine.triggerFactor
    // rather than restating 2/3, so the naval and fouling rings cannot drift.
    expect('triggerFactor' in CONFIG.foulingMines).toBe(false);
    expect(CONFIG.foulingMines.blastRadius).toBeGreaterThan(CONFIG.mine.blastRadius);
    // ...and the naval chassis (rear sector, leash, arm delay) is NOT copied.
    for (const k of ['offset', 'placeHalfArcDeg', 'placeRange', 'armDelay']) {
      expect(k in CONFIG.foulingMines, k).toBe(false);
    }
  });

  it('re-exports the mine WIRE shape: MineKind + the own-only MineView.c (amendment 76)', () => {
    // A TYPE-LEVEL PIN as much as a runtime one — this file type-checks in the
    // gate, so a `MineKind` the barrel does not export, or a `c` that is not
    // optional, fails to compile here.
    const kinds: MineKind[] = ['naval', 'captive', 'fouling'];
    expect(kinds).toHaveLength(3);
    // The OWNER's marker carries the kind...
    const own: MineView = { id: 'm1', x: 10, y: 20, own: true, by: 'ship1', c: 'captive' };
    expect(own.c).toBe('captive');
    // ...and EVERY OTHER OBSERVER's is the byte-identical kind-less marker it
    // always was: the server strips the field, so an observer cannot tell the
    // three kinds apart by sight. `c` is OPTIONAL precisely so that costs
    // nothing on the wire.
    const seen: MineView = { id: 'm1', x: 10, y: 20, own: false, by: 'ship1' };
    expect(seen.c).toBeUndefined();
    expect(Object.keys(seen)).toEqual(['id', 'x', 'y', 'own', 'by']);
  });

  it('re-exports the mine RING derivations (sim/stats.ts — the one home for both)', () => {
    // A CONTACT mine's trip ring is a fixed fraction of its blast...
    expect(mineTriggerRadius(CONFIG.mine.blastRadius)).toBe(CONFIG.mine.triggerRadius);
    expect(mineTriggerRadius(72)).toBeCloseTo(48, 9);
    // ...and the CAPTIVE's rides its TIER instead (epic-8 amendment 84d).
    expect(captiveTriggerRadius(1)).toBe(CONFIG.captiveMines.triggerRadius);
    expect(captiveTriggerRadius(5)).toBeCloseTo(210.8304, 4);
    // Non-finite / sub-1 tiers clamp to the tier-I ring, never NaN.
    for (const bad of [NaN, Infinity, -Infinity, 0, -3]) {
      expect(Number.isFinite(captiveTriggerRadius(bad)), `${bad}`).toBe(true);
    }
    expect(captiveTriggerRadius(NaN)).toBe(CONFIG.captiveMines.triggerRadius);
  });

  it('re-exports THE CATALOG + the card fold engine (Story 8.1, catalog v3)', () => {
    // 28 v2 boon lines -> 29 v3 LINES. The CARD total moved 114 -> 122 in
    // Story 8.13 purely by re-cutting kinds (epic-8 amendments 74/80/81/83):
    // -1 acousticHoming, +5 depthCharge, foulingMines 1 -> 5, supercav 5 -> 5.
    expect(LINE_IDS).toHaveLength(29);
    expect(Object.keys(CATALOG)).toHaveLength(29);
    expect(catalogCardCount()).toBe(122);
    expect(Object.keys(HOOK_REGISTRY)).toHaveLength(0); // still EMPTY (amendment 30 satisfied data-side)
    expect(Object.isFrozen(CATALOG)).toBe(true);
    expect(Object.isFrozen(HOOK_REGISTRY)).toBe(true);
    expect(Object.isFrozen(NO_CARDS)).toBe(true);
    // 10 of the 29 lines are STUBS — authored in shape, mechanism unbuilt,
    // never dealt into a deck (Eric ruling 2026-09-15, amendment 5). 13 until
    // Story 8.8 gave HULL REPAIR its effect; 12 until Story 8.13 built the
    // LIGHT TORPEDO, the CAPTIVE MINE and the SUPERCAV TORPEDO and added the
    // one new stub, DEPTH CHARGE.
    expect(LINE_IDS.filter((id) => isStubLine(id))).toHaveLength(10);
    // THE GENERATED WHITELIST, and its deliberate absences (see sim/effects.ts).
    expect(BOON_STAT_PATHS.length).toBeGreaterThan(0);
    expect(Object.keys(EQUIPMENT_STAT_FIELDS).sort()).toEqual([...EQUIPMENT_IDS].sort());
    for (const path of [
      'sweepPeriodMs', 'sightRange',
      'equipment.gun.rangeU', 'equipment.starShells.rangeU', 'equipment.broadside.rangeU',
      'equipment.broadside.traverseRad', 'equipment.broadside.mountSpreadRad',
      'equipment.navalMines.triggerRadius', 'equipment.gun.tier',
      // THE CAPTIVE MINE HAS NEITHER RADIUS PATH (epic-8 amendment 84d): its
      // trip ring is derived from its TIER and its 32 u burst is fixed.
      'equipment.captiveMines.triggerRadius', 'equipment.captiveMines.blastRadius',
      'equipment.foulingMines.triggerRadius',
    ]) expect(BOON_STAT_PATHS, path).not.toContain(path);
    // ...and `supercavTorpedo` has no paths at all — it is a CONSUMABLE now
    // (amendment 74), so it has no stat row to address.
    for (const path of BOON_STAT_PATHS) expect(path.startsWith('equipment.supercavTorpedo.')).toBe(false);
    // CUT FROM FIVE ENTRIES TO TWO (amendments 80/81): the torpedoes' `homing`
    // and the naval mine's `propFouling` went with the cards that granted them.
    expect(Object.keys(DOCTRINE_MODES)).toHaveLength(2);
    // DELETED WITH RARITY AND THE SUBDECK WALK (Story 8.1): there is no card
    // scarcity tier, no offer category and no acquisition card left anywhere.
    for (const gone of [
      'BOON_CATALOG', 'UNIVERSAL_CATEGORIES', 'EQUIPMENT_CATEGORY', 'isAcquisitionDef',
      'consumeAcquisition', 'resolveBoons', 'applyBoonStats', 'slotsWithBoons',
      'boonBehaviors', 'validateBoonDef', 'NO_BOONS',
    ]) expect((shared as Record<string, unknown>)[gone], gone).toBeUndefined();
    // sim/spread.ts — the ONE straddle rule both sides call (Story 7-5 wave 2).
    for (const fn of [straddleOffsets, parallelOffsets]) {
      expect(typeof fn).toBe('function');
    }
    for (const fn of [
      resolveCards,
      cardCounts,
      applyCardStats,
      applySlotEffect,
      slotsWithCards,
      cardBehaviors,
      hookKinematics,
      isStubLine,
      catalogCardCount,
      validateLine,
      validateCatalog,
    ]) {
      expect(typeof fn).toBe('function');
    }
    expect(validateCatalog()).toEqual([]);
  });

  it('re-exports THE COMMON POOL DRAW + the offer/spend wire shape (Story 8.14)', () => {
    for (const fn of [drawOffer, eligibleLines, lineWeight, usableLines]) {
      expect(typeof fn).toBe('function');
    }
    // THE DECK AND THE MATCH POOL ARE GONE (Eric ruling 2026-09-21, epic-8
    // amendment 89a): no deck engine, no legality rules, no default decks, no
    // ownership set, no hidden match pool. sim/draw.ts is the whole draw.
    for (const name of [
      'buildDeck',
      'buildDeckState',
      'consumeCard',
      'DeckState',
      'checkDeck',
      'equipmentLineCount',
      'deckFromCounts',
      'DEFAULT_DECKS',
      'DEFAULT_OWNED',
      'rollMatchPool',
      'sanitizePool',
      'consumableLines',
    ]) {
      expect((shared as Record<string, unknown>)[name], name).toBeUndefined();
    }
    // RETIRED with the exclusivity mechanism (Story 7-5 wave 2, R2.6):
    // `returnCards` was the doctrine swap-out's give-back and the cannon pair
    // was the mechanism's last user, so nothing ever hands a card back.
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
    // CONFIG.deck AND CONFIG.pool ARE DELETED (Story 8.14): the draw's only
    // dials are the offer size and the weighting pair, and CONFIG.catalog still
    // carries the one engine dial the fold needs.
    expect((CONFIG as Record<string, unknown>).deck).toBeUndefined();
    expect((CONFIG as Record<string, unknown>).pool).toBeUndefined();
    expect(CONFIG.catalog).toEqual({ reloadStepPerTier: 0.05 });
    // THE WEIGHTING (amendments 90/91) — both numbers are [DRAFT] harness dials,
    // and the mechanism is called WEIGHTING, never anything else.
    expect(CONFIG.offer).toEqual({ size: 4, weighting: { factor: 0.75, floor: 0.25 } });
    expect(CONFIG.offer.size).toBe(4); // four cards, four DIFFERENT lines
    expect(MSG.spend).toBe('u');
    expect('upgradePoints' in CONFIG).toBe(false);
  });

  it("re-exports THE SEAT'S GUN (Story 8.14, amendments 89d/95)", () => {
    expect(GUN_IDS).toEqual(['deckGun', 'machineGun', 'flak']);
    expect(DEFAULT_GUN).toBe('deckGun');
    expect(typeof isGunId).toBe('function');
    // Until Story 8.15 builds the machine gun and the flak gun, every seat gun
    // mounts the shipped deck-gun MODULE — pinned, not a silent fallback.
    expect(MOUNTED_GUN).toEqual({ deckGun: 'gun', machineGun: 'gun', flak: 'gun' });
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
