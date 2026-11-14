// Headless verification: open rain-sight.html in MUTED headless Chrome over CDP,
// collect console errors, take screenshots a few seconds apart, print the
// ships' per-part V ranges and the page's frame time. Kills the browser it started.
// Usage: node bench/rain-sight/shoot.mjs [solo] [span]   (solo = 0 A+D, 1 A, 2 D — one look full-size; omit or '-' for compare)
// Env:
//   VIEW=storm      the whole-map Storm view instead of the ship looks
//   CLOCK=<ms>      jump the match clock there first (ms from zone start)
//   SPEED=<x>       match clock speed (1–60)
//   PAUSE=1         freeze the clock (shot lands exactly on CLOCK)
//   GAP=<ms>        real ms between the two shots (default 4000)
//   SHOTS=<n>       number of shots (default 2)
//   TAG=<name>      file name stem (default derived)
//   FOLLOW=<i>      centre the camera on ship i
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const page = 'file://' + resolve(here, 'rain-sight.html') + (process.env.HASH ?? '');
const shots = resolve(here, 'shots');
mkdirSync(shots, { recursive: true });
const SOLO_TAGS = ['AD', 'A', 'D'];
const soloArg = process.argv[2];
const solo = soloArg === undefined || soloArg === '-' ? undefined : soloArg;
const zoom = process.argv[3];
const storm = process.env.VIEW === 'storm';
const tag = process.env.TAG
  ?? ((storm ? 'storm' : solo === undefined ? 'compare' : `solo-${SOLO_TAGS[Number(solo)]}`)
    + (process.env.CLOCK ? `-t${Math.round(Number(process.env.CLOCK) / 1000)}s` : '')
    + (process.env.FOLLOW ? `-follow${process.env.FOLLOW}` : ''));
const GAP = Number(process.env.GAP ?? 4000);
const NSHOTS = Number(process.env.SHOTS ?? 2);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'rainbench-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--mute-audio', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=1600,1000',
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      target = list.find((t) => t.type === 'page');
    } catch { /* not up yet */ }
  }
  if (!target) throw new Error('chrome did not come up');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) {
      errors.push(`${m.params.type}: ` + m.params.args.map((a) => a.value ?? a.description).join(' '));
    }
    if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + JSON.stringify(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push('log: ' + m.params.entry.text);
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: page });
  await sleep(3000);
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value;
  if (storm) await ev(`window.__bench.setMode('storm')`);
  else if (solo !== undefined) await ev(`window.__bench.setMode('look', ${[2, 0, 1][Number(solo)]})`);
  if (process.env.FOLLOW) await ev(`window.__bench.P.follow = ${Number(process.env.FOLLOW)}`);
  if (zoom !== undefined) await ev(`window.__bench.P.spanU = ${Number(zoom)}`);
  if (process.env.SPEED) await ev(`window.__bench.P.timeSpeed = ${Number(process.env.SPEED)}`);
  if (process.env.PAUSE) await ev(`window.__bench.P.paused = true`);
  if (process.env.EYE) await ev(`window.__bench.P.showEye = true`);
  if (process.env.CLOCK) await ev(`window.__bench.setClock(${Number(process.env.CLOCK)})`);
  if (process.env.CLOCK && !storm) await ev(`window.__bench.reseatObserver()`);
  await sleep(1500);
  const state = `(() => { const b = window.__bench; return { clock: Math.round(b.matchT), frameMs: +b.frameMs.toFixed(1), perf: document.querySelector('.perf').textContent, spin: b.storm.spinSign, ships: b.ships.map(s => [s.cls, Math.round(s.x), Math.round(s.y), s.vMin.toFixed(2), s.vMax.toFixed(2)]) }; })()`;
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(shots, name), Buffer.from(r.result.data, 'base64'));
    console.log('wrote', join(shots, name));
  };
  for (let i = 1; i <= NSHOTS; i++) {
    if (i > 1) await sleep(GAP);
    console.log(`t${i}`, JSON.stringify(await ev(state)));
    await shot(`${tag}-${i}.png`);
  }
  console.log('console errors/warnings:', errors.length ? errors : 'none');
} finally {
  try { ws?.close(); } catch { /* */ }
  chrome.kill('SIGKILL');
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
