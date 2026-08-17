---
title: 'The dim mask stops killing the renderer'
type: 'bugfix'
created: '2026-08-17'
status: 'in-review'
baseline_commit: '7a733b4a7a7f35e3f0fe25efaee599aecfc01f3a'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/investigations/radar-dim-mask-render-freeze-investigation.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `Radar.syncDimMask()` destroys the dim mask's `TextureSource` while it is still bound as `uMaskTexture` in the `MaskFilter` of Pixi's `BigPool`-held `AlphaMaskEffect`. Pixi's `BindGroup` reacts by destroying itself and nulling `resources` permanently, so the next alpha-mask push anywhere in the app throws inside `renderer.render()` and kills the ticker — the client freezes on its last frame while the socket and sim carry on. Two routine actions trigger it: an `intelRange` boon (deterministic) and a star-shell dazzle flip.

**Approach:** Give the dim mask ONE `Texture`/`TextureSource` for the life of the `Radar` and re-draw it in place on a rebake (`source.update()`) instead of minting a replacement and destroying the old one. Nothing is ever destroyed, so nothing can poison the shared mask `BindGroup`.

## Boundaries & Constraints

**Always:**
- The rendered dim ramp must be pixel-identical to today's. `radarDim.ts` stays the sole owner of the curve; `dimRadii`/`dimScaleAt`/`minScale` are untouched.
- A rebake must still be driven from one place (`syncDimMask`'s per-frame `sightHoleU` compare) and must still happen on both of its inputs — an `intelRange` boon and a dazzle flip.
- Every rebake must remain observable to the existing `hullOverRadar.test.ts` suite, which asserts the exact `sightU` values the mask was baked against.
- `Texture.EMPTY` must never be drawn into, resized, updated, or destroyed — headless/jsdom callers hold it.

**Ask First:**
- Any change to what the dim ramp looks like, to its radii, or to the `0.2` floor (amendment 181 is Eric's ratified ruling).
- Extending the same fix to `fitHeat()`'s `BufferImageSource.destroy()` — see Never.

**Never:**
- Do not detach `blipLayer.mask` before the destroy as the fix — the poisoning comes from the `BindGroup`'s retained `change` listener, not from attachment.
- Do not adopt the deferred-destroy variant (destroy one frame later): it only holds if a render happens in between, and leaves the footgun in place.
- Do not touch `Fog.rebake()` (`client/src/render/fog.ts:154`) — same idiom, but safe: its mask is a `Graphics`, which binds a pooled scratch texture rather than ours.
- Do not touch `fitHeat()` (`client/src/render/radar.ts:599-600`) — its `BufferImageSource` is a batched child, never a mask, and `stage.ts:247` pins `preference: 'webgl'`, so the WebGPU variant is unreachable in production.
- No wire change, no `PROTOCOL_VERSION` bump, no `CONFIG`/`CLIENT_CONFIG` movement, no server change.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First bake | `Radar` constructed | A fresh canvas-backed `Texture` is minted and held for the instance's life | N/A |
| Rebake — boon | `setRanges()` widens `sightRange`, moving `sightHoleU` | Same `Texture` and same `TextureSource` object; canvas redrawn at the new radii; `source.update()` re-uploads | N/A |
| Rebake — dazzle | `setDazzled(true/false)` flips `sightHoleU` | Same as above; previously bound source is never destroyed | N/A |
| No-change frame | `sightHoleU` equals `dimBakedAtU` | Early return; no draw, no upload | N/A |
| Headless / stubbed bake | Held texture is `Texture.EMPTY` or is not canvas-backed | Redraw is skipped; `Texture.EMPTY` is left untouched | Skip silently — an undimmed scope beats a crashed one |

</frozen-after-approval>

## Code Map

- `client/src/render/textures.ts` -- `bakeDimMaskTexture()` (line ~196) and the shared `makeCanvas()` helper; the drawing code that must be reused verbatim for the redraw. `DIM_MASK_TEXTURE_SIZE = 1024` is fixed, so the canvas never resizes.
- `client/src/render/radar.ts` -- `this.dim` sprite construction (line ~486), `blipLayer.mask = this.dim` (line ~1202), and `syncDimMask()` (lines ~1227-1237) — the destroy site.
- `client/src/render/radarDim.ts` -- the pure ramp curve. Read-only for this change.
- `client/src/__tests__/hullOverRadar.test.ts` -- mocks `bakeDimMaskTexture` and asserts the `sightU` of every bake; the seam that must survive.
- `client/src/__tests__/radarEcho.test.ts`, `client/src/__tests__/radarViewport.test.ts` -- mock `bakeDimMaskTexture` to `Texture.EMPTY`; must keep passing unchanged.

## Tasks & Acceptance

**Execution:**
- [x] `client/src/render/textures.ts` -- extend `bakeDimMaskTexture(sightU, into?: Texture | null)`: when `into` is a live canvas-backed texture, redraw that canvas with the existing drawing code, call `into.source.update()`, and return `into`; otherwise mint as today. Keeps ONE exported function, so all three existing test mocks and both call sites stay valid. In the same pass, correct the stale header comment at lines ~192-194 (*"like every other bake here it happens ONCE … never re-baked"*) — untrue of this bake since cycle 92, and arguably what let the destroy through review.
- [x] `client/src/render/radar.ts` -- rewrite `syncDimMask()` to `this.dim.texture = bakeDimMaskTexture(want, this.dim.texture)` and DELETE the `old.destroy(true)` line; replace the now-stale `Texture.EMPTY`-guard comment with the reason the destroy is gone.
- [x] `client/src/__tests__/dimMaskLifetime.test.ts` (NEW file, not `hullOverRadar.test.ts` as first planned) -- the regression pin: across a `setRanges()` rebake the previously bound `radar.dimMask.texture.source` is the SAME object and is not `destroyed`, plus the dazzle-flip trigger and the real `bakeDimMaskTexture` reuse-vs-mint branch. **Why it moved:** `hullOverRadar`'s mock returns the shared `Texture.EMPTY`, and the old buggy code guarded its destroy with `old !== Texture.EMPTY` — so a destroy pin written against that mock would never fire and would pass with the bug re-introduced. A dedicated file mints real `Texture` objects, which makes the pin discriminate (verified: reverting `syncDimMask` fails 2 of its 11 tests), and leaves all three existing suites byte-identical as the spec requires. The relocation and its reasoning were independently confirmed at the acceptance audit.

**Acceptance Criteria:**
- Given a `Radar` whose dim mask is attached, when `setRanges()` moves `sightRange`, then `radar.dimMask.texture.source` is the identical object it was before and its `destroyed` flag is `false`.
- Given a `Radar` whose dim mask is attached, when `setDazzled()` flips, then the same identity-and-not-destroyed guarantee holds.
- Given the existing observer-scaling suite, when it runs unmodified, then every rebake is still recorded with the same `sightU` values it asserts today.
- Given a player in a live match, when they fit an `intelRange` boon or sail through a star-shell dazzle, then the renderer keeps running and no `TypeError` reaches the console.

## Spec Change Log

### 2026-08-17 — review gate (blind hunter + edge-case hunter), all findings classified `patch`

No `intent_gap` and no `bad_spec`: the approach survived review, so no loopback.

**Which of these are fail-proven, stated precisely** (an earlier draft of this log claimed all of them were, and the
acceptance auditor disproved it by reverting items 4 and 5 together and watching 11/11 still pass). **Fail-proven —
each reverted individually, exactly its own test went red:** the non-finite guard (1), the size guard (2), the context
reset (3), and the core fix itself (reverting `syncDimMask` to the destroying form fails 2 of 11). **NOT pinned by any
test, and knowingly so:** `skipCache` (4) — its effect is an entry in Pixi's global `Cache`, which no unit test here
can observe without reaching into Pixi internals; and item 5, which the audit then removed entirely (see below).

1. **Non-finite bubble guard** (edge-case hunter; the review's best catch, and a failure the fix ITSELF created).
   `NaN === dimBakedAtU` is false forever, so a NaN `sightHoleU` would redraw and re-upload the full 1024² surface
   every frame, silently, for the match. The destroying code crashed on the first such frame instead, which is why
   nothing guarded it before. `radarDim` already treats a non-finite bubble as reachable.
2. **Canvas SIZE is part of the reuse test** (both reviewers). Every other bake in `textures.ts` is canvas-backed and
   passed `isBakeCanvas`, so ownership needed more than "is it a canvas". Also pins the same-size invariant the
   re-upload depends on.
3. **`drawDimMask` resets `globalAlpha`/`globalCompositeOperation`/transform** (both reviewers). A reused context no
   longer arrives virgin; without this the first future edit adding a clip or composite mode would corrupt only the
   SECOND bake onward — i.e. only after a boon or dazzle.
4. **`Texture.from(canvas, /* skipCache */ true)`.** Both reviewers flagged that an abandoned mint leaks; both
   proposed curing it with `destroy()`, **which is the crash**. `Texture.from` pins the texture in Pixi's global
   `Cache` and releases only on its `destroy` event, so skipping the cache makes an abandoned texture plain garbage
   with nothing destroyed.
5. ~~**Commit `dimBakedAtU` only after a successful bake**~~ — **APPLIED, THEN REVERTED AT THE ACCEPTANCE AUDIT. It
   was wrong, and both earlier reviewers were wrong to ask for it.** Their argument was that committing first blocks
   every retry for the match. True, and that is the DESIRABLE behaviour here: `app/loop.ts:16` states the contract as
   *"a frame-path throw costs ONE FRAME"*, so committing first spends one frame and then early-returns forever,
   leaving a stale-but-drawn ramp. Committing afterwards makes a throwing bake retry every frame, abort `render`
   every frame, and freeze the picture — reintroducing the exact failure class this cycle exists to remove. A stale
   radius is also the graceful degradation `radarDim` already chooses. Original ordering restored, now with a comment
   saying why, so the next reviewer does not "fix" it again.
6. **Corrected a factual overclaim of mine** (blind hunter): "costs LESS memory than the destroy did" is wrong — the
   old code destroyed as it minted, so steady-state footprint matched. Churn changed, not footprint. Fixed in
   `radar.ts`, `CLAUDE.md` and here.
7. **Tests rebuilt against real Pixi objects.** Both reviewers independently flagged test theatre: the reuse branch
   was only ever exercised against a hand-made object shaped to satisfy our own guard, so if
   `Texture.from(canvas).source.resource` were not the canvas the fix would be inert with every test green.
   Verified against Pixi 8.19 source (`CanvasSource` does store it there) AND now pinned by tests using a real
   `CanvasSource`/`Texture`. Added coverage for the real `Texture.EMPTY` singleton, a destroyed `Texture` with a live
   source, a destroyed source, and a wrong-size canvas; dropped a bare `toThrow()` that asserted a jsdom limitation
   rather than the behaviour; added an assertion that the redraw opens with an opaque full-canvas fill (the claim
   in-place redraw's correctness rests on). 5 tests → 11.

### 2026-08-17 — acceptance audit: three corrections and two open items

1. **The commit-order patch was REVERTED** — see item 5 above. It was a real regression introduced by the review
   round, caught only because the auditor read it against `app/loop.ts`'s stated containment contract.
2. **This log's own "each fail-proven" claim was false** and is corrected at the top. Items 4 and 5 had no test; the
   auditor proved it by reverting both together and watching 11/11 still pass.
3. **The stated reason `Fog.rebake` is safe was the wrong reason.** Its mask being a `Graphics` is true but not
   operative: the texture it destroys is the fog overlay's own CONTENT, sitting on the sprite being MASKED, so it is
   never bound as `uMaskTexture` regardless of its mask's type. As written it implied the safety test is "is the mask
   a `Graphics`", which would misdirect the next agent about which textures the lifetime rule governs. Corrected in
   `radar.ts`, `textures.ts` and `CLAUDE.md`. **The same imprecise wording survives in the frozen "Never" clause** —
   left untouched because that block is human-owned; its instruction (do not touch `Fog.rebake`) is correct anyway.

**OPEN — AC #4 is NOT verified.** *"...the renderer keeps running and no `TypeError` reaches the console"* is the only
criterion that proves the bug is actually fixed in a browser, and nothing establishes it: no unit test can (jsdom has
no 2d context) and the manual check was not performed — the dev server is not running and this project's standing rule
is that the agent never starts it. Both load-bearing assumptions were verified against Pixi 8.19 source independently
by two reviewers (`Texture.from(canvas).source.resource` IS the canvas; `source.update()` re-uploads rather than
taking the resize path), but the redraw-in-place path has never executed against a real WebGL renderer.

**OPEN — I/O matrix row 5 overstates the headless contract.** It promises "skip silently"; the code skips the redraw,
leaves `Texture.EMPTY` untouched, then throws from the mint path on a host with no 2d context. Unreachable in a real
browser and mocked away in every suite, but the row is inaccurate. In the frozen block, so left for the human.

**Rejected, with reasons** (recorded so they are not re-litigated): *teardown destroy* — `Radar` has no `destroy()`,
`ambient.ts` tears down with `textureSource: false`, and the `BindGroup` listens to the SOURCE, so it is unreachable;
*dead `Texture` import in radar.ts* — still used at `radar.ts:612`, and lint is clean; *the stub ignores `sightU`* —
already pinned by `hullOverRadar.test.ts`, which asserts the exact radii; *`Texture.WHITE` would pass `isBakeCanvas`*
— factually wrong in 8.19, it is a `BufferImageSource` over a 1×1 `Uint8Array` and both singletons have
`destroy = NOOP`.

## Design Notes

The hazard, in one line: **a `Sprite` used as a mask owns a live GPU binding.** Pixi sets `renderMaskToTexture = !(mask instanceof Sprite)`, so a `Sprite` mask skips the pooled scratch texture and `MaskFilter.apply` binds our own source; `BindGroup` subscribes to it and self-destructs on its `destroy`. Full citation chain is in the linked case file.

The redraw is safe because the canvas never changes size: `TextureSource.update()` re-uploads only when `resize()` reports no change, and `DIM_MASK_TEXTURE_SIZE` is a constant. No clear is needed first — the existing bake opens with an opaque full-canvas `fillRect`.

Shape of the seam:

```ts
export function bakeDimMaskTexture(sightU: number, into?: Texture | null): Texture {
  const reuse = canvasOf(into);            // null unless `into` is live + canvas-backed
  const { canvas, ctx } = reuse ?? makeCanvas(DIM_MASK_TEXTURE_SIZE, DIM_MASK_TEXTURE_SIZE);
  drawDimMask(ctx, sightU);                // the existing drawing body, unchanged
  if (reuse === null) return Texture.from(canvas);
  into!.source.update();
  return into!;
}
```

Memory: one 1024² source per `Radar` for its lifetime. Steady state is UNCHANGED (the old code destroyed as it minted, so it also held one at a time) — what goes away is the per-dazzle allocation churn.

## Verification

**Commands:**
- `npm run lint` -- expected: clean, no complexity errors (standing directive: fix any that surface).
- `npm test -w client` -- expected: all green, including the three suites that mock `bakeDimMaskTexture` and the new regression pin.
- `npm run check` -- expected: lint + type-check across all three workspaces + the full suite green. This is the ship gate.

**Manual checks (if no CLI):**
- With the dev server already running (never start it — curl `:5173` first), join a match, fit an `intelRange` boon, and confirm the scope keeps animating with a clean console. The dim ramp must look unchanged: quiet across the sight bubble, full strength at the 5/8 rung.
