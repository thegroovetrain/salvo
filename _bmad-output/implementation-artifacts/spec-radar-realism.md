---
status: ready-for-dev
cycle: 50
version: 0.17.50
protocol_version: 25 -> 26
warnings: []
---

# Spec: The Radar Realism Cycle (cycle 50)

**Design contract:** amendments **51–62** in
`_bmad-output/implementation-artifacts/epic-4-context-amendments.md`. Those amendments are the
RULINGS. This spec is the implementation plan derived from them. Where the two ever appear to
conflict, **the amendments win** — report the conflict, do not resolve it yourself.

**Investigation of record:** `bmad-dev-auto-result-radar-realism-investigation.md`.

## Goal

Add a second radar grammar — `return` mode, modelling an actual marine radar — **alongside** the
shipped Story 4.2 `silhouette` grammar, selected by two independent server-side flags. Production
behavior is byte-identical until a flag is flipped.

---

## Orchestrator rulings (made before dispatch — agents do NOT re-decide these)

**R1 — `BlipEvent` becomes a two-member union with NO per-event discriminator.**
The server picks the grammar for the whole room and announces it in the welcome handshake, so every
blip in a given match has the same shape and a per-event tag would be dead weight on a 20Hz channel.

```ts
export interface SilhouetteBlipEvent {   // the shipped 4.2 shape — KEY ORDER UNCHANGED
  k: 'blip'; id: string; x: number; y: number; t: number;
  cls: HullId; heading: number; speed: number;
}
export interface ReturnBlipEvent {
  k: 'blip'; id: string; x: number; y: number; t: number;
  ext: number;                            // u — aspect-projected echo extent
}
export type BlipEvent = SilhouetteBlipEvent | ReturnBlipEvent;
```

The client narrows on the welcome-announced mode, never by probing fields.

**R2 — the server sends PURE ASPECT GEOMETRY; the client applies range attenuation.**
`ext` is the hull silhouette's extent projected perpendicular to the observer→target bearing, in
world units, and nothing else. Range attenuation is applied at RENDER time by the client, which
already knows both its own position and the paint position.

Rationale: this honors amendment 55's "size = return strength, attenuated by range" while respecting
amendment 61's "`CONFIG.vision` gains no new constant" — the attenuation curve is a presentation
knob and belongs in `CLIENT_CONFIG`, not on the wire. It also keeps the wire minimal and leaks
strictly less. *(Flagged to Eric as a refinement of amendment 55's wording; the delivered behavior is
what 55 asked for.)*

**R3 — pseudonyms are PER-ROOM and stable for the match, and the correlation ceiling is documented.**
`HC_RADAR_IDENTITY=pseudonym` maps each ship id to a stable random track id, rolled on the server's
private stream (the same posture as the zone nonce — never derivable from the client-known map seed).
A decoy emits under its OWNER's pseudonym, preserving the Story 1.8 indistinguishability law.

**Honest bound, which MUST be written into the code comment:** a stable pseudonym does not make
tracks uncorrelatable. A client that watches a ship leave truesight (real id, via `Contact`) and
reappear at radar range can re-link it by trajectory. Fully breaking that would require per-paint
random ids, which would destroy ghost-track linking — the entire course-inference channel amendment
56 depends on. What the pseudonym buys is that the **roster link is not free and not instant**. Do
not overclaim it.

**R4 — island returns are pure client presentation, sampled along the NEAR arc.**
For each island within radar range, when the sweep crosses bearings the island subtends, emit return
marks along the arc facing the observer. Everything behind stays shadow — this is not a new rule, it
is the existing one (islands block every sensor at all ranges). Island returns obey the sweep and
the phosphor decay exactly as ship returns do. **No server involvement, no wire field.**

**R5 — blob geometry is a seeded irregular polygon, and it must be PURE and unit-tested.**
Seed derives from (track id, paint time) so a paint is stable while it decays but the next paint of
the same contact differs. Live in a new pure module with zero Pixi imports, mirroring how
`blipMarks.ts` serves `radar.ts` today.

**R6 — golden-frames snapshots are parameterized over BOTH modes.** A snapshot that only covers the
default grammar would let the whole new path rot silently.

---

## Ownership seams (STRICT — parallel agents; two agents in one file is corruption)

| Milestone | Owns | May NOT touch |
|---|---|---|
| **M1 shared** | `shared/src/**` | `server/**`, `client/**` |
| **M2 server** | `server/src/**` | `shared/**` (frozen after M1), `client/**` |
| **M3 client** | `client/src/**`, `client/vite.config.ts` | `shared/**` (frozen after M1), `server/**` |

If a milestone needs a change outside its seam: **report it, do not make it.**

---

## M1 — Shared wire contract + the aspect primitive (BLOCKING; everything depends on it)

1. `shared/src/types.ts` — split `BlipEvent` per R1. Keep the existing 4.2 doc block attached to
   `SilhouetteBlipEvent`; write a new one for `ReturnBlipEvent` recording the anti-cheat bound
   (amendment 55: geometry + bearing ONLY — never boons, hp, damage, or any range-derivable flight
   quantity).
2. `shared/src/types.ts` — `WelcomeMsg` gains `radarGrammar: RadarGrammar` and
   `radarIdentity: RadarIdentity`; export both union types.
3. `shared/src/sim/silhouette.ts` — add `perpendicularExtent(poly, bearing): number`: the polygon's
   total extent projected onto the axis perpendicular to `bearing`. Pure. Note `extentAlong` in
   `client/src/render/blipMarks.ts:103` is the near-identical primitive already in the codebase —
   read it, match its idiom, but do NOT move or edit it (client seam).
4. `shared/src/index.ts` — `PROTOCOL_VERSION` 25 → 26.
5. Tests in `shared/src/__tests__/`:
   - a battleship bow-on returns a materially SMALLER extent than the same hull abeam
     (this is the whole design thesis — pin it);
   - a torpedo boat abeam vs. a battleship bow-on **overlap** in extent (size does not cleanly map
     to class — amendments 55 and 57);
   - `perpendicularExtent` is invariant under adding π to the bearing (a hull's extent is the same
     from either side);
   - the barrel test (`shared/src/__tests__/barrel.test.ts`) still passes with the new exports.

**AC1** — *Given* a `battleship` silhouette, *when* `perpendicularExtent` is taken at bearing 0
(bow-on) versus π/2 (abeam), *then* the abeam value is strictly greater.
**AC2** — *Given* the three hull classes, *when* extents are sampled across all aspects, *then* the
per-class ranges overlap, so no single extent value identifies a class.
**AC3** — *Given* the barrel, *when* `npm run build -w shared && npm test -w shared` runs, *then* all
tests pass and `PROTOCOL_VERSION === 26`.

---

## M2 — Server: mode plumbing, the branched shaper, pseudonyms

1. **Env reading stays in the adapter.** `server/src/rooms/ArenaRoom.ts` reads
   `process.env.HC_RADAR_GRAMMAR` / `HC_RADAR_IDENTITY` and passes the resolved modes into `World`.
   This matches the existing seam (`ArenaRoom.ts:339` — *"process.env is read HERE, in the adapter"*)
   and is what keeps `world.ts` free of Colyseus AND of environment coupling. Unrecognized/absent
   values fall back to today's behavior (`silhouette` / `roster`) — fail-safe, never fail-open.
2. `server/src/game/world.ts` — carry the two modes; build and own the per-match pseudonym map (R3).
   **Zero Colyseus imports must remain true.**
3. `server/src/game/signals.ts` — `blipShape` branches on grammar; `blipGate` is UNCHANGED (the
   visibility rule does not move — only the wire shape does). The decoy counter-intel path emits
   under the owner's pseudonym when in pseudonym mode. Thread the modes through `SignalContextBase`.
4. `ext` computation: `perpendicularExtent(transformPolygon(hullSilhouette(cls), 0, 0, heading),
   bearing(observer → target))`. Per R2, **no range term server-side.**
5. `ArenaRoom` welcome handshake carries the two modes.
6. Tests:
   - `goldenFrames.test.ts` parameterized over both grammars (R6);
   - the master perception invariant suite runs in BOTH modes and still passes — no contact/event
     may reference anything outside sight ∪ this-tick radar paints;
   - **a `return`-mode frame contains no `cls`, `heading`, or `speed` on any blip** (the actual
     deletion, pinned);
   - in pseudonym mode, no blip `id` equals any roster ship id, and a decoy's blip id equals its
     OWNER's pseudonym;
   - `ext` is unchanged by granting a boon / changing hp (amendment 55's anti-cheat bound, pinned as
     a fail-proven test).

**AC4** — *Given* `HC_RADAR_GRAMMAR` unset, *when* a client joins, *then* every blip carries
`cls`/`heading`/`speed` exactly as today and the golden-frames snapshot is byte-identical to the
pre-cycle one.
**AC5** — *Given* `HC_RADAR_GRAMMAR=return`, *when* a ship is painted, *then* its blip carries `ext`
and none of `cls`/`heading`/`speed`.
**AC6** — *Given* `HC_RADAR_IDENTITY=pseudonym`, *when* a decoy and its owner are both painted,
*then* both blips carry the same pseudonymous id and neither equals the owner's roster id.
**AC7** — *Given* any mode combination, *when* the perception invariant suite runs, *then* it passes
unchanged.

---

## M3 — Client: return rendering, blob geometry, island returns

1. `client/src/net/connection.ts` — read the two modes off the welcome into client state.
2. **New** `client/src/render/returnMarks.ts` — PURE (zero Pixi), per R5: seeded-jitter polygon
   generator + the range-attenuation curve (R2). Unit-tested like `blipMarks.ts`.
3. `client/src/render/radar.ts` — branch on grammar. In `return` mode: draw the blob, no silhouette,
   no speed vector, monochrome phosphor green with brightness carrying age only.
4. `client/src/render/phosphor.ts` + `client/src/config.ts` — in `return` mode use the original
   bright→dark green ramp (`blipFresh`/`blipFaded` tokens already exist). The greyscale `blipCool`
   multiplier stays for `silhouette` mode — it exists only because hue is a channel there.
   **Do not delete it.**
5. **Island returns** (R4) — this milestone owns it too, because it lands in `radar.ts` and two
   agents in one file is corruption. Keep the geometry pure in `returnMarks.ts` (or a sibling pure
   module) with `radar.ts` holding only the call site.
6. `client/vite.config.ts` — the old `__BLIP_VARIANT_P__` define is SUPERSEDED by the server flags
   (amendment 52). Remove it and its `radar.ts:115` consumer.
7. **Splash separation** (amendment 59): fall-of-shot `sp` marks stay `{colors.splash}` and must
   remain visually separable from green returns. Add a token-level test asserting the splash color
   is not within the phosphor green band.
8. Tests: blob determinism (same seed → same polygon; different paint time → different polygon),
   the attenuation curve is monotone decreasing in range, island near-arc sampling produces marks
   only on the observer-facing side.

**AC8** — *Given* `return` mode, *when* the same contact is painted twice, *then* the two blobs
differ in shape, and *when* one paint is re-rendered across its decay, *then* its shape is stable.
**AC9** — *Given* `return` mode, *when* a contact is painted at increasing range with identical
aspect, *then* the drawn size decreases monotonically.
**AC10** — *Given* an island within radar range, *when* the sweep crosses it, *then* return marks
appear on the near arc only.
**AC11** — *Given* `silhouette` mode, *when* the client renders, *then* behavior is identical to the
pre-cycle build (silhouettes, hues, ARPA vectors, `blipCool` grey ramp).

---

## Global constraints (bind every milestone)

- ESLint `complexity: ["error", 10]` — enforced, no exceptions.
- `shared/` stays pure (zero I/O); `world.ts` and `match.ts` keep **zero Colyseus imports**.
- The master perception invariant and its four declared exceptions (`sp`, `hc`, `mz`, `sunk`) are
  UNTOUCHED. This cycle only ever REMOVES fields from frames.
- No CONFIG combat tunable moves; `CONFIG.vision` gains no new constant.
- **No design-doc edits in-cycle** — doc drift is ledgered for the Eric-gated 7-5 batch
  (amendment 62).
- Agents never commit. The orchestrator commits after independent verification.
- Gate: `npm run check` (lint + type-check + all tests) from the repo root.
