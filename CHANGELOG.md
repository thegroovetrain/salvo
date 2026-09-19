# Changelog

## [0.18.12] - 2026-09-18

### Changed
- **Catalog v3 — ladders and the deck gun (Story 8.12)** — this one is mostly a paper trail: the five universal upgrade ladders (ARMOR, SPEED, TURNING, RADAR SWEEP, RELOAD) and the deck-gun family (DECK GUN, TURRET, BARREL) were already built and live at their catalog-v3 numbers back in Story 8.1 (cycle 135) — the caps, the per-tier steps, the reload math, ARMOR's heal-on-grant and the card faces were never touched here. What actually changes on staging: the HUD bar's gun square and its hover tooltip now show the deck gun's tier (`I` at spawn, climbing to `V` at four DECK GUN cards) — the same number the refit card already read, the square and tooltip just didn't print it before. A card that's already at its top tier can no longer ever show a nonexistent sixth rung (`VI`) — a display bug that could only happen in a state nobody could actually reach. And Eric ratified three small things: the refit card's `Turning` and `Gun damage` row labels stay as written; the internal safety floor on reload-speed math stays at its current value as a guard against bad data, not a balance knob; and the record now notes plainly that this story's checklist was already satisfied by Story 8.1's work, so later catalog stories (8.13 onward) don't need to re-touch these eight lines.
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
