# Hullcracker.io — Development Epics

Companion to `gdd.md` (which carries the summary table and sequence). Sequence: **E1 → E2 → E3 → E6 → E4 → E5 → E7**. Numbers are design targets per the GDD; all tunable.

> **Reconciled 2026-08-21 (Story 7-6).** E1–E6 have shipped, and several scope lines below were superseded by later rulings. Where that happened the line is corrected in place and the supersession named; lines describing work that was **deferred** rather than done say so. `gdd.md` is the design authority for anything this file and it disagree about.

---

## E1 — The Armory

**Goal:** replace the playtest classes (hull-size variants, identical weapons) with three classes (beta roster re-scoped 2026-07-19: Torpedo Boat, Battleship, Mine Layer — gunboat cut) that each deliver a distinct playstyle and power fantasy through the slot grammar.

**In scope:**
- Slot grammar: universal gun + two special abilities (at least one a weapon) + one extra slot filled via the upgrade economy (consumable slots reserved, not built).
- Universal standard gun (same on every hull; short cooldown, basic damage).
- Three hull envelopes (size/speed/toughness/turning) for Torpedo Boat, Battleship, Mine Layer.
- Signature weapons: torpedo tubes; the Battleship's main battery; proximity-fused mines (rework per #81 — mine mechanics settled 2026-07-22 and amended since; the mine is now **click-aimed into a rear sector**, not dropped dead astern). *(The long-range cannon shipped and was then **replaced outright by the BROADSIDE BARRAGE** — a twin-sector beam weapon whose reach is the 5/8 rung of the eighths ladder, 2026-08-19.)*
- Signature abilities: speed boost (TB — inherited from the cut gunboat); star shells (BB); the Mine Layer's second special. *(It resolved to the decoy buoy on 2026-07-22, which shipped and was then **replaced outright by the RADAR BUOY** — a stationary, destructible sensor relaying its own radar returns, 2026-08-19. **The decoy role is gone from the game: nothing fakes a ship contact any more.**)*
- First-run class select: three cards, forced choice, no pushed default, TB pre-focused for keyboard flow (ruled 2026-07-19).
- Rethought firing arcs (per-class weapons → arcs usable in more situations while rewarding skill).
- ~~Resolve the precision-bonus open idea while tuning the standard gun.~~ **DROPPED** (Eric ruling 2026-08-21): the precision bonus was never built and is removed from the design.

**Out of scope:** deferred classes (Submarine bench-1, Carrier bench-2, Decoy Ship banked — the 2026-07-19 expansion blueprint), sensor-forward class (backburnered), consumables, boon catalog and off-class-ability offers (E2 — but the extra slot's plumbing lands here). The smoke screen was orphaned out of the class kits (2026-07-19) and earmarked as E2 boon-pool content, but it was never built — **deferred, not cut** (Eric, 2026-08-21).

**Dependencies:** none — first epic.

**Playable deliverable:** a lobby where picking any of the three classes yields a genuinely different ship at 0:00.

**High-level stories:**
1. Slot grammar + weapon-system registry supports per-class loadouts.
2. Universal standard gun tuned (numbers; the precision-bonus question was closed by dropping it, 2026-08-21).
3. Hull envelopes for the three classes.
4. Torpedo Boat loadout (tubes + speed boost).
5. Battleship loadout (main battery + star shells) — shipped as the long-range cannon, since replaced by the broadside barrage.
6. Mine Layer loadout (proximity mines + second special) — shipped as mines + decoy buoy, now mines + radar buoy.
7. First-run class select (three cards, no pushed default, TB pre-focused).
8. Per-weapon arc design pass.
9. Island-stuck collision bug (#64 playtest finding) fixed as part of the hull-envelope/collision work.

**Guardrails (compass vetoes):** no torpedo variety (variant mutations via E2 boons *replace* the slot's design, so the veto holds — 2026-07-19), no damage-control parties, no sectional damage.

---

## E2 — The New Economy (+ New Controls)

**Goal:** replace kill-banked stat-stacks with the XP/boon economy; make every build felt; fit the keyboard to the new game.

**In scope:**
- Passive XP tick (~1 level/min) + kill-only bonuses (opponent 1 level; PvE by tier — tier hooks land here, fleets themselves in E4). *(The PvE fractions were raised ¼/⅓/½ → **¼/½/¾** on 2026-08-16; every tier is a dyadic fraction so any fleet composition is exactly representable. Sinking the KILL LEADER pays +1 level on top of the opponent kill.)*
- Levels bank points; pre-rolled offers of 4 cards, never rerolled (ratified 2026-07-16). **SUPERSEDED IN MECHANISM: the count is right, the roll is not.** The category-first roll and the "~one choice per slot, slot 4 = equipment" mapping never shipped. An offer draws **4 different card LINES from the player's personal deck** — the universal Intel/Ship/Gun lines + one subdeck per carried equipment + one **acquisition card** per acquirable equipment not carried. **Caps are copy counts and rarity is physical scarcity**, not a dice roll.
- **Heal: RESOLVED, and it is not a card.** The refit window carries a permanent **DAMAGE CONTROL** rail (digit `5`) spending a banked level on an instant hull repair plus a short regen pool, always available and never competing for a card slot.
- Strip all 14 legacy stat upgrades. **DONE** — and done twice over: first by the v1 catalog, then by Eric's wholesale card rewrite of 2026-08-19.
- Boon catalog: Hades-hammer model — stat lifts + doctrine cards that change how a piece of equipment behaves (same slot, added verb; **doctrines are upgrades, never starting kit**) + acquisition cards for the extra slot. **The stat-lift vs build-defining tension is RESOLVED: commons are the stat ladders, rares are the nature-changers.** **Exclusivity is deleted** — doctrines are independent verb flags that stack, so PHOSPHOR+DAZZLE and CAPTIVE+PROP-FOULING are buildable. *(The smoke screen was earmarked here and never built — deferred.)*
- **Acquisition offers:** any acquirable equipment can appear in offers, filling the extra slot (anyone can grow torpedoes, mines, a broadside battery, star shells, a speed boost or a radar buoy). Taking one permanently opens that equipment's subdeck and burns every remaining acquisition card.
- Felt-build presentation: audio, hull visuals, on-water behavior per boon — "the build must be felt."
- **New keyboard controls:** rework bindings for telegraph, weapon-slot selection, and the spend window. Shipped as **`Tab` to open the refit window, `1`–`4` to pick a card, `5` for DAMAGE CONTROL** — there is no chord binding of any kind.

**Out of scope:** consumables; named thresholds / weighted decks (post-beta candidates — not committed); rare pulls (#84 — backburnered: catalog v1 is basics-first, anything springing from it comes later).

**Dependencies:** E1 (boons attach to the new armory).

**Playable deliverable:** level during a match, spend on boons that visibly and audibly change your ship, on controls that fit.

**High-level stories:**
1. XP tick + kill-bonus pipeline (participants vs PvE tiers).
2. Offer draw/bank/spend flow, plus the DAMAGE CONTROL rail alongside the cards.
3. Boon catalog v1 design + implementation.
4. Felt-build presentation layer.
5. Keyboard layout rework + denied-input feedback.
6. Drone-lobby batch-simulation harness for economy tuning (committed method: simulate before human playtests).

**QA note:** the Conservation-Law *tendency* ("power gains tend to emit observable signals") is a property-test candidate, not a design law.

---

## E3 — The Ring

**Goal:** replace the single-shrink storm with the phased ring structure and the redefined endgame.

**In scope:**
- **4 ring groups** × ~4 minutes; minute rhythm per group: (1) clear seas, (2) reserved supply-drop beat (a real structural no-op), (3) next ring revealed, (4) ring closes. *(Shipped as 3 groups; a fourth — **sudden death** — was added 2026-08-14.)*
- Groups 1–3 reach the Endgame Guarantee ring at **12:00**; group 4 collapses that ring concentrically onto its own centre from **15:00 to 16:00**, at which point the map is 100% storm. **~15:00 stays the estimate and the design contract; the structural ceiling is ~17:30** (fully closed at 16:00, plus ~87 s for the toughest hull to sink at storm damage).
- Endgame Guarantee ring: diameter = 2 standard truesight diameters. **Untouched by sudden death** — the collapse is geometry, and storm damage never ramps.
- Ring/zone HUD legibility (phases must be readable — "legible phases" is the pillar's word).

**Out of scope:** supply drops themselves (backburnered; slot reserved).

**Dependencies:** none hard; pairs naturally after E2 for full-match testing.

**Playable deliverable:** a full match with the designed pacing arc, ending in a forced-but-sensor-alive final fight.

**High-level stories:**
1. Phased zone timeline (shared sim) replacing single shrink.
2. Ring reveal/closure events + HUD.
3. Endgame ring sizing tied to truesight.
4. Sudden death — the fourth group's concentric collapse (added 2026-08-14).

---

## E6 — Information Texture

**Goal:** make mid-match fights legible through the fog — the sensor game's feedback channel. (Sequenced before E4/E5.)

**In scope:**
- ~~Listening ring HUD element (hull microphones): directional pips for engine noise, torpedoes in the water (#5 + #79).~~ **DEFERRED, not built** (Eric, 2026-08-21: *"very deferred. sonar might come back in the future, but radar is plenty deep enough"*). The shipped bearing surface is the **foghorn chevron**; mines and torpedoes instead became visible at the 3/8 **detect** rung of the eighths ladder.
- Hit call (#19): muffled boom + bloom confirming connection, not severity.
- Fall-of-shot spotting (#21): own splashes visible in fog; bracket-and-walk fire.
- Muzzle flash carries (#34): firing lights the fog beyond truesight.
- Wounded smoke (#20): damaged ships trail smoke above the fog.
- Foghorn emote (#74): one button; audible on hull mics — a honk is a bearing.
- The KILL LEADER (#47, formerly "the Bounty"): the captain with the most captain kills holds a public throne, worth extra XP to sink. **The Bounty Bloom was DELETED end to end** — the throne is **identity only** (a published name, a skull mark), with no radar paint, ring, bearing, range or area disclosure of the holder, ever.
- ~~Class-legible radar returns: blips carry ship outline (a battleship paints bigger) + speed/heading.~~ **RETIRED.** The pose-on-the-wire *silhouette* grammar was built, tried and removed: a return is a coverage footprint on a world-anchored radar lattice carrying **no class, speed, heading or ship id**. What shipped in its place is physics — the **eighths ladder** (one ruler for every sensor boundary, frozen at base for everyone), **height-aware radar shadows**, and **radar wakes** (disturbed water paints behind every moving hull, and outlives its ship).

**Out of scope:** sonar as a distinct third sensor tier (#4), active ping (#6 — sensor-class material, backburnered with the class).

**Guardrail:** this epic is where information-overload risk lives — noise must never bury the hunt; every feature here must pass a readability check on a busy screen.

**Dependencies:** E1 (weapons emitting the signals are the new armory's).

**Playable deliverable:** fights at radar range are readable, trackable dramas instead of silent HP exchanges.

**High-level stories:** one per feature above (6).

---

## E4 — The Living Ocean

**Goal:** a world that creates stories: weather, currents, prey, and dramatic deaths.

**In scope:**
- ~~Fog banks (#43-r): truesight shrinks inside; invisible to others' truesight; radar may still paint.~~ **DEFERRED, not cut** (epic-5 amendment 47, Eric: *"I have enough systems"* — the same ruling declared the systems layer complete). Design and reserved numbers stand.
- ~~Whirlpools: hidden hemisphere per ocean (N = CCW, S = CW); circular current carries hulls (with = faster, against = slower) and rotates heading; exit any side, no suction; rare.~~ **DEFERRED, not cut** (same ruling).
- Roving PvE drone fleets, three tiers (common small / uncommon medium / rare large by HP), basic gun on long cooldown, self-defense only, XP per E2 fractions; participants-only win check.
- Sinking window: ~5 s ritardando at 0 HP, guns live — go down shooting.

**Out of scope:** supply drops (backburnered), derelict wrecks as map objects (never a feature).

**Dependencies:** E2 (PvE XP fractions), E1 (fleet armament = standard gun variant).

**Playable deliverable:** matches where the ocean itself — weather, currents, prey — shapes the hunt.

**High-level stories:**
1. ~~Fog bank generation + perception integration.~~ **Deferred.**
2. ~~Whirlpool current/heading physics.~~ **Deferred.**
3. PvE fleet ships (3 tiers) + roving behavior + defensive AI.
4. Sinking window (movement ritardando, live guns, then reveal/spectate).

---

## E5 — Honest Lobbies & Modes

**Goal:** real matches, honestly filled; a bot mode that's actually a mode.

**In scope:**
- Standard BR: min 2 human captains, fill-or-timer, cap 20, zero bot-fill. Shipped as a **queue room in front of the arena**: captains pool there, one hard deadline arms at the second captain, and the arena receives a fully-formed roster — so there is no half-filled lobby to drop into.
- ~~Map scales from the actual roster at countdown.~~ **CANCELLED** (epic-6 amendment 11, Eric: *"We won't be scaling the map size"*). The ocean is one fixed radius for every roster.
- Solo vs AI mode: **one human captain + 19 AI captains**, minted straight from the home screen with **no queue at all** (a lobby of one has nothing to pool). PvE fleets are present in both modes. An AI captain is a full participant and **can win the match**.
- Combat-bot AI (a real design/implementation effort — distinct from PvE defensive AI): its only world knowledge is what the perception boundary hands it, and difficulty is expressed as **per-class priority profiles** (two per hull), not a ladder.

**Out of scope:** duos/trios + pings, ranked, accounts (post-beta).

**Dependencies:** E1 (bots need the class system), E4 helpful (PvE AI groundwork).

**Playable deliverable:** two honest modes; a solo player always has a real game one click away.

**High-level stories:**
1. Lobby rules rework (min/fill-or-timer/cap, no bot-fill) — shipped as the standard queue room.
2. ~~Roster-scaled map generation.~~ **Cancelled.**
3. Solo vs AI mode + combat AI.
4. Mode selection UX (the home screen's mode row).

---

## E7 — Launch Readiness

**Goal:** meet the beta's distribution bar.

**Re-scoped 2026-08-21 (Eric ruling):** *"I'm controlling my game and servers. no portals. I'm serving my own ads."* The game is **self-published at `https://hullcracker.io/`** on its own servers with its own ad units, so the portal SDK / portal-compliance leg of this epic is gone and the launch gate is the operator's own. The **1366×768 viewport floor survives independently** (NFR7 / UX-DR39) — it is simply no longer attributed to a Chromebook.

**In scope:**
- Performance pass: 60 FPS sustained on the **ratified reference device** — Eric's MacBook Pro 16,1 (2019) / Intel Core i7-9750H (epic-7 amendment 1) — full 20-ship match, all effects, at the 1366×768 viewport floor.
- Load pass: first click → playable in <~10 s.
- Advertising + consent handling, and the privacy policy.
- How-to-Play page (the onboarding surface — coach marks were pared to this).
- DESIGN.md update pass for the real-time era (flagged in Art & Audio) — **done in Story 7-6, 2026-08-21**.

**Out of scope:** cosmetics shop, accounts, portal distribution of any kind.

**Dependencies:** all prior epics (this is the ship gate).

**Playable deliverable:** the beta, live at `hullcracker.io`.

**High-level stories:**
1. Performance audit + optimization on the reference device.
2. Load-time audit + optimization.
3. Ads, consent, and the privacy policy.
4. How-to-Play page.
5. DESIGN.md refresh.
