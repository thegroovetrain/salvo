# Investigation: Boon cards — control loss after picking certain upgrades

## Hand-off Brief

1. **What happened.** Players report the game "crashing" after picking certain boons, manifesting specifically as
   losing the ability to control their ship. **Confirmed:** the client's frame loop has zero fault containment, and
   Pixi 8's ticker permanently stops requesting frames if any listener throws — so *any* single exception in the
   per-frame path is an unrecoverable total freeze in which the server keeps sailing your hull on its last engine
   order. **Confirmed separately:** Eric's `intelTruesight` suspicion is correct, and four other cards are dead,
   clamped, or order-dependent.
2. **Where the case stands.** Two *structural* freeze seams are Confirmed and are one-line fixes each (no try/catch in
   the loop; a self-latching statement order in the frame handler). One *plausible non-crash* cause of the exact
   symptom is Confirmed as a mechanism: `intelRadar` multiplies per-frame radar cost by ~4. The remaining unknown is
   which specific exception fires, if any; the suite is green (4309 tests), so it lives in browser-only code.
3. **What's needed next.** Land the two one-line containment fixes now — they are independent of diagnosis and convert
   every current *and future* frame-path exception from "game over" into "one dropped frame", while making the next
   occurrence self-report. Then profile a 5-stack `intelRadar` build. See Reproduction Plan.
4. **Eric ruled 2026-08-16 — the merge is fully specified and unblocked.** The ladder *scales*: Intel Range pushes
   every rung out, gated on the **observer**. `intelSweep` stays a separate line. The merged `intelRange` line ships at
   **×4 copies**. This makes Finding 2 structurally impossible *and* caps the Hypothesis 11 radar cost at ×3.06 rather
   than ×4.05. No open design questions remain on the merge.

## Case Info

| Field            | Value                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------ |
| Ticket           | N/A (Eric verbal report)                                                                   |
| Date opened      | 2026-08-16                                                                                 |
| Status           | Active — amplifiers Confirmed, trigger Open; Eric ruling 2026-08-16 recorded (ladder scales) |
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

The flatness was deliberate, not an oversight — `signals.ts:1546-1550` states smoke reach must be identical for every
observer or the plume would carry per-observer build/state information. **Superseded by the Eric ruling 2026-08-16
below: the rung now scales.** That ruling also makes this finding structurally unreachable — see
"The merge makes Finding 2 structurally impossible".

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

### Finding 8: A second, SELF-LATCHING freeze seam in the frame handler

**Evidence:** `client/src/net/roomBindings.ts:499-500`

**Detail:** The order is wrong:

```ts
if (ownStatsChanged(f.you, net.you)) deps.onOwnStats(f.you.cls, f.you.boons);
net.you = f.you;                              // AFTER the call
```

If `applyOwnStats` throws, `net.you` is never advanced — so on the next frame `ownStatsChanged` compares the new boon
list against the **same stale** previous one, returns `true`, and throws again. **Forever.** And every frame, everything
below line 499 is skipped: `predictor.onServerState` (no reconcile, no input ack — the 64-slot pending ring never
drains), `radar.onSweepSample`, `contacts.pushFrame`, `mines/litZones/decoys.sync`, `routeVictimTells`, `routeDenials`,
`handleEvents`.

This is a genuine ordering defect **independent of any trigger**, and it is a one-line fix (swap the two lines). It
turns a single transient exception into a permanent one.

### Finding 9: The only ungated throw site on the boon-pick render path

**Evidence:** `client/src/ui/boonCopy.ts:276`; `client/src/ui/upgradeMenu.ts:250`

**Detail:** `const spec = CONFIG.shipClasses[you.cls];` — no `Object.hasOwn` guard. If `you.cls` is not an own property,
`spec` is `undefined` and `effectiveStats` → `baseStats(cls)` → `cls.kinematics` (`shared/src/sim/stats.ts:195`) throws
`TypeError`. Both sites run **inside `render()` every frame while the refit band is open** — i.e. exactly during
boon-picking, inside the ticker callback Finding 1 shows is fatal.

Notable by contrast: every other catalog/registry lookup in this engine is deliberately `Object.hasOwn`-gated
(`shared/src/sim/boons.ts:408`, `:442`; `shared/src/sim/hooks.ts:105`). These two are the exceptions. Unreachable
while client and server share a PROTOCOL_VERSION, so the **trigger is Hypothesized** — but the **shape is Confirmed**,
and a version-skew reachability would present exactly as intermittent, "only some players".

### Finding 10: The stats firewall itself is clean

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

**Status:** **Confirmed as a mechanism; Hypothesized as the reported symptom.**

**Theory (revised — the scaling is QUADRATIC, not linear as first estimated):**

- `rayStep` = `clamp(raySpacingU / radarRange, 0.003, 0.02)` (`client/src/render/radarMarch.ts:355-357`) ⇒ **rays per
  slice ∝ radarRange**.
- samples per ray = `radarRange / step` ⇒ **samples ∝ radarRange**.
- ⇒ **cells per slice ∝ radarRange²**.
- The live slice count is deliberately **range-invariant** — `maxSlices()` (`client/src/render/radar.ts:245-248`) is
  computed purely from `sliceRad` and `persistSweeps`, with no `radarRange` term (verified directly).
- ⇒ at 5× `intelRadar` (×2.011 range) the march walks **×4.04 cells every frame**.
- **Compounded:** `camera.ts:302-305` sets `baseZoom = shortAxis / (2 * radarRange)`, so the camera zooms out
  proportionally; `fitHeat` sizes the heat grid off the camera rect (`radar.ts:1416-1420`), so `cols × rows` also grows
  ×4.04 → `quantizeInto` walks 4× the pixels and `heat.source.update()` re-uploads a 4× larger texture **every frame**.

`radarHeatmap.ts:418-421` puts the **base** case at ~350k cells. Tellingly, `radarMarch.ts:350` — the file's own
comment — already names the "~2.01x base" case, so the range-sensitivity was understood at authoring time; the
compounding with the camera zoom appears not to have been.

> **Correction (2026-08-16).** An earlier revision of this case file said the `minRayRad = 0.003` clamp "bounds the
> blow-up at roughly ×4". **That was wrong.** With `raySpacingU = 6` (`client/src/config.ts:2242`), the clamp engages
> only above `6 / 0.003` = **2000u** of radar range, which no reachable stack gets near (5 copies tops out at 1327.5u,
> `rayStep` 0.00452). The scaling is therefore **purely quadratic across the whole reachable range**, and the only
> thing bounding it is the copy cap on the card. That makes the copy count a *performance* lever, not just a balance
> one — see the 4-copy ruling below.

With `MAX_FRAME_DT = 0.25` clamping the accumulator (`app/loop.ts:10`), the sim falls behind wall-clock and the helm
genuinely feels dead. **This is a slideshow, not a hard freeze** — but it matches "certain upgrades" precisely (only
the `intelRadar` line) and players describe both as "crashed".

**Would confirm:** a profile at 5× `intelRadar` showing frame time past ~16ms.

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
| Error origin  | **Not yet isolated.** Amplifiers at `client/src/app/loop.ts:24-36` and `net/roomBindings.ts:499-500`  |
| Trigger       | Picking certain boons; `intelRadar` is the strongest single candidate (performance, not exception)    |
| Condition     | Any exception on the per-frame path ⇒ Pixi ticker stops re-requesting frames ⇒ permanent freeze       |
| Related files | `app/loop.ts`, `net/roomBindings.ts`, `main.ts` (`applyOwnStats`), `ui/boonCopy.ts`, `render/radarMarch.ts`, `render/camera.ts` |

### Ranked candidates for "loses control of the ship"

| # | Candidate | Status | Why it fits |
| - | --------- | ------ | ----------- |
| 1 | No error containment in the loop (`app/loop.ts:25-36` + `Ticker.mjs:123-128`) | **Confirmed** | Any throw permanently kills the rAF chain → no input ever sent again *and* the picture freezes. The amplifier: turns any cosmetic bug into exactly this report. |
| 2 | `onOwnStats` called before `net.you = f.you` (`roomBindings.ts:499-500`) | **Confirmed** (defect) | Self-latching: throws every frame forever, skipping reconcile/contacts/events on each. |
| 3 | `intelRadar` ⇒ O(radarRange²) radar render | **Confirmed mechanism**, Hypothesized symptom | ×4.04 per-frame cost at 5 stacks. Frame collapse + `MAX_FRAME_DT` clamp = dead helm. Matches "certain upgrades" exactly. |
| 4 | Ungated `CONFIG.shipClasses[you.cls]` (`boonCopy.ts:276`, `upgradeMenu.ts:250`) | Hypothesized trigger, **Confirmed shape** | Only ungated throw on the per-frame boon-pick path; feeds #1. Version-skew reachable ⇒ would look intermittent. |
| 5 | NaN kinematics | **Ruled out** | Positivity gate `boons.ts:494` + `clampStats`. |
| 6 | Unbounded loop | **Ruled out** | Every marching loop has a constant positive step or explicit guard. |
| 7 | Oversized texture throw | **Ruled out** | No surface sized from a boon-scaled range near a GPU limit. |
| 8 | Hotbar/ammo out-of-bounds | **Ruled out** | `SLOT_COUNT`-fixed everywhere; equipment maps are exhaustive literals. |

## Conclusion

**Confidence: High** on the failure mode, the truesight diagnosis, and the four catalog defects. **Low** on the
specific crash trigger.

Confirmed: (a) the client frame loop has no fault containment and Pixi 8 permanently stops the ticker on a throw, so
any frame-path exception is an unrecoverable freeze matching the reported symptom exactly — and because our listener
runs at `UPDATE_PRIORITY.NORMAL` while Pixi's renderer sits at `LOW`, the throw pre-empts the renderer and the picture
freezes on the last painted frame; (b) a second, self-latching seam at `roomBindings.ts:499-500` makes any such throw
repeat every frame forever while skipping reconcile, contacts and events; (c) `intelRadar` multiplies per-frame radar
cost by ~4 through two compounding paths, a Confirmed mechanism for a dead-feeling helm with no exception required;
(d) `intelTruesight` is overrun by the flat muzzle/smoke rung from two stacks and is worth far less than `intelRadar` —
Eric's premise holds and his merge is well-motivated; (e) `cannonBlast` is dead under `cannonAp`; (f) `mineDamage` is
pick-order dependent; (g) `mineTrigger`'s last card is mostly clamped away; (h) acquisitions are structurally 1-of-4.

Not established: which boon throws, or whether an exception is involved at all. Every single-point crash theory was
refuted except one ungated lookup shape (Finding 9), and the whole suite is green — which is itself evidence that if
there is a throw, it lives in browser-only code. The performance path (c) may be the whole story on its own.

**One caution for whoever picks this up:** there is a real possibility that (c) is the actual player-reported bug and
(a)/(b) are latent hazards that have never fired. Do not treat landing (a)+(b) as proof the report is fixed — they
make the failure *observable and survivable*, which is what closes the diagnostic gap. Confirm against a real repro
before declaring it resolved.

## Recommended Next Steps

### Fix direction

Three independent mechanisms; they do not need to ship together.

**1. Containment — two one-line fixes, both independent of the trigger. Highest value in this report.**

- **`client/src/app/loop.ts:30-34`** — wrap the `simTick`/`render` calls in try/catch; log once with the boon list,
  hull class and stack. This converts every current *and future* frame-path exception from "game over" into "one
  dropped frame", **and makes the next occurrence self-report**, which is also the cheapest route to the trigger.
- **`client/src/net/roomBindings.ts:499-500`** — swap the two statements so `net.you = f.you` lands *before*
  `onOwnStats`. Removes the self-latching repeat (Finding 8).
- Optionally harden the three ungated lookups: `ui/boonCopy.ts:276`, `ui/upgradeMenu.ts:250` (Finding 9), and
  `ui/results.ts:665` / `render/hotbar.ts:778` (Hypothesis 9) — every sibling lookup in the engine is already
  `Object.hasOwn`-gated, so this is consistency, not new policy.

**1b. Performance (`intelRadar`).** Hypothesis 11 is Confirmed as a mechanism and is the best *non-crash* explanation
of the exact wording "lose the ability to control their ships". Worth profiling before assuming an exception exists at
all. Note this interacts with fix (2): merging the intel lines means *every* Intel Range purchase now moves
`radarRange`, so the ×4 cost curve would be hit **more often**, not less. Consider capping march resolution against
BASE radar range rather than the boon-widened value.

**2. The Intel Range merge (Eric's ruling).** Fold `intelTruesight` + `intelRadar` into one `intelRange` line driving
`radarRange`, with `sightRange` becoming a **derived** field re-pinned in `clampStats` exactly as `gun.rangeU` already
is — same firewall pattern, one derivation path, no new machinery. Removing `sightRange` from `BOON_STAT_PATHS` makes
it structurally underivable elsewhere.

**Eric ruled 2026-08-16: the ladder scales — every rung derives from Intel Range, gated on the OBSERVER.** See the
ruling section below for the implementation surface (two server gates, two client consumers, the oracles, a PV bump)
and for why the merge also makes Finding 2 structurally impossible. Two sub-questions (sweep, card economics) remain
open.

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

## Eric ruling 2026-08-16: THE LADDER SCALES

> *"It scales. Intel range means your detection range on all levels gets further."*

**Open Question 1 is RESOLVED.** The 5/8 muzzle-flash / wounded-smoke rung scales with the observer's Intel Range,
along with every other rung. This supersedes the flat-halo clause at `server/src/game/signals.ts:1546-1550`.

### This removes the odd one out — it does not create an exception

Every *consumed* rung of the eighths ladder is **already observer-scaled**. Verified:

| rung | consumer | scaling |
| ---- | -------- | ------- |
| 3/8 detect | `sightOf(me, now) * CONFIG.vision.detectFactor` (`signals.ts:276`) | observer-scaled |
| 4/8 sight | `sightOf(me, now)` → `me.stats.sightRange` (`signals.ts:222-225`) | observer-scaled |
| **5/8 muzzle/smoke** | `CONFIG.vision.muzzleFlash` (`signals.ts:1533`, `:1570`) | **FLAT — the only one** |
| 7/8 farRadar | *(deliberately unconsumed)* | n/a |
| 8/8 radar | `me.stats.radarRange` (`signals.ts:912`) | observer-scaled |

So the ruling makes 5/8 consistent with 3/8, 4/8 and 8/8, rather than carving out a new exception.

### The merge makes Finding 2 structurally impossible

This is the important structural consequence. Today `sightRange` and `radarRange` move via **two independent cards**,
which is precisely *why* sight can overrun the flat 5/8 rung at two stacks (Finding 2). Under one merged Intel Range
line every rung is a fixed fraction of one number:

```
detect = 0.375 R   sight = 0.5 R   muzzle/smoke = 0.625 R   farRadar = 0.875 R   radar = R
```

The ordering `detect < sight < muzzleFlash < farRadar < radar` then holds **at every Intel Range level by
construction** — it is no longer an invariant that can be violated, it is arithmetic. The Story 4.3 masking coupling
(the flash must cover the D1 back-dated shell spawn, i.e. `muzzle > sight`) likewise holds automatically, since
0.625 > 0.5 at every level. **The merge is not just a buff to truesight; it is the structural fix for Finding 2.**

### On the rationale being superseded — observer-scaled vs subject-scaled

`signals.ts:1546-1550` argues the halo must be flat "or the plume would carry per-observer build/state information".
That rationale **holds for SUBJECT-scaling and not for OBSERVER-scaling**, and the distinction is what makes this
ruling safe to implement:

- **Subject-scaled** (the *smoking ship's* build sets the reach) would genuinely leak: the plume's visible radius would
  encode the victim's Intel Range to everyone watching. **Do not build it this way.**
- **Observer-scaled** (the *watcher's* Intel Range sets how far they see) leaks nothing new. The observer already knows
  their own build; no identity rides either row (`mz` is a bare `{k,x,y}`, `sm` is `{k,x,y,tier}`); and it is the same
  shape truesight, detect and radar have always had.

Implement the gate on **the observer's** Intel Range. Recommend the superseded comment be rewritten to say exactly
this, so the next reader does not re-derive the flat rule from a rationale that was guarding a different hazard.

### Implementation surface (small)

- **Server:** `signals.ts:1533` and `:1570` change from `CONFIG.vision.muzzleFlash` to the observer's scaled 5/8 value.
  These are the only two gates.
- **Oracles:** the independently-reimplemented perception oracles must scale identically — 4 references in
  `server/src/__tests__/signals.test.ts`, 1 (a comment) in `server/src/__tests__/perception.test.ts`.
- **Ladder pins:** 6 references in `shared/src/__tests__/zone.test.ts` — these pin the *base* derivations and should
  survive, but must be re-read as base-level pins now that runtime values scale.
- **Client:** `render/smoke.ts` (puff culling) and `render/radarDim.ts` (the amendment-181 near-range dim mask) both key
  off the 5/8 rung and must be fed the scaled value. Note `config.ts:2769` already expresses it as a **ratio**
  (`muzzleFlash / sight` = 1.25), so that one is scale-invariant and needs no change — a good sign the ratio form is
  the right shape for the rest.
- **PROTOCOL_VERSION** must bump: catalog content is wire contract, and the intel lines are changing.

## Eric rulings 2026-08-16 (continued): sweep stays separate, Intel Range is ×4

> *"1) no, its a separate line. | 2) Make it 4 copies, its powerful."*

**`intelSweep` does NOT fold in.** It stays its own card line. Consistent with the range/rate distinction — sweep is a
revolution rate, not a detection radius, and "detection range on all levels" does not reach it. The `intel` category
therefore ends with **two** lines: `intelRange` (×4) and `intelSweep` (×5).

**The merged line ships at 4 copies, not 5.** Eric's stated reason: it is powerful. The resulting ladder, with every
rung a fixed fraction of Intel Range (×1.15/card, the step carried over from `intelRadar` and still an
implementer-drafted handwave the 2.10 tuning pass may move):

| stacks | radar (8/8) | detect (3/8) | sight (4/8) | muzzle/smoke (5/8) | farRadar (7/8) | radar render cost |
| ------ | ----------- | ------------ | ----------- | ------------------ | -------------- | ----------------- |
| 0      | 660.0       | 247.5        | 330.0       | 412.5              | 577.5          | ×1.00             |
| 1      | 759.0       | 284.6        | 379.5       | 474.4              | 664.1          | ×1.32             |
| 2      | 872.8       | 327.3        | 436.4       | 545.5              | 763.7          | ×1.75             |
| 3      | 1003.8      | 376.4        | 501.9       | 627.4              | 878.3          | ×2.31             |
| 4      | **1154.3**  | **432.9**    | **577.2**   | **721.5**          | **1010.1**     | **×3.06**         |

### The 4-copy ruling is also a performance ruling

Because the radar cost is purely quadratic across the whole reachable range (see the correction above), the copy cap
*is* the cost cap. Dropping the top stack from 5 to 4:

- worst-case radar render cost falls from **×4.05 → ×3.06** — about a **24% cut** in the worst frame.
- top radar range falls 1327.5u → 1154.3u.

So the balance instinct and the performance need point the same way here. Hypothesis 11 remains worth profiling, but
at a meaningfully lower ceiling than the current `intelRadar` ×5 allows.

### Deck economics of the ruling

Draw weight is **proportional to remaining copies** — `weight = copiesInDeck × perCardWeight`
(`shared/src/sim/deck.ts:180`, `pickLine` at `:129`). So the intel pool shrinks:

- **Before:** `intelTruesight` ×5 + `intelRadar` ×5 + `intelSweep` ×5 = **15** physical intel cards.
- **After:** `intelRange` ×4 + `intelSweep` ×5 = **9**.
- On a Torpedo Boat deck that moves intel's share of the pool from ~25% (15/59) to ~17% (9/53).

**This is less of a nerf than it looks, and is arguably correct.** The lost weight is almost entirely the deleted
`intelTruesight` line — the card Finding 3 shows was barely worth taking. The *useful* intel draw is close to
unchanged: `intelRange` at 4/53 ≈ 7.5% per draw slot against `intelRadar`'s old 5/59 ≈ 8.5%. The player sees a
worthwhile intel card at roughly the same rate and no longer burns offers on the weak one. If it proves too thin in
play, the lever is the copy count — but note that raising it also raises the radar-cost ceiling quadratically.

## Side Findings

- **`CONFIG.offer`'s comment asserts a property the code no longer enforces.** `shared/src/constants.ts:999-1006` says
  the offer is *"4 boons from 4 DISTINCT categories, UX-DR14 / FR19"*, and the inline comment on `size: 4` repeats
  *"each from a distinct BOON_CATALOG category"*. **The deck engine does not do this.** `pickLine`
  (`shared/src/sim/deck.ts:126`) excludes only by **line id** (`excluded.has(id)`), never by category — Story 2.8's
  deck model replaced the category-first roll wholesale, as `shared/src/sim/offers.ts:1-8` states outright (*"its
  catalog-insertion-order category machinery died"*). The comment was left behind. Two consequences worth naming: the
  next implementer will trust it, and it becomes more visible after this merge — with `intel` down to two lines, an
  offer containing **both** `intelRange` and `intelSweep` is now materially more likely, which under the stale comment
  would read as a bug. Worth either fixing the comment or deciding categories *should* be distinct — that is a design
  call, not a cleanup.
- The seven `<equipment>.reloadMs` whitelist entries in `BOON_STAT_PATHS` have **zero** catalog cards — deliberate per
  the 2026-08-04 global-cooldown ruling, retained so a future per-weapon card composes before `cooldownScale`.
- `shipSpeed` moves both `maxSpeed` and `reverseSpeed`, but the card copy headlines only `maxSpeed`
  (`client/src/ui/boonCopy.ts:211`) — the player is under-told what they bought.
- `torpedoSpeed` is honored by the sim but the client's wake ribbon provisioning for *other* players still uses
  `CONFIG.torpedo.speed` — cosmetic only.
- No production error tracking was found in the client, and no `window.addEventListener('error')` /
  `onunhandledrejection` in the boot path. Given Finding 1, a fatal client exception is currently **silent to the
  player and invisible to us** — console only. This is why the report arrived as a player complaint rather than a
  stack trace.
- **A dead ticker can be revived by accident.** `ticker.add`/`remove` routes to `_startIfPossible` → `_requestIfNeeded`
  (`Ticker.mjs:141-144`), and `makeAmbient` (`client/src/main.ts:4074-4090`) does add/remove on the same ticker. If
  some players report the game un-freezing on its own, this is the mechanism — and it would make the bug look
  maddeningly intermittent.
- Our loop listener registers at `UPDATE_PRIORITY.NORMAL` while Pixi's own `renderer.render` sits at `LOW`
  (`node_modules/pixi.js/lib/app/TickerPlugin.js:30`). Higher priority runs first, so a throw in our callback
  pre-empts the renderer entirely — hence a frozen picture rather than a live world with a stuck ship.
- `visionChanged` (`main.ts:2298-2304`) omits `sweepRpm`, but `sweepPeriodMs = 60000 / sweepRpm` is 1:1, so
  `intelSweep` is covered. Noted only because the three-field hand-written compare is fragile: any future consumer
  added below that early return which reads a fourth stat would go silently stale.
