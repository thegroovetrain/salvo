# Hullcracker RL scaffolding

Built 2026-08-24 (Eric-directed). **Status: bridge + env + PPO scaffold built
and smoke-tested end-to-end; no training has been run.** Tier-1 of the plan
discussed that morning — the reusable 80% of any future RL work. Tier-2
(league/population training, the "balance oracle") deliberately does not
exist yet.

## Architecture

```
rl/train_ppo.py  (torch PPO, reward weights live HERE)
rl/env_client.py (VecHullcracker → N worker processes)
        │  newline-delimited JSON over stdio
server/scripts/rl/worker.ts   (protocol; stdout reserved for protocol)
server/scripts/rl/env.ts      (gym-style reset/step over World + Match)
server/scripts/rl/features.ts (observation featurization)
```

The sim never leaves TypeScript — agents play the byte-identical shipped
game. RL agents are ordinary `role: 'captain'` hulls driven through
`world.submitInput` (the validated human input path) and observed through
`perception.observe` (the fogged anti-cheat boundary), so a policy is honest
by construction: it cannot see or do anything a human client couldn't.

## Contracts (FEATURE_VERSION 1)

- **Observation** (275 floats, see `features.ts` layout constants): own ship
  (15) · zone (8) · 8 nearest contacts ×8 · 6 remembered radar paints ×4
  (12s phosphor clock) · 4 nearest mines ×4 · 2 buoys ×4 · offer one-hot
  (4×28) · build copies (28). Bump `FEATURE_VERSION` on any layout change.
- **Action** (7 ints, MultiDiscrete): rudder(5) · throttle(5) · fire(2) ·
  bearing(16, relative) · range(8, fraction of gun reach) · slot(4) ·
  boost(2, activates the first non-weapon slot).
- **Reward components** (combined learner-side, never in TS):
  `[dmgDealt Δ, hpLost Δ, kills Δ, alive, win]`. Placements ride `info` at
  episode end.
- **Builds are randomized by the env** (uniform card off the offer; heal
  under 40% hp): domain randomization over builds, so a trained policy plays
  whatever it holds — and doubles as the high-skill instance of the
  randomized-assignment card-measurement design.

## Running

```
python3 rl/smoke.py                      # bridge smoke, no torch needed (~3s)
pip install -r rl/requirements.txt       # numpy + torch, only for training
python3 rl/train_ppo.py --workers 6 --agents 20   # self-play PPO
python3 rl/train_ppo.py --workers 4 --agents 4 --bots 16   # vs scripted bots
```

Throughput reference: ~166 decisions/s in one worker (2026-08-24 laptop, 6
cores); ~10⁹ agent-decisions/day at full parallelism. Basic-competence PPO
budgets (1e7–5e7) are hours; tactical play (1e8–1e9) is an overnight-to-week.

## Honest expectations

- The first converged policy WILL find a degenerate strategy; that is the
  loop working. Adjust reward weights (CLI flags), retrain. Budget several
  cycles before trusting any meta reading.
- Skill-shaped conclusions from a single self-play policy are one
  equilibrium, not "the meta." The tier-2 league (populations, exploiters,
  past-version pools) is what makes it an oracle, and it is not built.
- Known v1 simplifications: no lit-zone features, blip memory is rect
  centroids (not the raster), spends are env-randomized rather than a policy
  head, no recurrence (memory is the engineered blip buffer + nearest-K
  remembered contacts).
