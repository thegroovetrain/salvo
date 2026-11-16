---
title: 'Story 11.11 — How-to-Play and Record'
type: 'chore'
created: '2026-11-16'
status: 'ready-for-dev'
baseline_revision: 'b5713a4f'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
warnings: ['multiple-goals']
---

<intent-contract>

## Intent

**Problem:** The How-to-Play page (`client/src/how-to-play/copy.ts`) is frozen at the Epic 8/9 game. It still teaches consumables on 1–4, SHIELD BLOCK, CHAFF, DECOY BUOY, passive regeneration and a deck-gun section, and it says nothing about the four battleships, C / V, beacons, airdrops, hectometer reaches, rain or the free camera. The GDD, architecture, catalog and DESIGN/EXPERIENCE docs still carry sentences that Epics 9–11 superseded (Story 11.11 owns Story 10.14 whole, epic-11 amendment 2).

**Approach:** Rewrite the page's copy for the game AS BUILT on `development` today (11.1, 11.2, 11.6, 11.7 and 11.8 built; 11.3 and 11.5 shelved; 11.4, 11.9 and 11.10 not built — Eric 2026-11-16: "we're skipping 11-10"). Keep every one of Eric's existing sentences that is still true, word for word, and draft the rest from code-verified facts in his register (terse naval, plain words, no numbers in entry descriptions). Every live catalog line becomes an entry, with a table derived from the sim. Then put dated supersession stamps on the stale design-doc sentences (stamps, never rewrites).

## Boundaries & Constraints

**Always:** facts come from the code, not the docs. The page stays inside Eric's 2026-08-19 scope ("steer, select weapons, upgrade, shoot", no glossary). Entry descriptions carry no digits; the numbers live in the derived tables. Keys render as keycaps, and no P, 5, CTRL or SPACE key appears in a keycap row. American spelling. The copy file's header says the copy is a DRAFT awaiting Eric's pass (the Story 7.3 / policyCopy R9 mould). Tests pin structure and coverage only, never a sentence or word (9.14 R3, no word-police).

**Block If:** a fact needed for a sentence cannot be verified from the code, or two code paths disagree about player-facing behavior.

**Never:** describe unbuilt Epic 11 features (radar knobs, ghosts, the arc, splash returns, weather arms) as live; add in-game copy; change gameplay, CONFIG, wire contract or `PROTOCOL_VERSION`; edit CLAUDE.md; rewrite or delete settled design-doc text; re-audition 10.13's sounds (that needs Eric's ear; report it as owed).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Live line | any non-stub `LINE_IDS` entry | page entry under its `boonName`, glyph, derived table where one exists | table builder must not throw |
| Stub line | `depthCharge` | no entry | — |
| Line with no tier/ship table | `hullRepair`, `smokeScreen`, addons | entry renders; table derived if a builder covers it, else none | no throw |
| Retired line | chaff, decoy buoy, shield block | no entry anywhere | — |

</intent-contract>

## Code Map

- `client/src/how-to-play/copy.ts` -- the page's sections, keycap rows and entries (the rewrite target)
- `client/src/how-to-play/weaponTables.ts` -- derived stat tables (`tierTable`, `shipUpgradeTable`, `consumableTable` → null)
- `client/src/how-to-play/main.ts` -- mounts sections; picks a table per entry kind
- `client/src/__tests__/howToPlay.test.ts` -- structure/coverage pins; the `AWAITING_COPY` set empties here
- `client/src/__tests__/weaponTables.test.ts` -- table derivation pins
- `shared/src/sim/catalog.ts` -- `LINE_IDS`, `isStubLine`; `client/src/ui/boonCopy.ts` -- `boonName`
- GDD, `catalog-v3.md`, `game-architecture.md`, `DESIGN.md`, `EXPERIENCE.md` -- stamp targets

## Tasks & Acceptance

**Execution:**
- [ ] `client/src/how-to-play/copy.ts` -- rewrite the sections for today's game: intro (win, storm, sinking, islands), CONTROLS (every live binding), HULLS, UPGRADES and the offer, MAIN GUNS AND SECONDARIES, WEAPONS (Q / E / R lines plus one-off add-ons), C / V, SHIP UPGRADES (five index rows), BEACONS AND AIRDROPS, SEEING (sight, radar, rain, smoke, hectometers, camera); drop every retired entry; refresh the header comment -- the page is stale
- [ ] `client/src/how-to-play/weaponTables.ts` + `main.ts` -- give the C / V ladders and the one-off add-ons a derived table if an existing row builder covers them; otherwise render no table; remove the dead `consumable` kind if nothing uses it -- every entry derives or omits, never throws
- [ ] `client/src/__tests__/howToPlay.test.ts` -- empty `AWAITING_COPY`, drop the retired-line tolerance, keep structure/coverage pins -- coverage is now total
- [ ] design docs -- dated supersession stamps (subagent) -- AC 2
- [ ] trackers, `epic-11-context-amendments.md` #18, `VERSION` / `package.json` 0.19.34, `deferred-work.md` (10.13 re-audition owed to Eric's ear) -- record

**Acceptance Criteria:**
- Given the built page, when a reader scans it, then every live non-stub catalog line has an entry under its card name, and no retired item (consumables, SHIELD BLOCK, CHAFF, DECOY BUOY, passive regeneration, RANGE, distance decay, the twelfths ladder) is taught as live.
- Given the controls table, when compared with the client's input bindings, then every key it names is bound and does what the row says.
- Given the design docs, when a stale Epic 9–11 sentence is read, then a dated stamp citing its amendment sits beside it and the original text is intact.
- Given `npm run check`, then it exits 0.

## Design Notes

Eric's surviving sentences are kept verbatim. Each one is re-checked against the code first; a sentence that is no longer true is rewritten as a minimal edit, not restyled (minimal-design-doc-edits rule).

## Verification

**Commands:**
- `npm test -w client` -- expected: green
- `npm run check` -- expected: exit 0

**Manual checks (if no CLI):**
- `npm run build -w client`, open `dist/how-to-play/index.html` through the built server (or vite preview in this worktree), and confirm that every section renders and no table cell reads `—` across a whole row
