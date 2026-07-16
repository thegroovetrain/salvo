# Hullcracker.io — Development Epics

Companion to `gdd.md` (which carries the summary table and sequence). Sequence: **E1 → E2 → E3 → E6 → E4 → E5 → E7**. Numbers are design targets per the GDD; all tunable.

---

## E1 — The Armory

**Goal:** replace the playtest classes (hull-size variants, identical weapons) with four classes that each deliver a distinct playstyle and power fantasy through the slot grammar.

**In scope:**
- Slot grammar: universal gun + two special abilities (at least one a weapon) + one extra slot filled via the upgrade economy (consumable slots reserved, not built).
- Universal standard gun (same on every hull; short cooldown, basic damage).
- Four hull envelopes (size/speed/toughness/turning) for Torpedo Boat, Battleship, Mine Layer, Gunboat.
- Specials: torpedo tubes; long-range cannon; proximity-fused mines (rework per #81); armor-piercing gun (resolve form: separate gun vs activatable buff).
- Others: smoke screen; star shells; decoy buoy; speed boost.
- Rethought firing arcs (per-class weapons → arcs usable in more situations while rewarding skill).
- Resolve the precision-bonus open idea while tuning the standard gun.

**Out of scope:** Hunter class (backburnered), consumables, boon catalog and off-class-ability offers (E2 — but the extra slot's plumbing lands here).

**Dependencies:** none — first epic.

**Playable deliverable:** a lobby where picking any of the four classes yields a genuinely different ship at 0:00.

**High-level stories:**
1. Slot grammar + weapon-system registry supports per-class loadouts.
2. Universal standard gun tuned (numbers + precision-bonus decision).
3. Hull envelopes for the four classes.
4. Torpedo Boat loadout (tubes + smoke screen).
5. Battleship loadout (long-range cannon + star shells).
6. Mine Layer loadout (proximity mines + decoy buoy) — server-side lies for the decoy.
7. Gunboat loadout (AP gun form resolved + speed boost).
8. Per-weapon arc design pass.

---

## E2 — The New Economy (+ New Controls)

**Goal:** replace kill-banked stat-stacks with the XP/boon economy; make every build felt; fit the keyboard to the new game.

**In scope:**
- Passive XP tick (~1 level/min) + kill-only bonuses (opponent 1 level; PvE ¼/⅓/½ by tier — tier hooks land here, fleets themselves in E4).
- Levels bank points; pre-rolled offers (3 boons, 3 distinct categories, never reroll). No heal option.
- Strip all 14 legacy stat upgrades.
- Boon catalog v1: Hades-style, qualitative, build-defining (dedicated design work inside this epic).
- **Off-class ability offers:** any class-specific ability can appear in offers, filling the extra slot (anyone can grow torpedoes/mines/smoke). Offer weighting is open tuning.
- Felt-build presentation: audio, hull visuals, on-water behavior per boon — "the build must be felt."
- **New keyboard controls:** rework bindings for telegraph, weapon-slot selection (basic/special/other), and the spend window. (Slot-selection keys coordinate with E1's grammar.)

**Out of scope:** consumables; named thresholds / weighted decks / rare pulls (post-beta candidates from the brainstorm — not committed).

**Dependencies:** E1 (boons attach to the new armory).

**Playable deliverable:** level during a match, spend on boons that visibly and audibly change your ship, on controls that fit.

**High-level stories:**
1. XP tick + kill-bonus pipeline (participants vs PvE tiers).
2. Offer roll/bank/spend flow without heal.
3. Boon catalog v1 design + implementation.
4. Felt-build presentation layer.
5. Keyboard layout rework + denied-input feedback.

---

## E3 — The Ring

**Goal:** replace the single-shrink storm with the phased ring structure and the redefined endgame.

**In scope:**
- 3 ring groups × ~4 minutes; minute rhythm per group: (1) clear seas, (2) reserved supply-drop slot (no-op at beta), (3) next ring revealed, (4) ring closes.
- Total closure ~12:00; match start-to-results inside ~15:00.
- Endgame Guarantee ring: final diameter = 2 standard truesight diameters.
- Ring/zone HUD legibility (phases must be readable — "legible phases" is the pillar's word).

**Out of scope:** supply drops themselves (backburnered; slot reserved).

**Dependencies:** none hard; pairs naturally after E2 for full-match testing.

**Playable deliverable:** a full match with the designed pacing arc, ending in a forced-but-sensor-alive final fight.

**High-level stories:**
1. Phased zone timeline (shared sim) replacing single shrink.
2. Ring reveal/closure events + HUD.
3. Endgame ring sizing tied to truesight.

---

## E6 — Information Texture

**Goal:** make mid-match fights legible through the fog — the sensor game's feedback channel. (Sequenced before E4/E5.)

**In scope:**
- Listening ring HUD element (hull microphones): directional pips for engine noise, torpedoes in the water (#5 + #79).
- Hit call (#19): muffled boom + bloom confirming connection, not severity.
- Fall-of-shot spotting (#21): own splashes visible in fog; bracket-and-walk fire.
- Muzzle flash carries (#34): firing lights the fog beyond truesight.
- Wounded smoke (#20): damaged ships trail smoke above the fog.
- Foghorn emote (#74): one button; audible on hull mics — a honk is a bearing.

**Out of scope:** sonar as a distinct third sensor tier (#4), active ping (#6 — Hunter material, backburnered with the class).

**Dependencies:** E1 (weapons emitting the signals are the new armory's).

**Playable deliverable:** fights at radar range are readable, trackable dramas instead of silent HP exchanges.

**High-level stories:** one per feature above (6).

---

## E4 — The Living Ocean

**Goal:** a world that creates stories: weather, currents, prey, and dramatic deaths.

**In scope:**
- Fog banks (#43-r): truesight shrinks inside; invisible to others' truesight; radar may still paint.
- Whirlpools: hidden hemisphere per ocean (N = CCW, S = CW); circular current carries hulls (with = faster, against = slower) and rotates heading; exit any side, no suction; rare.
- Roving PvE drone fleets, three tiers (common small / uncommon medium / rare large by HP), basic gun on long cooldown, self-defense only, XP per E2 fractions; participants-only win check.
- Sinking window: ~5 s ritardando at 0 HP, guns live — go down shooting.

**Out of scope:** supply drops (backburnered), derelict wrecks as map objects (never a feature).

**Dependencies:** E2 (PvE XP fractions), E1 (fleet armament = standard gun variant).

**Playable deliverable:** matches where the ocean itself — weather, currents, prey — shapes the hunt.

**High-level stories:**
1. Fog bank generation + perception integration.
2. Whirlpool current/heading physics.
3. PvE fleet ships (3 tiers) + roving behavior + defensive AI.
4. Sinking window (movement ritardando, live guns, then reveal/spectate).

---

## E5 — Honest Lobbies & Modes

**Goal:** real matches, honestly filled; a bot mode that's actually a mode.

**In scope:**
- Standard BR: min 2 human captains, fill-or-timer, cap 20, zero bot-fill.
- Map scales from the actual roster at countdown.
- Solo vs Bots mode: lobby filled with AI combatant bots (they pick classes and fight); PvE fleets present in both modes.
- Combat-bot AI (a real design/implementation effort — distinct from PvE defensive AI).
- Pure quick-play join for both modes.

**Out of scope:** duos/trios + pings, ranked, accounts (post-beta).

**Dependencies:** E1 (bots need the class system), E4 helpful (PvE AI groundwork).

**Playable deliverable:** two honest modes; a solo player always has a real game one click away.

**High-level stories:**
1. Lobby rules rework (min/fill-or-timer/cap, no bot-fill).
2. Roster-scaled map generation.
3. Solo vs Bots mode + combat AI.
4. Mode selection UX (menu).

---

## E7 — Portal Launch Readiness

**Goal:** meet the beta's distribution bar.

**In scope:**
- Performance pass: 60 FPS sustained on a low-end school Chromebook, full 20-ship match, all effects.
- Load pass: portal click → playable in <~10 s.
- Poki / CrazyGames SDK integration + technical compliance.
- How-to-Play page (the onboarding surface — coach marks were pared to this).
- DESIGN.md update pass for the real-time era (flagged in Art & Audio).

**Out of scope:** cosmetics shop, accounts, monetization beyond portal ads.

**Dependencies:** all prior epics (this is the ship gate).

**Playable deliverable:** the beta, live on a portal.

**High-level stories:**
1. Chromebook performance audit + optimization.
2. Load-time audit + optimization.
3. Portal SDK + compliance.
4. How-to-Play page.
5. DESIGN.md refresh.
