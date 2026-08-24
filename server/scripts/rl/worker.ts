// RL ENV WORKER — newline-delimited JSON over stdio (scaffold, 2026-08-24).
//
// One worker owns one HullcrackerEnv. The Python side (rl/env_client.py)
// spawns N of these and speaks the protocol below; every request line gets
// exactly one response line, so the client can run a simple blocking
// request/response loop per worker.
//
//   → {"cmd":"hello"}
//   ← {"ok":true,"featureDim":D,"featureVersion":V,"actionBins":{...},
//      "rewardComponents":[...]}
//   → {"cmd":"reset","seed":1,"agents":4,"bots":16,"set":{...},"tune":{...}}
//   ← {"ok":true,"obs":[[...],...]}
//   → {"cmd":"step","actions":[[rudder,throttle,fire,bearing,range,slot,boost],...]}
//   ← {"ok":true,"obs":[...],"rewards":[[...],...],"done":false}
//        (+ "placements":[...] when done)
//   → {"cmd":"close"}   ← {"ok":true}  (and the process exits)
//
// Gated exactly like the batch-sim: HC_DEV_OPTIONS=1 required (this drives
// the real sim), HC_BALANCE=1 additionally required to pass "tune".
// Observations ride as plain JSON number arrays — fine for a scaffold; if the
// bridge ever bottlenecks, swap the transport for msgpack/shared memory
// without touching env.ts.

import { createInterface } from 'node:readline';
import { HullcrackerEnv, ACTION_BINS, REWARD_COMPONENTS, type AgentAction, type ResetOptions } from './env.js';
import { FEATURE_DIM, FEATURE_VERSION } from './features.js';

type Req =
  | { cmd: 'hello' }
  | ({ cmd: 'reset' } & ResetOptions)
  | { cmd: 'step'; actions: number[][] }
  | { cmd: 'close' };

function toAction(row: number[]): AgentAction {
  return {
    rudder: row[0] | 0,
    throttle: row[1] | 0,
    fire: row[2] | 0,
    bearing: row[3] | 0,
    range: row[4] | 0,
    slot: row[5] | 0,
    boost: row[6] | 0,
  };
}

function main(): void {
  if (process.env.HC_DEV_OPTIONS !== '1') {
    console.error('rl worker: refusing to run without HC_DEV_OPTIONS=1');
    process.exitCode = 1;
    return;
  }
  // STDOUT IS THE PROTOCOL. The server's structured logger (log.ts) writes to
  // stdout — a single `warn fleet.spawnFallback {...}` line would corrupt the
  // JSON stream — so every console channel is rehomed to stderr before any
  // sim code runs. The protocol writes below go through process.stdout.write
  // directly and are the only stdout producers left.
  const toStderr = (...a: unknown[]): void => void process.stderr.write(`${a.map(String).join(' ')}\n`);
  console.log = toStderr;
  console.info = toStderr;
  console.warn = toStderr;
  const env = new HullcrackerEnv();
  const out = (o: unknown): void => void process.stdout.write(`${JSON.stringify(o)}\n`);
  const rl = createInterface({ input: process.stdin, terminal: false });
  rl.on('line', (line) => {
    let req: Req;
    try {
      req = JSON.parse(line) as Req;
    } catch {
      out({ ok: false, error: 'bad json' });
      return;
    }
    try {
      handle(env, req, out, rl);
    } catch (err) {
      out({ ok: false, error: (err as Error).message });
    }
  });
}

function handle(env: HullcrackerEnv, req: Req, out: (o: unknown) => void, rl: { close(): void }): void {
  if (req.cmd === 'hello') {
    out({
      ok: true,
      featureDim: FEATURE_DIM,
      featureVersion: FEATURE_VERSION,
      actionBins: ACTION_BINS,
      rewardComponents: REWARD_COMPONENTS,
    });
    return;
  }
  if (req.cmd === 'reset') {
    if (Object.keys(req.tune ?? {}).length > 0 && process.env.HC_BALANCE !== '1') {
      out({ ok: false, error: 'tune requires HC_BALANCE=1' });
      return;
    }
    const obs = env.reset(req);
    out({ ok: true, obs: obs.map((o) => Array.from(o)) });
    return;
  }
  if (req.cmd === 'step') {
    const r = env.step(req.actions.map(toAction));
    out({
      ok: true,
      obs: r.obs.map((o) => Array.from(o)),
      rewards: r.rewards,
      done: r.done,
      ...(r.placements !== undefined ? { placements: r.placements } : {}),
    });
    return;
  }
  env.close();
  out({ ok: true });
  rl.close();
}

main();
