// SCREEN-SPACE HUD CHROME (render/hud.ts) — what is left in the module after
// Story 8.6 moved the bottom-right own-vitals cluster into the HUD bar's two
// globes: the BR chrome bar, the match-phase lines, the `IN STORM` warning and
// the victim tells, the SUNK overlay and the spectate banner.
//
// The cluster's own pins did NOT disappear with it — they moved:
//   hpGlobe.test.ts    the bands, the header value, the pulse + its 1.1 Hz cap,
//                      the phase integrator, railSig, repairFraction, the amber
//                      corollary's HP input and the eased hold
//   helmGlobe.test.ts  the detents, the arc angles, the speed-ladder fraction,
//                      the needle's astern sign and boost clamp, the rudder
//                      tick, and the whole helm-glyph fade
// What is NEW here is the SATELLITE COLUMN's re-anchor: `IN STORM` and the tells
// are centred above the bar's top edge instead of stacked over a dead corner.

import { describe, it, expect, afterEach } from 'vitest';
import { Container } from 'pixi.js';
import { CONFIG, effectiveStats } from '@salvo/shared';
import type { MatchUx } from '../ui/phase.js';
import {
  Hud,
  type OwnStatus,
  TELL_FIT_MAX_MS,
  TELL_STYLE,
  conning,
  reloadFraction,
  stormWarnAnchor,
  tellAnchor,
  tellLine,
  tellSeconds,
} from '../render/hud.js';
import { HUD_BAR_WIDTH, hudBarLayout } from '../render/hudBar.js';
import { monoTextWidth } from '../ui/refitCardFit.js';
import { CHROME_BAR_SEGMENTS, RING_LIT_ALPHA, chromeBarSegments, ringReadout, type ChromeBarView } from '../ui/chromeBar.js';
import { KILL_LEADER_MARK } from '../ui/bounty.js';
import { abilityPressDenied } from '../sim/inputSampler.js';
import { DeniedPulse } from '../render/deniedFire.js';
import { settings } from '../settings/store.js';
import { CLIENT_CONFIG } from '../config.js';

const V = CLIENT_CONFIG.vitals;
/** The floor viewport, and the bar top the chrome hangs off there. */
const FLOOR = { w: 1366, h: 768 };
const BAR_TOP = hudBarLayout(FLOOR.w, FLOOR.h).bar.y;

const stats = effectiveStats(CONFIG.shipClasses.torpedoBoat);

function ownStatus(over: Partial<OwnStatus> = {}): OwnStatus {
  return {
    hp: 80,
    repairHp: 0,
    ammo: [null, null, null, null],
    primedSlot: 0,
    alive: true,
    sinking: false,
    respawnInMs: 0,
    cls: 'torpedoBoat',
    stats,
    loadout: ['gun', 'heavyTorpedo', null, null],
    boostActive: false,
    slowedMsLeft: 0,
    dazzledMsLeft: 0,
    ...over,
  };
}

const MATCH: MatchUx = { topLine: '', tag: '', countdown: '' } as MatchUx;
/** A HIDDEN chrome bar (the pre-live gate) for frames that are about something
 *  else — the bar has its own suite below and in chromeBar.test.ts. */
const QUIET: ChromeBarView = {
  visible: false,
  afloat: 0,
  kills: 0,
  matchMs: 0,
  ring: { text: '', urgent: false },
  bounty: null,
  tier1: false,
};

describe('reloadFraction — reload progress from reloadMsLeft', () => {
  it('is 0 when idle (no reload running) and just after firing', () => {
    expect(reloadFraction(0, CONFIG.gun.reloadMs)).toBe(0); // idle / fully loaded
    expect(reloadFraction(CONFIG.gun.reloadMs, CONFIG.gun.reloadMs)).toBe(0); // just fired
  });

  it('progresses toward 1 as the reload completes', () => {
    expect(reloadFraction(CONFIG.gun.reloadMs / 2, CONFIG.gun.reloadMs)).toBeCloseTo(0.5, 9);
    expect(reloadFraction(300, 3000)).toBeCloseTo(0.9, 9); // nearly ready
  });

  it('clamps out-of-range inputs and guards a zero reload', () => {
    expect(reloadFraction(9000, 3000)).toBe(0); // over-full remaining
    expect(reloadFraction(-10, 3000)).toBe(0); // idle
    expect(reloadFraction(100, 0)).toBe(0); // zero reload -> no progress bar
  });
});

describe('conning — the third state gate (Story 5.2)', () => {
  it('is alive OR sinking, and nothing else', () => {
    expect(conning({ alive: true, sinking: false })).toBe(true);
    expect(conning({ alive: false, sinking: true })).toBe(true);
    expect(conning({ alive: false, sinking: false })).toBe(false);
  });
});

describe('ability denied feedback — a cooling press drives the EXISTING pulse grammar', () => {
  it('a press while the boost is cooling (or while dead) predicts denied and pulses; never silence', () => {
    expect(abilityPressDenied(true, false)).toBe(true); // cooling: charge consumed
    expect(abilityPressDenied(false, true)).toBe(true); // dead
    const pulse = new DeniedPulse();
    expect(pulse.update(true, 1000)).toBe(true); // flash on
    expect(pulse.update(false, 1050)).toBe(true); // still inside the 80ms window
    expect(pulse.update(false, 1100)).toBe(false); // pulse over
  });

  it('a ready press is not denied (it opens the optimistic window instead)', () => {
    expect(abilityPressDenied(true, true)).toBe(false);
  });
});

// --- STORY 8.6: THE SATELLITE COLUMN ------------------------------------------
//
// `IN STORM` and the victim tells used to hang off the bottom-right cluster's
// top edge. The cluster is gone; the column now hangs off the HUD BAR's top edge
// and is CENTRED on the screen. The two offsets (`stormAbove`, `tellAbove`)
// survive verbatim — only what they are measured FROM changed.

describe('the satellite column anchors on the bar, centred', () => {
  it('puts IN STORM `stormAbove` over the bar top, on the screen centre line', () => {
    const at = stormWarnAnchor(FLOOR.w, BAR_TOP);
    expect(at.x).toBe(FLOOR.w / 2);
    expect(BAR_TOP - at.y).toBe(V.stormAbove);
    expect(at.y).toBeGreaterThan(0); // still on screen at the floor viewport
  });

  it('stacks the tells ABOVE it, in the same column', () => {
    const storm = stormWarnAnchor(FLOOR.w, BAR_TOP);
    const tells = tellAnchor(FLOOR.w, BAR_TOP);
    expect(tells.x).toBe(storm.x);
    expect(tells.y).toBeLessThan(storm.y);
    expect(BAR_TOP - tells.y).toBe(V.tellAbove);
    // Two stacked tells still clear the storm line and stay on screen.
    const highest = tells.y - V.tellGap;
    expect(highest).toBeLessThan(storm.y);
    expect(highest).toBeGreaterThan(0);
  });

  it('tracks the bar on a short viewport (the 1280x614 logical floor)', () => {
    const shortBar = hudBarLayout(1280, 614).bar.y;
    const at = stormWarnAnchor(1280, shortBar);
    expect(at.x).toBe(640);
    expect(shortBar - at.y).toBe(V.stormAbove);
    expect(at.y).toBeGreaterThan(CLIENT_CONFIG.chromeBar.y); // clear of the chrome bar
  });
});

describe('the tells fit their box (amendment 47 — the container-fit law)', () => {
  // The tells are centred over the HUD bar, so the bar's own width is the column
  // they share with IN STORM. A tell that outran it would paint over the ocean
  // beside the bar — so the pin measures a deliberately absurd window, not just
  // today's few-second one.
  it('every reachable tell line fits the bar`s width', () => {
    for (const label of ['SLOWED', 'DAZZLED']) {
      for (const ms of [1, 999, 1000, 9000, 60_000, TELL_FIT_MAX_MS]) {
        const line = tellLine(label, ms);
        const w = monoTextWidth(line, TELL_STYLE.fontSize, TELL_STYLE.letterSpacing);
        expect(w, `${line} @ ${w}px`).toBeLessThanOrEqual(HUD_BAR_WIDTH);
      }
    }
  });
});

// --- STORY 3.3: THE BR CHROME BAR ----------------------------------------------
//
// The composer has its own suite (chromeBar.test.ts). These are the RENDER-half
// properties that only the real instrument can prove: that the row is drawn from
// BOTH update paths (the ratified reveal-HUD survivor set — it outlives the hull
// where the vitals do not), and that the amber urgency breath starts LIT, dips
// to the floor, and holds while Tier 1 owns the eye.

describe('Hud — the BR chrome bar survives the hull (Story 3.3)', () => {
  const status = ownStatus();
  const LIVE_ROW = '12 AFLOAT · 2 KILLS · T+04:12 · RING CLOSES IN 2:34';

  function bar(over: Partial<ChromeBarView> = {}): ChromeBarView {
    return {
      visible: true,
      afloat: 12,
      kills: 2,
      matchMs: 252_000,
      ring: ringReadout('clear', 154_000),
      bounty: null,
      tier1: false,
      ...over,
    };
  }

  // The pooled Text index of the ring readout, taken FROM THE COMPOSER rather
  // than assumed to be the last slot: the bounty register (Story 4.6) appends
  // an OPTIONAL tail after the ring.
  const RING = chromeBarSegments(bar()).findIndex((s) => s.pulsed);

  const drive = (hud: Hud, v: ChromeBarView, nowSec: number): void =>
    hud.update(status, false, v, MATCH, FLOOR.w, FLOOR.h, nowSec, BAR_TOP);

  afterEach(() => settings.reset());

  it('renders the row alive, and KEEPS rendering it from the spectate path', () => {
    const hud = new Hud(new Container());
    drive(hud, bar(), 1);
    expect(hud.chromeBarText().join('')).toBe(LIVE_ROW);
    hud.updateSpectate(bar(), MATCH, FLOOR.w, FLOOR.h, 'SUNK — SPECTATING', 2);
    expect(hud.chromeBarText().join('')).toBe(LIVE_ROW); // the match readout outlives the hull
  });

  it('renders the KILL LEADER tail through the pooled Texts, and drops it cleanly when the throne vacates (Story 4.6)', () => {
    const hud = new Hud(new Container());
    const held = bar({ bounty: { name: 'ALPHA', hue: 0x35d07f } });
    drive(hud, held, 1);
    expect(hud.chromeBarText().join('')).toBe(`${LIVE_ROW} · ${KILL_LEADER_MARK} ALPHA`);
    // THE POOL MUST HOLD THE WHOLE ROW: layoutChromeBar bounds both its loops
    // by CHROME_BAR_SEGMENTS, so an under-sized pool truncates the tail
    // SILENTLY rather than failing.
    expect(chromeBarSegments(held)).toHaveLength(CHROME_BAR_SEGMENTS);
    drive(hud, bar(), 2); // throne vacates: the register goes, separator and all
    expect(hud.chromeBarText().join('')).toBe(LIVE_ROW);
  });

  it('keeps rendering with no HUD bar on screen at all (it is not parented to one)', () => {
    const layer = new Container();
    const hud = new Hud(layer);
    hud.updateSpectate(bar(), MATCH, FLOOR.w, FLOOR.h, 'SUNK — SPECTATING', 1);
    expect(hud.chromeBarText().join('')).toBe(LIVE_ROW);
  });

  it('is HIDDEN while the zone timeline is idle (the pre-live ready room)', () => {
    const hud = new Hud(new Container());
    drive(hud, bar({ visible: false }), 1);
    expect(hud.chromeBarText().join('')).toBe('');
    drive(hud, bar(), 2); // ...and comes back the moment the match goes live
    expect(hud.chromeBarText().join('')).toBe(LIVE_ROW);
  });

  it('re-centers on a viewport change and tracks the T+ tick', () => {
    const hud = new Hud(new Container());
    drive(hud, bar(), 1);
    drive(hud, bar({ matchMs: 253_000 }), 2);
    expect(hud.chromeBarText().join('')).toContain('T+04:13');
  });

  it('breathes the ring ONLY in the urgency window — starting at the LIT keyframe', () => {
    const hud = new Hud(new Container());
    const urgent = bar({ ring: ringReadout('reveal', 9_400) });
    drive(hud, bar(), 0); // steady violet segment first
    expect(hud.chromeBarAlpha(RING)).toBe(1);
    drive(hud, urgent, 0); // onset: phase 0 = lit, never a mid-breath snap
    expect(hud.chromeBarAlpha(RING)).toBeCloseTo(RING_LIT_ALPHA, 9);
    drive(hud, urgent, 0.5); // half a 1 Hz cycle later: the trough
    expect(hud.chromeBarAlpha(RING)).toBeCloseTo(CLIENT_CONFIG.chromeBar.pulseFloorAlpha, 6);
    drive(hud, bar(), 1); // window shut: steady again, and the phase DISARMS
    expect(hud.chromeBarAlpha(RING)).toBe(1);
    drive(hud, urgent, 1.016);
    expect(hud.chromeBarAlpha(RING)).toBeCloseTo(RING_LIT_ALPHA, 2);
  });

  it('HOLDS the amber segment lit while a Tier-1 threat channel owns the eye', () => {
    const hud = new Hud(new Container());
    const urgent = bar({ ring: ringReadout('reveal', 9_400) });
    drive(hud, urgent, 0);
    drive(hud, urgent, 0.5); // at the trough
    const breathing = hud.chromeBarAlpha(RING);
    expect(breathing).toBeLessThan(RING_LIT_ALPHA);
    let t = 0.5;
    const held = { ...urgent, tier1: true };
    drive(hud, held, (t += 0.016));
    expect(hud.chromeBarAlpha(RING)).toBeGreaterThan(breathing);
    expect(hud.chromeBarAlpha(RING)).toBeLessThan(RING_LIT_ALPHA); // not a snap
    for (let i = 0; i < 120; i++) drive(hud, held, (t += 0.016)); // ~2s of hold
    expect(hud.chromeBarAlpha(RING)).toBeCloseTo(RING_LIT_ALPHA, 2);
  });

  it('at motion=off the amber segment is STATIC AND LIT — the information survives', () => {
    settings.set({ motion: 'off' });
    const hud = new Hud(new Container());
    const urgent = bar({ ring: ringReadout('reveal', 4_000) });
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      drive(hud, urgent, t);
      expect(hud.chromeBarAlpha(RING)).toBe(RING_LIT_ALPHA);
    }
    expect(hud.chromeBarText().join('')).toContain('RING CLOSES IN 0:04'); // copy intact
  });

  it('carries the breath ACROSS the alive→spectate seam — no reset, no dt spike', () => {
    // Dying mid-urgency-window swaps which update path draws the bar. The pulse
    // integrator is the SAME one either side, so the breath must simply continue.
    const urgent = bar({ ring: ringReadout('reveal', 9_400) });
    const seam = new Hud(new Container());
    const control = new Hud(new Container()); // the same breath, never interrupted
    let t = 0;
    drive(seam, urgent, t);
    drive(control, urgent, t);
    for (let i = 0; i < 16; i++) {
      t += 0.016;
      drive(seam, urgent, t);
      drive(control, urgent, t);
    }
    const atDeath = seam.chromeBarAlpha(RING);
    expect(atDeath).toBeLessThan(RING_LIT_ALPHA); // caught mid-descent
    let prev = atDeath;
    for (let i = 0; i < 14; i++) {
      t += 0.016;
      seam.updateSpectate(urgent, MATCH, FLOOR.w, FLOOR.h, 'SUNK — SPECTATING', t);
      drive(control, urgent, t);
      const a = seam.chromeBarAlpha(RING);
      expect(a).toBeCloseTo(control.chromeBarAlpha(RING), 9); // identical wave
      expect(a).toBeLessThan(prev); // still descending — no snap back to lit
      expect(prev - a).toBeLessThan(0.05); // one frame's worth, not a jump
      prev = a;
    }
    seam.updateSpectate(urgent, MATCH, FLOOR.w, FLOOR.h, 'SUNK — SPECTATING', 0.5);
    expect(seam.chromeBarAlpha(RING)).toBeCloseTo(CLIENT_CONFIG.chromeBar.pulseFloorAlpha, 6);
  });

  // THE AMBER COROLLARY's ring half still lives in this module: a wounded hull
  // in an urgency window must not stop the ring breathing, and a spectator (no
  // hull at all) must reach the same verdict.
  it('an amber hull never outranks the ring, alive or spectating', () => {
    const hud = new Hud(new Container());
    const urgent = bar({ ring: ringReadout('reveal', 9_400) });
    const wounded = ownStatus({ hp: stats.maxHp * 0.4 });
    const seen = new Set<string>();
    let t = 0;
    for (let i = 0; i < 70; i++) {
      hud.update(wounded, false, urgent, MATCH, FLOOR.w, FLOOR.h, (t += 0.016), BAR_TOP);
      seen.add(hud.chromeBarAlpha(RING).toFixed(3));
    }
    expect(seen.size).toBeGreaterThan(5); // the ring is still breathing
    const spec = new Set<string>();
    for (let i = 0; i < 70; i++) {
      hud.updateSpectate(urgent, MATCH, FLOOR.w, FLOOR.h, 'SUNK — SPECTATING', (t += 0.016));
      spec.add(hud.chromeBarAlpha(RING).toFixed(3));
    }
    expect(spec.size).toBeGreaterThan(5);
  });
});

// --- STORY 2.9: THE VICTIM TELLS -----------------------------------------------
//
// DUAL-CODED by construction (a word plus a live countdown), so neither a color
// nor the mere presence of a mark is ever carrying the state alone.

describe('tellLine / tellSeconds — the dual-coded victim status line', () => {
  it('names the state AND counts it down', () => {
    expect(tellLine('SLOWED', 2400)).toBe('SLOWED 3s');
    expect(tellLine('DAZZLED', 1000)).toBe('DAZZLED 1s');
  });

  it('renders NOTHING when the window is not running (no ghost, no placeholder)', () => {
    expect(tellLine('SLOWED', 0)).toBe('');
    expect(tellLine('DAZZLED', -500)).toBe(''); // already expired
  });

  it('never reads "0s" while the window is still live', () => {
    expect(tellSeconds(1)).toBe(1);
    expect(tellSeconds(999)).toBe(1);
    expect(tellSeconds(1001)).toBe(2);
  });
});

describe('Hud — the tells and the storm warning on a live frame', () => {
  const draw = (hud: Hud, status: OwnStatus, inStorm = false): void =>
    hud.update(status, inStorm, QUIET, MATCH, FLOOR.w, FLOOR.h, 10, BAR_TOP);

  it('shows nothing at all while unafflicted', () => {
    const hud = new Hud(new Container());
    draw(hud, ownStatus());
    expect([hud.tellText(0), hud.tellText(1)]).toEqual(['', '']);
  });

  it('shows each window, and BOTH at once when both are running', () => {
    const hud = new Hud(new Container());
    draw(hud, ownStatus({ slowedMsLeft: 2000 }));
    expect([hud.tellText(0), hud.tellText(1)]).toEqual(['SLOWED 2s', '']);
    draw(hud, ownStatus({ dazzledMsLeft: 3000 }));
    expect([hud.tellText(0), hud.tellText(1)]).toEqual(['', 'DAZZLED 3s']);
    draw(hud, ownStatus({ slowedMsLeft: 1500, dazzledMsLeft: 4000 }));
    expect([hud.tellText(0), hud.tellText(1)]).toEqual(['SLOWED 2s', 'DAZZLED 4s']);
  });

  it('a single running tell takes the BOTTOM slot — the column never shows a hole', () => {
    const hud = new Hud(new Container());
    draw(hud, ownStatus({ slowedMsLeft: 2000 }));
    const slowedOnly = hud.tellPosition(0);
    expect(slowedOnly).toEqual(tellAnchor(FLOOR.w, BAR_TOP));
    draw(hud, ownStatus({ dazzledMsLeft: 2000 }));
    expect(hud.tellPosition(1)).toEqual(slowedOnly);
    draw(hud, ownStatus({ slowedMsLeft: 2000, dazzledMsLeft: 2000 }));
    expect(hud.tellPosition(0)).toEqual(slowedOnly);
    expect(hud.tellPosition(1)?.y).toBe((slowedOnly?.y ?? 0) - V.tellGap);
  });

  it('keeps the tells through the SINKING window and clears them on a dead hull', () => {
    const hud = new Hud(new Container());
    draw(hud, ownStatus({ alive: false, sinking: true, slowedMsLeft: 2000 }));
    expect(hud.tellText(0)).toBe('SLOWED 2s'); // still conning, still fouled
    draw(hud, ownStatus({ slowedMsLeft: 2000, dazzledMsLeft: 2000 }));
    draw(hud, ownStatus()); // both expired
    expect([hud.tellText(0), hud.tellText(1)]).toEqual(['', '']);
    draw(hud, ownStatus({ alive: false, slowedMsLeft: 5000 })); // a sunk hull is not fouled
    expect(hud.tellText(0)).toBe('');
  });

  it('drops the tells on a spectate frame (they die with the hull)', () => {
    const hud = new Hud(new Container());
    draw(hud, ownStatus({ dazzledMsLeft: 5000 }));
    hud.updateSpectate(QUIET, MATCH, FLOOR.w, FLOOR.h, 'SPECTATING', 0);
    expect(hud.tellText(1)).toBe('');
  });

  it('shows IN STORM at its anchor, and drops it when the hull is clear or spectating', () => {
    const hud = new Hud(new Container());
    draw(hud, ownStatus());
    expect(hud.stormPosition()).toBeNull();
    draw(hud, ownStatus(), true);
    expect(hud.stormPosition()).toEqual(stormWarnAnchor(FLOOR.w, BAR_TOP));
    hud.updateSpectate(QUIET, MATCH, FLOOR.w, FLOOR.h, 'SPECTATING', 0);
    expect(hud.stormPosition()).toBeNull();
  });

  it('renders a sunk frame (the SUNK overlay, no tells) without throwing', () => {
    const hud = new Hud(new Container());
    expect(() =>
      draw(hud, ownStatus({ hp: 0, alive: false, respawnInMs: 3000 })),
    ).not.toThrow();
    expect(hud.tellText(0)).toBe('');
  });
});
