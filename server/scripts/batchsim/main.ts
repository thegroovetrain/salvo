// batchSim TS entry (bootstrapped by server/scripts/batchSim.mjs via tsx).
// BOTH ENV GATES ARE CHECKED IN BOTH PLACES: the .mjs gates HC_DEV_OPTIONS and
// HC_BALANCE before it spawns anything, and `gateFailure()` below re-checks the
// same two, because this module is directly runnable under tsx and a direct
// invocation bypasses the .mjs entirely. Beyond the gates this module owns
// CLI -> run -> report.
//
// Output discipline (NFR5): the REPORT BODY on stdout is byte-deterministic
// for a fixed run key (seed + config overrides + roster + mode). The single
// trailing `meta:` line (timestamp + wall-clock) is the ONLY non-deterministic
// output — exclude it from comparisons with `grep -v '^meta:'`. Progress goes
// to stderr, so plain stdout captures diff clean even without --quiet.
//
// Exit codes, and both entry points agree on them:
//   0 = report produced;
//   1 = structural failure — an exception, every match failed, or a run
//       refused for want of HC_DEV_OPTIONS=1 (NOT a usage error: a wrapper
//       must be able to tell "not a dev box" from "you typed it wrong");
//   2 = bad command line, INCLUDING a --tune refused for want of HC_BALANCE=1
//       (the flags were legal; the invocation was not).

import { writeFileSync } from 'node:fs';
import { USAGE, UsageError, buildVariants, parseArgs, type CliOptions } from './args.js';
import { TunableError, applyOverrides } from './overrides.js';
import { CONTROL_REGISTRY } from './controls.js';
import { runBatch, type BatchResult } from './runner.js';
import { runDeckSim, type DeckAggregate } from './deckSim.js';
import {
  buildAggregate,
  renderBatchReport,
  renderComparison,
  renderDeckComparison,
  renderDeckReport,
  type BatchAggregate,
} from './report.js';
import { buildBotAggregate, renderBotReport } from './botReport.js';
import {
  buildCatalogAggregate,
  renderCatalogLines,
  renderDeckComposition,
  renderDeckLines,
  renderFitSlices,
  renderOrdnanceLedger,
} from './catalogReport.js';

function overridesLine(set: Record<string, number>): string {
  const keys = Object.keys(set).sort();
  return keys.length === 0 ? '(none)' : keys.map((k) => `${k}=${set[k]}`).join(' ');
}

/** The --tune segment of the run key. Keys are SORTED, mirroring overridesLine,
 *  so flag order can never move the deterministic body. */
function tuneLine(tune: Record<string, number>): string {
  const keys = Object.keys(tune).sort();
  return keys.map((k) => `${k}=${tune[k]}`).join(' ');
}

function headerLines(opts: CliOptions): string[] {
  const mode = opts.deckOnly ? `deck-only draws=${opts.draws}` : `batch matches=${opts.matches}`;
  // BOTS JOIN THE RUN KEY (Story 6.4): a bot lobby is a different roster, so
  // the deterministic body's own header must say so. Only printed when there
  // are bots, so every captain-only run key is byte-unchanged.
  const bots = opts.bots > 0 ? ` bots=${opts.bots}` : '';
  // ROSTER / TUNE / TEST-RIG ALL JOIN THE RUN KEY on the SAME terms (NFR5
  // run-key honesty): an even roster is a different lobby, a tune is a
  // different sim, and a forced test profile is a different brain — so each
  // must be visible in the deterministic body, and each is printed ONLY when
  // non-default, so every run key recorded before these flags existed stays
  // byte-identical.
  const hull = opts.roster !== 'rolled' ? ` roster=${opts.roster}` : '';
  const botProfile = opts.botProfile !== null ? ` botProfile=${opts.botProfile}` : '';
  const botEngage = opts.botEngage !== 'always' ? ` botEngage=${opts.botEngage}` : '';
  const roster = opts.deckOnly
    ? ''
    : ` captains=${opts.captains}${bots}${hull}${botProfile}${botEngage} control=${opts.control}`;
  const tune = Object.keys(opts.tune).length > 0 ? ` tune=${tuneLine(opts.tune)}` : '';
  return [
    'HULLCRACKER ECONOMY BATCH-SIM',
    `run key: seed=${opts.seed} mode=${mode}${roster} overrides=${overridesLine(opts.set)}${tune} sweeps=${opts.sweeps.length}`,
    '(body below is deterministic per run key; the trailing meta: line is not)',
    '',
  ];
}

/** One `--json` envelope entry. `overrides`/`aggregate`/`bots` are the frozen
 *  keys /balance-sim reads; `tune` and `roster` are ADDITIVE and are the whole
 *  reason a tuned arm is distinguishable in the JSON at all — without them a
 *  `--tune`d run serialises byte-identically to its own baseline, and the JSON
 *  is the only thing the skill reads. The run-key header carries them for a
 *  human; these carry them for a machine. */
interface JsonVariant {
  label: string;
  overrides: Record<string, number>;
  /** The applied --tune map (empty on an untuned run). */
  tune: Record<string, number>;
  /** The applied hull policy ('rolled' on every pre-existing run). */
  roster: string;
  aggregate: unknown;
  bots?: unknown;
  /** RAW per-match bot rows (--raw only): the per-upgrade evidence surface —
   *  one row per match carrying outcome + every BotSample (build, pick timing,
   *  offers seen, placement). ADDITIVE, exactly as `tune`/`roster` were: absent
   *  on every run that does not ask for it. */
  raw?: unknown;
}

interface ModeOutput {
  body: string[];
  exitCode: number;
  variants: JsonVariant[];
}

function batchMode(opts: CliOptions): ModeOutput {
  const body = headerLines(opts);
  const rendered: { label: string; agg: BatchAggregate }[] = [];
  const variants = buildVariants(opts);
  const out: ModeOutput = { body, exitCode: 0, variants: [] };
  for (const variant of variants) {
    const restore = applyOverrides(variant.set, opts.tune);
    try {
      const result = runBatch(
        {
          seed: opts.seed,
          matches: opts.matches,
          captains: opts.captains,
          bots: opts.bots,
          botProfile: opts.botProfile ?? undefined,
          botEngage: opts.botEngage,
          roster: opts.roster,
          control: CONTROL_REGISTRY[opts.control],
        },
        opts.quiet ? undefined : progressLogger(variant.label, opts.matches),
      );
      const agg = buildAggregate(result, opts.captains);
      rendered.push({ label: variant.label, agg });
      body.push(...renderBatchReport(variant.label, agg), ...failureLines(result), '');
      // THE BOT QUALITY TABLE — the whole verification instrument for a story
      // that ships no playable path (Eric ruling A1). Appended only when the
      // lobby actually has bots in it.
      const botAgg = opts.bots > 0 ? buildBotAggregate(result, opts.bots) : null;
      if (botAgg !== null) body.push(...renderBotReport(variant.label, botAgg), '');
      // STORY 7-5 EVIDENCE PASS: per-line catalog reachability + the ordnance /
      // one-hit-kill ledger. Always appended — every run key gains the block.
      // WAVE 4 (cycle 110): the fits slices and the STRUCTURAL deck-composition
      // block now print in batch mode too, so the structural denominator sits
      // beside the observed one — a deliberate golden change to the body.
      const catAgg = buildCatalogAggregate(result);
      body.push(...renderCatalogLines(variant.label, catAgg), '');
      body.push(...renderFitSlices(variant.label, catAgg), '');
      body.push(...renderDeckComposition(), '');
      body.push(...renderOrdnanceLedger(variant.label, catAgg), '');
      out.variants.push({
        label: variant.label,
        overrides: variant.set,
        tune: opts.tune,
        roster: opts.roster,
        aggregate: agg,
        bots: botAgg,
        ...(opts.raw ? { raw: rawRows(result) } : {}),
      });
    } finally {
      restore();
    }
  }
  if (variants.length > 1) body.push(...renderComparison(rendered), '');
  if (rendered.every((r) => r.agg.matches === 0)) out.exitCode = 1;
  return out;
}

function deckMode(opts: CliOptions): ModeOutput {
  const body = headerLines(opts);
  const rendered: { label: string; agg: DeckAggregate }[] = [];
  const out: ModeOutput = { body, exitCode: 0, variants: [] };
  for (const variant of buildVariants(opts)) {
    const restore = applyOverrides(variant.set, opts.tune);
    try {
      const agg = runDeckSim({ seed: opts.seed, draws: opts.draws });
      rendered.push({ label: variant.label, agg });
      body.push(...renderDeckReport(variant.label, agg), '');
      body.push(...renderDeckLines(variant.label, agg), '');
      body.push(...renderDeckComposition(), '');
      // tune/roster are structurally EMPTY/'rolled' here — parseArgs refuses
      // both flags with --deck-only — but the envelope shape stays uniform so a
      // reader never has to branch on the mode to find them.
      out.variants.push({
        label: variant.label,
        overrides: variant.set,
        tune: opts.tune,
        roster: opts.roster,
        aggregate: agg,
      });
    } finally {
      restore();
    }
  }
  if (rendered.length > 1) body.push(...renderDeckComparison(rendered), '');
  return out;
}

/** The --raw surface: per-match outcome + every BotSample, nothing re-derived —
 *  captain/catalog blocks stay out (they have their own aggregates), so the raw
 *  block's size is exactly lobby × matches. */
function rawRows(result: BatchResult): unknown {
  return result.matches.map((m) => ({
    index: m.index,
    seed: m.seed,
    durationS: m.durationS,
    endedBy: m.endedBy,
    winnerClass: m.winnerClass,
    bots: m.bots ?? [],
  }));
}

function failureLines(result: BatchResult): string[] {
  return result.failures.map((f) => `FAILED match ${f.index} (seed ${f.seed}): ${f.error}`);
}

function progressLogger(label: string, total: number): (i: number) => void {
  return (i: number) => {
    if ((i + 1) % 10 === 0 || i + 1 === total) {
      console.error(`[batchSim] ${label}: ${i + 1}/${total} matches`);
    }
  };
}

/**
 * THE TWO ENV GATES, re-checked here. batchSim.mjs owns the primary pair, but
 * this module is directly runnable under tsx (`tsx --tsconfig ... main.ts`),
 * which bypasses the .mjs — and therefore both of its gates — entirely. Closing
 * only the HC_BALANCE one would leave the dev-only gate open on exactly the
 * path whose existence is the reason HC_BALANCE is re-checked at all.
 * Checked HERE rather than in args.ts, which is pure over argv by contract.
 * Returns the exit code to fail with, or null when both gates are open.
 */
function gateFailure(opts: CliOptions): number | null {
  if (process.env.HC_DEV_OPTIONS !== '1') {
    console.error(
      'batchSim: refusing to run without HC_DEV_OPTIONS=1 — this is a dev-only ' +
        'balance-evidence harness, never a production tool.\n' +
        'Run: HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs [options]',
    );
    return 1; // NOT 2: "not a dev box" must stay distinguishable from a typo.
  }
  if (Object.keys(opts.tune).length > 0 && process.env.HC_BALANCE !== '1') {
    console.error(
      'batchSim: refusing --tune without HC_BALANCE=1 — --tune mutates COMBAT ' +
        'CONFIG (gun.*, broadside.*, torpedo.*, mine.*, starShells.*, ' +
        'speedBoost.*, radarBuoy.*, shipClasses.*), ' +
        'a separate surface from the --set/--sweep harness dials.',
    );
    return 2;
  }
  return null;
}

function main(): number {
  let opts: CliOptions;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof UsageError || err instanceof TunableError) {
      console.error(err.message);
      return 2;
    }
    throw err;
  }
  if (opts.help) {
    console.log(USAGE);
    return 0;
  }
  // DEFENCE IN DEPTH — see gateFailure. Placed after --help so the flag list is
  // readable without a dev environment, and before any sim work.
  const gate = gateFailure(opts);
  if (gate !== null) return gate;
  const t0 = performance.now();
  try {
    const output = opts.deckOnly ? deckMode(opts) : batchMode(opts);
    console.log(output.body.join('\n'));
    // Wall-clock metadata — deliberately OUTSIDE the deterministic body.
    const meta = { generatedAt: new Date().toISOString(), wallMs: Math.round(performance.now() - t0) };
    if (opts.json !== null) {
      writeFileSync(opts.json, `${JSON.stringify({ meta, variants: output.variants }, null, 2)}\n`);
    }
    console.log(`meta: generated=${meta.generatedAt} wallMs=${meta.wallMs}`);
    return output.exitCode;
  } catch (err) {
    console.error(`BATCH SIM FAILED (structural): ${(err as Error).message}`);
    return 1;
  }
}

// EPIPE companion to the exitCode change below: no longer exiting synchronously
// means the process outlives its own stdout writes, so a reader that closes the
// pipe early (`... | head`) now delivers an ASYNC EPIPE that node would raise as
// an unhandled 'error' event and crash on. A closed downstream pipe is a normal
// outcome for a report writer — treat it as success, rethrow anything else.
process.stdout.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') process.exit(0);
  throw err;
});

// process.exitCode, NOT process.exit(): exit() tears the process down
// immediately and can truncate a large report still draining through a piped
// (async) stdout. Setting the code and returning normally keeps the SAME exit
// semantics while letting node flush stdout first.
process.exitCode = main();
