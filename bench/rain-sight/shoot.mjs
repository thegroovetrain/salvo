// Headless verification: open rain-sight.html in MUTED headless Chrome over CDP,
// collect console errors, take screenshots a few seconds apart, print the
// ships' per-part V ranges and the camera (no frame-rate readout). Kills the browser it started.
// Usage: node bench/rain-sight/shoot.mjs [solo] [span]   (solo = 0 A+D, 1 A, 2 D — one look full-size; '-' = keep the view)
// Env:
//   VIEW=game       (default) the Game view: everything layered as in the game
//   VIEW=compare    the Compare view (A+D large, A and D beside it); a solo arg implies the looks
//   VIEW=storm      the whole-map Storm view instead of the ship looks
//   VIEW=radar      the Radar view (scope, sweep, paints, rain clutter)
//   CAM=<json>      set the active view's camera through the test hook, e.g. '{"span":250,"follow":2}'
//                   or '{"x":100,"y":-40,"span":250}' (x/y without follow = free camera); applied after
//                   CLOCK / EVAL. A string value is evaluated in the page, e.g. '{"x":"__bench.ships[2].x"}'
//   EVAL=<js>       run this in the page after setup (e.g. pop smoke via window.__bench)
//   PRESHOT=<js>    run this in the page right before the first shot
//   BETWEEN=<js>    run this in the page before every shot after the first
//   SETTLE=<ms>     real ms to wait after setup before the first shot (default 1500)
//   CLOCK=<ms>      jump the match clock there first (ms from zone start)
//   SPEED=<x>       match clock speed (1–60)
//   PAUSE=1         freeze the clock (shot lands exactly on CLOCK)
//   GAP=<ms>        real ms between the two shots (default 4000)
//   SHOTS=<n>       number of shots (default 2)
//   TAG=<name>      file name stem (default derived)
//   FOLLOW=<i>      centre the camera on ship i
//   INPUT=<json>    real mouse input over CDP before the first shot (page px, the canvas starts at x 300):
//                   [["wheel", x, y, deltaY, times], ["drag", x0, y0, x1, y1], ["click", x, y, shift(0|1)],
//                    ["dblclick", x, y], ["wait", ms]] — the camera after each is printed
//   WAITBEAM=<i>[:<rad>]  before the first shot, wait until the radar beam is just short of ship i's
//                   bearing (default 0.35 rad), so the hull has sailed off its last paint
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
const radarView = process.env.VIEW === 'radar';
const compare = process.env.VIEW === 'compare';
const tag = process.env.TAG
  ?? ((storm ? 'storm' : radarView ? 'radar' : solo !== undefined ? `solo-${SOLO_TAGS[Number(solo)]}` : compare ? 'compare' : 'game')
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
  else if (radarView) await ev(`window.__bench.setMode('radar')`);
  else if (solo !== undefined) await ev(`window.__bench.setMode('look', ${[2, 0, 1][Number(solo)]})`);
  else if (compare) await ev(`window.__bench.setMode('look', -1)`);
  if (process.env.FOLLOW) await ev(`window.__bench.setCam({ follow: ${Number(process.env.FOLLOW)} })`);
  if (zoom !== undefined) await ev(`window.__bench.setCam({ span: ${Number(zoom)} })`);
  if (process.env.SPEED) await ev(`window.__bench.P.timeSpeed = ${Number(process.env.SPEED)}`);
  if (process.env.PAUSE) await ev(`window.__bench.P.paused = true`);
  if (process.env.EYE) await ev(`window.__bench.P.showEye = true`);
  if (process.env.CLOCK) await ev(`window.__bench.setClock(${Number(process.env.CLOCK)})`);
  if (process.env.CLOCK && !storm) await ev(`window.__bench.reseatObserver()`);
  if (process.env.EVAL) console.log('eval:', JSON.stringify(await ev(process.env.EVAL)));
  if (process.env.CAM) {
    const o = JSON.parse(process.env.CAM);
    const js = '{' + Object.entries(o).map(([k, v]) => `${k}: ${typeof v === 'string' ? `(${v})` : v}`).join(', ') + '}';
    console.log('cam:', JSON.stringify(await ev(`window.__bench.setCam(${js})`)));
  }
  await sleep(Number(process.env.SETTLE ?? 1500));
  const state = `(() => { const b = window.__bench; return { clock: Math.round(b.matchT), spin: b.storm.fog.spinSign, sweep: b.radar.sweepIndex, view: b.P.view, cam: { x: Math.round(b.cam.x), y: Math.round(b.cam.y), span: Math.round(b.cam.span), follow: b.cam.follow }, clutterStep: b.radar.lastClutterCells, beam: +(b.radar.angle % (2 * Math.PI)).toFixed(2), slices: b.radar.slices.length, clouds: b.smoke.discs.map(d => [Math.round(d.x), Math.round(d.y), Math.round(d.r)]), ships: b.ships.map(s => [s.cls, Math.round(s.x), Math.round(s.y), s.vMin.toFixed(2), s.vMax.toFixed(2)]) }; })()`;
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(shots, name), Buffer.from(r.result.data, 'base64'));
    console.log('wrote', join(shots, name));
  };
  if (process.env.PRESHOT) { console.log('preshot:', JSON.stringify(await ev(process.env.PRESHOT))); await sleep(800); }
  if (process.env.INPUT) {
    const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'none', ...extra });
    const camNow = async () => JSON.stringify(await ev(`(() => { const c = window.__bench.cam; return { x: Math.round(c.x), y: Math.round(c.y), span: Math.round(c.span), follow: c.follow, clouds: window.__bench.smoke.discs.length }; })()`));
    for (const [kind, ...a] of JSON.parse(process.env.INPUT)) {
      if (kind === 'wheel') {
        const [x, y, dy, n = 1] = a;
        for (let i = 0; i < n; i++) { await mouse('mouseWheel', x, y, { deltaX: 0, deltaY: dy }); await sleep(30); }
        await sleep(600); // let the easing land
      } else if (kind === 'drag') {
        const [x0, y0, x1, y1] = a;
        await mouse('mouseMoved', x0, y0);
        await mouse('mousePressed', x0, y0, { button: 'left', buttons: 1, clickCount: 1 });
        for (let i = 1; i <= 10; i++) await mouse('mouseMoved', x0 + ((x1 - x0) * i) / 10, y0 + ((y1 - y0) * i) / 10, { button: 'left', buttons: 1 });
        await mouse('mouseReleased', x1, y1, { button: 'left', buttons: 0, clickCount: 1 });
      } else if (kind === 'click' || kind === 'dblclick') {
        const [x, y, shift = 0] = a;
        const modifiers = shift ? 8 : 0;
        const clicks = kind === 'dblclick' ? 2 : 1;
        for (let c = 1; c <= clicks; c++) {
          await mouse('mousePressed', x, y, { button: 'left', buttons: 1, clickCount: c, modifiers });
          await mouse('mouseReleased', x, y, { button: 'left', buttons: 0, clickCount: c, modifiers });
        }
      } else if (kind === 'wait') await sleep(a[0]);
      await sleep(100);
      console.log(`input ${kind}`, JSON.stringify(a), '->', await camNow());
    }
  }
  if (process.env.WAITBEAM) {
    const [si, lead = '0.35'] = process.env.WAITBEAM.split(':');
    const gap = `(() => { const b = window.__bench; const s = b.ships[${Number(si)}]; const T = 2 * Math.PI; const brg = Math.atan2(s.y - b.OWN.y, s.x - b.OWN.x); return (((brg - b.radar.angle) % T) + T) % T; })()`;
    let d = await ev(gap);
    for (let i = 0; i < 400 && !(d > 0 && d < Number(lead)); i++) { await sleep(25); d = await ev(gap); }
    console.log('beam gap to ship (rad):', d?.toFixed?.(3));
  }
  for (let i = 1; i <= NSHOTS; i++) {
    if (i > 1) await sleep(GAP);
    if (i > 1 && process.env.BETWEEN) {
      console.log('between:', JSON.stringify(await ev(process.env.BETWEEN)));
      await sleep(800);
    }
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
