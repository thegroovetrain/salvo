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
