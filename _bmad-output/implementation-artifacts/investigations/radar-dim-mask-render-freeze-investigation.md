# Investigation: Renderer freeze — `Cannot read properties of null (reading '0')` in Pixi's alpha-mask pipe

## Hand-off Brief

1. **What happened.** `Radar.syncDimMask()` (`client/src/render/radar.ts:1236`) destroys the near-range dim mask's
   `TextureSource` while that exact source is still the bound `uMaskTexture` of Pixi's **globally pooled**
   `AlphaMaskEffect`; Pixi's `BindGroup` self-destructs when any bound resource reports `destroyed`, nulls its
   `resources` map permanently, and the next alpha-mask push in the app throws inside `renderer.render()` — killing the
   Pixi ticker while the Colyseus socket keeps running, which is exactly the reported "game still going, UI and cam
   fully frozen".
2. **Where the case stands.** Root cause **Confirmed** end-to-end against `pixi.js` 8.19.0's own source; the stack trace
   frames map 1:1 onto the confirmed call chain. Regression introduced in `c23ca0a` (cycle 92, 0.17.92) — the same
   cycle that created the `intelRange` boon that deterministically triggers it.
3. **What's needed next.** Fix at the destroy site: stop swapping-and-destroying the dim texture; re-draw one
   persistent canvas source in place (`source.update()`). One file, no wire change, no PV bump.

## Case Info

| Field            | Value                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| Ticket           | N/A (Discord playtest reports, 2026-08-17, two independent reporters)                              |
| Date opened      | 2026-08-17                                                                                          |
| Status           | Concluded                                                                                           |
| System           | Hullcracker 0.17.97, production build (`index-B7Ecifkf.js`), browser client, `pixi.js` ^8.19.0      |
| Evidence sources | Playtester stack trace, frozen-frame screenshot, Discord transcript, `client/src/render/`, `node_modules/pixi.js/lib`, git history |

## Problem Statement

Playtester "Captain Chuck Testa", in **SOLO VS AI**: *"I had just sunk a dank torpedo into a battleship and then my
screen froze on that image… the game is still going — I only just died, apparently, but my UI and cam are fully
frozen."* He held one unspent upgrade point and no fitted boons; the freeze was ~1:24 into the match.

A second reporter: *"okay I got I think the same or similar on doing a radar upgrade"*, with the console trace:

```
Uncaught TypeError: Cannot read properties of null (reading '0')
    at Yo.getResource (index-B7Ecifkf.js:23:9214)
    at Object.get (index-B7Ecifkf.js:23:11362)
    at set inverse (RenderTargetSystem-BbyV0re7.js:182:651)
    at set inverse (RenderTargetSystem-BbyV0re7.js:182:3408)
    at xe.execute (RenderTargetSystem-BbyV0re7.js:182:4374)
    at L (RenderTargetSystem-BbyV0re7.js:182:9216)
    at Se.render (RenderTargetSystem-BbyV0re7.js:182:16302)
    at VM.emit (index-B7Ecifkf.js:23:21900)
    at Yt.render (index-B7Ecifkf.js:23:24047)
    at rh.render (index-B7Ecifkf.js:23:30432)
```

The premise held up on inspection: this is a client render-loop death, not a network or simulation fault.

## Evidence Inventory

| Source                        | Status    | Notes                                                                          |
| ----------------------------- | --------- | ------------------------------------------------------------------------------ |
| Minified stack trace          | Available | Sufficient: every frame maps to a named Pixi 8.19.0 symbol (see Finding 1)     |
| Frozen-frame screenshot       | Available | `pasted-1.png` — own hull, magenta burst ring, nameplates BIGMCLARGEHUGE / DEADLIGHT / DRONE; consistent with a last-presented frame |
| Discord transcript            | Available | `pasted-3.png`, `pasted-4.png` — repro context for both reporters              |
| `pixi.js` 8.19.0 library source | Available | `node_modules/pixi.js/lib` — read directly; confirms the whole chain           |
| Client render source          | Available | `client/src/render/radar.ts`, `fog.ts`, `textures.ts`, `radarDim.ts`           |
| Git history                   | Available | `git log -S 'syncDimMask'` isolates the regression to one commit               |
| Source maps for the prod bundle | Missing   | Not needed — the chain is confirmed structurally                              |
| Reporter #1's dazzle state at freeze | Missing   | Would settle *which* of the two triggers fired for him; does not affect the fix |

## Investigation Backlog

| # | Path to Explore                                                     | Priority | Status   | Notes                                                                 |
| - | ------------------------------------------------------------------- | -------- | -------- | --------------------------------------------------------------------- |
| 1 | Confirm the Pixi call chain from the minified frames                 | High     | Done     | Finding 1 — exact 1:1 match                                            |
| 2 | Find every client site that destroys a `TextureSource` used as a mask | High     | Done     | Exactly one: `radar.ts:1236` (Finding 3)                              |
| 3 | Establish which player action triggers the rebake                     | High     | Done     | `intelRange` boon, or a dazzle on/off flip (Finding 4)                 |
| 4 | Date the regression                                                   | Medium   | Done     | `c23ca0a`, cycle 92 (Finding 5)                                        |
| 5 | Audit `fitHeat`'s `BufferImageSource.destroy()` for the same class    | Medium   | Open     | Not the reported crash; WebGPU-only exposure — see Side Findings       |
| 6 | Reporter #1's exact trigger (dazzle vs. something else)               | Low      | Open     | Both triggers land on the same line; fix is identical either way       |

## Timeline of Events

| Time                   | Event                                                                                                       | Source                                   | Confidence |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------- |
| cycle 92 (0.17.92)     | `c23ca0a` re-anchors the dim mask to *effective* truesight, replacing a bake-once texture with a per-frame `syncDimMask()` rebake that destroys the old source | `git log -S 'syncDimMask'`               | Confirmed  |
| cycle 92 (same commit set) | `intelTruesight` + `intelRadar` merge into `intelRange`, making a "radar upgrade" move `sightRange` and therefore `sightHoleU` | CLAUDE.md epic-6 amendment 22; `2e8d6f7` | Confirmed  |
| 2026-08-17 ~5:17PM     | Reporter #1 freezes mid-match in SOLO VS AI, ~1:24 in, no boons fitted                                        | Discord (`pasted-3.png`)                 | Confirmed  |
| 2026-08-17 ~5:27PM     | Reporter #2 reproduces on applying a radar upgrade, captures the stack trace                                  | Discord (`pasted-4.png`)                 | Confirmed  |

## Confirmed Findings

### Finding 1: Every frame of the reported stack maps onto a named Pixi 8.19.0 symbol

**Evidence:**
- `node_modules/pixi.js/lib/rendering/renderers/gpu/shader/BindGroup.mjs:53` — `getResource(index) { return this.resources[index]; }`
- `node_modules/pixi.js/lib/rendering/renderers/shared/shader/Shader.mjs:132` — the `resources` Proxy's `get` trap: `return groups[data.group].getResource(data.binding);`
- `node_modules/pixi.js/lib/rendering/mask/alpha/AlphaMaskPipe.mjs:33` — `AlphaMaskEffect.set inverse(value) { this.filters[0].inverse = value; }`
- `node_modules/pixi.js/lib/filters/mask/MaskFilter.mjs:51` — `MaskFilter.set inverse(value) { this.resources.filterUniforms.uniforms.uInverse = value ? 1 : 0; }`

**Detail:** `Yo.getResource` is `BindGroup.getResource`; `Object.get` is the `Shader.resources` Proxy trap; the **two
consecutive `set inverse` frames** are `AlphaMaskEffect.set inverse` delegating to `MaskFilter.set inverse`; `xe.execute`
is `AlphaMaskPipe.execute`. `reading '0'` is `this.resources[0]` where `this.resources === null`. There is no other
construct in the library that produces this exact frame sequence.

### Finding 2: A destroyed `TextureSource` permanently destroys any `BindGroup` holding it

**Evidence:**
- `node_modules/pixi.js/lib/rendering/renderers/shared/texture/sources/TextureSource.mjs:226-237` — `destroy()` sets
  `this.destroyed = true`, then calls `unload()`, which at line 244 does `this.emit("change", this)`.
- `BindGroup.mjs:40-46` — `setResource()` subscribes: `resource.on?.("change", this.onResourceChange, this)`.
- `BindGroup.mjs:79-86` — `onResourceChange(resource) { this._dirty = true; if (resource.destroyed) { this.destroy(); } … }`
- `BindGroup.mjs:71-78` — `destroy()` ends with `this.resources = null`.

**Detail:** The destroy event and the change event are the same emission. A `BindGroup` therefore does not merely
invalidate on a destroyed resource — it **nulls its resource map irrecoverably**, and nothing ever rebuilds it.

### Finding 3: `Radar`'s dim mask is a `Sprite`, so its source is bound *directly* into the pooled mask filter

**Evidence:**
- `client/src/render/radar.ts:486` — `this.dim = new Sprite(bakeDimMaskTexture(this.dimBakedAtU));`
- `client/src/render/radar.ts:1202` — `if (this.blipLayer.mask !== this.dim) this.blipLayer.mask = this.dim;`
- `node_modules/pixi.js/lib/rendering/mask/alpha/AlphaMask.mjs:19` — `this.renderMaskToTexture = !(mask instanceof Sprite);`
- `AlphaMaskPipe.mjs` `execute()` — on the `!renderMaskToTexture` branch: `filterEffect.sprite = instruction.mask.mask;`
- `MaskFilter.mjs:69` (`apply`) — `this.resources.uMaskTexture = this.sprite.texture.source;`
- `AlphaMaskPipe.mjs` `execute()` — `const filterEffect = BigPool.get(AlphaMaskEffect);`

**Detail:** Because the dim mask is a `Sprite` (not a `Graphics`), Pixi takes the fast path that skips rendering the
mask to a pooled scratch texture and instead binds **our own `TextureSource`** as `uMaskTexture`. The `AlphaMaskEffect`
that holds it comes from `BigPool` — a process-lifetime pool — so the poisoned `BindGroup` is never discarded or
rebuilt for the life of the page.

### Finding 4: `syncDimMask()` destroys exactly that source, in-flight

**Evidence:** `client/src/render/radar.ts:1227-1237`

```ts
private syncDimMask(): void {
  const want = this.sightHoleU;
  if (want === this.dimBakedAtU) return;
  this.dimBakedAtU = want;
  const old = this.dim.texture;
  this.dim.texture = bakeDimMaskTexture(want);
  if (old !== Texture.EMPTY) old.destroy(true);   // ← destroys the TextureSource
}
```

`Texture.destroy(true)` calls `this._source.destroy()` (`Texture.mjs`), which is Finding 2's trigger. The new texture is
assigned first, but the `BindGroup` still holds the **old** source (bound during the previous frame's `MaskFilter.apply`),
and it does not release that listener until a *different* resource is set — which cannot happen, because `set inverse`
runs earlier in `execute()` than `apply()` and throws first.

**Trigger conditions** — `sightHoleU` is `fogHoleRadiusU(this.sightRange, this.dazzled)`, and two independent inputs
move it:

- **An `intelRange` boon.** `client/src/main.ts:2469` → `g.radar.setRanges(stats.sightRange, …)`. Since cycle 92,
  `sightRange` is derived as `radarRange / 2`, so a radar upgrade always moves it. **Deterministic** — this is
  reporter #2's exact repro.
- **A dazzle flip.** `client/src/main.ts:3191` → `g.radar.setDazzled(dazzled)`, driven by
  `now < you.dazzledUntil`. Both the onset and the expiry of a star-shell dazzle flip it.

### Finding 5: The regression landed in cycle 92, alongside the boon that triggers it

**Evidence:** `git log -S 'syncDimMask' -- client/src/render/radar.ts` returns exactly one commit — `c23ca0a`
("Hulls read above radar paint, and the scope quiets across the whole sight bubble (amendment 22)").

**Detail:** `client/src/render/textures.ts:192-194` still carries the pre-cycle-92 contract in its comment —
*"like every other bake here it happens ONCE — the mask is positioned and scaled per frame, never re-baked."* Cycle 92
made the mask observer-scaled (correctly, for the ruling) and added the destroy without noticing that a `Sprite` mask's
source is a live GPU binding. The same cycle merged `intelTruesight`/`intelRadar` into `intelRange`, which is what makes
"take a radar upgrade" hit the new path every time.

### Finding 6: Bots fire star shells, so the dazzle trigger is reachable in SOLO VS AI

**Evidence:** `server/src/game/ai/tactics.ts:382,402,406` — the AI tactics layer reads `readySlot(self, 'starShells')`
and picks a dazzle point.

**Detail:** This makes reporter #1's freeze reachable without any boon at all, which matches his report of having no
upgrades fitted.

## Deduced Conclusions

### Deduction 1: The throw kills the Pixi ticker, not the app

**Based on:** Findings 1-4, plus the reported symptom.

**Reasoning:** The exception originates inside `Renderer.render()`, called from the `Ticker`'s emit
(`VM.emit` → `Yt.render` → `rh.render` in the trace). An uncaught throw in a ticker listener aborts the tick and, with
the `BindGroup` permanently nulled, every subsequent tick throws at the same point. Nothing in the Colyseus room
binding, the input sampler, or the prediction step lives on that callback.

**Conclusion:** The canvas freezes on the last successfully presented frame while the socket stays connected and the
server keeps simulating the player's ship — precisely reporter #1's *"the game is still going… but my UI and cam are
fully frozen"*, and precisely why he then died while frozen.

### Deduction 2: The blast radius is the whole alpha-mask path, not just the radar dim

**Based on:** Finding 3 (the effect is drawn from `BigPool`).

**Reasoning:** One `AlphaMaskEffect` instance serves every alpha mask in the application. Once its `MaskFilter`'s
`BindGroup` is nulled, the fog's inverse hole mask (`client/src/render/fog.ts:175`) throws on the same line as the radar
dim mask.

**Conclusion:** Recovery is impossible without a page reload — which matches both reporters treating it as a hard
freeze rather than a glitch.

### Deduction 3: This is currently a 100%-reproducible failure on a routine player action

**Based on:** Findings 4 and 5.

**Reasoning:** `intelRange` is a common `intel`-category boon with ×4 copies in the catalog; nothing gates it. Every
player who picks it moves `sightRange`, which moves `sightHoleU`, which runs the destroy.

**Conclusion:** Any match in which a player takes a radar upgrade — or sails through a star-shell dazzle — ends in a
frozen client. Severity is ship-blocking.

## Hypothesized Paths

### Hypothesis 1 (reporter's framing): the freeze is caused by the torpedo kill / the death sequence

**Status:** Refuted

**Theory:** The freeze coincided with sinking a battleship, so the sink/explosion path or the Story 5.3 death sequence
is at fault.

**Supporting indicators:** Temporal coincidence in reporter #1's account; the frozen frame shows a burst ring.

**Resolution:** Refuted by Finding 1 — the stack contains no effects, sink, spectate, or camera frame; it is entirely
inside Pixi's alpha-mask pipe. Reporter #2's independent repro on a *radar upgrade*, with no kill and no death, shares
the identical trace. The kill was coincident, not causal; the plausible coincident cause is a star-shell dazzle flip
(Finding 6).

### Hypothesis 2: `Fog.rebake()`'s `old.destroy(true)` is a second instance of the same defect

**Status:** Refuted

**Theory:** `client/src/render/fog.ts:154` destroys a texture source on exactly the same events (sight change, dazzle
flip, resize), so it should poison the same `BindGroup`.

**Would confirm:** The fog sprite's source appearing as `uMaskTexture`.

**Resolution:** Refuted. The fog sprite is the *masked* object, not the mask; its mask is `holeMask`, a `Graphics`
(`fog.ts:175`), which takes Pixi's `renderMaskToTexture = true` path and binds a **pooled** `TexturePool` scratch
texture rather than ours. `Fog.rebake` is safe as written.

### Hypothesis 3: `fitHeat()`'s `BufferImageSource.destroy()` is a related exposure

**Status:** Open

**Theory:** `client/src/render/radar.ts:599-600` destroys a `BufferImageSource` on every heat-buffer reallocation
(zoom/resize). Under WebGPU, batched sprites' texture sources are also held in `BindGroup`s, which self-destruct
identically.

**Supporting indicators:** Finding 2's mechanism is generic to `BindGroup`, not specific to masks.

**Would confirm:** A `getResource`-on-null trace whose caller is a batch pipe rather than `set inverse`.

**Would refute:** Batch `BindGroup`s being rebuilt per geometry flush rather than retained across the destroy.

**Resolution:** Not the reported crash (the trace is unambiguously the mask path) and not exercised under the WebGL
renderer, which binds batch textures as uniform samplers. Left Open as a hardening item.

## Missing Evidence

| Gap                                              | Impact                                                              | How to Obtain                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Reporter #1's dazzle state at the freeze          | Would confirm which of the two triggers fired; changes nothing about the fix | Server-side log of `dazzledUntil` for that ship, or a repro with a star shell |
| Source maps for `index-B7Ecifkf.js`               | Would let the minified offsets be read directly rather than matched structurally | Ship source maps, or reproduce against the dev build                 |
| Which renderer backend the reporters ran (WebGL vs WebGPU) | Bears only on Hypothesis 3, not on the confirmed cause              | `renderer.type` in a console log, or ask the reporters               |

## Source Code Trace

| Element       | Detail                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Error origin  | `client/src/render/radar.ts:1236` — `if (old !== Texture.EMPTY) old.destroy(true);` inside `Radar.syncDimMask()`. Surfaces as a throw at `BindGroup.getResource` on the next Pixi render. |
| Trigger       | Any change to `Radar.sightHoleU` = `fogHoleRadiusU(sightRange, dazzled)`: an `intelRange` boon via `client/src/main.ts:2469`, or a dazzle on/off flip via `client/src/main.ts:3191`.  |
| Condition     | The dim `Sprite` is currently attached as `blipLayer.mask` (`client/src/render/radar.ts:1202`), so its `TextureSource` is the live `uMaskTexture` in `BigPool`'s shared `AlphaMaskEffect`. |
| Related files | `client/src/render/radar.ts`, `client/src/render/textures.ts` (`bakeDimMaskTexture`), `client/src/render/radarDim.ts`, `client/src/render/fog.ts` (same `destroy(true)` idiom, safe), `client/src/main.ts` (both trigger call sites) |

## Conclusion

**Confidence: High.**

**Confirmed root cause.** `Radar.syncDimMask()` destroys the near-range dim mask's `TextureSource` while that source is
still bound as `uMaskTexture` in the `MaskFilter` of Pixi's `BigPool`-held `AlphaMaskEffect`. Pixi's `BindGroup`
subscribes to each bound resource's `change` event; `TextureSource.destroy()` emits `change` with `destroyed === true`,
which makes the `BindGroup` call its own `destroy()` and set `resources = null` **permanently**. The next alpha-mask
push — anywhere in the app — enters `AlphaMaskPipe.execute()`, sets `inverse`, walks the `Shader.resources` Proxy into
`BindGroup.getResource(0)`, and throws `Cannot read properties of null (reading '0')` inside `renderer.render()`. The
Pixi ticker dies; the canvas holds its last frame; the socket and server simulation carry on. Every frame of the
reporter's stack trace is accounted for.

Two triggers reach it, both routine: an **`intelRange` boon** (deterministic — reporter #2) and a **star-shell dazzle
flip** (reporter #1's likely path, since bots fire star shells and he held no boons). Introduced in `c23ca0a`,
cycle 92 / 0.17.92; live for five cycles.

**Remaining uncertainty** is limited to *which* trigger fired for reporter #1 and to Hypothesis 3's WebGPU-only
exposure in `fitHeat()`. Neither affects the fix.

## Recommended Next Steps

### Fix direction

**Primary — stop destroying a bound mask source.** Make the dim mask's `TextureSource` immortal and re-draw it in
place rather than swapping textures:

- Retain the baking canvas alongside the sprite. On a `sightHoleU` change, clear and re-draw that canvas with
  `bakeDimMaskTexture`'s existing drawing code, then call `this.dim.texture.source.update()` to re-upload.
- `bakeDimMaskTexture` splits into a pure `drawDimMask(ctx, size, sightU)` plus the existing one-shot wrapper, so the
  bake rule stays in `render/textures.ts` and `radarDim.ts` remains the sole owner of the curve.
- This also retires the concern the current comment raises in its own justification (*"a match can rack up several
  dazzle events"*) — there is now exactly one canvas and one source for the life of the `Radar`.

**Alternative, if a same-shape minimal patch is preferred:** defer the destroy by one rendered frame (swap the texture,
queue `old`, destroy it on the *following* frame). By then `MaskFilter.apply()` has called `setResource` with the new
source, which unsubscribes the old one and makes its destroy harmless. This is strictly more fragile — it depends on a
render actually occurring between the swap and the destroy — and is not recommended over the primary fix.

**Do not** attempt to fix this by detaching `blipLayer.mask` before destroying: the poisoning is driven by the
`BindGroup`'s retained listener, not by whether the mask is currently attached.

**Hardening (separate, optional):** apply the same "never destroy a live-bound source" rule to `fitHeat()`
(`client/src/render/radar.ts:599-600`) — Hypothesis 3.

**Regression pin:** a unit test asserting that `syncDimMask` across a range change leaves the previously bound
`radar.dimMask.texture.source` un-destroyed (or simply that the source identity is stable across a rebake) catches both
this and any future re-introduction, without needing a GPU context.

### Diagnostic

Not required — the cause is confirmed structurally. If independent confirmation is wanted before the fix, the cheapest
proof is the reproduction below: it fails deterministically today and passes after the fix.

## Reproduction Plan

**Isolated (no GPU needed, catches the regression):**
1. Construct a `Radar`, attach the dim mask, capture `radar.dimMask.texture.source`.
2. Call `setRanges()` with a widened `radarRange`, then run one `render()` pass.
3. Assert the captured source is not `destroyed`. Fails on `HEAD`.

**Full system (matches both reporter accounts):**
1. `npm run dev`, open the client, start **SOLO VS AI**.
2. Earn one level and spend it on **`intelRange`** (the radar-range card).
3. Observe: the canvas freezes on the next frame; the console shows the reported `TypeError`; the ship keeps
   moving server-side (visible from a second browser or the server log). Recovery requires a page reload.
4. Alternative trigger: sail into and out of an AI star shell's dazzle radius without spending any boon — the flip
   produces the identical freeze.

## Side Findings

- **`Fog.rebake()` is safe, but only incidentally** (`client/src/render/fog.ts:154`). It uses the identical
  `old.destroy(true)` idiom and is guarded only by the fact that its mask is a `Graphics` rather than a `Sprite`. If a
  future change makes any `Sprite` a mask whose texture is rebaked, the same crash returns. The rule worth writing down
  is: **a `Sprite` used as a mask owns a live GPU binding — its `TextureSource` may never be destroyed while it is
  attached.** (Deduced from Finding 3.)
- **`client/src/render/textures.ts:192-194` now carries a stale contract in its comment** — *"like every other bake here
  it happens ONCE… never re-baked"* — which has been untrue of `bakeDimMaskTexture` since cycle 92. The comment is
  arguably what let the destroy slip through review. (Confirmed.)
- **The `client/src/render/ambient.ts` teardown deliberately passes `textureSource: false`**
  (`ambient.ts:121`), which is why leaving the home screen for a match does *not* trigger this crash — an accidental
  but real precedent for the fix direction. (Confirmed.)
