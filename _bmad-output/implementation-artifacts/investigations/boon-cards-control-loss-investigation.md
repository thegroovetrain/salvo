# Investigation: Boon cards — control loss after picking certain upgrades

## Hand-off Brief

1. **What happened.** Players report the game "crashing" after picking certain boons, manifesting specifically as
   losing the ability to control their ship. **Confirmed:** the client's frame loop has zero fault containment, and
   Pixi 8's ticker permanently stops requesting frames if any listener throws — so *any* single exception in the
   per-frame path is an unrecoverable total freeze in which the server keeps sailing your hull on its last engine
   order. **Confirmed separately:** Eric's `intelTruesight` suspicion is correct, and four other cards are dead,
   clamped, or order-dependent.
2. **Where the case stands.** The *amplifier* is Confirmed and is arguably the highest-value fix. The specific
   boon-triggered *trigger* is not yet isolated: every single-point crash theory I tested independently was refuted
   (the client is defensively coded throughout), and the full 4309-test suite passes green.
3. **What's needed next.** One browser session with a console open, picking the suspect cards, is worth more than
   further static analysis — see the Reproduction Plan. Independently, wrap `startLoop` in try/catch regardless of
   trigger: it converts every future frame-path exception from "game over" into "one dropped frame".

## Case Info

| Field            | Value                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------ |
| Ticket           | N/A (Eric verbal report)                                                                   |
| Date opened      | 2026-08-16                                                                                 |
| Status           | Active — amplifier Confirmed, trigger Open                                                 |
| System           | Hullcracker RT prototype, branch `main` @ `31859bc`, v0.17.88, PROTOCOL_VERSION 35          |
| Evidence sources | Source (shared/server/client), `npm run check` (exit 0), runtime probe of all 36 boon cards |

## Problem Statement

Verbatim from Eric:

> players games are crashing after picking certain upgrades. What specifically happens is they lose the ability to
> control their ships. I had suspected that the "truesight range" upgrades are now fundamentally broken after the 8th
> ladder change, and that does appear to be confirmed, but some users are reporting other upgrades broken, too. To fix
> the "truesight range," it just needs to be merged with "Radar Range" as "Intel Range" and then it should increase the
> max range, the rest deriving from that based on the 8ths setup.

Treated as a hypothesis, not fact. The truesight half is **Confirmed** (Finding 2). The crash half is **partially
confirmed**: the failure *mode* is confirmed, the *trigger* is not.

## Evidence Inventory

| Source                    | Status    | Notes                                                                          |
| ------------------------- | --------- | ------------------------------------------------------------------------------ |
| Source code               | Available | Full monorepo read access                                                       |
| `npm run check`           | Available | **Exit 0** — all tests pass. The defect escapes every existing test             |
| Runtime probe (36 cards)  | Available | Ran `effectiveStats` over every card at max stack; no NaN/Infinity anywhere     |
| Pixi 8 ticker source      | Available | `node_modules/pixi.js/lib/ticker/Ticker.mjs:123-128` — confirms the amplifier   |
| Browser console / stack   | **Missing** | The single highest-value gap. Would name the throwing line outright           |
| Player repro steps        | **Missing** | Which specific cards; whether freeze is total or partial                      |
| Production error tracking | **Missing** | No Sentry-equivalent found; client exceptions are unobserved in prod          |

## Confirmed Findings

### Finding 1: A single client-side throw permanently kills the game (THE AMPLIFIER)

**Evidence:** `client/src/app/loop.ts:24-36`; `node_modules/pixi.js/lib/ticker/Ticker.mjs:123-128`

**Detail:** `startLoop` registers a ticker callback with **no try/catch**:

```js
app.ticker.add((ticker) => { ... cb.simTick(SIM_DT); ... cb.render(...); });
```

Pixi 8's ticker does this:

```js
this._tick = (time) => {
  this._requestId = null;                     // cleared FIRST
  if (this.started) {
    this.update(time);                        // if this THROWS...
    if (this.started && this._requestId === null && this._head.next) {
      this._requestId = requestAnimationFrame(this._tick);  // ...never reached
    }
  }
};
```

If `update()` throws, the re-request never happens, `_requestId` stays `null`, and **no further frame is ever
requested**. Nothing restarts it. The consequence is exactly the reported symptom: `simTick` stops, so input sampling
and `room.send` stop, so **the server keeps sailing the hull on its last engine order while the player's screen is
frozen** — "I lost control of my ship."

This is asymmetric with the server, which *does* have containment: `server/src/rooms/ArenaRoom.ts:733-737` wraps every
step in story-0.3 tick-error containment with an abort path. The client has no equivalent.

### Finding 2: `intelTruesight` overruns the muzzle-flash/smoke rung at TWO stacks (Eric's suspicion, confirmed)

**Evidence:** `shared/src/constants.ts:13` (`SIGHT = 330`), `:372` (`muzzleFlash: SIGHT * 1.25`);
`shared/src/sim/boons.ts:339`; `server/src/game/signals.ts:1530`, `:1567`

**Detail:** `intelTruesight` multiplies `sightRange` by 1.12/card. The muzzle-flash and wounded-smoke halos are a
**flat CONFIG constant**, deliberately *not* observer-scaled:

| stacks | sightRange | vs muzzle/smoke halo 412.5u |
| ------ | ---------- | --------------------------- |
| 0      | 330.0      | inside                      |
| 1      | 369.6      | inside                      |
| **2**  | **414.0**  | **EXCEEDS**                 |
| 5      | 581.6      | exceeds by 169u             |

From two stacks onward, both signal rows fire entirely *inside* the player's own truesight bubble, where the hull is
already directly visible — they become informationally redundant for that player. Story 4.9 moved this rung 6/8 → 5/8
(495u → 412.5u), which **halved the break point from 4 stacks to 2**. That is precisely "fundamentally broken after
the 8th ladder change."

The flatness is deliberate and load-bearing, not an oversight — `signals.ts:1546-1550` states smoke reach must be
identical for every observer or the plume would carry per-observer build/state information. **This directly
constrains Eric's proposed fix — see Open Question 1.**

### Finding 3: `intelTruesight` is worth far less than `intelRadar` (the asymmetry driving the merge)

**Evidence:** runtime probe; `shared/src/sim/stats.ts:253-255`; `server/src/game/signals.ts:1591`

**Detail:** Measured, one card line vs the other at max stack:

- `intelTruesight` ×5 moves **exactly one field**: `sightRange` 330 → 581.6.
- `intelRadar` ×5 moves **four**: `radarRange` 660 → 1327.5, and `gun.rangeU`, `cannon.rangeU`,
  `starShells.rangeU` all re-pinned to it by `clampStats`.

Beyond that, hearing was moved *off* truesight and *onto* radar range by Story 4.9 — `signals.ts:1591` anchors foghorn
bands on `stats.radarRange`, with the code comment naming the trade outright: *"hearing now widens with `intelRadar`
rather than `intelTruesight`."* Command detonation also reads `radarRange` directly. So one intel card buys sight and
the detect gate; the other buys radar, three weapon ranges, hearing, and detonation reach. The merge Eric wants is
well-founded.

### Finding 4: `cannonBlast` is a TOTAL no-op while `cannonAp` is held

**Evidence:** `shared/src/sim/boons.ts:289`; `server/src/game/equipment/cannon.ts:40,68,81`

**Detail:** `cannonAp` (ARMOR-PIERCING SHELLS) hardcodes `burstRadius: 0` — AP shells pierce instead of bursting.
`cannonBlast` (FRAGMENTATION CASING, common ×5) multiplies `cannon.burstRadius` by 1.1/card. A player holding AP can
be offered, pay for, and fit **five** Fragmentation Casing cards for literally zero effect. Nothing in the deck engine
or the card copy prevents or discloses this.

### Finding 5: `mineDamage` × `minePropFouling` is pick-order dependent (17.8% swing)

**Evidence:** `shared/src/sim/boons.ts:312`, `:322`, `:519-524`

**Detail:** `applyBoonStats` folds strictly in boon-list order, and `minePropFouling` carries `mult: 0.6` on the *same*
path `mineDamage` adds to:

- fouling first, then 5× damage → `55 × 0.6 + 20` = **53**
- 5× damage first, then fouling → `(55 + 20) × 0.6` = **45**

Same cards, same count, different damage purely by draw order. Deterministic (server and client fold identically, so
no desync), but a real balance defect and invisible to the player.

### Finding 6: `mineTrigger`'s 5th card is ~75% eaten by a clamp

**Evidence:** `shared/src/sim/boons.ts:316`; `shared/src/sim/stats.ts:256`

**Detail:** `clampStats` pins `triggerRadius = min(trigger, blastRadius)`. The ladder runs 32 → 51.54, but with zero
`mineBlast` stacks the ceiling is 48. Cards 1-4 are fully live; card 5 delivers +1.15u instead of +4.69u. Conditional
— with ≥1 `mineBlast` stack the ceiling rises and nothing is lost.

### Finding 7: At most ONE of six acquisition cards can ever take effect

**Evidence:** `shared/src/sim/loadout.ts:67,73,123-125`; `shared/src/sim/deck.ts:87,234-237`

**Detail:** There is exactly one extra slot (`SLOT_EXTRA = 3`, `SLOT_COUNT = 4`). Per hull only 4 of 6 acquisition
cards enter the deck; the moment one is fitted, `consumeAcquisition` purges every remaining one. This appears to be
working as designed, but it means the "6 acquisition cards" in the catalog are structurally a "choose 1 of 4".

### Finding 8: The stats firewall itself is clean

**Evidence:** runtime probe of all 36 cards at max stack; `shared/src/sim/boons.ts:494`

**Detail:** `applyStatEffect` gates every write with `if (!Number.isFinite(v) || v <= 0) return;`. The probe confirmed
**no NaN, Infinity, zero or negative value in any field for any card at any stack count**, across all three hulls.
Whatever the crash is, it is *not* a poisoned stats tree. (Historical note: `client/src/render/radar.ts:769,1578`
reference a prior "cycle-62 `radarRange = Infinity` lesson", so this class of bug has bitten before and the guard
appears to be the response to it.)

## Deduced Conclusions

### Deduction 1: The crash is a browser-runtime exception, not a logic error

**Based on:** Findings 1 and 8; `npm run check` exit 0.

**Reasoning:** All 4309 tests pass, and the pure-sim layer provably cannot produce a bad number. So the trigger is
something only the browser sees — a Pixi/WebGL/DOM/Canvas call, or a property access on a path the tests don't
exercise. Combined with Finding 1, any such exception is fatal and permanent rather than transient.

**Conclusion:** Static analysis alone is unlikely to isolate it; a console stack trace almost certainly names it in
one line. Meanwhile the amplifier fix is independent of the trigger and strictly reduces blast radius.

### Deduction 2: `intelRadar` halves the player's camera zoom

**Based on:** `client/src/render/camera.ts:304`, `:297-300`; runtime probe.

**Reasoning:** `baseZoom = shortAxis / (2 * radarRange)`. At `radarRange` 660 → 1327.5, base zoom halves — the hull
renders at half size and apparent motion halves with it.

**Conclusion:** Intended ("radarRange upgrade = your world grows", `main.ts:2281`), but at 5 stacks it is a severe
visual change that a player could plausibly describe as the game breaking. Flagged as a candidate *non-crash*
explanation for part of the report. Also raises per-frame radar march cost roughly linearly with range, against a
budget CLAUDE.md records as already thin (1.74ms of a 2.5ms bar at base).

## Hypothesized Paths

### Hypothesis 1: The user's premise — truesight upgrades broken by the eighths ladder

**Status:** **Confirmed** · **Resolution:** Finding 2 — quantified; break point moved 4 stacks → 2 stacks by the 6/8 → 5/8 move.

### Hypothesis 2: A boon produces NaN that poisons ship kinematics

**Status:** **Refuted** · **Resolution:** Finding 8. `applyStatEffect`'s finite-and-positive gate (`boons.ts:494`)
makes it structurally impossible; the probe confirmed empirically across all cards and hulls.

### Hypothesis 3: The client stats-diff is incomplete, leaving the predictor on stale kinematics

**Status:** **Refuted** · **Resolution:** `sameKinematics` (`main.ts:2286-2295`) compares all six fields, and the
trigger `ownStatsChanged` → `sameList` (`net/roomBindings.ts:603-615`) is element-wise, so even a doctrine swap
(same length, different order) correctly re-fires. Permanent prediction divergence would have matched the symptom
well, but the code is correct.

### Hypothesis 4: The refit modal captures keyboard input, stranding the helm

**Status:** **Refuted** · **Resolution:** `client/src/input/keyboard.ts:8-9,275-276` — the refit modal is an explicit
*partial* lockout (Q/E/R/F suspended, **helm still live**). Only the results modal takes the helm.

### Hypothesis 5: A stuck spend latch blocks further action

**Status:** **Refuted** · **Resolution:** `main.ts:646-700` — `updateSpendLatch` releases on ack, on success, on ship
loss, *and* on a fallback timeout. It cannot stick.

### Hypothesis 6: Object-pool exhaustion under `gunBarrel` (3× shells)

**Status:** **Refuted** · **Resolution:** `client/src/util/pool.ts:15-21` — `acquire()` grows unbounded, never throws.

### Hypothesis 7: A boon-scaled radius blows the browser canvas size cap

**Status:** **Refuted** · **Resolution:** `client/src/render/textures.ts:20-27` does throw when a 2D context can't be
created, but `bakeFogTexture` sizes the canvas from the **viewport** (`viewW + 2*margin`), not from sight; and margin
scales *with* zoom, which *shrinks* as radarRange grows. Canvases get smaller, not larger.

### Hypothesis 8: Slot/ammo index misalignment after an acquisition

**Status:** **Refuted** · **Resolution:** All three ammo indexing sites use `?? null`
(`main.ts:2944`, `:3049`, `render/hotbar.ts:376`).

### Hypothesis 9: Unguarded `BOON_CATALOG[id]` in the render path

**Status:** **Refuted** · **Resolution:** `render/hotbar.ts:778` is unguarded, but its input comes from
`slotBoonIds` (`:241`) which already filters on `Object.hasOwn`. Safe by construction — though **fragile**: the safety
lives in the caller, not the access. `client/src/ui/results.ts:665` is similarly unguarded; worth hardening both.

### Hypothesis 10: The telegraph detent system breaks under a speed boon

**Status:** **Refuted** · **Resolution:** `client/src/input/telegraph.ts:10,23-31` — detents are a fixed normalized
`[-1..1]` table with clamped indexing and no `maxSpeed` or boon dependence at all.

### Hypothesis 11: Frame-rate collapse from radar march cost at high `intelRadar`

**Status:** **Open** · **Theory:** March cost scales with `radarRange`; at ×2.01 range the per-frame radar cost roughly
doubles against a budget already measured at 1.74ms of 2.5ms. Severe stutter reads as unresponsiveness.
**Would confirm:** a profile at 5× `intelRadar` showing frame time past ~16ms. **Would refute:** measured frame time
staying within budget. **Note:** degradation, not a freeze — would not by itself explain a hard "crash".

### Hypothesis 12: The trigger is a Pixi/WebGL call that throws on a boon-derived value

**Status:** **Open** — the leading remaining candidate. **Would confirm:** a console stack trace. **Would refute:**
a repro that freezes with a clean console.

## Missing Evidence

| Gap                          | Impact                                                     | How to Obtain                                          |
| ---------------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| Browser console stack trace  | Would name the throwing line directly — closes the case     | Repro with devtools open; or ship the try/catch + log   |
| Which specific cards         | Narrows from 36 to a handful                                | Ask reporting players; check if it's the intel line     |
| Whether the freeze is total  | Distinguishes ticker death (Finding 1) from partial failure | Ask: does the whole screen freeze, or just your ship?   |
| Production error tracking    | Would have caught this automatically                        | None found in the client — worth adding                 |

## Source Code Trace

| Element       | Detail                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------- |
| Error origin  | **Not yet isolated.** Amplifier at `client/src/app/loop.ts:24-36`                                     |
| Trigger       | Picking certain boons; specific card(s) unidentified                                                  |
| Condition     | Any exception on the per-frame path ⇒ Pixi ticker stops re-requesting frames ⇒ permanent freeze       |
| Related files | `app/loop.ts`, `main.ts` (`applyOwnStats`), `ui/upgradeMenu.ts`, `ui/boonCopy.ts`, `render/hotbar.ts` |

## Conclusion

**Confidence: High** on the failure mode, the truesight diagnosis, and the four catalog defects. **Low** on the
specific crash trigger.

Confirmed: (a) the client frame loop has no fault containment and Pixi 8 permanently stops the ticker on a throw, so
any frame-path exception is an unrecoverable freeze matching the reported symptom exactly; (b) `intelTruesight` is
overrun by the flat muzzle/smoke rung from two stacks and is worth far less than `intelRadar` — Eric's premise holds
and his merge is well-motivated; (c) `cannonBlast` is dead under `cannonAp`; (d) `mineDamage` is pick-order dependent;
(e) `mineTrigger`'s last card is mostly clamped away; (f) acquisitions are structurally 1-of-4.

Not established: which boon throws. Every single-point theory I could test statically was refuted — this client is
defensively written — and the whole suite is green, which is itself evidence the trigger lives in browser-only code.

## Recommended Next Steps

### Fix direction

Three independent mechanisms; they do not need to ship together.

**1. Containment (do this regardless of trigger).** Wrap the `startLoop` body in try/catch. Log once and continue, or
degrade to a safe render. This converts every current *and future* frame-path exception from "game over" into "one
dropped frame". Given Finding 1, this is the single highest-value change in the report and is independent of
diagnosis. Consider the same for `results.ts:665` / `hotbar.ts:778` hardening.

**2. The Intel Range merge (Eric's ruling).** Fold `intelTruesight` + `intelRadar` into one `intelRange` line driving
`radarRange`, with `sightRange` becoming a **derived** field re-pinned in `clampStats` exactly as `gun.rangeU` already
is — same firewall pattern, one derivation path, no new machinery. Removing `sightRange` from `BOON_STAT_PATHS` makes
it structurally underivable elsewhere. **This needs an Eric ruling first — see Open Question 1.**

**3. Catalog defects.** `cannonBlast`/`cannonAp` interaction (Finding 4); `mineDamage` fold order (Finding 5);
`mineTrigger` clamp (Finding 6). Each is a design call, not a mechanical fix.

### Diagnostic

The fastest path to the trigger: add the try/catch from (1) with a `console.error` including the boon list, ship
class, and stack. Ship it, and the next occurrence self-reports. This is strictly better than more static analysis.

## Reproduction Plan

Not yet reproduced. Proposed:

1. Start a local dev server in a worktree; join with `HC_DEV_OPTIONS=1` so boons can be granted directly.
2. With devtools open, grant each catalog card individually, then in the suspect combinations:
   `cannonAp` + `cannonBlast`; `minePropFouling` + `mineDamage`; `intelTruesight` ×5; `intelRadar` ×5;
   `gunBarrel` ×2; each `acquire*`.
3. Watch for a console exception and for the canvas going static while the HUD/DOM stays live — the signature of
   ticker death.
4. Confirm the amplifier directly: throw once from inside `simTick` and verify the game never recovers.

Step 4 is worth doing first — it is a two-line experiment that either confirms or refutes Finding 1's practical
consequence in under a minute.

## Open Questions for Eric

1. **The merge collides with a ratified perception rule.** Under "the rest deriving from the 8ths", the 5/8
   muzzle-flash/wounded-smoke rung would scale with the buyer's Intel Range. But `signals.ts:1546-1550` deliberately
   holds that halo flat *for every observer*, because a per-observer reach would leak build/state information through
   the plume. Which gives way — does the 5/8 rung stay flat (so the eighths derivation is partial under boons), or does
   it scale (accepting the disclosure)? This needs your call before implementation.
2. **What happens to sweep?** `intelSweep` is the third intel line. Does it stay independent, or fold in too?
3. **Card economics.** Merging two commons (×5 each) into one line removes 5 physical cards from the intel subdeck.
   Should the merged line be ×5, or ×10 to preserve intel's draw weight?

## Side Findings

- The seven `<equipment>.reloadMs` whitelist entries in `BOON_STAT_PATHS` have **zero** catalog cards — deliberate per
  the 2026-08-04 global-cooldown ruling, retained so a future per-weapon card composes before `cooldownScale`.
- `shipSpeed` moves both `maxSpeed` and `reverseSpeed`, but the card copy headlines only `maxSpeed`
  (`client/src/ui/boonCopy.ts:211`) — the player is under-told what they bought.
- `torpedoSpeed` is honored by the sim but the client's wake ribbon provisioning for *other* players still uses
  `CONFIG.torpedo.speed` — cosmetic only.
- No production error tracking was found in the client. Given Finding 1, client exceptions in production are currently
  invisible.
