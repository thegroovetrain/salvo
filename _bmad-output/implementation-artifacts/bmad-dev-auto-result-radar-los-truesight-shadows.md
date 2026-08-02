---
status: done
---

# BMad Dev Auto Result — Radar vs Island LOS Inside Truesight Range

Status: done (resolved by Eric ruling — NO code change)
Blocking condition: none

## Intent (invocation, 2026-08-02)

Eric: "Islands obscure vision. If a ship is in truesight range, but obscured by an island, I can't see them. However, if I move so that the other side of the island is outside of truesight range (but within radar range), the ship will be detected. That's a little odd, yeah? I think radar should paint ships that are within truesight range but otherwise invisible."

## Investigation findings

- Server truth (`server/src/game/signals.ts`): the blip gate is annulus (`sight < d ≤ radar`) ∧ swept-this-tick ∧ island-LOS-clear. The server **never** emits a blip for an island-LOS-blocked ship at any range — pinned by the perception test "an island blocks radar exactly like sight" (`server/src/__tests__/perception.test.ts`).
- The observed "radar paints ships behind islands at range" is presentation, not sim: (a) **parallax** — LOS is a center-to-center segment vs the island *circles*; a hull poking past the circle's edge (or a segment threading a gap between clustered circles that render as one blob) is genuinely LOS-clear; (b) **phosphor decay** — blips linger and decay client-side for seconds after a paint, so a briefly-exposed ship that ducks behind an island leaves a glowing paint "behind" the rock.
- Real-life framing given to Eric: surface-search radar is strictly line-of-sight (landmasses cast hard radar shadows; island-hugging is real littoral tactics); the sensor that works at knife range regardless of terrain is passive acoustics — which the GDD already plans as core-kit **hydrophones** (Epic 6 information texture).

## Eric ruling (2026-08-02, AskUserQuestion this run)

**No change — realism.** Islands cast hard radar shadows at every range, exactly as today. Eric verbatim: "If you're behind an island, I can't see you with any sensor."

- The proposed in-bubble radar paint (sweep painting island-masked hulls inside the sight bubble without LOS) is **REJECTED**.
- The GDD's one-LOS-rule ("the observer→point segment must clear all island circles" for every sensor tier) and "radar shadows are a hiding place" are **AFFIRMED as-is**.
- Close-range mutual blindness around an island is intentional; the designed future answer is Epic 6 hydrophones (bearing-grade audio detection of nearby noise, LOS-independent).
- Dazzle-interaction and paint-cadence questions were mooted by the ruling.

## Outcome

No code, CONFIG, wire, or test change. No VERSION bump (no build cycle landed — versioning ruling: 0.17.X counts landed build cycles only). This artifact is the durable record so a future session does not "fix" the felt oddity against Eric's ruling.
