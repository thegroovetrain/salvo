---
title: 'Torpedo damage −100; phosphor burst 30 + burn 12/s'
type: 'chore'
created: '2026-11-24'
status: 'in-review'
baseline_revision: '59cc950165bfaa2a2e9c8a4b97bba82e2b2ce1e6'
review_loop_iteration: 0
context: []
warnings: []
---

<intent-contract>

## Intent

**Problem:** Batch sims (99 matches × 16 bots, even hull roster, 2026-11-23) show torpedoes taking 26 % of all kills and PHOSPHOR SHELLS winning 12–15 % of the time against a fair 6.3 % (2–4× the other special shells), dealing 35–60 % more damage. Eric: phosphor is *"the 'I want more damage' option out of the special shells, but it shouldn't be objectively the best one."*

**Approach:** Eric 2026-11-24: *"Lets go with the -100 to light/heavy/supercav torpedo base tier 1 damage."* and *"Lets drop the burst to 30 and burn to 12 per second."*

## Boundaries & Constraints

**Always:** `CONFIG.torpedo.damage` 200, `CONFIG.lightTorpedo.damage` 150, `CONFIG.supercavTorpedo.damage` 200, `CONFIG.phosphorShells.damage` 30, `CONFIG.phosphorShells.dps` 12 — whole numbers, Tier I base, tiers keep adding weapon POWER only. `PROTOCOL_VERSION` 114 → 115 (the client's card / weapon-box readouts read these values).

**Never:** touch the captive mine's torpedo (100), reloads, speeds, radii, durations, star shells (also 50 burst — not in Eric's ruling), or any other dial; pin the new numbers in a test; add UI or copy.

</intent-contract>

## Acceptance Criteria

- Given the shipped `CONFIG`, when a heavy / light / supercav torpedo hits a hull at Tier I with no armor difference, then it deals 200 / 150 / 200 hp.
- Given a Tier I phosphor shell bursting on a hull, when the hull stays in the burning zone for its full 8 s, then it takes 30 burst + 12 hp/s (about 126 hp).
- Given a client at PV 114, when it joins a PV 115 server, then it is refused with the version error.

## Tasks

- [x] `shared/src/constants.ts` — the five fields above.
- [x] `shared/src/index.ts` — `PROTOCOL_VERSION` 115 + its history line.
- [x] `VERSION`, `package.json`, `package-lock.json` — 0.20.12 (cycle 254).
- [x] `epic-12-context-amendments.md` — amendment 21.
- [x] Both trackers — one-line stamp.
- [x] `batch-sim-evidence-2026-11-24.md` — the pre-change and post-change campaigns.

## Auto Run Result

Status: in-review. Gate: `npm run check` (see PR). Post-change balance campaign on this branch: see `batch-sim-evidence-2026-11-24.md`.
