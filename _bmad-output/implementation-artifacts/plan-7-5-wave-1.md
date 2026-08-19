# Story 7-5 WAVE 1 — Plan (orchestrator-owned, binding on all agents)

Source of truth for CONTENT: `_bmad-output/implementation-artifacts/7-5-decks.md` (Eric-authored).
Spec: `_bmad-output/implementation-artifacts/spec-7-5-upgrade-cards-v2.md`.
Agents may NOT invent mechanics. Every ruling below is the orchestrator's; follow them exactly.

## Wave 1 scope — the answer-independent catalog + stat-model rewrite
Wave 2 (NOT in scope, do not touch): cannon → BROADSIDE BARRAGE, decoyBuoy → RADAR BUOY,
CAPTIVE MINES, the star-shell gun-reach mechanic, BARREL parallel/straddle firing geometry,
acquisitions. Leave `cannon`, `decoyBuoy`, `decoyDuration`, `mineSelfPropelled`, `acquire*`
and all gun firing geometry BYTE-IDENTICAL.

## R1 — Internal ids never change when only the display name changes
Project law (CLAUDE.md, the KILL LEADER precedent): a copy rename is not an id rename.
| Eric's card | id (unchanged) |
|---|---|
| HULL | `shipHull` |
| SPEED | `shipSpeed` |
| INTEL | `intelSweep` |
| RANGE | `intelRange` |
| RELOAD | `shipCooldown` |
| BARREL | `gunBarrel` |
| EXTRA TURRET | `gunTurret` |
| TORPEDO | `torpedoSpeed` |
| EXTRA TUBE | `torpedoTube` |
| ACOUSTIC HOMING | `torpedoHoming` |
| STAR SHELLS | `starDuration` |
| **PHOSPHOR SHELLS** | `starIncendiary` — **id KEPT, display renamed only** |
| DAZZLE SHELLS | `starDazzle` |
| MINES | `mineBlast` |
| PROP FOULING | `minePropFouling` |

NEW ids (replacing `boostMax`): `boostDuration`, `boostSpeed`.

## R2 — Doctrine becomes INDEPENDENT VERB FLAGS (this is Eric's "retooling")
A weapon's single-valued `mode` cannot hold two added verbs. On the three weapons where verbs
now stack, replace the enum with independent booleans:
- `EffectiveStats.starShells.mode: StarShellsMode` → `starShells.phosphor: boolean` + `starShells.dazzle: boolean`
- `EffectiveStats.mine.mode: MineMode` → `mine.propFouling: boolean` + `mine.selfPropelled: boolean`
- `EffectiveStats.torpedo.mode: TorpedoMode` → `torpedo.homing: boolean`
- `EffectiveStats.cannon.mode: CannonMode` — **UNCHANGED**, stays a single-valued enum.

Delete the now-unused `TorpedoMode` ('command' is deleted). `MineMode`/`StarShellsMode` types go.

**WIRE:** `LitZoneView.mode?: StarShellsMode` → `LitZoneView.phos?: true` + `LitZoneView.daz?: true`
(both optional, omitted when false — the established optional-flag wire style). A zone may now
carry BOTH. This is an orchestrator ruling; do not redesign it.

## R3 — The `doctrine` effect keeps its shape, the FOLD changes
`BoonDoctrineEffect` stays `{kind:'doctrine', weapon, mode}` and the `doctrine()` authoring
sugar is unchanged. `applyBoonStats` now SETS A BOOLEAN FLAG named by `mode`
(`stats.starShells.dazzle = true`) instead of overwriting an enum — except for `cannon`, which
keeps its enum assignment. `DOCTRINE_MODES` stays as the fail-closed authoring vocabulary.
Minimal diff, same firewall.

## R4 — Exclusivity: STOP USING IT, do not delete it yet
Remove `exclusiveWith` from `torpedoHoming`, `minePropFouling`/`mineSelfPropelled`,
`starIncendiary`/`starDazzle`. **LEAVE the `cannonArcing`/`cannonAp` pair exclusive** — they
genuinely contradict (AP never bursts; arcing bursts on click), so independent flags would ship
an incoherent state. The cannon pair is the mechanism's last user and both die together in
wave 2. So `exclusiveWith`, `validateBoonDef`/`validateCatalog` symmetry, `boonReplacesLine`,
the doctrine swap-out and `returnCards` all SURVIVE wave 1 untouched.

## R5 — The wave-1 catalog (17 lines; cannon/decoy/acquisition lines carried forward as-is)
| id | category | rarity | copies | effect |
|---|---|---|---|---|
| `shipHull` | ship | common | **4** | `maxHp` add +25, `healOnGrant` |
| `shipSpeed` | ship | common | **4** | `kinematics.maxSpeed` **add +2.5** |
| `intelSweep` | intel | common | 5 | `sweepRpm` add +3 |
| `intelRange` | intel | common | 4 | `radarRange` **add +50** |
| `shipCooldown` | ship | common | 5 | `cooldownScale` add −0.1 |
| `gunBarrel` | guns | rare | 2 | `gun.barrels` add +1 |
| `gunTurret` | guns | rare | 1 | `gun.maxAmmo` add +1 |
| `torpedoSpeed` | torpedoes | common | 4 | `torpedo.speed` add +5 |
| `torpedoTube` | torpedoes | rare | 1 | `torpedo.maxAmmo` add +1 |
| `torpedoHoming` | torpedoes | rare | 1 | doctrine torpedo=homing |
| `boostDuration` | speedBoost | common | **4** | `boost.durationMs` add +1000 |
| `boostSpeed` | speedBoost | common | **2** | `boost.speedBonus` add +5 |
| `starDuration` | starShells | common | **4** | `starShells.litDurationMs` **add +1250** |
| `starIncendiary` | starShells | rare | 1 | doctrine starShells=phosphor |
| `starDazzle` | starShells | rare | 1 | doctrine starShells=dazzle |
| `mineBlast` | mines | common | **4** | `mine.blastRadius` mult ×1.1 |
| `minePropFouling` | mines | rare | 1 | doctrine mine=propFouling |

**DELETE:** `gunDamage`, `torpedoDamage`, `torpedoCommand`, `mineDamage`, `mineMax`,
`starRadius`, `boostMax`.
**RARITY:** the former `exclusive` tier collapses to `rare` for these verb cards (they are no
longer either/or). `exclusive` stays a valid tier — the cannon pair still uses it.
**`starDuration` becomes ADDITIVE** (+1250ms, 10s→15s) — Eric's "+1.25 second duration".
Remove `starShells.litRadius` and `mine.damage` cards but KEEP both stat paths whitelisted
(the established shape).

## R6 — SPEED touches maxSpeed ONLY (orchestrator ruling, flagged to Eric)
Today's card also scales `reverseSpeed` ×1.05, which preserved the reverse:forward ratio. Under
an ADDITIVE +2.5 there is no constant `add` that preserves that ratio across three hulls, and a
flat +2.5 on reverse would take the Battleship 9→19 (+111%) against its top speed's +29%. Eric's
document says "increases ship top speed by this amount". So: `kinematics.maxSpeed` only;
`reverseSpeed` is NOT addressed by any card. Flagged to Eric for veto.

## R7 — PROTOCOL_VERSION 41 → 42, with a changelog entry in `shared/src/index.ts`.

## Verification (every agent)
`npx tsc --noEmit -p <workspace>` for the workspace you own, plus that workspace's tests.
Do NOT run root `npm run check` while parallel agents are live. Complexity ≤ 10 per function.
NEVER commit. NEVER `git stash`. Report files touched, test counts, and deviations with reasons.
