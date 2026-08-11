# Ocean Currents — forged 2026-08-11

**Outcome: SHELVED, not killed.** Back pocket. Revisit trigger: players ask for it.
Why: trivial to add, but the effect spans imperceptible → major balance impact depending on how it's built. Asymmetric cost of being wrong, no demand yet.

## Eric ruled

- Currents are worth having. Judged on **fun**, high skill ceiling accepted. Novelty is real — no naval game ships them.
- **One system.** A current field **supersedes FR47 whirlpools**; whirlpools survive only as features *inside* current dynamics, not as their own mechanic. Takes `shared/src/sim/whirlpool.ts` (planned, `game-architecture.md:584`) and the server-secret hemisphere with it unless rehomed.
- **Cursor = launch bearing; draw the resulting curve; never auto-solve it.** Keeps the skillshot. Rejects the TDC.
- Representation must be **on the water and deducible** — a battleship or mine layer needs a channel that isn't a weapon.

## Proposed, NOT ruled — open if picked up

- **Movement mechanic, not shooting.** Eric asked the question; the answer was never ratified, and Samus attacked the *procedure*: he already ruled semi-realism over realism in the radar round, then let physics decide this on "true" rather than "fun."
- **Place-based, ambient ocean still.** He said "kinda makes sense." Forced by movement-only — uniform 4–6% is a feature nobody feels.
- **Don't build the fBm/baked stream function.** Placed primitives (one vortex, one strait jet) get the gameplay at a fraction of the machinery. You can tune a strait; you cannot tune fBm.
- **Current × storm is the actual feature** (Quinn). Symmetry is a property of the force *plus freedom to leave*; the ring removes the choice. Offset-center + server-rolled ⇒ different endgame water every match.

## Rejected, with reasons

- **Public field + hidden aim curve** — binds only honest players; a modified client integrates the public field and draws it. First mechanic in the game to hand a cheat client real advantage.
- **Drifting mines as default** — moored mines are anchored and *dip*, they don't travel; drifting mines are Hague VIII prohibited. Survives only as an opt-in `MineMode` doctrine.
- **The report's deflection table as the centerpiece** — its self-declared "single most important number" is the claim physics supports least (guided torpedoes correct; 2kt on 54kt is 3.6%).
- **"Ship the seam dormant"** (Cloud, lost to Indie) — the height-raster precedent doesn't transfer. Inert storage ≠ live code in the prediction path.

## Weak points still standing

- Every wake-bow instrument reads **3–5% at ambient strength** (11u across 247.5u; torpedo 5.5u across 165u). Marginal until the water is fast.
- Movement-only concentrates **100% of engineering risk on hull drift through prediction** — the one thing the report flagged. Mitigated but not removed by shipping a steady field.
- Divergence-free ⇒ **no convergence lines**, so foam/debris — the most legible real-world current tell — is unavailable by construction.
- Any representation needs a **static form** (`motion=off` is honored across the attention-tier table).

## Verified against code — don't re-derive

- `stepShell`: 19 refs in `server/src`, **0 in `client/src`** → ordnance drift carries zero prediction risk.
- `stepShip` calls `Math.cos`/`Math.sin` every tick (`ship.ts:72-73`) → **zero-transcendental is a generation-path rule, not a runtime rule.** Undocumented anywhere else.
- Torpedo **never reads `input.aimDist`** (`torpedoes.ts:56`) — pure bearing weapon, clamped to bow ±30°. The gun is the point weapon, and a shell is in the air.
- Universal weapon fit is real (`stats.ts:214-218`, no class gate) — every class has torpedoes.
- Mines already move: `creepMines` (`world.ts:1969`) + `clampMinePoint` (`world.ts:2029`, never outside disk, never ashore, "mines float"). `MineMode` exists (`stats.ts:86`).
- Cost, measured by the report: **2.2 µs/tick, 64 KB/room** vs radar shadows 278 µs and wakes 425–470 µs.

## Next step if resumed

One placed vortex + one placed strait jet, hull drift only, no field/bake/noise, plus a `zoneOverride` to force the ring onto them. Half a day. Kill criterion: after twenty minutes, do you ever think about the water when you're not in one of the two features?

Source research: `_bmad-output/planning-artifacts/research/technical-realistic-ocean-currents-in-hullcracker-research-2026-08-11.md`
