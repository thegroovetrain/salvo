# Changelog

## [0.18.61] - 2026-10-16

### Changed
- **The deck guns, retuned by Eric's math.** Every gun now climbs to twice its Tier I damage output at Tier V, with the faster reload counted inside that. Cannon: shell 8/10/11/12/13, and it fires two barrels at every tier (no barrel upgrades any more); the second turret at III stays. Machine gun: magazine 12/15/18/20/23, a shot every 0.30 down to 0.20 s, damage 5 at every tier, and the full-magazine reload starts at 12.5 s (10.0 s at V). Flak: center damage 16/18/20/22/24, and the third turret is gone (two at most). Sustained damage per second goes cannon 3.2 to 6.5, machine gun 3.73 to 7.88, flak 4.57 to 8.57.
- **Shots lose a little punch at range.** All three deck guns deal full damage out to half of the gun's range, falling in a straight line to 80 % at max range. It is measured from where the shell left the gun to where it lands, against the gun's range at the moment you fired, so closing or backing off after the shot changes nothing.
- **Flak's rim is half damage.** The edge of the blast deals half the center's damage (it used to be a flat 10 less).
- **Pickups hit harder.** Light torpedo 80 to 120, heavy torpedo 90 to 135, naval and captive mines 90 to 135, supercavitating torpedo 150. Torpedo tubes and the captive-mine pool top out at two (the naval-mine pool is unchanged at 2 to 6).
- **Mines feel the whole blast.** A mine is hurt when its 10 u marker touches a shell's blast, not only when the shell lands on it, and it takes the shell's range-reduced damage. Flak can clear a few mines at once and the cannon's two shells can pop one. The machine gun still has to land within 10 u of the mine.
- No battle sim was run for this pass. The check is play on staging: about 8 of 16 captains gone per ring.
- Protocol version 89 (the client reads the new gun, torpedo and mine ladders and the range dial).

### Not changed
- Broadside, star, phosphor and fouling shells, the 6 / 4 hp bump when a cannon or flak shell strikes a hull directly, every weapon range, hull, armor, heals, the storm and the rings.

## [0.18.60] - 2026-10-16

### Changed
- **One row again.** The HUD bar is back to a single row (the Epic 8 geometry): health globe, five weapon squares, a framed belt of six consumable squares, helm globe. The results LOADOUT block follows.
- **Mines are warnings.** Every mine's marker is 10 % larger. Your own mines (and their radius rings) are white; an enemy mine you can see pulses yellow to orange once a second (steady orange with motion off).
- **Hazard rings say whose, not who.** Lit, fouling and burning zones no longer wear the firer's personal color: yours are white, anyone else's pulse yellow to orange like the mines. The lit zone's fill and the fouling net follow the ring.
- **Burning water is fire.** The phosphor burn zone's red disc is gone; it is a field of white flames over the whole zone, under the zone glow. Another captain's flames lean slightly toward the warning color so hostile fire reads hostile at a glance; your own fire stays pure white.
- Protocol version unchanged (88).

### Not changed
- The 10 u "click on the mine" hit disc, the zones' mechanics (slow, burn, reveal), radar, fog.

## [0.18.59] - 2026-10-16

### Changed
- **Fog works like a bush.** Standing in solid fog you now see out of it normally, and you see everyone in the same bank. Fog costs your eyesight only when you look into a bank from outside, or across clear water (or thin haze) into a second bank. A bank between two ships in clear water still hides them from each other. Bots and the PvE fleet see by the same rule. (Eric: "like grass patches in League.")
- **No fog past the ocean's edge.** Fog exists only where islands can be, inside the map; the storm water beyond the rim is clear. The fog amount is now measured over the ocean part of the live ring only, so a small last ring at the edge of the map gets its full share.
- Protocol version 88 (an older client would draw fog past the rim where the server has none).

### Not changed
- Radar at 500 to 1,500 u and a bot's memory of your last radar plot still ignore fog, by the earlier rulings. That memory includes a plot sitting in the bot's own bank, which the bot could now see by eye.

## [0.18.58] - 2026-10-16

### Changed
- **Fog at a crawl.** The drift and the spin at the ocean's edge are each 1 u/s (they add where they line up, so a bank at the rim can move up to 2 u/s; the spin dial is now a speed, `spinRimU`, not a period). At this crawl the spin's curl is under a degree, so the fog reads as a slow drift.
- **The coverage dial means solid fog.** 20 to 25 % of the live ring is now fog thick enough to count (half density or more), not merely "above the cut"; before, only about 14 % of the ring was solid at a 22 % dial and the rest was thin edge. With the thin edge included, about 30 to 35 % of the ring now carries some haze.
- Protocol version 87 (the client reads the fog dials).

### Verified, not changed
- Fog does block eyesight as ruled: standing in a bank you see about 170 u, and two thirds of hulls inside your bubble are hidden when you stand in fog (measured on the real server code). What fog does not touch is radar from 500 to 1,500 u and a bot's memory of your last radar plot, both by design.

## [0.18.57] - 2026-10-16

### Changed
- **The fog spins.** The whole fog pattern now turns slowly about the ocean center, once every 20 minutes, with the middle running ahead of the edge by up to about a 22° curl that builds and rebuilds every two and a half minutes, so banks curl and stretch instead of sliding across the map in a straight line. At the edge of the ocean the turn carries a bank about 26 u/s; mid-ocean about 16 u/s. Which way it turns is a coin flip at the start of each match. The drift is still there, slower: 3.5 u/s instead of 8. The wisps ride the banks they tint, and the server re-reads the field every half second instead of every second so it keeps up.
- **More fog.** Between 20 and 25 % of the live ring is fogged at any time (was 2 to 8 %), and it rolls in over about 15 seconds after the match goes live (was about a minute).
- Protocol version 86 (the client reads the fog dials).

## [0.18.56] - 2026-10-15

### Added
- **FOG: rolling banks of haze that eat eyesight and nothing else.** Fog is a fractal-noise field that drifts with a wind and slowly changes shape. Between 2 and 8 % of the live ring is fogged at any time (the band wanders). Every unit of fog counts triple against your sight, so in the heart of a bank you see about 167 u instead of 500 u, and a thin edge costs little. There is no fog before the match goes live.
- **Everyone is fogged, the sailor inside included.** Mines and torpedoes are spotted late inside fog, and a muzzle flash or a wounded hull's smoke pays the same cost to be seen.
- **Radar is untouched.** A hull hidden by fog inside your sight bubble is dark to both of your sensors. Zone circles, the foghorn and the storm ignore fog.
- **Bots and PvE drones are fogged by the same rule.** A bot does not forget a hull that sailed into fog.
- Fog rolls in over about a minute after the match goes live and never pops; once the last ring is smaller than a bank the amount of fog holds where it was (the banks keep rolling).
- **Fog is drawn as pale rolling wisps** under the hulls, visible by eye within the 750 u flash/smoke halo.

### Changed
- Fog placement is public weather: one seed on the welcome and one coverage number on the room state. There is no per-observer fog channel, so the six declared perception exceptions are unchanged.
- The How-to-Play entry for fog waits for Story 9.17.

### Internal
- `PROTOCOL_VERSION` 84 -> 85 (welcome `fogSeed`, room `fogCut`, the client reads `CONFIG.fog`). Records: epic-9 amendments 162–176.

## [0.18.55] - 2026-10-15

### Changed
- **ARMOR is rescaled, DAMAGE CUT is now HUNKER.** The armor curve's constant is 100 and each ARMOR card is worth +20, so every damage multiplier a hull saw before is reproduced exactly. The Battleship's Shift, formerly DAMAGE CUT, is renamed HUNKER: +100 temporary Armor for 10 s.
- **New ship upgrade: ARMOR PIERCING** (five cards, +20 each), seated right after ARMOR. The attacker's piercing is subtracted from the victim's Armor on the same curve, and going below zero amplifies the blow, bounded under x2 (-20 reads x7/6, -100 reads x1.5). It applies to every damage source the attacker owns and is read live at the moment the blow lands. Raider and duelist bots favor it. It has a card, hover and How-to-Play table rows, the LOADOUT ladder line is now 4 + 4, and its glyph is the shell-splitting-a-plate (Eric's pick).

### Internal
- `PROTOCOL_VERSION` 83 -> 84. The wave-0 rename commit (aba14fe8) renamed the OwnShip wire field `damageCutUntil` -> `hunkerUntil` ahead of the PV bump in the same PR (a bisect landing there has mismatched field names at PV 83; noted, no live risk).
- Shared: the negative branch of `damageMultiplierFor` is computed as (K-2E)/(K-E) for whole-product exactness.
- Tests: shared 1093 -> 1104, server 2585 -> 2602, client 4076 -> 4081, hook 266. Records: epic-9 amendments 156-161.

## [0.18.54] - 2026-10-14

### Changed
- **Zoom out to the whole map; the storm ring is a waypoint on the way.** Zooming out no longer stops at the live ring: a key press or wheel notch that would cross the ring fit lands exactly on it, and the next one continues out to the entire map, storm and all. The view centre slides from your ship to the ring centre and then to the map centre, with your hull always kept on screen; spectators get the same range, zooming about the cursor. (Eric, after a bot wedged outside the ring was invisible at the old limit.)

### Internal
- Client: `stepZoom(factor, amount, detent)` shared by keys, wheel and the spectate wheel; `Camera.zoomDetent` (the ring fit, never tighter than the default, riding in as the ring closes), `setMapRadius`, a second slide ring centre → origin; fog strips and the storm fill verified at the map fit; `zoomWaypoint.test` (21 tests). Records: epic-9 amendment 142.
- Server: `syncRoster` projects `alive = false` for a roster row whose ship record is gone (a latent ghost-row hazard found by the "2 afloat" investigation; no reachable path today; pinned by a solo-room test). The investigation itself found no liveness bug across three full headless matches; the likely cause was a second bot afloat in the storm outside the ring-capped view.
- Tests: shared 1093 (44 files), server 2584 -> 2585 (93 files), client 4055 -> 4076 (132 files), hook test green, lint 0 errors.

## [0.18.53] - 2026-10-14

### Changed
- **The MULTI-SPECTRAL CM cloud is smaller:** born at 150 u and growing to 300 u over its 15 s (was 200 → 500, which at full size covered your whole sight bubble). Eric's pick on staging.

### Internal
- Shared: `CONFIG.countermeasure.r0/r1` 150 / 300; `PROTOCOL_VERSION` 82 → 83 (the client derives the cloud from these dials). Records: epic-9 amendment 141.
- Tests: PV pins re-based; counts unchanged.

## [0.18.52] - 2026-10-14

### Changed
- **PvE drones only react to what they can see.** A drone has no radar, so its steering, target search and shot test now consider only hulls and islands inside its 500 u sight; being shot from farther away still turns it toward the shooter as before. Behaviour inside sight is byte-identical; the server tick with a full ocean drops again (drone AI 4.0 → 0.65 ms, post-wave tick 13 → 9.7 ms p50 on the probe).
- **Spectators get the full zoom-out too, anchored on the mouse.** While spectating, the zoom range is the living captain's (close framing out to the whole live storm ring), and wheel and X/Z keys zoom about the cursor since there is no own hull to centre on.

### Internal
- Server: `drones.ts` hull avoidance pre-filtered at sight (exact: the steering bias is 0 past 150 u anyway), island avoidance through a static 500 u island bucket grid (`islandBuckets.ts`, exact), the waypoint land test at pick time and per-fleet member sets; `droneSightScope.test` (6 tests incl. the 1,500 u shot-from chase pinned tick-for-tick against the base). Golden snapshot unchanged; the 112-hull run hashes identically.
- Client: `Camera.zoomAbout`, spectate limits = alive limits with the ring feed while spectating, the spectate span clamp retired, spectate wheel on the log step, X/Z live while spectating; tests re-based citing amendment 140.
- Records: epic-9 amendments 139–140.
- Tests: shared 1093 (44 files), server 2578 -> 2584 (93 files), client 4043 -> 4055 (131 files), hook test green, lint 0 errors.

## [0.18.51] - 2026-10-14

### Changed
- **Enemy hulls no longer vanish when the server lags.** A hull the server is still sending every tick could fade off your screen (and lose its ramming body on your side) because the client aged contacts against its own wall clock while the server's frame times fell behind. Contacts now age against the newest frame received, so a slow server can never drop a hull it still delivers; a hull that leaves your sight still fades as before.
- **The server tick is far cheaper with a full ocean.** With 16 captains and the 96-hull fleet wave on the 10,000 u map, the hull-versus-coastline check was the bulk of the tick. Each island now carries a coastline edge grid, so the check is exact and about 15× cheaper; every hull pose is byte-identical to before.

### Internal
- Shared: `sim/coastIndex.ts` (per-island 16 u edge grid, built once per polygon array; inside / segment-near / nearest-distance answers identical to the brute-force code, pinned by identity tests on three maps); `collision.ts` reads the index for island tests and the signed island distance; hull-vs-hull escape untouched.
- Server: `resolveCollisions` skips a hull whose pose the resolver already returned untouched with no land contact (a pushed hull is always resolved); probe with 112 hulls: resolveCollisions 14.1 → 0.9 ms, post-wave tick 26.2 → 13.4 ms p50 on a loaded M-series Mac; remaining cost is drone AI (~4 ms, pairwise avoidance), bot AI (~2.4), stepShips (~2.2). `GET /metrics` already reports tick p50/p95/max.
- Client: `ServerClock.frameNow()` = min(serverNow, newest frame time + wall time since it arrived); `ContactViews.render` prunes against it; the far-cloud radar hold uses the same clock; `contactStaleness.test` reproduces the dilation (963 prunes in 60 s at 83 % server speed before the fix, 0 after).
- Root cause record: epic-9 amendment 138 (not perception, not the renderer: a sighted hull was a contact on every probe tick). Back pocket (Eric): a 1,200 u radar on the 8,000 u ocean also seats 16 (chord 1,249 u).
- Tests: shared 1090 -> 1093 (44 files), server 2575 -> 2578 (92 files), client 4030 -> 4043 (131 files), hook test green, lint 0 errors.

## [0.18.50] - 2026-10-14

### Changed
- **The twelfths ladder** (Story 9.8). Every sensor is now a share of the 1,500 u radar: radar reaches 1,500 u, you see 500 u around your ship, and muzzle flash and wounded smoke show out to 750 u.
- **Far radar returns come and go.** Out to 1,000 u a sweep always paints a contact; beyond that it paints less and less often (about nine times in ten at 1,250 u, about one in ten at the 1,500 u rim). Each sweep revolution is its own roll. Ships, decoys, wakes and the countermeasure cloud all flicker alike. Zone circles are drawn hazards and never flicker.
- **Every gun's reach is its own tiered number.** Cannon 1,000 to 1,250 u, machine gun 750 to 875, flak and broadside 625 to 750, star shells 1,375 to 1,500, phosphor shells 1,000 to 1,250, fouling shell 1,000. Every gun card prints a RANGE row, one decimal only when needed.
- **Deck-gun damage experiment.** Cannon 12 / 12 / 15 / 15 / 18, flak 20 / 28 / 36 / 44 / 52, machine gun unchanged. Flak damage fades from the centre of its burst (full damage) to the rim (10 less), by the nearest point of the hull.
- **The camera zooms out to the whole storm ring and back in to your ship.** The default framing is today's scale; the ring fit is a zoom-out limit only, and the view centre slides toward the ring as you zoom out.
- **The foghorn has twelve bands** (full volume through band 4, fading to half at band 12, an island adds three bands of muffle).
- **16 captains on a 10,000 u ocean.** The storm rings are 10000 to 7000 to 4000 to 2000 to 0, and no pair of captains starts inside radar of each other.
- **PvE fleet waves are twice as big:** 16, then 8, then 4 groups (96 / 48 / 24 hulls). A fleet never appears inside 1,000 u of a captain.
- **Upgrade cards have six rows** (243 px tall) so RANGE fits on every gun card.
- **How-to-Play is frozen until 9.13:** it still describes the old sensor ranges.

### Internal
- Shared: `CONFIG.vision.dropout { startU, kneeU, kneeP, rimP }` and the pure `sim/dropout.ts` curve and stateless roll (server-private seed, observer, target, per-revolution `sweepRev`); `rangeU` per weapon as a stat path with a per-card step (the post-fold re-pins to radar range deleted); damage rows, flak `edgeFalloff` 10; map radius 5,000, cap 16, rings [3500, 2000, 1000]; foghorn `v` 1..12; PROTOCOL_VERSION 81 -> 82.
- Server: every radar-delivered return rolls (blip, decoy, wake radar half, cloud delivery; one roll per cloud pass across the sweep wrap); bots trust a miss only inside the dropout start (whole uncertainty band); engagement bands scale by the mounted gun's range; fleet denial discs ride the dropout start; harness `--tune vision.dropout.*` refuses a non-curve; flak falloff in the damage gate.
- Client: absolute-span zoom (close 880 u, default 1320 u, ring-fit limit), log-scale wheel and keys, camera-centre slide with fog strips, own hull clamped on screen at the limit; six-row card grid; far-cloud radar return follows the server's per-revolution delivery; halo-mask pass attached only while a cloud is held and both masked layers clipped to the screen.
- Review gate: Blind Hunter + Edge Case Hunter (Fable) + Codex gpt-5.6-sol; 8 patches, every CONFIRMED finding fixed red-then-green; 2 Eric rulings at the gate (amendments 134, 135). Perf capture of record on MacBookPro16,1: close 6.8 / default 7.3 / ring-fit 29.0 / reveal 29.1 ms.
- Tests: shared 1064 -> 1090 (43 files), server 2548 -> 2575 (91 files), client 3992 -> 4030 (130 files).
- Epic-9 amendments 121–137. Cycle 185. PROTOCOL_VERSION 81 -> 82.

## [0.18.49] - 2026-10-13

### Changed
- **ARMOR is a new ship upgrade** (Story 9.7). Five cards, +1 Armor each. Every hit you take is multiplied by 5 / (5 + Armor), so five Armor halves the damage (the same as doubling your hull). It applies to shells, bursts, torpedoes, mines, burns, ram hits and grinding, but not to the storm. A hit of whole hit points is rounded down but never below 1, so drone shells still scratch an armored hull. The shield absorbs after Armor.
- **The Dreadnought's DAMAGE CUT is now temporary Armor.** It no longer halves damage flat: it grants +5 Armor for 10 seconds (was 8) on the same 30-second cooldown. At Tier 0 that is still half damage; at Tier V it is one third.
- **The ARMOR card sits right after HULL** and prints `ARMOR 0 → 1`, Tier 0 → V. Its glyph is a riveted armor belt (Eric's pick). The HP-globe SHIP panel shows a seventh row, ARMOR. The results LOADOUT shows the seven ladders as four over three. The DAMAGE CUT card's head row reads `ARMOR +5`. The defensive bot profile favors ARMOR.
- **How-to-Play has no ARMOR entry until 9.12** (it is frozen).

### Internal
- Shared: `CONFIG.armor { k: 5 }`, `CONFIG.damageCut { armorBonus 5, durationMs 10000 }` (factor deleted), `effectiveStats().armor` and `.damageMultiplier` (the exact ratio), `damageMultiplierFor`, catalog 25 lines / 122 cards, `TOP_LEVEL_STAT_PATHS` plus armor.
- Server: `armorDamage` gate (storm exempt, +armorBonus inside the cut window, burn and grind exact, whole blows floor with a floor of 1); harness `--tune armor.k` (floor 1) and probe columns; golden snapshot re-recorded on two offer rows.
- Client: ARMOR tables, `LADDERS_PER_ROW` 4, riveted-belt glyph.
- Review gate: Blind Hunter + Edge Case Hunter (Fable) + Codex gpt-5.6-sol, all three FIX-FIRST; 4 patches (exact ratio, a rounded multiplier under-dealt 1 hp on 33 shipped damage x armor pairs; minimum 1 hp, Eric's live ruling, amendment 119; stale cut wording; harness columns), 0 deferred, 1 rejected.
- Tests: shared 1058 -> 1064 (42 files), server 2525 -> 2548 (90 files), client 3991 -> 3992 (129 files), hook test green, lint 0 errors.
- Epic-9 amendments 110–120. Cycle 184. PROTOCOL_VERSION 80 -> 81.

## [0.18.48] - 2026-10-13

### Changed
- **The ARMOR card is now HULL, and it goes to five** (Story 9.6 — Five Tiers and Passive Healing). Each card adds +50 max hull (was +25) and there are five cards (was four). The 50 you gain is healed the moment you take the card. At five cards the three hulls sit at 500 / 550 / 600. SPEED and TURNING gain a fifth card at today's step. The three deck guns, RADAR SWEEP and RELOAD are untouched.
- **Passive healing is faster, and it is now a ladder.** Everyone heals 2 % of missing hull per second after 15 seconds out of combat (was 1 %). Each PASSIVE HEALING card adds 0.6 % per second and cuts the wait by 1 second: 5 % per second after 10 seconds at five cards. Only damage that actually removes hull hp resets the wait; a blow your shield eats whole does not. A card taken mid-idle pays off at once, with no fresh wait. Drones never heal.
- **HULL, SPEED and TURNING cards read Tier I on the first card and V on the fifth** (they used to "sail at Tier I"). The results LOADOUT dashes a ladder at zero copies and shows the six ladders as two rows of three.
- **The PASSIVE HEALING card shows one HEAL row** (its rate), and its glyph is a pulse trace (Eric's pick).
- **How-to-Play is frozen until 9.11:** the regen sentence still says 15 seconds and there is no PASSIVE HEALING entry yet.

### Internal
- Shared: `effectiveStats().regen` (seeded from `CONFIG.regen` 0.02 / 15000, the ladder adds +0.006 / -1000 per card, round3), `TOP_LEVEL_STAT_PATHS` plus the regen paths, catalog 24 lines / 117 cards, id `armor` -> `hullPoints` everywhere.
- Server: `tickRepairs` reads each hull's own wait via `regenDue` (drones never); defensive bot profile favors hullPoints + passiveHealing; harness probe list; golden snapshot re-recorded (two offer rows).
- Client: `UNPRINTED_PATHS` skip list on the card face, `BASE_TIER_LINES` = the three guns, LOADOUT two rows of three, pulse-trace glyph.
- Review gate: Blind Hunter + Edge Case Hunter (Fable) + Codex gpt-5.6-sol; 3 patches, 2 defers, 2 rejects, 1 live Eric ruling (amendment 100).
- Tests: shared 1058 (42 files), server 2525 (90 files), client 3991 (129 files), hook test green (266 passed), lint 0 errors (2 pre-existing max-lines warnings).
- Epic-9 amendments 90–101. Cycle 183. PROTOCOL_VERSION 79 -> 80.

## [0.18.47] - 2026-10-13

### Changed
- **Hulls are solid, and contact hurts** (Story 9.5 — Ramming and Contact Damage). Ships no longer pass through each other: overlapping hulls are pushed apart, split by mass, on the server before the land pass and in your own prediction against the contacts you can see. Two fleet-mates push each other but deal nothing.
- **Damage follows the energy law.** A **hit** lands once per charged contact, from the closing speed over 5 u/s: a full-speed ram costs both hulls, the lighter one more. Sliding and pressing against a hull **bleeds** over time, from the speed you scrape or press at, delivered like the burn DoT. **Land** counts as infinite mass at 0.25 of the energy, and the quarter-speed cap is kept. Mass is the effective max hull, and damage cut and shield both apply.
- **A wreck is solid and never credited:** it blocks hulls but is never the attacker, and the kill feed is unchanged.
- **Bots steer around hulls** (a bumper for the target) and gain a **[DRAFT] ram posture**; drones avoid hulls too.
- **Feel (judged on staging):** a spark in both hulls' colors and a grind tone on contact; the hit thud and shake stay quiet for the small bleed amounts while you scrape or press.

### Internal
- Shared: `sim/contact.ts` resolver (mass-split push-apart over the extracted island push-out core, closing speed measured on the line of centres, never pushes a hull through another), `CONFIG.ram` at the exact calibration (1265.625, 2/9), bot `hullLookaheadU` / `ramReachU`.
- Server: STEP_ORDER rows `resolveHullContacts` (before the land pass) and `applyContactDamage` (after it); the hit through the one damage gate as `'contact'`, latched per pair only once charged; the bleed as a fractional per-tick `'grind'` source reported through the 500 ms DoT window (damage cut halves it, a shield absorbs it); the land strike on the landContact edge priced on the pre-damp speed. Harness readouts `sunkByContact` / `ranAground` / land-contact damage and `--tune ram.*`.
- Client: predictor runs the shared contact pass against sighted contacts, `render/contactFx.ts` + `sim/contactBleed.ts`, `CLIENT_CONFIG.contactFx`.
- Tests: shared 1052 (42 files), server 2522 (90 files), client 3988 (129 files), hook test green, lint 0 errors (2 pre-existing max-lines warnings).
- Epic-9 amendments 73–84. Cycle 182. PROTOCOL_VERSION 78 -> 79.

## [0.18.46] - 2026-10-12

### Changed
- **The foul zone is weed and net** (Story 9.4, session 2 — Eric on staging: *"The net is visible but the murk is not. I wanted them combined."* then *"There was one instance with little squiggle lines. I liked that, and wanted that combined with the net."*). The dark disc shipped in 0.18.45 could not show because the ocean is drawn black. Now the zone is a faint lighter slick body, the shooter's-hue net over it, and eight light-grey weed squiggles on top that sway gently (still when motion is off). Eric picked the readable strength of the two rendered.

### Internal
- `client/src/render/foulZones.ts`: layers slick → glow → net → weed; `weedStrokes(id, r)` is a pure, seeded layout (`hashSeedText` → `mulberry32`, identical for every observer); the weed sways on an integrated phase (the ember-breath idiom), motion-gated. `CLIENT_CONFIG.foulZone` = `{ slickFrac 0.8, slickAlpha 0.3, netSpacingU 14, netWidth 1.3, netAlpha 0.55, weedCount 8, weedWidth 1.8, weedAlpha 0.75, weedLenU 40, weedAmpU 6, weedDriftU 4, weedHz 0.25 }`; `colors.foulMurk` → `colors.foulSlick` 0x7a7168; new `colors.foulWeed` 0xc4c0b8. `main.ts` passes the clock to the foul-zone render so the weed sways.
- Client only; PROTOCOL_VERSION unchanged (78). Tests: client 3960 (127 files), shared 1033, server 2482; lint 0 errors.
- Epic-9 amendments 71–72 (71: the pre-start phases do not matter for any gameplay gate — Eric). Cycle 181.

## [0.18.45] - 2026-10-12

### Changed
- **FLASH SHELLS are replaced by the FOULING SHELL** (Story 9.4, key `4`). It fires exactly as the flash did: one click-aimed shell out to radar range, no damage, bursts once. Where it bursts it leaves a **foul zone**, a 150 unit circle that lasts 15 seconds.
- **Any ship whose hull touches the zone runs at 0.75 of its speed, both ways, and the slow lingers 5 seconds after the hull leaves.** That includes the shooter's own ship. Two zones never stack, but a fouling mine's slow and a zone's slow multiply.
- **You see a zone the way you see a burn zone:** always for its owner, and for anyone whose radar range reaches its center. It is drawn as a dark oily disc under a diagonal mesh in the shooter's color, inside the usual zone ring (Eric's pick, "murk and net"), and the card has a new glyph, a fouled propeller. The card prints FOULING SHELL with rows RADIUS 150 U / LASTS 15 S / SPEED x0.75.
- **Bots fire it** at the nearest ship in sight while attacking and at a ship astern while escaping. The DAZZLED effect, its HUD tell and its sound are gone; the SLOWED tell now covers both slows. How-to-Play still describes FLASH SHELLS until Story 9.11.

### Internal
- `CONFIG.foulingShell` replaces `CONFIG.flashShells`; id `foulingShell` replaces `dazzleShells`; `polyInBlast` exported; `effectiveSight(stats)` takes one argument; `OwnShip.fouledUntil` replaces `dazzledUntil`; `FoulZoneView` + `FrameMsg.foulZones`.
- Server: `World.foulZones`, STEP_ORDER rows `applyFoulZones` (after `applyZoneEffects`) and `expireFoulZones` (after `expireBurnZones`), `tickKinematics` five-stage fold (boost, mine slow, shell slow, draft, hooks), `foulzone` signal row on the burn zone's gate, `applyFlash` deleted. Bots: `foulingShellTactic` + `nearestLiveAstern`; harness family `foulingShell.`.
- Client: `render/foulZones.ts`, `CLIENT_CONFIG.foulZone`, `colors.foulMurk`, the predictor's second slow fold off `you.fouledUntil`, the dazzle chain deleted.
- Review gate: Blind Hunter + Edge Case Hunter (Fable) + Codex gpt-5.6-sol, all BUILD-ON-IT; 1 patch (harness family comment), 1 defer (harness tune floors), the rest rejected.
- Tests: shared 1033, server 2482, client 3955 (127 files), hook test 266, lint 0 errors (2 pre-existing max-lines warnings). New `foulingShell.test.ts` (18), perception `foulZones` channel twin + oracle arm + ledger, goldenFrames re-recorded, new client `foulZones.test.ts`.
- Epic-9 amendments 61–70. Cycle 180. PROTOCOL_VERSION 77 -> 78.

## [0.18.44] - 2026-10-12

### Changed
- **Islands hide the countermeasure haze** (Story 9.3, session 6 — Eric: *"if I can't see it because of an island or any other sight block, don't render it"*). The haze now shows only where a clear line of sight from your hull reaches it: islands cut hard shadows into the 5/8 intel disc, the same way a wounded ship's smoke is only shown with island line of sight. The 5/8 edge and its soft feather are unchanged.

### Internal
- `client/src/render/hazeLos.ts` (`HazeLosCaster`: 360 rays from the own hull out to halo + feather through the shared `islandSegHit`, islands prefiltered by bounding circle and tested only on the rays their cone covers, nearest-first, each ray cut to its current hit; a grounded hull fails open), `textures.ts` `bakeHaloMaskTexture(haloU, into, rays)` fills the same radial feather through one fan path of the hit points, `countermeasure.ts` `setIslands` / `refreshLos` (re-cast only after 2 u of own movement, a halo change or an island change, and only while a cloud is held; the first cloud held forces a cast), `main.ts` wires `setIslands(g.islands)` beside `setWakeSources`. Knobs `losRays 360`, `losRecastMoveU 2`.
- Measured in node on real map seeds: mean 1.6 ms per cast, p99 5.9 ms, worst 10 ms inside large concave island clusters — ledgered as a staging perf watch (a dev build is never a perf verdict); the cheap version is a shared visibility-polygon primitive, an architecture call.
- Client only; PROTOCOL_VERSION unchanged (77). Tests: client 3946 (126 files; property test: every ray matches a brute-force minimum over all islands), shared 1028, server 2469.
- Epic-9 amendment 60. Cycle 179.

## [0.18.43] - 2026-10-12

### Changed
- **The countermeasure haze is a smoke effect and obeys the smoke rule** (Story 9.3, session 5 — Eric on 0.18.42: *"The smoke is visible outside of 5/8 intel range. Why? … I cannot see the smoke outside of that range, I can only infer it from radar returns."*). By eye you now see a cloud only inside your 5/8 intel halo, the same range a wounded ship's smoke shows at, with a soft edge; past that the only sign of it is its radar returns. The halo grows with RADAR SWEEP upgrades like the rest of the ladder.

### Internal
- Why it showed before: the server delivers a cloud to anyone whose radar sweeps it (so the radar can paint it) and the client drew the haze on the fog-immune `cloud` chart layer at full strength wherever delivered.
- `client/src/render/hazeHalo.ts` (pure: `hazeHaloU = radarRange × CONFIG.vision.muzzleFlashFactor`, the `sm` rung; `haloAlphaAt`), `textures.ts` `bakeHaloMaskTexture` (512², redrawn in place like the dim mask), `countermeasure.ts` owns the mask sprite at index 0 of the `cloud` layer and sets `layer.mask` at the own hull each frame (no pose → no mask, the radar dim's rule), `setHaloU` re-bakes only on change; `main.ts` wires `setHaloU(hazeHaloU(stats.radarRange))` beside `radar.setRanges`. `CLIENT_CONFIG.countermeasure.haloFeatherU 40`; the radius is not a knob.
- Delivery, retention, the radar returns and the nameplate hide are untouched (contacts live inside sight, always inside the halo). Client only; PROTOCOL_VERSION unchanged (77). Tests: client 3930 (125 files), shared 1028, server 2469.
- Epic-9 amendment 59. Cycle 178.

## [0.18.42] - 2026-10-12

### Changed
- **The countermeasure cloud gives radar returns by how thick it is** (Story 9.3, session 4 — Eric on 0.18.41: *"Visually, that is perfect. It's not being read by radar. Don't forget to composite it onto the radar layer so it can be painted. It should give returns in strength based on how thick the smoke is."*). The cloud is now a material the radar beam samples like water, hulls and wakes: where the beam sweeps smoke within radar range it paints a return whose strength is the smoke's thickness, banded, dimmed inside your sight bubble, shadowed by islands and fading on the phosphor like every other return. Thick smoke paints bright, thin edges faint, unswept or out-of-range smoke not at all.
- **The haze is thicker** (Eric: *"I can still kinda see ships under it a lot of the time"*). The dense body is now fully opaque; the rim stays wispy.

### Internal
- Why the 0.18.41 phosphor copy showed nothing: it painted on the CPU (3,391 cells in a replay of the real chain) but a cloud dropped on your own hull sits inside your sight bubble, where the radar's in-bubble dim shows paint at 20 %, and the copy drew as a flat tint at 0.02–0.17 alpha over grey smoke. Deleted: the copy sprite/buffer, `cloudPaintLayer`, `BeamWindow`/`beamWindow()`, `beamCrosses`.
- Built: `Radar.setCloudSource(countermeasure)` (the `setWakeSources` sibling); `FieldSpec.cloud` in `radarField.ts`; `cloudSample` in `radarSources.ts` — reflectivity `radarGain × haze` above `radarPaintMin`, VOLUME geometry, no range term, `terrainQ 0` so the mast-height shadow rule applies; ranks below terrain and hulls, above surf, wake and clutter. One `coverAt` per march sample in the swept slices; no cloud cell loop.
- Knobs: `radarAlpha` → `radarGain 1.0`; `maxAlpha 0.92 → 1.0`, `puffMinAlpha 0.04 → 0.1`, `puffMaxAlpha 0.12 → 0.3`, `puffsPerSec 400 → 800` (re-rendered off the real field before the PR).
- Client only; PROTOCOL_VERSION unchanged (77). Tests: client 3919 (125 files; nine new `radarCloudReturns` contracts incl. thick > thin, range, shadow, decay), shared 1028, server 2469.
- Epic-9 amendments 57-58. Cycle 177.

## [0.18.41] - 2026-10-12

### Changed
- **The countermeasure haze is smoke now, not sprayed dots** (Story 9.3, session 3 — Eric on 0.18.40: *"It looks like you have sprayed the spray tool itself … I said PIXELS, not blobs"*, with a reference image). The cloud is painted with a smoke brush: soft puffs of many sizes and greys land 400 times a second inside the growing disc and pile into a dense light-grey body with wispy edges, each puff fading over 8 s. Rendered off the real field code and shown to Eric before this PR (*"that looks about right"*).
- **The radar copy follows radar rules** (Eric: *"IF THE BEAM PASSES, IT PAINTS THOSE PIXELS AND THOSE PIXELS ONLY"*). Only the hazy cells the beam wedge sweeps, within radar range, light on the scope; they fade on the phosphor life like any return; nothing lights otherwise. The 0.18.40 behavior that lit the whole cloud whenever the beam touched it is gone.

### Internal
- `client/src/render/cloudPaint.ts`: brush stamps (bell falloff, "over" compositing, per-cell shade channel), centre-biased landing, 128-cell grid, linear filtering; `countermeasure.ts`: the phosphor copy gets its own buffer with per-cell "last swept" stamps painted from the radar's beam window (`rangeU` added to `BeamWindow`), haze frozen at the sweep. New color token `colors.countermeasureSmoke` (light warm grey). `CLIENT_CONFIG.countermeasure` knobs: `puffsPerSec 400, puffMinU 25, puffMaxU 70, puffMinAlpha 0.04, puffMaxAlpha 0.12, maxAlpha 0.92, shadeMin 0.55, shadeMax 1.0, radarAlpha 0.9, radarPaintMin 0.05, plateHideAlpha 0.35, fadeMs 8000, cellU 9` (`paintsPerSec`, `dotCells` deleted).
- Client only; the server and shared are untouched; PROTOCOL_VERSION unchanged (77). Tests: client 3923 (125 files), shared 1028, server 2469; lint 0 errors.
- Epic-9 amendments 55-56. Cycle 176.

## [0.18.40] - 2026-10-12

### Changed
- **The MULTI-SPECTRAL COUNTERMEASURE is a spray-painted cloud that fools eyes and radar alike** (Story 9.3, session 2 — Eric after his staging look: *"treat it as a 2d bitmap more or less the same way the radar layer is … like the spraypaint tool … each 'paint' itself fades to 0 alpha"*; *"THIS SMOKE ALSO PAINTS RADAR RETURNS. RADAR DOES NOT BEAT IT, IT LETS YOU GET THE FUCK AWAY."*). One press still makes one cloud for 15 s where you stand, but the cloud is now paint landing the whole time inside a disc that grows from 200 to 500 units, each dab fading over about 8 seconds, so the haze thickens, spreads and dies away like smoke.
- **What it hides.** The haze is drawn over every other ship and its name, and a phosphor copy of the same haze is drawn over the radar paints, lit each time your beam crosses it, so a return inside the cloud is buried in clutter. Your own hull is always drawn on top, so you can see where you are inside anyone's cloud. A ship with its bow sticking out of the haze shows its bow; a name under thick paint is hidden outright so it never gives a ship away.
- **The server no longer hides anything behind a cloud.** The 0.18.39 rule that pixels blocked sight for everyone and enemy radar inside the cloud is gone; the hiding is done by the drawing (Eric: *"whatever is easier"*).

### Internal
- `shared/src/sim/cloud.ts` keeps only `cloudScale` / `cloudOutlineRadius` (the spray disc); `CONFIG.countermeasure` = `{ lifeMs, r0, r1 }`; PROTOCOL_VERSION 76 -> 77 (the client reads the shrunken block).
- `server/src/game/signals.ts`: `sightClear` is island line of sight again; `radarClear`, `smokedInBubble`, `cloudCrossed` and the pixel scans deleted; the blip gate is annulus ∧ swept ∧ shadow march; the `cloud` row is delivered when the spray disc is sensed (rim within sight with island LOS to the nearest rim point, or within radar range with the beam crossing the disc's bearing span and the march reaching the centre). `StoredCloud` is the plain record. Harness `--tune` floors keep `r0` / `lifeMs`.
- Client: `render/cloudPaint.ts` (pure spray field: 113 × 113 cells of 9 u, linear decay, rejection-sampled dabs, pre-roll in 100 ms steps) + `render/countermeasure.ts` (one `BufferImageSource` per cloud shared by the grey sprite on the new `cloud` chart layer and the phosphor sprite above the radar paints, sweep-lit on the blip phosphor life); `coverAt(x, y)` feeds the contact nameplate hide; the wake's cloud mirror and `cloudBases.ts` deleted; new `ownShip` chart layer for the viewer's own hull and firing arcs. `CLIENT_CONFIG.countermeasure { cellU 9, fadeMs 8000, paintsPerSec 240, dotCells 2.5, maxAlpha 0.85, radarAlpha 0.9, plateHideAlpha 0.35 }` — feel knobs for Eric's staging eye.
- Chart order: `map, zone, litZone, smoke, mineChart, decoyChart, ship, plate, cloud, blip, ownShip, aim, burstFx, sweep` (contact hulls now sit below the radar paints; the own hull above them).
- Tests: shared 1028, server 2469, client 3914 (125 files) green; lint 0 errors; goldenFrames unchanged. Perception oracle re-derives the disc delivery gate; ledgers CLOUD_SIGHT_THROUGH / CLOUD_DELIVERED_BY_SIGHT / CLOUD_DELIVERED_BY_RADAR; `cloudPerf.test.ts` deleted (nothing left to pin).
- Epic-9 amendments 52-54. Cycle 175. PROTOCOL_VERSION 76 -> 77.

## [0.18.39] - 2026-10-11

### Changed
- **SMOKE SCREEN is now the MULTI-SPECTRAL COUNTERMEASURE** (Story 9.3). One press drops one stationary cloud of 300 scattered pixels where you stand; its radius swells from 200 to 500 units over 15 seconds while individual pixels die off between 6 and 15 seconds, so the cloud thins and fades instead of vanishing at once. Every press makes a new cloud.
- **The pixels block sight for everyone, you included.** Nobody can see through the cloud by eye, and the owner is blind inside it too. **Enemy radar** is blocked only for targets sitting inside the cloud (no shadow behind it); your own radar sees through it. You see a cloud whenever your eyes or your radar pick up any of its pixels, and once seen it stays on your chart until it dies.
- It lives on key `3` (cap 5 copies, like every consumable); the card prints MULTI-SPECTRAL CM and has a new glyph. The old rule that a ship inside smoke was seen at 1/8 range, the lay window and the round disc drawing are retired; the cloud is drawn as 20-unit squares in the wounded-smoke grey that fade as each pixel dies.

### Internal
- `shared/src/sim/cloud.ts`: seeded disc-sampled pixel function (no transcendentals), scale-outward drift, `cloudBlocks`. `CONFIG.countermeasure` replaces `CONFIG.smokeScreen`; `OwnShip.inSmoke` deleted; `FrameMsg.smoke` -> `clouds` (`CloudView`).
- `server/src/game/signals.ts`: `sightClear` over cloud pixels for everyone, new `radarClear` as the blip gate's fourth term (hides only targets inside the outline), and the `cloud` pseudo-row (the SIX exceptions unchanged). `world.ts`: `StoredCloud` memo + `stepClouds`; bots press once per disengage; harness `--set countermeasure.*`.
- Client: `render/countermeasure.ts` pixel renderer + `cloudBases.ts` memo, `CLIENT_CONFIG.countermeasure { fillAlpha .55, fadeMs 2000, drawSizeU 20 }`; the `inSmoke` client chain deleted; wake sight mirror.
- Review gate (Fable hunters + Codex): delivery re-ruled by Eric to per-pixel sensing (amendment 51 supersedes 42 — `cloudSignal` tests sighted or radar-detected pixels, the client holds a received cloud until it dies and clears at the match-start edge); harness `--tune` floor 1 for `countermeasure.r0` / `lifeMs` / `pixels`.
- Tests: shared 1040, server 2478, client 124 files green (perception oracle cloud arm + four non-vacuity ledgers, `countermeasure.test.ts` 26 directed cases, `cloudPerf.test.ts` 1.1 ms vs the 50 ms budget, goldenFrames unchanged).
- Epic-9 amendments 40-51. Cycle 174. PROTOCOL_VERSION 75 -> 76.

## [0.18.38] - 2026-10-11

### Changed
- **The HUD bar's glow is a real glow.** The faint stacked boxes around a ready, selected or just-activated square — three outline rings standing in for the mock's soft shadow — are gone; each halo is now a true blurred bloom in the square's own color, sitting outside the box like a shadow. Eric 2026-10-11: *"I don't want an emulated shadow glow."* The fit pulse (the flash when a card lands on a square) uses the same bloom. Per-state reach and strength are the mock's numbers, unchanged.

### Internal
- `client/src/render/hotbar.ts`: a `glowGfx` layer under the squares with one `BlurFilter` (`CLIENT_CONFIG.hudBar.glowBlurPx` 8, quality 4); `drawGlow` fills an inflated ring with the square cut out; `drawFitPulse` likewise; `inflate` deleted. Tests: the probe reads the square layer (child 1) and the glow layer (child 0); contract tests for the bloom (one filled ring per lit square at the skin's color/alpha, a cut hole, no outline rings, no halo on zero-stock or empty squares).
- PROTOCOL_VERSION unchanged (75). Epic-9 amendment 39. Cycle 173.

## [0.18.37] - 2026-10-11

### Changed
- **Every consumable has its own key, always** (Story 9.2). The four-slot belt is gone: a captain holds every kind, each on a fixed number key — `1` HULL REPAIR · `2` SHIELD BLOCK · `3` SMOKE SCREEN · `4` FLASH SHELLS · `5` DECOY BUOY · `6` SUPERCAVITATING TORPEDO (Digit and Numpad rows). The only limit is the cap of 5 copies per kind; a pick is never lost to a full belt and a key never changes meaning when a stack runs out. Eric 2026-10-11: *"All captains can carry all consumables. Each is tied to a specific number key by default."*
- **CHAFF is retired** (Eric's pick so the row is six keys — epic-9 amendment 31). Its fake radar returns and the owner's ghosts are gone; Story 9.3 brings the MULTI-SPECTRAL COUNTERMEASURE onto key `3` and Story 9.4 the FOULING SHELL onto key `4`.
- **The HUD bar is re-laid** to mock option D′: globes 124 px, weapon squares 46 px with 24 px icons, and an unframed strip of six 34 px consumable squares above them with their key chips; the stack is exactly as tall as a globe, so the globes' edges are the panel's edges and nothing is drawn behind. A kind you hold none of keeps its square and key, drawn dashed with a faint icon (ZERO STOCK); pressing it flashes the square red. Key chips and stock digits never render under 9 px (the 2026-09-17 rule wins over the mock's 8 px).
- **A consumable at its cap is dealt and greyed with no caption** (Eric: *"There's no need for 'cap copy,' if it is simply known that items have a cap of 5."*); `SLOTS FULL` now appears only on an equipment card when Q/E/R are all taken.
- **The results LOADOUT row** shows the same six squares as the live bar at 72 %, zero-stock squares included.
- **Drone drops** can stock any kind under its cap (there is no full belt to narrow them).

### Internal
- PROTOCOL_VERSION 74 -> 75 (loadout slot shape: `SLOT_COUNT` 9 -> 11, `OwnShip.ammo` length 11 with a `null` in slots 5–10 meaning zero stock; `OwnShip.chaff` / `chaffGhosts` fields gone; catalog content).
- `shared/src/sim/loadout.ts`: `CONSUMABLE_KEY_ORDER`, `consumableSlotFor`, `consumableKindAt`; `CONSUMABLE_SLOTS` [5..10] and `SLOT_ROLES` derived from the key order. `boons.ts`: `stockSlotFor` is the fixed slot; `canStock` / `'beltFull'` deleted (`PickRefusal` = stub | atCap | noWeaponSlot; an unkeyed consumable is refused as a stub); `slotsWithCards` never packs.
- Deleted: `server/src/game/fakes.ts`, `equipment/consumables/chaff.ts`, `client/src/render/chaffRing.ts`, `chaffGhosts.ts`, `CONFIG.chaff` and the chaff client knobs; the perception suite loses its chaff-fakes carve-out oracle, so the master invariant is strictly tighter (the SIX exceptions untouched). `rebuildBelt` -> `rebuildConsumableSlots` (replay only). Bots: `carries()` reads the kind's fixed slot; the chaff tactic/profile rows are gone; no CONFIG number moved.
- Client: `BELT_KEY_CODES` -> `CONSUMABLE_KEY_CODES` (1–6 both rows); `hudBarLayout` two-row stack (bar 538 × 156, stack 124; the refit band rides 20 px higher); `hotbar.ts` `'zeroStock'` state; `upgradeMenu.ts` `cardFoot()`; `loadoutBlock.ts` D′ twin; How-to-Play icons follow `hudBar.icon` (24 px).
- Tests: shared 41 files / 1036, server 89 / 2487, client 124 / 3911, hook suite 266 — `npm run check` green. `goldenFrames` snapshot re-recorded knowingly: `ammo` 9 -> 11 entries on every row and ONE row's `offer` `chaff` -> `decoyBuoy` (chaff left the draw pool); no contact, event, blip, mine, zone, position or hp value moved.
- Epic-9 amendments 31–37; DESIGN.md `hud-bar` / `belt-slot` (retired) / new `consumable-strip` / `loadout-block` rows and EXPERIENCE.md's Zero Stock slot state, dated; How-to-Play and Settings belt wording left for Story 9.11 (amendment 36); the live bar is judged on staging (amendment 37).

## [0.18.36] - 2026-10-08

### Changed
- **Mines and torpedoes are seen at sight range** — they appear at the 4/8 rung (330 u, the same distance a ship becomes visible) instead of 3/8 (247.5 u). Eric: captive mines could be upgraded to fire before they were seen. Nothing else moves (the wake clock stays 5.5 s).
- **Captive mines trip at 120 units instead of 144** (176 at tier V, was 211), so even a fully upgraded captive mine fires from inside the range you can now see it at. Eric's call off the mine experiments (five arms; none of the naval or captive dials moved attrition or class share beyond noise).
- **Every mine glyph carries the same circle** — the naval mine's sphere, which on the water is the 10-unit ring a deck-gun shell must land inside. The fouling mine loses its tether squiggle and its sphere grows to that size; the captive mine's triangle-and-torpedo icon sits inside that circle. Card and on-water marker alike.

### Internal
- PROTOCOL_VERSION 73 -> 74 (`CONFIG.vision.detectFactor` is read by the client).
- `CONFIG.vision.detect` = sight, `detectFactor` 1. Tests: the eighths-ladder pins read the 4/8 rung (detect ≤ sight, detect / eighth = 4); the signals detect gate re-derives 4/8 as a literal; the two pins that tied the wake clock to the detect rung are deleted (a pinned coincidence, not a rule — Eric 2026-10-08); wake capacity / bucket / torpedo half-life pins now read their formulas. Tests: shared 1033 -> 1031 (the two wake-vs-rung coincidence pins deleted), server 2515, client 3929; lint 0 errors; `npm run check` green.
- `equipmentIcons.ts`: `MINE_R` (one circle), `CAPTIVE_ORIGINAL` kept verbatim and scaled through `intoMineCircle`; fouling re-cut.
- `CONFIG.captiveMines.triggerRadius` 120; the captive ring tests read the CONFIG ring × 1.1ⁿ (no number pins).
- Epic-9 amendments 14–19; `batch-sim-evidence-2026-10-06.md` §10 (the mine arms); GDD dated supersessions (eighths ladder, wakes, the captive trigger ring). No How-to-Play or README change.

## [0.18.35] - 2026-10-07

### Changed
- **The storm ramps instead of biting flat** — outside the live ring you now take 1 hp/s from the first close, 2 from the second, 3 from the third, 4 during the final collapse and 5 once the storm has fully closed in (it was a flat 4 hp/s from the first close). Eric's numbers after playing 0.18.34 on staging.
- **The ocean is 8,000 wide** — radius 4,000 (was 5,500: *"11000 diameter is too big"*), rings closing 8,000 → 5,000 → 3,000 → 2,000 → 0 in diameter. Land stays 10 %.

### Internal
- PROTOCOL_VERSION 72 -> 73 (the client derives the map and the storm rhythm locally; a same-seed ocean differs).
- `CONFIG.zone.stormDps` is a ladder `[1, 2, 3, 4, 5]` read through `stormDpsFor(state)` (`sim/zone.ts`): rung k from the start of close k, last rung once closed, 0 before the first close. `applyStorm` is the only biter. Harness: `--set zone.stormDps=X` flattens every rung (storm-kill / storm-off arms keep working), `zone.stormDps.N` sets one.
- `CONFIG.map.baseRadius` 4000; `CONFIG.zone.ringRadii` [2500, 1500, 1000]. Height raster 577² (was 791²).
- Tests: `stormDpsFor` contract tests on a synthetic ladder; the ramp walked through a real one-tick-per-beat timeline in `server/src/__tests__/zone.test.ts`; the NFR6 ceiling and the storm-granularity pins read the fully-closed rung through the function (no number pins). Tests: shared 1030 -> 1033, server 2514 -> 2515, client 3929 (unchanged); lint 0 errors; `npm run check` green.
- Epic-9 amendments 11–13; `batch-sim-evidence-2026-10-06.md` §9 (the harness run Eric asked for); GDD dated supersessions (storm rate, ocean size). No How-to-Play or README change.

## [0.18.34] - 2026-10-07

### Changed
- **The ocean is twice as wide and four times as island-y** — the map radius goes 2,800 → 5,500 units and land covers 10 % of the water instead of 2.5 % (about 140 landmasses per match instead of 24). The storm now closes on Eric's own ladder: ocean diameter 11,000 → 7,000 → 4,000 → 2,000 → 0, so the last ring before the collapse is 2,000 wide instead of 1,320. Hull hp, guns, heals and the spawn ring are untouched. This is Story 9.1's first cut, shipped for Eric to play on staging after his own balance-harness session (`batch-sim-evidence-2026-10-06.md`): in the sim this board was the first to leave 10 hulls afloat at 4:00 (7 before) and lifted the 8:00 count from 1.3 to 3.8 against his target of 5.

### Internal
- PROTOCOL_VERSION 71 -> 72 (same seed, different ocean; the client derives the map and the storm rhythm locally from `CONFIG.map`, `TERRAIN_PARAMS` and `CONFIG.zone`).
- `CONFIG.zone.ringRadii` [3500, 2000, 1000] is the ring ladder in world units (terminal last); `ringSteps` and `terminalSightFactor` are gone from the shipped config and survive only as the formula fallback in `sim/zone.ts` for dev `zoneOverride` literals, smokes and fixtures. The 1,000 u terminal is wider than radar reach (660 u): Story 3.4's "radar reaches the endgame ring" reading no longer holds; the sudden-death collapse ends the match.
- **The map generator never gives up** (Eric 2026-10-07: *"Generate maps until you have a valid map"*): a draw that fails an invariant is reseeded deterministically and generation continues, on both sides from the same wire seed. Before this, roughly 1 seed in 30–100 on the new board threw and would have closed the queue for that lobby; the 2026-09-16 "map-gen throw" thread is closed by construction. `MapGenerationError` remains only as a bug guard after 1,000 consecutive invalid draws.
- Harness: `--set terrain.*` (cover band, `regionWavelength`, which follows a `map.baseRadius` override), `--spawn-rings slots@fraction,...` (harness-only multi-ring lattice with a seated-hull readout), `zone.ringRadii.N`; the retired zone dials are refused with the live one named.
- `mapIsNavigable(map)` exported from `sim/map.ts` (validateMap's navigability half).
- Tests: ring sizes are no longer a test subject (Eric 2026-10-07) — the zone suite exercises the ladder functions on synthetic input; the closing-rate band suite, the 2×sight terminal pins and the cover-value pins are deleted. Re-bases with their measurements in epic-9 amendment 9 (radar land-crossing share 14.8 % → 33.5 %; raster-vs-coastline depth 30 → 60 u for 92-vertex landmasses; production raster 405² → 791²; collision fixtures re-seated; golden snapshot re-recorded — only spawn event positions moved). Tests: shared 1034 -> 1030 (number pins deleted, function pins added), server 2504 -> 2514 (+10: spawn layout, terrain dials), client 3929 (unchanged); lint 0 errors; `npm run check` green.
- Epic-9 amendments 2–9; `spec-9-1-the-tuning-pass.md`; GDD dated supersessions (storm, ocean, generation parameters). No How-to-Play or README change.

## [0.18.33] - 2026-10-02

### Changed
- **The lobby no longer changes size, and START NOW starts the countdown** — the lobby window is now one fixed size, and nothing in it moves when captains join or leave or when you turn BOT-FILL on. The roster is two columns of ten slots that fill left to right, top to bottom as captains join, and a small circle beside each callsign is green when that captain is ready and red when not. The host's options sit under the code and above the roster, each with a label and a control: SEED (a text box) and BOT-FILL (a YES / NO choice). A captain who is not the host sees the same labels with the current values and status. START NOW no longer jumps straight into the match: it starts the 10 s countdown (STARTS IN), and that countdown ignores ready status. (Eric, 2026-10-02, after staging.) Names never move once seated (a vacated slot stays empty until the next captain takes it), the lobby fits a 768-tall laptop without scrolling, and pressing START NOW during the all-ready countdown locks it.

### Internal
- `client/src/ui/lobbyLayout.ts` holds every fixed size of the lobby (panel 600 x 598, option rows 36 px, slot grid 2 columns x 10 rows of 20 px, button row of three 160 x 40 cells), and `lobbyModal.ts` mounts every region once and never unmounts or hides one for state; server `rooms/lobby.ts` gains `forceStart` and the schema gains `LobbyState.forced` (a forced countdown survives un-ready, a late join and a leave that keeps the start legal, and is cancelled only when eligibility is lost). `LobbyPlayer.slot` (sticky slot, assigned by the server). PROTOCOL_VERSION unchanged at 71 (lobby-room fields and channel only). `server/scripts/lobbySmoke.mjs` scenario B asserts the forced countdown and the seat about 10 s later.
- Tests: shared 1034 (unchanged), server 2486 -> 2504 (+18), client 3906 -> 3929 (+23); lint 0 errors.
- Epic-8 amendments 240-242; `spec-lobby-fixed-layout-forced-start.md`. No How-to-Play or README change.

## [0.18.32] - 2026-10-02

### Added
- **Private lobbies** — the home screen has a third line under the mode row with two buttons, CREATE and JOIN, for playing with friends on purpose. CREATE opens a lobby and shows its six-letter code (A to Z, any case when typed; click the code to copy it); JOIN asks for a code and answers NO SUCH LOBBY, LOBBY FULL or MATCH STARTED if it cannot seat you. Everyone aboard sees the roster (N/20 ABOARD, each callsign with a READY mark) and presses READY or UNREADY. When every captain is ready a 10 s countdown starts (STARTS IN), and any captain un-readying, or a new captain joining, stops it; the match then forms, with the arena's own boarding hold and 10 s start after it. The host also sets an optional seed (free text, anything you type; blank means a random map; every captain sees it, and the same text always gives the same map), a BOT-FILL toggle that fills the match to 20 hulls with combat bots, and START NOW, which skips the ready check but needs 2 captains or BOT-FILL (otherwise it is disabled with 2 CAPTAINS OR BOT-FILL REQUIRED). If the host leaves, the longest-present captain becomes host (YOU ARE HOST). Lobbies hold 20 captains. When the match starts the code dies, and after the match everyone goes home. Lobbies count toward PLAYERS ONLINE and private matches toward LIVE GAMES, and creating one shares the per-address create limit with Solo vs AI. (Eric, 2026-10-02.)

### Internal
- PROTOCOL_VERSION 70 -> 71 (the client reads the new `CONFIG.lobby` block — `codeLength` 6, `countdownMs` 10000, `seedTextMax` 32, `startedLingerMs` 60000 — and the arena carries a new mode, `'private'`). New wire ids `MSG.lobbyReady 'lr'`, `lobbySeed 'ls'`, `lobbyBotFill 'lb'`, `lobbyStart 'lg'`, plus the `LobbyResolveResponse` shape.
- New: shared `sim/seedText.ts` (`hashSeedText` FNV-1a 32-bit over UTF-16 code units; `resolveSeedText` tries the text, then `text0`, `text1`, ... against an injected probe, so the deferred map-generation throw is routed around, never fixed); server `rooms/lobby.ts` (pure policy: roster, host succession by join order, eligibility, countdown evaluation, code minting), `rooms/LobbyRoom.ts` (the Colyseus adapter) and `rooms/schema/LobbyState.ts`, `rooms/formArena.ts` (the create-arena / reserve-seats / fail-seats routine extracted from the Standard queue and shared by both rooms), `rooms/createThrottle.ts` (the per-IP create throttle moved out of ArenaRoom, shared by Solo and lobby creates), `rooms/lobbyTicket.ts` (a per-process random trust ticket: only server-side `createRoom` calls carry it, so `mapSeed` / `botFill` / `mode:'private'` are admitted for the lobby's arena and still stripped from every client option bag), `lobbyResolve.ts` with `GET /lobby/resolve?code=` on the same router as `/metrics` and `/liveness`, `scripts/lobbySmoke.mjs`. Liveness counts lobby clients in PLAYERS ONLINE and private arenas in LIVE GAMES (no new payload bucket). Client: `net/lobby.ts`, `app/privateLobby.ts`, `ui/privateRow.ts`, `ui/joinCodeModal.ts`, `ui/lobbyModal.ts`, `ui/portModal.ts`, `net/resumeToken.ts` (`hullcracker.resumePrivate`), `app/requeue.ts` (a private collapse goes home instead of requeueing and releases the session lock), `config.ts` `LOBBY_SEED_DEBOUNCE_MS` 400.
- The host's seed is validated ONCE, when the match forms, not on entry (Eric 2026-10-02, "Yes, check at start"): the review found a per-entry probe is a full synchronous map generation that one host could repeat against the shared event loop. A reserved captain who never boards a bot-filled match leaves it at 19 hulls after the boarding grace; no top-up (Eric 2026-10-02, "Acceptable, leave it").
- Review gate (Blind Hunter + Edge Case Hunter on Opus 5.5 by Eric's call on Fable credits, plus Codex `gpt-5.6-sol`; all three fix-first, the trust ticket held under all three): seed probed once at form time; a late joiner after the form is refused with MATCH STARTED and a failed form disconnects stragglers; in-process code reservation; the lobby-door CAPTAIN-n callsign carried on the seat; the private flag persisted beside the resume token; session lock released on a private collapse; locked -> MATCH STARTED / full -> LOBBY FULL; double-click toggles keep intent; ESC cancels an in-flight join; home doors busy under the join modal; seed debounce-sent while typing; a pasted code keeps its last 6 letters.
- Tests: shared 1025 -> 1034 (+9), server 2413 -> 2486 (+73), client 3813 -> 3906 (+93); lint 0 errors.
- Epic-8 amendments 235–239; `spec-private-lobby-join-code.md`. No How-to-Play or README change (no in-game copy unasked; flagged as a gap).

## [0.18.31] - 2026-10-02

### Changed
- **Machine gun re-tuned** — damage 5 / 6 / 6 / 7 / 7 by tier, magazine 12 / 16 / 20 / 24 / 28 shells, 0.30 / 0.25 / 0.20 / 0.15 / 0.10 s between shots, and a 12 s reload at tier I that shortens 5 % per tier (9.6 s at V). Was 4 to 8 damage, 16 to 24 shells, 0.35 to 0.20 s and a 10 s reload. A tier-I stream now pops a 10 hp mine in two shells. (Eric, 2026-10-02.)
- **Cannon re-tuned** — damage 16 / 16 / 18 / 18 / 21 by tier (the base shell rises 15 -> 16; the steps land at tiers III and V), and barrels 1 / 2 / 2 / 3 / 3: the second barrel arrives at tier II and a third at tier IV (it was a single second barrel at tier V). A fully upgraded cannon lands 3 x 21 = 63 hp in one click, so it takes a 45 hp small drone in one click again, and a 60 hp medium drone; Eric accepted both.
- **Flak re-tuned** — damage 12 / 20 / 28 / 36 / 44 by tier (a flat +8 per tier) and a 3.5 s reload at tier I that shortens 5 % per tier (2.8 s at V). Turrets (the banked-shot pool) are 1 / 2 / 2 / 3 / 3 by tier: the second turret arrives at tier II and the third at tier IV (was 1 / 1 / 2 / 2 / 3). The 50 u blast is unchanged. (Eric, 2026-10-02.)
- **Instant Reload cools down longer** — the Repeater's Shift recharges in 60 s instead of 45 (45 s with a fully upgraded Reload ladder, was 33.75 s). (Eric, 2026-10-02.)
- **How to Play, flak line** — now reads "Faster reload and a larger blast radius than the Cannon; its damage climbs steeply with tier." The stat tables are derived and show the new numbers on their own.

### Internal
- PROTOCOL_VERSION 69 -> 70 (catalog content and `CONFIG.machineGun` / `CONFIG.flak` values the client reads). `CONFIG` moves: `gun.damage` 15 -> 16; `machineGun` maxAmmo 16 -> 12, rateMs 350 -> 300, reloadMs 10000 -> 12000, damage 4 -> 5; `flak.reloadMs` 4000 -> 3500; `instantReload.reloadMs` 45000 -> 60000. The ladders are authored per rung in the catalog so every table lands exactly on Eric's integers (the machine gun's rungs to III and V carry no damage step).
- Epic-8 amendments 232–234; `spec-deck-gun-numbers-retune.md`.
- Tests: shared 1025 (re-pinned, none added), server 2412 -> 2413 (+1: the tier-II 250 ms cadence pin; machineGunStream's carry-over tests now run on an injected 310 ms because every ruled delay is a whole 50 ms tick), client 3811 -> 3813 (+2: aimPreview 1 card = 2 barrels straddling, 4 cards = 3 with one on the click). Golden-frames snapshot regenerated: four cannon-hit amounts 15 -> 16, nothing else.

## [0.18.30] - 2026-10-02

### Changed
- **Bots can hit what they only have on radar** — a bot now works out a radar plot's course and speed the way a captain reads the scope: from the wake trail behind a fresh paint (the old water is where the ship was) and from how far the paint moved since the last sweep. Every weapon's lead is aimed at where the plot should be now, not where it was last painted. Measured on a pinned machine-gun bot against a torpedo boat sailing at full speed 500 u away: hits went from 0 % to 86 % on a circling target and from 0 % to 100 % on a straight runner; a target in sight stays at 100 %. (Eric, 2026-10-02.)
- **Bots stop shooting at ghosts** — when a bot's own sweep passes the spot where a plot should be and nothing paints there, the plot is dropped (two ticks of grace for a paint running a hair late). A moving ship stays one plot instead of leaving a trail of stale ones.
- **The machine gun saves its magazine** — a bot holds the stream when its plot has no course and its last paint is older than one sweep (4 s). The cannon and flak keep firing at stale paint as before (shooting at blips is a skill). The stream is aimed one hull length past the target so a shell cannot die just short of the hull.

### Internal
- New `server/src/game/ai/plot.ts` and `ai/sweepMiss.ts` (the plotting table: `fitWakeVelocity` off the `wk` age buckets — youngest bucket with a ≥ 36 u baseline, else the oldest; `paintVelocity` with an 18 u stationary floor; `predictedPos`; `associatePaint` — nearest predicted within 54 u + (fastest hull / 3) × age, else the sole course-less plot in reach; `settleSweptMisses` with `SWEEP_MISS_GRACE_MS` = 2 ticks, dropping only once the beam has cleared the whole association disc, gated by the perception boundary's own `visibilityTo(map.heightRaster)` beyond sight; dead reckoning frozen past one sweep + grace and clamped to the water disc; a Hit Call credits within half the longest hull, 62 u, and refreshes a course plot at its prediction; one `plotPoint` feeds the guns, the helm and the scorer). `RememberedContact` gains `vx/vy/vAt/vSrc`, `paintX/paintY/paintAt`, `missSweptAt`; `BotMind.wakeCells`; `BotSelf.sweepAngle/prevSweepAngle` (self-reads — a human client is sent `OwnShip.sweep` every frame; no port widening, no perception change, the six exceptions stand). `foldView` order: drop truesight → wake cells → events → contacts → sweep-miss mark/drop → wake refit → prune. A Hit Call on a course plot refreshes it at its predicted position (never the impact point). `leadPoint` leads the predicted position; torpedo/broadside refuse only a course-less plot; the MG hold rule and the aim-past overshoot live in `streamSolve`.
- Tests: server 2347 -> 2402 (`botPlot.test.ts` 49, `botGunnery.test.ts` 6 regression pins on a flat-raster open ocean, MG-only counting, bars from the measured geometry — sight orbit ≥ 99 % (100), radar orbit 500 u ≥ 70 % (97), parked END-ON ≥ 50 % (67: a 9 u silhouette against the bot's 12 u scatter disc at 500 u), parked BEAM-ON ≥ 95 % (100), racetrack with 60 u U-turns ≥ 65 % (80), a swept-clean plot gone within 4 ticks (3)), shared 1025 and client 3811 unchanged, hook test 266, lint 0 errors.
- Epic-8 amendments 229–231; `spec-bot-radar-plots-lead-and-wake.md`. No How-to-Play change (bots only).
## [0.18.29] - 2026-10-02

### Internal
- Batch-sim harness: every bot sample records its `gun`, its `gunTier` (1–5, the tier at death or finish) and `killsByTier` (the killer's tier at each kill); the bot aggregate gains `byGun` / `byGunTier` groups (a win = placement 1 on a resolved match) and a gun × tier table in the text report; each JSON variant records `botGun` / `botHull` / `botSpend`, so a report is self-describing.
- New harness-only `--bot-spend gun` mode: a bot takes its mounted gun's ladder card whenever it is dealt, otherwise its profile scorer, so a campaign can measure the guns at tier V (bots reach V in about 1–2 % of bot-matches under profile spend). No gameplay change.
- New `gun_tier_analysis.py` in the balance-sim skill (stdlib): exact attrition, Wilson class shares, gun × final tier, time-at-tier kill rate with Poisson CIs, and arm-vs-baseline differences.
- The 2026-10-01 balance ledger (`batch-sim-evidence-2026-10-01.md`, 99 matches per arm): the REPEATER wins about +8 pp over the 31–35 % band; ring 1 sinks too slowly, ring 2 too fast, and ring 3 is unmeasurable (the field is gone first); in bot hands the three guns are equal at tier V; paper DPS has the machine gun ahead at tier I (4.1 > cannon 3.0 = flak 3.0) and still ahead at tier V (MG 15 > cannon 10 > flak 6.25). Proposals P1–P6 are pending Eric; nothing has been applied to `CONFIG`.
- Work item (Eric ruling 2026-10-01): a hull that bodyblocks a cannon or flak shell must take the full damage, not `contactDamage` (6 / 4). Written to `deferred-work.md`; not built this cycle.
- Tests: server 2347 -> 2357 (10 new: 3 in `botHarness.test.ts`, 7 in `gunFirstSpend.test.ts`); shared 1025 and client 3811 unchanged; hook test 266; lint 0 errors. PROTOCOL_VERSION unchanged at 69.
- Epic-8 amendment 228.

## [0.18.28] - 2026-10-01

### Added
- **Drone kills drop consumables** — the captain who gets the last hit on a PvE drone rolls for loot: one 50 % roll for a small drone, two for a medium, three for a large (so 0–1 / 0–2 / 0–3 items). Each successful roll stocks one random consumable straight into your belt and shows the usual `◆ <LINE> STOCKED` toast. The pick is drawn from every live consumable you could legally take at that moment: with a full belt you only get more of what you already hold, and a line already at five copies is skipped. Bots get drops by the same rule. (Eric, 2026-10-01.)

### Internal
- `CONFIG.droneDrops` (`chance: 0.5`, `rolls: { droneSmall: 1, droneMedium: 2, droneLarge: 3 }`). The roll runs in `World.creditKill`'s fleet-hull branch for an afloat participant killer, off a NEW dedicated `dropRng` stream (spawns and refit offers are pinned byte-identical to before); eligibility is the refit card's own `pickRefusal` predicate, re-evaluated per roll; the copy enters through `applyCard`. A new self-private `dp` event (killer only, not a seventh fog exception — the SIX stand) drives the toast, the stock tone and the belt flash without the spend ack.
- PROTOCOL_VERSION 68 -> 69 (new event kind).
- The toast stack holds 4 lines (was 3): a large drone's three STOCKED receipts plus the kill's LEVEL UP can land in one frame (Eric, review gate). A drop that lands while your refit hand is open is accepted as designed: the hand never rerolls, a card the drop made unpickable greys SLOTS FULL until you fire a stack (amendment 44). The drop receipt shows even if you are sunk later in the same tick (the copy is stocked).
- Tests (on top of 0.18.27): shared 1025 (unchanged; PV pins re-cut), server 2326 -> 2347 (`droneDrops.test.ts`: 21 pins through the real sink path incl. determinism, the untouched spawn/offer streams and the open-hand cases), client 3806 -> 3811 (`roomBindings.test.ts`: the `dp` handler); hook test 266; lint 0 errors; golden-frame snapshot unchanged.
- Epic-8 amendments 225–227; GDD roving-fleet bullet; DESIGN.md toast row stamped (max 4); `spec-drone-kill-consumable-drops.md`. How-to-Play is untouched (Eric holds the pen on `[ EXPERIENCE ]`).

## [0.18.27] - 2026-10-01

### Changed
- **Every card has its own icon** — the three torpedoes, the three mines, the CANNON card and the five ship upgrades no longer share a drawing or show an empty box. LIGHT TORPEDO is a slim torpedo with speed dashes, SUPERCAV TORPEDO rides inside a bubble, CAPTIVE MINES is a triangle with a small torpedo inside, FOULING MINES is a small spiked sphere on a tether, HULL REPAIR is a rod of Asclepius instead of a plus, and ARMOR / SPEED / TURNING / RADAR SWEEP / RELOAD each get one (plates, arrow, rudder, dish, hourglass). Eric approved the sheet before it was built. The same icon shows on the refit card, the hotbar, the results LOADOUT and How to Play.
- **Mines on the water show their icon** — a laid mine draws its hotbar icon in the dropper's color instead of a ring and a dot, and everyone who can see a mine can now tell naval, captive and fouling apart (Eric: "Everyone sees the kind").
- **Mine rings are easier to see** — the blast and trigger rings on your mines are twice as thick and about twice as bright; an arming mine still reads dimmer.
- **Chaff is easier to read** — the dashed ring around your cloud is brighter and thicker, and you now see your own fake radar returns, in grey at half strength, so you know where the decoys are. Enemies still cannot tell a fake from a real return.
- **Bigger chaff and smoke** — chaff scatters its fakes over 180 u (was 120). A SMOKE SCREEN puff now starts at 123.75 u and grows to 247.5 u (was 82.5 → 165). Seeing out of smoke is unchanged.
- **Ships under 25 % hull are on fire** — flames flicker at the hull alongside the heavy smoke. They stay visible with motion turned off; only the flicker stops.
- **The Supercav Torpedo hits for 85** (was 50).
- **The mouse wheel scrolls the ESC menu** — while the settings menu is open, the wheel no longer zooms the camera.

### Internal
- PROTOCOL_VERSION 67 -> 68: `MineView.c` rides every observer's mine row (was owner-only, amendment 76); the self-private `OwnShip.chaffGhosts?: GhostPaint[]` carries the owner's own beam-painted fake rects (`ReturnBlipEvent` now extends `GhostPaint`; the wire blip stays seven keys); the client reads `chaff.radius`, `smokeScreen.r0` / `r1` and `supercavTorpedo.damage` from CONFIG. Perception exception count stays SIX.
- Client: `render/equipmentIcons.ts` gains `LINE_GLYPHS` and `glyphPaths` resolves consumable → equipment → line ids (every line but the stub DEPTH CHARGE answers a distinct glyph); new `render/chaffGhosts.ts` (the scope's own march/heatmap functions into a separate grey sprite on a new `chaff` chart layer above the smoke discs — Eric: radar returns are never below the smoke screen) and `render/fire.ts` (rides the tier-2 `sm` pulse, no wire change); three DRAFT grey tokens `ghostFaint` / `ghostFuzzy` / `ghostSolid`; `mineRings` and `chaffRing` knobs raised (drafts); `wheelScrollsSurface` gates the one wheel listener.
- Tests: shared 1024 -> 1025, client 3761 -> 3806, server 2316 -> 2326 (chaff ghosts + their radar-range bound, frames, perception ghost oracle, the chaff layer seat); hook test 266.
- Epic-8 amendments 213–224; GDD, catalog-v3, DESIGN and EXPERIENCE carry dated stamps; `spec-epic-8-legibility-cleanup.md`.

## [0.18.26] - 2026-10-01

### Changed
- **The three classes have names** — the Torpedo Boat is the **SPEEDBOAT**, the Mine Layer is the **REPEATER**, the Battleship is the **DREADNOUGHT** (Eric). Class select, the home chip, the SHIP tooltip and results print the new names. Nothing else about the hulls changes.
- **How to Play is rewritten** — Eric's own copy for the objective, the controls, experience and upgrades; then every Deck Gun, weapon, consumable and ship upgrade as an entry with its hotbar icon, a one-line description and a stat table of its exact attributes at every tier. The tables are computed from the same stat function the refit cards use, so they can never disagree with a card. Still one page, still no glossary.
- **Settings key reference** — `Q / E / R` is one WEAPON SLOTS row, `SHIFT` has its own CLASS SPECIAL row, and the gun row no longer says DEFAULT.
- **Star shells hit harder, phosphor hits softer** — the two burst-damage ladders swap (Eric: phosphor was performing too well, star shells too poorly). STAR SHELLS now bursts 20 / 22 / 25 / 27 / 30 by tier; PHOSPHOR SHELLS bursts 10 / 12 / 15 / 17 / 20. Phosphor's burning zone, star's light and both reloads are unchanged.
- **Flak reloads faster** — 6 s → 4 s at tier I (3.2 s at tier V); damage and blast unchanged.

### Internal
- PROTOCOL_VERSION 66 -> 67 (the client prints the swapped damage values from CONFIG). The rest is client-only copy. Internal class ids (`torpedoBoat` / `mineLayer` / `battleship`) are untouched; `client/src/ui/classNames.ts` is the one mapping.
- Tests: client 3743 -> 3761 (`howToPlay.test.ts` pins the nine-section set, no GLOSSARY heading, no "fish", every line described, derived from the catalog); shared 1024 and server 2316 unchanged in count (star/phosphor/flak pins re-cut).
- Epic-8 amendments 204–210; GDD class tables, DESIGN silhouette table, EXPERIENCE journeys and epics Story 8.22 carry dated stamps; `spec-8-22-how-to-play-and-copy-re-cut.md`.

## [0.18.25] - 2026-10-01

### Changed
- **Mines have hit points, and every deck gun can pop them** — a mine has 10 hp. A cannon, flak or machine-gun shell deals its full damage to a mine only when your cursor was on the mine's marker when you fired AND the shell landed there (a click past your reach that lands short on a mine does nothing): cannon and flak pop it in one shot, the machine gun in three shells at tier I (two from tier II). Nothing else hurts a mine any more: a burst that merely covers it, a broadside, star, phosphor or flash shell, a torpedo — none of them. Eric's words: "I HAVE TO CLICK ON THE MINE."
- **Chains are naval-only** — a naval mine's blast still sets off every armed naval mine it covers, whoever laid it; fouling and captive mines neither trigger nor join a chain.
- **The hotbar tooltip says only the tier** — the line that read `WEAPON · Q · SWITCH-TO · TIER II` now reads `TIER II`; the gun square likewise; the Shift and belt squares drop the line (the belt badge already shows stock). Eric: "I know it's a weapon because it's in my weapon hotbar."
- **Arming mines can be popped; captive mines can be destroyed** — a deck gun click on a mine still arming pops it; a captive mine shot to 0 hp vanishes with a pop and never launches its fish.

### Internal
- `CONFIG.mine.hp = 10`, `CONFIG.mine.hitRadiusU = 10` (the client's drawn marker ring now reads it — the one "on the mine" number); mine hp lives on the server `MineState` only, never on the wire. Each deck-gun shell carries its raw cursor point (server-only; the frame tests pin it never reaches a client) and the landing test hits a mine only within the disc of both the cursor and the resolution point (burst point for cannon/flak, arrival point for a machine-gun shell that reached its aim) for shells whose hit mask carries `mine`: the machine gun gains it, broadside and phosphor lose it. Burst victims no longer include mines. `chainMines` is naval-only both ways.
- PROTOCOL_VERSION 65 -> 66 (the client reads `hitRadiusU`; the masks moved).
- Tests: shared 1023 -> 1024, server 2291 -> 2316, client 3744 -> 3743; the golden-frame snapshot is unchanged; new `mineHp.test.ts` drives every ruled case through the real fire paths.
- Epic-8 amendments 200–203; GDD, catalog-v3, epics (FR57) and EXPERIENCE carry dated supersession notes; `spec-mines-have-hp.md`.

## [0.18.24] - 2026-10-01

### Changed
- **No more one-off upgrade cards** — DECK GUN TURRET and DECK GUN BARREL are gone from the pool. Eric's ruling: every upgrade is tiered. The CANNON ladder now carries what they did: the rung to tier III adds the second turret (two rounds loaded before the reload runs) and the rung to tier V adds a second barrel per turret (two parallel shells per click); every rung still adds +1 damage (15 → 20) and −5 % reload. The FLAK ladder gains a turret at its rungs to tier III and tier V (one, two, then three bursts before the reload); +2 damage and −5 % reload per rung as before, blast fixed.
- **The card tells you what the rung buys** — a CANNON card that reaches tier III prints `GUN DAMAGE 16 → 17` and `ROUNDS 1 → 2`; the rung to V prints the damage step and `SHELLS PER SHOT 1 → 2`; the FLAK rungs to III and V print their `ROUNDS` step under reload and damage. Existing words only.
- A fully upgraded cannon's biggest click is now two shells at 20 (40 hp), down from three at 15 (45 hp), so it no longer one-clicks an undamaged 45 hp small drone (two clicks now). Eric accepted this as a consequence of his numbers (amendment 199).

### Internal
- `shared/src/sim/catalog.ts`: `ladderSteps(id, steps, extra)` authors a ladder with per-rung effect lists (the equipment lines' `tieredWeaponSteps` precedent); `LINE_IDS` 26 → 24, authored cards 117 → 114. No whitelist change (`equipment.gun.maxAmmo`, `equipment.gun.barrels`, `equipment.flak.maxAmmo` were already addressable). The gun `barrels` clamp stays 1..3 (reachable max is 2); the batch-sim barrel probe loops 1..2. The machine gun was not touched (a parallel change owns it).
- PROTOCOL_VERSION 64 -> 65 (cycle 158 took 64) (catalog content: two ids leave the wire's card vocabulary).
- Tests: on this branch shared 1018 -> 1021, server 2280 -> 2281, client 3753 -> 3760; merged with cycle 158: shared 1023, server 2291, client 3744; the golden-frame snapshot regenerated (two offer hands moved, nothing else); new pins: the cannon and flak climb tables, no empty production rung, dead ids fail closed, the six card faces byte-exact, flak fires twice at III and holds three at V through the real module.
- Epic-8 amendments 197–199; GDD, catalog-v3 (R15/R16) and epics (FR52) carry dated supersession notes; `spec-gun-ladders-turret-barrel-tiered.md`.

## [0.18.23] - 2026-09-30

### Changed
- **Tooltips show numbers, not prose** — hovering a weapon, Shift or belt square on the HUD bar now lists that slot's live stats one per line (`RELOAD 28.5 s`, `ROUNDS 1`, `SPEED 67.5`, `DAMAGE 55`, `HOMING 0.125 rad/s`, `RANGE 660 u` …) under its name and the key line; the prose descriptions and the accrued-build list are gone, and nothing in the game calls a torpedo a "fish" any more. Weapon descriptions will live in How-to-Play (Story 8-22). The hover heading is the card's line name (HEAVY TORPEDO, NAVAL MINES, CANNON).
- **Ship stats on the HP globe** — hover the HP globe for a `SHIP` panel: MAX HULL, TOP SPEED, TURNING (now in degrees per second), RADAR SWEEP, ALL COOLDOWNS at your live values. A press on the globe no longer fires the gun through it.
- **Refit card hover = the same stat list** — hovering an offered card shows the full stat table of what it touches, valued as it will be once taken; a consumable keeps its KEY FIRES / KEY PRIMES line above its rows.
- **Color-coded refit cards** — the KIND word and the card's resting edge are colored by kind: WEAPON phosphor, WEAPON UPGRADE blue (tier copies and the gun ladders), SHIP UPGRADE purple, CONSUMABLE silver. The word still says it; hovering still turns the edge amber.
- **Machine gun retune** — one shell every 0.35 s at tier I, falling to 0.31 / 0.27 / 0.23 / 0.20 s at tiers II–V (the card prints a `RATE` row); the magazine swap is 10 s at tier I (−5 % a tier, 8 s at V); the 5 s idle delay is gone — the swap starts the moment you stop firing with shells left, firing again with shells left cancels it and it restarts from full when you stop, and an empty magazine reloads uninterrupted; the swap shows on the gun square while it runs. INSTANT RELOAD still finishes a running swap. Magazine size and damage per tier are unchanged.
- **Smoke covers the ship that lays it** — SMOKE SCREEN puffs now drop at the hull's center, not astern.
- **You can see your own chaff** — a dim dashed ring marks the 120 u cloud where you fired CHAFF, fading out over its 15 s. Only you see it; enemies still see the fake returns and never the ring.

### Internal
- `CONFIG.machineGun`: `rateMs` 500 → 350, `reloadMs` 15000 → 10000, `idleReloadMs` deleted; the MACHINE GUN ladder authors `rateMs` steps −40/−40/−40/−30 ms (`ladderSteps`, four explicit tiers); `rateMs` joins `EQUIPMENT_STAT_FIELDS.machineGun` with a plumbing floor in `clampStats`; the stream carries its cadence remainder across ticks (`nextDue`), re-anchoring on a fresh stream or a stalled tick; a refused (frozen) hull is told its stream stopped so the swap still starts.
- Self-private `OwnShip.chaff { x, y, until }` on the owner's own frame (the `shield` precedent; the SIX-exception count is untouched). PROTOCOL_VERSION 63 -> 64.
- Client: `render/slotTooltip.ts` is a stat-row model (no boon-row trim, no measured-height reconciliation; `HoverState.target` is `number | 'ship' | null`); `ui/boonCopy.ts` gains `equipmentStatRows` / `consumableStatRows` / `shipStatRows` / `cardHoverRows` / `cardKind`; `EQUIPMENT_DESCRIPTION`, `BOON_EXPLAIN`, `boonTooltipText`, `boonDescription` deleted; new `render/chaffRing.ts`, `ui/classNames.ts`; a structural test forbids "fish" in any client string literal.
- Review gate (Blind Hunter + Edge Case Hunter on Fable, Codex gpt-5.6-sol): see epic-8 amendment 196.
- Tests: shared 1020, server 2273, client 3732; hook test 266; lint 0 errors.

## [0.18.22] - 2026-09-30

### Changed
- **Results show your LOADOUT** — the BOONS ACCRUED and LAST OFFER blocks on the results modal are gone; in their place one `LOADOUT` block: the HUD bar's own slot row as it ended (gun · Shift · Q E R · belt 1–4) at 72 % with each slot's glyph, tier numeral on the absolute ramp and `×n` stock badge, then one line of the five ship ladders `ARMOR · SPEED · TURNING · RADAR SWEEP · RELOAD`; an untaken RADAR SWEEP or RELOAD reads `—`; a used-up belt stack is the empty square. Enemy draws appear nowhere.
- **HULL REPAIR has its glyph** — the belt square (on the live bar and in results) now draws the plus from the ratified results mock; it had been a bare box since Story 8.8.

### Internal
- **The match record** — at the results hook the server builds a server-only `MatchRecord` (per participant: hull, gun, placement, kills, final cards, EVERY hand dealt with the offered ids, the id taken, the REDRAW flag and `T+` stamps — negative during the countdown; mid-match leavers snapshotted at leave and again at reap; countdown leavers recorded with placement 0) and hands it to an `AccountWriter` port (`server/src/game/accountWriter.ts`, the `NullWriter` until Epic 9) fire-and-forget under the `match.end` latch; aborted matches write nothing; `match.record` is a count-only log line. `MatchRecord` is never `ResultsMsg` — pinned (no `deck*`/`hands`/`cards`/`record` key on the broadcast, and the frame invariant's forbidden-key list gained `hands`, `offered`, `taken`, `record`).
- Tests: server 2263 -> 2280, client 3748 -> 3753; `PROTOCOL_VERSION` 63 unchanged; `LINEAGE_TIERS` moved to `client/src/ui/tierRamp.ts`; `beltBadgeText` moved to `render/equipmentInfo.ts`.

## [0.18.21] - 2026-09-30

### Changed
- **Smoke that covers your ship** — a SMOKE SCREEN puff now starts at 1/8 of your intel range (82.5 u) and grows to 2/8 (165 u) over its 30 s life, up from 40 → 60 u. Eric's call: the old puffs did not cover the hull that laid them. Cadence, trail length, life and every sight rule are unchanged; the refit card row reads `RADIUS 82.5 → 165 U`.
- **Hull mends sooner** — out-of-combat regen now starts 15 s after the last hit you took, not 30 s (the rate, 1 % of missing hull per second, is unchanged; any hit, storm included, still restarts the clock). How-to-Play says fifteen seconds.

### Internal
- `CONFIG.smokeScreen.r0/r1` are authored as `SIGHT * 2 * (1/8)` / `* (2/8)` — fractions of `vision.radar`, the intel range (a global constant no card raises); the radius still rides no wire. `CONFIG.regen.outOfCombatMs` 30000 → 15000.
- PROTOCOL_VERSION 62 -> 63 (the client derives the puff disc from the shared curve).
- Tests: the perception fuzz oracle's independent curve literal moved to 82.5 + 82.5·f; smoke, fuzz and the 200-puff perf pin had their GEOMETRY re-laid (the perf pin's ring puffs now sit in one 30° slice of the outer 40 u band so "some smoked, some clear" still holds; far puffs at ≥ 400 u). Non-vacuity counters after the re-lay: SMOKE_OCCLUDED 152, SMOKED_BLIP 23, IN_SMOKE_SEES 108; perf pin 7.2 ms against the 50 ms budget.
- The pool-era batch-sim baseline (`batch-sim-evidence-2026-09-30.md`) predates this cycle's numbers; not re-run.
- Tests: shared 1018, server 2263, client 3748.

## [0.18.20] - 2026-09-30

### Changed
- **BOTS DRAW FROM THE POOL (Story 8.20)** — a Solo vs AI bot now picks its cards from what it carries, what it lacks and how hurt it is, instead of a per-hull wish list. A weapon for an empty slot comes first; a strong upgrade or a needed HULL REPAIR still beats a weapon it merely favors; a consumable it already carries scores lower; a bot with a flat level-zero build takes a weapon before any upgrade.
- **Six personalities, any hull** — raider, duelist, bulwark, siege, forager and trapper keep their fighting style (band, targets, retreat point) and gain a build taste: rounded or specialist builds, favorite upgrades, favorite consumables, favorite weapons and how hungry the belt is. Any of them can now sail any of the three hulls.
- **Bots boost into a fight** — a bot chasing or engaging a target beyond the edge of its firing band presses the class boost (never while hunting fleet groups, and still when fleeing).
- **Smoke discipline** — a bot never pops a smoke screen while one of its own is still running.
- Bot guns stay random.

### Internal
- `CONFIG.bots.cardPoints` replaces `boonWeights` and the v2-to-v3 alias layer (deleted); `CONFIG.bots.profiles` is a flat list, `BotProfile.hullId` is gone (test rows stay hull-bound).
- Tactic tables split into `ai/tacticKit.ts`, `equipment.ts`, `shift.ts`, `consumables.ts` and `tacticRegistry.ts`; the registries are total (a new card id without a bot row fails type-check) and `tacticFor` stays fail-closed. `APPETITE_FAMILY` deleted.
- Harness: POOL READOUTS section (gun mix, weaponless-at-level, pure gunboat, heal-take rate, levels wasted, weapon-line spread, peak live mines) — measurements, no pass/fail bars; dead `--deck-only --draws` usage line removed. Evidence: `batch-sim-evidence-2026-09-30.md`.
- PROTOCOL_VERSION unchanged at 62.
- Tests: shared 1017, server 2263, client 3748.

## [0.18.19] - 2026-09-30

### Added
- **WAKE DRAFTING (Story 8.19)** — riding in another ship's wake lifts your top speed by up to 5 % (a torpedo boat's 45 u/s cap reads 47.25; a mine layer's 40 reads 42; a battleship's 35 reads 36.75). The lane is as wide as the ship that made it, one hull-width each side of the trail, and it starts behind that ship's stern: you get the lift only while your whole ship is behind it, so a chaser closes to nose-to-tail and holds there, and two ships side by side or on top of each other never lift each other. The lift is strongest in fresh water right behind the ship and fades to nothing at the old end of the trail. It only works when you are sailing the way the wake runs: full lift heading the same way, fading to nothing when you cross it, never a slowdown. Overlapping wakes never stack — you get the best single one. Your own wake and torpedo wakes never count, and a torpedo is never lifted. A sunk or departed ship's leftover trail still works until it ages out, and a sinking hull is lifted like any other. There is no HUD indicator; the speed number simply reads higher (true speed, like under the class boost).

### Internal
- `draftLift` and `draftedKinematics` in shared; the fold is pinned `boosted -> slowed -> drafted -> hooks` on the server and the predictor, parity-pinned at zero.
- `OwnShip.draft` is self-private and omitted at 0 (the declared D23 disclosure); the predictor adopts it before replay.
- `CONFIG.wake.draft { lift: 0.05, halfWidthBeams: 1 }`; wake-ring provisioning folds the lift (a torpedo boat's ring grows 28 -> 30 samples).
- Harness `draft%` column beside `land%`; no batch sim was run.
- PROTOCOL_VERSION 61 -> 62.
- Review gate: the stern rule (`WakeRibbon.hullAheadU`, `draftLift` arc cut), 1500-tick stern-chase pins, an independent perception draft clause, `setDraft` clamped; epic-8 amendments 159-161.
- Tests: shared 1017, server 2220, client 3748.

## [0.18.18] - 2026-09-29

### Added
- **SMOKE SCREEN (Story 8.18)** — a belt consumable (cap 5, no reload): press its key and the hull lays a trail of smoke astern for 5 s, one puff every 0.5 s; each puff lives 30 s and grows from r40 to r60 u over that life. Smoke blocks SIGHT only — a hull inside or behind a puff cannot be seen by eyes, an observer standing in ANY puff is short-sighted instead — 1/8 of intel range, seeing into other smoke, nothing by eye beyond it — and smoke hides hulls even under a star-shell flare — while radar sees straight through it. Torpedo water and mines/decoys behind a puff are hidden the same way. Pressing again restarts the 5 s trail; a sinking hull lays nothing. Puffs render as grey discs, and your own puffs are always visible to you. A hull that smoke alone hides inside your sight bubble still paints on radar when the sweep crosses it (dimmed, like every in-bubble paint).

### Changed
- **HULL REPAIR re-press replaces its heal pool** — firing a second copy while the first is still paying out discards what was left and starts a fresh 50 hp over 5 s (was: pools added up at the same rate).
- **Star-shell light no longer sees into smoke** (Eric).

### Internal
- One `sightClear` predicate at the eight sight-tier call sites (the epic text listed six; the contact row and the in-bubble torpedo-water clause were the two it missed).
- `FrameMsg.smoke` channel behind a `smoke` perception pseudo-row (six exceptions unchanged); `/metrics` `world.smokeLivePeak`.
- Perf pin: 20 observers x 200 puffs is about 5 ms of the 50 ms tick.
- Interim bot row: a bot lays smoke when disengaging (Story 8.20 owns the table).
- `blipGate` gains an in-bubble arm for a smoke-hidden point; a puff is delivered when any part of it is island-visible.
- PROTOCOL_VERSION 60 -> 61.

## [0.18.17] - 2026-09-29

### Added
- **PHOSPHOR SHELLS (Story 8.17)** — its own 360° tiered weapon in a Q/E/R slot: one shell to the click, out to your radar range, on a 20 s reload. It bursts for 20 damage at tier I rising to 30 at tier V on every enemy hull inside the burst, then leaves a burning zone of r100 u (growing ×1.1 per tier) for 8 s rising to 10 s that burns 5 hp/s rising to 10 hp/s on every enemy hull whose centre is inside. The zone is a hazard only: anyone whose radar reaches it sees it, and it reveals nothing.
- **FLASH SHELLS** — a belt consumable (cap 5, no reload): the key primes it and a click fires one shell out to your radar range. It bursts once in r150 u and blinds every enemy hull inside for 10 s, cutting its sight to one eighth of its intel range; no zone, no light, no damage. It replaces the DAZZLE SHELLS add-on (internal id unchanged).

### Changed
- **STAR SHELLS climb tiers and hurt again** — each tier from II cuts 5 % off the reload and adds 2.5 s lit, ×1.1 lit radius and 0.5 flares (R31). Each flare now deals 10 / 12 / 15 / 17 / 20 damage (tiers I–V) to every enemy hull inside the whole lit circle at burst; the lit zone still reveals to the firer and extends the gun's reach.
- **BROADSIDE climbs tiers** — each tier from II cuts 5 % off the reload and adds one spread rung and 0.5 turret (5 turrets at III, 6 at V); 15 damage per shell throughout (R35). There are no separate damage, turret or spread cards.
- **Story numbering** — a new Story 8.17 was inserted; the old 8.17–8.21 are now 8.18–8.22.
- **Bots** carry interim rules for phosphor shells and flash shells until Story 8.20.
- **Network protocol** bumps to v60 (the burn-zone channel, the lit-zone flags removed, the id kinds moved).

### Removed
- The PHOSPHOR SHELLS and DAZZLE SHELLS add-on cards and the star shell's phosphor and dazzle verbs are gone; no add-on line remains in the catalog.

## [0.18.16] - 2026-09-29

### Added
- **SHIELD BLOCK (Story 8.16)** — a belt consumable: press the key and your hull soaks the next 100 damage for 10 s, from every source — shells, bursts, torpedoes, mines, contact hits, phosphor burn and storm bites alike. It absorbs after the DAMAGE CUT halves a hit, never instead of it. Firing a second one replaces the first with a fresh 100 / 10 s. The shooter gets no tell: their hit call fires exactly as on a bare hull. Your HULL readout prints hull + shield past max (e.g. `HULL 312/250`) in blue while it holds; an absorbed hit plays the ordinary hit cue and the blue number falls. No ring on the globe or the hull — the number is the whole readout.
- **CHAFF** — a belt consumable: press the key and 10 false radar returns scatter within 120 u of where you fired it, for 15 s. Every fake lands on water (a draw on land is re-rolled, and dropped if it keeps hitting land), wears the outline of a random hull, and is rescattered each of your own radar sweep periods. You never see your own chaff; there is no readout and no effect on the water — the belt count is the twin. The cloud is fixed where you fired it and runs its full 15 s even if you sink.
- **DECOY BUOY** — a belt consumable: the key primes it and a click drops it into your rear arc (the mine sector, 150 u reach, on water only — a blocked or out-of-arc click is refused and spends nothing). It is a 50 hp float with no lifetime that paints on radar as a small return; enemy torpedoes home on it and detonate against it, dealing it their damage (a 50-damage fish sinks a fresh one). Your own torpedoes pass through it and your own shells and bursts pass over it. An enemy shell or burst that hits it fires the shooter's hit call exactly as on a hull. Enemies see the marker once it is inside their sight range, exactly as they would a ship (radar paints it beyond that). It outlives its owner and stays in the owner's colour for everyone; the owner alone sees its hp.

### Removed
- **The RADAR BUOY is deleted end to end** — the equipment line, its stat row, its radar scope, the `src` blip tag and its bot tactic are gone, and radar jamming goes with it: CHAFF is now the only source of false radar returns. The equipment catalog holds 13 modules, and only 2 catalog stubs remain (SMOKE SCREEN, DEPTH CHARGE).

### Changed
- **Three new belt glyphs and hover texts** for SHIELD BLOCK, CHAFF and DECOY BUOY, plus the owner's decoy hp arc — drafts for Eric's eye on staging.
- **Bots** carry interim rules for the three consumables until Story 8.19: SHIELD BLOCK on the DAMAGE CUT cues (engaged in combat, or an enemy torpedo inbound within 150 u), CHAFF when disengaging, DECOY BUOY dropped astern when a torpedo is inbound.
- **The storm sudden-death ceiling now counts shields** — the pinned worst case adds the shield budget beside the heal budget (amendment 125); the real ceiling in play is far lower.
- **Network protocol** bumps to v59 (the own-ship shield, the decoy channel, the radar-buoy channel and the `src` tag removed).

### Fixed
- A hit event carrying 0 damage (a fully absorbed hit) now still plays the hit cue instead of staying silent.

## [0.18.15] - 2026-09-28

### Changed
- **The gun is a real pick (Story 8.15)** — class select gains a `DECK GUN` row of three chips (CANNON / MACHINE GUN / FLAK, CANNON preselected) beside a new `SPECIAL` row naming the hull's class Shift (`SPEED BOOST` / `INSTANT RELOAD` / `DAMAGE CUT`); the pick is remembered beside the class and frozen at queue as the seat's `gun`. The plain deck gun is named `CANNON` everywhere in match; `DECK GUN` survives only as the category word.
- **The machine gun** — a held-fire stream weapon: 4 damage per shell, one shell every 0.5 s while held, 660 u range, a 16-shell magazine at Tier I. The magazine reloads in 15 s flat: the reload starts the instant the magazine empties, or after 5 s without a shot while shells remain; firing during a partial-magazine reload cancels it and restarts the 5 s idle clock. Each shell is a direct hit with no burst, its own muzzle flash, and no denial on an empty magazine — the empty state just shows in the ammo readout. Its ladder (offered only while mounted) adds +2 shells, +1 damage and −5% reload per tier, four tiers.
- **The flak gun** — one shell per click, 660 u range, a 6 s reload, bursting in a 50 u blast for 12 damage to every hull inside it. Its ladder (offered only while mounted) adds +2 damage and −5% reload per tier, four tiers; the blast radius never grows. As a side effect the burst also takes down enemy fish and decoys caught in it (own fish untouched) — this may be removed later and nothing leans on it.
- **Every gun fires 360°** — the cannon, the machine gun and the flak gun all carry a full arc; there is no bow sector and no out-of-arc denial for any gun.
- **The three class Shifts are fixed per hull, not a pick** — the Torpedo Boat keeps its shipped SPEED BOOST; the Mine Layer gets INSTANT RELOAD (one charge, 45 s cooldown): it completes the mounted gun's reload and every fitted weapon's running reload (the machine gun's magazine goes straight to full) without touching the belt or itself; the Battleship gets DAMAGE CUT (8 s active, 30 s cooldown): while it's up, every weapon hit against the ship — shells, bursts, torpedoes, mines, contact hits and burn ticks — is halved (rounded down for whole hits, exactly for burn) before any shield absorbs it; storm damage is never cut.
- **Missile, monitor and heat-seeking are deleted** — the three cut catalog lines and their stub cards are gone for good; the authored line count drops from 29 to 26.
- **Shell reveals gain a gun-family field** — an observer now learns whether an incoming shell is a cannon round, a machine-gun round or a flak shell (never a torpedo); this is a declared, ledgered widening of what a reveal may carry.
- **Bots** — each bot is seated with one of the three guns drawn uniformly, so staging fights all three guns; bots run interim Shift tactics (Mine Layer fires INSTANT RELOAD when reloading and in range, Battleship fires DAMAGE CUT after taking a hit, Torpedo Boat keeps its shipped boost rule).
- **Network protocol** bumps to v58 (the held-fire input field, the shell-family reveal field, the catalog and Shift-id changes).

## [0.18.14] - 2026-09-22

### Changed
- **The common pool replaces decks (Story 8.14)** — decks, default decks, deck legality, the deck door and the hidden 10-card match pool are gone; every captain draws from one pool of every catalog line with unlimited copies bounded only by caps and the slot rules. The draw is two-stage: first what KIND of card each of the four offer slots is — a weapon's first copy, an upgrade, or a consumable — by its share of the lines you're currently eligible for, then which specific line within that kind. The weapon guarantee is the countdown offer and its REDRAW only (amendment 93) — every later offer is the plain two-stage draw with no guarantee. Consumables are always dealt, so an offer is never empty — a consumable you can't stock shows greyed until you free a slot (amendment 94).
- **Weapon weighting (Eric 2026-09-22, amendments 90–92)** — each other captain who takes the first copy of a weapon line multiplies that line's weight for you by 0.75, never below a floor of 0.25, permanent for the match, first copies only, and it only changes WHICH weapon you see, never the odds of seeing a weapon at all; `CONFIG.offer.weighting` is a harness dial.
- **The gun is the seat's pick (amendment 95)** — the join carries `gun` (deck gun / machine gun / flak, default deck gun), frozen at queue; until Story 8.15 builds the other two guns every pick mounts the deck gun and the client always sends deck gun (no picker yet), so play is unchanged.
- **Under the hood** — `shared/src/sim/draw.ts` replaces `deck.ts`/`deckRules.ts`/`pool.ts`; the World keeps a match-wide take ledger; the exhaustion latch, the `deck.*` `/metrics` counters and the 4402 deck refusal are deleted; the batch-sim harness loses `--deck-only`, `deckSim` and `PACIFIST_DECK` (Story 8.19 re-cuts the harness bars) and gains `--tune offer.weighting.factor`/`.floor`; `poolSmoke` is deleted, `queueSmoke` gains gun-seat and frame-leak steps.
- **Network protocol** bumps to v57 (the `gun` seat field and `OwnShip.gun`, the deck door gone). Older clients are refused at the door.

## [0.18.13] - 2026-09-19

### Changed
- **Catalog v3 — torpedoes and mines (Story 8.13)** — the Torpedo Boat's LIGHT TORPEDO and the Mine Layer's CAPTIVE MINES stop being catalog stubs, and all five of this story's lines (LIGHT TORPEDO, HEAVY TORPEDO, NAVAL MINES, CAPTIVE MINES, FOULING MINES) now have real tiers II–V instead of a single authored rung. Homing is no longer a card: the ACOUSTIC HOMING equipment line is gone, and in its place the light and heavy torpedoes each gain a turn-rate stat that grows tier by tier, 0 rad/s at Tier I to 0.5 rad/s at Tier V — a Tier I fish of either kind is a pure straight-runner, no steering at all (amendment 80). The captive mine's own fish gets the same treatment on a lower ceiling, 0 to 0.3 rad/s by Tier V (amendment 82). FOULING MINES is no longer an add-on card riding NAVAL MINES; it is its own tiered equipment line — small fixed damage, a wide trigger/blast, and a victim slow that deepens with tier (×0.75 at Tier I down to ×0.55 at Tier V, 5 seconds, refresh rather than stack); naval mines themselves no longer foul anything. These numbers are `[DRAFT]` harness dials pending a proper balance pass, but the shape is ratified (amendment 81). SUPERCAVITATING TORPEDO is no longer a weapon line either — Eric moved it to a belt CONSUMABLE (amendment 74): prime a digit, click inside a narrow bow arc, and it fires one 195 u/s, 50-damage straight-running fish with no reload and no tiers; the card reads `SUPERCAV TORPEDO` (amendment 75) and it can turn up in the hidden match pool, with the Torpedo Boat's default deck carrying one copy. The Mine Layer's default deck picks up a new `DEPTH CHARGE` line to keep its 40 cards — a stub consumable Eric will build out later (amendment 83). HEAT SEEKING on the missile is not decided here; Eric is revisiting that when Story 8.14 gets to missiles.
- **Mines now know their own kind, and a straight-running fish can be seen twice** — naval, captive and fouling mines are separate server-side objects, and an owner's own mine markers now carry which kind they are so their rings draw correctly (a captive mine's own ring is its trip radius; naval and fouling show blast plus trigger); nobody else can tell mine kinds apart by sight, since the kind only ever rides the wire for the owner's own mine (amendment 76). A fouled ship's slow factor is now victim-private on the wire so client-side prediction matches the real tier's slow instead of always assuming the lightest one (amendment 86). Separately, a long-standing gap is closed: a straight-running torpedo or shell that left an observer's detect ring used to be revealed exactly once and never again, even if it sailed back into view — that permanent "already told you" mark is now cleared the moment the projectile leaves the gate, so re-entry reveals it again with a fresh position and velocity, the same shape as the first reveal (amendment 78). Bots gained minimal interim tactics for all of this story's new lines — reusing the existing torpedo and mine tactics keyed by the new ids — with the full per-line tactic table still owned by Story 8.18 (amendment 79).
- **Under the hood:** a shared `torpedoCore.ts` now spawns every torpedo (light, heavy, supercav and the captive mine's own fish) through one launch function, so arc checks, hull-clearance spawning and the homing/no-homing split live in one place; per-line server rows sit over it. Mines share one chassis factory keyed by `MineState.kind`, and every reader that used to hard-code the naval row for captive behaviour (trip rules, blast rules, the bot tactic, the client's info panel) now reads the mine's own kind — closing a gap on record since Story 8.1. The perception re-reveal is a change to the gate's own memory, not a new wire channel: the six-exception invariant is untouched and the reveal shape gains no field. A tier-II-or-higher equipment card now prints every stat step that tier actually authors (up to five rows), not just the reload row it used to show alone, so a card that also buys damage, speed and homing says so; the homing row is labelled `HOMING` (amendment 85). The weapons smoke script gained a light-torpedo kill phase and a captive-mine phase and passed against a booted server. `npm run check` exit 0 (shared 965 / server 2061 / client 3650 tests, hooks 266). Review gate (two Fable hunters + Codex): six patches, fail-first proven — a re-reveal of a known projectile never claims the own-fire latch or replays the fire tone; a re-anchored fish takes the steering look; the captive fish locks to the hull that tripped it (R2.13 kept under tiered homing, amendment 87); tier cards skip a no-op `ROUNDS 1 → 1` row; bot band-pull counts the belt supercav; each mine kind trips through its own hit mask. Post-gate, Eric ruled a later fouling KEEPS THE STRONGEST slow (amendment 88): the clock refreshes, the factor only ever deepens while a slow is running.
- **Network protocol** bumps to v56 (the catalog content change, `MineView`'s new own-only kind field, and the id moves — `supercavTorpedo` to the consumable id space, `foulingMines` into the equipment id space). Older clients are refused at the door.

## [0.18.12] - 2026-09-18

### Changed
- **Catalog v3 — ladders and the deck gun (Story 8.12)** — this one is mostly a paper trail: the five universal upgrade ladders (ARMOR, SPEED, TURNING, RADAR SWEEP, RELOAD) and the deck-gun family (DECK GUN, TURRET, BARREL) were already built and live at their catalog-v3 numbers back in Story 8.1 (cycle 135) — the caps, the per-tier steps, the reload math, ARMOR's heal-on-grant and the card faces were never touched here. What actually changes on staging: the HUD bar's gun square and its hover tooltip now show the deck gun's tier (`I` at spawn, climbing to `V` at four DECK GUN cards) — the same number the refit card already read, the square and tooltip just didn't print it before. The refit card's tier-step label can no longer spell a sixth rung (`VI`) for a line already at its cap — the drawn numerals were already clamped to five, so only the label string carried it, and a line at its cap is never offered in the first place; it is now unwritable rather than merely unreachable. And Eric ratified three small things: the refit card's `Turning` and `Gun damage` row labels stay as written; the internal safety floor on reload-speed math stays at its current value as a guard against bad data, not a balance knob; and the record now notes plainly that this story's checklist was already satisfied by Story 8.1's work, so later catalog stories (8.13 onward) don't need to re-touch these eight lines.
- **Network protocol** is unchanged at v55 — nothing here rides the wire; the gun tier is read from the same card data the client already has.

## [0.18.11] - 2026-09-18

### Changed
- **The match consumable pool (Story 8.11)** — every match now deals the same ten random consumable cards into everyone's deck, and nobody is told which ten. When a room is created the server rolls ten cards from the five consumable lines (HULL REPAIR, SHIELD BLOCK, SMOKE SCREEN, CHAFF, DECOY BUOY), never more than five of any one line, and appends that identical set to every captain's and every bot's 40-card deck after the deck has passed its legality check — so you sail 50 cards, 40 you brought and 10 the match dealt. The set is hidden: it is not in any frame, not in the welcome message, and the server log records only how many cards were dealt, never which. Until the other four consumables are built (Stories 8.15 and 8.16) their pool copies sit in the deck undealt, exactly like the unbuilt cards already in the authored decks, so on staging the visible effect today is a few extra HULL REPAIR cards per match (two on average, anywhere from none to five). Because a deck can now hold more copies of a line than you are allowed to stock at once (three authored HULL REPAIR plus up to five from the pool, against a stock cap of five), a line you already hold at its cap is not offered until you fire one — a used copy leaves your cards, the line reopens, and the remaining copies come back into the draw. The pool is extra supply gated behind use, not extra stock.
- **Under the hood:** `CONFIG.pool = { size: 10 }` is a new section (Eric's number, not a balance dial — the batch-sim CLI refuses to override it); `shared/src/sim/pool.ts` holds the pure roll (`rollMatchPool`, one `rng.next()` per card, uniform over the lines still under their cap) and `sanitizePool` (the structural guarantee that a pool can only ever contain consumable lines). The pool is rolled once per `World` from a room-private seed the room adapter supplies — the same posture as the storm rings and the pseudonym stream, so it can never be derived from the map seed a client knows — and appended at the single deck-build edge; PvE fleet drones still get no deck at all. A dev-only `poolOverride` room option (honoured only under `HC_DEV_OPTIONS=1`) pins a pool for headless smokes, and a new `poolSmoke.mjs` proves nothing pool-shaped leaks onto the wire. The batch-sim harness, the RL environment and the pure deck-economy sim all roll a pool per match, and the economy sim now draws with the ship's held cards like the server does (a ledgered drift closed by necessity: the at-cap guard is live for the first time) — with one stated limit: that sim never fires a consumable, so its consumable numbers are a floor. The 50-card economy was measured on an unstubbed catalog under that never-use model: a one-copy card is seen by about half of captains within 8 picks and by about 90% within 20; offers do not start coming up short until roughly level 46.
- **Network protocol** is unchanged at v55 — nothing about the pool rides the wire; the welcome's config snapshot carries the pool's size, which is public knowledge.

## [0.18.10] - 2026-09-18

### Changed
- **The opening (Story 8.10)** — every hull now sails out with only the deck gun and Shift; the interim spawn weapon is gone (Torpedo Boat no longer starts with a heavy torpedo already in Q, Battleship no longer starts with broadside and star shells, Mine Layer no longer starts with naval mines already laid in). In its place, the moment a match's countdown starts, every captain (and every bot) is granted "level zero": one banked level with a four-card offer, shown as `LV 0` with a bank chip of `1` and an empty XP strip — the same read the bar already gives a normal level-up. The first card of that offer is guaranteed to be something you can actually use today: either a consumable, or a weapon you don't already have. With today's catalog that means the guarantee is a coin flip — for the Torpedo Boat it is either the heavy torpedo or HULL REPAIR, for the Mine Layer naval mines or HULL REPAIR, for the Battleship star shells or HULL REPAIR — because the rest of each hull's weapon lines are still stubbed out until later catalog stories build them. A deck with nothing usable at all just gets a plain draw, same as any other level. The refit window (Tab) now opens itself on that first offer during the countdown, so nobody has to remember to press Tab before the water goes live; a new `REDRAW` button sits under the four cards during the countdown only, and gives everyone exactly one free re-roll of that opening offer — the pip beside the word is hollow until you spend it, then fills. Press it again, or after the countdown ends, and nothing happens. Whatever you pick during the countdown is already fitted the instant the water goes live; if you never pick anything, the offer stays there, banked, waiting. There's no level-up toast or tone for this grant — the window opening itself is the only cue, so it doesn't feel like a normal mid-fight level-up. Class-select cards no longer list a weapon row for any hull, since every hull now starts identically armed (gun and Shift only) and the row had nothing true left to say.
- **Under the hood:** a new sentinel value, `MULLIGAN_CHOICE` (`-2`), travels on the spend message for the redraw — the only negative value the spend channel accepts (Story 8.8 had closed that channel entirely). `drawOffer` gained a `guarantee` option that picks its first card uniformly from the usable lines (a consumable, or an equipment line you hold zero copies of) before drawing the rest as normal — one extra `rng.next()` call, never touching the ordinary level-up draw's cost or determinism. `Match.startCountdown()` grants the level-zero bank to every participant (captains and bots, never PvE fleet drones) before the countdown itself starts running. A new `countdownOpen` flag on `World` gates the redraw so it can only fire once, only during the countdown, only for a captain holding an offer — anything else is a silent no-op that leaves the offer byte-for-byte unchanged. The redeploy that happens when the match goes live now preserves everything about the countdown economy (banked level, offer, cards, loadout, deck) instead of wiping it, so a pick made during the countdown survives into the fight. `/metrics` gained two new counters, `deck.picks` and `deck.mulligans`. A new `openingSmoke.mjs` headless test drives the whole flow against a real booted server. A dev-only `fitOverride` room option (never reachable outside `HC_DEV_OPTIONS=1`) lets the two older weapon-testing smoke scripts pre-fit a torpedo at spawn, since deleting the old spawn seed would otherwise have left their Q slot empty. Row-lift correction: the refit card row's actual top at 1366×768 is 380 px live and 336 px during the countdown (the design doc's earlier 388/344 numbers forgot the 8 px gap above the HUD bar).
- **Network protocol** bumps to v55 (the new redraw sentinel and the level-zero grant). Older clients are refused at the door.

## [0.18.9] - 2026-09-18

### Changed
- **The Shift boost is universal now (Story 8.9)** — every hull gets the same boost off the same key, no card involved. Holding Shift used to add a flat +10 speed for 6 seconds on an 18-second cooldown; now it adds 25% of your ship's current top speed (so SPEED cards make the boost bigger too — a Torpedo Boat with all four SPEED cards boosts all the way to 68.75) for 10 seconds, on a 25-second cooldown. The RELOAD ladder still shortens that cooldown like it does for every other piece of equipment (18.75 s at five copies). Reverse speed is untouched. Shift is a tap — holding it down only fires once — and it does nothing while the refit window (Tab) is open, same as the weapon keys. The old `speedBoost` equipment and its config block are gone for good.
- **Class-select cards** no longer list `E: SPEED BOOST` on the Torpedo Boat or `E: RADAR BUOY` on the Mine Layer — the boost is the same on every hull now so the card (which only sells what's different) drops it, and the radar buoy has been unreachable since Story 8.5.
- **Under the hood:** one shared function, `boostedKinematics(kin, factor, active)`, does the boost math identically on both the server and the client, so prediction and the authoritative sim never disagree. The bonus is never baked into a ship's rated stats, so bots still read the un-boosted cap when deciding what to do. The batch-sim balance tool now refuses a boost cooldown shorter than the boost's own duration — that would mean a boost that's always on. The tests that used to pin "torpedoes always outrun the ship that fired them" are retired: the actual safety rule is that your own weapons can never hurt you (no friendly fire), and a fully-upgraded, boosted Torpedo Boat can now in fact outrun its own heavy torpedo.
- **Network protocol** bumps to v54 (the client reads the new boost numbers). Older clients are refused at the door.

## [0.18.8] - 2026-09-17

### Changed
- **Heal is a card (Story 8.8)** — the `5` key and the always-available DAMAGE CONTROL strip under the refit cards are gone. Healing is now the HULL REPAIR card: it sits in your deck (three copies per hull), you pick it like any other card, it stocks into a belt slot, and you fire it with that slot's number key while the refit window is closed. One copy restores 50 hull at once and 50 more over the next 5 seconds. It only works while you are afloat and not already full (under 1 hull missing counts as full, so a stray storm bite can never cost you a card); a refused press flashes the slot and spends nothing. Heals during the final collapse stay allowed; the card supply is the limit.
- **Out-of-combat repair replaces the free per-level heal** — the "10% of missing hull each level" trickle is deleted. Instead, thirty seconds after the last hit you took, your hull mends on its own: 1% of whatever is missing comes back every second, fast when badly hurt and slower near full. Any damage that lands, the storm included, stops it for another thirty seconds, so nobody heals inside the storm. Captains and bots only; PvE fleet drones never repair.
- **Bots** press a stocked HULL REPAIR when their hull (counting repair already on the way) drops under their existing heal threshold. The full bot tactic table is still Story 8.18's.
- **Copy** — the Settings key list now reads `1 – 4` with both meanings (pick a card / fire a belt slot), and How-to-Play's two sentences about DAMAGE CONTROL now describe the card and the out-of-combat repair. Nothing else in How-to-Play changes until its re-cut.
- **Refit band** — with the strip gone the band is 46 px shorter and ends at the card row, still 8 px above the HUD bar. A hover panel too tall for the band now slides up by the difference instead of clipping. The HULL REPAIR card face shows its two numbers as stat rows.
- **Network protocol** bumps to v53 (the heal sentinel leaves the spend message; the catalog gains a live line). Older clients are refused at the door.

## [0.18.7] - 2026-09-17

### Changed
- **Consumable slots and the refit card v3 (Story 8.7)** — the four belt slots can now hold something, though nothing new is drawable yet (see below). Picking a consumable card stocks it into the belt: if you already hold that item, the new copy just adds to the same slot; otherwise it takes the first empty belt slot. If all four belt slots are full and you pick a consumable you don't already hold, the card greys out with a boxed `SLOTS FULL` in its foot and the pick is refused silently — nothing sent, nothing spent, the card just stays there. Consumables never reload — once stocked, a copy sits ready until you use it. With the refit window OPEN, number keys 1–4 (and 5 for HEAL) still pick cards exactly as before; with the window CLOSED, 1–4 instead fire (or prime, for the one consumable that behaves like a weapon) whatever is stocked in that belt slot — pressing an empty belt slot's key now flashes it denied, the same as an empty weapon slot already did. Right after the refit window closes there's a short, deliberate dead zone (400 ms) so a card pick can't accidentally fire a belt slot on the same keystroke.
- **The refit card has a new fixed face** — 216×226 for every card: a key chip, a 40 px icon box, the uppercase name, a row of tier rungs on the same five-colour ramp used elsewhere, a kind word (WEAPON / UPGRADE / ADD-ON / CONSUMABLE), five stat rows with the exact numbers changing, and a reason line at the bottom that's blank unless the card is refused. No sentences anywhere on the face — the explanation stays in the hover tooltip for anyone who wants it. Hovering a bar slot tells you more now too: a weapon slot's tooltip names its line and tier; a belt slot's (once something is stocked) names the consumable, whether the key fires it directly or just primes it for a click, and how many copies you're holding. Both tooltip panels keep the widths they already shipped at.
- **Nothing new to draw yet** — all five consumables (hull repair, shield block, smoke screen, chaff, decoy buoy) stay stubbed out; the belt stays empty on staging until Story 8.8 hands you the first one. This story built the machinery underneath it. No change to the network protocol — still v52.
- Under the hood: a used consumable copy is removed from your card list the moment you use it, so the client's own replay and the server agree on how many you're holding with no new field added to the wire. The empty-slot key denial that already covered the weapon row now covers the belt too. The slot tooltip's inner logic moved out of the hotbar file into its own module. Epic-8 amendments 41–45 record Eric's rulings behind the interim choices (the belt staying empty until 8.8; both tooltip panels keeping their shipped widths rather than the smaller figure once sketched for them). The card's smallest text (the 9 px stat labels and the reason line) now counter-scales at the 90 % UI-scale setting so it never renders below 9 px, the same rule the HUD bar already follows (Eric: text must be readable, amendment 43).

## [0.18.6] - 2026-09-17

### Changed
- **The HUD bar (Story 8.6)** — the three scattered corners (a nine-row hotbar bottom-left, an HP/heading/speed cluster bottom-right, an XP rail bottom-left) are gone. In their place is ONE bar, bottom-centre: an HP globe on the left, your gun and Shift/Q/E/R slots in the middle with a framed belt of four consumable slots (empty until Story 8.7 fills them), a helm globe on the right showing heading and speed, and a full-width XP strip underneath showing your level and, once you've banked a level, a chip you can spend plus `TAB TO REFIT`. A slot on cooldown now shows a clock wipe — a dark wedge that sweeps clockwise off the icon as it counts down, with the seconds left written in the middle — instead of the old thin ring around the edge. Nothing changed about what any key does or how boons work; this is a read, not a rule.
- Under the hood: the old hotbar, HP rail, telegraph cluster, per-slot name/label column and corner-chamfer shape are deleted outright, not hidden behind a flag. The bar is laid out in the same logical units the rest of the UI uses, so it scales correctly at every UI-scale setting instead of being pinned to the mock's raw pixels; a small counter-scale keeps the smallest 9-pixel labels (key chips, the tier number, HDG/KTS) readable even at the 90% UI-scale setting, while both globes stay a fixed 104 px. The refit cards now sit 8 px above the new bar instead of anchored to the middle of the screen, and their hover tooltip opens above the card when there's room, or drops down over the card row when there isn't. No changes to the network protocol (still v52).

### Changed
- **Nine slots (Story 8.5)** — every ship now has the same nine equipment slots: the deck gun, a `Shift` speed boost, three weapon slots (Q, E, R) and four belt slots (1–4, empty for now — Story 8.7 fills them). Class identity now lives in the deck you draw from, not in the hull you picked. A weapon card lands in the first empty weapon slot, and fitting one never touches another slot's reload. The speed boost is on `Shift` for every hull now, at the numbers the Torpedo Boat already had (+10 u/s for 6 seconds, 18-second reload) — the Battleship and the Mine Layer gain it for the first time (Story 8.9 re-tunes it later). Until the countdown offer arrives (Story 8.10), a ship still sails out with its class weapons as before: Torpedo Boat heavy torpedo in Q; Battleship broadside in Q and star shells in E; Mine Layer naval mines in Q. The Mine Layer's radar buoy is gone from play (no card fits it; Story 8.15 replaces it with the decoy). Pressing a weapon key on an empty slot now flashes the slot as denied instead of doing nothing, and a primed weapon reverts to the gun when you RELEASE the mouse button after firing, not when you press it. The hotbar shows all nine rows in its old bottom-left column as a stopgap and runs off the top on short screens — Story 8.6's HUD bar replaces it. Empty slots show a dashed box with a dash, no words. PvE fleet drones are unchanged: the deck gun and nothing else.
- Under the hood: `loadout.ts` is now one flat nine-slot array with fixed roles, identical for every captain hull; the wire ammo array is nine long (protocol v52); the client rebuilds slot contents by replaying its own card list, so no new wire field was needed. Epic-8 amendments 21–30 record Eric's rulings behind the interim choices.

## [0.18.4] - 2026-09-15

### Changed
- **The damage gate and the ordnance collector (Story 8.4)** — a plumbing cycle with four things a captain will actually notice. **Shoot a mine and it goes off** — any mine, anyone's, including your own, as long as it has finished arming. A mine goes off when the burst at the point you clicked covers it; a shell flying over a mine on its way somewhere else never touches it and never tells you it is there. **One blast sets off every armed mine in range, whoever laid it**, all in the same instant, so a tight field goes up together. **Captive mines (the torpedo kind) are immune both ways** — nothing shoots one off and no chain reaches one; a mine still arming is safe too. **Mines have no caps at all any more**: no five-per-captain ceiling, no sixty-per-room ceiling, and above all no more silently deleting your oldest trap when you lay a new one — a mine you lay stays on the water until something triggers or destroys it. Star shells now light the water without clearing a minefield. And a kill mark is honest again: when the first shell of a salvo sinks a ship and a later shell of the same salvo lands on the wreck, you get the hit mark rather than a "fell short" splash, and the rest of the salvo sails straight through instead of being swallowed by a hull that is already gone.
- Under the hood, this is the plumbing every later card in the deck needs. Every hit on a hull now goes through ONE door (`applyDamage`) with one fixed order — refuse friendly fire, check the phase, absorb with the shield, apply the hp, credit the assist, check the sink, report the damage — so "your own weapons can never hurt your own hull" is now structural rather than repeated in three places, and the shield card (Story 8.15) has exactly one place to plug into. A linter rule plus a test that reads the file as text keep it the only place hull hp can go down. Alongside it, every shot now finds its targets through ONE collector (`hitTargets`), with each weapon declaring in config which KINDS of thing it may touch — hulls, mines, decoys, projectiles — and the collector forgetting a ship the instant it sinks. `/metrics` gained a live-mine high-water mark, since the mine cap that used to bound the field is gone; 500 live mines measure about 2 ms inside the 50 ms tick. Epic-8 amendments 16–20 record Eric's five rulings behind all of this. Nothing changed on the wire — the protocol stays v51.

## [0.18.3] - 2026-09-15

### Changed
- **The draw (Story 8.3)** — every level offers four different cards drawn from what is left in your deck, weighted only by how many copies of each line remain; passing on a card puts it straight back at full weight for the next level (the deck reshuffles after every draw, it never has to run out first). A line you already hold at its cap is never offered. When the deck really is empty a level still banks but no cards are offered and no TAB cue shows. The server logs each ship's deck exhaustion once and `/metrics` counts it. No draw-pile counter anywhere and nothing new on the wire (protocol stays v51). The old rarity/pity-era ledger threads are closed. Epic-8 amendments 13–15 record three Eric rulings: the draw model is confirmed, an exhausted deck still banks with no options, and a correction of record on the level heal (handed to Story 8.8).

## [0.18.2] - 2026-09-15

### Changed
- **Legal decks, default decks, and the door (Story 8.2)** — every hull now sails a real 40-card deck. Eric's three default decks (epic-8 amendment 10) are the deck each captain and each bot sails: thirty cards shared by every hull plus ten per hull (Torpedo Boat: light torpedo, heavy torpedo, machine gun, acoustic homing; Mine Layer: naval mines, captive mines, flak, fouling mines; Battleship: missile, monitor, star shells, dazzle shells). The lines whose mechanism is not built yet stay in the deck but are never dealt (amendment 11), so 23 cards are drawable per hull until the later catalog stories switch them on — no code change then. A deck is legal when it has exactly 40 cards, at most three weapon lines, only lines you own, and no line above its copy limit — nothing else (`checkDeck`, shared by both sides). The server checks legality once, at the door: the queue freezes the deck into the seat reservation's server-only slot and the arena reads it back, so a client can never supply deck contents (a `deck` key in the join is refused outright; a `deckId` is accepted for the account work in Epic 9 but unread today). A refused deck is a plain connection failure on the home screen, never the "version mismatch" line. Drones stay gun-only — the `FLEET_FIT` idea is struck from the epic (amendment 12). No wire change (protocol stays v51). Under the hood: `DEFAULT_DECKS` / `DEFAULT_OWNED` and `deckFromCounts` in the catalog, `sim/deckRules.ts`, `server/src/game/decks.ts` (the one deck loader, the Epic 9 port), `rooms/deckDoor.ts`, `ShipRecord.deckList`, and the batch-sim harness's zero-weapon `PACIFIST_DECK`.

## [0.18.1] - 2026-09-15

Version scheme change (Eric ruling 2026-09-15): the `0.17.X` freeze is lifted with a one-time move to `0.18.1`; from here the patch number keeps counting landed build cycles (`0.18.2`, `0.18.3`, …) regardless of epic. No gameplay or wire change; interstitial cycle 136.

## [0.17.135] - 2026-09-15

### Changed
- **The card model and catalog engine (Story 8.1)** — `shared/src/sim/catalog.ts` is now THE catalog: 29 lines / 114 cards, with 13 stub lines reserved for weapons and consumables that later stories (8.12-8.16) build out. `effectiveStats(cls, cards)` folds every catalog tier onto a ship's base stats order-independently (a permutation property test proves it, and a validator refuses to mix add and multiply on one stat path). `EffectiveStats.equipment` is now a total record keyed by the widened `EquipmentId`, and every row carries its own `tier`. A new equipment reload step (−5% per tier, composed before the existing RELOAD ladder) and a fractional-step floor both live in `clampStats`. Rarity, categories, acquisition cards, `slotReplace`, and the old subdeck walk are all deleted — `OwnShip.boons` is renamed `OwnShip.cards`. The wire protocol is new (v51). The interim deck is every buildable line at its cap (Eric ruling, epic-8 amendment 5), the shipped torpedo and mine become `heavyTorpedo` and `navalMines` (amendment 6; the heavy torpedo's base speed also moves 60 → 65 u/s per catalog-v3 R17, Eric 2026-09-15), the interim refit card shows a neutral-colored kind word (amendment 8), and bots weight the new v3 equipment lines by kind through a v2→v3 alias table.

## [0.17.134] - 2026-09-14

### Changed
- **Networking layer moved to Colyseus 0.18** — the game now runs on the current major of its networking framework on both server and client. Nothing about play changes; this is the floor Epic 8 (the deck) and Epic 9 (accounts) build on. The wire protocol is new (v50), so a stale browser tab from before the update needs a refresh.

## [0.17.0] - 2026-07-17

### Changed
- **New networking foundation (Colyseus 0.17)** — the game now runs on the current, supported version of its networking layer. Matches look and feel the same; under the hood this is the groundwork for what's coming next: rejoining your still-alive ship after a wifi drop, honest lobbies with queues, and ping display. The wire protocol is new (v3), so a stale browser tab from before the update needs a refresh.

### Added
- **Message-flood protection** — the server now disconnects any client spamming messages far beyond what real play produces. The budget is deliberately generous: even shaky school wifi that stalls for seconds and then releases a burst of queued inputs stays comfortably inside it.

### Fixed
- **Dropped connections fail fast again** — losing your connection mid-match shows the DISCONNECTED banner immediately, instead of silently retrying for a minute against a server that can't resume your ship yet (real mid-match reconnection arrives in an upcoming release).
- **A drop during the join handshake** no longer leaves you staring at a black screen until the timeout — it errors immediately so you can retry.

## [0.16.0] - 2026-07-14

### Changed
- **Complete real-time rebuild (prototype)** — the turn-based hex game is replaced by a real-time naval battle royale: drive your ship on a shared circular ocean at 20Hz, aim with the mouse, and fight until one captain is left. Built on an authoritative server with client prediction, so what you see is smooth and what counts is fair.

### Added
- **Driving & telegraph** — 9-detent set-and-forget engine orders (W/S taps), rudder steering, wake and camera feel.
- **Three ship classes** — Destroyer (fast, light), Cruiser (balanced), Battleship (slow, tough). Pick before you queue.
- **Three weapons, one click each** — broadside guns fire at your cursor, bow torpedoes run until they hit something, mines drop astern and arm after a delay. Ammo pools with visible reload bars replace cooldowns.
- **Fog of war + radar** — true sight up close, a sweeping radar beam painting stale blips at range. Everything you see is computed per-player on the server, so wallhacks are structurally impossible.
- **Storm circle** — the ocean shrinks battle-royale style; stay inside or take damage.
- **Upgrade points with a choice** — every kill banks an upgrade point. Press CTRL to open the spend window: pick one of 3 randomized upgrades from 3 different categories (CTRL+1/2/3) or repair 25 hull (CTRL+E). Offers are rolled the moment you earn the point, so closing and reopening the window can never reroll them. Bank points and spend when it matters.
- **Match lifecycle** — countdown, live spectating after you sink (fog lifts), results screen, kill feed, and practice drones to fill lobbies.
- **Sound & feel** — screen shake, denied-fire feedback, telegraph click tones, distinct chimes for earning and spending upgrade points.

### Fixed
- **Torpedoes no longer hit the ship that fired them** — they spawn with real clearance ahead of your bow, carry a longer owner-only grace, and at 70 u/s outrun every hull. Guardrail tests pin all of it.
- **Guns hit harder** (damage 15 → 25) and a permanent test guarantees no single weapon can ever one-shot an undamaged ship.
- Rapid upgrade spends can't apply an upgrade you never saw; the spend window can't be flipped by browser CTRL shortcuts.

### Removed
- The turn-based hex-grid game (lobbies, quick play queue, teams, AI doctrine) — retired in the scaffold commit that started the prototype.

## [0.15.0] - 2026-04-08

### Added
- **Simultaneous turns** — all players select targets and lock in each round. Two-pass resolution resolves shots against a pre-round board snapshot so shared-ocean overlapping ships all get hit correctly. New `turnMode` toggle in private lobby (Sequential / Simultaneous). Quick Play always uses simultaneous with 30s rounds.
- **Turn mode lobby option** — host can choose Sequential or Simultaneous in the game options panel. Custom dropdown with descriptions.
- **Round timer** — dedicated timer system for simultaneous rounds with auto-lock on expiry. Disconnected players auto-locked with empty salvos to prevent deadlock.

### Changed
- **Quick Play simplified to 6-player FFA** — single queue pool replaces 6 separate mode queues. One "Quick Play" button on homepage replaces the mode grid. Parties blocked from Quick Play with error toast.
- **Fleet reduced to 3 ships** — removed Scout (1-cell ship). Fleet is now Destroyer (2), Cruiser (3), Dreadnought (4). Each player fires 3 shots per salvo.
- **GameMode type simplified** — collapsed from 7 quickplay variants to `'private' | 'quickplay'`. Removed `QuickPlayMode`, `toGameMode()`, `toQuickPlayMode()`, `TEAM_COLOR_POOLS`.

### Fixed
- Simultaneous salvo validator now checks hex bounds (parseHex + isValidHex), matching sequential validator security.
- Simultaneous disconnect no longer deadlocks untimed games (auto-lock on disconnect).
- `shipsSunk` stat no longer over-counts when multiple cells of the same ship are hit in one round.

## [0.14.4] - 2026-03-27

### Added
- **Capability system** — `LobbyCapabilities` payload emitted with every `game-state` during lobby phase. Server-authoritative permissions: canStart, canAddBot, canKick, canMoveToSlot, canRequestSwap, canToggleReady, canChangeOptions, canTransferHost. Replaces scattered `hostId` checks.
- **Ready-up system** — all players (including host) toggle ready. Host's ready state activates the Start button. Two-path start: green (all ready → 5s countdown with sound) or amber (not all ready → confirmation prompt).
- **Swap request system** — any player requests a slot swap with another. 15s server-side auto-decline timer. Crossed requests auto-accept. Bots accept instantly. Inline notification below seat card.
- **Unified kick** — `kick-player` event replaces `remove-bot`. Host kicks both humans and bots from a single context menu action.
- **Host transfer** — manual transfer via context menu. Auto-transfer on disconnect (10s grace). Reconnecting host does NOT reclaim (prevents flip-flop).
- **Party → lobby bridge** — party leader creates custom match → party dissolves → members auto-fill FFA lobby seats. No new client event needed.
- **Unified join code resolution** — `resolveJoinCode()` checks party codes first, then game codes. Global code uniqueness enforced across both namespaces via `generateGloballyUniqueCode()`.
- **Block join-party while queued** — `target-party-queued` error reason rejects attempts to join a party in matchmaking. Handler reorder fix from Sprint 1c dissolve-before-check pattern.
- **Lobby chat** — existing chat system enabled during lobby phase. Server-side guard forces global channel (no team chat in lobby).
- **Lobby persistence** — after custom game ends, "Return to Lobby" resets game to lobby phase via `resetGameToLobby()`. Replaces rematch system for custom games.
- **Countdown overlay** — 96px number display with 5 descending beeps (800→400 Hz) via `playTone()`. Cancels on any lobby state change (join/leave/kick/unready/option change/swap).
- **Client context menus** — seat card menus driven by capabilities payload. Empty slot: Move Here + Add AI. Filled slot: Request Swap + Kick + Transfer Host. Ready badge (✓) on seat cards.
- **Post-game flow** — custom games show "Return to Lobby" (green), quick play shows "Play Again" (requeue). Session storage preserved for private games.
- **21 new tests** — capabilities, ready states, resetGameToLobby, resolveJoinCode, generateGloballyUniqueCode, kick/removePlayer, host transfer (468 total).

### Changed
- `game-state` event now includes optional `capabilities` field (lobby phase only).
- `player-joined` event now includes optional `capabilities` field.
- `start-game` event accepts optional `{ force: true }` for amber path.
- `Game` type gains `readyStates: Map<string, boolean>`.
- `removePlayer` and `removeBot` now clean up `readyStates`.
- `executeSwapPlayers` now supports FFA mode (exchanges colors without team entries).
- `clearGameTimers` now cleans up lobby countdown and host transfer timers via `registerGameCleanup` pattern.
- `GuestSessionManager` gains `getGuestIdByPlayer()` and `getSocketId()` methods.
- `LobbyManager` gains `unregisterPlayer()` method.
- `PartyManager` and `LobbyManager` accept injected `setCodeGenerator()` for cross-namespace uniqueness.

## [0.14.3] - 2026-03-26

### Added
- **Ticket-based matchmaking** — queue entries are now `QueueTicket` objects (solo players = ticket of size 1, parties = ticket with all members). Replaces the old individual-socket queue model.
- **Queue Adapter pattern** — new module split: `queue/types.ts` (ticket interfaces), `queue/adapter.ts` (ticket creation + mode validation), `queue/matcher.ts` (greedy FIFO matching + party-aware team assignment), `queue/index.ts` (orchestrator with ticket Map + reverse index).
- **Legal mode validation** — party of 2 can queue for 2v2/2v2v2/3v3; party of 3 can only queue for 3v3. FFA modes are solo-only. Server rejects invalid combinations with typed `QUEUE_ERROR_MESSAGES`.
- **Party-aware team assignment** — party members always land on the same team. Multiple parties in the same match get different teams. Solo players shuffle into remaining slots.
- **Leader-only queue control** — only the party leader can start or cancel matchmaking. Non-leader attempts are rejected with clear error messages.
- **`party-queued` / `party-queue-cancelled` events** — server pushes non-leader party members into the queue screen when the leader queues, and returns them to the landing page when the ticket is dissolved.
- **Auto-dissolve ticket on party mutation** — any leave/join/disband while the party is queued dissolves the ticket and notifies all members. Prevents stale tickets.
- **Ticket dissolution on disconnect** — any member DC dissolves the entire party ticket. Leader must re-queue after party stabilizes.
- **Tab eviction ticket migration** — refreshing a tab while queued updates the ticket's socketId seamlessly (same pattern as existing queue migration).
- **Solo mode switching** — solo players can switch queue modes without explicitly leaving first (old behavior preserved).
- **Expanded `quickplay-queue-update` payload** — now includes `ticketCount`, `target`, and optional `partyMembers` for future Sprint 1e social queue UI.
- **`quickplay-ticket-created` event** — data contract reservation emitted to party members on enqueue. Sprint 1e UI can consume without server changes.
- **Structured queue logging** — ticket creation, enqueue, match, dissolve, and migration events logged with `[queue]` prefix.
- **Guest name sync on party join** — `GuestSession.name` now persisted when creating or joining a party, ensuring names are fresh for ticket creation.
- **56 new tests** — queue adapter unit tests (18 mode validation cases), matcher unit tests (FIFO matching, party-aware team assignment), covering all new code paths.

## [0.14.2] - 2026-03-26

### Added
- **Party system (core)** — pre-game social layer for grouping friends before queuing or creating a custom match. Create, join (by code), leave, and disband parties (max 3 members).
- **PartyManager** — server-side module with Maps for party state, membership, and join codes. Mirrors LobbyManager pattern.
- **Leadership transfer** — party leader leaves → longest-tenured member becomes leader. Leader disconnects → 30s grace period before transfer. Non-leaders also get 30s DC grace before removal.
- **Party auto-reconnect** — page refresh while in a party restores party state via snapshot-on-reconnect (same pattern as game auto-reattach).
- **Multi-tab eviction preserves party** — opening a second tab does not trigger party disconnect logic. Party membership transfers to the new socket seamlessly.
- **Party socket events** — 4 client-to-server commands (create/join/leave/disband) and 8 server-to-client events (created/joined/updated/left/disbanded/error/leader-disconnected/leader-reconnected).
- **`PARTY_ERROR_MESSAGES`** — typed error reason codes with user-facing message strings in shared types. Sprint 1e clients can display errors without inventing copy.
- **Join code extraction** — `generateCode()` moved to `server/src/joinCode.ts`, shared by PartyManager and LobbyManager (DRY).
- **`emitToGuest()`** — new emitter helper that resolves guestId → socketId for party event emission. No buffering (snapshot-on-reconnect).
- **Party GC** — 60s sweep destroys abandoned parties (all members DC'd >5min). Skips parties with in-game members. Prunes stale rate limit entries.
- **Rate limiting** — max 1 party create per 5s and 1 join attempt per 5s per guestId. Prevents brute-force code enumeration.
- **`/health` party count** — endpoint now includes `parties` field.
- **`onStateChange` callback** — timer-driven state changes (leader transfer, member removal) emit socket events to remaining members.
- **`displayId` security** — party payloads use opaque per-party display IDs instead of guestIds (which are authentication credentials).

### Changed
- **`unbindAllFromGame` on game-over** — guest sessions are now unbound when a game finishes (all 3 game-over paths). Fixes stale `gameId` that would block party creation post-game.
- **GuestSession GC** — now checks `partyId` before deleting orphaned sessions (sessions with active party membership are preserved).

### Fixed
- **`showMessage` complexity** — extracted DOM creation logic to reduce cyclomatic complexity below ESLint threshold (pre-existing error, fixed per CLAUDE.md directive).

## [0.14.1] - 2026-03-26

### Added
- **Persistent guest ID** — client generates a UUID on first visit, stores in localStorage, sends via Socket.IO auth handshake. Separate from per-game playerId. Foundation for party system.
- **GuestSessionManager** — server-side module mapping guestId to socket, game, and player name. Handles session lifecycle, game binding, and periodic GC of orphaned sessions.
- **Auto-reconnect** — page refresh silently restores game state via guestId. No rejoin modal, no user action needed. "RECONNECTING..." label during the 1-2s window.
- **Multi-tab eviction** — opening a second tab evicts the first (last connection wins). Evicted tab shows "Playing in another tab" info banner.
- **Disconnect-skip timer** — disconnected players miss turns (fire zero shots) instead of being eliminated. 10s skip timer for untimed games; timed games use the normal turn timer.
- **All-disconnected timer** — if all human players disconnect, 30s timer ends the game cleanly.
- **`/health` endpoint** — JSON endpoint returning `{ guests, games, players, uptime }` for server observability.
- **Info banner system** — `showMessage(text, 'info')` extends `errors.ts` with blue (#38BDF8) auto-dismiss banners. Used for tab eviction, reconnect failure, and future info messages.
- **`guest-id-assigned` event** — server generates and sends a guestId when client connects without one (cleared localStorage, old client version).
- **`tab-evicted` event** — notifies evicted tab before disconnect.
- **24 new GuestSessionManager tests** — session lifecycle, eviction, game binding, GC sweep, name persistence, all-disconnected check.

### Changed
- **Online count deduplicated by guestId** — multi-tab users count as 1 instead of inflating the number.
- **Player name persists across games** — stored on GuestSession, auto-available on reconnect.
- **Queue entry migration on eviction** — opening a new tab while queued preserves queue position (migrates entry before disconnecting old socket).
- **`forfeitPlayer()` renamed to `eliminatePlayer()`** — only used by surrender now. Disconnect no longer eliminates.
- **`'forfeit'` reason renamed to `'surrender'`** — in player-eliminated events, reflects that only intentional quit triggers elimination.
- **`handleSeatMenuAction` refactored** — if/else chain replaced with dispatch map pattern (fixes ESLint complexity error).
- **`renderBattle` refactored** — extracted `computeBattleState()` helper (fixes ESLint complexity error).

### Removed
- **Rejoin modal** — replaced by automatic reconnection. No user decision needed on page refresh.
- **Forfeit timer** — disconnected players are no longer eliminated. `timers/forfeit.ts` replaced by `timers/disconnectSkip.ts`.
- **`check-rejoin` / `decline-rejoin` events** — removed from client and server. Auto-reconnect handles everything.
- **`getDisconnectTimeRemaining()`** — dead code after forfeit timer removal.

## [0.14.0] - 2026-03-25

### Added
- **Doctrine + gunnery AI architecture** — two-layer system replaces monolithic AI. Commander layer picks doctrine (hunt/kill/trade-up/protect-lead/desperation/cleanup), gunnery layer scores cells and optimizes salvos.
- **Probability density map** — Hard tier calculates where enemy ships are most likely based on all shots fired and remaining ship lengths.
- **Greedy salvo optimization** — Impossible tier picks the best shot, simulates the result, re-scores, and repeats for each shot in the salvo.
- **Kill-confirmed teammate guard** — bots only damage teammates when doing so sinks an enemy ship. Medium never hits teammates.
- **Smart ship placement** — Hard/Impossible spread ships apart and avoid predictable patterns (center-biased, hunt-pattern-aware).
- **Seeded RNG** — `createRNG(seed)` for deterministic bot simulations and reproducible testing.
- **Debug logging** — `DEBUG_AI=1` env var logs doctrine selection and top scored cells per turn.
- **Bot-vs-bot simulation harness** — test utility runs N games between bot tiers and reports win rates.
- **No-deadlock stress test** — 200 games across all 4 tiers verify no bot ever gets stuck.
- **Performance benchmark** — asserts `chooseSalvo()` completes under 50ms on worst-case boards.

### Changed
- **AI file structure** — `ai.ts` (311 LOC) split into 6 focused modules under `server/src/ai/`: doctrine, gunnery, probability, placement, helpers, index (~575 LOC total).
- **Self-damage is now a cost-benefit decision** — bots at all tiers accept friendly fire when the scoring math favors it, instead of hard-refusing to shoot their own ships.
- **Hex 3-coloring is now a soft bonus** — Hard tier prefers color-0 cells but won't refuse to shoot non-color-0 cells when they score higher.

### Fixed
- **AI deadlock on crowded boards** — Medium, Hard, and Impossible bots would refuse to fire when only their own ship cells remained unshot, causing games to stall. The new cost-benefit scoring system fires at the least-penalized cells instead of deadlocking.

## [0.13.2] - 2026-03-25

### Fixed
- **Chrome SVG render crash** — hex grid would stop rendering mid-way when a shot hit overlapping ships (two players' ships at the same coordinate). The hit count badge was an HTML `<span>` inside SVG, which Chrome's strict parser rejects. Replaced with a proper SVG `<text>` element. Affects Chrome, Brave, and all Blink-based browsers.

## [0.13.1] - 2026-03-25

### Changed
- **Modular architecture** — client main.ts (2,497 → 61 LOC) split into 24 domain modules; server index.ts (1,473 → 61 LOC) split into 16 modules. Every file has one job.
- **ESLint complexity enforcement** — cyclomatic complexity capped at 10 per function. ~30 functions refactored to pass.
- **Client test suite** — 54 new tests (state, helpers, audio, grid, battle, smoke) using vitest + jsdom. Total test count: 309.
- **Flexible salvo firing** — fire 1 to N shots per turn (capped at available hexes) instead of requiring exactly N. No more late-game deadlocks on crowded boards.
- **Move to any open slot** — all players can now click "+" on empty lobby seats to change their color, not just the host.

### Fixed
- **Game-over ship reveal** — all players' ships now correctly appear on the game-over grid. Server sends updated game state with phase='finished' before the game-over event so clients receive revealed ship cells.
- **Duplicate elimination checking** — extracted `checkNewEliminations()` helper from duplicated fire/bot code in game.ts.
- **Dead mobileTab state** — removed unused `mobileTab` state variable left over from the unified grid change.
- **Quick Play handler deduplication** — 7 copy-pasted QP join handlers consolidated into single `handleQPJoin(mode)` function.

## [0.13.0] - 2026-03-25

### Added
- **Per-player colors** — each of 6 player slots gets a unique color (Magenta, Red, Yellow, Green, Cyan, Blue). Ships, player cards, chat names, turn indicators, kill feed, and game-over stats all use player colors.
- **Fixed slot order (MRYGCB)** — private lobby: pick your seat = pick your color. Quick Play: random assignment from team-appropriate pools (warm Alpha, cool Bravo).
- **Game-over battlefield map** — all ships revealed to all players in their owner's color when the game ends. Sequential reveal in elimination order, winner's fleet appears last.
- **Sunk ship hulls visible to all** — when a ship sinks during battle, its colored hull capsule appears on every player's grid.
- **Colored UI elements** — chat names, shot log/kill feed, turn indicator, first blood highlight, and game-over stats table all show player colors.
- **"YOU" badge** — player's own card in lobby and sidebar shows a colored "YOU" badge.
- **Empty slot color preview** — open lobby seats show their assigned color at reduced opacity.
- **Hull contrast stroke** — all hull capsules get a subtle silver inner stroke for visibility against crimson hit cells (solves red-player contrast issue).

### Changed
- **Ship hull colors per-player** — hulls render in player color instead of hardcoded green. Own ships: 20% fill / 100% stroke. Teammate ships: full color (same intensity as own — different color IS the distinction). Sunk ships: 40% fill / 60% stroke.
- **Placement ghost in player color** — valid placement preview uses player's color (dashed). Invalid remains red.
- **Winner highlight uses player color** — game-over stats rows and winner text use the winning player's color instead of generic green.
- **6 new CSS variables** — `--player-magenta`, `--player-red`, `--player-yellow`, `--player-green`, `--player-cyan`, `--player-blue` with light mode variants.
- **Lobby seats are fixed color slots** — players and bots appear in the slot they were added to, not packed sequentially. Host can add bots to specific color slots.

### Fixed
- Empty lobby slot opacity no longer breaks dropdown z-index stacking (CSS stacking context issue).
- Seat menu items now highlight on hover (--bg-hover was same color as --bg-surface).
- Bots added via "+" button now appear in the correct color slot, not auto-sorted to the next sequential slot.

## [0.12.0] - 2026-03-24

### Added
- **CIC tactical display grid** — black void ocean, silver-white hex outlines, filled hexes for every cell state. The grid now looks like a military Combat Information Center radar screen.
- **Salvo resolution sound effects** — sonar ping for all-miss, impact tone for hits, alarm warble for sunk ships. Single composite tone per salvo, respects mute toggle.
- **Placement confirmation flash** — ship hull briefly brightens to full green on lock-in with a subtle confirmation tone.
- **Game-over battle debrief** — hex grid now visible on game-over screen with sequential ship reveal (100ms stagger per ship) and summary tone. Stats table below the grid.
- **Generic `playTone()` sound system** — extracted from existing match/turn sounds. All AudioContext tones use one reusable function (DRY).

### Changed
- **Hit fills desaturated** — dark crimson (`#8B0000`) replaces bright red for hit cell fills. Material Design guidance: desaturated colors reduce visual vibration on black backgrounds.
- **Unified hit fill** — all hits (enemy, friendly fire, your ship) use the same crimson fill. Hull capsule presence distinguishes friendly damage. Friendly fire marker stays orange `⚠` for colorblind safety.
- **Miss = searched sector** — visible gray fill (`#333333`) replaces nearly-invisible dot. Reads as "scanned area" on the CIC display.
- **Islands** — dark yellowish fill with amber outline for clear terrain visibility against black ocean.
- **Marker text via CSS inheritance** — cell state marker colors/opacities controlled through parent CSS classes, not inline SVG attributes.
- **Crosshair cursor** — actionable battle cells use crosshair instead of pointer for tactical atmosphere.
- **Responsive stroke-width** — 1.5px on desktop, 1px on mobile (≤768px) for optimal visibility at each viewport.
- **Placement screen widened** — max-width 700→800px to match battle layout, consistent grid sizing across all phases.

## [0.11.2] - 2026-03-24

### Added
- **Connected ship hull graphics** — ships now render as capsule-shaped silhouettes stretched across hex centers instead of solid-filled hex blobs. Scout is a small horizontal capsule; multi-hex ships are elongated hulls following their placement axis.
- **Hull capsules during placement** — ship hulls are visible while placing ships, not just in battle.

### Changed
- **Charlie team color** — changed from amber to blue (`#38BDF8` / Info Blue). Team colors are now the classic green/red/blue trio.
- **Mobile score table** — responsive sizing with smaller font, tighter padding, and horizontal scroll on very narrow screens. "Accuracy" header shortened to "Acc".

### Fixed
- **Charlie team badges** — 3 hardcoded alpha/bravo ternaries that showed "BRAVO" for Charlie players now use dynamic team name rendering.
- **Charlie win banner** — game-over screen now shows blue "TEAM CHARLIE WINS" instead of falling through to bravo styling.
- **Board turn glow removed** — the pulsing amber box-shadow around the grid was decorative noise. The "YOUR TURN" text indicator is sufficient.

## [0.11.1] - 2026-03-24

### Added
- **Custom dropdown components** — native `<select>` elements replaced with styled dropdowns matching the dark tactical theme. Game Type dropdown shows rich options with subtitles (FFA / Two Teams / Three Teams).
- **Two-column lobby layout** — players and team sections on the left, game options panel on the right. Collapses to single column on mobile (768px breakpoint).
- **Leave Game button** — ghost-styled button with confirmation dialog. Host transfers to the longest-tenured human player (Map insertion order).
- **Host transfer notification** — "You are now the host" info banner with 5-second auto-dismiss when host leaves.
- **Configurable island count** — None / Few / Normal / Many (maps to 0 / 4 / 6 / 8 islands). Host picks explicitly instead of auto-scaling by player count.
- **Host badge accuracy** — the HOST badge now tracks correctly when host transfers, always showing on the right player.

### Changed
- **Rebranded to HULLCRACKER.IO** — new game title, "Multiplayer Naval Warfare" tagline, Dreadnought ship class (was Battleship). Storage keys migrated automatically for existing players.
- **Game Type semantics simplified** — "2-team" now means "two teams" (Alpha/Bravo), "3-team" means "three teams" (Alpha/Bravo/Charlie). No auto-scaling based on player count. Always 6 slots evenly split across teams.
- **Keyboard accessibility** — custom dropdowns support Tab, Enter/Space, Arrow keys, Escape. ARIA attributes (listbox, option, aria-selected, aria-expanded) for screen readers.

### Fixed
- **Missing Charlie team** — selecting "2-Player Teams" with 5+ players no longer silently adds a third team. Host explicitly picks Two Teams or Three Teams.

## [0.11.0] - 2026-03-24

### Added
- **Hex grid** — the 10x10 square grid is replaced with a hexagonal grid using axial coordinates (q,r). 5 rings (91 hexes) for 2-4 player modes, 6 rings (127 hexes) for 6-player modes. SVG rendering with pointy-top orientation.
- **Islands** — random blocked hexes that can't be placed on or shot at. 8 islands for 2p, 6 for 3-4p, 4 for 5-6p. BFS connectivity validation prevents unplayable boards.
- **6-direction ship placement** — ships now follow 3 hex axes (6 directions) instead of horizontal/vertical. Press R to cycle directions.
- **New game modes** — 3v3, 3-player FFA, 6-player FFA, and 2v2v2 (3 teams of 2). Max players increased from 4 to 6.
- **Configurable ring count** — private game host can choose 4, 5, or 6 rings. Quick Play modes auto-select based on player count.
- **Lobby game options** — host-editable Game Type (FFA / 2-Player Teams / 3-Player Teams), Turn Timer (Off / 30s / 60s), and Grid Size directly in the lobby. Visible to all players.
- **3-team support** — alpha/bravo/charlie team IDs, `getTeammates()` returns array of 0-2 teammates, 3-team win conditions and shared vision
- **Shared test helpers** — `server/src/__tests__/helpers.ts` with `makeGame()`, `makeTeamGame()`, `hexPlacements()`, `setupBattle()` for DRY test setup

### Changed
- **Coordinate format** — all coordinates use axial hex format `"q,r"` (e.g. `"3,-1"`) instead of `"A1"` letter-number format
- **Turn order** — simplified from ABBA to straight team alternation. FFA uses round-robin.
- **Lobby flow** — removed create game modal. "Create Game" goes straight to lobby with defaults (FFA, 60s timer, 5 rings). Options adjustable in-lobby.
- **Placement timer** — removed as separate config, shares the turn timer

### Removed
- Square grid constants (`GRID_SIZE`, `ROWS`, `COLS`)
- `placementTimerConfig` (merged into `timerConfig`)
- `getTeammate()` singular (replaced by `getTeammates()` plural)
- Create game modal

## [0.10.3] - 2026-03-23

### Added
- **Random default names** — first-time visitors get a naval-themed auto-generated name (e.g. "Swift Torpedo", "Bold Kraken") pre-filled in the name field. A dice button lets you re-randomize anytime.
- **Name persistence** — player names now persist across page refreshes via localStorage, whether auto-generated or manually typed

### Changed
- **Vertical lobby layout** — private game lobbies now stack team cards (Alpha on top, Bravo below) vertically instead of side-by-side, giving each card full width for longer names

## [0.10.2] - 2026-03-23

### Changed
- **Lobby dropdown menus** — seat cards now have contextual dropdown menus (+ to add AI, ⋮ for player actions) instead of cramped inline buttons. Host can move players, swap players between full teams, or kick bots.
- **Shot log dialogue format** — each salvo now shows as a multi-line Battleship-style dialogue ("Eric fires: / A3 miss / B5 hit: [Morgan]") with sink lines, replacing the old per-shot entries. Newest entries at bottom with auto-scroll.
- **Turn indicator** — pulsing amber glow around the grid panel and larger turn text when it's your turn, plus an audio chirp notification
- **Hover-to-highlight** — hover a shot log entry to see those coordinates highlighted with info blue on the grid
- **Lobby width** — waiting room widened from 440px to 560px for more breathing room
- **Fixed-height panels** — shot log and chat panels now have fixed heights to prevent page layout shifts

### Added
- **Swap players** — host can swap two players between teams even when both teams are full (contextual "Swap with [name]" options in dropdown)
- **Player name truncation** — long names in the lobby now truncate with ellipsis instead of overflowing the container

## [0.10.1] - 2026-03-23

### Changed
- **Quick Play 2v2 button** — now amber like the other QP buttons instead of blue, for visual consistency
- **Battle player list** — players now appear in turn order so you can see who goes next at a glance
- **Private game lobby redesign** — team columns (Alpha left, Bravo right) replace the flat player list. Open seats show one-click bot difficulty buttons (E/M/H/I) instead of a dropdown. Players can move themselves between teams, and the host can rearrange anyone.

### Removed
- **Turn order visualization in lobby** — the A-B-B-A dots were misleading since turn order is randomized at game start. Turn order now only appears in the battle screen where it matters.

## [0.10.0] - 2026-03-23

### Added
- **2v2 Team Mode** — play with a teammate against another pair. Teams share ship vision, coordinate via private team chat, and win/lose together. Available in both Quick Play and private games.
- **Fair turn order** — teams alternate in a balanced A-B-B-A pattern so neither side has a first-mover advantage
- **Team chat** — toggle between Team (private, green) and Global (public, amber) channels. Only your teammate sees team messages.
- **Quick Play 2v2** — new matchmaking queue for team games. Random teammate assignment with full team coordination.
- **Placement timer** — configurable countdown during ship placement. Auto-places ships on timeout. Always enabled for Quick Play (60s), optional for private games.
- **Reset board** — return all placed ships to the tray before clicking Ready
- **Player readiness indicators** — see who is still placing ships vs who is Ready during the placement phase
- **Live teammate placement preview** — see your teammate's in-progress ship layout as ghost ships on your grid (2v2 only)
- **Game mode indicator** — "TEAM BATTLE — Alpha vs Bravo" header during 2v2 games
- **Hit count badges** — when a shot hits multiple overlapping ships, a small "×N" badge shows the hit count
- **Chat redesign** — timestamps on all messages, visual separation between game events and player chat, auto-scroll to latest message

### Changed
- **Reconnect timer** — forfeit is now turn-based instead of a fixed 60-second wall-clock countdown. Disconnected players are forfeited when their turn arrives and they haven't returned. Brief network blips during other players' turns cost nothing.
- **Team-aware bot AI** — bots on a team avoid targeting their teammate's ships (except Easy bots, who hit everything)
- **Desktop layout** — larger fonts and grid cells on screens ≥1200px, wider content area on ≥1440px
- **Changelog page** — uniform entry widths, consistent structure, better typography alignment

### Fixed
- **Light mode compatibility** — CSS now uses variables instead of hardcoded colors for hit badges, chat messages, and changelog entries
- **Duplicate elimination announcements** — sunk players are only announced once, not re-announced every turn
- **Stale rejoin modal** — modal auto-dismisses when the server reports the game is no longer valid
- **Placement timer sync** — client countdown syncs to server deadline instead of starting fresh, preventing drift from network latency
- **Timer cleanup** — all game timers (placement, forfeit, turn) are properly cleared when a game is removed
- **Placement preview validation** — server validates teammate placement preview data before relaying

## [0.9.2] - 2026-03-23

### Added
- **Surrender button** — players can now leave a game during placement or playing phases via a "Surrender" button with confirmation modal
- **Rejoin modal** — on page reload, a modal asks "Rejoin?" with a countdown timer showing remaining reconnect time, instead of auto-rejoining silently
- **Instant leave from rejoin modal** — clicking "Leave Game" on the rejoin prompt forfeits immediately, so other players aren't stuck waiting

### Changed
- **Silent forfeit** — all forfeits (voluntary + disconnect timeout) now silently remove ships instead of marking cells as hit, preventing position leakage in FFA games
- **Session cleared on game-over** — page reload after a finished game goes straight to lobby instead of showing a confusing rejoin prompt

### Fixed
- **Race condition** — surrender and disconnect timer can no longer double-fire (connection cleaned up before exit logic runs)

## [0.9.1] - 2026-03-23

### Fixed
- **Lobby button colors** — Create Game is now green (solid), Join Game is green (outline). Three-tier visual hierarchy: amber Quick Play > green Create > outlined Join
- **Global mute toggle** — moved from queue screen to top-right corner next to light/dark toggle, available on every screen. Uses text label (MUTE/UNMUTE) instead of emoji
- **Cleaner queue screen** — removed mute button clutter, Cancel is now full-width
- **Touch targets** — all buttons now meet 44px minimum height for accessibility

## [0.9.0] - 2026-03-23

### Added
- **Quick Play matchmaking** — 1v1 and FFA queue buttons on the lobby. Click one and wait for other humans to join — no codes, no coordination
- **Queue wait screen** — animated dots show how many players are queued, with a cancel button to leave
- **Live game counters** — lobby shows active games and players searching in real-time
- **Match-found sound** — sonar ping plays when a match is found (with mute toggle)
- **Queue switching** — clicking a different mode while queued auto-switches without error
- **Back button guard** — browser back button cleanly exits the queue
- **Auto-focus name field** — name input gets focus on first visit

### Changed
- Quick Play is now the primary lobby action; Create/Join are secondary
- Quick-play games always use a 60-second turn timer
- Quick-play rematch destroys the game and requeues all consenting players (clean game boundaries for future ranked play)
- Quick-play decline sends remaining players back to the queue instead of a private lobby
- Games now track their type (private, 1v1, FFA) for accurate lobby counters and future ranked play

## [0.8.0] - 2026-03-22

### Added
- **Bot friendly names** — bots now have real names like Meredith, Hugo, and Iris instead of "Bot (Medium)." First letter hints at difficulty: E=Easy, M=Medium, H=Hard, I=Impossible
- **Player icons** — inline SVG icons next to every player name. Person silhouette for humans, robot head for bots. Both in tactical green.
- 40 bot names total (10 per difficulty, 5 male + 5 female each)
- Names are randomly assigned and unique within each game

## [0.7.0] - 2026-03-22

### Changed
- **Game Options modal** — turn timer and future game settings now live in a modal that opens when clicking Create Game, keeping the lobby clean and extensible

## [0.6.0] - 2026-03-22

### Changed
- **Simplified lobby** — single name field with Create Game and Join Game buttons side by side
- Join Game opens a focused modal for the 4-letter code instead of a separate form
- Removed duplicate name input fields

## [0.5.0] - 2026-03-22

### Changed
- Changelog page now renders from CHANGELOG.md at runtime — single source of truth, no more hardcoded HTML

## [0.4.2] - 2026-03-22

### Fixed
- Friendly fire reports were wrong when multiple bots shared a name — Bot B attacking Bot A showed as "FRIENDLY FIRE" because the shot log looked up shooters by name instead of ID

## [0.4.1] - 2026-03-22

### Fixed
- Render deployment broken since v0.3.0 — Vite config used a relative path for package.json that resolved outside the repo during build

## [0.4.0] - 2026-03-22

### Changed
- **Unified single grid** — your ships and all shot results on one interactive ocean instead of two separate grids
- You can now see your own ships while selecting targets, making friendly fire risk visible and deliberate
- Simplified cell colors: red = enemy hit, orange = self-hit (friendly fire), dark red = enemy hit your ship
- Removed fleet/target tab toggle on mobile (no longer needed)

## [0.3.0] - 2026-03-22

### Added
- Changelog page accessible from the lobby footer
- Version number moved from subtitle to footer with changelog link

## [0.2.1] - 2026-03-22

### Fixed
- Enemy hits on your ships no longer show as "friendly fire" in the shot log — only self-inflicted hits use the orange FF label

## [0.2.0] - 2026-03-22

### Added
- Game-over stats with per-player table: shots fired, hits landed, accuracy %, ships sunk, friendly fire count
- Auto-generated highlights: Sharpshooter (highest accuracy), Most Destructive (most ships sunk), Friendly Fire Champion, First Blood

## [0.1.0] - 2026-03-21

### Added
- Initial playable beta
- 2-4 player shared-ocean Battleship with private join codes
- AI opponents with 4 difficulty tiers (Easy, Medium, Hard, Impossible)
- Ship placement: click-to-place, rotate, randomize button
- Turn timer (30s/60s/off, host-configurable)
- Text chat for all players
- 60-second reconnection with event buffering
- Rematch with consent (bots auto-accept, declined players go to new lobby)
- Light/dark mode toggle with localStorage persistence
- Mobile responsive layout
- Deployed on Render.com
