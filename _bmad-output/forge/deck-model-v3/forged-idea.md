# Forged: The Deck Model v3 — HARDENED

**One unit** (Eric: "go big or go home"). Feeds `gds-gdd` (update) → `gds-create-epics-and-stories`; the account store is a `gds-game-architecture` question. Input: `brainstorming-session-2026-09-01.md` (82 ideas) diffed against 2026-08-27.

## Locked

1. **The Tab offer is untouched.** Earn a level → Tab → four different lines from YOUR deck → pick one. One level buys any card. No hand, no second clock, no storefront (merge/lock/sell/refresh dead).
2. **Draw rule:** equal per-card weight. No pity, no class weighting. *Deck size is the pity, composition is the tilt* (a 1-copy line is offered ≥ once in 66% of 8-pick matches, 90% at 15). Only smoothing anywhere is level zero.
3. **Card model (A):** a weapon is ONE ladder line (copy 1 = the weapon at base; copies 2–5 = authored tier bundles) + separate 1-copy ADD-ONS (tube, doctrine verbs) drawable any time, held ahead of the weapon. Universal lines (HULL, SPEED, COOLDOWN, SWEEP, BARREL/TURRET) are ladders on the same rule. **Copies = tier ceiling.** Direction: add-ons target a weapon FAMILY (tag), e.g. ACOUSTIC HOMING on Light AND Heavy torpedoes; multi-copy add-ons possible later.
4. **Legal deck** (server-checked once, frozen at queue): exactly 40 (min/max CONFIG dials — a 25–40 band MUST be tested); copies ≤ line max; every card unlocked; belongs to one hull as a LABEL (catalog hull-agnostic; class-locked cards NO); no composition requirements (gunboat and zero-heal decks legal); starter decks pass the same rules against a fresh account.
5. **Consumable slots:** four, keys `1`–`4` with Tab closed (`Z`–`V` tested). Full slots grey the card and the server refuses the pick; the immutable offer is the "use one, reopen Tab, take it" mechanism. A consumable leaves the deck ON PICK. Slot contents are server-owned ship state (reconnect-safe for free). Engine supports key-fires AND key-primes-then-click (one-round pool on the Equipment interface); content is open — "consumables can do pretty much anything."
6. **Spawn:** deck gun only, Q/E/R empty. **Level zero at countdown start**; **mulligan** = one free redraw of that offer, countdown only (the single declared exception to never-reroll). **Weighted first draw is the default**: level zero guarantees ≥1 actively usable card (consumable or Tier I equipment). Pinned card is a later CONFIG-gated experiment. The promise becomes "you have something to DO at 0:00."
7. **Heal:** the `5` key dies; DAMAGE CONTROL is a stockable consumable card, shipped 100 hp effect unchanged, **4–5 copies per starter deck [DRAFT]**. "Heals during the collapse" closes by construction. Per-level passive heal PARKED.
8. **Account:** NO guest tier. ANONYMOUS = today's game on the hull's starter deck, nothing stored. SIGNED IN (OAuth only — Google/Discord, minimal scopes: provider + opaque subject id, never email/name/password; 13+ by provider ToS) = decks, unlocks, tokens, match history. Same decks, same rules either way — signing in changes what you KEEP.
9. **Unlocks:** a whole line per unlock, flat price [DRAFT], any order; all three hulls + starter decks unlocked day one. **Earn:** account level → one token per level; XP per match placement-scaled, Solo vs AI discounted. The intent number (matches to unlock the launch catalog) is OPEN — CONFIG dial, [DRAFT] 40–60 band, tuned from live match history.
10. **Bots:** each profile carries an authored 40-card deck in the player format, legality-checked; a TOTAL `ConsumableTactic` record; harness runs AUTHORED and RANDOM-LEGAL deck arms; pinned bars: starter-vs-veteran win band, torpedo-less TB, gunboat deck, heal-take rate, levels-wasted, one-copy appearance.
11. **Enemy decks shown to no player;** every deck in every match recorded server-side for Eric's metrics. Players see their OWN deck (brought/drawn/taken) in results and history.
12. **Catalog breadth [DRAFT]:** a hull builds from ≥ ~100 cards' worth of unlockables (~25–30 lines). The catalog is an Eric-authored document, out of scope here.

## Carried constraints (from prior forges, still binding)
Arc = slot bearing × item traverse (on file); **swap cheese is a NEVER** (moving a weapon never yields more shots); **the slot keeps its clock across replacement**; the passive tick stays the anti-snowball floor; the master perception invariant keeps exactly six exceptions; accounts ship before the traffic push (not yet happened).

## Rejected / parked (do not re-propose without a ruling)
- Hand + minute drip; merge; storefront lock/sell/refresh; rarity weighting; soft pity; instant-use-on-pick (#82); guest accounts; own email/password storage; deck names; class-locked cards; deck-manipulation cards; hull-mod cards; salvage cards.
- Parked: positional slots / per-slot arcs ("don't think we'll need it"); pinned-card spawn (experiment); passive per-level heal; draft mode (#73); enemy deck reveal to players.

## Open (named, not ruled)
Deck size band (25–40) test; slot keys 1–4 vs Z–V; heal copies 4 vs 5; the matches-to-full-catalog number; consumable content; tier bundle contents (the catalog rework); the account store's architecture (first DB + non-ops HTTP API; 7-7 stays deferred).
