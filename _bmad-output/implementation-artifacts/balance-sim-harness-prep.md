# batchSim harness prep for `/balance-sim`

Three changes plus one optional. Each is independently landable. The
`/balance-sim` skill precondition-gate goes green when 1 and 2 are in.

Verify with:
```
uv run --python 3.11 .claude/skills/balance-sim/scripts/check_preconditions.py --repo .
```

---

## 1. Even class roster — `server/scripts/batchsim/runner.ts`

**The defect.** `runMatch` builds the bot lobby with a bare `world.addBot()`
(line ~310), which rolls each bot's class off the BotController's stream.
Observed on real runs: **5 battleship / 5 mineLayer / 10 torpedoBoat** in one
20-bot match, and 67 / 86 / 87 across a 12-match campaign.

**Why it blocks balance work.** Win share is measured per class. An
over-represented class wins more matches for free, so class win share stops
measuring balance and starts measuring representation. Nothing downstream can
correct for it.

**The fix.** `addBot(hull?: ShipClassId)` already accepts the hull, and the
captain loop directly above already round-robins `SHIP_CLASS_IDS`. Apply the
same pattern to bots — but **offset by the match index**:

```ts
for (let i = 0; i < botCount; i += 1) {
  botIds.push(world.addBot(SHIP_CLASS_IDS[(i + index) % SHIP_CLASS_IDS.length]).id);
}
```

**The offset is load-bearing.** 20 does not divide by 3, so the best any single
match can do is 7/7/6. Without the `+ index` the same class is short in every
match and the campaign total stays ~14% skewed — enough to fail the gate.
Rotating by match index makes the totals exactly even over any multiple of 3
matches (a 91-match campaign lands 607/607/606, ≈0.16% spread).

**Preserve the existing run key.** This changes bot-lobby determinism, so prior
bot-mode evidence stops reproducing. Recommend gating it behind a flag —
`--roster even|rolled`, defaulting to `rolled` — so every existing run key and
test stays byte-identical and the skill passes `--roster even`. If you would
rather flip the default, that is a deliberate call to make, not a side effect.

---

## 2. `--tune` — `server/scripts/batchsim/args.ts` + `overrides.ts`

**The constraint.** `overrides.ts` whitelists `--set`/`--sweep` to
`xp.* / deck.* / zone.* / offer.size / match.fillTo / map.baseRadius` and
rejects equipment paths *by name*, with a written rationale about never
becoming "a general balance-editing backdoor". **Leave that whitelist, that
rationale, and `isTunableKey` byte-identical.** `--tune` is a separate,
explicitly-gated surface — the boundary stays visible instead of quietly moving.

**Surface.** `gun.` `cannon.` `torpedo.` `mine.` `starShells.` `shipClasses.`

**args.ts**
- add `tune: Record<string, number>` to `CliOptions` (default `{}`)
- add `'--tune': parseTune` to `VALUE_FLAGS`, mirroring `parseSet`
- document it in `USAGE`

**overrides.ts**
- add a `TUNE_FAMILIES` list and an `isTuneKey()` beside — not inside —
  `isTunableKey()`
- `resolveLeaf` already walks any dotted path to a numeric leaf; it needs only
  to accept the tune families when tuning is enabled
- reuse the restore-closure mechanism unchanged, so sweeps and arms restore
  between variants exactly as today
- extend the floor check: reload/cooldown paths must be `> 0` (a zero reload is
  a divide-or-spin hazard, same class as the existing `MIN_ONE_KEYS`)

**Gate.** Require `HC_BALANCE=1` in addition to `HC_DEV_OPTIONS=1`, refusing
with a message that names the variable. Two gates, because this one edits
combat numbers rather than harness dials.

**Detection.** The precondition gate greps `args.ts` for the literal `--tune`
and `overrides.ts` for a quoted equipment family (e.g. `'gun.'`). Ship those
strings literally and the check flips green.

Sweep support for tune keys is **optional** — `/balance-sim` runs one labelled
arm per candidate value and merges them at analysis time, so it does not need
`--sweep` to compare candidates.

---

## 3. Do not break the report JSON contract

`/balance-sim` reads these keys from `--json` output. Renaming or restructuring
any of them silently breaks the skill:

| key | used for |
| --- | --- |
| `variants[].label` | arm identity (the launcher rewrites it) |
| `variants[].aggregate.winnerClass` | **win share** — the primary target |
| `variants[].aggregate.matches`, `.durationS` | sample size, match pacing |
| `variants[].bots.byClass[].key`, `.n` | roster evenness gate |
| `variants[].bots.byClass[].lifeS` | **attrition curve** |
| `variants[].bots.botsPerMatch`, `.endedBy` | roster size, resolution |

`winnerClass` tallying `'none'` for an unresolved match is relied upon — those
are excluded from the denominator rather than counted as a loss for everyone.

---

## 4. OPTIONAL — exact survivorship, `botMetrics.ts`

Attrition currently pools per-class `lifeS` **quantile summaries**, which is an
approximation: direction is trustworthy, exact alive-at-T is not.

Emitting either raw per-bot life values or explicit alive-at-checkpoint counts
makes the curve exact. Worth folding in if you are already in this file;
non-blocking otherwise, and the skill reports the limitation either way.

---

## Not prep — but it gates believing any result

The batchSim bot report carries six PASS/FAIL quality bars. On the last
measured run, two were failing (`bots scoring >= 1 participant kill` 42% against
a 60% bar; `storm deaths as a share of all bot deaths` 2.1% against a 5–20%
band). While those are red, class win share is being decided by tactics rather
than equipment, and equipment proposals built on it are the classic wrong fix.
The AI work in flight is expected to clear them.
