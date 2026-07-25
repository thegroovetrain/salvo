# Epic 2 Context: The New Economy (+ New Controls)

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 2 replaces the prototype's stat-stack upgrade economy with a Hades-style boon economy, and replaces the prototype's key bindings with the ratified control scheme that economy is designed around. Captains level passively every minute and faster through kills; each level banks a point carrying a pre-rolled offer of four qualitative boons spent inside a TAB-toggled refit window over the running battle (re-ruled 2026-07-24 — see Ratified Amendments). The result must be a ship that visibly and audibly changes — promise plus growth, not a spreadsheet. Alongside it lands the fixed v1 input scheme (Q/E/R slots, TAB-toggled refit, helm on W/S/A/D), the hotbar that makes the whole fit legible mid-knife-fight, the own-vitals cluster, and the committed settings/accessibility surface. Story order is deliberate: the fully-designed controls/settings work (2.1–2.4) is front-loaded so the design-heavy boon work (2.5–2.10) can never block it.

## Stories

- Story 2.1: The New Input Scheme
- Story 2.2: The Hotbar
- Story 2.3: Settings & Accessibility Options
- Story 2.4: Own-Vitals Cluster & Telegraph Restyle
- Story 2.5: Boon Effect Engine (Two Homes + Hooks)
- Story 2.6: XP Tick & Kill Bonuses
- Story 2.7: Offers — Roll, Bank, Spend
- Story 2.8: Boon Catalog v1 (dedicated design work with Eric)
- Story 2.9: The Build Must Be Felt
- Story 2.10: Economy Batch-Sim Harness

## Requirements & Constraints

- **Economy shape:** XP is the only progression currency. Passive tick ≈ 1 level/minute (deliberate generosity and the anti-snowball floor), opponent kill = 1 full level, PvE fleet tiers = ¼ / ⅓ / ½ level (wired as CONFIG hooks now; fleets arrive in a later epic). **No damage XP** — this is the Rat Covenant's price: a hiding player always ticks but never accelerates. All numbers are declared handwaves; the *shape* is the commitment.
- **Offers:** each banked level carries a pre-rolled offer of **4** boons from distinct categories, rolled at earn-time on a decorrelated RNG stream. Offers never reroll on reopen and banked offers never expire — the time pressure is self-managed (peek, release, fight, reopen). Spend is server-authoritative; a reject or timeout releases the in-flight latch and the level stays banked.
- **Catalog:** boons are qualitative and build-defining, never stat multipliers. Every class-specific ability is offer-pool content (off-class offers fill or replace the extra slot — a Battleship can grow torpedoes), including the smoke screen orphaned from the Torpedo Boat. Off-class weighting is a CONFIG tunable. Catalog scope covers the three beta kits. The 14 legacy stat upgrades are stripped wholesale here — the interregnum ends in this epic.
- **The build must be felt:** every boon lands with an audible cue (WebAudio, mute-aware), a visible hull/slot change, and behavior on the water. A presentation-silent boon is a defect.
- **Information discipline:** XP, level, bank, offers, and boon events are self-private on the wire — enemy builds are inferable only from observable behavior, never from contacts. No death pings, no free information.
- **Heal stays an open question.** The catalog neither includes nor forecloses a heal; the engine's `behavior` path and the (later) reversible sinking lifecycle must remain heal-compatible. Do not resolve it in either direction.
- **Tuning is evidence, not vibes:** headless drone-lobby batch sim over the real sim, seeded and reproducible, must produce at least one committed tuning pass of the XP values before any human playtest.
- **Accessibility floor is non-negotiable:** dual-coding for every state meaning (never color alone), every audio cue has a visual twin and vice versa, breathing glows ≥ 2 s cycles, one-shot pulses ~80 ms with a 300 ms same-source floor, HP/economy pulses capped at 1.1 Hz, ≤ 3 flashes/s per screen region, no full-screen strobes. No accessibility setting may be reachable only mid-match.
- **Cross-cutting laws bind every story:** authoritative 20 Hz fixed tick with client prediction (reconcile-and-replay at the same dt); everything spatial leaves the server only through the perception boundary; seeded RNG only (no `Math.random`/`Date.now` in sim); shared sim stays pure and side-free; World/Match keep zero Colyseus imports; cyclomatic complexity ≤ 10; `npm run check` green is the ship gate. Frame budget on the reference device: 16.6 ms = sim ≤ 3 ms + render ≤ 10 ms + headroom ≥ 3.6 ms. Persistence is client-side localStorage only — no accounts.

## Technical Decisions

- **Boon effects have exactly two homes plus hooks.** A boon is `{ id, category, effects[] }` in `shared/src/sim/boons.ts`. `stat` effects are read **only** by `effectiveStats()` (the desync firewall stays intact); `slotFill`/`slotReplace` mutate the one loadout structure; `behavior(hookId, params)` executes named hooks implemented once in `shared/src/sim/hooks.ts` so both sides run identical code and prediction survives. Applying a boon touches no third path.
- **Hook purity law, structurally enforced:** hooks are pure and deterministic, and the sim-parity property suite iterates `HOOK_REGISTRY` — a hook cannot be registered without parity coverage. This is the signal-registry trick applied to the second registry.
- **Build the engine on the existing timed-stat precedent.** The speed boost's timed kinematics from the Torpedo Boat work is the pattern the `behavior`/`stat` paths should generalize, not diverge from.
- **Engine before content.** The effect engine ships proven by test boons exercising all four effect kinds; the offer/spend flow must also work end-to-end against test boons. The real catalog arrives later and adds only data.
- **Naming conventions to follow:** registries in UPPER_SNAKE (`BOON_CATALOG`, `HOOK_REGISTRY`), boon/hook/equipment ids as camelCase strings, modules lowerCamelCase, wire channels only via the `MSG` map.
- **Harness placement:** the batch-sim lives with the other dev harnesses under `server/scripts/`, gated by the dev-options env flag, and is the first duty of a triple-duty harness — leave clean seams for its later load-test and bot-vs-bot evaluation duties.
- **Debt routed into this epic (from the Epic 1 ledger):** the transport-coalescing press swallow and the keyboard FIFO cap drop belong to the input-pipeline rework (2.1/2.2); server-side `options.name` type/length validation belongs to the first join/settings-touching story; `match.end` abandonment classification must land **before** the batch-sim tuning pass, so tuning conclusions aren't drawn from polluted telemetry.
- **Review posture:** the heavy adversarial review gate moves onto client UI state machines for this epic — 2.1–2.4 are exactly the code zone that produced Epic 1's worst defect density. Include lifecycle-boundary resets and tautological-test checks.

## UX & Interaction Patterns

- **Fixed v1 bindings (no remapping at beta).** Q/E/R map to loadout slots — **Q/E = the two class specials, R = the pickup/extra slot** (inert while empty; whatever fills it determines how it operates) — with weapons *switch-to* and abilities *activate immediately*. **F is reserved for a future feature and is not a slot key.** W/S taps step the telegraph ±1 detent (hold does not repeat), A/D hold the rudder, Z/X + wheel zoom the camera (fog stays server-authoritative — zoom is never an information exploit), ESC closes the topmost surface else opens the non-pausing settings overlay, Enter confirms contextually, M mutes. Foghorn is specced but unbound.
  - ⚠️ **Stale-doc warning:** DESIGN.md/EXPERIENCE.md and the UX decision rows still document the older mapping (Q = gun, E/R = specials, F = offer slot, four keys top-to-bottom). The 2026-07-21 re-ruling above supersedes them. How the always-selected standard gun is presented in a four-slot hotbar under the new mapping is the seam to settle at spec time — do not silently re-adopt the old mapping.
- **The refit window is TAB-toggled (re-ruled 2026-07-24, supersedes SPACE-hold — see Ratified Amendments).** TAB opens; TAB again closes without choosing; picking (1–4 or click) spends and closes; a card click never fires the gun. While open, the slot keys are suspended and the helm stays live; the hotbar dims to 38%; the battle stays visible in every gap. Four ~216 px cards sit side by side in a below-center band that never occludes the listening ring or own hull and never wraps (1–4 map spatially), with queue pips and a dashed ghost edge for waiting offers.
- **Number-key disambiguation:** a number key's meaning is evaluated against the refit modal's open state at its own keydown; outside the modal, number keys are refit-or-nothing (do nothing). The old closed-window spend behavior — and the superseded ~150–200 ms SPACE-release grace — are deleted outright.
- **Input hygiene:** every bound key is preventDefault-ed at a single keydown chokepoint (including SPACE page-scroll), contextmenu is suppressed on the canvas, and a focused DOM overlay or text input suppresses keyboard from the sim **while the sim never pauses** — typing "wasd" in the callsign field must steer nothing. Dev-only toggles never ship in portal builds.
- **Hotbar state grammar (dual-coded throughout):** ready weapon / ready ability (brighter + chamfer marks abilities) / selected (amber outline + inset wash + filled key chip) / cooling (dimmed icon + conic perimeter track + seconds) / activated flash (one ≤ 80 ms pop) / empty ("— awaiting refit —" dashed) / denied (80 ms red edge pulse + icon flash). Ammo badge appears only on systems storing > 1 round. Reload ticks on every slot regardless of selection — switching is tempo, not penalty. Cold states render as **absence**, not placeholder rows.
- **The tooltip is the canonical build-inspection surface** — name, interaction class, description, and the full accrued-boon list; slots compress accrued boons to `◆n` in quick-info.
- **Economy satellites:** a vertical XP rail filling toward the next level with an LV tag, a banked-level chip (2.4 s breathing glow decaying to static after ~10 s unspent, re-arming on a new bank or a SPACE touch, hidden at zero), and the "HOLD SPACE TO REFIT" cue line. Toasts are top-center, 3 s, max 3 stacked, **self-events only** (level banked, boon fitted) — never enemy information.
- **Own-vitals cluster:** floating linework only, no filled panel anywhere behind it. HP rail mirrors the XP rail (phosphor → amber < 50% → damage marker < 25%, breathing pulse accelerating from ~0.5 Hz and hard-capped at 1.1 Hz), mono tabular HDG/KTS with muted unit suffixes, rudder track with amber position tick, and a 9-detent telegraph ladder that **shape-codes** ordered-vs-actual (hollow rung marker vs solid needle — never color alone). Helm key glyphs sit at the gauge extremes and fade permanently after the first few successful inputs.
- **Settings (gear on home AND a non-pausing ESC overlay in match; modals never stack):** motion/shake full/reduced/off (reduced halves flash intensity and overrides every juice rule), UI scale 90/100/125% (125% gated to viewports ≥ 1600 px; scales Pixi + DOM HUD while port chrome follows browser zoom; no mono type below 9 px post-scale), colorblind assist (regroup the 20 hues into ~8 separated families + boosted blip outlines + raised minimum decayed-blip opacity; acceptance is distinguishability under simulated deuteranopia at blip scale), master/effects volume, mono-audio, mute. All take effect live and persist in localStorage. The overlay doubles as the view-only binding reference — the scheme's only in-match self-documentation.
- **One key-chip family.** Every key glyph — slot keys, card picks, helm keys — renders in the same mono chip family so the scheme reads as one system.

## Cross-Story Dependencies

- 2.1 establishes the binding set and the single keydown chokepoint; 2.2 (hotbar), 2.3 (binding reference), 2.4 (helm glyphs), and 2.7 (refit picks) all consume it. Build the chokepoint once.
- 2.5 (engine) → 2.7 (offers/spend, provable on test boons) → 2.8 (catalog data) → 2.9 (felt-ness pass over the whole catalog). 2.6 (XP/bank) feeds 2.7's earn-time roll and 2.10's measurements.
- 2.8 is a scheduled design gate **with Eric** — categories, names, effects, and off-class weighting are game-design decisions, not implementation choices. Do not invent catalog content. It is also where the 14 legacy upgrades die and every dead-pick wart from the class-loadout stories resolves by deletion.
- 2.10's tuning pass depends on the abandonment-classification telemetry fix landing first, and its output must feed a committed retune of the XP values.
- **Epic 1 dependencies are satisfied:** the Equipment/loadout slot structure, three class kits, ratified firing arcs, design tokens, personal hues, and home/class-select chrome are all live; class cards already label specials Q/E to match the new mapping.
- **Forward compatibility:** PvE XP fractions are CONFIG hooks awaiting the fleets epic; the ring epic's later work consumes 2.10's harness; the boon engine must stay heal-compatible for the lifecycle epic.
- **Ownership to name at create-story time:** the banked-level chip / XP rail / cue-line satellites are specified across both 2.2 and 2.6 — pick one owner explicitly rather than building them twice.

## Ratified Amendments (durable — survives recompiles)

From `epic-2-context-amendments.md` (2026-07-24, Eric, Story 2.1 invocation):

1. Refit window binding is TAB, a toggle (open / close-without-choosing) — supersedes the SPACE-hold design and the interregnum bare-CTRL toggle.
2. In-modal picks: number keys 1–4 select a card; clicking a card also selects, closes the modal, and must NOT fire the gun.
3. The ~150–200 ms post-release number-key grace is superseded: digit meaning is evaluated against the modal's open state at its own keydown; outside the modal digits are refit-or-nothing.
4. Q E R F confirmed; F is reserved specifically for the Foghorn (pre-rules Story 4.5's key binding). Q/E = class specials, R = pickup/extra slot (inert while empty).
5. Gun is default and always selected; a fired primed weapon auto-reverts to gun; pressing the primed key again also reverts to gun.

From `epic-2-context-amendments.md` (2026-07-24, Eric, Story 2.1 pre-implementation questions):

6. Refit modal is a full combat lockout: while open, no mouse click fires anything; helm stays live; closes only via pick, TAB, or ESC.
7. Digits 1–4 pick cards only; the interregnum REPAIR HULL spend option (CTRL+E / HEAL_CHOICE) is deleted from the spend flow — client and server. Does not foreclose a future heal boon.
8. Camera zoom: X in, Z out, wheel smooth; alive range 0.5×–1.5× of base framing; spectate zoom unchanged. Client-render-only.
9. Both input-pipeline ledger debts (server transport-coalescing press swallow; client keyboard FIFO cap drop) land in Story 2.1.

From `epic-2-context-amendments.md` (2026-07-25, Eric, Story 2.2 invocation):

10. Hotbar contains the Gun at the very top, keyless (stats + reload status must still display); order top-to-bottom is Gun – Q – E – R. This settles the gun-presentation seam flagged in the stale-doc warning above.

From `epic-2-context-amendments.md` (2026-07-25, Eric, Story 2.2 pre-implementation questions):

11. Hotbar slots are clickable, key-equivalent (weapon click primes / re-click reverts to gun; ability click activates; gun click selects gun); clicks over the hotbar never fire the gun.
12. The own-vitals interim move (telegraph/rudder/HDG/KTS to bottom-right, current style) lands in Story 2.2; Story 2.4 restyles in place.
13. Quick-info: weapons `DMG n · CD ns`, abilities `CD ns`; tooltip names/descriptions are draft placeholder copy, canon later.
