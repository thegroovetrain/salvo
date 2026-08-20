// THE AD LAYER (Story 7.4) — one file per row of the spec's I/O & Edge-Case
// Matrix, plus the two containment pins.
//
// What is worth knowing before reading: the three hardest cases here are NOT
// "does an ad play". They are (1) the BLOCKED script, where Google's shim
// degrades to `Array.push` and NO callback fires at all — not even
// `adBreakDone`, so "the push succeeded" is worth nothing and readiness has to
// be read from the SDK's own arrival, or every return to port pays
// `portal/safeAdapter.ts`'s 35 s cap; (2) the AUDIO DUCK, which
// must never touch the persisted settings store, because `returnToPort` ends in
// a real `location.reload()` and a page that dies mid-break would otherwise
// strand the player muted; and (3) the ORDER of the injected head block, since
// gtag.js processes `dataLayer` in order and a `default` landing behind the
// CMP's `update` could reset a returning EEA visitor's granted consent.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  adsLoaderTag,
  adsTxtContent,
  adsTxtLine,
  consentDefaultsScript,
  injectAdsHead,
  inlineJson,
  isGameIndexPath,
  isValidAdsClientId,
} from '../ads/adsHead.js';
import { CONSENT_DEFAULTS_MARKER } from '../analytics/consentMarker.js';
import {
  AD_SCRIPT_SRC,
  adBreak,
  adsClientId,
  isAdsConfigured,
  isAdsReady,
  startAds,
  __resetAdsForTests,
  type AdBreakPlacement,
} from '../ads/adsense.js';
import { AD_BREAK_NAME, createAdsAdapter, lastBreakStatus, __resetAdsAdapterForTests } from '../ads/adsAdapter.js';
import { AD_INS_CLASS, AD_STATUS_ATTR, adsSlotResults, isValidAdSlotId } from '../ads/adsense.js';
import {
  RESULTS_AD_ID,
  destroyResultsAd,
  hideResultsAd,
  isResultsAdConfigured,
  resultsAdColumnWidth,
  resultsAdFits,
  resultsAdGroupWidth,
  resultsAdMinViewportWidth,
  resultsAdOffsetX,
  resultsPanelOffsetX,
  showResultsAd,
  __resetResultsAdForTests,
} from '../ads/resultsAd.js';
import { RESULTS_PANEL_ID, hideResults, showResults } from '../ui/results.js';
import { CLIENT_CONFIG } from '../config.js';
import { EEA_UK_CH_REGIONS } from '../analytics/consent.js';
import { safeAdapter } from '../portal/safeAdapter.js';
import { Audio } from '../audio/context.js';
import { settings, volumeGain } from '../settings/store.js';
import { startGa, __resetGaForTests } from '../analytics/ga.js';

/** Eric's publisher client (amendment 16, R7). Written out ONCE here, in the
 *  test, so the assertion is an independent statement of the expected value
 *  rather than a re-run of the code that produces it. */
const CLIENT = 'ca-pub-8667818947296707';
const EXPECTED_ADS_TXT = 'google.com, pub-8667818947296707, DIRECT, f08c47fec0942fa0';

interface AdsGlobal {
  adsbygoogle?: { push(cmd: unknown): unknown };
  /** The Ad Placement API's own global — installed by the H5 Games Ads loader
   *  and by nothing else. See `isAdsReady`. */
  adBreak?: unknown;
  [CONSENT_DEFAULTS_MARKER]?: boolean;
}

const g = globalThis as unknown as AdsGlobal & Record<string, unknown>;

// --- ads.txt ------------------------------------------------------------------

describe('ads.txt', () => {
  it('is exactly the line Google needs, derived from the configured client', () => {
    expect(adsTxtLine(CLIENT)).toBe(EXPECTED_ADS_TXT);
  });

  it('is one newline-terminated line and nothing else', () => {
    expect(adsTxtContent(CLIENT)).toBe(`${EXPECTED_ADS_TXT}\n`);
  });

  it('follows a FORK to its own publisher rather than shipping Eric\u2019s', () => {
    // An ads.txt is authoritative BY OMISSION: a file naming the wrong publisher
    // is worse than no file, which is why the line is derived and not typed in.
    expect(adsTxtLine('ca-pub-0000000000000000')).toBe(
      'google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0',
    );
  });
});

// --- the injected head block --------------------------------------------------

describe('the build-time head injection', () => {
  const HTML = '<!DOCTYPE html><html><head><title>x</title></head><body></body></html>';

  it('puts the consent defaults BEFORE the loader', () => {
    const out = injectAdsHead(HTML, CLIENT).html;
    const defaultsAt = out.indexOf("gtag('consent','default'");
    const loaderAt = out.indexOf(AD_SCRIPT_SRC);
    expect(defaultsAt).toBeGreaterThan(-1);
    expect(loaderAt).toBeGreaterThan(-1);
    expect(defaultsAt).toBeLessThan(loaderAt);
  });

  it('injects inside <head>, never after it', () => {
    const out = injectAdsHead(HTML, CLIENT).html;
    expect(out.indexOf(AD_SCRIPT_SRC)).toBeLessThan(out.indexOf('</head>'));
  });

  it('plants the marker that stops analytics/ga.ts restating the defaults', () => {
    expect(injectAdsHead(HTML, CLIENT).html).toContain(`window.${CONSENT_DEFAULTS_MARKER}=true;`);
  });

  it('injects the EXACT region list from analytics/consent.ts \u2014 one list, two consumers', () => {
    const region = /"region":(\[[^\]]*\])/.exec(consentDefaultsScript());
    expect(region).not.toBeNull();
    expect(JSON.parse(region?.[1] ?? '[]')).toEqual([...EEA_UK_CH_REGIONS]);
  });

  it('denies all four signals in the EEA/UK/CH and grants all four globally', () => {
    const script = consentDefaultsScript();
    // The region-scoped payload denies; the global (region-less) payload grants.
    expect(script).toContain('"analytics_storage":"denied","region":[');
    expect(script).toContain(
      `gtag('consent','default',{"ad_storage":"granted","ad_user_data":"granted","ad_personalization":"granted","analytics_storage":"granted"});`,
    );
  });

  it('carries the client id in the loader url and nowhere else', () => {
    expect(adsLoaderTag(CLIENT)).toContain(`${AD_SCRIPT_SRC}?client=${CLIENT}`);
    expect(adsLoaderTag(CLIENT)).toContain('async');
  });

  it('injects NOTHING when no publisher id is configured, and SAYS so', () => {
    expect(injectAdsHead(HTML, '')).toEqual({ html: HTML, injected: false });
  });

  it('is a silent no-op on a document with no </head> \u2014 a build step may not throw', () => {
    const headless = '<html><body></body></html>';
    // `injected: false` is the load-bearing half: `client/vite.config.ts` gates
    // `ads.txt` on it, so a page that silently took no loader cannot ship a file
    // authorising Google to sell inventory on it.
    expect(injectAdsHead(headless, CLIENT)).toEqual({ html: headless, injected: false });
  });

  it('reports a REAL injection, which is what gates ads.txt', () => {
    expect(injectAdsHead(HTML, CLIENT).injected).toBe(true);
  });

  it('reaches the GAME entry only \u2014 never the privacy or how-to-play pages', () => {
    expect(isGameIndexPath('/repo/client/index.html')).toBe(true);
    expect(isGameIndexPath('/repo/client/privacy/index.html')).toBe(false);
    expect(isGameIndexPath('/repo/client/how-to-play/index.html')).toBe(false);
    expect(isGameIndexPath('C:\\repo\\client\\privacy\\index.html')).toBe(false);
    expect(isGameIndexPath('/repo/client/assets/main.js')).toBe(false);
  });

  it('EXCLUDES A PAGE NOBODY HAS WRITTEN YET \u2014 the list is an allowlist', () => {
    // The denylist form opted every future Rollup entry IN: a fourth page would
    // have silently inherited the loader AND the consent block.
    expect(isGameIndexPath('/repo/client/leaderboard/index.html')).toBe(false);
    expect(isGameIndexPath('/repo/client/press/kit/index.html')).toBe(false);
    expect(isGameIndexPath('C:\\repo\\client\\leaderboard\\index.html')).toBe(false);
  });
});

// --- the publisher id is validated, not trusted -------------------------------

describe('the publisher client id', () => {
  const HTML = '<!DOCTYPE html><html><head><title>x</title></head><body></body></html>';

  it('accepts a well-formed ca-pub-<16 digits> and nothing else', () => {
    expect(isValidAdsClientId(CLIENT)).toBe(true);
    expect(isValidAdsClientId('ca-pub-0000000000000000')).toBe(true);
    for (const bad of [
      '',
      'nonsense',
      'pub-8667818947296707',
      'ca-pub-866781894729670',
      'ca-pub-86678189472967070',
      'ca-pub-866781894729670x',
      ' ca-pub-8667818947296707',
      'ca-pub-8667818947296707 ',
    ]) {
      expect(isValidAdsClientId(bad), bad).toBe(false);
    }
  });

  it('a MALFORMED id injects nothing at all \u2014 no loader, no consent block', () => {
    // `String.replace` no-ops silently on garbage, so the old code would have
    // emitted `?client=nonsense` and an ads.txt naming a publisher who does not
    // exist \u2014 authoritative BY OMISSION, and strictly worse than no file.
    expect(injectAdsHead(HTML, 'nonsense')).toEqual({ html: HTML, injected: false });
    expect(injectAdsHead(HTML, 'ca-pub-123')).toEqual({ html: HTML, injected: false });
  });
});

// --- the inline script cannot be broken out of --------------------------------

describe('the inline consent block', () => {
  it('escapes `<` so a payload can never close the script element', () => {
    const hostile = { region: ['</script><script>alert(1)</script>'] };
    const out = inlineJson(hostile);
    expect(out).not.toContain('<');
    expect(out).toContain('\\u003C');
    // and `\\u003C` is what a JS parser reads back as `<`, so the VALUE is intact
    expect(JSON.parse(out.replaceAll('\\u003C', '<'))).toEqual(hostile);
  });

  it('the shipped block contains no raw `<` outside its own script tags', () => {
    const body = consentDefaultsScript().split('\n').slice(1, -1).join('\n');
    expect(body).not.toContain('<');
  });
});

// --- the vendor module --------------------------------------------------------

describe('the AdSense vendor module', () => {
  beforeEach(() => {
    __resetAdsForTests();
    __resetAdsAdapterForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    __resetAdsForTests();
    delete g[CONSENT_DEFAULTS_MARKER];
  });

  it('is INERT with no publisher id: nothing configured, nothing started, no global', () => {
    vi.stubEnv('VITE_ADSENSE_CLIENT', '');
    expect(adsClientId()).toBe('');
    expect(isAdsConfigured()).toBe(false);
    expect(startAds({ sound: 'on', preloadAdBreaks: 'auto' })).toBe(false);
    expect(isAdsReady()).toBe(false);
    expect(g.adsbygoogle).toBeUndefined();
  });

  it('builds the command queue and pushes the session config exactly once', () => {
    vi.stubEnv('VITE_ADSENSE_CLIENT', CLIENT);
    expect(startAds({ sound: 'off', preloadAdBreaks: 'auto' })).toBe(true);
    const queue = g.adsbygoogle as unknown as unknown[];
    expect(queue).toHaveLength(1);
    const cfg = queue[0] as Record<string, unknown>;
    expect(cfg.sound).toBe('off');
    expect(cfg.preloadAdBreaks).toBe('auto');
    // `preloadAdBreaks` is settable ONCE per session — a second start must not
    // push a second config.
    startAds({ sound: 'on', preloadAdBreaks: 'auto' });
    expect(queue).toHaveLength(1);
  });

  it('A SUCCESSFUL PUSH IS NOT READINESS \u2014 a plain Array swallows everything', () => {
    // The whole blocked case in one assertion: `Array.prototype.push` cannot
    // fail, so latching readiness on it latched TRUE in exactly the case the
    // latch exists to exclude.
    vi.stubEnv('VITE_ADSENSE_CLIENT', CLIENT);
    expect(startAds({ sound: 'on', preloadAdBreaks: 'auto' })).toBe(true);
    expect(Array.isArray(g.adsbygoogle)).toBe(true);
    expect(isAdsReady()).toBe(false);
  });

  it('READY on the SDK calling the onReady we pushed with the config', () => {
    vi.stubEnv('VITE_ADSENSE_CLIENT', CLIENT);
    startAds({ sound: 'on', preloadAdBreaks: 'auto' });
    const cfg = (g.adsbygoogle as unknown as Record<string, unknown>[])[0];
    expect(isAdsReady()).toBe(false);
    (cfg.onReady as () => void)();
    expect(isAdsReady()).toBe(true);
  });

  it('READY on the loader installing the Ad Placement API', () => {
    vi.stubEnv('VITE_ADSENSE_CLIENT', CLIENT);
    startAds({ sound: 'on', preloadAdBreaks: 'auto' });
    expect(isAdsReady()).toBe(false);
    g.adBreak = () => undefined;
    expect(isAdsReady()).toBe(true);
  });

  // THE PRODUCTION STRANDING (playtest 2026-08-20, measured on hullcracker.io).
  // Readiness used to be "the queue is no longer the plain Array our shim
  // plants" — which ORDINARY DISPLAY ADSENSE satisfies. Production loaded
  // `adsbygoogle.js?client=ca-pub-…`, which installed the display command
  // processor (`{push, loaded, pageState}`) and left `window.adBreak` and
  // `window.adConfig` UNDEFINED. `isAdsReady()` answered true, so `adsAdapter`
  // skipped its resolve-now fast path and pushed a placement into a processor
  // with no Ad Placement API behind it: no `beforeAd`, no `afterAd`, no
  // `adBreakDone` — 79s and counting on the measurement — and every RETURN TO
  // PORT / ABANDON MATCH sat ~37s on safeAdapter's cap before reloading.
  it('a DISPLAY-ONLY loader is NOT readiness — an arrived SDK with no break API', () => {
    vi.stubEnv('VITE_ADSENSE_CLIENT', CLIENT);
    startAds({ sound: 'on', preloadAdBreaks: 'auto' });
    // Production's exact shape: the display processor, and nothing else.
    g.adsbygoogle = { push: () => 1, loaded: true, pageState: {} } as unknown as { push(cmd: unknown): unknown };
    expect(g.adBreak).toBeUndefined();
    expect(isAdsReady()).toBe(false);
  });

  it('forwards a caller\u2019s own onReady, and survives it throwing', () => {
    vi.stubEnv('VITE_ADSENSE_CLIENT', CLIENT);
    let seen = false;
    startAds({
      sound: 'on',
      preloadAdBreaks: 'auto',
      onReady: () => {
        seen = true;
        throw new Error('caller blew up');
      },
    });
    const cfg = (g.adsbygoogle as unknown as Record<string, unknown>[])[0];
    expect(() => (cfg.onReady as () => void)()).not.toThrow();
    expect(seen).toBe(true);
    expect(isAdsReady()).toBe(true);
  });

  it('drops a placement when the queue was never built', () => {
    vi.stubEnv('VITE_ADSENSE_CLIENT', '');
    adBreak({ type: 'next' });
    expect(g.adsbygoogle).toBeUndefined();
  });

  it('drops a placement while the SDK has not arrived \u2014 nothing sits in a dead queue', () => {
    vi.stubEnv('VITE_ADSENSE_CLIENT', CLIENT);
    startAds({ sound: 'on', preloadAdBreaks: 'auto' });
    adBreak({ type: 'next' });
    expect(g.adsbygoogle as unknown as unknown[]).toHaveLength(1); // the config, and nothing else
  });
});

// --- the interstitial adapter -------------------------------------------------

/** Stand in for the LIVE SDK: capture the placement and hand back the callbacks
 *  so a test can drive Google's own sequence by hand.
 *
 *  It installs `window.adBreak` as well as the command processor, because that
 *  global is what tells the Ad Placement API apart from an ordinary display
 *  loader — see `isAdsReady`. Nothing calls it; the placement still goes through
 *  the queue. */
function liveSdk(): { placements: AdBreakPlacement[]; configs: unknown[] } {
  const placements: AdBreakPlacement[] = [];
  const configs: unknown[] = [];
  g.adBreak = () => undefined;
  g.adsbygoogle = {
    push(cmd: unknown) {
      if (cmd && typeof cmd === 'object' && 'type' in cmd) placements.push(cmd as AdBreakPlacement);
      else configs.push(cmd);
      return 1;
    },
  };
  return { placements, configs };
}

describe('the interstitial adapter', () => {
  let ducks: string[];

  const hooks = () => ({
    muted: () => false,
    onBreakStart: () => void ducks.push('duck'),
    onBreakEnd: () => void ducks.push('unduck'),
  });

  beforeEach(() => {
    ducks = [];
    __resetAdsForTests();
    __resetAdsAdapterForTests();
    vi.stubEnv('VITE_ADSENSE_CLIENT', CLIENT);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    __resetAdsForTests();
  });

  it('requests a `next` break named for the moment, at death \u2192 return to port', async () => {
    const sdk = liveSdk();
    const adapter = createAdsAdapter(hooks());
    await adapter.init();
    const done = adapter.requestAdBreak();
    expect(sdk.placements).toHaveLength(1);
    expect(sdk.placements[0].type).toBe('next');
    expect(sdk.placements[0].name).toBe(AD_BREAK_NAME);
    sdk.placements[0].adBreakDone?.({ breakStatus: 'viewed' });
    await expect(done).resolves.toBeUndefined();
  });

  it('AD FILLS: ducks, plays, restores, and settles \u2014 in that order', async () => {
    const sdk = liveSdk();
    const adapter = createAdsAdapter(hooks());
    await adapter.init();
    const done = adapter.requestAdBreak();
    const p = sdk.placements[0];
    p.beforeAd?.();
    expect(ducks).toEqual(['duck']);
    p.afterAd?.();
    p.adBreakDone?.({ breakStatus: 'viewed' });
    await done;
    expect(ducks).toEqual(['duck', 'unduck']);
    expect(lastBreakStatus()).toBe('viewed');
  });

  it('NO FILL: no duck at all, and the chain proceeds immediately', async () => {
    for (const status of ['noAdPreloaded', 'frequencyCapped', 'other']) {
      __resetAdsForTests();
      __resetAdsAdapterForTests();
      ducks = [];
      const sdk = liveSdk();
      const adapter = createAdsAdapter(hooks());
      await adapter.init();
      const done = adapter.requestAdBreak();
      // Google skips `beforeAd`/`afterAd` entirely when nothing will show.
      sdk.placements[0].adBreakDone?.({ breakStatus: status });
      await expect(done).resolves.toBeUndefined();
      expect(ducks).toEqual([]);
      expect(lastBreakStatus()).toBe(status);
    }
  });

  it('restores audio even if a break ends without its afterAd', async () => {
    const sdk = liveSdk();
    const adapter = createAdsAdapter(hooks());
    await adapter.init();
    const done = adapter.requestAdBreak();
    sdk.placements[0].beforeAd?.();
    sdk.placements[0].adBreakDone?.({ breakStatus: 'dismissed' });
    await done;
    expect(ducks).toEqual(['duck', 'unduck']);
  });

  it('SCRIPT BLOCKED: nothing is pushed, nothing ducks, and the player leaves AT ONCE', async () => {
    // The blocked case verbatim: `adsbygoogle` is left as the plain Array the
    // shim creates, so no callback of Google's can ever run. The adapter reads
    // that synchronously and resolves, rather than making every match end in a
    // 35 s frozen results screen.
    const adapter = createAdsAdapter(hooks());
    await adapter.init();
    await expect(adapter.requestAdBreak()).resolves.toBeUndefined();
    const queue = g.adsbygoogle as unknown as unknown[];
    expect(Array.isArray(queue)).toBe(true);
    // [0] is the adConfig, and there is no [1]: a placement in a dead queue is
    // just litter.
    expect(queue).toHaveLength(1);
    expect(ducks).toEqual([]);
  });

  it('SCRIPT BLOCKED: NO TIMER is involved \u2014 it resolves with the clock frozen', async () => {
    // safeAdapter's 35 s cap stays the only timeout in the whole layer, and this
    // path must never reach it. With fake timers installed and never advanced,
    // anything waiting on a clock would hang here.
    vi.useFakeTimers();
    try {
      const wrapped = safeAdapter(createAdsAdapter(hooks()), 35_000);
      await wrapped.init();
      await expect(wrapped.requestAdBreak()).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves at once when the queue was never built \u2014 no 35 s wait per return to port', async () => {
    vi.stubEnv('VITE_ADSENSE_CLIENT', '');
    const adapter = createAdsAdapter(hooks());
    await adapter.init();
    expect(isAdsReady()).toBe(false);
    await expect(adapter.requestAdBreak()).resolves.toBeUndefined();
  });

  it('reports the mute state AS OF BOOT to adConfig', async () => {
    const sdk = liveSdk();
    const adapter = createAdsAdapter({ ...hooks(), muted: () => true });
    await adapter.init();
    const cfg = sdk.configs[0] as Record<string, unknown>;
    expect(cfg.sound).toBe('off');
    expect(cfg.preloadAdBreaks).toBe('auto');
  });

  it('a THROWING mute hook still brings the ad layer up, sound on', async () => {
    // `init()` throwing is swallowed by safeAdapter, which would leave the game
    // with no ad layer at all and nothing anywhere to say why.
    const sdk = liveSdk();
    const adapter = createAdsAdapter({
      ...hooks(),
      muted: () => {
        throw new Error('settings store is hostile');
      },
    });
    await expect(adapter.init()).resolves.toBeUndefined();
    expect((sdk.configs[0] as Record<string, unknown>).sound).toBe('on');
  });

  it('a THROWING unduck cannot eat the resolve \u2014 a closed AudioContext strands nobody', async () => {
    const sdk = liveSdk();
    const adapter = createAdsAdapter({
      ...hooks(),
      onBreakEnd: () => {
        throw new Error('AudioContext closed while the tab was backgrounded');
      },
    });
    await adapter.init();
    const done = adapter.requestAdBreak();
    sdk.placements[0].beforeAd?.();
    // The throw still travels on to Google's own caller — that is theirs to
    // handle — but `resolve()` sits in a `finally`, so the player leaves either
    // way instead of waiting out safeAdapter's 35 s cap for a gain node.
    try {
      sdk.placements[0].adBreakDone?.({ breakStatus: 'viewed' });
    } catch {
      /* the SDK's problem, not the player's */
    }
    await expect(done).resolves.toBeUndefined();
    expect(lastBreakStatus()).toBe('viewed');
  });

  it('a THROWING duck never escapes into Google\u2019s beforeAd', async () => {
    const sdk = liveSdk();
    const adapter = createAdsAdapter({
      ...hooks(),
      onBreakStart: () => {
        throw new Error('AudioContext closed');
      },
    });
    await adapter.init();
    const done = adapter.requestAdBreak();
    expect(() => sdk.placements[0].beforeAd?.()).not.toThrow();
    sdk.placements[0].adBreakDone?.({ breakStatus: 'viewed' });
    await expect(done).resolves.toBeUndefined();
  });

  it('leaves the other four seam methods as no-ops \u2014 no display unit, no gameplay hook', async () => {
    const sdk = liveSdk();
    const adapter = createAdsAdapter(hooks());
    await adapter.init();
    adapter.loadingProgress(0.5);
    adapter.matchStart();
    adapter.matchEnd();
    expect(sdk.placements).toHaveLength(0);
    expect(sdk.configs).toHaveLength(1);
  });
});

// --- the transient audio duck -------------------------------------------------

interface FakeParam {
  value: number;
}
interface FakeGain {
  gain: FakeParam;
  channelCount: number;
  channelCountMode: string;
  channelInterpretation: string;
  connect(t: unknown): unknown;
}

/** Minimal AudioContext: enough for `buildBuses` and nothing more. The three
 *  gains are recorded in creation order — mono, master, effects. */
function fakeAudioContext(): { Ctor: unknown; gains: FakeGain[] } {
  const gains: FakeGain[] = [];
  class Ctx {
    currentTime = 0;
    sampleRate = 48_000;
    destination = {};
    createGain(): FakeGain {
      const node: FakeGain = {
        gain: { value: 1 },
        channelCount: 2,
        channelCountMode: 'max',
        channelInterpretation: 'speakers',
        connect: (t: unknown) => t,
      };
      gains.push(node);
      return node;
    }
    resume(): Promise<void> {
      return Promise.resolve();
    }
  }
  return { Ctor: Ctx, gains };
}

describe('the ad-break audio duck', () => {
  let audio: Audio | null = null;
  let gains: FakeGain[] = [];
  const master = (): FakeParam => gains[1].gain;

  beforeEach(() => {
    const fake = fakeAudioContext();
    gains = fake.gains;
    (window as unknown as Record<string, unknown>).AudioContext = fake.Ctor;
    settings.set({ muted: false, masterVolume: 100 });
    audio = new Audio();
    audio.resume();
  });

  afterEach(() => {
    audio?.destroy();
    audio = null;
    settings.set({ muted: false, masterVolume: 100 });
  });

  it('silences the master bus for the break and restores it after', () => {
    expect(master().value).toBe(volumeGain(100));
    audio?.duck();
    expect(master().value).toBe(0);
    audio?.unduck();
    expect(master().value).toBe(volumeGain(100));
  });

  it('is idempotent in both directions', () => {
    audio?.duck();
    audio?.duck();
    expect(master().value).toBe(0);
    audio?.unduck();
    audio?.unduck();
    expect(master().value).toBe(volumeGain(100));
  });

  it('NEVER writes the settings store \u2014 so a page death mid-break strands nobody', () => {
    const before = JSON.stringify(localStorage);
    audio?.duck();
    // The tab dies here: no `afterAd`, no `unduck`, no reload hook.
    expect(settings.current.muted).toBe(false);
    expect(JSON.stringify(localStorage)).toBe(before);
  });

  it('a player who muted THEMSELVES is still muted after the break', () => {
    settings.set({ muted: true });
    expect(master().value).toBe(0);
    audio?.duck();
    audio?.unduck();
    expect(settings.current.muted).toBe(true);
    expect(master().value).toBe(0);
  });

  it('swallows an M press for the duration \u2014 an inaudible toggle must not persist', () => {
    // `M` is bound on the results screen, which is exactly where the break
    // happens. Master gain is pinned at 0, so the press has no audible effect
    // whatsoever; writing it to the store would leave the player flipped
    // afterwards with nothing having told them.
    audio?.duck();
    audio?.toggleMute();
    expect(settings.current.muted).toBe(false);
    expect(master().value).toBe(0);
    audio?.unduck();
    expect(settings.current.muted).toBe(false);
    expect(master().value).toBe(volumeGain(100));
    // and the control works again the moment the break is over
    audio?.toggleMute();
    expect(settings.current.muted).toBe(true);
    expect(master().value).toBe(0);
  });

  it('a duck that outlives a volume change still restores the LIVE value', () => {
    audio?.duck();
    settings.set({ masterVolume: 40 });
    expect(master().value).toBe(0);
    audio?.unduck();
    expect(master().value).toBe(volumeGain(40));
  });
});

// --- ordering: the page states the defaults, or ga.ts does. Never both. -------

describe('consent defaults are stated exactly once per page', () => {
  beforeEach(() => {
    __resetGaForTests();
    delete g[CONSENT_DEFAULTS_MARKER];
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST123');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    __resetGaForTests();
    delete g[CONSENT_DEFAULTS_MARKER];
  });

  const consentCommands = (): unknown[][] =>
    ((g.dataLayer as unknown as IArguments[]) ?? [])
      .map((a) => Array.from(a) as unknown[])
      .filter((a) => a[0] === 'consent');

  it('ga.ts SKIPS its defaults when the page head already stated them', () => {
    g[CONSENT_DEFAULTS_MARKER] = true;
    startGa([
      { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted' },
    ]);
    expect(consentCommands()).toHaveLength(0);
  });

  it('ga.ts STILL sends them in an ads-less build \u2014 an EEA visitor stays protected', () => {
    startGa([
      { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied', region: ['DE'] },
      { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted' },
    ]);
    const cmds = consentCommands();
    expect(cmds).toHaveLength(2);
    expect(cmds[0][1]).toBe('default');
  });
});

// --- the results-screen display unit ------------------------------------------

// THE ONE DISPLAY AD ON THE SITE (Eric ruling 2026-08-19, superseding amendment
// 16's R2). The hardest row here is NOT "does an ad render" — it is that ESC now
// TOGGLES the score screen (amendment 17), so the modal opens and closes many
// times in one match and a naive implementation would mint one impression per
// keypress. That is an auto-refreshing placement, the pattern Google suspends
// accounts over, so "exactly one push across many toggles" is pinned first and
// hardest. The second hardest is that NOTHING may appear until Google says
// `filled`: an ad-BLOCKED client is never told anything at all, and an unfilled
// slot is told `unfilled` — both must leave the screen untouched, with no empty
// bed and no layout hole.

describe('the results-screen display unit', () => {
  /** A plausible AdSense slot id. Written out here rather than derived, so the
   *  assertion is an independent statement of the shape. */
  const SLOT = '1234567890';

  function setViewport(width: number): void {
    Object.defineProperty(globalThis, 'innerWidth', { value: width, configurable: true, writable: true });
  }

  function host(): HTMLElement | null {
    return document.getElementById(RESULTS_AD_ID);
  }

  function ins(): HTMLElement | null {
    return host()?.querySelector('ins') ?? null;
  }

  function panel(): HTMLElement | null {
    return document.getElementById(RESULTS_PANEL_ID);
  }

  /** Open the REAL score screen, so the shift is asserted against the modal the
   *  player actually gets rather than against a stand-in div. */
  function openScoreScreen(): void {
    showResults(
      {
        banner: 'SUNK',
        victory: false,
        score: { boons: 0, kills: 0, sunkContestants: [], placement: 4, winner: false, matchLog: [], afloatMs: null },
        rows: null,
        ownId: 'a',
        canSpectate: true,
      },
      { onSpectate: () => undefined, onReturn: () => undefined },
    );
  }

  /** Google reports a fill. The attribute is read by `sync()`, so a second open
   *  latches it synchronously — no MutationObserver microtask to wait on. */
  function reportFilled(): void {
    ins()?.setAttribute(AD_STATUS_ATTR, 'filled');
    showResultsAd();
  }

  /** The panel's shift in px, or 0 when it is sitting dead centre. */
  function panelShift(): number {
    const t = panel()?.style.transform ?? '';
    if (t === '') return 0;
    return Number(/translateX\((-?[\d.]+)px\)/.exec(t)?.[1] ?? NaN);
  }

  /** Replace the command queue with a recorder. Non-array on purpose: that is
   *  the shape Google's own loader leaves behind once it has arrived. */
  function recorder(): unknown[] {
    const pushes: unknown[] = [];
    g.adsbygoogle = { push: (cmd: unknown) => pushes.push(cmd) };
    return pushes;
  }

  beforeEach(() => {
    __resetResultsAdForTests();
    __resetAdsForTests();
    document.body.innerHTML = '';
    vi.stubEnv('VITE_ADSENSE_CLIENT', CLIENT);
    vi.stubEnv('VITE_ADSENSE_SLOT_RESULTS', SLOT);
    setViewport(1600);
  });

  afterEach(() => {
    __resetResultsAdForTests();
    __resetAdsForTests();
    hideResults();
    vi.unstubAllEnvs();
    document.body.innerHTML = '';
  });

  // --- the build-time gate ---

  it('reads the slot id from build config, trimmed — never a literal', () => {
    vi.stubEnv('VITE_ADSENSE_SLOT_RESULTS', `  ${SLOT}  `);
    expect(adsSlotResults()).toBe(SLOT);
  });

  it('accepts a digit-string slot id and refuses anything else', () => {
    expect(isValidAdSlotId(SLOT)).toBe(true);
    for (const bad of ['', ' ', '12345', 'abcdefghij', '123456789a', 'ca-pub-8667818947296707', '12345 67890']) {
      expect(isValidAdSlotId(bad), bad).toBe(false);
    }
  });

  it('creates NOTHING with no slot id — no element, no push, no observer', () => {
    const pushes = recorder();
    vi.stubEnv('VITE_ADSENSE_SLOT_RESULTS', '');
    expect(isResultsAdConfigured()).toBe(false);
    showResultsAd();
    expect(host()).toBeNull();
    expect(pushes).toHaveLength(0);
  });

  it('creates NOTHING with no publisher id, even when a slot IS configured', () => {
    const pushes = recorder();
    vi.stubEnv('VITE_ADSENSE_CLIENT', '');
    expect(isResultsAdConfigured()).toBe(false);
    showResultsAd();
    expect(host()).toBeNull();
    expect(pushes).toHaveLength(0);
  });

  it('creates NOTHING on a MALFORMED slot id — validated, not trusted', () => {
    // A slot that does not exist is answered with silence, which from inside the
    // page is indistinguishable from a legitimately unfilled one — so a typo
    // would be invisible rather than loud.
    const pushes = recorder();
    vi.stubEnv('VITE_ADSENSE_SLOT_RESULTS', 'slot-1234567890');
    showResultsAd();
    expect(host()).toBeNull();
    expect(pushes).toHaveLength(0);
  });

  it('mounts the slot with the responsive attributes and the vendor class', () => {
    showResultsAd();
    const el = ins();
    expect(el).not.toBeNull();
    expect(el?.className).toBe(AD_INS_CLASS);
    expect(el?.getAttribute('data-ad-client')).toBe(CLIENT);
    expect(el?.getAttribute('data-ad-slot')).toBe(SLOT);
    expect(el?.getAttribute('data-ad-format')).toBe('auto');
    expect(el?.getAttribute('data-full-width-responsive')).toBe('false');
  });

  // --- ONE IMPRESSION PER MATCH ---

  it('pushes EXACTLY ONCE across many open/close toggles', () => {
    // THE RULE THIS UNIT EXISTS UNDER. ESC from spectate reopens the score
    // screen (amendment 17), so a re-push per toggle would be one ad request
    // per keypress.
    const pushes = recorder();
    showResultsAd();
    const first = host();
    for (let i = 0; i < 12; i++) {
      hideResultsAd();
      showResultsAd();
    }
    expect(pushes).toHaveLength(1);
    expect(host()).toBe(first); // the SAME node throughout — never remounted
  });

  it('hides with CSS and keeps the element — never a remove-and-remount', () => {
    showResultsAd();
    const first = host();
    hideResultsAd();
    expect(host()).toBe(first);
    expect(first?.style.display).toBe('none');
    showResultsAd();
    expect(host()?.style.display).toBe('block');
  });

  it('mints a NEW request only after a teardown — the match boundary', () => {
    const pushes = recorder();
    showResultsAd();
    destroyResultsAd();
    expect(host()).toBeNull();
    showResultsAd();
    expect(pushes).toHaveLength(2);
  });

  // --- nothing is shown until Google reports it FILLED ---

  it('BLOCKED: the attribute never arrives, so nothing is ever revealed', () => {
    // With the loader blocked our push lands in the plain Array shim and no
    // callback and no attribute ever follow. There is no timer waiting to give
    // up — the unit simply stays invisible for the whole match.
    showResultsAd();
    expect(host()?.style.visibility).toBe('hidden');
    hideResultsAd();
    showResultsAd();
    expect(host()?.style.visibility).toBe('hidden');
  });

  it('UNFILLED: an explicit no-fill leaves no empty box on screen', () => {
    showResultsAd();
    ins()?.setAttribute(AD_STATUS_ATTR, 'unfilled');
    hideResultsAd();
    showResultsAd();
    expect(host()?.style.visibility).toBe('hidden');
  });

  it('FILLED: the unit is revealed, and stays revealed across a toggle', async () => {
    showResultsAd();
    ins()?.setAttribute(AD_STATUS_ATTR, 'filled');
    // the MutationObserver delivers on a microtask
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(host()?.style.visibility).toBe('visible');
    hideResultsAd();
    showResultsAd();
    expect(host()?.style.visibility).toBe('visible');
  });

  it('a fill that lands while the modal is CLOSED is picked up at the next open', () => {
    showResultsAd();
    hideResultsAd();
    ins()?.setAttribute(AD_STATUS_ATTR, 'filled');
    showResultsAd();
    expect(host()?.style.visibility).toBe('visible');
  });

  // --- geometry: the panel and the column are centred as ONE GROUP ---

  it('derives its breakpoint from the panel width — no magic number', () => {
    // Eric ruling 2026-08-19: the panel may move over. The requirement is the
    // GROUP plus its two edge margins, not a gutter beside a dead-centre panel
    // — which is what took this from 1352 down to 1002.
    const expected = CLIENT_CONFIG.results.panelWidth + 24 + resultsAdColumnWidth() + 2 * 16;
    expect(resultsAdGroupWidth()).toBe(CLIENT_CONFIG.results.panelWidth + 24 + resultsAdColumnWidth());
    expect(resultsAdMinViewportWidth()).toBe(expected);
  });

  it('now takes in the 1024- and 1280-wide laptops the gutter rule lost', () => {
    // The whole point of the ruling: the old 1352 breakpoint earned NOTHING on
    // either of the two commonest small-laptop widths.
    expect(resultsAdMinViewportWidth()).toBeLessThanOrEqual(1024);
    expect(resultsAdFits(1024)).toBe(true);
    expect(resultsAdFits(1280)).toBe(true);
    expect(resultsAdFits(1366)).toBe(true);
    expect(resultsAdFits(resultsAdMinViewportWidth())).toBe(true);
    expect(resultsAdFits(resultsAdMinViewportWidth() - 1)).toBe(false);
    expect(resultsAdFits(960)).toBe(false);
  });

  it('centres the PAIR: equal margins at the floor viewport and at 1920', () => {
    // The composition reads as one block, so what must be symmetric about the
    // centre is the group — the panel's left edge and the column's right edge.
    for (const w of [resultsAdMinViewportWidth(), 1920]) {
      // the panel's LEFT edge and the column's RIGHT edge, in viewport px
      const panelLeft = w / 2 + resultsPanelOffsetX() - CLIENT_CONFIG.results.panelWidth / 2;
      const columnRight = w / 2 + resultsAdOffsetX() + resultsAdColumnWidth();
      expect(panelLeft, `${w}`).toBe(w - columnRight);
      expect(panelLeft, `${w}`).toBeGreaterThanOrEqual(16);
      expect(columnRight - panelLeft).toBe(resultsAdGroupWidth());
    }
  });

  it('keeps the ad immediately right of the SHIFTED panel, same gap', () => {
    showResultsAd();
    const left = host()?.style.left ?? '';
    const px = Number(/calc\(50% \+ (-?[\d.]+)px\)/.exec(left)?.[1] ?? NaN);
    expect(px).toBe(resultsAdOffsetX());
    // the gap is exactly one gap: shifted panel's right edge → column's left
    expect(px - (resultsPanelOffsetX() + CLIENT_CONFIG.results.panelWidth / 2)).toBe(24);
  });

  it('creates NOTHING at a viewport too narrow to hold the pair', () => {
    const pushes = recorder();
    setViewport(960);
    showResultsAd();
    expect(host()).toBeNull();
    expect(pushes).toHaveLength(0);
  });

  it('re-evaluates the fit on resize, in both directions', () => {
    showResultsAd();
    expect(host()?.style.display).toBe('block');
    setViewport(960);
    globalThis.dispatchEvent(new Event('resize'));
    expect(host()?.style.display).toBe('none');
    setViewport(1600);
    globalThis.dispatchEvent(new Event('resize'));
    expect(host()?.style.display).toBe('block');
  });

  // --- the panel moves ONLY for an ad that actually filled ---

  it('FILLED: the score screen slides left by half the gap-plus-column', () => {
    openScoreScreen();
    showResultsAd();
    reportFilled();
    expect(panelShift()).toBe(resultsPanelOffsetX());
    expect(panelShift()).toBeLessThan(0);
  });

  it('BLOCKED: no attribute ever arrives, so the panel never moves', () => {
    // The safety rule of the whole shift: an off-centre score screen beside
    // empty space is worse than either outcome.
    openScoreScreen();
    showResultsAd();
    expect(host()?.style.visibility).toBe('hidden');
    expect(panelShift()).toBe(0);
  });

  it('UNFILLED: an explicit no-fill leaves the panel dead centre', () => {
    openScoreScreen();
    showResultsAd();
    ins()?.setAttribute(AD_STATUS_ATTR, 'unfilled');
    showResultsAd();
    expect(panelShift()).toBe(0);
  });

  it('UNCONFIGURED: no slot id, no element — and no shift', () => {
    vi.stubEnv('VITE_ADSENSE_SLOT_RESULTS', '');
    openScoreScreen();
    showResultsAd();
    expect(host()).toBeNull();
    expect(panelShift()).toBe(0);
  });

  it('TOO NARROW: nothing mounts, so nothing moves', () => {
    setViewport(960);
    openScoreScreen();
    showResultsAd();
    expect(panelShift()).toBe(0);
  });

  it('a resize below the breakpoint puts a SHIFTED panel back to centre', () => {
    // The one path where the revert acts on a LIVE panel rather than on one the
    // modal has already destroyed.
    openScoreScreen();
    showResultsAd();
    reportFilled();
    expect(panelShift()).toBe(resultsPanelOffsetX());
    setViewport(960);
    globalThis.dispatchEvent(new Event('resize'));
    expect(panelShift()).toBe(0);
    setViewport(1600);
    globalThis.dispatchEvent(new Event('resize'));
    expect(panelShift()).toBe(resultsPanelOffsetX());
  });

  it('leaves NO stale shift after hide (SPECTATE) or after teardown', () => {
    openScoreScreen();
    showResultsAd();
    reportFilled();
    hideResultsAd();
    expect(panelShift()).toBe(0);
    // ...and the modal's own close destroys the panel, so a reopened score
    // screen starts centred and is re-shifted only because the fill still holds
    hideResults();
    openScoreScreen();
    expect(panelShift()).toBe(0);
    showResultsAd();
    expect(panelShift()).toBe(resultsPanelOffsetX());
    destroyResultsAd();
    expect(panelShift()).toBe(0);
  });

  // --- the bed ---

  it('wears the PANEL BED — tokens only, never a colour literal', () => {
    showResultsAd();
    const css = host()?.getAttribute('style') ?? '';
    expect(css).toContain('var(--hc-panel)');
    expect(css).toContain('var(--hc-hairline)');
    expect(css).toContain(`${CLIENT_CONFIG.results.panelRadius}px`);
    expect(host()?.style.position).toBe('fixed');
  });

  it('sits above the results dim (1000) and below settings (1050)', () => {
    showResultsAd();
    const z = Number(host()?.style.zIndex ?? NaN);
    expect(z).toBeGreaterThan(1000);
    expect(z).toBeLessThan(1050);
  });

  // --- NO AD SURFACE DURING LIVE PLAY ---

  it('never mounts without an explicit open — a resize alone does nothing', () => {
    globalThis.dispatchEvent(new Event('resize'));
    hideResultsAd();
    destroyResultsAd();
    expect(host()).toBeNull();
  });

  it('main.ts opens it from presentResults and NOWHERE else', () => {
    // The structural half of "no ad surface during live play": `presentResults`
    // is the ONE funnel both results openers pass through, so an opener there
    // and nowhere else means the unit cannot exist while the player is alive.
    const main = readFileSync(join(process.cwd(), 'src', 'main.ts'), 'utf8');
    expect(main.match(/showResultsAd\(\)/g)).toHaveLength(1);
    const body = /\nfunction presentResults\([^)]*\): void \{([\s\S]*?)\n\}/.exec(main)?.[1] ?? '';
    expect(body).toContain('showResultsAd()');
    // ...and SPECTATE is what takes it away (the modal's own close path).
    expect(body).toContain('hideResultsAd()');
  });
});

// --- containment --------------------------------------------------------------

describe('the vendor stays behind its seam', () => {
  const SRC = join(process.cwd(), 'src');

  function walk(dir: string, out: { path: string; body: string }[] = []): { path: string; body: string }[] {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full, out);
      else if (e.name.endsWith('.ts')) out.push({ path: full, body: readFileSync(full, 'utf8') });
    }
    return out;
  }

  const FILES = walk(SRC).filter((f) => !f.path.includes('__tests__'));

  // `client/vite.config.ts` reads the env var too and is deliberately outside
  // this scan: it is the BUILD's switch, it names no origin and no ID, and it
  // takes both from `src/ads/adsHead.ts`.
  it('only src/ads/adsense.ts names the AdSense origin or either id env var', () => {
    for (const f of FILES) {
      if (f.path.endsWith(join('ads', 'adsense.ts'))) continue;
      expect(f.body, f.path).not.toContain('googlesyndication');
      expect(f.body, f.path).not.toContain('VITE_ADSENSE_CLIENT');
      // TIGHTENED, not widened: the display unit's slot var (Eric ruling
      // 2026-08-19) is the second build-time id the ad layer reads, and it is
      // contained in exactly the same one file as the first.
      expect(f.body, f.path).not.toContain('VITE_ADSENSE_SLOT_RESULTS');
    }
  });

  it('NO source file carries the publisher id as a literal \u2014 it is build-time config', () => {
    for (const f of FILES) expect(f.body, f.path).not.toContain('8667818947296707');
  });

  it('NO game module imports the ad layer \u2014 main.ts and nothing else', () => {
    // This briefly permitted `analytics/ga.ts` too, for one string: the marker.
    // That inverted the layering (the analytics vendor module depending on the
    // ad layer, and through it on the vendor origin), and one import the other
    // way would have closed a cycle. The marker now lives in a leaf module both
    // sides import, so the exception is gone rather than documented.
    const importers = FILES.filter(
      (f) => !f.path.includes(join('src', 'ads')) && /from '\.{1,2}(\/\.\.)*\/ads\//.test(f.body),
    ).map((f) => f.path.slice(SRC.length + 1));
    expect(importers).toEqual(['main.ts']);
  });

  it('the consent marker module is a LEAF \u2014 it imports nothing at all', () => {
    const leaf = readFileSync(join(SRC, 'analytics', 'consentMarker.ts'), 'utf8');
    expect(/^\s*import\s/m.test(leaf)).toBe(false);
  });

  it('index.html carries no ad tag \u2014 the injection is build-time and gated', () => {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    expect(html).not.toContain('googlesyndication');
    expect(html).not.toContain(CONSENT_DEFAULTS_MARKER);
  });
});
