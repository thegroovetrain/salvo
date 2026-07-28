# Epic 2 Context — Ratified Amendments

Durable, append-only record of ratified corrections to `epic-2-context.md` (bmad-dev-auto amendments protocol, Epic 1 retro Action #1). On any conflict with compiled epic context or planning docs, these entries WIN.

## 2026-07-24 — Eric rulings, Story 2.1 invocation (bmad-dev-auto 2-1)

Source: Eric, verbatim invocation arguments to the Story 2.1 dev-auto run.

1. **Refit window binding is TAB, a toggle — supersedes SPACE-hold.** TAB opens the upgrade/refit dialog; pressing TAB again closes it without choosing. This replaces the ratified "SPACE is hold, never toggle — absolute" design (epics.md Story 2.1 AC, EXPERIENCE.md refit flow) AND the interregnum bare-CTRL toggle. Eric: "Tab should open the upgrade dialog rather than space."
2. **In-modal picks: number keys 1–4 select a card; clicking a card also selects.** A click-pick selects the upgrade and closes the modal and must NOT fire the gun. Spending closes the modal.
3. **The ~150–200 ms post-release number-key grace window is superseded.** It existed to disambiguate keydowns around SPACE release. Under the TAB toggle, a number key's meaning is evaluated against the modal's open state at its own keydown; outside the modal, number keys are refit-or-nothing (they do nothing — the old digit slot-priming and the closed-window spend behavior are both deleted).
4. **Q E R F confirmed as the scheme; F is reserved specifically for the Foghorn.** Q/E = the two class-special slots, R = the pickup/extra slot (inert while empty), F = reserved, not a slot key — and its future occupant is the Foghorn (pre-rules Story 4.5's "binds the key with Eric"). Example given: Torpedo Boat Q = torpedo, E = speed boost, R = empty.
5. **Gun is default and always selected; weapon primes revert to gun.** Once a primed weapon (e.g. torpedo) is fired it automatically switches back to the gun; pressing its key again without firing also switches back to the gun.

## 2026-07-24 — Eric rulings, Story 2.1 pre-implementation questions (AskUserQuestion, this run)

Source: Eric, direct answers to the four surfaced questions.

6. **Refit modal is a full combat lockout.** While the TAB modal is open, no mouse click fires anything (helm stays live, sim never pauses). The modal closes only via a pick, TAB, or ESC. (Supersedes the "battle stays visible in every gap → clicks still fire" reading of the SPACE-hold-era refit flow.)
7. **Digits 1–4 pick cards only; REPAIR is removed.** Eric verbatim: "1-4 cards, no repair." The interregnum REPAIR HULL spend option (CTRL+E / HEAL_CHOICE) is deleted from the spend flow — client UI, bindings, and server acceptance. Today's offers carry 3 cards (digits 1–3); digit 4 becomes live when offers carry 4 cards (Story 2.7). This does NOT foreclose a future heal boon — the epic's "heal stays an open question" constraint refers to the boon catalog, not the interregnum repair row.
8. **Camera zoom ruling:** X zooms in, Z zooms out, wheel zooms smoothly; alive range 0.5×–1.5× of the base radar-fit framing; spectate zoom stays as-is (0.5×–1.0×, wheel only). Client-render-only; fog remains server-authoritative.
9. **Both input-pipeline ledger debts land in Story 2.1:** the server transport-coalescing press swallow (evaluate every received input's fire/act intent via a small per-tick queue; rate cap already bounds it) and the client keyboard FIFO cap drop (denied feedback instead of silence).

## 2026-07-25 — Eric ruling, Story 2.2 invocation (bmad-dev-auto 2-2)

Source: Eric, verbatim invocation arguments to the Story 2.2 dev-auto run.

10. **Hotbar contains the Gun at the very top, keyless; order top-to-bottom is Gun – Q – E – R.** The Gun keeps its hotbar slot even though it no longer has (nor requires) a hotkey, because its stats and reload status must still be displayed. This settles the seam flagged in epic context ("how the always-selected standard gun is presented in a four-slot hotbar under the new mapping"): four slots, Gun (no key chip) on top, then Q and E (class specials), then R (pickup/extra) at the bottom.

## 2026-07-25 — Eric rulings, Story 2.2 pre-implementation questions (AskUserQuestion, this run)

Source: Eric, direct answers to the three surfaced questions.

11. **Hotbar slots are clickable, key-equivalent; clicks over the hotbar never fire the gun.** Clicking a weapon slot primes it (same semantics as its slot key, including revert-to-gun on re-click); clicking an ability slot activates it; clicking the gun slot selects the gun. A click over any hotbar slot is swallowed — it never falls through to fire at the water beneath. (Chosen over display-only and fire-through options.)
12. **Own-vitals interim move lands in Story 2.2.** The telegraph ladder, rudder gauge, and HDG/KTS readouts move from bottom-left to bottom-right (joining the HP bar) in their current visual style, freeing the ratified bottom-left corner for the hotbar. Story 2.4 restyles the cluster in place.
13. **Quick-info line: weapons show `DMG n · CD ns`, abilities show `CD ns`.** Real values from effectiveStats/CONFIG, updating live with upgrades. All equipment names/descriptions written for the tooltip are draft placeholder copy (like boon copy — Open Question 14's rule), canon later.

## 2026-07-26 — Eric ruling, Story 2.3 invocation (bmad-dev-auto 2-3)

Source: Eric, verbatim invocation arguments to the Story 2.3 dev-auto run.

14. **The legibility complaint is ratified Story 2.3 scope.** "A lot of text on the main page is VERY SMALL. The hotbar text is VERY SMALL and also HARD TO SEE (any grey text is borderline invisible, why … isn't it the same color as the rest of the CIC display, or at LEAST bright white)." Eric has raised the small-font problem to past sessions repeatedly; it is now mandatory work, not polish.

## 2026-07-26 — Eric rulings, Story 2.3 pre-implementation questions (AskUserQuestion, this run)

Source: Eric, direct answers to the surfaced questions.

15. **Micro-type lift is the HUD-match ~1.6× treatment** (the same fix that resolved the 2026-07-13 "everything tiny" playtest for the HUD): 9px→14, 10px→16, 11px→17, 12px→18, 13px→20. The `hudMicro`/`label` type-ramp registers move with it (9→14, 11→17); DESIGN.md's 9px `hud-micro` pin is superseded (doc-sync separately — no design-doc edits in-story).
16. **Hotbar de-grey: phosphor data + white names.** Key chips, quick-info (`DMG n · CD ns`), and the reload countdown render CIC phosphor (`#00ff88`, same family as HDG/KTS readouts); slot names render bright white (`textPrimary` #e2e8f0). Cooling/empty states dim these same colors (~0.7 alpha) instead of switching to grey — state grammar survives, grey text dies.
17. **Legibility-pass scope is ALL surfaces shipping micro/grey text:** home page, class bay, hotbar, plus results table headers, kill feed, upgrade-card metadata, banners, and the 9px over-ship nameplates. Grey (`textMuted`/`textSecondary`) is retired for load-bearing text everywhere (drone-identity greyscale is identity, not text — unaffected).
18. **CVD assist palette is implementer-drafted.** Eric: "I don't care. Just make it happen." The ~8-family regroup of the 20 Regatta hues, the boosted blip outline, and the raised minimum decayed-blip opacity are drafted in-code (draft-copy rule — canon later); acceptance = families distinguishable under simulated deuteranopia at blip scale.
19. **ABANDON MATCH and RESET SETTINGS both ship in the 2.3 settings overlay.** Eric: "There needs to be a mechanism for leaving a match other than just refreshing the page." Abandon is danger-styled, confirm-gated, live-match-only, and returns to port cleanly; reset restores the overlay's settings to defaults.
20. **"Standard Gun" is renamed "Deck Gun"** in all player-facing copy.
21. **ESC is a toggle for the settings overlay in-game** (Eric, mid-run message this session): while in a match with no other surface open, ESC opens the settings overlay; ESC again closes it. With the refit modal open, ESC closes the refit modal (not settings). *(The "results ESC returns to port" clause originally recorded here is superseded by amendment 22.)*
22. **Elimination flow re-ruled; ESC never returns to port** (Eric, mid-run correction this session): being eliminated immediately opens the results modal with SPECTATE (closes modal → spectate, only while the match is live) and RETURN TO PORT buttons; the old silent auto-spectate is replaced. Leaving the match is via the modal's RETURN TO PORT or settings' ABANDON MATCH — never via ESC, never a page refresh. At game end the results modal keeps RETURN TO PORT; Enter still confirms it. *(This entry's original "settings opens on top of the results modal" clause is superseded by amendment 23.)*
23. **ESC is strictly topmost-close; settings never stacks; results modal shows the personal score** (Eric, mid-run correction this session). Verbatim: "Settings menu MAY NOT open over the results modal. Per the rule you already decided with respect to the upgrade modal, if ESC is pressed while the results modal is opened, it closes the … modal just like if spectate was pressed." The uniform law: ESC closes the topmost open surface (refit modal, results modal, settings); only when nothing is open does ESC toggle the settings overlay. Closing the elimination modal via ESC = pressing SPECTATE; from spectate, ESC then opens settings (whose ABANDON MATCH is how "you can leave the match from here"). Modal content: "your personal score (how many upgrades you got, how many kills you got, and a list of all of the contestant-controlled ships you personally sunk) and what place you were eliminated in. If you were the winner (you were never eliminated or otherwise came in first) then it should indicate that."

## 2026-07-27 — Eric rulings, Story 2.4 pre-implementation questions (AskUserQuestion, this run)

Source: Eric, direct answers to the four surfaced questions.

24. **HDG/KTS readout values stay CIC phosphor.** The v2 composite mock's white (#E2E8F0) readout values are superseded — the 22px tabular HDG/KTS values render phosphor (`#00ff88`), the same data family amendment 16 pinned for hotbar quick-info ("same family as HDG/KTS readouts").
25. **Cluster micro labels render dim phosphor, never grey.** The HULL caption, unit suffixes (KTS), RUDDER label, and AHEAD/ASTERN captions render phosphor at ~0.7 alpha (amendment 16's dim-not-grey doctrine); the mock/DESIGN.md muted-grey (#7A8496) treatment of these labels is superseded — the cluster reads as one phosphor instrument.
26. **Helm key glyph fade: 3 successful inputs per pair, permanent.** W/S (successful telegraph steps) and A/D (rudder holds) fade independently, each after 3 successful inputs; progress persists under a standalone `hullcracker.*` localStorage key that survives reloads AND RESET SETTINGS (learned component anatomy, not a setting).
27. **HP rail widens to ~6px.** The mock's 3px width is superseded for the HP rail only — "mirrors the XP rail" is idiom (vertical rail, same track style), not width parity; Story 2.6's XP rail stays 3px per UX-DR12.

## 2026-07-28 — Eric rulings, Story 2.5 pre-implementation questions (AskUserQuestion, this run)

Source: Eric, direct answers to the three surfaced questions.

28. **Story 2.5 ships full dormant plumbing, not a shared-only engine.** Beyond the shared engine (boons.ts, hooks.ts, effectiveStats/loadout extensions, HOOK_REGISTRY parity suite, test boons over all four effect kinds): `ShipRecord.boons` + a `World.applyBoon` seam mirroring `applyUpgrade`, hook execution wired into the real server tick and the real client predictor, and a self-private `you.boons` wire field with a `PROTOCOL_VERSION` bump. Everything is dormant until 2.7's offer/spend flow — nothing grants boons in production this story.
29. **The speed boost stays bespoke — it is NOT migrated onto the hook engine.** Boost keeps its direct `boostedKinematics` path until the 2.8 catalog re-expresses it. `HOOK_REGISTRY` therefore ships empty (the registry-iterating parity suite is structurally armed but iterates zero real entries until the catalog lands); test hooks live in test-injected registries, never in the production registry.
30. **The v1 engine defines exactly one hook attachment point: per-tick kinematics** (the ratified boost precedent). On-hit, on-activate, timed-hp, etc. are added by catalog stories exactly when a real boon needs them, each forced into parity coverage by the registry suite. The hook CONTRACT stays generic and heal-compatible by design; no speculative call sites ship.
