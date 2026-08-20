// batchSim TS entry (bootstrapped by server/scripts/batchSim.mjs via tsx —
// the .mjs owns the HC_DEV_OPTIONS gate; this module owns CLI -> run -> report.
//
// Output discipline (NFR5): the REPORT BODY on stdout is byte-deterministic
// for a fixed run key (seed + config overrides + roster + mode). The single
// trailing `meta:` line (timestamp + wall-clock) is the ONLY non-deterministic
// output — exclude it from comparisons with `grep -v '^meta:'`. Progress goes
// to stderr, so plain stdout captures diff clean even without --quiet.
//
// Exit codes: 0 = report produced; 1 = structural failure (exception, or every
// match failed); 2 = bad command line.

import { writeFileSync } from 'node:fs';
import { USAGE, UsageError, buildVariants, parseArgs, type CliOptions } from './args.js';
import { TunableError, applyOverrides } from './overrides.js';
import { PILOT_REGISTRY } from './pilots.js';
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
  renderOrdnanceLedger,
} from './catalogReport.js';

function overridesLine(set: Record<string, number>): string {
  const keys = Object.keys(set).sort();
  return keys.length === 0 ? '(none)' : keys.map((k) => `${k}=${set[k]}`).join(' ');
}

function headerLines(opts: CliOptions): string[] {
  const mode = opts.deckOnly ? `deck-only draws=${opts.draws}` : `batch matches=${opts.matches}`;
  // BOTS JOIN THE RUN KEY (Story 6.4): a bot lobby is a different roster, so
  // the deterministic body's own header must say so. Only printed when there
  // are bots, so every captain-only run key is byte-unchanged.
  const bots = opts.bots > 0 ? ` bots=${opts.bots}` : '';
  const roster = opts.deckOnly ? '' : ` captains=${opts.captains}${bots} pilot=${opts.pilot}`;
  return [
    'HULLCRACKER ECONOMY BATCH-SIM',
    `run key: seed=${opts.seed} mode=${mode}${roster} overrides=${overridesLine(opts.set)} sweeps=${opts.sweeps.length}`,
    '(body below is deterministic per run key; the trailing meta: line is not)',
    '',
  ];
}

interface ModeOutput {
  body: string[];
  exitCode: number;
  variants: { label: string; overrides: Record<string, number>; aggregate: unknown; bots?: unknown }[];
}

function batchMode(opts: CliOptions): ModeOutput {
  const body = headerLines(opts);
  const rendered: { label: string; agg: BatchAggregate }[] = [];
  const variants = buildVariants(opts);
  const out: ModeOutput = { body, exitCode: 0, variants: [] };
  for (const variant of variants) {
    const restore = applyOverrides(variant.set);
    try {
      const result = runBatch(
        {
          seed: opts.seed,
          matches: opts.matches,
          captains: opts.captains,
          bots: opts.bots,
          pilot: PILOT_REGISTRY[opts.pilot],
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
      const catAgg = buildCatalogAggregate(result);
      body.push(...renderCatalogLines(variant.label, catAgg), '');
      body.push(...renderOrdnanceLedger(variant.label, catAgg), '');
      out.variants.push({ label: variant.label, overrides: variant.set, aggregate: agg, bots: botAgg });
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
    const restore = applyOverrides(variant.set);
    try {
      const agg = runDeckSim({ seed: opts.seed, draws: opts.draws });
      rendered.push({ label: variant.label, agg });
      body.push(...renderDeckReport(variant.label, agg), '');
      body.push(...renderDeckLines(variant.label, agg), '');
      body.push(...renderDeckComposition(), '');
      out.variants.push({ label: variant.label, overrides: variant.set, aggregate: agg });
    } finally {
      restore();
    }
  }
  if (rendered.length > 1) body.push(...renderDeckComparison(rendered), '');
  return out;
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
