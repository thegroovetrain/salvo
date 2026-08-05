---
title: 'DAMAGE CONTROL — the always-available heal spend'
type: 'feature'
created: '2026-08-04'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context-amendments.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Healing has no home in the spend economy. Story 2.1 deleted the interregnum REPAIR spend end-to-end (Eric: *"1-4 cards, no repair"*, PV 12), and epic-2 amendment 38 filed Eric's level-heal "TO THE FUTURE TTK PASS" — this cycle is that pass. Today every banked level must be spent on a permanent card, so a damaged hull has no way to convert progression into survival, and there is no reason to ever hold a point.

**Approach:** A permanent DAMAGE CONTROL strip beneath the refit band's four-card row — never drawn, never exhausted, always the last option. Spending a level on it restores 25 HP instantly and adds 25 HP to a regen pool that pays out at a fixed 5 hp/s. The four-card draw and the ratified UX-DR14 row geometry are untouched; heal is a sibling of the row, not a member of it.

## Boundaries & Constraints

**Always:**
- `CONFIG.offer.size` stays **4**. The strip is NOT a card: it is never drawn, never returned, never in `DeckState`, and never appears in `OwnShip.offer`.
- Heal is addressed by a reserved **negative** wire sentinel (`HEAL_CHOICE = -1`), never by an index into the offer — a positive sentinel would collide if offer size ever moves.
- Picking heal **consumes exactly one banked level** and **returns every drawn card of that offer to the deck** (`returnCards` over the whole front offer, no card leaves).
- Amounts are **flat on every hull**: 25 instant + 25 pooled, from `CONFIG.damageControl`. No maxHp scaling, no upgrade scaling.
- The pool **adds, never accelerates**: `repairHp += regenHp`, drained at a fixed `regenHp/regenMs` (5 hp/s). Two heals run 10s at 5 hp/s, never 5s at 10 hp/s.
- The pool drains on the **wall clock**. HP application clamps to `stats.maxHp`; overflow is lost, not banked.
- **Fail-closed guard:** a heal pick is rejected (`spendPoint` returns false, level stays banked, queue untouched) when the hull is dead OR `hp >= stats.maxHp`.
- `repairHp` resets to 0 on spawn, sink, respawn, and match boundary — exactly where `boostUntil` resets.
- The heal is **self-private**: `repairHp` rides `you` and nothing else; the `heal` event is a self-private signal-registry row. No observer-visible cue of any kind.
- `PROTOCOL_VERSION` 22 → 23, with a changelog entry in `shared/src/index.ts`.

**Block If:**
- The strip cannot be placed without shrinking the 216px cards, lifting the band, or violating the container-fit law (epic-2 amendment 47). Halt rather than compromise the ratified row.

**Never:**
- Never make the heal observable to anyone but its owner (ledgered as an Eric-gated revisit, not built here).
- Never add a channel, cast time, or movement penalty — the cost is the banked level and nothing else.
- Never edit DESIGN.md / EXPERIENCE.md / gdd.md in-cycle (house rule); record drift in the ledger.
- Never touch `CONFIG.deck` dials, catalog content, or `BOON_CATALOG` — this adds no card, so deck composition and rare density are byte-identical.
- Never let heal reach `applyBoon` — it is not a boon and must not run grant-time effects.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | alive, hp 100/175, pts 1 | hp → 125; `repairHp` 25; pts → 0; front offer's 4 cards all returned to deck; self-private `heal` event | No error expected |
| Pool adds | `repairHp` 15 mid-drain, second heal spent | hp +25 instant; `repairHp` → 40; rate stays 5 hp/s | No error expected |
| Full HP | alive, hp 175/175, pts 1 | Rejected. pts stays 1, `repairHp` unchanged, no event | `spendPoint` returns false; client strip renders inert + denied pulse |
| Dead hull | `alive: false`, pts 1 | Rejected. Level stays banked for respawn | `spendPoint` returns false |
| No levels | pts 0 | Rejected — no queue to consume | `spendPoint` returns false (existing empty-queue guard) |
| Overflow | hp 174/175, `repairHp` 0, heal spent | hp → 175 (24 clamped away); pool 25 drains over 5s against a full bar, all wasted | No error — ruled behavior |
| Storm overlap | outside ring (4 dps) with pool live (5 hp/s) | Net +1 hp/s for the pool's life; both apply independently | No error — accepted consequence |
| Sink mid-drain | `repairHp` 20, hull sunk | `repairHp` → 0; nothing carries through the death gap | No error expected |
| Malformed choice | `choice: -2`, `-99`, `null`, `"heal"` | Rejected, queue intact | Existing fail-closed validation; only exactly `-1` means heal |

</intent-contract>

## Code Map

- `shared/src/constants.ts` -- add `CONFIG.damageControl` (`instantHp`, `regenHp`, `regenMs`); rides the welcome config snapshot.
- `shared/src/types.ts` -- `HEAL_CHOICE = -1`; `SpendMsg.choice` doc; `OwnShip.repairHp`; `HealEvent` + `GameEvent` union member.
- `shared/src/index.ts` -- `PROTOCOL_VERSION` 22 → 23 + changelog entry (barrel re-exports).
- `server/src/game/world.ts` -- `ShipRecord.repairHp`; `spendPoint` heal branch (guards + `returnCards` over the whole offer); `tickRepairs(dtMs)` in the step order; resets beside `boostUntil` (lines ~727, ~821, ~862, ~2417).
- `server/src/game/signals.ts` -- `heal: selfPrivateSignal<HealEvent>('heal', ...)` row; the compile-time exhaustiveness check forces it.
- `server/src/game/frames.ts` -- mirror `repairHp` onto `OwnShip` (the `boostUntil` precedent).
- `client/src/config.ts` -- `CLIENT_CONFIG.refit` strip geometry (height, gap below row).
- `client/src/ui/upgradeMenu.ts` -- strip DOM + geometry in the pure band composer; inert/armed/denied states.
- `client/src/input/keyboard.ts` -- `Digit5`/`Numpad5` → `onRefitPick(HEAL_CHOICE)`; strip click routes the same path.
- `client/src/net/roomBindings.ts` + `client/src/audio/tones.ts` -- `heal` event → tone (catalog goes 23 → 24 tones).

## Tasks & Acceptance

**Execution:**
- [ ] `shared/src/constants.ts` -- add the `CONFIG.damageControl` block with provenance comment citing the 2026-08-04 rulings -- CONFIG is the single source of truth for every gameplay tunable.
- [ ] `shared/src/types.ts` -- add `HEAL_CHOICE`, `OwnShip.repairHp`, `HealEvent`; document the negative-sentinel rule on `SpendMsg.choice` -- the wire contract is one file.
- [ ] `shared/src/index.ts` -- bump `PROTOCOL_VERSION` to 23 with a changelog entry -- the join gate is the only guard against a stale client.
- [ ] `server/src/game/world.ts` -- `repairHp` field, `spendPoint` heal branch, `tickRepairs`, and the four resets -- the authoritative half; keep every function under complexity 10.
- [ ] `server/src/game/signals.ts` -- self-private `heal` row -- frames.ts must never see an unrouted event kind.
- [ ] `server/src/game/frames.ts` -- mirror `repairHp` owner-only -- the single spatial chokepoint stays the only exit.
- [ ] `client/src/config.ts` + `client/src/ui/upgradeMenu.ts` -- strip geometry and render, cards untouched -- UX-DR14 row must stay byte-identical.
- [ ] `client/src/input/keyboard.ts` -- digit 5 binding, modal-only like digits 1–4 -- refit-or-nothing chokepoint discipline.
- [ ] `client/src/net/roomBindings.ts` + `client/src/audio/tones.ts` -- heal tone -- the spend needs an audible confirmation like every other.
- [ ] `shared/src/__tests__/` + `server/src/__tests__/upgrades.test.ts` + `client/src/__tests__/` -- cover every I/O matrix row, plus a perception/goldenFrames pin that `repairHp` and `heal` never reach a non-owner -- the matrix is the test plan.
- [ ] `_bmad-output/implementation-artifacts/epic-2-context-amendments.md` -- append the seven 2026-08-04 rulings (amendments 58-64) -- amendments protocol: rulings need a durable home.
- [ ] `_bmad-output/implementation-artifacts/deferred-work.md` -- ledger the observability revisit and the DESIGN/EXPERIENCE drift -- house rule: no design-doc edits in-cycle.
- [ ] `VERSION` + `package.json` + `_bmad-output/implementation-artifacts/sprint-status.yaml` + `gds-workflow-status.yaml` -- 0.17.43 → 0.17.44 and both trackers -- every landed PR updates BOTH trackers.

**Acceptance Criteria:**
- Given a live match with any ship class, when the refit band opens, then the DAMAGE CONTROL strip is present below four unchanged 216px cards and the row is still 924px wide.
- Given a hull at full HP or a dead hull, when heal is picked by key or click, then the level count is unchanged and the strip shows the denied pulse.
- Given a damaged hull, when heal is picked, then HP rises by 25 immediately and by a further 25 over the next 5 seconds, and all four drawn cards are back in the deck.
- Given a heal spent while a pool is still draining, when both are live, then total delivered HP is the sum and the drain rate is still 5 hp/s.
- Given any observer other than the healing player, when frames are built, then no frame contains `repairHp` or a `heal` event for that hull.
- Given `npm run check`, when it runs, then lint, type-check, and all suites pass with the new coverage included.

## Design Notes

**Why a strip and not a fifth card.** Five 216px cards plus four 20px gaps is 1160px, leaving 60px of margin at the 1280×614 logical floor — and it would supersede UX-DR14. Dropping the draw to 3 would instead supersede amendment 38's four-different-lines law and thin every level's choice. The strip changes neither: it reads as "the thing that is always there" rather than "a card you happened to draw," which is also the truer description of the mechanic.

**Why pool-adds.** Refresh semantics (discard the remainder) teach timer-babysitting — the failure mode WoW patched out with the pandemic rule. Rate-stacking (PoE flasks) has no check here because, unlike every BR heal, this one has no channel to interrupt: three levels dumped at once would be 75 instant plus 15 hp/s. Pool-adds is timing-neutral — a level is always worth 50 HP — so the only question is *do I need HP now*, which is the intended tension. It also matches the house DoT precedent: overlapping burns stack per distinct *owner*, never per application from one source (`dotKey(ownerId, victimId)`, `world.ts:1938`).

**The regen mirrors the incendiary DoT, inverted.** `tickRepairs` is the structural sibling of `applyZoneEffects`/`burnShip`: per-tick fractional hp against a float, clamped, with no per-tick event spam (the client already gets live `hp` on every frame via `OwnShip.hp`).

## Verification

**Commands:**
- `npm run lint` -- expected: clean, no complexity violations (ESLint complexity ≤ 10).
- `npm test -w shared` / `npm test -w server` / `npm test -w client` -- expected: all pass, including new heal coverage.
- `npm run check` -- expected: lint + type-check + full suite green.
- `npm run build` -- expected: shared → client → server builds clean.

**Manual checks:**
- Open the refit band at 1280×614 and 1366×768: four cards at 216px, 924px row, strip below, nothing clipped or overlapping (container-fit law).
- Take damage, spend a heal, watch the HP bar jump 25 then climb smoothly for 5s; spend a second mid-drain and confirm the climb extends rather than steepens.
