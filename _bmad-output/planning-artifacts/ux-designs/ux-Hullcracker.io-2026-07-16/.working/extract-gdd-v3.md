# Extract — v3 UX-relevant facts (deck model v3 + catalog v3 + the account)

**Purpose:** input to the UX spine update. Scope is ONLY the v3 material: the deck model v3 (forge 2026-09-02/03), catalog v3 (2026-09-09), E8 The Deck, E9 The Account. Pre-September-2026 shipped material appears only where v3 changes it.

**Sources read in full** (citations below use `file § heading` or `file L<n>`):
- `gdd.md` — `_bmad-output/planning-artifacts/gdds/gdd-Hullcracker.io-2026-07-16/gdd.md` (updated 2026-09-09, 537 lines)
- `epics.md` — same dir, **E8** (L204–246) and **E9** (L249–277)
- `catalog-v3.md` — same dir (Eric-authored, 2026-09-09; §1 sheet L22–52, §2 baseline L65–99, §3 rulings R1–R44 L101–186, §4 stat sheets L188–251, §5 carried forward L253–259)
- `deck-forge` — `_bmad-output/forge/deck-model-v3/forged-idea.md` (Locked 1–12 L7–18; Carried L21; Rejected L24–25; Open L28)
- `identity-forge` — `_bmad-output/forge/identity-fork/forged-idea.md` (pre-v3; only carried constraints extracted, with supersessions noted)

Convention: **Eric's words are quoted verbatim** where the source marks them (italics / quotes). `[DRAFT]` / `[D]` = a number Eric has not confirmed (harness-tuned). "Facilitator reading" = a non-Eric interpretation flagged as such in the source.

---

## 1. SURFACES v3 requires

### 1A. On the water

| # | Surface | Fact | Source |
|---|---|---|---|
| 1.1 | **Weapon slots Q/E/R — empty at 0:00** | "Three generic weapon slots (`Q` / `E` / `R`) — empty at 0:00 and filled by the deck: taking the first copy of a weapon's line fits that weapon into an open weapon slot." Slots are generic — "there are no positional mounts and no per-slot arcs (parked; Eric: *'I don't think we'll need the mechanic'*) — and each weapon carries one fixed firing arc of its own." | gdd.md § Slot grammar (L133); epics.md E8 L215 |
| 1.2 | **Slotless deck gun** | "The deck gun — universal and slotless: every hull carries the same standard gun … Short cooldown, basic damage, available to use most of the time. It and the Shift boost … are all anyone holds at spawn." "the gun is always selected and needs no key". | gdd.md § Slot grammar (L132); § Controls (L192) |
| 1.3 | **Spawn state** | "Every hull spawns with the deck gun and the Shift boost only — nothing from the deck." "the three weapon slots and four consumable slots are empty until the deck fills them." | gdd.md § The opening (L326); § Fitted loadouts (L202); deck-forge Locked 6 |
| 1.4 | **Four consumable slots, keys `1`–`4`** | "Four consumable slots on every hull, keyed `1`–`4` with the refit window closed". "stocked from the deck (your 40 authored cards plus the match's hidden pool of 10), spent by key." | gdd.md § Consumables (L172); § Slot grammar (L134); epics.md E8 L216 |
| 1.5 | **Draw-pile counter on the HUD** | "The HUD carries a draw-pile counter (`23 LEFT`, counting down from 50) — Eric: *'Yes.'*" Deck state is server-private and "the draw-pile count is all it leaks". Counter counts from 50 (40 authored + 10 pool). | gdd.md § Deck model v3 (L167); § Structural anti-cheat (L400); epics.md E8 L211, L214; catalog-v3.md R4 (L113) |
| 1.6 | **Shift boost (universal ability, no card)** | "Every hull has a speed boost on `Shift`: +25% of the hull's max speed for 10 s on a 20 s cooldown (boosted TB 56.25 / ML 50 / BS 43.75 u/s — hull-scaled, so the class ordering holds under boost; 15 s cooldown under a maxed RELOAD ladder)." "[DRAFT: the boost numbers are first-pass and harness-tuned.]" No HUD readout is specified. | gdd.md § The Shift boost (L144); catalog-v3.md R7 (L118), R9 (L186), §4 (L201); epics.md E8 L212 |
| 1.7 | **Level zero + first offer during countdown** | "Level zero is granted at countdown start, so the first offer opens during the 10 s countdown and can be taken before the water goes live, or held." | gdd.md § The opening (L326); epics.md E8 L218 |
| 1.8 | **Mulligan (countdown only)** | "Mulligan: one free redraw of the level-zero offer, only during the countdown — the single declared exception to 'reopening never rerolls', at a moment nobody is on the water. The redraw is still the level-zero offer, so it carries the same usable-card guarantee." No key/control for the mulligan is named in any source. | gdd.md § The opening (L326); deck-forge Locked 6; epics.md E8 L218 |
| 1.9 | **Tab offer (shape untouched; contents change)** | "Each level opens the refit window (`Tab`) on a pre-drawn offer of 4 different card lines from your own deck — your 40 authored cards plus the match's pool of 10 (drawn at earn-time; reopening the window never rerolls — ratified at 4 choices during the UX phase, 2026-07-16). One level buys any one card." "The Tab offer is untouched by v3 (Eric's first lock): no hand, no second clock, no storefront — merge, lock, sell and refresh are all dead." What changes on the surface: the card kinds shown (weapon ladder copies incl. tier I = the weapon, add-ons, consumables, deck-gun ladders), greyed full-slot consumables (§3.1), the card face states activation path (§2.11). | gdd.md § Upgrade economy (L160); § Spending (L324); deck-forge Locked 1 |
| 1.10 | **Heal as a card; `5` key + DAMAGE CONTROL rail retired** | "The `5` key and the permanent DAMAGE CONTROL rail are retired. DAMAGE CONTROL becomes a stockable consumable — HULL REPAIR in catalog v3: the shipped effect is unchanged (100 hp — 50 instant plus 50 pooled at 5 hp/s)". | gdd.md § Healing (L184); § Controls (L192); epics.md E8 L217, story 6 (L234) |
| 1.11 | **Results: own deck — brought / drawn / taken** | "results also show the deck you brought, drew and took — your own, never an enemy's". "Results: the player's own deck — brought, drawn, taken. Enemy decks are shown to no player." Results modal's two actions remain SPECTATE and RETURN TO PORT; "there is no instant re-queue". | gdd.md § Win/Loss (L106); § Account progression (L328); epics.md E8 L220, story 9 (L237); deck-forge Locked 11 |
| 1.12 | **SMOKE SCREEN on the water** | "a trail laid astern for 5 s; each puff lives 30 s, starts at r40u and slowly expands to r60u (the rate is [DRAFT]). Blocks sight only — radar is unaffected; a hull inside or behind the smoke is not sighted." [DRAFT — facilitator assumption: a puff hides its own occupant too.] "smoke is an occluder, not a disclosure." Returns from its 2026-08-21 deferral. | gdd.md § Consumables (L176); § Smoke (L212); § Structural anti-cheat (L400); catalog-v3.md R38 (L172) |
| 1.13 | **CHAFF on the scope** | "bursts at your own position: 10 fake radar returns in r120u around you for 15 s, hiding your true echo among them (the brainstorm's fire-to-the-click delivery is not taken)". Fakes are server-generated, "wire-identical to real ones" — "lies must live on the server". Inherits the deleted jamming buoy's machinery. | gdd.md § Consumables (L177); § Radar returns (L152); catalog-v3.md R39/R41 (L174) |
| 1.14 | **DECOY BUOY on the water** | "dropped astern within the mine's rear arc; 50 hp, lasts until destroyed (no lifetime). Homing ordnance retargets onto it, and it physically blocks anything — any torpedo or missile that runs into it detonates there, homing or not. An undying buoy is a permanent hitbox, so the deck gun or a flak burst can clear it." [DRAFT — facilitator reading: owner's ordnance NOT exempt.] | gdd.md § Consumables (L178); catalog-v3.md R36 (L168), R43 |
| 1.15 | **SHIELD BLOCK** | "absorbs the next 100 hp of damage for 10 s; an unused shield expires at 10 s." [DRAFT — facilitator assumption: stops all damage sources, storm and burn included.] "SHIELD BLOCK absorbs, it does not reduce." No visual is specified. | gdd.md § Consumables (L175); § Flat damage model (L258); catalog-v3.md R37 (L170) |
| 1.16 | **New weapon on-water presentations** | Monitor Gun: "the flight is shown as an arc but resolves at the clicked point like the deck gun, and terrain never stops it." Machine Gun: "Click-and-hold inside its arc; a stream of small direct-hit shells (no burst)." Horizontal Missile: "flies flat … islands BLOCK it". Flak: "one shell to the clicked point bursting in a wide, weak blast that hits hulls AND ordnance." | catalog-v3.md R30 (L158), R20 (L148), R29/R42 (L178), R27 (L156); gdd.md § Flight rules (L256) |
| 1.17 | **Mines: no live cap; shoot-any-spotted-mine** | "shooting any mine you can see detonates it — the owner-only rule is widened to every spotted mine (Eric, 2026-09-04: *'Not a bad idea.'*); no live cap — the per-player cap and its oldest-eviction are removed (R23): a mine exists until triggered or destroyed". | gdd.md § Mine Layer kit (L216); § Weapon behavior laws (L245); catalog-v3.md R23 (L152) |
| 1.18 | **Denied-fire feedback (extended to placements)** | "Denied fire is authoritative as well as predicted: the server sends a self-private denial signal (out-of-arc / no-ammo / cooling / blocked placement) so denial feedback is never silent — including island- or boundary-blocked placements, which are refused without spending the charge." | gdd.md § Arcs (L254) |
| 1.19 | **Wake drafting** | "Riding inside another ship's wake gives a small speed lift — any hull's wake, magnitude *semi-realistic* [DRAFT — the facilitator's 'a few percent' is a placeholder, not a number; Eric sets the lift and its radius]". "Wake trails merge but both hull echoes stay on the scope, so it is not a hide mechanic." Eric: *"Interesting! I like that, we can fuck with that a bit."* No card, no HUD surface specified. | gdd.md § Wake drafting (L146); epics.md E8 L212 |
| 1.20 | **Kill feed / KILL LEADER unchanged by v3** | "The KILL LEADER (#47, formerly 'the Bounty') … identity only. Their name is published to every client and marked with a skull wherever it appears, and sinking them pays a bonus level." Bots are "eligible for the KILL LEADER throne". | gdd.md § Balance laws (L330); § Solo vs AI (L265) |

### 1B. In port (home / account)

| # | Surface | Fact | Source |
|---|---|---|---|
| 1.21 | **Two-state home: anonymous vs signed in** | "Two states and no guest tier. Anonymous = today's game: open the URL, pick a hull, sail its starter deck; nothing is stored. Signed in (OAuth only — Google or Discord, minimal scopes…) = your decks, unlocks, unlock tokens and match history. *Signing in changes what you keep, never what you can do in a match.*" | gdd.md § Accounts (L301); § Platform (L407); epics.md E9 L254; deck-forge Locked 8 |
| 1.22 | **OAuth sign-in (Google, Discord)** | "OAuth only (Google, Discord), minimal scopes: the account holds a provider + an opaque subject id — never an email, name or password. 13+ by provider terms, not verified." Placement on the home screen is NOT specified. | epics.md E9 L255, story 1 (L269); gdd.md L301 |
| 1.23 | **Deck editor** | "Deck editor — Eric: *'It's probably a deckbuilder.'* An author decides how many copies of each line to run — Eric: *'only taking up to Tier III… might be a planned strategic choice.'* Several decks per hull (*'fine. Data is cheap'*)". Story 3: "Deck editor (several decks per hull; legality feedback against unlocks)." Layout undesigned. | epics.md E9 L257, story 3 (L271); gdd.md § Account progression (L328) |
| 1.24 | **Deck selection at join** | "the client selects a deck at join (#60) and the server loads and validates it." "edits made after queuing apply to the next match." Anonymous captains get "the hull's starter deck". | epics.md E9 L257, story 4 (L272); gdd.md § Matchmaking (L299) |
| 1.25 | **Account level bar** | "An account level bar fills with XP earned per match — placement-scaled, and discounted in Solo vs AI (Eric: *'probably, just not as much'*) — and every account level grants one unlock token." How it reads is unspecified. | gdd.md § Account progression (L328); epics.md E9 story 5 (L273) |
| 1.26 | **Unlock tokens / whole-line unlocks** | "A token unlocks a whole line (every copy up to its catalog cap — 5 for an equipment line, 4 or 5 for a ladder, the one copy of an add-on) at a flat price [DRAFT — Eric: *'flat probably, idk'*], in any order: unlocks are variety, never power. All three hulls and their starter decks are unlocked from day one; the starter decks' cards are the initial unlock list". | gdd.md L328; epics.md E9 L258 |
| 1.27 | **Match history** | "Match history: the player's own deck per match (brought / drawn / taken); every deck in every match stored server-side for Eric's metrics — the meta dashboard is the live harness." | epics.md E9 L259, story 6 (L274); gdd.md L328 |
| 1.28 | **Privacy-policy paragraph** | "Privacy-policy delta: one paragraph on signed-in accounts." "The privacy policy grows by one paragraph on signed-in accounts." | epics.md E9 L255, story 7 (L275); gdd.md L407 |
| 1.29 | **Deck slots (count) as a visible thing** | "Deck slots may later be rewarded or monetized (#80) — a slot is not power." | epics.md E9 L257; gdd.md L328 |
| 1.30 | **Class select (retained, re-read by v3)** | "three cards, forced meaningful choice, no pushed default; the Torpedo Boat sits pre-focused for keyboard flow." v3: "the fantasies below are what each hull's STARTER DECK is authored to deliver … not a fixed fit; a signed-in captain may build any of them differently." | gdd.md § Ship classes (L116, L126) |
| 1.31 | **Home-screen modes: Solo / Solo vs AI, no queue for the latter** | "Modes at beta: **Solo** (standard BR — humans only, no bot-fill) and **Solo vs AI**". Solo vs AI: "reached straight from the home screen — with no queue at all". Bots carry authored 40-card decks "plus the match's pool of 10, like everyone". | gdd.md § Modes (L297); § Solo vs AI (L265) |

---

## 2. INPUT SCHEME facts

| # | Binding | Fact | Source |
|---|---|---|---|
| 2.1 | `Q` / `E` / `R` | "weapon-slot priming (`Q` / `E` / `R` — the gun is always selected and needs no key)". Slots empty at 0:00. | gdd.md § Controls (L192); § Slot grammar (L133) |
| 2.2 | Deck gun — no key | "the gun is always selected and needs no key". | gdd.md L192 |
| 2.3 | `Shift` | "`Shift` — the universal speed boost (every hull, no card; catalog v3 R7/R9)". "The Shift boost and the key-fired consumables aim nothing." | gdd.md L192; § Arcs (L254); catalog-v3.md R7 |
| 2.4 | `1`–`4` (Tab closed) = consumable slots | "consumable slots `1`–`4` with the refit window closed (v3 default, ruled 2026-09-03 — Eric: *'1-4 by default, but maybe we can introduce user-configurable controls'*; rebindable controls are a maybe, not scoped)". The forge tested `Z`–`V` as an alternative ("keys `1`–`4` with Tab closed (`Z`–`V` tested)"); GDD open note 9 records `1`–`4` as RESOLVED. | gdd.md L192; open note 9 (L511); deck-forge Locked 5, Open (L28) |
| 2.5 | `Tab` + `1`–`4` (Tab open) = refit | "the refit window — `Tab` opens it, `1`–`4` take a card." The same digit keys serve consumables when the window is closed and card-taking when it is open. | gdd.md L192 |
| 2.6 | `5` — GONE | "The `5` key is gone with the DAMAGE CONTROL rail (v3: the heal is a card)." | gdd.md L192; § Healing (L184); epics.md E8 L217 |
| 2.7 | No chords | "There is no chord binding of any kind." | gdd.md L192 |
| 2.8 | Foghorn, telegraph, rudder | Retained: "telegraph detents (set-and-forget engine orders) + rudder … the foghorn". | gdd.md L192 |
| 2.9 | Mouse — click to fire, arc gates | "aim freely — weapons fire only within their real firing arc; click to fire". "Aim is free; the arc gates firing, not the cursor". | gdd.md L193; § Aiming (L253) |
| 2.10 | Mouse — MACHINE GUN click-and-hold | "for the MACHINE GUN alone, click and hold to stream (catalog v3 R20; the arc still gates, so leaving it mid-stream ceases fire [DRAFT — facilitator reading])". | gdd.md L193; open note 21 (L523) |
| 2.11 | Consumable activation: two shapes | "Two activation shapes are an engine requirement, not a content taxonomy: **key fires** (instant — HULL REPAIR, SHIELD BLOCK, CHAFF, SMOKE SCREEN) and **key primes, click fires** (aimed, like `Q`/`E`/`R`, as a one-round pool on the same equipment interface — the DECOY BUOY, dropped into the mine's rear arc), and the card face says which. *(Only the decoy's delivery is ruled — R36/R43; the other four are keyed as instants by the facilitator's reading of their effects.)*" | gdd.md § Consumables (L172); epics.md E8 L216; deck-forge Locked 5 |
| 2.12 | Which consumable is which | HULL REPAIR — key fires. SHIELD BLOCK — key fires. SMOKE SCREEN — key fires. CHAFF — key fires. DECOY BUOY — key primes, click fires (rear arc ±60°, mine leash). Catalog §4 header: "fired on `1`–`4`". | gdd.md L172; epics.md E8 L216; catalog-v3.md §4 (L241–249) |
| 2.13 | Rear-arc click-aimed items | "The rear sector (NAVAL MINES, CAPTIVE MINES, and the DECOY BUOY consumable) is click-aimed astern ±60° out to a fixed leash, superseding the original dead-astern rack." | gdd.md § Arcs (L254) |
| 2.14 | Twin-sector click rule | "two mirrored beam sectors centred at heading ±90°, where the side containing the click is the side that fires and a click in neither is denied: the broadside gun at 60° a side (60° dead zones dead ahead and dead astern) and the LIGHT TORPEDO at 45° a side (90° dead zones)." | gdd.md L254 |
| 2.15 | Full arc register (catalog v3 re-cut) | "The deck gun, star shells and flak gun fire 360° — no mounts, no arc. Bow sectors: HEAVY TORPEDO ±30°, SUPERCAVITATING TORPEDO ±15°, MONITOR GUN ±10°, HORIZONTAL MISSILE ±50°, MACHINE GUN ±90° (a 180° forward arc)." Twin: broadside 60°/side, light torpedo 45°/side. Rear: mines + decoy. | gdd.md L254; open note 3 (L505) |
| 2.16 | Rebinding statement | "user-configurable bindings are a maybe" / "rebindable controls are a maybe, out of scope here". | gdd.md L172, L192; epics.md E8 L216; open note 9 |
| 2.17 | Mulligan control | Not named. Only "one free redraw of the level-zero offer, only during the countdown". | gdd.md L326 |
| 2.18 | Match completes with KB+M only | "Match completes with keyboard + mouse only. Touch/mobile input is out of scope for beta." Design intent: "hands describe the fantasy — left hand helms the ship, right hand fights it." | gdd.md L190, L194 |

---

## 3. STATES and RULES the UI must show

### 3A. Offer / draw / deck state

| # | Rule | Fact | Source |
|---|---|---|---|
| 3.1 | Full consumable slot → greyed card + server refusal | "Full slots grey the consumable in the offer and the server refuses the pick — there is no instant-use-on-pick; the never-rerolling offer is itself the mechanism (Eric: *'use one and then pick it if it's what you really want'* — spend a slot, reopen `Tab`, the card is still there)." | gdd.md § Consumables (L172); deck-forge Locked 5; epics.md E8 L216 |
| 3.2 | Consumable leaves the deck ON PICK, not on use | "taking it from an offer stocks it in a slot, and it leaves the deck on pick, not on use". | gdd.md L172; deck-forge Locked 5 |
| 3.3 | Slot contents = server-owned ship state | "Slot contents are server-owned ship state, so a refresh or reconnect keeps them for free." | gdd.md L172; epics.md E8 L216 |
| 3.4 | Card leaves the deck when taken | "A card leaves the deck when it is taken — a consumable on pick, a ladder copy when fitted — so a build's ceiling is something a player can count." | gdd.md § Deck model (L167); epics.md E8 L214 |
| 3.5 | Exhaustion | "Exhaustion is legal but should be rare and means you are at maximum power (Eric: *'ideally if you are gaining a level you've always got choices'*)." Discard/reshuffle REJECTED ("#8 — exhaustion is meant to be rare, not cycled"). | gdd.md L167; epics.md E8 L214, story 3 (L231); § Rejected (L483) |
| 3.6 | Equal-weight draw; 4 DIFFERENT lines | "Draw rule: equal weight per card. No rarity weighting, no class weighting, no pity — the 2026-07-30 soft pity is retired. *Deck size is the pity, composition is the tilt*". Offer = "4 different card lines". | gdd.md L166, L160; deck-forge Locked 2 |
| 3.7 | One-copy appearance figures (stale) | "a one-copy line is offered at least once in 66% of 8-pick matches, 82% at 12, 90% at 15 and 97% at 20 … Those figures are stale (R4): they were measured at 40 cards and the deck at queue is now 50". | gdd.md L166; catalog-v3.md R4 (L113) |
| 3.8 | Offer never rerolls; mulligan is the ONE exception | "reopening the window never rerolls"; mulligan is "the single declared exception to 'reopening never rerolls', at a moment nobody is on the water." | gdd.md L160, L326 |
| 3.9 | Weighted first draw guarantee | "the level-zero offer is guaranteed to contain at least one actively usable card (a consumable, or the Tier I of any equipment — the bare weapon, by catalog v3's standing rule) — Eric: *'my brain leans more towards weighted first pick.'*" The mulligan redraw carries the same guarantee. Pinned card = "a later, CONFIG-gated experiment to test against it." | gdd.md L326; deck-forge Locked 6; epics.md E8 L218 |
| 3.10 | Level zero at countdown start | "Level zero is granted at countdown start, so the first offer opens during the 10 s countdown and can be taken before the water goes live, or held." | gdd.md L326 |
| 3.11 | Deck at queue = 40 + 10 = 50 | "Deck at queue = 40 authored + 10 match = 50." Draw-pile counter counts down from 50. | catalog-v3.md R4 (L110); gdd.md L162, L182 |
| 3.12 | Match consumable pool is HIDDEN | "The set is hidden — nobody sees its composition; every captain knows only that it exists. Eric: *'So someone can assume there might be more heals and shields and shit out there.'*" "the match pool's composition is a server secret nobody sees — and only the four drawn ids ride the wire." | gdd.md L182, L167, L400; catalog-v3.md R4 (L111) |
| 3.13 | Pool respects caps within the pool alone; consumables only | "R44: the cap bounds the POOL ALONE. The 10 are drawn respecting caps among themselves; a deck may hold authored copies + pool copies of one line (a starter's 5 Hull Repair plus up to 5 more from the pool)." "it holds only consumables, so it can never add an equipment line." | catalog-v3.md R44 (L114); gdd.md L182 |
| 3.14 | Copies = tier ceiling | "how many copies you put in the deck is the highest tier you can reach — a deliberately capped line is a build decision, not a shortfall." | gdd.md L165; deck-forge Locked 3 |
| 3.15 | Tier I is the bare weapon | "For every 5-tier equipment line, copy 1 fits the weapon at base and tiers II–V are the four upgrade steps". Deck gun exception: "Since the deck gun is slotless and always fitted, its tier I is a real upgrade". | catalog-v3.md STANDING RULE (L138), R14 (L130); gdd.md L165 |
| 3.16 | Add-ons holdable AHEAD of the weapon | "Separate one-copy add-ons … are drawable at any time and can be held ahead of the weapon they modify (Eric: *'it's a choice'*)." | gdd.md L165; deck-forge Locked 3 |
| 3.17 | Add-ons stack; no exclusivity | "a star-shell build can run PHOSPHOR *and* DAZZLE on one flare (R33); exclusivity is gone from the game entirely." | gdd.md L170; catalog-v3.md R33 (L164), §4 L239 |
| 3.18 | Fractional steps floor (affects any tier preview) | "the stat shown is `floor(base + step × tiers)`, so nothing appears until the fraction completes a whole. (Applies to any integer stat on any line: tubes, barrels, turrets, live-mine counts.)" | catalog-v3.md STANDING RULE (L142); gdd.md L238 |
| 3.19 | Reload composition (for any displayed reload) | `reload = base × (1 − 0.05 × equipmentTier) × (1 − 0.05 × globalReloadTiers)`; maxed both = 60% of base. Global RELOAD also scales the Shift cooldown; "consumables have no reload." | catalog-v3.md L132, R12/R40 (L126); gdd.md L142 |

### 3B. Slots / weapons

| # | Rule | Fact | Source |
|---|---|---|---|
| 3.20 | ≤ 3 equipment lines per deck → slots never overflow, no replace flow | "A deck may carry at most three lines that fit an equipment slot (Eric ruling 2026-09-03), so three slots can never overflow and there is no 'replace which' flow at all — and no hand, no swap-out, no sell-back." | gdd.md L133; open note 13 (L515); epics.md E8 L215 |
| 3.21 | Swap cheese is a NEVER | "fitting or replacing a weapon may never yield more shots than leaving it alone". | gdd.md L133; deck-forge Carried (L21) |
| 3.22 | Slot keeps its clock | "the slot keeps its clock across replacement, so a fresh weapon never skips the reload of the one it replaced (the 2026-08-27 session's ~5 s ready floor is the carried draft figure, not a ruling)." | gdd.md L133; deck-forge Carried |
| 3.23 | Every reload ticks every tick | "Every fitted system has its own ammo pool and reload timer, and every reload ticks every tick regardless of which weapon is selected — switching weapons is tempo, not penalty." | gdd.md L243 |
| 3.24 | Acquisition card retired | "v3 retires the acquisition card and its 'taking one burns the rest' rule." | gdd.md L351, L138; epics.md E8 L209 |
| 3.25 | Heal bound (for any heal-count UI) | "at most four heals stocked at any moment, and never more than the deck carries (at most ten under catalog v3: five authored plus at most five from the match pool)". | gdd.md L184, L345 |
| 3.26 | Torpedo-outruns-hull law vs Light Torpedo — open | "the law as written no longer holds for it; R18's numbers stand and the law needs Eric's re-reading — open note 19." | gdd.md L244; open note 19 (L521) |

### 3C. Deck legality / account

| # | Rule | Fact | Source |
|---|---|---|---|
| 3.27 | Exactly two composition rules | "Exactly two composition rules (Eric ruling 2026-09-03: *'the only rules we enforce on deck construction'*): exactly 40 authored cards (final for launch; the size stays a CONFIG dial — the match pool is added by the server *after* this check and is never the author's to build), and no more than three lines whose copy 1 fits an equipment slot." | gdd.md L168; epics.md E8 L213 |
| 3.28 | No other composition requirement | "a gunboat deck (nothing but gun ladders) and a zero-heal deck are both legal by design (Eric: *'I'm frankly not even sure I want the default set to be required'*)". | gdd.md L168 |
| 3.29 | Ownership bounds | "every card must be unlocked on the account, and a line has only as many copies as exist (its catalog cap: 5 for an equipment line, 4 or 5 for a universal ladder, 1 for an add-on, 4 / 1 / 2 for the deck gun's own DECK GUN / TURRET / BARREL, and for a consumable the copy count authored on that card in the catalog — 5 for every launch consumable…; no deck-level consumable cap)." | gdd.md L168; open note 18 (L520) |
| 3.30 | Checked once at queue; frozen | "checked by the server once, when you queue, and frozen at queue (later edits apply to the next match)". | gdd.md L168, L299 |
| 3.31 | Deck belongs to a hull as a LABEL | "A deck belongs to one hull as a label only. Class tilt lives in starter-deck composition and in an author's copy counts — never in the draw." Catalog hull-agnostic; "nothing is class-locked (Eric: *'NO'*)". | gdd.md L164; deck-forge Locked 4 |
| 3.32 | Starter decks are ordinary decks | "Starter decks are ordinary decks that pass the same rules against a fresh account's unlocks — catalog v3's three starters each run exactly three equipment lines and sum to 40." | gdd.md L168; catalog-v3.md Arithmetic (L56) |
| 3.33 | Anonymous = starter deck, nothing stored | "the server loads it from the account (or the hull's starter deck for an anonymous captain)". | gdd.md L299, L301 |
| 3.34 | Unlock = whole line, any order, flat price [DRAFT] | See 1.26. "Variety, never power." | gdd.md L328; epics.md E9 L258; deck-forge Locked 9 |
| 3.35 | Account XP: placement-scaled, Solo vs AI discounted | "XP per match placement-scaled, Solo vs AI discounted. Both dials derive from one OPEN intent number — matches to unlock the launch catalog — shipped as a CONFIG dial with no placeholder (Eric 2026-09-03)" — Eric: *"fuck if I know"*. Count now known: 29 lines. | epics.md E9 L259; gdd.md L328; open note 11 (L513) |
| 3.36 | Starter viable at the top | "a starter is authored to be viable at the top of the ladder — Eric: *'good enough… just not the most optimized deck for how I play, or the current meta.'*" | gdd.md L328 |
| 3.37 | Meta convergence accepted | "Meta convergence is accepted (Eric: *'There's no avoiding it'*)." | gdd.md L328 |
| 3.38 | Several decks per hull | "A signed-in captain may keep several decks per hull (Eric: *'fine. Data is cheap'*)". | gdd.md L328; epics.md E9 L257 |
| 3.39 | Results / history reveal | Own deck brought/drawn/taken; enemy decks to no player; whether the pool is revealed after the match is **open note 20** (facilitator reading: the view shows only the pool cards you drew). | gdd.md L182, L328; open note 20 (L522) |
| 3.40 | Free per-level auto-heal — unruled | "the FREE per-level auto-heal that shipped 2026-08-23 … Whether it survives alongside the heal card, or is the thing 'parked' retires, is an Eric call." Note 14: "left open on purpose; decide at the balance pass once bots are on v3 decks." | gdd.md L184; open note 14 (L516) |
| 3.41 | Sudden-death heal question closes | "'Can heals be spent during the sudden-death collapse?' closes by construction (forge lock 7): the bound is finite". | gdd.md L184; deck-forge Locked 7 |
| 3.42 | Currencies | "XP is the only in-match currency; unlock tokens are the only account currency (v3)." | gdd.md § Economy (L349) |

---

## 4. CARD CONTENT the UI displays

Catalog: **29 lines / 114 cards** — 11 equipment lines (55), 5 universal ladders (22), 3 deck-gun lines (7), 5 add-ons (5), 5 consumables (25). Everything is Universal (hull-agnostic). (catalog-v3.md § Arithmetic L59–60; gdd.md L165, L53.)

Conventions: equipment tier I = the bare weapon; tiers II–V each −5% own reload + the line's stats; ×1.1 = compounding; `[D]` = [DRAFT]. (catalog-v3.md §4 L190.)

### 4A. Universal ladders (5) — kind: universal ladder

| # | Line | Cap | Per tier | At cap | Starter TB/ML/BS | Source |
|---|---|---|---|---|---|---|
| 1 | ARMOR | 4 | +25 max hp (heals on grant) | TB 350 / ML 400 / BS 450 | 2 / 3 / 4 | catalog-v3.md R8 (L184), §4 L196 |
| 2 | SPEED | 4 | +2.5 u/s forward max (reverse untouched) | TB 55 / ML 50 / BS 45 | 4 / 3 / 2 | R10 (L122), §4 L197 |
| 3 | TURNING (new) | 4 | +0.05 rad/s flat `[D]` — "Flat, not proportional — helps the slow hulls most" | TB 1.0 / ML 0.8 / BS 0.6 | 3 / 3 / 2 | R6 (L116), §4 L198 |
| 4 | RADAR SWEEP | 5 | +3 rpm | 30 rpm (clamp stays) | 3 / 3 / 3 | R11 (L124), §4 L199 |
| 5 | RELOAD | 5 | −5% every equipment reload AND the Shift boost cooldown | 75% (Shift 20 s → 15 s) | 3 / 3 / 3 | R12/R40 (L126), §4 L200 |
| — | SHIFT BOOST (ability, NO card) | — | +25% hull max speed, 10 s active, 20 s reload `[D]` | boosted TB 56.25 / ML 50 / BS 43.75; 15 s reload under max Reload | every hull | R7 (L118), R9 (L186), §4 L201 |

### 4B. Deck gun (3 lines) — kind: deck gun (slotless, always fitted)

| # | Line | Cap | Per tier / copy | At cap | Starter | Source |
|---|---|---|---|---|---|---|
| 6 | DECK GUN | 4 | +1.25 dmg AND −5% own reload; damage 15 → 16.25 → 17.5 → 18.75 → 20 ("Eric wrote it rounded: 15 → 16 → 17 → 18 → 20"); reload 100 → 95 → 90 → 85 → 80% | 20 dmg, 80% (4 s; 3 s under max Reload) | 1 / 1 / 1 | R14 (L130), §4 L207 |
| 7 | DECK GUN TURRET | 1 | pool 1 → 2 | 2 rounds | 1 / 1 / 1 | R15 (L134), §4 L208 |
| 8 | DECK GUN BARREL | 2 | +1 barrel, parallel tracks 12u, full damage each | 3 shells | 2 / 2 / 2 | R16 (L136), §4 L209 |

Base gun unchanged: 360°, 500 u/s, 15 dmg burst r15u, 6 contact, range 660u, 5 s. (§4 L211)

### 4C. Equipment lines (11) — kind: equipment (cap 5 each; copy 1 fits a Q/E/R slot)

| # | Line | Arc | Tier I (the weapon) | Tiers II–V, each | Tier V | Starter | Source |
|---|---|---|---|---|---|---|---|
| 9 | LIGHT TORPEDO | twin sector, both beams ±45° about 90° (90° dead zones fore/aft) | 45 u/s, 40 dmg, 1 tube, 25 s, no max range | −5% reload, +5 dmg, +2.5 u/s, +0.5 tube | 20 s, 60 dmg, 55 u/s, 3 tubes | TB 5 | R18 (L144), §4 L217 |
| 10 | HEAVY TORPEDO | bow ±30° | 65 u/s (was 60), 50 dmg, 1 tube, 30 s, no max range | −5% reload, +5 dmg, +2.5 u/s, +0.5 tube (II 95%/55/67.5/1 · III 90%/60/70/2 · IV 85%/65/72.5/2) | 24 s, 70 dmg, 75 u/s, 3 tubes | TB 5 | R17 (L140), §4 L218 |
| 11 | SUPERCAVITATING TORPEDO | bow ±15° | 195 u/s, 50 dmg, 1 fish, 45 s; straight-runner, never homes | −5% reload, +5 dmg (speed/tubes fixed) | 36 s, 70 dmg | — (unlock) | R19 (L146), §4 L219 |
| 12 | NAVAL MINES | rear ±60°, leash 150u (click-aimed) | arm 3 s, trigger 32u / blast 48u, 55 dmg, pool 2, 15 s; NO live cap | −5% reload, +5 dmg, ×1.1 blast (trigger = 2/3 blast: 48 → 52.8 → 58.1 → 63.9 → 70.3u), +1 held | 12 s, 75 dmg, blast 70.3u / trigger 46.9u, pool 6 | ML 5 | R23/R24 (L152), §4 L220 |
| 13 | CAPTIVE MINES | rear ±60° (mine chassis) | trigger 144u / blast 32u; one un-upgraded fish at mine dmg (55); no self-detonate; fish no max range; pool 1, 20 s `[D]`; no live cap | −5% reload, +5 fish dmg, ×1.1 trigger ring, +0.5 held (pool 2 at III, 3 at V) | 16 s, 75 dmg fish, trigger 210.8u, pool 3 | ML 5 | R25 (L154), §4 L221 |
| 14 | HORIZONTAL MISSILE | bow ±50° | 250 u/s, 40 dmg, bursts r20u at the click (en-route hull = direct hit), range 660u, islands BLOCK, 1 missile, 30 s | −5% reload, +5 dmg, +0.5 missile | 24 s, 60 dmg, 3 missiles | BS 5 | R29/R42 (L178), §4 L222 |
| 15 | MACHINE GUN | bow ±90° (180° forward) — the ONLY Eric-confirmed number | held-fire stream (click-and-hold): 4 dmg/shell every 0.25 s (16 dps), 250u, 6 s of fire per pool, 15 s reload — all `[D]` | −5% reload, +1 dmg/shell | 12 s, 8 dmg/shell (32 dps `[D]`) | TB 5 | R20/R21 (L148–150), §4 L223 |
| 16 | FLAK GUN | 360° | air-burst at the click, wide weak blast, hits hulls AND ordnance; 500 u/s, 10 dmg in r40u, 660u, 1 shell, 8 s — numbers `[D]` | −5% reload, +2 dmg, ×1.1 blast | 6.4 s, 18 dmg, r58.6u `[D]` | ML 5 | R26/R27 (L156), §4 L224 |
| 17 | MONITOR GUN | bow ±10° | ARCING (over islands), 500 u/s, 660u, 75 dmg, NO burst (hits what is under it at the click), 1 shell, 50 s | −5% reload, +5 dmg | 40 s, 95 dmg | BS 5 | R30 (L158), §4 L225 |
| 18 | BROADSIDE GUN | twin sector 90° ±60° (60° dead zones) | as shipped: 4 turrets, 15 dmg r15u each, 500 u/s, 412.5u (5/8 rung), 18 s, mounts ±28° / traverse ±6°, zero overlap | −5% reload, +1 spread rung, +0.5 turret (5 at III, 6 at V) | 14.4 s, mounts ±6° / traverse ±14°, 6 turrets | — (unlock) | R35 (L166), §4 L226 |
| 19 | STAR SHELLS | 360° | 500 u/s, 660u, lit r165u for 10 s, 1 flare, 20 s | −5% reload, +2.5 s lit, ×1.1 lit radius, +0.5 flare (2 at III, 3 at V) | 16 s, 20 s lit, r241.6u, 3 flares | BS 5 | R31 (L160), §4 L227 |

### 4D. Add-ons (5) — kind: add-on (one copy each; drawable any time; holdable ahead of the weapon)

| # | Add-on | Effect | Applies to | Starter | Source |
|---|---|---|---|---|---|
| 20 | ACOUSTIC HOMING | 0.5 rad/s steer, acquire 120u, dies at 1300u (as shipped) | Light + Heavy torpedoes (never Supercavitating); "One card homes every torpedo you carry" | TB 1 | R22 (L180), §4 L233 |
| 21 | FOULING MINES | victim ×0.75 both speed caps for 5 s, refresh not stack (as shipped) | Naval Mines ONLY (not the captive's fish) | ML 1 | R28 (L176), §4 L234 |
| 22 | HEAT SEEKING | the acoustic-homing numbers | Horizontal Missiles | BS 1 | R32 (L162), §4 L235 |
| 23 | DAZZLE SHELLS | enemies inside the lit zone: sight ×0.5 (as shipped); never changes the lit radius | Star Shells | BS 1 | R33 (L164), R5 (L182), §4 L236 |
| 24 | PHOSPHOR SHELLS | 5 hp/s burn on non-owner hulls inside 0.8× the lit radius (as shipped; R34 keeps the 0.8× inner ring); never changes the lit radius | Star Shells | — (unlock only) | R33/R34 (L164), R5, §4 L237 |

"Dazzle + Phosphor stack on one flare (no exclusivity)." (§4 L239)

### 4E. Consumables (5) — kind: consumable (cap 5 each; no reload; fired on `1`–`4`)

| # | Consumable | Effect | Activation | Starter | Source |
|---|---|---|---|---|---|
| 25 | HULL REPAIR | 50 hp instant + 50 hp pooled at 5 hp/s (100 total) — the shipped DAMAGE CONTROL effect | key fires | 5 / 5 / 5 | R13 (L128), §4 L245; gdd.md L174 |
| 26 | SHIELD BLOCK | absorbs the next 100 hp of damage for 10 s; unused expires; all damage sources `[D]` | key fires | — (pool only for a starter) | R37 (L170), §4 L246 |
| 27 | SMOKE SCREEN | trail astern laid for 5 s; each puff lives 30 s, r40u expanding slowly to r60u; blocks SIGHT only; hides occupant `[D]` | key fires | — | R38 (L172), §4 L247 |
| 28 | CHAFF | bursts at YOUR position: 10 fake radar returns in r120u for 15 s | key fires | — | R39/R41 (L174), §4 L248 |
| 29 | DECOY BUOY | dropped astern in the mine's rear arc; 50 hp; lasts until destroyed; homing ordnance retargets onto it AND it physically blocks any torpedo/missile | key primes, click fires (rear arc) | — | R36/R43 (L168), §4 L249; gdd.md L172 |

Activation caveat: only the decoy's delivery is Eric-ruled; the four "key fires" are the facilitator's reading. (gdd.md L172)

### 4F. The three starter decks (each exactly 40; each exactly 3 equipment lines)

Source: catalog-v3.md §1 (L22–52), Arithmetic (L56–63); gdd.md § Fitted loadouts table (L204–210).

**Common 15 non-equipment cards in every starter:** HULL REPAIR ×5, DECK GUN ×1, TURRET ×1, BARREL ×2, RADAR SWEEP ×3, RELOAD ×3.

| Hull | Equipment lines (×5 each) | Add-ons | ARMOR / SPEED / TURNING tilt | Sum |
|---|---|---|---|---|
| **Torpedo Boat** | LIGHT TORPEDO · HEAVY TORPEDO · MACHINE GUN | ACOUSTIC HOMING ×1 | 2 / 4 / 3 | 15 common + 9 tilt + 15 equipment + 1 add-on = 40 |
| **Mine Layer** | NAVAL MINES · CAPTIVE MINES · FLAK GUN | FOULING MINES ×1 | 3 / 3 / 3 | 15 + 9 + 15 + 1 = 40 |
| **Battleship** | HORIZONTAL MISSILE · MONITOR GUN · STAR SHELLS | DAZZLE SHELLS ×1 · HEAT SEEKING ×1 | 4 / 2 / 2 | 15 + 8 + 15 + 2 = 40 |

GDD arithmetic statement: "TB 24 + 15 + 1, BS 23 + 15 + 2, ML 24 + 15 + 1 — the Battleship's lighter ladder tilt is what makes room for its second add-on" (gdd.md L210).

**Unhomed at launch (unlock or pool only):** SUPERCAVITATING TORPEDO, BROADSIDE GUN, PHOSPHOR SHELLS, DECOY BUOY, SHIELD BLOCK, SMOKE SCREEN, CHAFF. (catalog-v3.md L62; gdd.md L210, L328)

**Sheet v1 → v2 diff (for the record):** Hull Repair 2 → 5 on every hull; Shield 2 → 0, Smoke 1 → 0, Chaff 1 → 0; Deck Gun 1 on every hull (was BS only); Dazzle Shells ×1 added to BS. R5: Eric first said "both, displacing two"; the v2 sheet shows Dazzle only and governs. (catalog-v3.md L63, R5 L182)

**Hull reference numbers a card face or deck editor may need:** TB 250 hp · 45 u/s · 0.8 rad/s · 100×9u; ML 300 hp · 40 u/s · 0.6 rad/s · 88×20u; BS 350 hp · 35 u/s · 0.4 rad/s · 124×32u. Sensor ladder frozen: detect 247.5 · sight 330 · muzzle/smoke 412.5 · radar 660. Sweep 15 rpm (cap 30). (catalog-v3.md §2 L67–68; gdd.md L154)

### 4G. Class fantasies (what a starter is authored to deliver)

- Torpedo Boat: "Fast, fragile, the needle-threader: torpedo skill-shots through terrain, orbiting bigger ships, winning on audacity."
- Battleship: "Massive, heavily armored, main-battery gunnery: dominates the open ocean by weight of shot." — BUT open note 22: the starter is missiles + monitor + star shells with the broadside an unlock; "whether the fantasy text moves to missiles-and-monitor or the broadside returns to the starter is Eric's".
- Mine Layer: "The trapper: area denial, reading where prey will flee and having already been there — 'you died to a decision I made ninety seconds ago.'"
(gdd.md § Ship classes L118–122; open note 22 L524)

---

## 5. COPY and NAMING rulings

| # | Ruling | Source |
|---|---|---|
| 5.1 | **HULL REPAIR** is the catalog name for the DAMAGE CONTROL effect: "DAMAGE CONTROL becomes a stockable consumable — HULL REPAIR in catalog v3". Sheet row 6 = "Hull Repair"; §2 maps it to "DAMAGE CONTROL (`5` rail)". The GDD's compass note: "The DAMAGE CONTROL heal is a deck card spent from a consumable slot, not a WoWS-style repair party". | gdd.md L184, L247; catalog-v3.md L29, L77 |
| 5.2 | **KILL LEADER** "(#47, formerly 'the Bounty')" — player-facing name retained by v3. | gdd.md L330 |
| 5.3 | **FLAK GUN** "is the brainstorm's SHRAPNEL GUN renamed" (R2). | catalog-v3.md R2 (L105); gdd.md L238 |
| 5.4 | **"Signature abilities" is not a concept** — Eric 2026-09-04: *"'signature abilities' are not a concept — starter decks are built to a fantasy and the player builds anything"*. Do not label anything "signature". | gdd.md L124 |
| 5.5 | **Deck editor = "deckbuilder"** — Eric: *"It's probably a deckbuilder."* | epics.md E9 L257 |
| 5.6 | **Draw-pile counter example copy:** `23 LEFT`. | gdd.md L167 |
| 5.7 | **"brought / drawn / taken"** — the three-part own-deck view wording used consistently ("the deck you brought, drew and took"; "brought / drawn / taken"). | gdd.md L106, L328; epics.md E8 L220, E9 L259; deck-forge Locked 11 |
| 5.8 | **Deck names REJECTED** — "deck names (in the feed or anywhere)". | gdd.md § Rejected (L483); epics.md E9 L262; deck-forge Rejected (L24) |
| 5.9 | **Deck codes UNRULED** — "Unruled proposal, no Eric position on record: deck codes (#64)." | gdd.md L485; epics.md E8 L222, E9 L262 |
| 5.10 | **Tier naming:** Roman tiers I–V throughout the catalog ("tiers II–V", "Tier I is the bare weapon"); Eric's own phrase: *"only taking up to Tier III… might be a planned strategic choice."* | catalog-v3.md §4; epics.md E9 L257 |
| 5.11 | **"The card face says which"** (key-fires vs key-primes-then-click) — the only card-face content ruling in these sources. | gdd.md L172; epics.md E8 L216 |
| 5.12 | **Card-face minimal + hover tooltip (R2.17)** — NOT present in these five sources (it lives in CLAUDE.md's Story 7-5 entry / the catalog v2 rulings). Flagged so the spine does not cite these files for it. | — |
| 5.13 | **Mode names at beta:** "**Solo** (standard BR — humans only, no bot-fill) and **Solo vs AI**". | gdd.md L297 |
| 5.14 | **Results actions:** "SPECTATE and RETURN TO PORT"; "*'You MUST return to the home screen to requeue. MUST.'*" | gdd.md L106 |
| 5.15 | **Line names as authored on the sheet** (Title Case on the sheet; GDD/§4 render them in caps): Armor, Speed, Turning, Radar Sweep, Reload, Hull Repair, Shield Block, Smoke Screen, Chaff, Deck Gun, Deck Gun Turret, Deck Gun Barrel, Light Torpedo, Heavy Torpedo, Supercavitating Torpedo, Naval Mines, Captive Mines, Horizontal Missile, Machine Gun, Flak Gun, Monitor Gun, Acoustic Homing, Fouling Mines, Broadside Gun, Star Shells, Decoy Buoy, Heat Seeking, Dazzle Shells, Phosphor Shells. §4 shortens to TURRET / BARREL. | catalog-v3.md §1 L24–52, §4 |
| 5.16 | **Type labels on the sheet:** "Upgrade", "Consumable", "Equipment", "Upgrade (add-on)". GDD's kinds: ladder / add-on / consumable / deck gun; "Upgrade" is the sheet's word for a ladder. | catalog-v3.md §1 L18–52 |
| 5.17 | **Eric on the promise:** *"If I put some weird off-meta shit together and it worked, I bet that feels fucking great."* Promise copy = "you have something to DO at 0:00", not "you hold your class weapon at 0:00". | gdd.md L72, L326 |
| 5.18 | **Eric on the pool:** *"So someone can assume there might be more heals and shields and shit out there."* | catalog-v3.md R4 (L109); gdd.md L182 |
| 5.19 | **Eric on full-slot refusal:** *"use one and then pick it if it's what you really want"*. | gdd.md L172 |
| 5.20 | **Eric on exhaustion:** *"ideally if you are gaining a level you've always got choices"*. | gdd.md L167 |
| 5.21 | **"go big or go home"** — E8+E9 ship as one unit. | gdd.md L301, L435; deck-forge L3 |
| 5.22 | **Eric on the Shift boost / wake drafting:** *"Interesting! I like that, we can fuck with that a bit."* (wake drafting). | gdd.md L146 |
| 5.23 | **Method note (Eric):** *"We need to go line by line so I can share my intent."* — carry-over of shipped values is never assumed for any line. | catalog-v3.md L120; gdd.md L53 |
| 5.24 | "Silly Is Sanctioned" tone contract retained (foghorn emotes, named vessels, medals). | gdd.md L389 |

---

## 6. REJECTED / PARKED / OPEN items that constrain UX

### 6A. Rejected (do not re-propose without a ruling)
| # | Item | Source |
|---|---|---|
| 6.1 | Hand + per-minute drip; card merging; storefront verbs (lock / sell / refresh) | gdd.md L483; deck-forge L24; epics.md E8 L222 |
| 6.2 | Rarity weighting; soft pity | same |
| 6.3 | Instant-use-on-pick (#82) | same; gdd.md L172 |
| 6.4 | Guest accounts; storing emails or passwords | gdd.md L483; epics.md E9 L262 |
| 6.5 | Deck names (in the feed or anywhere) | gdd.md L483 |
| 6.6 | Class-locked cards; deck-manipulation cards; hull-mod cards; salvage cards | gdd.md L483 |
| 6.7 | Discard/reshuffle (#8); the deck picking the hull (#71) | gdd.md L483 |
| 6.8 | Damage-reduction buff consumable (R4) | gdd.md L483; catalog-v3.md R4 |
| 6.9 | AP round, rocket shells (*"too complicated"*); light gun/secondary battery; fire-control director; sight-only ladder; HF/DF; IFF (*"not even parked"*); dazzle paint; EMCON; Leigh light; crash stop; SEARCHLIGHT (*"dead"*); all eight facilitator gun add-ons (*"extremely bad"*); counter-filter kills (degaussing, counter fuze, anti-mine paravane, torpedo-only boom, fire ship) | gdd.md L483 |
| 6.10 | Enemy decks shown to any player | deck-forge Locked 11; gdd.md L328; epics.md E8 L220 |
| 6.11 | No endure axis / no fire / no damage-reduction concept anywhere: *"Armor IS HP and HP is already upgradeable"*; *"This is deliberately more arcadey than World of Warships — do not push sim-level complexity."* | gdd.md L258 |
| 6.12 | Bot-fill in standard lobbies; PvE fleets as mandatory density | gdd.md L263; identity-forge Rejected |

### 6B. Parked (open, not dead)
| # | Item | Source |
|---|---|---|
| 6.13 | Positional slots / per-slot arcs — Eric: *"I don't think we'll need the mechanic"* | gdd.md L133, L485 |
| 6.14 | Pinned-card spawn (CONFIG-gated experiment vs weighted first draw) | gdd.md L326, L485 |
| 6.15 | Passive per-level heal | gdd.md L184, L485 |
| 6.16 | Draft mode (#73) | gdd.md L485 |
| 6.17 | Revealing enemy decks to players — Eric: *"if it's in results I should see it in history. Or maybe not"* | gdd.md L485 |
| 6.18 | Ghost decks (#63 — bots sailing anonymized player decks) | gdd.md L485; epics.md E8 L222, E9 L262 |
| 6.19 | Card kinds unruled: timed buffs (*"maybe"* — now live as SHIELD/SMOKE/CHAFF), drawback cards (*"maybe"*), signal cards (*"unknown"*) | gdd.md L485 |
| 6.20 | Wire guidance / wake homing add-ons (*"How many homing cards do we need, especially when a player can stack them?"*); drifting mines; mine sweeping; radar-absorbent hull; chain-shot verbs; amphibious hull; Carrier spotter plane | gdd.md L485 |
| 6.21 | Post-launch candidates (R1 — *"the sheet IS the launch catalog"*): Forward Mortar/Hedgehog, Depth Charge, Harpoon, Vertical-Launch Missiles, Hydrofoil boost ladder, Shkval round, the Anchor (second universal ability), Torpedo Net, Noisemaker / Gun Buoy add-ons | gdd.md L465; catalog-v3.md R1 (L103) |
| 6.22 | Deck slots rewarded/monetized (#80) — later | epics.md E9 L257 |
| 6.23 | Multi-copy add-ons "possible later" | gdd.md L165; deck-forge Locked 3 |
| 6.24 | Second universal ability (anchor) — "a maybe, unruled" | gdd.md L144 |

### 6C. Unruled / open
| # | Item | Source |
|---|---|---|
| 6.25 | Deck codes (#64) — "no Eric position on record" | gdd.md L485 |
| 6.26 | Rebindable controls — "a maybe, not scoped" | gdd.md L192; open note 9 |
| 6.27 | **Open note 19** — Light Torpedo (45 u/s) vs "torpedoes outrun every hull" law | gdd.md L244, L521 |
| 6.28 | **Open note 20** — (a) does results reveal the pool? (b) pool deals unlocked-or-not consumables (preview, not power) | gdd.md L182, L522 |
| 6.29 | **Open note 21** — [DRAFT] cells: TURNING step; Shift numbers; MG numbers bar arc; Flak base; Captive pool 1 / 20 s; Shield scope; Smoke self-hiding; wake-drafting magnitude; flat unlock price. Undecided design: Shift +25% of base vs ladder-raised max; owner exemption on decoy block; MG cursor-leaves-arc behaviour; **which signals each new line emits** (MG/flak flash per shell or per burst; missile/monitor splash/flash/hit call). Build calls: room-wide mine ceiling (`globalCap` 60); missile en-route contact damage. | gdd.md L523; catalog-v3.md §5 L257–259 |
| 6.30 | **Open note 22** — Battleship fantasy text vs its starter (broadside is an unlock) | gdd.md L121, L524 |
| 6.31 | Open note 14 — fate of the shipped free per-level auto-heal | gdd.md L184, L516 |
| 6.32 | Open note 11 — matches-to-full-catalog intent number (CONFIG dial, no placeholder; "the 40–60 band is withdrawn"); flat unlock price [DRAFT] | gdd.md L513 |
| 6.33 | Bot consumable-tactic mapping (HULL REPAIR/SHIELD off heal threshold; CHAFF/SMOKE off disengage; DECOY through rear-arc solve) is a facilitator proposal [DRAFT] | gdd.md L265 |
| 6.34 | Forge open list, status now: deck size band test (DROPPED — 40 final, note 8); slot keys 1–4 vs Z–V (RESOLVED 1–4, note 9); heal copies 4 vs 5 (RESOLVED 5, note 10); consumable content + tier bundles (CLOSED by catalog v3, note 12); account store architecture (delegated to `gds-game-architecture`, 7-7 stays deferred, note 16) | deck-forge L28; gdd.md open notes 8, 9, 10, 12, 16 (L510–518) |
| 6.35 | Identity-forge items not carried into v3 docs: Eclipse dial ("Eric ambivalent"), deck-merge mechanism (generic + class deck), kill-bonus ratio, covenant scaling, Carrier as stress test | identity-forge Open (L24–25) |

---

## 7. ACCESSIBILITY / FEEL statements v3 adds

Honest finding: **none of the five sources contains a photosensitivity, motion-setting, or colour-vision statement specific to CHAFF, SMOKE, SHIELD, DECOY, the deck editor, or any other v3 surface.** What they do say that bears on feel:

| # | Statement | Source |
|---|---|---|
| 7.1 | "its standing requirement is **the build must be felt** — audio, hull visuals, on-water behavior — or promise + growth is a spreadsheet." | gdd.md § Spending (L324) |
| 7.2 | Identity forge's "Unwitnessed Build" — "biggest accepted weak point: 10 picks must become *felt* (audio, hull visuals, on-water behavior), or match-built identity is a spreadsheet. Unanswered." (Pre-v3; still open.) | identity-forge Open (L23) |
| 7.3 | "Readability is tactical — everything on the water is information (Pillar 1), so render clarity is a gameplay feature: blip decay, wounded smoke, muzzle flashes must be readable at a glance on low-end displays." | gdd.md § Art Style (L382) |
| 7.4 | "Restrained functional color — each color has exactly one job (tactical green = yours, amber = action, dimensional purple = storm). Dark is the identity, not a theme option." | gdd.md L381 |
| 7.5 | "WebAudio tones only, no sound files … All audio respects the mute toggle." "Audio is a sensor (Pillar 1)". | gdd.md L387–388 |
| 7.6 | "Denied fire (out of arc, no ammo, reloading) gives explicit feedback rather than silence." — extended to blocked placements ("refused without spending the charge"). | gdd.md L193, L254 |
| 7.7 | "Information noise must never bury the hunt — sensor features may not drown the chase-and-shoot game in indicators." (Pillar guardrail; bears directly on CHAFF's 10 fakes, smoke puffs and the counter.) | gdd.md L81 |
| 7.8 | Performance/viewport: "60 FPS sustained on the ratified reference device … at the 1366×768 viewport floor"; "Playable from first click in under ~10 seconds … no install, no account required." | gdd.md L397–398 |
| 7.9 | Class select "Torpedo Boat sits pre-focused for keyboard flow". | gdd.md L126 |
| 7.10 | Identity-forge radar direction ("returns gain shape/size … class legibility at blip range") is **SUPERSEDED**: "Radar returns carry no identity — this supersedes the 2026-07-16 'class-legible blips' ruling." | identity-forge Locked 7; gdd.md L152 |
| 7.11 | "Arcade feel is the prime directive … restated by Eric 2026-09-04: *'deliberately more arcadey than World of Warships'*". | gdd.md L83 |

---

## 8. DELEGATED to UX / left undesigned

| # | Item | What the docs say (and don't) | Source |
|---|---|---|---|
| 8.1 | **Deck editor layout** | Only: "It's probably a deckbuilder"; author sets copies per line; several decks per hull; "legality feedback against unlocks". No layout, no copy-count control, no hull-label selector, no legality error copy, no unlocked/locked presentation. | epics.md E9 L257, L271 |
| 8.2 | **Draw-pile counter placement** | "on the HUD", example `23 LEFT`; counts from 50. Position unstated. | gdd.md L167 |
| 8.3 | **Sign-in placement / signed-in state display** | Two states named; providers named; no placement. The account holds no name/email — so what "signed in" shows is undesigned. | gdd.md L301, L407; epics.md E9 L254–255 |
| 8.4 | **Account level bar reading** | "An account level bar fills with XP earned per match"; one token per level. No format. | gdd.md L328 |
| 8.5 | **Unlock flow UI** | Whole-line unlock, flat price, any order; token count. No surface described. | gdd.md L328; epics.md E9 L258 |
| 8.6 | **Deck selection at join** | "the client selects a deck at join (#60)". Where (home? class select?) unstated. | epics.md E9 L272; gdd.md L299 |
| 8.7 | **Match history UI** | Own deck brought/drawn/taken per match. No layout. | epics.md E9 L259 |
| 8.8 | **Results own-deck view** | brought / drawn / taken; pool reveal open (note 20). No layout; must coexist with SPECTATE / RETURN TO PORT and the existing match log. | gdd.md L106, L182 |
| 8.9 | **Card face** | Must say key-fires vs key-primes-then-click. Tier preview, arc glyph, cap display, add-on target family — unstated here. | gdd.md L172 |
| 8.10 | **Greyed full-slot card** | "grey the consumable in the offer" — the only visual instruction. | gdd.md L172 |
| 8.11 | **Mulligan affordance** | No key, no button, no copy. Countdown-only. | gdd.md L326 |
| 8.12 | **Level-zero offer during countdown** | Opens during the 10 s countdown; "can be taken before the water goes live, or held" — how it coexists with the countdown screen is undesigned. | gdd.md L326 |
| 8.13 | **Empty weapon slot presentation (Q/E/R at 0:00) and fit-on-draw** | "empty at 0:00 and filled by the deck". No visual for empty vs fitted, nor for tier ups. | gdd.md L133 |
| 8.14 | **Consumable slot presentation (1–4)** | Server-owned; keyed; no visual. | gdd.md L172 |
| 8.15 | **Shift boost HUD** | Cooldown/active readout unspecified. | gdd.md L144 |
| 8.16 | **Smoke / chaff / shield / decoy render** | Numbers only (radii, durations, hp). Shield has no described visual at all. | gdd.md L175–178 |
| 8.17 | **Signals for new lines** | "Signals for the new lines are unruled" — MG, flak, missile, monitor. | gdd.md L238; open note 21 |
| 8.18 | **Machine-gun held-fire feel** | click-and-hold; leaving the arc mid-stream [DRAFT]. | gdd.md L193 |
| 8.19 | **Privacy paragraph text** | "one paragraph on signed-in accounts" — content unwritten. | epics.md E9 L255 |
| 8.20 | **Account store / API** | Delegated to `gds-game-architecture`; must not pre-empt Story 7-7. | gdd.md L407, open note 16; epics.md E9 L256 |
| 8.21 | **Wake drafting feel** | "Eric sets the lift and its radius"; prediction seam to architecture. | gdd.md L146 |
| 8.22 | **Heal count / stock readout** | Bound is 4 stocked / ≤10 in deck — no HUD instruction. | gdd.md L184 |
| 8.23 | **"The build must be felt"** | Standing requirement with no assigned surface. | gdd.md L324 |
| 8.24 | **Slot taxonomy** (identity forge left it unpinned) | Now PINNED by v3: deck gun + 3 generic weapon slots + 4 consumable slots. | identity-forge Locked 1; gdd.md L130–134 |
| 8.25 | **Draw-pile "exhaustion" state** | Legal but rare; what the Tab window shows when fewer than 4 lines remain is unstated. | gdd.md L167 |

---

## Summary

Section 1 lists 31 surfaces (20 on the water, 11 in port). Section 2 lists 18 input-scheme facts. Section 3 lists 42 states/rules (19 offer/draw/deck, 7 slot/weapon, 16 legality/account). Section 4 covers all 29 catalog lines with kind, cap, arc, tier I → cap and activation path, plus the Shift ability row, the three 40-card starter decks with their ARMOR/SPEED/TURNING tilts (TB 2/4/3 · ML 3/3/3 · BS 4/2/2), the unhomed list and the v1→v2 sheet diff. Section 5 records 24 copy/naming rulings (and flags that R2.17's card-face/tooltip ruling is absent from these five sources). Section 6 lists 35 rejected/parked/open items including open notes 11, 14, 19–22 and every [DRAFT] cell. Section 7 finds 11 feel/readability statements and no v3-specific photosensitivity or motion statement. Section 8 lists 25 items the sources delegate to UX or leave undesigned — chief among them the deck editor layout, the counter's placement, sign-in placement, the account level bar's reading, the mulligan affordance and the results own-deck view.
