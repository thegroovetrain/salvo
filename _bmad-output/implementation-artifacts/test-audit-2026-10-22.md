# Test Purposefulness Audit — 2026-10-22 (Story 9.14, cycle 204, 0.18.69, PV 91 unchanged)

The rule (Eric, epic-8 amendment 243; project-context.md → Testing Rules): a test asserts a CONTRACT of the function under test — never vocabulary or copy strings, wall-clock timing, or geometry standing in for a perf claim. Eric's brief for this story (2026-10-22): pare down AND end up sufficient — unit tests on pure functions, integration tests on compositions, the headless socket smokes as the end-to-end layer.

Every test file in `shared/src/__tests__`, `server/src/__tests__`, `server/scripts/batchsim/__tests__`, `client/src/__tests__`, `client/src/audio/__tests__` and `.claude/hooks/protect-claude-md.test.sh` was read in full by an Opus reader that owned a fixed slice (21 slices), applied the story's rubric per `it(`, and edited its own files; the orchestrator ran each workspace suite, committed per workspace, and the diff was reviewed at the gate by three Fable hunters (one per workspace) and Codex (`gpt-5.6-sol`) with one question: does any deletion remove a guard whose contract was real? Production code is untouched (`git diff 7907597b..HEAD -- . ':!*__tests__*'` is the spec-8-15 wording fix only).

## Eric's rulings for this story (2026-10-22, before the audit ran)

1. CLOCK — delete all six wall-clock pins.
2. PROTOCOL_VERSION literal pins — delete all five; the join-gate BEHAVIOR test stays.
3. Client copy pins — every UI string equality goes, the structural half stays; no label exempt.
4. Fuzz worlds stay at 20; the spec record is corrected.
5. The class-table identity pin (`shipClasses.test.ts`) is DELETED — Eric overrides the project-context Testing Rules line that kept it.
6. Gaps: fill `shared/src/sim` and `shared/src` here; list server/client gaps for 9.16.
7. Titles: a bare-label title is RENAMED to state the behavior; no contract comments added.
8. Readers on Opus; the gate on Fable + Codex.

## (a) Per-workspace table — real runs on this machine

| Workspace | Files before → after | Tests before (`npm test -w`) | Tests after | Deleted (whole tests, listed below) | Rewritten (listed below) | New (gap fill) |
|---|---|---|---|---|---|---|
| shared | 47 → 49 | 1177 | 1167 | 51 | ~96 | +37 (27 exports) |
| server (+ batchsim) | 105 → 103 | 2793 + 2 skipped | 2768 | 27 | ~130 | 0 (listed) |
| client (+ audio) | 137 → 135 | 4170 | 4062 | 112 | ~470 | 0 (listed) |
| hooks (bash) | 1 | 266 assertions | 266 | 0 | 0 | — |
| **vitest total** | **289 → 287** | **8,140** | **7,997** | **190** | | |

"Rewritten" counts a test whose literal/copy/tautological assertion was removed or replaced while its contract assertion stayed; partial deletions inside a kept test are counted there, not under deleted. "Deleted" is whole `it(` blocks (an `it.each` counts once). Renamed titles: ~190 across the suite (every rename rides a rewrite or a bare-label title; no mass renaming).

Baseline measured at 081f8f72 (= development 9c1aa81c + the story file): shared 1177 · server 2793 + 2 skipped · client 4170 · hooks 266. After (the final `npm run check`, 2026-10-22): shared 1167 (1129 after the audit wave, +37 gap fill, +1 gate) · server 2768 · client 4062 (4060 after the wave, +2 gate) · hooks 266; lint 0 errors.

## (b) Deletions — `file:line (original) — title — REASON CLASS`

Reason classes: VOCAB (copy/label/name string), CLOCK (wall-clock ms), CONST (restates a CONFIG / geometry literal with no relation behind it), COINCIDENCE (two ruled numbers happened to be equal), TAUTOLOGY (asserts its own setup or re-derives the function under test), DUPLICATE (the same contract pinned elsewhere), SKIPPED, SEED-OUTCOME.

### shared

**SH1**
- stats:237/251/287 CONST
- stats:810 DUPLICATE of :785
- stats:1350 DUPLICATE of barrel:525
- barrel:571 CONST+DUPLICATE (hullRepair:93 survives)
- barrel:648 DUPLICATE of loadout:65/90
- barrel:978 mine hp/radius CONST
- shipClasses:47/63/79 class-table identity CONST (R5, Eric 2026-10-22)
- nineSlots:163 TAUTOLOGY (3==3 by definition)
- nineSlots:195 CONST
- hullRepair:50/74/81 DUPLICATE of barrel (then CONST)
- :56 historical-hp CONST
- :134/:145 CONST
- :138 DUPLICATE of catalog SHEET caps
- :185 offer.size 4 CONST
- damageBands:18 CONST.

**SH2**
- map:591 "a production map generates within budget" CLOCK (cited the cycle-59 prototype 38/44 ms; re-based 250 → 500 (am. 42) → 1500 ms (7-8); no NFR)
- island:334 LOS sweep budget CLOCK (cited only "generous CI budget")
- heightField:59 nine TERRAIN_PARAMS literals CONST
- zone:182 K = radarRange²/4 DUPLICATE of radarShadow:70
- zone:204 wakeLifeMs 5500 CONST (contract kept at :247/251)
- zone:216 wakeSampleU 12 CONST (relation > radarCellU kept)
- collision:289 retired-behavior arithmetic TAUTOLOGY.

**SH3**
- damageGuardrail:401 mine damage 90 CONST
- :467/:474/:485/:497 retired-FR7 torpedo-vs-hull speed records CONST
- :612 exchange-rate ratio TAUTOLOGY
- wake:188 bucket count 4 CONST
- aim:426 keys of own literal TAUTOLOGY
- silhouette:61 vert counts CONST
- radarRaster:186 PROTOCOL_VERSION/radarCellU/radarFuzz literals CONST (R2)
- sinking:24 flat 5000 ms CONST
- boost:43 CONFIG.boost row CONST
- boost:99 56.25/50/43.75 CONST
- slow:56 0.75/5000 CONST
- foghorn:91/101/107/113/124 FoghornEvent wire-shape tests TAUTOLOGY (all-optional interface
- keys of own literal
- :113 array vs itself
- :124 dup of :31
- fh wire shape is guarded by the server perception invariants).

### server

**S1**
- perception:1457 (3/8 band gone — boundary half = :1447)
- perception:1539 (looser restatement of :1528 / :1510)
- damageGate:420 (same as :246 HUNKER cut)
- damageGate:903 (subsumed by :107 weapons-safe room loses no hp from any source).

**S2A**
- botReviewFixes:700 MOONRAKER it.skip SKIPPED
- :712 CROWSNEST it.skip SKIPPED
- bots:146 cardPoints identity table CONST (R5)
- bots:479 DUPLICATE of :216
- bots:504 DUPLICATE of :194
- botTactics:2532 TB boosts on disengage DUPLICATE of ~:1150.

**S2B**

**S3**
- assistSplit:104 window 60000 / killerShare 0.1 CONST
- xp:199/:213 DUPLICATE of the rewritten all-tier :183
- partial upgrades:977 DUPLICATE of equipment:237.

**S4A**

**S4B**
- colyseus018:170 "PROTOCOL_VERSION is 91" CONST (R2
- 80-line changelog comment + 11 per-PV /refresh/ lines gone)
- colyseus018:108 ArenaState 16 / PlayerMeta 8 field-count CONST (≤ 63 cap contract stays)
- roomOptions:298 TAUTOLOGY (asserted the opposite of its title
- covered by :275)
- roomOptions:328 retired-export-absence DUPLICATE of :311/322.

**S5A**
- hitTargets:554 (describe 526-580) 500-live-mine < 50 ms CLOCK (cited NFR23
- now harness readouts + staging)
- weapons:152 torpedo hitRadius === 2 CONST (wiring contract stays at :92).

**S5B**
- machineGunFlashCost:107 best-of-5 < 50 ms CLOCK (cited 8.15 flash cost, am. 89(i)/103/109; non-clock half pinned at machineGunStream:99-112; budget now harness readouts + staging)
- fogPerf:119 observe()×16 < 50 ms + first-touch < 10 ms CLOCK (cited 9.10 "make it performant", TICK_BUDGET_MS; warm-repeat memo contract pinned at fogField:363)
- foghorn:414/421/533/548/555 DUPLICATE of :296, :266 band table, truth table :562.

**S6**

### client

**C1**
- keyboard:1136 refit.closeGraceMs === 400 "matching results.keyGraceMs" CONST + COINCIDENCE
-  roomBindings:675 DUPLICATE of :656 / TAUTOLOGY (planted mock read back).

**C2**
- hotbar:312 retired-string source scan VOCAB
-  upgradeMenu:205 px literals CONST
-  cardStatRows 272/299/309 label lists + catalog numbers CONST+VOCAB
-  cardStatRows 386/397/407/417/434/452/472 literal `LABEL cur>next` faces CONST+VOCAB (law at :492 strengthened: one row per changed stat, reload pair vs fold for every line at every rung)
-  cardStatRows 556/565/573 DUPLICATE (merged into :548 loop)
-  581/591 DUPLICATE of :842
-  741 DUPLICATE of refitFailOpen:26
-  796 DUPLICATE of boonCopy cardTierLabel tests
-  853 DUPLICATE of :750/:763
-  slotTooltip 147/171 DUPLICATE of boonCopy:189/220
-  449 DUPLICATE
-  458 CLIENT_CONFIG/TIP_TYPE literals CONST
-  refitCardFit 361/424 register + geometry literals CONST (am. 31 called the mock binding — :411 now asserts every register ≥ monoFloorPx)
-  boonCopy:83 card names VOCAB
-  :490 DUPLICATE merged into :479
-  :514 not.toContain('Repairs') VOCAB
-  gunPickHud:104 DUPLICATE of boonCopy:232
-  weaponTables:71 merged into :62
-  fitCheck 161/323 catalog-state changelogs CONST
-  166/176 DUPLICATE.

**C3**
- radarFalloff:103 POINT/SURFACE/VOLUME exponents 4/3/2 CONST (ordering relation stays)
-  radarFalloff:296 hullPeak(480) === hullPeak(480) TAUTOLOGY.

**C4**
- FILES REMOVED (rm): noFishCopy.test.ts (word absence in copy — am. 211), noDrawPileCounter.test.ts (source-text grep for deckLeft/deckSize identifiers, no DOM half).
- taglines:9 (20 approved strings verbatim) / :51 VOCAB
-  howToPlay 68/75/83/96/126 phrase/heading/word pins VOCAB
-  home:1322 retired-copy absence VOCAB
-  classSelect:777 SPECIAL_NAMES/GUN_CHIP_LABELS tables VOCAB.

**C5**
- settings:321/330/340/353/364/369/374/382/391/398/405 key-label copy pins and word absences VOCAB (bindingRows now has a structural test: every row names keys + action, no key twice)
-  tones:153 DUPLICATE of :80
-  foghorn:72 cooldownMs 1500 CONST
-  foghorn:165 band-12 literal weights CONST
-  horns:32 "EXACTLY ONE horn" content-identity CONST
-  horns:88 1.8 s CONST
-  tokens:217 legacy hex table CONST
-  tokens:341 colorblind hex CONST (relations live in cvd.test.ts)
-  tokens:622 retired-reservation hue positions CONST
-  deniedCue:43/49 hidden PULSE_RATE_MS pins CONST/DUPLICATE of :36.

**C6**
- gunneryFeed:25 TAUTOLOGY (both "orders" the same call sequence)
-  deniedFire:43 DUPLICATE of :27
-  smoke:59 vitals 0.5/0.25 CONST
-  smoke:368 keys of own literal TAUTOLOGY
-  decoys:148 DUPLICATE of :166/:204
-  mines:178 glyph ×1.1 CONST
-  mines:367 spiked-sphere eight spikes CONST (kind → glyph routing stays :354/:361)
-  weaponArc:287 ±90°/60° degree literals CONST.

**C7**
- fogField:130 halo-square refresh < 50 ms best-of-5 CLOCK (cited 9.10 "THE FIELD" re-plan
-  target < 2–3 ms
-  budget now staging/harness
-  refreshCount half at :96)
-  wake:163 CONST products maxSpeed × wakeLifeMs
-  wake:205 TAUTOLOGY (0.25x < x, no production call)
-  wake:356 persistSweeps === 3 CONST
-  wake:602 word ban in source comments VOCAB
-  hullOverRadar:157 minScale === 0.2 CONST
-  twinMap:44/58/75/117 word-regex twin pins VOCAB (module pointers moved into rewritten :35/:97
-  :112 word ban → every named module exists, non-vacuous).

**C8**
- ordnanceMasksAreServerOnly:77 PV 91 CONST (R2
-  import + changelog comment removed)
-  perfSeam:63 SCENE 19-number identity pin CONST (R5 analogy — restore if Eric holds the 4.8 readability scene as a ratified table)
-  perfSeam:261 TAUTOLOGY (asserts same type, cannot catch conflation)
-  liveness:397 DUPLICATE of :126
-  killFeed:333/:394 TAUTOLOGY (both sides the test's own resolver copy
-  real guard :406 main.ts scan kept)
-  attention:209 amberRank literal CONST
-  lineGlyphs:47 DUPLICATE of :14/:23/:43
-  phaseUx:112 register grammar VOCAB
-  primeRelease:156/:187 DUPLICATE of :443/:497.

**C10**
- :48 frame/globes/gap
-  :54 slot/belt squares
-  :62 key chip/icons/badges
-  :74 XP strip row
-  :83 dim alpha/hairline/bed/waterline
-  :90 type-size table (9 px floor still guarded by microScale tests)
-  :119 tier numeral inset
-  :123 cooldown wipe skin.


## (c) Rewrites — what it pinned → what contract it now names

A rewrite keeps the test and its contract assertion; what went was a literal (a CONFIG / px / hex / ms number with no relation), a copy string, a tautological line, or a changelog comment. The replacement reads the value off CONFIG / effectiveStats / the module's own pure formatter or composer, or states the relation (monotone ladder, a ≤ b, floor-of-one, additive-not-compounding, derived-from-parts). Per slice, original line numbers:

- **SH1** — stats 77 (identity fully CONFIG-referenced),302 (COINCIDENCE 600 removed),470,501,525,700,819,942,1043,1354 (independent oracle: ticksToRefill = ceil(base×¾/50) for every EquipmentId); barrel 107 (PV pin + ~380-line changelog comment removed, R2),502,525,537,599,608,619,627,675,725,775,787,815,851,894,910,928,944,958,1075 (card count = Σ cap in catalog.test.ts),1176,1235,1289 (fleet composition expanded largest-first; waves ascend, fleets halve); boons:551; catalog 141,150,245,403; loadout 159,176,211,221,314,382,439; shipClasses 148,168,206 (size relations small→medium→large); hullRepair:149; damageBands 60,76 (@ts-expect-error type-level); draw 310,329.
- **SH2** — map:91 SPAWN_MARGIN ≥ widest player-hull bounding radius; map:97 MIN_FEATURE formula only; map:577 'reseeded' word pin → error name/seed/cap context; zone:43/55 sudden-death relations (groups(on)=groups(off)+1 etc.); zone:186 radarMastQ integer; zone:535 beats derived from zoneEndgameAtMs/zoneClosedAtMs; zone:624 zoneGroups(off) = zoneGroups(CONFIG)−1.
- **SH3** — damageGuardrail 92,134,240,333,350,367,385,516,531,574; wake 135,291,370 (pure rasterizer on synthetic widths); silhouette 108; arcs 73,84,104,122,174 (half-widths and leash numbers dropped, direction offsets kept); sinking 37; dropout 24 (COINCIDENCE startU === farRadar removed); boost 76,105,126,133,136; slow 73,128,133,143; foghorn 75; draft 27 (dials finite > 0 — draftLift fails closed to 0), 82.
- **S2A** — botPolicy:187 six-taste toEqual → every taste names real catalog lines / known style / priced hunger; :244 retired APPETITE_FAMILY oracle → appetiteFor resolution unit test (own entry wins, unnamed → neutral, guns below neutral); :334 mine-layer literals → relations (both nudge outward, forager earliest, within gun reach); scorer matrix ~1129-1295 seven literal toBe restating the formula removed; botTactics:675 bumper geometry literal → band 90<bumper<120 and lookahead>120; bots:216 absorbed :479.
- **S2B** — botPlot:~450 assoc radius via predictedAssocRadius(); doctrines 159,408,419 (captive homing ladder: tier I 0, strictly climbs, < CONFIG.torpedo.homingTurnRate, am. 82),456,687,710,731,754,828,857,947,967,980/999/1009,1049,1087 (zone stamped from the row, am. 135(e)),1210,1225; droneSightScope:130 (loop-length 16 → counter rose); droneDrops:91 (PASS < chance ≤ FAIL, rolls small<medium<large).
- **S3** — weighting 97/109/121/153/170 (FACTOR, FACTOR², FLOOR as clamp; taker count from log); xp:183 (every tier: floor(K·tierMs/levelMs) levels, exact ms carry); assistSplit 137-474 via killerCut/assistCut from XP.killerShare/killLevels, :198 XP.assistWindowMs; equipment 171 (EQUIPMENT keys === EQUIPMENT_IDS), 204, 383, 405, 527 (from HR.regenHp/regenMs/DT), 596, 661; upgrades 296, 597, 629, 904, 973, 1018-1352 (hull step from effectiveStats), 1058/1075 (firstGunPoolRaise via effectiveStats), 1089 (flak ladder climbed until pool grows), 1485/1515/1540 (scale = 1 + Σ cooldownScale adds, rounded 3 dp, ceil(R/DT) ticks), 1573-1643, 1661, 1683, 1760, 1785/1798 (were VACUOUS — 'missile'/'monitor' not stubs; now an injected ghostRack stub proves the stub gate; shown red without the gate), 1868.
- **S4A** — lobby:68 countdown 10_000 literal removed; lobby:383/634 code regex → CONFIG.lobby.codeLength; lobby:503/521 /refresh/ and /too many matches/ copy → protocolVersionError(pv) / SOLO_CREATE_THROTTLE_ERROR; lobby:797 'CAPTAIN-1' literal → non-blank callsign survives sanitizeName; solo:70 /refresh/ → protocolVersionError; solo:181 BOTS+1===playerCap tautology removed; solo:563 minHumans===2 removed; soloThrottle 35/51/183-281/228/238 literal 6/7 → SOLO_CREATE_DEFAULT_LIMIT, /refresh/ → protocolVersionError; queue:41 minHumans/queueTimerMs literals removed; queue:294/307 copy → ARENA_DIRECT_JOIN_ERROR / protocolVersionError; reconnect:153-192 /refresh/ → protocolVersionError exact / contains v${PV}; reconnect:450 grace===60 → >0.
- **S4B** — denials:274 PV literal + ~49 protocolVersionError(N)/refresh/ lines → ONE test (PV−1 and undefined refused with an error that says refresh); denials:342 mine.offset ≈ π removed; colyseus018 263/298/302/306 → PROTOCOL_VERSION±1 relations, admits PV only; roomOptions:221 NAME_MAX 14 (CONST/COINCIDENCE with client cap) removed; stagingGate:161 'STAGING ACCESS' → form posts to GATE_PATH; :207 'Wrong password' → class="err" present; zoneSeeds:34 literal reveal time → lockstep until first reveal, bounded by 16 × CONFIG.zone.beatMs; zone:346 sunkS ≤ 90 CONST removed (geometry promise stays); operability:751 joiningDeadline 10 → > 0 finite; intentQueue:181 press half now actually asserted (charge drops, lastActSeq 1) — old body never checked it.
- **S5A** — weapons:734; broadside:206 (edges from CONFIG.broadside.arcOffsetDeg ± arcHalfArcDeg), 319, 364, 619; contactDamage:564; machineGunStream 90,99 (count from rateMs over 60 ticks),126,269,332,379-414,426,524,587; flak 83,122; mineHp 94-97,281,294,359; torpedoSelfHit:312; starShells 67,115,147.
- **S5B** — boost 59,119,133,175,287; shift 85,120,153,193; shieldBlock 92,107 (hunker damage via damageMultiplierFor, floor-of-one); wakeStore 43,55 (derived from CONFIG per class); matchTelemetry 294 (joiningDeadline > 0, < grace).
- **S6** — batchSim:217 restore-to-captured value; :484/:532 reloadCapScale() via effectiveStats on a cap RELOAD build (shipped literals in regex/prose gone); :1317/:1333 report prose VOCAB removed (aggregates stay; no 'NaN'); :1436 levelCurve[1].n → match.captains.length; :1518 coincidence pin on shipped MG damage → shipped + 1; botHarness 212/283/530/599 report header + prose pins VOCAB removed (arithmetic stays, landDamage 40 is hand-built 10+30+0 — sums its parts, not a seed outcome); poolReadouts:279 header → block rides the report verbatim; tuneFloor:18 shipped turnRate < 1 CONST removed.
- **C1** — roomBindings kill-feed copy (VOCAB) → routed line equals killLine/bountyKillLine/fleetSizeName on the resolved refs (routing contracts kept: order, null killer on storm, mark side, UNKNOWN_VESSEL fallback, drone naming, no raw sess_ id) at 785/805/995/1045/969-989/1015/1051/1037/1062; toast copy → pointToastLine()/boonFitToastLine() at 1260/1282/1293/1317/1365/1460/1476/1486; :2003 BURN_AMOUNT_CAP edge relation; :2061 literals removed (cap = maxBurnDps × (window + tick) stays); keyboard:633 SLOT_COUNT 11 removed; :1145 edges as closedAt + GRACE; connection:172 GRACE from CONFIG.net.reconnectGraceSeconds; :296/:336/:350 copy → error-class equivalence; :454 'deckGun' → DEFAULT_GUN only; :503-528 five connectErrorStatus copy matches → class equivalence, exactly ONE version-gate presence test; :852 register checks → non-empty + tone; sessionLock:465/492 → equals sessionBusyStatusLine(), tone 'denied'; requeue:82 TAUTOLOGY (keys of own deps) → source scan of app/requeue.ts + makeGameRequeue for no AdBreak.
- **C2** — weaponTables 32/43/49/55/62/75/82/91 (values vs fold at every tier); tooltipFit:170; fitCheck 50/96/186; gunPickHud 92/125/166; boonCopy 51/69/141/166-252/189/245/265/289/315/462-479/499-527 (values from fold/CONFIG, no label words); slotTooltip 111/133/154/181/204/231/251/359/364/390/414/431/440 (stats === equipmentStatRows/consumableStatRows/shipStatRows; rung = romanTier(n)); refitTooltipFit 113/132/149/190/308/480/500/534/633/644; refitCardFit 124/154/411/445/453/462/535/591; cardStatRows 28 tests label-blind [cur,next] pairs from effectiveStats/CONFIG; hotbar 221/383/1248/1259/1280/1382/1417/1424; upgradeMenu 82 (n·card + (n−1)·gap)/165/242/433/456/466/490/591/619/685/712/1158.
- **C3** — prediction:470 cap = maxSpeed × (1 + CONFIG.boost.factor); :740/:766/:861 foul/shell slowFactor literals deleted (server-match assertions stay); radarHeatmap:276 0 < bandAlpha < 1; radarViewport:1064 0 < minScale < 1 (ladder relations 4/12, 6/12, outerFactor stay).
- **C4** — home (39) — status text === serverStatusLine(state).text, tones, child counts, doors by structure/href/title/data-gun, livenessLines(payload), link hrefs; classSelect (12) — CLASS_DISPLAY_NAMES / SPECIAL_NAMES[classShift] / data-gun order === GUN_IDS, highlight via lit register; results (31) — banners differ / contain winner NAME / === DRAW_BANNER, ordinalPlace(), placementLine(), buttons by id, label order === LADDER_IDS.map(boonName), matchLogRow; lobbyModal (24) — role-based structure, codeLine/aboardLine/lobbyCountdownLine oracles, cells [ready, leave, start], maxLength → CONFIG.lobby.seedTextMax; queueModal (8) — n/cap, countdownMmSs, reducer oracles; lobby/privateLobby error copy → connectErrorStatus(branch); page 66/269; privateRow:20; joinCodeModal 53/117/129 (last text === wire token); howToPlay:122 no entry describes a stub (isStubLine); privacyPolicy:193 title/date prefix dropped; communityLinks hrefs in order; homePersistence NAME_MAX.
- **C5** — settings 47 (defaults = sanitize fixed point), 145, 423, 461, 498/554 (dangerLabel()), 601, 720, 734; tones 98, 415; foghorn 161 (plateau weight), 169, 502/511/552 (tautologies removed), 532 (drawn alpha = chevronAlpha(…)); tokens 139 (40 hex pins removed), 189 (20 unique hues), 227, 274 (no mono register below hudMicro), 293 (bands = CONFIG.damageBands; pulse relations); snapshots:58 (100 + 20 × MAX_EXTRAPOLATION_MS/1000); audio context:245 (noise attenuated by the tone's factor).
- **C6** — gunneryFeed:107 floor relation; shake 19/24/29/53/59/65/99 via shakeMagnitude(damage), ≤ SHAKE_MAX_PX; effects 158/178 decay from onset alpha (SPARK_PEAK removed); smoke:298 self-equality → Smoke adapter at motion full/reduced/off keeps livePuffs; mines 241/254/268 (arming alpha > 0 and < armed); projectiles 316/334 (were TAUTOLOGY on the payload; now the track pose via torpWakeHulls); weaponArc:299; aimPreview 274,500,703,733,746,791,870,974 (CONFIG reads / relations).
- **C7** — zone:73 telegraphAlpha < edgeAlpha; mapChart:61 one ramp row per band level; nameplates:137/198/277 derived fixed drone label (never roster name), :212 PLATE_FONT_PX removed; sinkSettle:357 derived CAP + (1−CAP)·0.5; ships:48/70/108 hue order from REGATTA_HUES; wake:130 slowest < steerageSpeed, :151 no client-only life knob, :252 CHOP_HEAD_MULTIPLE === 1/KELVIN_SIN; hullOverRadar:79 production floor across the bubble (test-local formula tautology dropped).
- **C8** — worstCaseScene 103/182 (RING CLOSES IN copy → state + urgent / equals ringReadout text); killFeed 45/53/82/93/102/110/284/299/310/358/376 (copy → segment structure, fleetSizeName(), mark side, glow only on leader); phaseUx 8/24/35/41/83/88/92/101/106 (banner copy → counts carried, tags non-empty, reads pairwise distinct/same across winners); boonStats 42/141/158 (additive-linear 1 − 5·(1 − s1), never s1^5)/171 (dust-free strictly descending ladder); liveness:83 TAUTOLOGY → real fetch path with stubbed global fetch asserts no `c` param; aggro 54/267; motion:47 reads CLIENT_CONFIG; lineGlyphs:14 GLYPHED length 25 removed; bounty 76 (mark = 2 code points, second U+FE0E)/100/113/171/178/185/203.
- **C10** — hudBar 112,134 (width = Σ parts),150,156,166 (below chromeBar.y, inside viewport),176 (r = globe/2),196 (weapon row + belt row = SLOT_COUNT; belt < weapon),226,230,247,272,310; helmGlobe 73 (nine labels symmetric about STOP),82,89,173 (boosted cap = cap·(1+factor)),274,631 (numerals only; −π/2 wraps to 270°); hpGlobe 443,456 (numerals via helper; valueFill switch stays); hud 215-243 (row === chromeBarSegments composer output),251,289,402/416; chromeBar 65-109 (ring readout: urgent flag, ends with fmtRingClock, states differ, closed has no digit),177,185,192/198,230,236,260,280,293,317 (RING_PULSE_HZ CONST removed); xpStrip 81,89,118,337/379,404.

Renames (bare-label or literal-quoting titles → behavior titles): listed per slice under RENAMES in the orchestrator's slice reports; the house style is the cycle-202 one ("a delivered hull is never softened by the sight boundary"). Deprecated "ready room" wording was renamed out of every title and describe label (match, gunnery, xp, inputSampler, phaseUx, roomBindings).

## (d) KEPT CONTRACTS — the architecture invariants, with file paths

- **Perception / anti-cheat chokepoint.** `server/src/__tests__/perception.test.ts` — nothing outside sight ∪ this-tick radar paints ∪ owned lit zones reaches a client, exactly SIX declared exceptions (`sp`, `hc`, `mz`, `sunk`, `sm`, `fh`) plus the jamming-buoy fakes carve-out; the independent test-local oracle (header lines 1–105; mask/shadow/fog-toll/cloud-gate oracles re-derived, never production predicates); the 20-world seeded fuzz (~:4369, count stays 20 — ruling 4) with non-vacuity ledgers (CLOUD_*, DRAFT_SEEN, wkSeen, reReveals, FOUL_ZONE_DELIVERED, DECOY_PAINT_EXPECTED, FOG_*, RADAR_THROUGH_FOG); the SIGNAL REGISTRY completeness block (~:5291: exact 26-key set, self-keyed rows, every event row has a verifier, frozen, no `fog`/`buoy` row); leak-catch proofs (a forged blip fails verifyFrame; a twin cannot stand in for an omitted paint). `server/src/__tests__/frames.test.ts` — buildFrame shape: self-private fields only on `you`, unknown viewer sees nothing (fail-closed), drone into OwnShip throws, clouds channel wire order, `sunk` public with `seen` for witnesses and `vcls` only to the killer. `server/src/__tests__/goldenFrames.test.ts` — the 160-row battery compared byte for byte against the committed snapshot (`__snapshots__/goldenFrames.test.ts.snap`, unchanged by this story; never run with `-u` here). `server/src/__tests__/signals.test.ts` — registry iteration (a signal cannot exist without a row; eventType = key; frozen; signalFor fails closed; msgpack key order; the declared exceptions self-private or public by rule). `server/src/__tests__/radarWire.test.ts` — identity-free blip footprint; boons/hp never in the mask. `server/src/__tests__/spectator.test.ts:420` — spectator frames against an independent reimplementation. `server/src/__tests__/hitTargets.test.ts:340/351/359` (a mine on the shot line leaves the shooter's frame byte-identical, am. 20), `rangeAttenuation.test.ts:271`, `weapons.test.ts:639` (torpedoes never radar-painted), `starShells.test.ts:199` (lit-zone intel scoping). `server/src/__tests__/foghorn.test.ts` — the `fh` exception row shapes (self / fogged with no id,x,y / spectator), plateau floor at band 4, fail-closed, muffle truth table, delivery through buildFrame. Client half: `client/src/__tests__/ordnanceMasksAreServerOnly.test.ts` (every client source scanned: `hits` masks and TargetKind never read or built client-side; scan non-vacuous), `radarEcho.test.ts` "the client paints ONLY wire-delivered returns" + `radarViewport.test.ts` "the camera cannot touch what is painted" (am. 210), `radarHeatmap.test.ts` "ONE BEAM CROSSING IS ONE PAINT" (cycle 203), `radarViewport.test.ts` near-range dim = display mask never a strength term (am. 181/212).
- **`applyDamage` is the only hp write.** `server/src/__tests__/damageGate.test.ts` — source scan of `world.ts`: exactly ONE `victim.hp -= dealt` inside applyDamage; exactly three `.hp -=` lines (victim, mine, decoy); the hp-increase whitelist of 9 sites; one setShield caller; plus the fixed order HUNKER → ARMOR → AP → shield, floor-of-one, storm exemption, friendly-fire refusal for every source. A source-scan test and a CONTRACT.
- **Bots never import `world.js`.** `server/src/__tests__/bots.test.ts:333` (ai/ never names observeSpectator, never imports world.js), `:344` (perception.js type-only), `:357` (BotWorldPort exact member set), `:245` (perception runs once per live bot per tick) — the test-run twin of the eslint fence.
- **Map determinism, zero transcendentals, zero I/O.** `shared/src/__tests__/map.test.ts:115/568/654/660` (deep-equal + FNV fingerprint, deterministic reseed chain, source scans of map.ts and islandShape.ts), `heightField.test.ts:78/87/94/362/375/383` (byte-identical per seed incl. production size; source scan; imports nothing outside shared/), `noise.test.ts:49/86/131/135`, `fog.test.ts:33/391`, `cloud.test.ts:35`, `coastIndex.test.ts:50/70/88` (indexed coast predicates `===` the brute ones — server/client pose parity), `nav.test.ts` (the nav grid IS the generator's navigability raster, byte-deterministic). New: `islandShape.test.ts` (the six helpers on synthetic fields).
- **`effectiveStats()` parity and byte-identical folds.** `shared/src/__tests__/stats.test.ts:77` (zero-card identity per class, now fully CONFIG-referenced), `:293` (effectiveStats(cls) ≡ (cls, []), junk ids fail closed), `:1283–1336` (every line folds; equipment copy 1 ≡ zero cards; consumables never move a derived number); `shared/src/__tests__/boons.test.ts:259/470/504–579` (targeted-path-only + fail-closed folds; a slot-only card leaves stats byte-identical; server incremental slot path = client replayed slotsWithCards, seeded property); `catalog.test.ts:672` (order independence); `server/src/__tests__/boons.test.ts:230/444/179` (room stats equal the pure fold after applyCard / redeploy / zero-card tick — the boon desync firewall); client/server sim parity `client/src/__tests__/prediction.test.ts` (57 tests: the predictor runs the same shared functions at the same 50 ms step, bit-for-bit against a reference server, replays under lagged acks).
- **Shared aim/arc geometry parity.** `shared/src/__tests__/aim.test.ts` (the client preview draws the shot the server fires; gunReachU the one promoted predicate), `client/src/__tests__/aimPreview.test.ts`, `weaponArc.test.ts:591/607` (client reach gate IS shared gunReachU; pointInLitZone shared), `firingArcs.test.ts`; `server/src/__tests__/combat.test.ts:656`, `broadside.test.ts:337/534/586`.
- **The class table** — the identity pin is DELETED (Eric 2026-10-22, ruling 5). `shared/src/__tests__/shipClasses.test.ts` keeps structure and relations (three classes with finite positive stats; drone size relations small → medium → large; hullBumper symmetry; droneSizeOf/droneHullOf round trip; regatta hues distinct).
- **The PV join gate** — `server/src/__tests__/colyseus018.test.ts` (the current PV is admitted; the previous, missing and next PV are refused — equality, not a floor; the 63-field schema cap; setMetadata full replace); the stale-client error says refresh ONCE, in `denials.test.ts`; the client half `client/src/__tests__/connection.test.ts` (pv rides queue join and solo create; exactly one version-gate presence test).
- **Intent enters only through `inputs.ts`.** `server/src/__tests__/inputs.test.ts` (finite-checked, clamped, malformed dropped silently; clampFireTime D1 trust boundary; per-client rate cap), `intentQueue.test.ts` (every press evaluated once in seq order, never latest-wins).
- **`STEP_ORDER` and the Colyseus-free core.** `server/src/__tests__/stepOrder.test.ts` (declared order identity, frozen, hulls-snapshot coupling), `contactDamage.test.ts:665`. NOTE (gap): "world.ts / match.ts have zero Colyseus imports" has NO guard anywhere — no source scan, no eslint rule; listed in (g).
- **Win check.** `server/src/__tests__/match.test.ts:891` (counts PARTICIPANTS; countdown counts HUMANS), `:1011`, `sinkingWindow.test.ts:500–595`, `abandon.test.ts:187`, `reconnect.test.ts:217/238/285` (a sinking hull holds the win check open; scripted-sink winnerId pins kept).
- **No friendly fire.** `server/src/__tests__/torpedoSelfHit.test.ts` (whole file), `combat.test.ts:281/313/921`, `weapons.test.ts:230/262/317`, `broadside.test.ts:695`, `flak.test.ts:202`; the ruled exception (your own mine pops under your own shell) `mineHp.test.ts:157`, `hitTargets.test.ts:396`, `weapons.test.ts:454`.
- **Wire privacy of self-private fields.** `server/src/__tests__/boost.test.ts`/`shift.test.ts`/`shieldBlock.test.ts`/`foulingShell.test.ts` (boostUntil, hunkerUntil, shield, fouledUntil never reach a contact, event, enemy or spectator frame), `boons.test.ts:475–513`, `xp.test.ts:325–361`, `upgrades.test.ts:881/1417–1450`, `matchRecord.test.ts:328`, `denials.test.ts` (owner-only, one tick), `dropoutPlumbing.test.ts` (dropoutSeed server-private).
- **Client one-way data flow and composition-root wiring.** `client/src/__tests__/frameOrdering.test.ts`, `loopContainment.test.ts`, the main.ts source scans in `primeRelease`, `killFeed:406`, `bounty:142/154`, `resumeWiring`, `sessionLock`, `requeue`, `weaponArc:759`, `countermeasure:121`, `hotbar:1239/1696`, `refitTooltipFit:613`; `helmGlobe.test.ts` "NO HUD or UI module reads the draft" (UX-DR57).
- **Ruled layout and look contracts.** `client/src/__tests__/lobbyModal.test.ts` "the modal NEVER changes size with state" (fixed geometry describe verbatim); `results.test.ts` action set exactly spectate + return (am. 30); `hullOverRadar:216–243` + `nameplatesAboveTerrain:364–392` (a delivered hull/plate is never softened by the sight boundary, am. 212); `dimFogSlide:170` (fogged wedges over the radial base, cycle 203); `intelWaypoint:407–450` (alive zoom-out stops at the radar disc above the HUD bar, MOVING fixtures, am. 208); alerts white-own / shared 1 Hz tint via `alertTint` (am. 181–183); `wake.test.ts:108` a decoy lays no wake by construction (am. 201).
- **Ads / analytics gating.** `client/src/__tests__/ads.test.ts`, `analytics.test.ts` — env-var gating, consent ordering, event-name wire tokens, CONSENT_KEY, GPC, no third-party origins.
- **The hook tripwire.** `.claude/hooks/protect-claude-md.test.sh` — all 266 assertions kept (131 cases × two modes). Flagged, not changed: the two "…deny says so" cases (lines 331–334) pin the phrase "protects itself" rather than a decision; the Edit-on-settings.json DECISION lives only there. The hook denies edits under `.claude/hooks/` as well (observed: the PreToolUse hook refused the edit), so the change is Eric's: replace the two `check_msg` cases with `check "Edit on .claude/settings.json" 2 …` (the chmod twin is already the deny at line 269). Hook assertions would go 266 → 262.

## (e) The known offenders — status verified 2026-10-22

| Retro item | Where | Status (verified against the code this run) | Disposition |
|---|---|---|---|
| Word-police test (epic-8 am. 211) | `client/src/__tests__/copyWords.test.ts` | ABSENT (deleted in 8.22) — confirmed by `ls` | Stays deleted; the VOCAB class applied to the rest of the client suite (112 whole tests + ~470 partial copy assertions removed); `noFishCopy.test.ts` and `noDrawPileCounter.test.ts` (word/identifier greps) removed under the same ruling |
| fogSmoke tautology (spec 8-0) | `server/scripts/fogSmoke.mjs` BAND phase | FIXED (commit d02b48f6; the unfiltered-window shell assertion with the fail-proof comment at :320–334 is in place) | Recorded as fixed; fogSmoke is a live socket smoke outside `npm run check`; its intermittent flake is 9.15's |
| 160-tick leader pin (am. 161(a)) | `server/src/__tests__/draft.test.ts` | FIXED — `sternChase(hull, 150, 1500)` at :152, `drafted > 750` at :158, `leaderDrafted === 0` at :159 (both classes) | Confirmed; kept |
| Perf pins that test geometry (am. 176, 223(f)) | `smokeScreen.test.ts` 200-puff `observe() × 20` | GONE — file deleted by 9.3 (3ba8c277) — confirmed absent | The six live heirs of the shape (the CLOCK pins) are deleted this story: shared map/island, server machineGunFlashCost/fogPerf/hitTargets, client fogField |
| Smoke fixtures (am. 224(f)) | `smokeScreen.test.ts` | GONE — same deletion | Recorded |
| Phantom height raster (am. 231(l)) | gunnery rig | FIXED — `botGunnery.test.ts:92–98` buildRig clears islands, installs `flatRaster(1000)`, `assertOpenOcean` requires visibilityTo > 0 at r 250/500/600 on 36 bearings; `gunnery.test.ts` is an emission-site suite with no perception reads | Confirmed; kept |
| "2,000 fuzz worlds" (specs 8-15 / 8-16) | `perception.test.ts:4387` `for (let world = 0; world < 20; world++)` | Shipped size is 20; spec 8-16:107 already said so; spec 8-15:123 corrected this story | Eric: stay at 20 (ruling 4); deferred-work entry RESOLVED |

The six CLOCK pins deleted under ruling 1, and where each budget is watched now:

| Pin | Cited | Watched now |
|---|---|---|
| `shared map.test.ts:591` production map < 1500 ms | the cycle-59 prototype (38/44 ms); re-based 250 → 500 (am. 42) → 1500 (7-8); no NFR | map generation is a one-time cost per match on the server; staging |
| `shared island.test.ts:334` 10k LOS sweeps < 1500 ms | "generous CI budget" (cycle 59) | the broadphase's behavior is pinned (inside / bounding circle / past broadphase); cost on staging |
| `server machineGunFlashCost.test.ts:107` best-of-5 < 50 ms | 8.15 AC (flash cost; am. 89(i)/103/109); failed under the 12-shard sim in 9-13's gate | the one-`mz`-per-stream-shell contract at `machineGunStream.test.ts:99–112`; tick cost on the harness readouts and staging |
| `server fogPerf.test.ts:119` observe()×16 < 50 ms, first-touch < 10 ms | 9.10 "make it performant" (TICK_BUDGET_MS) | the warm-repeat memo contract at `fogField.test.ts:363`; tick cost on staging |
| `server hitTargets.test.ts:554` 500 live mines < 50 ms | NFR23 | the batch-sim harness readouts and staging |
| `client fogField.test.ts:130` halo-square refresh < 50 ms | 9.10 "THE FIELD" re-plan (target < 2–3 ms) | refresh cadence at `fogField.test.ts:96`; frame cost on staging (never a Vite dev build) |

## (f) Anything a test exposed that looks like a production bug

None. Twenty-one readers and the gap-fill agent found no production defect. Recorded as behavior, not bugs: (1) the shared stub guard in `applySlotEffect` (`shared/src/sim/boons.ts:407`) keys on the equipment's owning line, so a stub line naming equipment a built line also owns would not be guarded — no real catalog has that shape; (2) `server/src/game/world.ts:1811` carries a stale comment "the fogPerf pin reads it" (the file is gone) — not edited (no production changes); 9.16 hygiene; (3) `zone.test.ts` had carried, as an in-test note, that an Eric ruling on NFR6 (the storm-sink tail vs "inside ~15:00") has been pending since 2026-08-23 — moved to `deferred-work.md`; (4) the two deleted `it.skip` wedge fixtures record a known bot behavior defect (the post-hold patrol helm steers a battleship back into the bay) — already a 9-13 residual; seeds carried to `deferred-work.md`.

## (g) GAPS — exported functions with no unit test of their own, and compositions with no integration test

Shared (ruling 6): FILLED this story — 27 symbols, +37 tests (see the gap-fill commit): `blockedWater`, `polygonFitLimit`, `orthoNeighbors`, `solidEscape`, `zoneCollapses`, `deriveMineRings`, `lineForEquipment`, `MINE_EQUIPMENT_IDS`/`isMineEquipment`/`mineKindOf`/`mineEquipmentFor`, `statEffect`/`doctrineEffect`/`BOON_STAT_PATH_SET`/`TOP_LEVEL_STAT_PATHS` (new `effects.test.ts`), `hullBumper`, `droneSizeOf`/`droneHullOf`, `REGATTA_HUES`/`REGATTA_NO_HUE`, `COVERAGE_WORD` (the rasterizer's word relation), the six `islandShape.ts` helpers (new `islandShape.test.ts`). No shared export remains without a direct test.

Server (listed, not filled — 9.16):
- ARCHITECTURE: "`game/world.ts` and `game/match.ts` have zero Colyseus imports" has NO guard — no source scan, no eslint rule. A one-test source scan in `world.test.ts` is the fill.
- `game/signals.ts`: `losClear`, `sightClear`, `sweepMayCrossWake` (only via perception integration).
- `game/equipment/guns.ts`: `burstPoint`, `muzzleOrTarget`, server `gunReachU`, `attenRangeFor`; `game/equipment/mines.ts`: `configTriggerRadius`, `minePlacePoint`, `dropBlocked`, `captiveTorpedo`, `contactBlastRadius`.
- `game/decoys.ts`: `decoyPoly`, `decoyTarget`; `game/match.ts`: `defaultTimings`; `game/spawn.ts`: `islandClearance`, `pickFleetAnchor`; `game/matchRecord.ts`: `handCount`; `accountWriter.ts`: `getGameVersion`, `setGameVersion`, `createAccountWriter`; `metrics.ts`: `metricsRoutes` (socket smoke only); `ai/`: `isClosing`, `lineBlocked` (oracle use only).
- Harness: `catalogReport.ts` (`buildCatalogAggregate`, `renderCatalogLines`, `renderFitSlices`, `renderOrdnanceLedger`), `catalogMetrics.ts` `CatalogCollector`, `report.ts` `renderComparison`, `stats.ts` `fmt`/`fmtSummary`; via composition only: `botReport` `buildBars`/`isBotWin`/`gunTierKey`, `botReadouts` collector + tallies, `botReadoutReport`, `poolReadouts` `shareOf`/`joinBots`, `botMetrics` `gunTierOf`/`emptyKillsByTier`, `overrides` `isTuneKey`/`validateTunableValue`.

Client (listed, not filled — 9.16):
- "a denied fire never spawns a local projectile" / "own ordnance is drawn from the wire" hold structurally (Projectiles.onShell's only caller is net/roomBindings.ts) with no test naming them.
- `net/connection.ts`: `wsEndpoint`, `arenaFromSeat`, `mapFromWelcome`; `input/keyboard.ts`: `rangeElement`, `textFieldElement`; `audio/context.ts`: "no AudioContext before a user gesture"; `ui/settings.ts` `bindingRows` ↔ `keyboard.ts` reconciliation (keyboard exports no table to relate to); `settings/store.ts` `scaleTierNote`.
- `render/`: `hudBarTopInset`, `drawGlobeBed`, `velocityTurned`, `isCoalescableFlash`, `drawWipeScrim`/`drawWipeDark`, `FiringUX`, `sprayPuffs`/`fieldPreview`/`fieldSpent` (cloudPaint), `puffTileRgba`, `buildMap`, `drawZoneGlow`/`zoneAlertTint`, `advanceWeedPhase`, `mergeSlices`, `paintSeed`/`cellNoise`/`noiseMul`/`FULL_TURN`, `terrainSample`/`surfPyramidLevel`/`surfSample`/`wakeOnlyField`, `clutterSample`/`wakeKeepFraction`/`cloudSample`, `setAggroFlashGate`; `stage/worstCase.ts` `runWorstCaseScene` (thin adapter); `ui/`: `isMatchEnd`, `isHost`, `myReady`, `goHome`, `makeStatTable`, `slotHeading`, `refitTooltipRowWidth`, `cardRegisterSize`/`monoCharWidth`/`widestToken`/`cardNameTracking`; `net/lobby.ts`: `isLobbyRefusal`, `lobbyCloseReason`, `resolveLobbyCode`; `app/privateLobby.ts` `lobbyHooks`; constants now unreferenced: `GUN_CHIP_LABELS`, `IGNORE_EPSILON_U/RAD`, `TIER_ARROW`, `COPY_LINE_IDS`, `TOOLTIP_FLOOR_VIEWPORT_H`, `FOOT_BOX_PAD`, `ARROW`, `FRESH_SCORE`, `GLYPH_R`.

Kept-but-brittle (for 9.16, not deleted): harness CLI error regexes enumerating all 25 tune families (`batchSim.test.ts:288`) and the GUN_IDS list (~:1497); client tests that LOCATE controls by `title` attribute or text ('ANALYTICS', 'ON'/'OFF' in settings; `title="Settings"`) because the production DOM has no data-* hook (a production change, out of scope); `contactsAggro.test.ts:103` waits a real `setTimeout(breakMs + 60)` because the driver reads `performance.now()` (inject the clock); `classSelect.test.ts:145/:56` pip anchor/fill literals that `:162` depends on; the weaponArc `weaponIdOf` test-local copy of main.ts's guard (:735).

## (h) PYRAMID — how the kept tests split, per workspace

- **shared** (49 files, 1167 tests): almost entirely UNIT — pure functions over plain objects on synthetic input (sim/*: stats fold, aim, arcs, collision, heightField, noise, map, zone ladders, wake rasterizer, radar shadow march, silhouette, fog toll, drafting, sinking, slow, boost, dropout, lifecycle). The INTEGRATION layer is the composition tests of `effectiveStats` over whole card multisets (order independence, byte-identical folds) and `generateMap` → `buildField` → nav grid determinism. No end-to-end layer belongs here. Every exported pure function now has a direct unit test.
- **server** (103 files, 2768 tests): UNIT on the pure helpers (inputs sanitizer, intent queue, lobby policy, matchmaking, xp/bounty/assist math, bot plot/policy/doctrine/gunnery/navigate, harness reducers) ≈ a third; INTEGRATION over `World.step` compositions (combat, weapons, mines, torpedoes, consumables, contact damage, drones, fleet waves, zone, match phases, reconnect/abandon/spectator, draft) and over `perception.observe` → `buildFrame` (perception, frames, goldenFrames, signals, radarWire, foghorn, spectator) ≈ two thirds; the END-TO-END layer is the headless socket smokes in `server/scripts/*.mjs` (matchSmoke, weaponsSmoke, fogSmoke; 9.15's), outside `npm run check`. Perf is no longer asserted here at all — the harness readouts and staging own it.
- **client** (135 files, 4062 tests): UNIT on pure helpers and formatters (math, poly, fade, motion, prediction fold, radar march/falloff/heatmap write rule, score fold, chromeBar/killFeed/bounty line composers, countdown formatters, tokens relations) ≈ a third; INTEGRATION over DOM mounts driven by state (home, class bay, results, lobby, queue, settings, upgrade menu, hotbar, HUD bar, globes, kill feed) and over the net → sim → render chain (roomBindings, connection, snapshots, frameOrdering, loopContainment, the Pixi adapters driven headlessly: radar, fog, ships, nameplates, wake, projectiles, effects) ≈ two thirds; the END-TO-END layer is the same socket smokes plus Eric on staging. Copy is no longer asserted anywhere; DOM contracts are structure, routing and composer equality.
- **hooks** (1 bash script, 266 assertions): decision tests of the CLAUDE.md tripwire run twice (python3 present / PATH starved). Two message-wording cases flagged for Eric (see (d)).

## The gate — one question: does any deletion remove a guard whose contract was real?

- **Fable, shared:** build-on-it, zero CONFIRMED. Five suspicions traced clean (the stats rewrites are input → output, not tautologies; no deleted barrel literal was a relation another fixture relied on; FR7 is retired — `deferred-work.md:1859`, spec-8-9:142; the islandShape/effects fixtures compute their expectations independently). Applied: every hull envelope finite and positive (`shipClasses.test.ts`); fleet waves strictly decreasing rather than pinned to halving (`barrel.test.ts`). Recorded only: `catalogCardCount() === Σ cap` and `fleetHullIds()` re-derive the body (harmless, the SHEET pin fixes the caps); the "retune deliberately" tripwires (TERRAIN_PARAMS literals, `radarCellU = 9`) are gone, so a change there now relies on review to trigger the PV bump.
- **Fable, server:** build-on-it, zero CONFIRMED. Chokepoint clean: frames/goldenFrames/snapshot untouched; perception's two deletions subsumed at the same observer and a tighter boundary; signals renames only; damageGate's two deletions exact duplicates. The upgrades `effectiveStats` rewrites are the room-stats-equal-pure-fold PARITY (`refoldCards`, world.ts:3565) paired with `not.toEqual(before)`; the stub-gate rewrite is an IMPROVEMENT (the catalog has no `stub: true` line, so the old `'missile'`/`'monitor'` tests hit the unknown-id refusal — vacuous); `firstGunPoolRaise` / the flak climb loop carry non-vacuity asserts; `appetiteFor` exercises both sides of `??`; the storm-sink bound is real; the batchsim `reloadCapScale` refusal still fails without the fold check.
- **Fable, client:** build-on-it with ONE CONFIRMED, patched: the settings key-reference describe had collapsed to a shape check and lost the story-7-3 contract that the in-game reference tells the truth about `input/keyboard.ts` — rewritten to derive the expectation from keyboard.ts's exported key tables (every advertised token bound; every bound slot/boost/refit key listed; never P / SPACE / CTRL), no wording pinned. Applied: both HUD columns fit the main row. Recorded only: effect-row ORDER in `cardStatRows` is no longer pinned (count and the reload pair are); the DESIGN.md ↔ CLIENT_CONFIG token identity is unguarded. Surfaced (pre-existing, production copy, Eric's call): the belt keys are 1–6 in `keyboard.ts` and on the hotbar, but `settings.ts:117` says "1 – 4 (+ NUMPAD)" and `how-to-play/copy.ts:106` lists 1–4 — keys 5 and 6 (DECOY BUOY, SUPERCAV TORPEDO) are undocumented; the new test relaxes that one range check with a comment until the copy is ruled.
- **Codex (`gpt-5.6-sol`), all three diffs:** ONE finding, CONFIRMED, verdict FIX-FIRST on it alone — `settings.test.ts:385`: the rewritten reconciliation test filters `CONSUMABLE_KEY_CODES` through the keys the row advertises before asserting coverage, so `Digit5`/`Numpad5`/`Digit6`/`Numpad6` bound in `keyboard.ts` with no row stay invisible. BOTH MODELS FLAGGED THE SAME THING (the Fable client hunter found the underlying copy discrepancy; Codex found the relaxed check that hides it): this is the deliberate, commented relaxation of the gate-C1 fix, kept so the suite is not red on a pre-existing production copy bug this story may not fix (AC 6). The real fix is Eric's ruling on the wording (Question 1 below); when the row says 1–6 the filter comes out and the check is strict. Agreement picture: Codex and Fable agree on every other hunk — no other finding from either.

## Questions for Eric (collected at the end, as the story asks)

1. **Belt keys copy.** `keyboard.ts` binds consumable keys 1–6 and the hotbar paints 1…6; the settings reference says "1 – 4 (+ NUMPAD)" and How-to-Play lists 1–4. Which is right? If 1–6: fix `settings.ts:117` and `how-to-play/copy.ts:106` (a quiet fix after your call), flip the howToPlay "no 5 key" test, and restore the relaxed consumable-range check in `settings.test.ts`. (Refit digits really are 1–4 only, so the two meanings diverge.)
2. **Per-rung ladder value tables.** `stats.test.ts` ~:560–970 / :1010–1041 and `catalog.test.ts` :299–334 / :503–533 walk every rung's authored numbers through `effectiveStats`. Kept as unit tests of the fold; under the class-table ruling's spirit they are CONST pins of catalog content. Delete them too?
3. **Hook test wording.** `.claude/hooks/protect-claude-md.test.sh:331–334`: two cases pin the phrase "protects itself" (the Edit-on-settings.json DECISION lives only there). The hook refuses edits under `.claude/hooks/`, so this is yours: replace both `check_msg` cases with `check "Edit on .claude/settings.json" 2 …` (the chmod twin is already a deny at line 269). 266 → 262 assertions.
4. **Privacy-policy pins.** `privacyPolicy.test.ts` keeps verbatim WHO RUNS THIS / CONTACT bodies and the required-disclosure sentences. Kept as legal content (and operator-identity suppression), not UI copy. Keep?
5. **NFR6.** The storm-sink tail vs "inside ~15:00" has been awaiting your ruling since 2026-08-23 (now a deferred-work entry, no longer a test comment).
