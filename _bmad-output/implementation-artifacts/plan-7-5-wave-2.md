# Story 7-5 WAVE 2 — Plan (orchestrator-owned, binding on all agents)

Content source of truth: `_bmad-output/implementation-artifacts/7-5-decks.md` (Eric).
Eric's four gating answers: `spec-7-5-upgrade-cards-v2.md` § WAVE 2 RULINGS (A1–A5).
Wave 1 (landed, PV 42): `plan-7-5-wave-1.md`.

**Agents may NOT invent mechanics.** Every ruling here is the orchestrator's. Values marked
**[DRAFT]** are implementer handwaves inside Eric's ratified shape, to be tuned on the water —
implement them exactly as written and flag them in your report; do not re-derive them.

## Feature 1 — BROADSIDE BARRAGE (replaces the cannon outright)

**The cannon is DELETED**, not kept alongside. `EquipmentId` `'cannon'` → `'broadside'`.
Battleship fit becomes `[gun, broadside, starShells, empty]` — broadside on Q, star shells
unchanged on E. `acquireCannon` → `acquireBroadside` (same rare ×1 acquisition shape).

**R2.1 — the arc.** `ArcShape` gains a NEW kind `{ kind: 'twin-sector'; offset: number; halfArc: number }`
meaning two mirrored sectors at `heading ± offset`. Values taken VERBATIM from commit `26318d5`:
`offset = 90°`, `halfArc = 60°`. Port covers 30°–150°, starboard −30°–−150°, leaving 60°-wide
dead zones dead ahead and dead astern. A click outside BOTH sectors is DENIED through the
existing denial path (never silent — FR12).

**R2.2 — which side fires.** The side whose sector contains the click bearing. Only that side's
turrets fire. There is no "both sides at once".

**R2.3 — the fan.** Every shell ends its run at the CLICK'S RANGE, so the pattern is an arc at
constant radius from the ship, spread ANGULARLY about the click bearing.
- ODD turret count → the middle shell flies exactly on the click bearing (it *absolutely* hits).
- EVEN turret count → shells straddle symmetrically; NO shell is on the bearing.
- Shells are evenly spaced across the full fan.
**[DRAFT]** fan half-angle by SPREAD stack: `12° → 9° → 6.5° → 4.5° → 3°` (index = copies held).

**R2.4 — numbers.** 20 damage/shell. Bursts LIKE THE GUN — **[DRAFT]** `burstRadius` 15u (the
gun's). Reload 30 000 ms, pool 1. Shell speed 500 (the gun family's). Turrets: 3 base, +1 per
BROADSIDE TURRETS card to 5.
**RANGE IS THE 5/8 RUNG**: derived as `radarRange × CONFIG.vision.muzzleFlashFactor` and re-pinned
post-fold in `clampStats` exactly as the other `rangeU` paths are — 412.5u base, 537.5u at max
RANGE. It is the FIRST weapon not at full radar reach. `broadside.rangeU` must therefore NOT be
on `BOON_STAT_PATHS`.

**R2.5 — signals are PER SHELL (Eric A2).** Each shell independently emits its own `mz`, `sp` and
`hc`, exactly as an ordinary gun shell. NO salvo aggregation. A 5-turret barrage legitimately
produces 5 muzzle flashes and up to 5 hit calls.

**R2.6 — deletions.** `CannonMode`, `cannon.mode`, the `shell.ts` plunging-fire branch, the AP
pierce path, `cannonDamage`/`cannonArcing`/`cannonAp`/`acquireCannon`, `CONFIG.cannon`, and the
`bulwark`/`siege` bot profiles' cannon lines. **AND THE WHOLE EXCLUSIVITY MECHANISM** — the cannon
pair was its last user (wave-1 R4), so `exclusiveWith`, `validateExclusiveLink`'s symmetry checks,
`boonReplacesLine`, the doctrine swap-out and `returnCards` all die here. `BoonDef.exclusiveWith`
leaves the type. Epic-4 amendment 17's "exactly one `hc` per shell resolution" keeps holding —
one per SHELL, not one per salvo.

## Feature 2 — RADAR BUOY (replaces the decoy buoy outright)

`EquipmentId` `'decoyBuoy'` → `'radarBuoy'`. `acquireDecoy` → `acquireRadarBuoy`. **The decoy role
is DELETED — nothing fakes a ship contact any more** (Eric: may return someday).

**R2.7 — the buoy.** Own radar, range 330u **[DRAFT: a flat constant, NOT observer-scaled — it is
the buoy's own set, not the owner's build]**. Own sweep, 15 RPM base, +1.25/BUOY card → 20 at ×4.
**20 000 ms life on a 30 000 ms reload (Eric ruling 2026-08-19 — SUPERSEDES the earlier
30s/20s)**. **50 HP, destructible by anything that damages a ship**; killing one pays NO XP and
prints NO kill-feed line. Click-placed like a mine — reuse the mine's rear sector (±60° at
`placeRange` 150u). Pool 1.
**CONSEQUENCE, ledgered not fudged:** **at BASE cooldown** life is SHORTER than the reload, so out
of the box **at most ONE buoy is live**, with a ~10s dead gap between one expiring and the next
being available. The earlier 30s/20s ordering allowed two overlapping; that is superseded **as the
base**. No IMPLEMENTER may "helpfully" restore overlap by raising `maxAmmo` or shortening
`reloadMs` — but **PLAYER CARDS legitimately do**, and that is the reward curve, not a leak:
BUOY I–IV adds life (R2.20), and the universal RELOAD line scales `radarBuoy.reloadMs` through the
ONE global `cooldownScale` like every other equipment's reload (15 000 ms at a full stack against a
20 000 ms life = two buoys overlapping). **The buoy is NOT exempted from the global cooldown lever**
— exempting it would make it the odd equipment out (wave-2 review gate, orchestrator ruling; pinned
by `radarBuoy.test.ts`'s "a full RELOAD stack legitimately overlaps two buoys").

**R2.8 — the relay is RADAR RETURNS ONLY, never vision.** The buoy is a second observer for
`blipGate` purposes and nothing else: it grants no sight bubble, no truesight, no LOS. Its returns
merge into its OWNER's frame. Island shadowing applies from the BUOY's position (it is a real
radar). Height-aware shadowing (`radarShadow.ts`) applies unchanged.

**R2.9 — the buoy paints with its OWN profile and NO owner identity** (Eric A4). Enemies see it on
radar like anything else; nothing on the wire says whose it is.

**R2.10 — GUN BUOY.** 5 damage on a 5 000 ms cooldown, auto-firing at hostiles within the buoy's
own 330u radar range. Uses the SAME hostile definition as captive mines (R2.13).

**R2.11 — JAMMING BUOY. THE FALSE RETURNS ARE SERVER-GENERATED.** This is the load-bearing
architectural point and it INVERTS the wake-chop precedent: chop is client-side because it carries
no information; jamming's entire purpose is DENYING information, so a client that dropped the fakes
would gain a decisive advantage. The server emits them and they must be **wire-indistinguishable
from real blips**.
- It ADDS fakes; it NEVER deletes real returns. The real hull still paints — it is simply one of
  many candidates.
- Radar only. Truesight and LOS are untouched: the counter is to sail in and look.
- The buoy's OWNER is exempt and sees the truth. The buoy is concealed among its own fakes.
- **[DRAFT]** ~10 fakes live in the 330u circle, re-scattered each sweep.
- **This is the first deliberate emission of a FALSE signal through `perception.observe()`.** It
  does NOT breach the master invariant in the leak direction (a fake discloses nothing real), but
  the invariant's tests assert every blip traces to a real ship. That needs an **EXPLICIT,
  documented carve-out** in the oracle — never a quiet edit. The declared-exception count stays at
  SIX; this is not a seventh, because nothing real is disclosed.

## Feature 3 — CAPTIVE MINES

New card `mineCaptive` (mines, rare ×1) setting the verb flag `mine.captive`.

**R2.12 — the transform.** Trigger and blast SWAP (32↔48), then trigger ×3 → **trigger 144u,
blast 32u**. Derived post-fold in `clampStats` beside the existing `triggerRadius` re-pin. MINES
cards apply on top (the swap-and-triple is linear, so card order cannot matter — 210.8u/46.9u at
×4). **A captive mine NEVER detonates on contact** — the torpedo is its only attack.
It holds ONE un-upgraded torpedo (base speed, no torpedo boons) dealing MINE damage at MINE blast
radius, fired at the first hostile to enter range with intelligent lead; dodgeable; the mine is
EXPENDED on fire. Still counts against `maxLive`. Keeps the 3 000 ms arm delay.

**R2.13 — "HOSTILE" (Eric).** An enemy captain or bot, OR a fleet drone whose CURRENT acquired
target is the mine's owner — read LIVE off the existing `FleetController` target state, so a drone
that breaks off becomes safe to sail past again. Neutral drones are IGNORED. **THIS GATE IS
CAPTIVE-ONLY**: ordinary and prop-fouling mines still trigger on ANY drone, and a mine hit still
does not aggro a drone (unchanged).

**R2.14 — CAPTIVE STACKS WITH PROP FOULING (Eric A1)** and the captive torpedo's hit CARRIES THE
FOUL. Both are independent verb flags (wave 1) and the torpedo reads BOTH.

## Feature 4 — STAR SHELL GUN REACH

**R2.15.** A GUN click whose target point lies inside a LIVE lit zone **owned by the clicking
player** is legal even beyond `gun.rangeU`. Gun ONLY — never broadside, never torpedo. Own flares
ONLY, never an enemy's. Server-authoritative (it is a legality gate); the client's aim preview
must agree exactly or the preview lies.

## Feature 5 — BARREL fires PARALLEL, and straddles

**R2.16.** BARREL's extra shells fly on PARALLEL tracks rather than a spreading fan, each bursting
at its own point. STRADDLE rule identical to the broadside's: odd count → middle shell on the click;
EVEN count → shells straddle symmetrically with none on it. **[DRAFT]** lateral spacing 12u.
Per-shell signals, same as R2.5.

## Catalog: the FINAL 23 lines + 6 acquisitions
Wave 1 shipped 17 of them. Wave 2 adds: `broadsideSpread` (broadside, common ×4),
`broadsideTurrets` (broadside, rare ×2), `buoySweep` (radarBuoy, common ×4), `buoyGun`
(radarBuoy, rare ×1), `buoyJamming` (radarBuoy, rare ×1), `mineCaptive` (mines, rare ×1); and
REMOVES `cannonDamage`, `cannonArcing`, `cannonAp`, `decoyDuration`, `mineSelfPropelled`.
Acquisitions become: torpedo, mine, starShells, **broadside**, **radarBuoy**, speedBoost.
Every equipment subdeck is then exactly 6; every hull's deck is 41.
**`mine.selfPropelled` the FLAG and its creep behaviour are DELETED with the card** — captive
mines replace tracking mines entirely (Eric).

## PROTOCOL_VERSION 42 → 43, with a changelog entry.

## Verification (every agent)
Workspace-scoped `npx tsc --noEmit -p <ws>/tsconfig.json` + that workspace's tests.
**TWO FALSE-GREEN TRAPS:** a missing/stale `shared/dist` makes `@salvo/shared` resolve to the MAIN
CHECKOUT's build — run `npm run build -w shared` after any shared change; and
`server/tsconfig.tsbuildinfo` caches a stale pass — `rm -f` it before type-checking.
Do NOT run root `npm run check` while a parallel agent is live. Complexity ≤ 10. NEVER commit.
NEVER `git stash`. Report files touched, test counts, deviations with reasons.

## R2.17 — CARD FACE IS MINIMAL; THE EXPLANATION MOVES TO A HOVER TOOLTIP
**Eric ruling 2026-08-19.** *"I want the card itself to be pretty minimal in the upgrade tab, just
the name and stat change as before (previous -> new) if applicable. But hovering one with the mouse
should give a tooltip explaining the card, so that there are no questions like 'what the fuck does
a captive mine do?'"*

**The card face carries EXACTLY:** the ladder name at its stack position, the lineage marker where
one applies, the rarity tag, and — only where the line moves a number — the `current → next`
sentence computed through the existing `effectiveStats` preview diff. **Nothing else.** A verb card
(PHOSPHOR SHELLS, DAZZLE SHELLS, PROP FOULING, CAPTIVE MINES, GUN BUOY, JAMMING BUOY) moves no
number, so its face is name + tag only.

**The hover tooltip carries the EXPLANATION** — what the card actually does, in plain terms. Every
line gets one, stat lines included (a `current → next` number does not tell a new player what
`cooldownScale` or a trip ring IS). Reuse the EXISTING tooltip machinery (`tooltipFit.test.ts`, the
hotbar's accrued-boon tooltip) rather than inventing a second one.

**THE TOOLTIP IS HOVER-ONLY. It deliberately does NOT need a keyboard path (Eric ruling
2026-08-19, correcting an earlier orchestrator ruling that demanded one).** The refit window is
**Tab** to open, **1-4** to pick a card, **5** to heal — verified in `client/src/input/keyboard.ts`
(`bind(['Tab'], ...)`, `Digit1..4 -> 0..3`, `Digit5 -> HEAL_CHOICE`). NOTE: CLAUDE.md's "CTRL spend
window / CTRL+1/2/3 / CTRL+E" is STALE and belongs to Story 7-6's doc reconciliation.
The two paths serve DIFFERENT players and must not be collapsed: *"a new player will probably click
and hover and read tooltips. an experienced player knows what they want and will use the shortcut or
click faster without reading."* The shortcut exists precisely so you can SKIP the reading — wiring
the tooltip into it would put the explanation back in front of the player who does not want it.

**CONSEQUENCE — epic-4 amendment 47's container-fit law is RELAXED for this text, and that is the
point.** That ~90-character / ~5-wrapped-line budget exists because Story 2.8's doctrine text
OVERFLOWED THE CARD BOX by 50–97px on the live site. Once the explanation is no longer inside that
box, the budget no longer governs it: the tooltip may be as long as it needs to actually answer
Eric's question. The pin must be RE-AIMED at whatever now sits on the card face (the stat sentence),
not deleted — the face still has to fit.

**DOCTRINE_TEXT becomes tooltip copy** rather than card copy. Wave-1's compressed doctrine wordings
were squeezed to fit the old budget; they may now be rewritten to be genuinely explanatory. Eric's
verbatim card NAMES are unchanged and remain canon.

## R2.18 — A CAPTIVE MINE CANNOT BE SELF-DETONATED (Eric ruling 2026-08-19)
*"the captive mines can no longer be self-detonated."*

The game's existing rule — your own gun/broadside burst detonates YOUR OWN armed mines inside
`burstRadius`, and the same-owner chain propagates — **does not apply to captive mines**. A captive
mine is EXCLUDED from `detonateMinesInBurst` and from the same-owner chain entirely.

**It neither blasts NOR launches.** The burst simply passes over it and the mine persists, armed and
waiting. This is the literal reading of the ruling and the consistent one: R2.12 already says the
torpedo is its ONLY attack, and self-detonation was the last surviving path by which a captive mine
could produce a blast centred on its own casing. After this there are none.

Ordinary and prop-fouling mines are UNCHANGED — they still self-detonate exactly as they always
have. This is a captive-only carve-out, the same shape as R2.13's hostile gate.

## R2.19 — the captive torpedo's UNLIMITED RANGE is ACCEPTED (Eric ruling 2026-08-19)
*"sounds fine to me, until I start adding torpedo max ranges or shit like that."*

The captive fish inherits base `CONFIG.torpedo` behaviour, which runs until impact — so a missed
fish crosses the map until it hits something or the rim. **This is accepted as shipped, not an
oversight**, and is LEDGERED as the first thing to revisit if a torpedo max-range mechanic is ever
introduced. Do not add a range cap now.

## R2.20 — THE BUOY CARD IS DURATION, NOT SWEEP (Eric ruling 2026-08-19)
*"change the upgrade from sweep speed to duration. + 2.5 seconds per level."*

`buoySweep` (BUOY I–IV, `radarBuoy.sweepRpm` +1.25) is REPLACED by **`buoyDuration`** — same
category (radarBuoy), same rarity (common), same **×4 copies**, effect `radarBuoy.durationMs`
**add +2500**. Card names stay `BUOY I`–`IV` (Eric's verbatim ladder is unchanged; only the stat
behind it moves).

**The buoy's sweep is now FIXED at `CONFIG.radarBuoy.sweepRpm` = 15 with no card driving it.**
Keep `radarBuoy.sweepRpm` on `BOON_STAT_PATHS` as whitelisted-but-unwritten — the established
shape (`gun.burstRadius`, `cannon.contactDamage`, the seven `reloadMs` paths), so a future sweep
card can land without touching the whitelist.

**CONSEQUENCE — the ladder closes the gap R2.7 deliberately opened.** Base life 20 000 ms against a
30 000 ms BASE reload leaves a ~10s window with no buoy. At the full ×4 stack life reaches
**30 000 ms = exactly the base reload**, so a maxed buoy build has continuous coverage with no gap
at all. The progression is therefore "plug the hole you started with", which is a real and legible
reward curve. Flagged to Eric as an emergent consequence, not a designed one — it follows from his
two numbers (20s base, +2.5s ×4) meeting his 30s reload.

**The gap also closes from the OTHER end, and that is intended too** (wave-2 review gate): RELOAD
scales `radarBuoy.reloadMs` through the global `cooldownScale`, so a full RELOAD stack lands the
reload at 15 000 ms against a 20 000 ms life and puts TWO buoys on the water at once. R2.7's "at
most one live" is a statement about the BASE numbers only.

## R2.21 — THE GUN BUOY IS AUTONOMOUS: IT SHOOTS ANYTHING IT SEES (Eric ruling 2026-08-19)
*"It has its own radar and is autonomous, so when it has the gun upgrade, it should target basically
anything it sees that isn't the owner of the buoy. Closest target proximally to the buoy."*

**SUPERSEDES R2.10's hostile gate.** The gun buoy does NOT share the captive mine's aggro-gated
definition. Its rule is:
- **Target set = anything the BUOY'S OWN RADAR can see** within its 330u range — enemy captains,
  bots, AND neutral fleet drones alike. Island LOS and height-aware shadowing apply, because it is a
  real radar: **if the buoy cannot see it, it cannot shoot it.**
- **EXCLUDED: the buoy's owner** and anything belonging to them (their hull, their other buoys).
- **Selection: NEAREST TO THE BUOY**, not nearest to the owner. The buoy is autonomous; the owner's
  position is irrelevant to it.

**R2.13's aggro gate stays CAPTIVE-MINE-ONLY and is NOT widened or narrowed by this.** The two
weapons now deliberately differ: a captive mine is a trap the owner laid and gates on aggro; a gun
buoy is an autonomous turret and does not.

### R2.21a — a buoy's gun hit does NOT aggro a fleet drone (orchestrator ruling, by precedent)
Eric did not rule this and it is forced by the change, so it follows the ESTABLISHED PRECEDENT
rather than inventing one. `drones.ts` already states: *"being hit acquires the attacker (mines
excepted — a mine's layer may be dead or across the map, so there is nothing to chase)"*. A buoy is
exactly that case: it is not a ship, it cannot be chased in the way the aggro model means, and its
owner may be dead or across the map. So **a buoy's gun hit aggros nobody** — it does not acquire the
buoy's owner, and the drone does not inherit a fight the player never picked.
The alternative — the drone acquiring the OWNER — was rejected: it would mean an autonomous turret
picks fights its owner then inherits, which is precisely the "an auto-turret should not start fights
for you" concern, and it is unreachable under the existing model anyway since the attacker is not a
ShipRecord. **Flagged to Eric as an orchestrator call, open to reversal.**

### Open, flagged to Eric, defaulted for now
**Does a gun buoy shoot a RIVAL BUOY?** Buoys are destructible 50 hp entities, so "anything it sees
that isn't the owner" reads as yes. Defaulted to **NO — buoys do not shoot other buoys**, because
buoy-vs-buoy turret duels resolve with no player input at all and the buoy's stated job is watching
water, not area denial. One line to flip if Eric wants it.
