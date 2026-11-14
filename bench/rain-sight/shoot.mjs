// Headless verification: open rain-sight.html in MUTED headless Chrome over CDP,
// collect console errors, take two screenshots a few seconds apart, print the
// ships' per-part V ranges. Kills the browser it started.
// Usage: node bench/rain-sight/shoot.mjs [solo] [span]   (solo = 0 A+D, 1 A, 2 D — one look full-size; omit or '-' for compare)
// FOLLOW=<ship index> centres the camera on that ship.
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
const tag = (solo === undefined ? 'compare' : `solo-${SOLO_TAGS[Number(solo)]}`) + (process.env.FOLLOW ? `-follow${process.env.FOLLOW}` : '');
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
  if (solo !== undefined) await ev(`document.querySelectorAll('.btns button')[${Number(solo) + 1}].click()`);
  if (process.env.FOLLOW) await ev(`window.__bench.P.follow = ${Number(process.env.FOLLOW)}`);
  if (zoom !== undefined) await ev(`(()=>{const i=[...document.querySelectorAll('input[type=range]')].at(-1); i.value=${Number(zoom)}; i.dispatchEvent(new Event('input'));})()`);
  await sleep(1000);
  const info = await ev(`(() => { const r = document.querySelector('canvas'); const gl = r && (r.getContext('webgl2') || r.getContext('webgl')); return { canvas: !!r, renderer: window.__bench ? 'ok' : 'no bench', ships: window.__bench ? window.__bench.ships.map(s => [s.cls, Math.round(s.x), Math.round(s.y), s.vMin.toFixed(2), s.vMax.toFixed(2)]) : null }; })()`);
  console.log('t0', JSON.stringify(info));
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(shots, name), Buffer.from(r.result.data, 'base64'));
    console.log('wrote', join(shots, name));
  };
  await shot(`${tag}-1.png`);
  await sleep(4000);
  const info2 = await ev(`window.__bench.ships.map(s => [s.cls, Math.round(s.x), Math.round(s.y), s.vMin.toFixed(2), s.vMax.toFixed(2)])`);
  console.log('t1', JSON.stringify(info2));
  await shot(`${tag}-2.png`);
  console.log('console errors/warnings:', errors.length ? errors : 'none');
} finally {
  try { ws?.close(); } catch { /* */ }
  chrome.kill('SIGKILL');
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
