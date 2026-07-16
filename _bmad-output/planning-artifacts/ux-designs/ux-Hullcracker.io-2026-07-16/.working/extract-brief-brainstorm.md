# UX Extraction Digest — Hullcracker.io

Sources (all 2026-07-15, read 2026-07-16):
- **[Brief]** `briefs/brief-Hullcracker.io-2026-07-15/brief.md` (status: final)
- **[Addendum]** `briefs/brief-Hullcracker.io-2026-07-15/addendum.md` (status: final)
- **[Log]** `briefs/brief-Hullcracker.io-2026-07-15/.decision-log.md`
- **[Brainstorm]** `_bmad-output/brainstorming-session-2026-07-15.md` (93 ideas, complete)

Feeds: DESIGN.md (visual identity) + EXPERIENCE.md (IA, HUD, input, game feel, accessibility, journeys).

---

## 1. Target Audience, Stakes, Platform, Distribution

- **Primary audience [Brief]:** "browser multiplayer players, the agar.io / openfront.io demographic — a mix of casual and competitive, playing 5-15 minute sessions, allergic to installs, accounts, and grind." Design compass is **the 16-35 player**, but ads-first means the actual audience may skew younger: "the proven portal audience skews 10-15 and plays on desktop browsers (39% of Shell Shockers' traffic is school Chromebooks), and they're welcome — which makes low-end hardware performance a distribution feature."
- **Secondary [Brief]:** "World of Warships refugees — players who love naval gunnery feel but publicly resent the multi-month grind."
- **UX-critical dual-audience constraint [Brief, Risks]:** "a game tuned for 16-35 tension must still read instantly to a 13-year-old between classes" + client must stay light for school Chromebooks.
- **Platform [Brief]:** "web browser, desktop keyboard+mouse first; mobile/touch is out of scope for the beta." No Steam plans stated (Steam appears only in comparables). [Log]: desktop-only beta assumption stood through two review rounds, converted to plain statement.
- **Distribution/monetization [Brief]:** "ads-first, distribution-first" via portals (Poki, CrazyGames); "no install, no account, no grind." Cosmetics only as a later optional add-on under Paint-Not-Power. Model "held loosely."
- **Stakes [Log]:** "solo passion project heading toward public beta. Brief calibrated accordingly — honest and GDD-ready, not publisher-grade rigor." Solo dev (30-year engineer) + AI agents; "Scope discipline is the survival constraint" [Brief].

## 2. Tone / Fantasy / Brand Direction

- **Core fantasy [Brief]:** "You are a lone captain hunting — and being hunted — with imperfect senses, on an ocean that keeps getting smaller."
- **Positioning [Brief]:** "deliberately midway between Battleship and World of Warships — the board game's hidden-information soul... fused with the feel of arcade naval gunnery." Arcade-vs-sim: arcade feel, deduction seasoning — "Kinetics as Hero, Deduction as Seasoning."
- **Emotional contract [Brief]:** "Frantic to Play, Light to Hold — high tension inside the match, low stress around it."
- **Tone [Brief, Content & Direction]:** "playful naval — *Silly Is Sanctioned*: foghorns, named vessels, medals named after the fantasies, an omniscient death reveal that turns losing into learning." No narrative. [Brainstorm #75]: playtesters assumed absurd cosmetics ("toilet battleship, heart bullets"); "naval tension, playful wrapper."
- **Art/audio direction [Brief]:** "'CIC Tactical Display, Evolved' (per DESIGN.md) — phosphor blips, radar sweep, dark-water tactical readability; WebAudio tone system growing toward mood, not orchestration."
- **Positioning slogan [Brief, open question]:** "hunting with imperfect senses" is the claim, exact words TBD. "Deduction BR" was **rejected** by Eric as overclaiming [Brainstorm #91].
- **Stale-source caution [Log]:** existing DESIGN.md product-context section "still describes the retired turn-based hex game; only its audience/aesthetic sections treated as live input."

## 3. UI / UX / HUD Ideas from Brainstorming (with status)

Adopted-for-0.17 = bundled in the Information-Texture Package (#90) [Brief MVP item 1; Brainstorm #90]:
- **Listening Ring (#79) — adopted (v1 w/ torpedo pips):** "ring at truesight edge with directional pips for everything hydrophones hear. One HUD element carries the whole sonar layer." Cost: medium.
- **The "Hit!" Call (#19) — adopted:** "muffled boom + orange bloom through fog at impact; know you connected, not what/how badly."
- **Muzzle Flash Carries (#34) — adopted:** "firing lights the fog beyond truesight; shooting = being seen." Top-5 idea.
- **Wounded Ships Leak (#20) — adopted:** damaged ships trail smoke above the fog; hurt = trackable for everyone.
- **Fall-of-Shot Spotting (#21) — adopted (part of gunnery-feel trio):** "own splashes visible in fog → bracket-and-walk fire onto radar blips; real-time 'B-7'. Misses become information." Compass-center standout.
- **Torpedo-in-the-Water warning (#5) — adopted (feeds Listening Ring):** "hydrophone bearing-only warning (direction, not position)."
- **Bounty (#47) — adopted:** kill leader gets periodic radar bloom visible to all.
- **Foghorn (#74) — adopted:** "one-button emote, audible on hydrophones (a honk is a bearing)." Customizable tones later.
- **Mine proximity fuse (#81) — adopted (fix):** playtest found "mines read as bananas" (chase-deterrent only); needs proximity fuse and/or visibility radius (~truesight).
- **Endgame Guarantee (#48) — adopted (tuning):** "final circle smaller than truesight; endings always in full view."

Other UX-relevant ideas, deferred/open:
- **Omniscient Death Reveal (#56-r) — adopted in tone section of Brief, build status deferred:** "on death: zoom to full map, everything revealed, killing shot's trajectory drawn. Dying = finally seeing everything."
- **Go Down Shooting (#25) — deferred:** sinking state, "a few seconds listing with guns live." Top Clip-Test score.
- **Named Thresholds (#82) — deferred (roguelike stack):** "3 stacks in a category = qualitative bonus + a NAME ('Torpedo Boat' on the HUD)."
- **Match Medals (#72) — deferred, post-core:** "awards named for the fantasies (Needle-Threader, Houdini, Blindside, Down With the Ship); medals as teaching tools."
- **Name Your Vessel (#71) — deferred, nearly free:** "kill feed becomes naval theater."
- **After-Action Report (#53) — deferred:** "post-match story: track replay, spotted-vs-hidden, death moment."
- **Ready Room Targets (#61) — deferred (onboarding):** floating targets + sweep-watching prompts in the weapons-safe ready room.
- **Coach marks (#62) — pared/rejected:** replaced by "a simple 'How to Play' page (no accounts; game proved mostly self-teaching)."
- **Spectate routing — pared:** "v1 = just watch the match out."
- **Pennants (#73) — backburnered (accounts):** kill-streak flags visible in truesight; "a flex AND a confession; opt-in." Winner's Horn (#58) also backburnered.
- **Ping/marker system — deferred with teams (#50):** "information game + teams = ping is core." Teams explicitly out of beta MVP [Brief].
- **Drop Phase (#49) — deferred:** pick start location pre-match.
- **The Unwitnessed Build risk [Brief]:** "ten upgrade picks must become *felt* — audio, visuals, on-water behavior — or promise + growth is a spreadsheet." Direct UX mandate.
- **Anti-cheat law affecting UI (#89) — adopted:** "Lies Must Live on the Server" — scrambler/decoy blips indistinguishable on the wire; counter-intel never a client trick.
- **Stat simplification (#87) — open question:** Eric's underspecified note "simplify the stats a bit"; GDD must resolve.

## 4. Personas / Player Archetypes

No named personas exist. The nearest equivalents are the **three mined fantasies** [Brief, Emotional contract; Brainstorm #1-3] — moment archetypes, not player segments:
- **The Needle-Threader** — "a skill-shot torpedo through terrain finds an unaware target."
- **The Narrow Escape** — "reading converging torpedoes and helming the one survivable path — the moment that dominated every playtest."
- **The Dance** — "destroyer orbits and jabs; battleship tracks and swings haymakers." (Playtest: BB lost both dances, #15.)

Audience sketches usable as proto-personas [Brief]: (a) the 16-35 design-compass player; (b) the 10-15yo Chromebook portal player; (c) the WoWS refugee. GAP: no personas with names, goals, or journeys — the UX workflow must construct these.

## 5. Competitive / Inspiration References

From [Brief, References & Differentiation] (take/leave stated for each):
- **Battleship (board game)** — take: hidden information, calling shots into the dark. Leave: turns, grids.
- **World of Warships** — take: class fantasy, gunnery feel, naval tension. Leave: grind, damage minutiae, carrier/sub mistakes, class-invalidating spotting. Anti-pattern for carriers (#92): "being attacked by something you can't fight back against violates the escape fantasy."
- **Hades** — take: the promise/RNG contract ("the boon you picked never lies to you").
- **Risk of Rain** — take: stacking upgrades with named, felt thresholds; "power you can SEE on your character" [Brainstorm #93]. Named required reading.
- **Apex Legends** — take: kits as verb *focus*, not exclusivity. Leave: hero locks.
- **surviv.io / ZombsRoyale / OpenFront.io** — take: top-down BR structure, browser distribution, clip-able reveal moments, spectator thinking. Leave: loot-scavenging spine.
- **Mk48.io** [Addendum] — nearest competitor: existing visual/radar/sonar sensor model, but endless-arena and in maintenance mode.
- **Maelstrom (Steam, 2018)** [Brief/Addendum] — anti-pattern: "validated the fantasy and died anyway; slow oceans kill retention."
- **Shell Shockers** [Addendum] — distribution model reference (80-90% ads, 10-15yo Chromebook audience, school word-of-mouth).
- **Captain Sonar / Cold Waters / Modern Naval Warfare** [Addendum] — noted as the serious sonar-deduction lineage, desktop/tabletop, not browser.

## 6. Onboarding, First-Time Experience, Session Length, Retention

- **Match-Time Covenant [Brief, Pillar 4]:** "a match never costs more than ~15 minutes (guaranteed endgame at 12:00), and dying never costs more than a click to requeue — plus instant queue, no account required." [Log]: renamed from the 10-Minute Covenant; Eric: "not hard-married to game time — I want the best game"; ~15 min is the window. Honest edge [Brief]: "~13-15 minute matches sit at the top of the audience's session band."
- **Phased ring rhythm [Brief/Addendum]:** match reads in legible phases — "clear → next ring revealed → ring closes," fully closed at 12:00; "3-4 legible phases to every match — a named rhythm players can feel and plan around." 3×4 vs 4×3 split open for GDD. This is the candidate fix for "Quiet Dread minutes 1-3" (#66, open).
- **Onboarding [Brainstorm]:** "Solo-vs-Bots IS the tutorial and real waters at once" (#63 Mode Roster, roadmap); Ready Room Targets (#61, cheap-medium); coach marks rejected in favor of a "How to Play" page (#62) — "game proved mostly self-teaching."
- **Losing as learning [Brief]:** "an omniscient death reveal that turns losing into learning."
- **Retention levers:** "replayability carried by build variety and opponent behavior rather than content volume" [Brief]; unlockable classes (never power, #54) — "onboarding bonus: first match has 3 choices, not 9" — backburnered (accounts); Service Record (#51) backburnered; medals as teaching tools (#72) post-core.
- **Lobby honesty fixes [Brief MVP item 4]:** map scales from actual roster at countdown, 20-30 human targets, fill-or-timer with two-team minimum, no bot-fill in standard lobbies. Cold-start risk acknowledged.
- **Clip-ability as growth [Addendum]:** "radar-blip stalking, torpedo ambushes from fog, last-two-ships circle standoffs — map to the 'betrayal/reveal moment' format that worked for OpenFront."

## 7. Ship Classes, Visual Differentiation, Art Style

- **Current (prototype v0.16.0) [Brief]:** three classes — Destroyer (fast/light), Cruiser (balanced), Battleship (slow/heavy) — identical weapon fit; only hull dims/hp/kinematics vary.
- **Direction [Brief]:** "three classes at launch growing toward a jobs-not-hulls roster (Mine Layer is the strongest candidate; Carrier only enters if its counterplay is designed first)." [Brainstorm #35, Eric's pivot]: "Classes Are Jobs, Not Hulls — Picket / Torpedo Boat / Sub Hunter / Gunfire Support; jobs have pre-installed fantasies ('balanced' is not a fantasy)."
- **Beta MVP class scope [Brief]:** "one hand-built Cruiser loadout variant plus weighted upgrade offers" only. Slot taxonomy + launch class list = GDD open questions.
- **Class souls proposed [Brainstorm, deferred]:** Cruiser = Vulture (#32) or Duelist (#33); battleship "Tankiness = Permission to Be Seen" (#17); Hull × Refit 3×4 = 12 identities (#36); Captain Layer (#28, big).
- **Visual differentiation:** GAP — no explicit per-class visual-language spec exists. Nearest mandates: power must be visible ("power you can SEE on your character," #93; the Unwitnessed Build risk — upgrades need "audio, visuals, on-water behavior"), Named Thresholds display on the HUD (#82), Paint-Not-Power (#52) constrains cosmetics to "visual identity only," and freeform vessel names welcome (#71).
- **Art style [Brief]:** "CIC Tactical Display, Evolved" — phosphor blips, radar sweep, dark-water tactical readability. Procedurally seeded island ocean under a shrinking storm. Everything tactical is Pixi canvas; DOM only for chrome (menu/results/kill feed) [project convention].

## Explicit Gaps (do not invent)

- No named player personas; no accessibility discussion anywhere in the four sources.
- No visual-differentiation spec for classes; no color/typography/iconography decisions beyond "CIC Tactical Display, Evolved" pointing at DESIGN.md (whose product-context is stale per [Log]).
- No mobile/touch plans (explicitly out of scope); no Steam intent stated.
- Exact positioning slogan, kill-bonus ratio, ring-phase split (3×4 vs 4×3), stat simplification (#87), minutes-1-3 pacing, Eclipse dial / deck-merge mechanism — all open questions deferred to GDD [Brief].
- Session sources do not cover: settings/options UI, mute/audio controls beyond "mute-aware" tone system, colorblind support, input remapping.
