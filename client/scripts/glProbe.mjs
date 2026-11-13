// THE IN-PAGE WEBGL PROBE shared by glBudget.mjs (the GPU allocation budget,
// Story 11.2 follow-up) and playCheck.mjs (the real-match freeze check, Story
// 11.2 follow-up 3). `instrument` is injected before any page script; it wraps
// the WebGL2 prototype and records into `window.__glb`:
//   - allocs: texImage2D / texStorage2D / renderbufferStorage(Multisample) sizes;
//   - incomplete: framebuffer completeness, checked at every draw / clear / blit
//     into a framebuffer whose attachments changed since its last check;
//   - lost: `webglcontextlost` / `webglcontextrestored` on any canvas (`game` =
//     the canvas is document-attached — Pixi's own `isWebGLSupported` probe
//     deliberately loses a throwaway context, which is not the game's);
//   - draws: a running count of draw calls (a frozen render loop stops it).

/**
 * THE NAMED MARGIN. Pixi's `TexturePool` rounds every filter / mask target up
 * to the next power of two per side, so a pass exactly the size of the screen
 * can legitimately be up to (just under) twice the backing's longer side. Twice
 * the longer backing side is therefore the smallest budget a correct client can
 * meet, and anything world-sized blows straight through it.
 */
export const BACKING_FACTOR = 2;

/** Console lines that name a GPU failure. */
export const CONSOLE_BAD = /framebuffer is incomplete|GL_OUT_OF_MEMORY|CONTEXT_LOST|context lost/i;

/** Injected before any page script: wraps the WebGL2 prototype. */
export function instrument() {
  const SMALL_SIDE = 1024;
  const rec = (window.__glb = { allocs: [], worst: null, incomplete: [], lost: [], limits: null, maxBacking: 0, draws: 0 });
  const P = WebGL2RenderingContext.prototype;
  const dirty = new WeakSet();
  const backing = () => {
    let m = 0;
    for (const c of document.querySelectorAll('canvas')) m = Math.max(m, c.width, c.height);
    rec.maxBacking = Math.max(rec.maxBacking, m);
    return m;
  };
  const note = (gl, kind, w, h, extra) => {
    if (!rec.limits) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      rec.limits = {
        tex: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        rb: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
        renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      };
    }
    const b = backing();
    const a = { kind, w, h, extra, backing: b, phase: window.__glbPhase ?? 'boot',
      stack: Math.max(w, h) > 4096 ? String(new Error().stack).split('\n').slice(2, 12).join(' | ') : undefined };
    if (rec.worst === null || Math.max(w, h) > Math.max(rec.worst.w, rec.worst.h)) rec.worst = a;
    // Only a side over SMALL_SIDE is listed: no canvas is under half of it, so
    // nothing smaller can break the budget, and a long real match re-uploads
    // small dynamic textures every frame.
    if (Math.max(w, h) > SMALL_SIDE) rec.allocs.push(a);
  };
  const wrap = (name, pick, after) => {
    const orig = P[name];
    P[name] = function (...a) {
      try {
        const s = pick(a);
        if (s) note(this, name, s[0], s[1], s[2]);
      } catch { /* the probe must never break the page */ }
      const r = orig.apply(this, a);
      if (after) after(this, a);
      return r;
    };
  };
  const markBound = (gl) => {
    const fb = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
    if (fb) dirty.add(fb);
  };
  wrap('texImage2D', (a) => (a.length >= 9 ? [a[3], a[4]] : null));
  wrap('texStorage2D', (a) => [a[3], a[4]]);
  wrap('renderbufferStorage', (a) => [a[2], a[3]]);
  wrap('renderbufferStorageMultisample', (a) => [a[3], a[4], `samples=${a[1]}`]);
  wrap('framebufferTexture2D', () => null, markBound);
  wrap('framebufferRenderbuffer', () => null, markBound);
  const check = function (gl) {
    const fb = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
    if (!fb || !dirty.has(fb)) return;
    dirty.delete(fb);
    const st = gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER);
    if (st !== gl.FRAMEBUFFER_COMPLETE && rec.incomplete.length < 50) {
      rec.incomplete.push({ status: `0x${st.toString(16)}`, phase: window.__glbPhase ?? 'boot' });
    }
  };
  for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'clear', 'blitFramebuffer']) {
    const orig = P[name];
    const counts = name !== 'clear' && name !== 'blitFramebuffer';
    P[name] = function (...a) {
      try {
        check(this);
        if (counts) rec.draws++;
      } catch { /* never break the page */ }
      return orig.apply(this, a);
    };
  }
  // Any storage change can change an attached framebuffer's completeness.
  for (const name of ['texImage2D', 'texStorage2D', 'renderbufferStorage', 'renderbufferStorageMultisample']) {
    const orig = P[name];
    P[name] = function (...a) {
      const r = orig.apply(this, a);
      try { markBound(this); } catch { /* never break the page */ }
      return r;
    };
  }
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...r) {
    const c = gc.call(this, type, ...r);
    if (c && /webgl/.test(type) && !this.__glb) {
      this.__glb = true;
      this.addEventListener('webglcontextlost', () =>
        rec.lost.push({ ev: 'lost', game: this.isConnected, phase: window.__glbPhase ?? 'boot' }));
      this.addEventListener('webglcontextrestored', () =>
        rec.lost.push({ ev: 'restored', game: this.isConnected, phase: window.__glbPhase ?? 'boot' }));
    }
    return c;
  };
}

/**
 * Judge one `window.__glb` record: every allocation over BACKING_FACTOR × the
 * record's largest canvas backing side, every incomplete framebuffer and every
 * lost game context is a failure. `worst` = the largest allocation seen.
 */
export function judgeGlRecord(rec) {
  const failures = [];
  const worst = rec.worst ?? null;
  const budget = BACKING_FACTOR * rec.maxBacking;
  for (const a of rec.allocs) {
    if (Math.max(a.w, a.h) > budget) {
      failures.push(`${a.kind} ${a.w}x${a.h}${a.extra ? ` ${a.extra}` : ''} in phase "${a.phase}" > ${BACKING_FACTOR} x backing ${rec.maxBacking} = ${budget}${a.stack ? `\n        at ${a.stack.slice(0, 600)}` : ''}`);
    }
  }
  for (const f of rec.incomplete) failures.push(`incomplete framebuffer (status ${f.status}) in phase "${f.phase}"`);
  for (const l of rec.lost) if (l.game && l.ev === 'lost') failures.push(`WebGL context lost in phase "${l.phase}"`);
  return { failures, worst, renderer: rec.limits?.renderer ?? null };
}
