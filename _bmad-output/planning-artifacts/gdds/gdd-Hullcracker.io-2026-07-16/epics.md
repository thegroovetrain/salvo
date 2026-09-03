# Hullcracker.io — Development Epics

Companion to `gdd.md` (which carries the summary table and sequence). Sequence: **E1 → E2 → E3 → E6 → E4 → E5 → E7 → E8 → E9**. Numbers are design targets per the GDD; all tunable.

> **Deck model v3 added 2026-09-03.** E1–E7 have shipped (E7 closed 2026-08-27 with Story 7-7 deferred in full). Lines in E1–E7 that v3 supersedes are marked in place below, per the 2026-08-21 rule. **E8 (The Deck) and E9 (The Account) ship together as one unit before the traffic push** — Eric declined releasing the match-side rework without accounts (*"go big or go home"*). The E8/E9 seam is a build seam, not a release seam (ratified by Eric, 2026-09-03). Source: `_bmad-output/forge/deck-model-v3/forged-idea.md` (hardened from `brainstorming-session-2026-09-01.md`).

> **Reconciled 2026-08-21 (Story 7-6).** E1–E6 have shipped, and several scope lines below were superseded by later rulings. Where that happened the line is corrected in place and the supersession named; lines describing work that was **deferred** rather than done say so. `gdd.md` is the design authority for anything this file and it disagree about.

---

## E1 — The Armory

**Goal:** replace the playtest classes (hull-size variants, identical weapons) with three classes (beta roster re-scoped 2026-07-19: Torpedo Boat, Battleship, Mine Layer — gunboat cut) that each deliver a distinct playstyle and power fantasy through the slot grammar.

**In scope:**
- Slot grammar: universal gun + two special abilities (at least one a weapon) + one extra slot filled via the upgrade economy (consumable slots reserved, not built). **SUPERSEDED by v3 (E8):** slotless deck gun + three generic weapon slots empty at 0:00 + four consumable slots.
- Universal standard gun (same on every hull; short cooldown, basic damage).
- Three hull envelopes (size/speed/toughness/turning) for Torpedo Boat, Battleship, Mine Layer.
- Signature weapons: torpedo tubes; the Battleship's main battery; proximity-fused mines (rework per #81 — mine mechanics settled 2026-07-22 and amended since; the mine is now **click-aimed into a rear sector**, not dropped dead astern). *(The long-range cannon shipped and was then **replaced outright by the BROADSIDE BARRAGE** — a twin-sector beam weapon whose reach is the 5/8 rung of the eighths ladder, 2026-08-19.)*
- Signature abilities: speed boost (TB — inherited from the cut gunboat); star shells (BB); the Mine Layer's second special. *(It resolved to the decoy buoy on 2026-07-22, which shipped and was then **replaced outright by the RADAR BUOY** — a stationary, destructible sensor relaying its own radar returns, 2026-08-19. **The decoy role is gone from the game: nothing fakes a ship contact any more.**)*
- First-run class select: three cards, forced choice, no pushed default, TB pre-focused for keyboard flow (ruled 2026-07-19).
- Rethought firing arcs (per-class weapons → arcs usable in more situations while rewarding skill).
- ~~Resolve the precision-bonus open idea while tuning the standard gun.~~ **DROPPED** (Eric ruling 2026-08-21): the precision bonus was never built and is removed from the design.

**Out of scope:** deferred classes (Submarine bench-1, Carrier bench-2, Decoy Ship banked — the 2026-07-19 expansion blueprint), sensor-forward class (backburnered), consumables *(now E8)*, boon catalog and off-class-ability offers (E2 — but the extra slot's plumbing lands here; *the extra slot itself is retired by v3*). The smoke screen was orphaned out of the class kits (2026-07-19) and earmarked as E2 boon-pool content, but it was never built — **deferred, not cut** (Eric, 2026-08-21).

**Dependencies:** none — first epic.

**Playable deliverable:** a lobby where picking any of the three classes yields a genuinely different ship at 0:00. *(Shipped as fitted loadouts; under v3 every hull spawns gun-only and the 0:00 difference is the deck — E8.)*

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
- Levels bank points; pre-rolled offers of 4 cards, never rerolled (ratified 2026-07-16). **SUPERSEDED IN MECHANISM: the count is right, the roll is not.** The category-first roll and the "~one choice per slot, slot 4 = equipment" mapping never shipped. An offer draws **4 different card LINES from the player's personal deck** — the universal Intel/Ship/Gun lines + one subdeck per carried equipment + one **acquisition card** per acquirable equipment not carried. **Caps are copy counts and rarity is physical scarcity**, not a dice roll. **SUPERSEDED by v3 (E8):** the deck is a 40-card authored, hull-labelled deck; the acquisition card is retired (copy 1 of a weapon's ladder IS the weapon); the draw is equal-weight per card with no pity.
- ~~**Heal: RESOLVED, and it is not a card.**~~ The refit window carried a permanent **DAMAGE CONTROL** rail (digit `5`) spending a banked level on an instant hull repair plus a short regen pool. **SUPERSEDED by v3 (E8):** the `5` rail is retired and DAMAGE CONTROL is a stockable consumable card with the same 100 hp effect.
- Strip all 14 legacy stat upgrades. **DONE** — and done twice over: first by the v1 catalog, then by Eric's wholesale card rewrite of 2026-08-19.
- Boon catalog: Hades-hammer model — stat lifts + doctrine cards that change how a piece of equipment behaves (same slot, added verb; **doctrines are upgrades, never starting kit**) + acquisition cards for the extra slot. **The stat-lift vs build-defining tension is RESOLVED: commons are the stat ladders, rares are the nature-changers** *(v3 restates it without rarity: ladders carry the weapon and its tier bundles, add-ons are the nature-changers)*. **Exclusivity is deleted** — doctrines are independent verb flags that stack, so PHOSPHOR+DAZZLE and CAPTIVE+PROP-FOULING are buildable. *(The smoke screen was earmarked here and never built — deferred.)*
- **Acquisition offers:** any acquirable equipment can appear in offers, filling the extra slot (anyone can grow torpedoes, mines, a broadside battery, star shells, a speed boost or a radar buoy). Taking one permanently opens that equipment's subdeck and burns every remaining acquisition card. **RETIRED by v3 (E8):** no acquisition card, no extra slot, no burn rule.
- Felt-build presentation: audio, hull visuals, on-water behavior per boon — "the build must be felt."
- **New keyboard controls:** rework bindings for telegraph, weapon-slot selection, and the spend window. Shipped as **`Tab` to open the refit window, `1`–`4` to pick a card, `5` for DAMAGE CONTROL** — there is no chord binding of any kind. *(v3: `5` is retired; `1`–`4` with `Tab` closed fire consumables — E8.)*

**Out of scope:** consumables *(now E8)*; named thresholds / weighted decks (post-beta candidates — not committed; *authored decks are now E8*); rare pulls (#84 — backburnered: catalog v1 is basics-first, anything springing from it comes later).

**Dependencies:** E1 (boons attach to the new armory).

**Playable deliverable:** level during a match, spend on boons that visibly and audibly change your ship, on controls that fit.

**High-level stories:**
1. XP tick + kill-bonus pipeline (participants vs PvE tiers).
2. Offer draw/bank/spend flow, plus the DAMAGE CONTROL rail alongside the cards *(rail retired by v3 — E8)*.
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

**Out of scope:** duos/trios + pings, ranked (post-beta); accounts *(now E9)*.

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

**Out of scope:** cosmetics shop, accounts *(now E9)*, portal distribution of any kind.

**Dependencies:** all prior epics (this is the ship gate).

**Playable deliverable:** the beta, live at `hullcracker.io`.

**High-level stories:**
1. Performance audit + optimization on the reference device.
2. Load-time audit + optimization.
3. Ads, consent, and the privacy policy.
4. How-to-Play page.
5. DESIGN.md refresh.

---

## E8 — The Deck (v3)

**Goal:** every match is played on a **deck** — a 40-card, hull-labelled, legality-checked deck that fills three generic weapon slots and four consumable slots through the untouched `Tab` offer. Everything in this epic works **anonymously on the starter decks**: signing in (E9) changes what you keep, never what you can do here.

**In scope:**
- **Card model (A):** a weapon is one ladder line (copy 1 = the weapon at base, fitted into a weapon slot; copies 2–5 = authored tier bundles) plus separate one-copy add-ons (tubes, doctrine verbs) drawable at any time and holdable ahead of the weapon. Universal lines (HULL, SPEED, COOLDOWN, SWEEP, BARREL/TURRET) are ladders on the same rule. **Copies = tier ceiling.** Direction (not yet a lock): add-ons target a weapon family (tag) — e.g. ACOUSTIC HOMING on light and heavy torpedoes, which is legal now that the torpedo-variety veto is narrowed to within-a-weapon (Eric 2026-09-03, GDD note 17). The acquisition card and its "taking one burns the rest" rule are retired.
- **The catalog is hull-agnostic; nothing is class-locked.** The catalog's v3 contents (lines, tier bundles, the consumable set) are Eric's authored document — this epic builds the model and the hooks the catalog plugs into.
- **Legal deck**, server-checked once at queue and frozen there. Two composition rules (Eric 2026-09-03): exactly 40 cards (final for launch, Eric 2026-09-03; CONFIG dial, band test dropped) and no more than three lines that fit an equipment slot. Ownership bounds the rest (every card unlocked; a line has only its existing copies — 5 ladder / 1 add-on / a consumable's own authored count (Eric 2026-09-03, GDD note 18)). No other composition requirements (gunboat and zero-heal decks are legal). **Starter decks** per hull are ordinary decks passing the same rules against a fresh account.
- **Draw rule: equal weight per card.** No rarity weighting, no class weighting, no pity (the 2026-07-30 soft pity is retired). A card leaves the deck when taken. Exhaustion legal but rare. A **draw-pile counter** on the HUD (Eric: "Yes").
- **Slot grammar:** the slotless universal **deck gun**; **three generic weapon slots** (`Q`/`E`/`R`), empty at 0:00, one fixed arc per weapon; a deck carries **at most three equipment lines**, so slots never overflow and there is no replace flow (Eric 2026-09-03, closing GDD note 13); **swap cheese is a NEVER**; **the slot keeps its clock across replacement**.
- **Four consumable slots**, keys `1`–`4` with `Tab` closed (default, Eric 2026-09-03; rebindable controls are a maybe, out of scope here): a consumable leaves the deck on pick; full slots grey the card and the **server refuses the pick** (no instant-use); slot contents are server-owned ship state (reconnect-safe). Engine supports **key-fires** and **key-primes-then-click-fires**; the card face says which. Content open (Eric's categories: Denial, Intel, Ordnance; Terrain to keep in mind).
- **Heal as a card:** the `5` key and the DAMAGE CONTROL rail are retired; DAMAGE CONTROL is a stockable consumable with the shipped 100 hp effect, 5 copies per starter deck to start (harness-tuned per hull), scarcer than today and never renewable. "Heals during the collapse" closes by construction. *(The fate of the shipped free per-level auto-heal is an Eric call — GDD open note 14.)*
- **The opening:** spawn with the deck gun only; **level zero at countdown start**; **mulligan** = one free redraw of that offer, countdown only (the single exception to never-reroll); **weighted first draw** guarantees ≥1 actively usable card (a consumable, or any equipment's Tier I); the mulligan redraw carries the same guarantee. Pinned-card spawn is a later CONFIG-gated experiment.
- **Bots:** each of the six profiles carries an authored 40-card deck in the player format, legality-checked at room build; a **total** consumable-tactic table (no consumable ships without a bot use rule); the batch-sim harness runs **authored** and **random-legal** deck arms and pins the bars: starter-vs-veteran win band, torpedo-less TB, pure gunboat, heal-take rate, levels wasted, one-copy appearance rate.
- **Results:** the player's own deck — brought, drawn, taken. Enemy decks are shown to no player. Every deck in every match is recorded server-side (the record itself is E9's store; E8 emits it).

**Out of scope:** the account, the deck editor, unlocks, match history UI (E9); the catalog's contents (Eric's document); positional slots / per-slot arcs, pinned-card spawn as default, passive per-level heal, draft mode, enemy-deck reveal, ghost decks (parked); deck codes (an unruled proposal); a hand, merging, storefront verbs, rarity weighting, soft pity, instant-use-on-pick, class-locked / deck-manipulation / hull-mod / salvage cards, discard/reshuffle (rejected).

**Dependencies:** E2 (the `Tab` offer and XP pipeline it builds on), E5 (bot profiles), the Eric-authored catalog v3.

**Playable deliverable:** pick a hull, sail its starter deck: spawn gun-only, mulligan the opening offer during the countdown, draw weapons into `Q`/`E`/`R`, stock and spend consumables on `1`–`4`, heal from a card, and see the deck you played in results — identical rules for humans and bots.

**High-level stories:**
1. Card model (A) + hull-agnostic catalog hooks (ladder copy 1 fits the weapon; add-ons targeting a family tag as the direction on file; copies = tier ceiling).
2. Legal-deck rules, CONFIG size dials, starter decks per hull; legality check + freeze at queue (starter deck for anonymous captains).
3. Equal-weight draw, card-leaves-on-take, exhaustion handling, draw-pile counter.
4. Slotless deck gun + three generic weapon slots: fit-on-draw, the three-equipment-lines deck rule, slot clock, swap-cheese guard.
5. Four consumable slots: server-owned state, full-slot refusal in the offer, both activation paths, keys `1`–`4`.
6. Heal as a consumable card; retire `5` and the DAMAGE CONTROL rail.
7. The opening: gun-only spawn, level zero at countdown, mulligan, weighted first draw; pinned-card experiment behind CONFIG.
8. Bot decks + consumable tactics + harness arms and pinned bars.
9. Own-deck results view (brought / drawn / taken) and the server-side per-match deck record.

**Guardrails:** the `Tab` offer is untouched (no hand, no second clock, no storefront); the passive XP tick stays the anti-snowball floor; the master perception invariant keeps exactly six exceptions; never invent a card, a number or a consumable without Eric.

---

## E9 — The Account (v3)

**Goal:** sign in and **keep things** — decks, unlocks, tokens, match history — without changing anything a captain can do inside a match. Ships as one unit with E8, before the traffic push.

**In scope:**
- **Two states, no guest tier.** Anonymous = today's game on the hull's starter deck, nothing stored. Signed in = decks, unlocks, tokens, history.
- **OAuth only** (Google, Discord), minimal scopes: the account holds a provider + an opaque subject id — never an email, name or password. 13+ by provider terms, not verified. **Privacy-policy delta: one paragraph** on signed-in accounts.
- **The first persistent store and first non-ops HTTP API** (sign-in callback, deck editing, history). Architecture belongs to `gds-game-architecture`; it must not pre-empt the deferred Story 7-7 split.
- **Deck editor** — Eric: *"It's probably a deckbuilder."* An author decides how many copies of each line to run — Eric: *"only taking up to Tier III… might be a planned strategic choice."* Several decks per hull (*"fine. Data is cheap"*); the client selects a deck at join (#60) and the server loads and validates it. Deck slots may later be rewarded or monetized (#80) — a slot is not power.
- **Unlocks:** a whole line per unlock (all tiers of a ladder / the one copy of an add-on), flat price [DRAFT], any order; all three hulls and starter decks unlocked day one; the starter decks' cards are the initial unlock list. Variety, never power.
- **Earn:** account level → one unlock token per level; XP per match **placement-scaled**, **Solo vs AI discounted**. Both dials derive from one OPEN intent number — matches to unlock the launch catalog — shipped as a CONFIG dial with no placeholder (Eric 2026-09-03), set once the catalog's line count is known and tuned from live history. Catalog breadth target ≥ ~100 cards' worth per hull (confirmed 2026-09-03).
- **Match history:** the player's own deck per match (brought / drawn / taken); every deck in every match stored server-side for Eric's metrics — the meta dashboard is the live harness.

**Out of scope:** guest accounts, own email/password storage, deck names (rejected); enemy-deck reveal, ghost decks (parked); deck codes (an unruled proposal); ranked, teams, cosmetics shop (post-beta).

**Dependencies:** E8 (the deck the account keeps), `gds-game-architecture` (the store), E7's privacy policy (the delta lands on it).

**Playable deliverable:** sign in with Google or Discord, build a deck for a hull, bring it to a match, earn a token, unlock a line, and read your own deck back from match history — while an anonymous player next to you sails the same rules on a starter deck.

**High-level stories:**
1. OAuth sign-in (Google, Discord; minimal scopes) and the two-state account posture.
2. The account store + non-ops HTTP API (per the architecture phase).
3. Deck editor (several decks per hull; legality feedback against unlocks).
4. Deck selection at join (#60); server load + validate + freeze at queue.
5. Unlock tokens: account level bar, placement-scaled / Solo-vs-AI-discounted XP, whole-line flat unlocks; the intent-number CONFIG dial.
6. Match history (own deck) + the server-side all-decks record and Eric's metrics view.
7. Privacy-policy paragraph for signed-in accounts.

**Guardrails:** store very little (provider + opaque id); signing in never changes what you can do in a match; unlocks are variety, never power (the starter-vs-veteran win band is the measurement).
