---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments:
  - '_bmad-output/implementation-artifacts/spec-2-10-economy-batch-sim-harness.md'
  - '_bmad-output/implementation-artifacts/deferred-work.md'
  - '_bmad-output/planning-artifacts/epics.md'
  - 'server/scripts/batchsim/pilots.ts'
workflowType: 'research'
lastStep: 1
research_type: 'technical'
research_topic: 'RL Agents for Game-Balance Evidence (Hullcracker)'
research_goals: 'Determine whether reinforcement learning is a credible route to balance evidence for a real-time gridless naval battle royale, at what stage it should be pursued, and what cheaper alternatives (heuristic/utility bots, randomized-build causal designs) buy at a fraction of the cost. Feeds a follow-on bmad-forge-idea session.'
user_name: 'Eric'
date: '2026-08-10'
web_research_enabled: true
source_verification: true
---

# Research Report: technical

**Date:** 2026-08-10
**Author:** Eric
**Research Type:** technical

---

## Research Overview

Hullcracker already owns a deterministic, Colyseus-free in-process batch-sim harness (Story 2.10) whose AR12 seam explicitly reserves a third duty: bot-vs-bot. Four balance questions sit in `deferred-work.md` blocked on evidence that duty would produce. This research asks whether **reinforcement learning** is the right way to fill that seam, or whether heuristic/utility bots plus a randomized-build causal design capture most of the value at a fraction of the cost.

**Method:** current web sources, multi-source validation on load-bearing claims, explicit confidence levels. Claims that cannot be sourced are marked as such rather than smoothed over. Where a fetched summary contradicted itself, the source was re-verified before use (see Source Integrity Notes).

**Headline finding.** Evidence quality here is governed by **experimental design, not agent sophistication**. The harness's most valuable and entirely unused property is that it can *randomize* build assignment — placing Hullcracker at the gold standard of causal inference that no live-service game can reach. Three findings survive any budget: hull balance is **structurally unreadable** from self-play convergence in a 20-player free-for-all (multiple equilibria with different player values); the randomized design is not a cheap approximation of the RL design but a *prerequisite* for it (rarely-chosen options are out-of-distribution, so their Q-values are optimistically biased); and a trained policy is **invalidated by every tuning change it exists to inform**. The proposal's best idea — reading intent out of a value function — is real, published, and richer than proposed (**action gap** / **RDX / MSX**), but belongs behind a trigger rather than at the front.

**Recommendation in one line:** build the randomized-draft RCT now with today's scripted pilots; make the Stage 0 → Stage 1 comparison the headline experiment; adopt Bayesian optimization rather than the RL half; gate RL behind a named trigger.

→ **Full findings, staged roadmap, risk register, and open gaps: see the Executive Summary and §8–§10 in the synthesis below.**

---

## Technical Research Scope Confirmation

**Research Topic:** RL Agents for Game-Balance Evidence (Hullcracker)

**Research Goals:** Determine whether RL is a credible route to balance evidence for a real-time gridless naval battle royale; at what stage it should be pursued; and what cheaper alternatives buy. Feeds a follow-on `bmad-forge-idea` session.

**Scope remap.** This skill's default dimensions (databases, cloud providers, IDEs) target technology-selection research. This is a methodology-feasibility question under a hard budget constraint, so the six workflow steps were remapped onto six sub-questions, confirmed with Eric before any search:

| Step | Sub-question |
|---|---|
| 02 — Overview | **Q1** Prior art on agent-driven balance evaluation + actual budgets + tooling landscape |
| 03 — Integration | **Q5** Stack reality: TS/Node sim ↔ Python training bridge, throughput, parallelization |
| 04 — Architecture | **Q2** Partial observability / CTDE · **Q6** Asymmetric self-play in 20-player FFA |
| 05 — Implementation | **Q3** Reading intent from a policy (Q-gaps) · **Q4** Causal vs revealed-preference designs |
| 06 — Synthesis | Recommendation and staging |

**Out of scope:** implementation of Epic 6.4's bots; any actual balance numbers. This run decides *method*, not tuning.

**Scope Confirmed:** 2026-08-10

---

## Q1 — Prior Art, Real Budgets, and the Tooling Landscape

### The landscape splits into four distinct approaches

The literature on using agents to *evaluate* balance (rather than to win) is real but younger and thinner than the general game-RL literature. Four families are distinguishable:

1. **Scripted / heuristic agents.** The dominant baseline. Balance is read by simulating a level or matchup many times with identical heuristic agents and comparing victory frequency. The recognized weakness is that heuristic approaches "include domain-specific information and cannot be transferred," which motivated later work on game-domain-independent reward functions.
2. **RL agents as playtesters.** Deep RL plus curriculum learning to playtest levels for both QA and balancing; curiosity-driven variants to improve coverage; human-like play-style generation so agent feedback is meaningful to designers.
3. **RL as the balancer itself.** Balance framed as procedural content generation — an agent receives reward for adjusting a *level* toward a balance objective such as equal win rates.
4. **LLM agents + black-box optimization.** The newest family, and the closest published analogue to the proposal on the table (below).

_Confidence: High that these four families exist and are active; Moderate on relative maturity, since no single survey ranks them._

_Sources:_
- https://arxiv.org/abs/2304.08699 — Assessing Video Game Balance using Autonomous Agents
- https://arxiv.org/pdf/2103.13798 — Improving Playtesting Coverage via Curiosity Driven RL Agents
- https://arxiv.org/abs/2211.17188 — Automated Play-Testing Through RL Based Human-Like Play-Styles Generation
- https://arxiv.org/pdf/2306.04429 — Balancing of Competitive Two-Player Game Levels with RL
- https://arxiv.org/pdf/2503.18748 — Simulation-Driven Balancing of Competitive Game Levels with RL

### What the frontier results actually cost

The headline self-play results are **not** a template a solo developer can scale down from; they are the reason to look for a different design.

| System | Reported budget |
|---|---|
| **OpenAI Five** (Dota 2) | 770 ± 50 PFlops/s·days over **10 months**; 256 GPUs + 128,000 CPU cores; ~1M frames/sec |
| **AlphaStar** (StarCraft II) | 32 TPUv3 per agent × 44 days, 12 agents; third-party replication estimate ≈ **$3.2M** |
| **Tom & Jerry** (asymmetric multiplayer, AET) | 98.5% win rate vs top humans over 65 matches, no human data; **compute not disclosed in the abstract** |

The relevant lesson is not the dollar figure but the *shape*: these budgets bought **superhuman play**, which is a far stricter target than "human-plausible enough that its preferences are evidence." Nothing in this table establishes what a *balance-evaluation-grade* agent costs — that is a genuine gap in the literature and the single biggest uncertainty in this research.

_Confidence: High on OpenAI Five figures (primary paper + OpenAI's own compute post). Moderate on the AlphaStar aggregate — one retrieved figure ("1056 TPU hours") is arithmetically inconsistent with 32 TPUs × 44 days × 12 agents and is treated as garbled; the per-agent figure and the replication-cost estimate are reported instead._

_Sources:_
- https://arxiv.org/pdf/1912.06680 — Dota 2 with Large Scale Deep Reinforcement Learning
- https://openai.com/index/ai-and-compute/ — AI and Compute
- https://arxiv.org/abs/2304.10124 — Mastering Asymmetrical Multiplayer Game with Multi-Agent Asymmetric-Evolution RL

### The closest prior art to the proposal uses no RL at all

**RuleSmith** (2026) is the nearest published analogue to "agents play, an LLM interprets, the game gets rebalanced" — and it is the most consequential finding in this step.

- **Method:** two InternVL3.5 LLM agents (2B or 8B) play asymmetric factions in CivMini, a 7×7 turn-based strategy game, reading natural-language rulebooks and emitting structured JSON actions. **Policy learning is absent entirely** — the agents are zero-shot. Bayesian optimization with a Gaussian-process surrogate then searches a 12-dimensional *rule-parameter* space, minimizing a balance loss `ℒ(θ) = |w_E − 0.5| + |w_N − 0.5| + 0.5·w_D`.
- **Budget:** 100 optimization iterations × 16–64 games each ≈ **3,500 total games**, ~**40 hours on 8× A100 80GB**. Adaptive sampling spends more games on promising candidates (64) and fewer on exploratory ones (16).
- **Result:** converged to near-equal win rates (51|49).
- **Stated limitations, all of which bite here:** LLM agents are "imperfect proxies for human players"; CivMini is "simplified, abstract" with **fully observable state** — no partial observability; no guarantees of global optimality or robustness under distribution shift.
- **The critical failure mode:** cross-evaluation showed that **parameters optimized against one agent strength broke badly against another** — a 24|76 split in one configuration.

That last point is the load-bearing warning for Hullcracker, and it is the published version of a concern already in the project's own ledger (the "Battleship wins 50% of instrument endgames … plausibly instrument-inflated" entry). **Balance conclusions are conditional on the strength of the agent that produced them.** An agent-derived balance patch can be actively wrong for a different skill tier.

Two things RuleSmith did *not* need are worth naming: it needed no RL, and its adaptive-sampling budget allocation is a technique directly reusable at Hullcracker's scale.

_Confidence: High — fetched from the paper's own HTML with numbers quoted directly._

_Source:_ https://arxiv.org/html/2602.06232v1 — RuleSmith: Multi-Agent LLMs for Automated Game Balancing

### Industry practice: what shipping teams actually do

Two independent industry data points, and they point the same way.

**EA (Battlefield 2042, Dead Space 2023).** The published account is explicitly about integrating "an experimental reinforcement learning system with an existing automated testing solution **based on scripted bots** to expand testing capacity." RL *augments* a scripted-bot system rather than replacing it. The paper's framing — "going from research to production … is fundamentally a hard problem," and its stated aim of documenting "the largest time sinks anyone who wants to make the same journey for their game may encounter" — is a caution, not an endorsement. _(The full-text cost/benefit comparison could not be extracted; the PDF returned binary. Detailed conclusions remain unverified — flagged for step 5.)_

**Riot (League of Legends).** The largest live-service balance operation in the industry balances on **ranked player data, not bots**. Two of its methodological choices transfer directly:

- At small sample sizes Riot substitutes **presence (pick + ban aggregate) for win rate**, explicitly because "the sample size on any given patch makes it a less reliable measure of power" — at most ~200 pro matches per patch. This is the professional version of the sample-size problem: **~200 matches is considered too few to trust win rate**, which calibrates the "100 games per ship" instinct sharply downward in adequacy.
- Riot balances for four distinct player-skill categories rather than one, having moved off a single "balance for Plat+" target — the same agent-strength-conditionality that broke RuleSmith's cross-evaluation, solved by segmenting rather than by picking one reference skill.

And the direct statement, which matters for how any Hullcracker result should be read: **"a champion could still be balanced without having a 50% win rate."** Equal win rates are a modeling convenience, not the definition of balance.

_Confidence: High on Riot's stated methodology (official /dev post + press coverage). Moderate-to-High on the EA framing (abstract verified; full text not extracted)._

_Sources:_
- https://arxiv.org/abs/2307.11105 — Technical Challenges of Deploying RL Agents for Game Testing in AAA Games
- https://www.leagueoflegends.com/en-us/news/dev/dev-balancing-for-pro-play/ — /dev: Balancing for Pro Play
- https://www.pcgamer.com/league-of-legends-team-reveals-new-method-to-decide-if-champions-are-overpowered/

### The tooling landscape

- **Python is the ecosystem, effectively without competition.** Gymnasium (Farama, the maintained fork of OpenAI Gym) is the standard single-agent API; PettingZoo is its multi-agent sibling. The JS/TS side is sparse — on the order of 8 JavaScript and 5 TypeScript projects tagged as RL environments on GitHub, against a Python ecosystem of hundreds.
- **Cross-language bridging is a solved-but-manual pattern.** A 2026 write-up of the equivalent Java problem evaluates Py4J vs ZeroMQ and lands on **ZeroMQ**, "a brokerless messaging library with zero-copy optimizations." No standard TS↔Gymnasium bridge exists; this would be hand-built.
- **Vectorized environment execution is where throughput actually comes from.** EnvPool reports ~1M frames/sec on Atari and ~3M on MuJoCo on a high-end machine, and **2.8× the speed of Python subprocessing on a laptop** — the laptop figure being the relevant one for a solo developer. This matters because it establishes that the bottleneck in a well-built setup is environment stepping, which is exactly where a 42µs/tick in-process TS sim is *already strong*.

_Confidence: High on ecosystem asymmetry and Gymnasium's status; Moderate on the bridging recommendation (single recent source, different source language)._

_Sources:_
- https://github.com/farama-foundation/gymnasium
- https://javapro.io/2026/07/29/connecting-java-reinforcement-learning-to-python-gymnasium/
- https://github.com/topics/reinforcement-learning-environments?l=python

### Q1 interim assessment

Three findings materially change the decision, ahead of the remaining sub-questions:

1. **The nearest published analogue to the proposal achieved its goal without RL** — zero-shot agents plus Bayesian optimization over parameters, ~3,500 games. This raises the burden of proof on the RL half specifically.
2. **Balance conclusions are conditional on agent strength**, demonstrated as a concrete failure (24|76 cross-evaluation) and independently corroborated by Riot's move to multi-tier balancing. This is a *method* risk that no amount of compute removes, and it is already anticipated in Hullcracker's own ledger.
3. **Industry deploys RL as an augmentation of scripted bots, not a replacement**, and the largest balance operation in the field uses human data with win rate explicitly demoted at low sample sizes.

None of this kills the idea. It does relocate the burden: the case for RL now rests almost entirely on **Q3** — whether a learned value function yields the "what did the agent want" signal that heuristics and outcome regression cannot produce. If Q3 fails to verify, the cheaper path dominates on this evidence.

### Source integrity notes

- A PDF fetch of arXiv:2304.10124 returned a summary claiming the paper concerned StarCraft II with "two asymmetric factions (Protoss, Terran, Zerg)" — self-contradictory, and false. The abstract page confirms the game is **Tom & Jerry**. The fabricated summary was discarded, not used.
- PDF fetches of arXiv:2307.11105 and arXiv:2503.18748 returned unparsed binary. Their conclusions are recorded as **unverified** and deferred to step 5 rather than inferred.

---

## Q5 — Stack Reality: Integration, Throughput, and the Budget Arithmetic

### The budget arithmetic: correct math, wrong unit

The stated estimate was ~18k ticks per 15-minute match at 20Hz, 42µs/tick → 0.76s/match sim-only, ×5–10 for per-agent `observe()` across 20 ships, → **45–90 CPU-days for 1e6 episodes**.

**Every step of that arithmetic checks out.** 15 × 60 × 20 = 18,000 ticks; 18,000 × 42µs = 0.756s; 1e6 × 0.756s = 8.75 CPU-days; ×5–10 = 44–88 CPU-days. Confirmed.

**The premise underneath it does not.** RL training budgets are denominated in **environment steps, not episodes**. 1e6 episodes × 18,000 ticks = **1.8 × 10¹⁰ environment steps**. Against the published norm for multi-agent PPO — "typically trained for 10-25 million environment steps," with harder variants at 50M — the proposed budget is roughly **360× to 1,800× the benchmark norm**. That is not a hobby-scale RL run; it is within an order of magnitude of OpenAI Five's regime.

Inverted, the picture is dramatically better than the estimate implied:

| Budget scenario | Env steps | ≈ Episodes (18k ticks) | Sim-only, 1 core | ×10 for perception |
|---|---|---|---|---|
| MAPPO benchmark norm | 25M | ~1,390 | **~18 min** | ~3 h |
| Harder benchmark variants | 50M | ~2,780 | ~35 min | ~6 h |
| Ambitious for a game this deep | 1×10⁹ | ~55,600 | ~11.7 h | ~5 days |
| The stated 1e6-episode budget | 1.8×10¹⁰ | 1,000,000 | 8.8 days | 44–88 days |

**The correction that matters: at a realistic training budget the simulation cost is hours, not months.** The 45–90 CPU-day figure is an artifact of choosing an episode count ~360× larger than the literature norm, not a property of the harness. The harness is not the obstacle it appeared to be.

Two honest caveats. First, benchmark norms (SMAC, MPE, Hanabi) are *simpler* than Hullcracker — partial observability, 20 agents, a mid-match draft, and a 15-minute horizon all push the real number up, plausibly to the 1e8–1e9 band. Second, **no source establishes what a balance-evaluation-grade agent costs for a game of this specific complexity** — this remains the research's largest gap, carried forward from Q1.

_Confidence: High on the arithmetic; High on the step-vs-episode unit correction; Moderate on where Hullcracker actually lands in the 25M–1e9 range._

_Sources:_
- https://ar5iv.labs.arxiv.org/html/2103.01955 — The Surprising Effectiveness of PPO in Cooperative Multi-Agent Games
- https://bair.berkeley.edu/blog/2021/07/14/mappo/ — BAIR: MAPPO

### The sim is not the bottleneck — inference probably is

At 42µs/tick the harness sustains **~23,800 ticks/sec/core**. For scale, Sample Factory — purpose-built for high throughput — reports "as high as 130,000 FPS … on a single multi-core compute node with only one GPU" on 3D-pixel environments, and EnvPool reports ~1M frames/sec (Atari) and ~3M (MuJoCo) on a high-end machine. Against those, a single-threaded TypeScript sim at 24K steps/sec/core is **genuinely competitive for its domain**. The in-process TS harness is an asset here, not a liability.

The cost that the estimate omits entirely is **policy inference**. Twenty agents each need a forward pass per tick. A small MLP forward on CPU runs roughly 10–50µs; done naively, one per agent, that is 200µs–1ms per tick — **5–25× the simulation cost**, inverting which side is the bottleneck.

**Batching collapses it.** A single batched forward over 20 observations costs on the order of 1–3 individual forwards, not 20. This is exactly the problem Sample Factory's *Double-Buffered Sampling* ("allows network forwarding and environment execution to run in parallel but on different subsets of the environments") and EnvPool's batched async `send`/`recv` interface exist to solve. Any implementation must batch the roster's forward passes; doing so is the difference between inference dominating and inference being noise.

Two further findings argue against reaching for a GPU:

- Direct guidance from the RL-infrastructure literature: *"If the observation size is small, the environment simulation speed is slow, and the policy model is simple (e.g. a feed-forward network), inline CPU inference is usually sufficient."* Hullcracker matches **all three** conditions.
- Data transfer over PCIe "can be as much as 50 times slower than the GPU processing time alone" — for a small policy, GPU inference is likely a pessimization, not an optimization.

_Confidence: High on Sample Factory and EnvPool figures (primary papers); High on the inline-CPU-inference guidance; Moderate on the 10–50µs MLP forward estimate (engineering rule of thumb, not sourced — treat as an order-of-magnitude planning figure to be measured, not trusted)._

_Sources:_
- https://arxiv.org/abs/2006.11751 — Sample Factory: Egocentric 3D Control from Pixels at 100000 FPS
- https://arxiv.org/pdf/2206.10558 — EnvPool: A Highly Parallel RL Environment Execution Engine
- https://www.emergentmind.com/topics/gpu-accelerated-rl-training-pipeline
- https://arxiv.org/pdf/2103.07013 — Large Batch Simulation for Deep Reinforcement Learning
- https://rlj.cs.umass.edu/2025/papers/RLJ_RLC_2025_151.pdf — PufferLib 2.0: RL at 1M steps/s _(title-level claim only; PDF returned unparsed binary)_

### Three integration architectures

**A · Per-tick IPC bridge (ZeroMQ or gRPC).** Node steps the sim, ships one observation across the boundary, blocks for one action. At ~24K ticks/sec/core this means ~24K round-trips/sec/core. ZeroMQ is the recommended transport where this pattern is needed — a 2026 treatment of the equivalent Java problem evaluates Py4J vs ZeroMQ and lands on ZeroMQ as "a brokerless messaging library with zero-copy optimizations." **But per-step IPC is the classic mistake this literature exists to correct**, and EnvPool's entire design is a repudiation of it.

**B · Batched rollout worker (the EnvPool pattern).** Node runs N environments, steps them all, ships a *batch* of observations, receives a *batch* of actions. IPC is amortized over N envs and the batched forward pass is free as a side effect. EnvPool's async mode additionally processes "the fastest `batch_size` environments without waiting for all `num_envs` to complete, effectively mitigating the 'long-tail' problem." **This is the correct architecture for training.**

**C · ONNX inference in Node — no bridge at all.** Train in Python, export the policy to ONNX, run it in-process via `onnxruntime-node` (Node v16+, v20+ recommended). Rollouts stay entirely inside the existing harness; only *weights* cross the language boundary, periodically.

### The architectural finding that matters most

**Balance evidence does not require training in the loop.** It requires running a *fixed* policy across thousands of matches and collecting distributions. That is pure inference — and Option C puts it behind the harness's existing `CaptainPilot` seam with **zero new infrastructure**.

Concretely: `PILOT_REGISTRY` already maps names to `PilotFactory`, and the runner already drives `CaptainPilot` once per tick via `world.submitInput()`. A trained policy becomes one more registry entry whose `CaptainPilot` calls `onnxruntime-node` instead of a hand-written heuristic. Every existing property survives — seeded determinism, the reproducible run key, the sweep machinery, the report pipeline — because nothing about the harness changes.

This splits the project cleanly along its real cost seam:

- **Training** needs the Python bridge (Option B) and is a **one-time** cost, run offline, thrown away afterwards.
- **Evidence generation** — the thing that actually answers the balance questions, and the thing that gets re-run after every tuning change — needs **no bridge whatsoever**.

That is a much better cost structure than "stand up an RL pipeline," and it means the evaluation half can be built and validated with a *heuristic* pilot first, then have a learned policy swapped in behind the identical interface if and only if Q3 justifies it. The AR12 seam already anticipated this.

**One determinism caveat, specific to this harness.** The 2.10 spec pins reproducibility as a property: "same key → identical report." A neural policy evaluated **greedily (argmax)** preserves that. A **sampled** policy does not, unless its sampling draws from a seeded stream threaded through the same `mulberry32` discipline as everything else. Since stochastic policies are the norm in PPO, this is a real trap: it would silently break a guarantee the harness currently enforces and tests for.

_Confidence: High — `onnxruntime-node` is a published Microsoft package with documented Node version support; the seam claim is verified against `pilots.ts` and the 2.10 spec in-repo._

_Sources:_
- https://www.npmjs.com/package/onnxruntime-node
- https://onnxruntime.ai/docs/get-started/with-javascript/
- https://javapro.io/2026/07/29/connecting-java-reinforcement-learning-to-python-gymnasium/
- https://arxiv.org/pdf/2206.10558 — EnvPool

### Q5 interim assessment

1. **The 45–90 CPU-day figure is not a real obstacle.** The math was right; the episode budget was ~360× the literature norm. At realistic budgets, simulation cost is hours to days.
2. **The sim is fast; inference is the likely bottleneck** — and batching the roster's forward passes, plus staying on CPU, removes it. No GPU is indicated for a policy this small.
3. **The bridge is a training-only cost.** Evidence generation runs bridgeless via `onnxruntime-node` behind the existing `CaptainPilot` seam, preserving determinism, sweeps, and reporting.
4. **Stochastic policies would break the harness's reproducibility guarantee** unless sampling is seeded through the existing RNG discipline.

Stack feasibility is therefore **not** the constraint on this decision. The constraint remains method — Q2/Q6 (can a perception-honest agent be trained at all at this scale) and above all Q3 (does a learned policy yield a signal heuristics cannot).

---

## Q2 — Partial Observability: What Perception-Honesty Actually Costs

### The good news: the training architecture is already available for free

The standard answer to partial observability is **CTDE — centralized training, decentralized execution**: "leverage additional global or joint information during training … to produce policies capable of decentralized execution, where each agent acts solely on its local observation." The literature notes this is now the default: "in many environments, complete states are observable during the training phase, and utilizing full observable states during training has emerged as a popular paradigm in RL."

Hullcracker is an unusually clean fit. The server already holds ground truth (`world.ships`), and `perception.observe()` is already the exact, tested, anti-cheat-enforced function that maps ground truth → what one observer legitimately knows. **The actor's observation function already exists and is already the game's security boundary.** A centralized critic reads `World` directly; a decentralized actor reads `observe()`. No new perception code is required, and CTDE is reported to improve "sample efficiency and coordination … especially in environments with partial observability."

_Confidence: High._

### The cost: recurrence stops being optional

This is where perception-honesty is genuinely expensive, and it is **not** a simple multiplier on the existing 5–10× `observe()` cost.

The comparative finding is direct: *"Under full observability, all methods achieve competitive performance because the policy can rely directly on the current observation, limiting the advantage of recurrence. However, in the POMDP setting, recurrent methods remain clearly stronger and more stable, whereas non-recurrent methods show degraded performance, large oscillations, substantially higher variance, and less reliable convergence."*

So the current omniscient pilot could in principle be matched by a simple feedforward policy; a fog-honest one needs **memory** — an LSTM/GRU or a sequence model maintaining "a compressed representation of observation history." That is not a tax on wall-clock so much as a tax on *everything else*: larger per-step compute, backprop-through-time, sequence-batched rollouts, more hyperparameters, higher variance, less reliable convergence.

And the horizon is the problem: *"POMDPs are hard to solve when relying solely on memory-based policies because the size of the history grows linearly with the horizon length."* An 18,000-tick match at 20Hz is a **very** long horizon for a recurrent policy.

**The obvious mitigation, and it is large.** The agent does not need to act at 20Hz — humans do not, and the sim's tick rate is a physics decision, not a decision-making one. Acting every 4–10 ticks (2–5 Hz) cuts the effective horizon to 1,800–4,500 steps and cuts inference cost by the same factor, attacking the recurrence problem and the compute problem with one change. Frame-skip / action-repeat is standard practice in game RL for exactly this reason.

_Confidence: High on the recurrence requirement and horizon problem (primary comparative sources). **Moderate on the frame-skip recommendation** — it is standard engineering practice and follows directly from the horizon finding, but the specific 4–10 tick figure is judgment, not a sourced result for this game._

_Sources:_
- https://www.emergentmind.com/topics/centralized-training-decentralized-execution-ctde
- https://arxiv.org/html/2505.11153 — Bi-directional Recurrence Improves Transformer in POMDPs
- https://proceedings.neurips.cc/paper_files/paper/2024/file/d399b67fa017f0f7670102c88507720c-Paper-Conference.pdf — Dual Critic RL under Partial Observability
- https://arxiv.org/abs/2006.12484 — Sample-Efficient RL of Undercomplete POMDPs

---

## Q6 — Asymmetric Self-Play in a 20-Player FFA

### The finding that undermines the plan as originally framed

Self-play's theoretical guarantees **do not survive the move past two players**, and this is not a minor caveat — it is the load-bearing assumption in "train policies, run games, read balance off the win rates."

In two-player zero-sum games, "iterative self-play procedures have been proven to converge to Nash equilibrium," and such an equilibrium guarantees "at least the value of the game in expectation in the worst case." That is the setting where converged self-play licenses a balance reading.

Hullcracker is not that setting. It is a 20-player free-for-all — general-sum, many-player. And there:

> "for non-zero-sum and multiplayer games, an equilibrium would have no performance guarantee, and in games with more than two players there can be **multiple equilibria with different values to the players**, and following one has no performance guarantee."

Further, "equilibrium strategies in multiplayer games do not guarantee protection against exploitation the way they do in the two-player zero-sum case," because "multiple opponents may simultaneously change their strategies in a coordinated or adversarial way."

**The consequence for this project, stated plainly.** A converged self-play run in a 20-player FFA lands on *one arbitrary member of a set of equilibria that have different values to different players*. Therefore:

- **Equal win rates at convergence do not establish that the game is balanced.**
- **Unequal win rates at convergence do not establish that it is imbalanced** — they may reflect which equilibrium the run happened to find.
- Re-running with a different seed can legitimately land somewhere else with different class win rates, and neither run is wrong.

This is the same conclusion Riot reached empirically from the other direction — *"a champion could still be balanced without having a 50% win rate"* — and the same failure RuleSmith measured when its optimized parameters produced a 24|76 split under cross-evaluation. **Three independent lines of evidence now converge on it.** It is the single most important finding in this research.

_Confidence: High. The game-theoretic result is standard and was returned consistently across multiple sources._

_Sources:_
- https://arxiv.org/pdf/2001.11165 — Empirical Analysis of Fictitious Play for Nash Equilibrium Computation in Multiplayer Games
- https://arxiv.org/pdf/2606.29169 — Projected Exploitability Descent … Multiplayer Imperfect-Information Games
- https://arxiv.org/pdf/2207.06541 — Self-Play PSRO

### What it would actually take to do self-play properly

"One RL profile per ship" understates the requirement by a large factor.

Plain self-play "famously suffers from the problem of overfitting to a single opponent and forgetting how to win against past versions." The mitigation is **league / population-based training**, and population-based agents "show improved results relative to self-play in terms of exploitability." AlphaStar's league needed **three distinct agent roles** — Main Agent, Main Exploiter, League Exploiter — with prioritized fictitious self-play drawing ~75% from the agent's own checkpoint history. Even that was not enough on its own: "PFSP is not sufficient to let the agent discover robust or novel policies … especially for its large space of cyclic and non-transitive strategies, so diversity in the policy population plays an important role."

For asymmetric factions specifically, the Tom & Jerry work introduced **asymmetric-evolution training** with adaptive data adjustment and environment randomization, precisely because "the characteristics of asymmetrical multiplayer games cause imbalance of win rate for both agents, which results in unstable strategies."

So a defensible run is not 3 policies. It is 3 hull populations plus exploiters plus checkpoint history — the AlphaStar league shape, which is a substantial part of *why AlphaStar cost what it cost*. This multiplies the Q5 budget by the population size and pushes the honest estimate well up into (and likely past) the 1e9-step band.

### Two hard problems at once

MARL's central difficulty is nonstationarity: "each agent's policy evolution affects the effective environment of all other agents," and "as the number of agents increase the non-stationarity problem suffers from the curse of dimensionality." The survey position is that "the majority of current MARL studies deal with comparatively small-scale problems characterized by **either** a small number of agents **or** a short time horizon."

Hullcracker has **20 agents and an 18,000-step horizon simultaneously** — both at the hard end of what the field routinely handles, in one environment. Frame-skip helps the horizon; nothing cheap helps the agent count except reducing roster size during training, which changes the game being studied.

_Confidence: High on the league-training requirement and nonstationarity scaling; High on the "either/or" survey characterization._

_Sources:_
- https://arxiv.org/pdf/2408.01072 — A Survey on Self-play Methods in Reinforcement Learning
- https://arxiv.org/pdf/2208.05083 — Reducing Exploitability with Population Based Training
- https://arxiv.org/pdf/2011.13729 — TStarBot-X: Efficient League Training in StarCraft II
- https://dl.acm.org/doi/10.1145/3817113 — Scaling Up MARL for Large Agent Teams and Long-Horizon Tasks: A Survey
- https://arxiv.org/abs/1906.04737 — Dealing with Non-Stationarity in Multi-Agent Deep RL
- https://arxiv.org/abs/2304.10124 — Asymmetric-Evolution Training (Tom & Jerry)

### Placement beats win rate — and the literature names the metric

The instinct that placement distribution is the better metric for a 20-player BR is **supported**, and there is prior art specific to the genre. A study of **over 25,000 team battle-royale matches** evaluated rating systems using both traditional metrics (accuracy, MAE, Kendall's tau) and information-retrieval metrics (MRR, average precision, NDCG). Two usable results:

- **NDCG "demonstrated more reliable performance and more flexibility"** than the alternatives — a concrete, defensible ranking metric rather than a hand-rolled one.
- **Kendall's tau is explicitly inappropriate** for rank prediction in BR matches, being distorted by new players and failing to capture top-tier patterns.

This matters beyond metric choice: a placement-distribution reading extracts far more signal per match than a binary win, which directly attacks the sample-size problem Riot's ~200-match figure exposed.

_Confidence: High._

_Source:_ https://arxiv.org/abs/2105.14069 — The Evaluation of Rating Systems in Team-based Battle Royale Games

### The constructive corollary — why the cheap path gets *stronger* here

The multiple-equilibria problem attacks a specific question: *"what do win rates look like at convergence?"* It does **not** attack the randomized-build causal design.

A forced/randomized-build experiment asks a **within-agent** question: *holding the agent policy fixed, does changing this card change the outcome distribution?* That comparison is made against a single fixed reference policy, so it never depends on which equilibrium was found, never requires convergence, and is not invalidated by the existence of other equilibria. It is a controlled experiment, not an equilibrium analysis.

This is a genuine reversal of the expected ordering. The equilibrium objection is **fatal to the ambitious version** of the RL plan and **harmless to the cheap version** — and the cheap version can run on the existing harness with today's scripted pilots.

### Q2 / Q6 interim assessment

1. **CTDE fits Hullcracker unusually well** — the centralized critic is free and `observe()` is already the actor's observation function.
2. **Perception-honesty forces recurrence**, whose cost is architectural and statistical rather than a clean multiplier; the 18k-step horizon is at the hard end, and frame-skip to 2–5 Hz is the strongest available mitigation.
3. **Self-play's balance-reading guarantee does not exist beyond two-player zero-sum.** In a 20-player FFA there are multiple equilibria with different values, so win rates at convergence do not license a balance conclusion in either direction. Corroborated independently by Riot's practice and RuleSmith's cross-evaluation failure.
4. **Doing self-play properly requires a league, not 3 policies** — populations plus exploiters plus checkpoint history, multiplying the Q5 budget substantially.
5. **20 agents × 18,000 steps puts Hullcracker at the hard end on two axes at once**, where the survey literature reports the field usually handles one.
6. **Placement is the right metric and NDCG is the named choice**; Kendall's tau is ruled out.
7. **The equilibrium objection does not touch the randomized-build causal design**, which is a within-agent controlled comparison — strengthening the cheap path precisely where the expensive path weakens.

---

## Q3 — Reading Intent Out of a Policy

### The technique is real, and it has three names

The proposal — "read which offered-but-unchosen cards the agent valued, and how much" — is a recognized technique. It sits at the intersection of three literatures:

1. **Action gap** (Farahmand, NeurIPS 2011). "The difference between the value of the optimal action and the second best action is known as the action gap … the minimum absolute difference between any two distinct Q-values at a given state." This is precisely the proposed quantity, and it has a formal name and theory.
2. **Explainable RL (XRL)** — the field concerned with *why* an agent chose what it chose.
3. **Contrastive explanation** — the XAI term of art for "why action A rather than B," which is exactly the offered-vs-taken comparison.

_Confidence: High._

### The formalization does more than was asked for

The most directly applicable result is **reward decomposition** (Juozapaitis et al., *Explainable Reinforcement Learning via Reward Decomposition*), which "decomposes rewards into sums of semantically meaningful reward types, so that actions can be compared in terms of trade-offs among the types." It supplies two named constructs:

- **RDX (Reward Difference eXplanation)** — "compares two actions from a state by comparing their Q-values for each type of reward. The explanation shows the loss and gain for each type of reward when performing the agent's action rather than an alternative one."
- **MSX (Minimum Sufficient eXplanation)** — "compactly explaining why one action is preferred over another in terms of reward types."

This exceeds the original idea. A scalar Q-gap answers *how much worse* a card is. **RDX answers *in what currency*.** Decompose Hullcracker's reward into semantically meaningful components — damage dealt, damage avoided, survival duration, placement, XP banked, zone safety — and RDX reports that a card was passed over because it scored poorly on, say, *survival* while scoring fine on *damage*. That is directly the "what would make this card attractive, and under what game state" signal the proposal was reaching for, and it is a stronger instrument than the scalar version.

_Confidence: High — the method is published, named, and its stated purpose matches the use case._

_Sources:_
- https://papers.nips.cc/paper/4485-action-gap-phenomenon-in-reinforcement-learning
- https://web.engr.oregonstate.edu/~erwig/papers/ExplainableRL_XAI19.pdf — Explainable RL via Reward Decomposition (RDX / MSX)
- https://arxiv.org/pdf/2010.05180 — Contrastive Explanations for RL via Embedded Self Predictions
- https://arxiv.org/pdf/2507.12599 — A Survey of Explainable RL: Targets, Methods and Needs

### The failure mode is precisely fatal to the naive version

The naive plan — *train a policy, observe that card X is chosen 3% of the time, read its Q-gap to learn how bad it is* — **measures the least reliable number in the entire network.**

This is the central, well-characterized problem of offline/off-policy value estimation:

> "Extrapolation errors occur when the Q-function assigns overly optimistic values to actions that are **poorly represented or absent in the dataset**, leading to unreliable or unsafe policies. When the policy selects actions not present, or **sparsely represented**, in the buffer, the critic must estimate Q-values by extrapolating from other observations, leading to **high bias or overestimation**."

Read against the use case: a card the policy almost never picks is, by definition, **out-of-distribution**. Its Q-value is trained on ~3% of the data and is extrapolated from the rest. The bias direction is **overestimation** — so a genuinely terrible card's Q-value is *optimistically* biased, understating how bad it is, and a rarely-picked card may look better than it is purely as an artifact.

**The Q-gap is least trustworthy exactly where the proposal wants to use it.** Known mitigations exist (Conservative Q-Learning; uncertainty-based ensembles), but they *constrain* estimates toward the behavior policy — which suppresses the very signal being sought.

_Confidence: High — this is textbook offline-RL, returned consistently across sources._

_Sources:_
- https://www.emergentmind.com/topics/extrapolation-error-in-off-policy-rl
- https://proceedings.neurips.cc/paper_files/paper/2020/file/0d2b2061826a5df3221116a5085a6052-Paper.pdf — Conservative Q-Learning
- https://proceedings.neurips.cc/paper/2021/file/3d3d286a8d153a4a58156d0e02d8570c-Paper.pdf — Uncertainty-Based Offline RL with Diversified Q-Ensemble

### A second, independent calibration problem

Even setting OOD aside, **strong play is not evidence of well-calibrated values.** The action-gap literature exists to explain the observation that "oftentimes the performance of the agent reaches very close to the optimal performance **even though the estimated (action-)value function is still far from the optimal one**."

This severs the intuitive chain "train a good agent → trust its Q-values." An agent can play excellently while its value estimates are badly wrong in absolute terms, because greedy action selection only needs the *ordering* near the top to be right. Q-values for actions it rarely takes are unconstrained by its own competence.

_Confidence: High — this is the motivating observation of the action-gap paper itself._

### The fix — and it collapses Q3 into Q4

There is one intervention that removes the OOD problem at its root: **force the agent to take each offered card with equal probability.**

Under randomized assignment the card is no longer out-of-distribution — it is in-distribution *by construction*, with balanced coverage across game states. The Q-estimate for every card is then trained on comparable data, the extrapolation-error objection evaporates, and RDX's per-reward-type decomposition becomes trustworthy.

**Which means the causal design and the Q-gap design are the same experiment.** Randomizing the draft both (a) yields the clean causal estimate of a card's effect on outcomes and (b) is the precondition that makes the learned value function's preferences readable at all. They are not alternatives to be chosen between; **randomization is the mechanism that makes the Q-gap valid.**

This is the central synthesis of this research and it answers Q4's "can they be combined?" in the strongest possible form: not merely combinable — the causal design is a *prerequisite* for the revealed-preference design to mean anything.

_Confidence: High on the mechanism (direct consequence of the OOD definition); Moderate on there being no residual bias — forced exploration changes the policy being evaluated, so the values measured are those of a *card-randomized* agent, not of an optimally-drafting one. That distinction should be stated in any resulting evidence report._

---

## Q4 — Causal vs Revealed Preference

### Prior art: naive estimates in competitive games are "strongly biased"

There is directly applicable published work. *Resolving Simultaneity Bias: Using Features to Estimate Causal Effects in Competitive Games* (IEEE CoG 2019) finds that "instrumental variables and control function approaches can identify the causal effect of in-game features on the probability of winning, **without which typical methods of identifying the effect of in-game features will be strongly biased**." Its stated application is "predictive game balance when introducing new heroes and features."

This validates the concern behind the question: **observational win-rate data in a competitive game is confounded, and naively regressing outcome on build is a known-biased estimator.** The confounder is easy to state in Hullcracker's terms — if a strong pilot preferentially takes card X, X's win rate measures the pilot, not the card.

_Confidence: High._

_Source:_ https://dl.acm.org/doi/10.1109/CIG.2019.8848059

### The hierarchy of designs, best to worst

1. **Randomized assignment (RCT).** "Randomization ensures balance in confounders, allowing the recovery of average treatment effects for the study population." The gold standard, and it dissolves the confounding rather than modeling it.
2. **Instrumental variables / control functions.** The correction available when randomization is impossible — the CoG paper's contribution.
3. **Naive observational win rate.** Known to be strongly biased.

Live-service games are stuck at tier 2 or 3. Riot cannot randomize what champions players pick, which is precisely why their methodology leans on presence, skill-tier segmentation, and the explicit caveat that a balanced champion need not sit at 50%.

### The simulator's actual superpower

**The decisive advantage of the batch-sim harness is not agent quality — it is randomization.**

Hullcracker can assign builds at random, because its players are instruments. That places it at **tier 1**, running the true randomized controlled experiment that no live-service game can run at all. Riot, with billions of matches, is stuck at tier 2; a solo developer with a deterministic simulator can reach tier 1 with a few thousand.

This reframes the whole project. The harness's value was implicitly assumed to scale with how well its pilots play. It does not — **its value comes from experimental control**, which is available *today*, with the scripted pilots already in `PILOT_REGISTRY`, and which no amount of agent sophistication improves upon.

It also explains why the existing ledger entry is stated so carefully: the catalog-values question was deferred pending "real-play or bot-vs-bot evidence," but a *randomized* run with today's pilots is a **stronger** design than observational data from either, for the specific question of whether a card changes outcomes.

_Confidence: High on the hierarchy; High on randomization being available in-simulator; Moderate on the practical claim that a few thousand randomized matches suffice — that depends on effect sizes not yet measured._

### What each design can and cannot answer

| Question | Design | Available today? |
|---|---|---|
| Does this card change outcomes, and by how much? | Randomized assignment + placement regression | **Yes** — scripted pilots suffice |
| Which cards would a strong player choose? | Revealed preference (pick rate) | Needs a strong, human-plausible agent |
| *Why* was this card passed over, in what currency? | RDX / MSX over a decomposed reward | Needs a learned value function **and** randomized coverage |
| Is this hull over/under-powered at equilibrium? | Self-play convergence | **Not answerable** at 20-player FFA (Q6) |

The fourth row is unanswerable by the proposed method regardless of budget. The first is answerable now. Rows two and three are what RL genuinely adds — and row three is the only one that requires it.

---

## Q3 / Q4 Interim Assessment

1. **The Q-gap idea is real, named, and published** — action gap, XRL, contrastive explanation.
2. **RDX/MSX is stronger than the original proposal**: it reports not just *how much* worse a card is but *in which reward currency*, which is the actionable "what would fix it" signal.
3. **The naive version measures the least reliable number in the network.** Rarely-chosen actions are OOD; their Q-values are extrapolated and **optimistically biased**, understating how bad a bad card is.
4. **Strong play does not imply calibrated values** — a second, independent reason not to trust raw Q-values from a merely-good agent.
5. **Randomized card assignment fixes the OOD problem at its root**, making the causal design a *prerequisite* for the revealed-preference design rather than an alternative to it.
6. **Naive observational balance estimates in competitive games are documented as strongly biased**; randomization is the gold-standard fix and is available in-simulator.
7. **The harness's real superpower is experimental control, not agent quality** — it can run a tier-1 RCT that Riot, with billions of matches, cannot.

---

# The Instrument Is Not the Evidence

## Comprehensive Technical Research: RL Agents for Game-Balance Evidence in Hullcracker

---

## Executive Summary

The proposal was to train one RL policy per hull class, run many matches, and use an LLM to interpret the results — identifying which upgrade options are underpowered and inferring what would make them attractive. This research finds that **the proposal contains one genuinely excellent idea, one idea that is unanswerable by the method proposed, and a cost structure that inverts once examined.**

The excellent idea is reading *intent* out of a policy. It is real, published, and named — the **action gap** (NeurIPS 2011), formalized for explanation as **RDX/MSX** in the reward-decomposition literature, which does more than was asked: it reports not merely how much worse an unchosen option was, but **in which reward currency** it fell short. That is precisely the "what would make this card good" signal, and it is the one capability in the entire proposal that heuristics and outcome regression genuinely cannot provide.

The unanswerable idea is reading hull balance off self-play win rates. Self-play's convergence guarantee is a property of **two-player zero-sum** games. Hullcracker is a 20-player free-for-all, where "there can be multiple equilibria with different values to the players, and following one has no performance guarantee." Equal win rates at convergence would not establish balance; unequal win rates would not establish imbalance. **No budget fixes this** — it is a property of the game's structure, not of the compute available. Two independent corroborations arrived: Riot's operational position that "a champion could still be balanced without having a 50% win rate," and RuleSmith's measured 24|76 blowup when parameters tuned against one agent strength were evaluated against another.

The inverted cost structure is the practical finding. The stated 45–90 CPU-day estimate is arithmetically correct but rests on an episode budget roughly **360× the literature norm** for multi-agent PPO; at realistic budgets, simulation cost is hours. Meanwhile the true recurring cost is one the estimate never counted: games under development are volatile, and **"changes force model retraining"** — so a policy trained to evaluate balance is invalidated by the very tuning changes it exists to inform, on every iteration. A scripted pilot is valid the instant a CONFIG value moves. For a use case defined by repeated re-measurement after repeated retuning, that asymmetry dominates every other cost consideration.

**The recommendation is therefore staged, and the first stage does not involve RL at all** — because the decisive discovery of this research is that the batch-sim harness's real advantage was never agent quality. It is **experimental control**: the ability to randomly assign builds, which places Hullcracker at the gold standard of causal inference that no live-service game can reach. Riot, with billions of matches, cannot randomize what players pick. A solo developer with a deterministic simulator can — today, with the pilots already in `PILOT_REGISTRY`.

### Key Technical Findings

- **Self-play cannot answer the hull-balance question at 20 players.** Nash guarantees do not extend beyond two-player zero-sum; multiple equilibria with different player values exist, so win rates at convergence license no conclusion in either direction. *(Q6, High confidence)*
- **The Q-gap idea is real and stronger than proposed** — action gap / RDX / MSX, with per-reward-type decomposition. *(Q3, High)*
- **But the naive Q-gap measures the least reliable number in the network.** A rarely-chosen card is out-of-distribution; its value is extrapolated and **optimistically biased**, understating how bad a bad card is. *(Q3, High)*
- **Randomized assignment fixes that at the root**, making the causal design a *prerequisite* for the revealed-preference design rather than an alternative — the two are one experiment. *(Q3/Q4, High)*
- **The nearest published analogue used no RL.** RuleSmith balanced an asymmetric game with zero-shot LLM agents plus Bayesian optimization: ~3,500 games, ~40 GPU-hours. *(Q1, High)*
- **Industry deploys RL as an augmentation of scripted bots, never a replacement.** EA's explicit conclusion: *"The ideal approach is to complement the automated scripting system with RL, rather than use a full end-to-end RL solution."* *(Q1, High)*
- **Volatility is the hidden recurring cost.** "Games under development are volatile; changes force model retraining" — fatal to a use case defined by re-measuring after every retune. *(Q1/synthesis, High)*
- **The budget objection is retired.** Correct arithmetic, but ~360× the literature norm in episodes; at realistic budgets, sim cost is hours, and the bridge is a training-only cost — evaluation runs bridgeless via `onnxruntime-node` behind the existing `CaptainPilot` seam. *(Q5, High)*
- **Perception-honesty is architecturally cheap but statistically expensive** — CTDE fits unusually well since `observe()` already *is* the actor's observation function, but fog forces a recurrent policy over an 18,000-step horizon. *(Q2, High)*
- **Placement beats win rate, and the metric is named** — NDCG, from a study of 25,000+ battle-royale matches; Kendall's tau explicitly ruled out. *(Q6, High)*

### Technical Recommendations

1. **Build the randomized-draft RCT now, with today's scripted pilots.** It answers the ledgered catalog-values question at gold-standard causal quality, needs no new infrastructure, and is valid immediately after any CONFIG change.
2. **Make the Stage 0 → Stage 1 comparison the headline experiment.** Re-running the identical RCT with Epic 6.4's perception-honest bots and comparing card rankings *measures the instrument's distortion directly* — the highest-value output available, and it costs nothing beyond work already scoped.
3. **Adopt the Bayesian-optimization loop, not the RL half.** This is the demonstrated-working component of the nearest prior art and is directly implementable against a deterministic harness.
4. **Defer RL behind a named trigger**, scoped to RDX/MSX intent-reading under randomized drafts — never to self-play equilibrium or superhuman play.
5. **Never read hull balance off self-play win-rate convergence.** Structurally invalid here at any budget.

---

## Table of Contents

1. Introduction and Methodology
2. Prior Art, Real Budgets, and the Tooling Landscape *(Q1 — above)*
3. Stack Reality: Integration, Throughput, and the Budget Arithmetic *(Q5 — above)*
4. Partial Observability: What Perception-Honesty Actually Costs *(Q2 — above)*
5. Asymmetric Self-Play in a 20-Player FFA *(Q6 — above)*
6. Reading Intent Out of a Policy *(Q3 — above)*
7. Causal vs Revealed Preference *(Q4 — above)*
8. Strategic Recommendation and Decision Framework
9. Staged Roadmap and Risk Register
10. Open Questions and Research Gaps
11. Methodology and Source Verification
12. Appendix: Prior-Art Reference Table

---

## 1. Introduction and Methodology

### Why this question is worth answering carefully

Hullcracker's epic constraint is that "tuning is evidence, not vibes." The project has honored it once already — Story 2.10's batch-sim harness produced a ratified tuning pass on real distributions. But the harness shipped with a documented limitation recorded in its own ledger: `GunnerPilot` is omniscient and near-optimal at gunnery, so "match lengths are LOWER bounds and kill rates UPPER bounds on human play," and economy conclusions drawn from it "should be re-checked once Epic 6's utility-AI bots exist."

Four balance questions are currently blocked on exactly that: catalog step values and doctrine factors (deferred pending "real-play or bot-vs-bot evidence"), the Battleship's 50% instrument-endgame win rate (flagged as "plausibly instrument-inflated"), the weapon/cooldown rebalance signal, and the unmeasured relative shifts from the TTK/pip pass. The question is not academic — it gates real work.

The proposal under examination is whether RL is the right way to fill the AR12 seam's reserved third duty. It is a good question precisely because the naive answer ("better bots → better evidence") is intuitive, widely believed, and — as this research found — **wrong in an instructive way.**

### Methodology

**Scope:** six sub-questions, mapped onto the workflow's six steps and confirmed before any search. **Sources:** current web literature with multi-source validation on load-bearing claims. **Confidence:** stated per finding; claims that could not be verified are marked rather than smoothed. **Grounding:** the 2.10 harness spec, `pilots.ts`, `deferred-work.md`, and `epics.md`, read in-repo before searching.

**Source integrity was actively enforced.** One PDF fetch returned a fabricated summary (claiming arXiv:2304.10124 concerned StarCraft II with "two asymmetric factions (Protoss, Terran, Zerg)" — self-contradictory and false; the paper is *Tom & Jerry*). It was discarded and re-verified against the abstract. Two further PDFs returned unparsed binary and were carried as **unverified** across multiple steps rather than inferred; one (the EA paper) was successfully recovered via an alternate host in step 6 and its conclusions are now first-hand. One remains unrecovered and is listed in §10.

### Goals achieved

| Original goal | Outcome |
|---|---|
| Is RL credible here? | **Answered** — credible for one narrow sub-question, structurally invalid for the headline one |
| At what stage? | **Answered** — behind a named trigger, after two cheaper stages |
| What do alternatives buy? | **Answered** — the alternative is not a weaker substitute but a *stronger design* for the primary question |
| Validate the CPU-day arithmetic | **Answered** — arithmetic correct, premise ~360× off; objection retired |

**Discovered beyond the brief:** the volatility/retraining cost; that randomization is the harness's real superpower; that the causal and revealed-preference designs are one experiment rather than two; and that the Bayesian-optimization line — not the RL line — is the demonstrated-working prior art.

---

## 8. Strategic Recommendation and Decision Framework

### The verdict

**Do not pursue RL now. Build the randomized causal harness now. Let RL earn its way in behind a named trigger.**

This is not a cost-driven dodge. The cost objection was *retired* in Q5 — at realistic budgets the compute is hours. The recommendation rests on three findings that survive any budget:

1. **The headline question is structurally unanswerable by the proposed method.** (Q6)
2. **The randomized design is not a cheaper approximation of the RL design — it is a *better* design for the primary question,** and it is additionally a *precondition* for the RL design to be readable at all. (Q3/Q4)
3. **A trained policy is invalidated by every tuning change it is meant to inform.** (Q1)

### The decision framework

Route each balance question to the cheapest design that can actually answer it:

| If the question is… | Then use… | Available |
|---|---|---|
| "Does this card/dial change outcomes?" | Randomized assignment + placement regression | **Now** |
| "Is this hull over/underpowered?" | Randomized hull assignment + placement, reported **per agent tier** | **Now** (Stage 0), better at Stage 1 |
| "What dial values equalize outcomes?" | Bayesian optimization over CONFIG with a balance loss | **Now**, on top of Stage 0 |
| "What would a strong player choose?" | Revealed preference (pick rate) | Stage 2 |
| "*Why* was this passed over, in what currency?" | RDX/MSX over decomposed reward, under randomized drafts | Stage 2 |
| "What does the equilibrium look like?" | — | **Never** — invalid at 20-player FFA |

### On the LLM-interpretation half of the proposal

The proposal's LLM step is the cheapest component and **already exists** in the project's workflow — the `batch-sim-evidence-*.md` artifacts are exactly "run the sim, have a language model interpret the distributions, propose tuning." That part needs no new research.

What the nearest prior art adds is not a better interpreter but a **search loop**: RuleSmith "integrates Bayesian optimization with acquisition-based adaptive sampling," spending more evaluation games on promising candidates (64) and fewer on exploratory ones (16), and yielding "interpretable rule adjustments that can be directly applied to downstream game systems." Two earlier lines support the same approach — active learning for "the low-level parameter tuning required to balance a game once the mechanics have been chosen," and metagame autobalancing for competitive multiplayer.

**This is a stronger fit for Hullcracker than the RL half, and it is available immediately**, because it requires exactly what the harness already provides: a deterministic, seeded, sweepable simulator with a scriptable pilot. The existing `--sweep` support is the seed of it. Adopting adaptive sampling — more matches for promising CONFIG candidates, fewer for exploratory ones — is a direct, low-risk upgrade to the evidence campaign the project already runs.

_Sources:_
- https://arxiv.org/html/2602.06232 — RuleSmith
- https://ar5iv.labs.arxiv.org/html/1908.01417 — Automatic Playtesting for Game Parameter Tuning via Active Learning
- https://arxiv.org/pdf/2006.04419 — Metagame Autobalancing for Competitive Multiplayer Games

---

## 9. Staged Roadmap and Risk Register

### Stage 0 — The Randomized Draft RCT *(days; no new infrastructure)*

Add a forced-uniform-spend pilot variant to `PILOT_REGISTRY` alongside `gunner`/`pacifist`/`endgame`, run a few thousand matches, and regress **placement** (not win rate) on build composition.

- Answers the ledgered catalog-values question at **tier-1 causal quality** — a design Riot cannot run at any scale.
- Reuses the runner, sweep machinery, seeding, and report pipeline unchanged.
- **Valid immediately after any CONFIG change** — no retraining.
- Use NDCG or mean placement; avoid Kendall's tau (explicitly ruled out for BR).
- **Known limit:** absolute numbers stay instrument-conditional (omniscient pilots). The *relative* card comparison is within-agent and survives — which is the question being asked.

### Stage 1 — Re-run under perception-honest bots *(Epic 6.4, already scoped)*

Re-run Stage 0's identical protocol with fog-honest utility bots.

**This comparison is the single highest-value experiment in the plan.** If card rankings agree with Stage 0, the omniscience worry is empirically retired and years of hedged ledger entries resolve at once. If they disagree, the delta *is* the measurement of how much the instrument distorts — which is the thing the project has been unable to quantify and has been carefully hedging in prose instead. Either outcome is a win, and the cost is a re-run of work already committed.

This is also the stage at which the Battleship-50% question becomes legitimately answerable, since light hulls can finally play their designed kiting/torpedo styles.

### Stage 2 — RL, narrowly scoped *(conditional; do not start without the trigger)*

**Trigger:** Stage 1 leaves a question that is *specifically about what a strong player would want*, which outcome regression demonstrably cannot answer.

**In scope:** a policy trained under **randomized** drafts (mandatory — it is what makes the values readable), frame-skipped to 2–5 Hz, recurrent, CTDE with a centralized critic on `World` and a decentralized actor on `observe()`, CPU with batched inference, ONNX-exported to run behind `CaptainPilot`. Read via **RDX/MSX** over a decomposed reward.

**Explicitly out of scope:** league/population training, exploiters, superhuman play, and any inference from self-play win-rate convergence.

### Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| **Instrument-conditional conclusions** (RuleSmith 24|76; the ledger's own Battleship caveat) | **High** | Report every result as agent-conditional; run the Stage 0→1 comparison; segment by agent tier as Riot segments by player tier |
| **OOD Q-values understate bad cards** | **High** | Randomized assignment is **mandatory**, not optional, for any value-reading |
| **Volatility invalidates trained policies** | **High** | Keep Stage 0/1 as the standing evidence path; treat any policy as disposable per balance epoch |
| **Reward specification is a design decision in disguise** | **High** | A reward function is an implicit claim about what winning means. This is a game-design ruling, not an engineering choice — it needs Eric explicitly, per the project's standing rule against inventing mechanics |
| **Stochastic policy breaks harness determinism** | Medium | Evaluate greedily, or seed sampling through the existing `mulberry32` discipline; the 2.10 spec pins "same key → identical report" and tests it |
| **Scope creep into league training** | Medium | Named out of scope now; revisit only with an explicit ruling |
| **Recurrent training instability over an 18k horizon** | Medium | Frame-skip to 2–5 Hz; CTDE; prefer stability over speed (EA: "prioritize algorithm stability over raw speed") |
| **Agent discovers sim exploits** | Low / **beneficial** | Treat as free adversarial QA — it will find the beaching, geometry, and dead-ring cases |

---

## 10. Open Questions and Research Gaps

1. **What does a *balance-evaluation-grade* agent cost for a game of this complexity?** Unanswered anywhere in the literature. Published budgets buy superhuman play, a far stricter target. This is the largest remaining uncertainty and the main reason Stage 2 is trigger-gated rather than scheduled.
2. **Effect sizes are unmeasured**, so the claim that "a few thousand randomized matches suffice" is a projection. Stage 0 measures it directly on its first run.
3. **arXiv:2503.18748** (*Simulation-Driven Balancing of Competitive Game Levels with RL*) returned unparsed binary twice and its method/budget remain unverified — the one gap not closed during this research.
4. **Reward decomposition for a battle royale is undesigned.** RDX/MSX presuppose semantically meaningful reward components; which components Hullcracker should have is an open design question and a Stage 2 prerequisite.
5. **Whether Stage 0 and Stage 1 rankings agree** is genuinely unknown and is the most informative unknown in the plan.

---

## 11. Methodology and Source Verification

**Primary sources:** RuleSmith (2602.06232), Tom & Jerry AET (2304.10124), EA game-testing deployment (2307.11105), Sample Factory (2006.11751), EnvPool (2206.10558), MAPPO (2103.01955), action gap (NeurIPS 2011), reward decomposition RDX/MSX (Juozapaitis et al.), BR rating systems (2105.14069), simultaneity bias in competitive games (IEEE CoG 2019), Conservative Q-Learning, multiplayer-Nash analyses (2001.11165, 2606.29169), Riot's official balance methodology.

**Verification standard:** load-bearing claims cross-checked across independent sources; the three convergent findings on instrument-conditionality (game theory, Riot practice, RuleSmith measurement) arrived from three unrelated literatures. One fabricated fetch summary was caught by internal contradiction and discarded. Two binary-PDF failures were carried as unverified rather than inferred; one was later recovered via an alternate host.

**Confidence:** High on all findings feeding the primary recommendation. Moderate where noted (frame-skip figure, MLP-forward estimate, ZeroMQ bridging, sufficiency of a few thousand matches). No recommendation depends on a Moderate-confidence claim.

**Limitations:** no primary source addresses this exact game genre at this exact scale; the analogues are strategy games, MOBAs, shooters, and board games. The Q6 game-theoretic result is genre-independent and therefore transfers cleanly; the cost figures do not and are used only as bounds.

---

## 12. Appendix: Prior-Art Reference Table

| Work | Relevance | Budget / result |
|---|---|---|
| **RuleSmith** (2026) | Nearest analogue; LLM agents + BO, **no RL** | ~3,500 games, ~40h on 8×A100; 51|49; cross-eval failure 24|76 |
| **EA game testing** (2023) | Industry practice; RL complements scripting | "Complement… rather than… full end-to-end RL"; <100µs inference budget; volatility forces retraining |
| **Tom & Jerry AET** (2023) | Asymmetric multiplayer self-play | 98.5% vs top humans over 65 matches; adaptive data adjustment + env randomization |
| **AlphaStar** | League training shape | 32 TPUv3 × 44 days × 12 agents; ~$3.2M to replicate; MA + ME + LE roles |
| **OpenAI Five** | Upper bound | 770 PFlops/s·days, 10 months, 256 GPU + 128k CPU |
| **MAPPO** | Realistic step budgets | 10–25M env steps typical; 50M harder |
| **Sample Factory / EnvPool** | Throughput ceilings | 130K FPS single node; 1M (Atari) / 3M (MuJoCo) FPS |
| **Action gap** (NeurIPS 2011) | Names the Q-gap | Near-optimal play with far-from-optimal values |
| **RDX / MSX** | The actual instrument | Per-reward-type contrastive explanation |
| **CQL / Q-ensembles** | OOD mitigation | Constrain toward behavior policy |
| **BR rating systems** (2021) | Metric choice | 25,000+ matches; NDCG best; Kendall's tau ruled out |
| **Simultaneity bias** (CoG 2019) | Causal design in games | Naive feature-effect estimates "strongly biased" |
| **Riot /dev** | Live-service practice | Presence over win rate; 4 skill tiers; 50% ≠ balanced |

---

## Technical Research Conclusion

### Summary

The proposal's instinct — that better instruments yield better balance evidence — turns out to be the wrong axis. **Evidence quality here is governed by experimental design, not agent sophistication.** A randomized trial run by simple scripted pilots is a strictly stronger design for "does this option change outcomes" than an observational study run by a superhuman agent, and it is available today. The single most valuable property of the batch-sim harness is one nobody has yet used: it can randomize.

The proposal's best idea survives intact and improves under scrutiny — reading intent from a value function is real, named, and richer than proposed. But it is gated on randomization for validity, is invalidated by every retune, and answers only the third-most-urgent question. It belongs behind a trigger, not at the front.

The proposal's headline goal does not survive. Hull balance cannot be read off self-play convergence in a 20-player free-for-all, because the equilibrium concept that would license the reading does not carry past two players.

### Strategic impact

Three ledger entries become actionable at Stage 0 rather than waiting on Epic 6; the "instrument-inflated" hedge that has qualified the project's balance conclusions for months becomes **measurable** at Stage 1 rather than remaining a caveat in prose; and the 45–90 CPU-day objection is retired. The project's own AR12 seam and `CaptainPilot` interface turn out to be exactly the right integration points, requiring no architectural change at any stage.

### Next steps

1. Take this into the `bmad-forge-idea` session as the feasibility base.
2. Forge the **Stage 0 RCT** into a buildable spec — it is small, well-defined, and unblocks ledgered work.
3. Treat the **Stage 0 → Stage 1 comparison** as the plan's headline experiment.
4. Get an explicit ruling on the **reward-decomposition design** before any Stage 2 work — it is a game-design decision wearing engineering clothes.

---

**Research Completion Date:** 2026-08-10
**Source Verification:** all load-bearing claims cited; unverified items explicitly marked
**Confidence Level:** High for all findings feeding the primary recommendation

_Feeds: `bmad-forge-idea` session on the Hullcracker balance-evidence program._
