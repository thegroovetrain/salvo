// Story 7-2's analytics layer, tested against the spec's own I/O matrix.
//
// THE LOAD-BEARING ASSERTION IN THIS FILE IS A NEGATIVE ONE: under Consent Mode
// BASIC (Eric ruling R7) nothing third-party may exist before an Accept, so
// "no script element, no dataLayer, no gtag" is the first-visit contract and
// the decline contract, not a nice-to-have.
//
// NOTHING HERE TOUCHES THE NETWORK. jsdom does not fetch external scripts
// (`resources` is left at its default), so the injected <script> is inspected as
// a DOM node and never loads; every `gtag(...)` command therefore stays parked
// in `window.dataLayer` where the assertions can read it, because the remote
// script that would normally drain the queue never arrives.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CONSENT_KEY,
  loadConsent,
  saveConsent,
  consentDefaults,
  consentRegionDefaults,
  consentUpdate,
  EEA_UK_CH_REGIONS,
} from '../analytics/consent.js';
import { GA_SCRIPT_SRC, isGaConfigured, measurementId, __resetGaForTests } from '../analytics/ga.js';
import { FUNNEL_EVENTS, __createAnalyticsForTests, type Analytics } from '../analytics/index.js';

const TEST_ID = 'G-TESTONLY000';

// --- harness ------------------------------------------------------------------

/** Every tag element this layer could have appended. */
function injectedScripts(): HTMLScriptElement[] {
  return [...document.querySelectorAll<HTMLScriptElement>('script[data-hc-analytics]')];
}

/** The dataLayer as plain arrays. Entries are `arguments` objects (Google's own
 *  snippet shape — see ga.ts), so they are widened before inspection. */
function commands(): unknown[][] {
  const dl = (globalThis as Record<string, unknown>).dataLayer as ArrayLike<unknown>[] | undefined;
  return dl ? dl.map((entry) => Array.from(entry)) : [];
}

/** Just the `gtag('event', name, params)` commands, in order. */
function events(): { name: string; params: Record<string, unknown> }[] {
  return commands()
    .filter((c) => c[0] === 'event')
    .map((c) => ({ name: c[1] as string, params: (c[2] ?? {}) as Record<string, unknown> }));
}

function eventNames(): string[] {
  return events().map((e) => e.name);
}

/** A booted seam with the env stubbed to a fake ID. */
function bootedSeam(): Analytics {
  const seam = __createAnalyticsForTests();
  seam.boot();
  return seam;
}

beforeEach(() => {
  vi.stubEnv('VITE_GA_MEASUREMENT_ID', TEST_ID);
  localStorage.clear();
  __resetGaForTests();
  for (const el of injectedScripts()) el.remove();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

// --- consent.ts: the pure half ------------------------------------------------

describe('consent persistence (hullcracker.consent)', () => {
  it('is absent on a first visit and reads as undecided', () => {
    expect(localStorage.getItem(CONSENT_KEY)).toBeNull();
    expect(loadConsent()).toBe('undecided');
  });

  it('round-trips both decisions under the hullcracker.* namespace', () => {
    saveConsent('granted');
    expect(localStorage.getItem(CONSENT_KEY)).toBe('granted');
    expect(loadConsent()).toBe('granted');
    saveConsent('denied');
    expect(loadConsent()).toBe('denied');
  });

  it('treats any value that is not one of the two exact tokens as undecided', () => {
    for (const junk of ['yes', 'true', 'GRANTED', '1', '']) {
      localStorage.setItem(CONSENT_KEY, junk);
      expect(loadConsent()).toBe('undecided');
    }
  });

  it('FAILS OPEN when storage throws — undecided, never a crash on the boot path', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    expect(() => loadConsent()).not.toThrow();
    expect(loadConsent()).toBe('undecided');
  });

  it('swallows a write throw — the choice just does not survive the reload', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    expect(() => saveConsent('granted')).not.toThrow();
  });
});

describe('Consent Mode v2 payloads', () => {
  it('sets ALL FOUR v2 signals, denied, in the global default', () => {
    const d = consentDefaults();
    expect(d).toEqual({
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
    });
    expect(d.region).toBeUndefined();
  });

  it('scopes the second default to EEA + UK + CH and nowhere else', () => {
    const r = consentRegionDefaults();
    expect(r.region).toBe(EEA_UK_CH_REGIONS);
    // EU-27 + IS/LI/NO + GB + CH
    expect(EEA_UK_CH_REGIONS).toHaveLength(32);
    for (const code of ['DE', 'FR', 'IE', 'NO', 'IS', 'LI', 'GB', 'CH']) {
      expect(EEA_UK_CH_REGIONS).toContain(code);
    }
    // no geo lookup exists, and no non-EEA/UK/CH market is scoped
    for (const code of ['US', 'CA', 'JP', 'AU', 'BR']) {
      expect(EEA_UK_CH_REGIONS).not.toContain(code);
    }
  });

  it('grants ONLY analytics_storage — the three ad signals stay denied (7.4 owns ads)', () => {
    expect(consentUpdate('granted')).toEqual({
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'granted',
    });
    expect(consentUpdate('denied').analytics_storage).toBe('denied');
  });
});

// --- ga.ts: build-time config -------------------------------------------------

describe('the measurement ID is build-time config, never a literal', () => {
  it('reads VITE_GA_MEASUREMENT_ID at call time', () => {
    expect(measurementId()).toBe(TEST_ID);
    expect(isGaConfigured()).toBe(true);
  });

  it('an unset or whitespace ID means the whole layer is not configured', () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', '');
    expect(measurementId()).toBe('');
    expect(isGaConfigured()).toBe(false);
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', '   ');
    expect(isGaConfigured()).toBe(false);
  });
});

// --- the seam: the I/O matrix -------------------------------------------------

describe('first visit, no stored consent', () => {
  it('loads NOTHING third-party — no script, no dataLayer, no gtag', () => {
    const seam = bootedSeam();
    seam.home();
    seam.modePick('standard');
    seam.matchStart();
    expect(seam.consentState()).toBe('undecided');
    expect(injectedScripts()).toHaveLength(0);
    expect((globalThis as Record<string, unknown>).dataLayer).toBeUndefined();
    expect((globalThis as Record<string, unknown>).gtag).toBeUndefined();
  });
});

describe('accept', () => {
  it('persists granted and injects the tag exactly once, however many times ACCEPT lands', () => {
    const seam = bootedSeam();
    seam.grantConsent();
    seam.grantConsent();
    seam.grantConsent();
    expect(localStorage.getItem(CONSENT_KEY)).toBe('granted');
    expect(injectedScripts()).toHaveLength(1);
    expect(injectedScripts()[0].src).toBe(`${GA_SCRIPT_SRC}?id=${TEST_ID}`);
    expect(injectedScripts()[0].async).toBe(true);
  });

  it('sends both consent defaults, then the update, then js, then config — in that order', () => {
    const seam = bootedSeam();
    seam.grantConsent();
    const verbs = commands().map((c) => `${c[0]}${c[1] === 'default' || c[1] === 'update' ? `:${c[1]}` : ''}`);
    expect(verbs.slice(0, 5)).toEqual(['consent:default', 'consent:default', 'consent:update', 'js', 'config']);
    const defaults = commands().filter((c) => c[0] === 'consent' && c[1] === 'default');
    expect((defaults[0][2] as Record<string, unknown>).region).toBeUndefined();
    expect((defaults[1][2] as Record<string, unknown>).region).toBe(EEA_UK_CH_REGIONS);
    expect(commands().find((c) => c[0] === 'consent' && c[1] === 'update')?.[2]).toEqual(consentUpdate('granted'));
  });

  it('configures the property with page_view and google signals OFF (NFR19: five events, nothing else)', () => {
    const seam = bootedSeam();
    seam.grantConsent();
    const config = commands().find((c) => c[0] === 'config');
    expect(config?.[1]).toBe(TEST_ID);
    expect(config?.[2]).toEqual({ send_page_view: false, allow_google_signals: false });
  });
});

describe('decline', () => {
  it('persists denied and never injects anything, then or later', () => {
    const seam = bootedSeam();
    seam.denyConsent();
    seam.home();
    seam.modePick('soloVsAi');
    seam.matchStart();
    seam.matchEnd();
    seam.requeue();
    expect(localStorage.getItem(CONSENT_KEY)).toBe('denied');
    expect(injectedScripts()).toHaveLength(0);
    expect((globalThis as Record<string, unknown>).dataLayer).toBeUndefined();
  });
});

describe('return visits', () => {
  it('granted: initialises on boot with no bar decision needed', () => {
    localStorage.setItem(CONSENT_KEY, 'granted');
    const seam = bootedSeam();
    expect(seam.consentState()).toBe('granted');
    expect(injectedScripts()).toHaveLength(1);
    seam.home();
    expect(eventNames()).toEqual(['home']);
  });

  it('denied: nothing loads, ever', () => {
    localStorage.setItem(CONSENT_KEY, 'denied');
    const seam = bootedSeam();
    expect(seam.consentState()).toBe('denied');
    seam.home();
    seam.matchStart();
    expect(injectedScripts()).toHaveLength(0);
  });

  it('boot() is idempotent — a second call cannot re-inject', () => {
    localStorage.setItem(CONSENT_KEY, 'granted');
    const seam = bootedSeam();
    seam.boot();
    seam.boot();
    expect(injectedScripts()).toHaveLength(1);
  });
});

describe('localStorage unavailable (private mode / hostile shim)', () => {
  it('reads as undecided, nothing throws, and the bar logic still gets an answer', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const seam = __createAnalyticsForTests();
    expect(() => seam.boot()).not.toThrow();
    expect(seam.consentState()).toBe('undecided');
    expect(injectedScripts()).toHaveLength(0);
    // an in-session accept still works; it simply will not survive the reload
    expect(() => seam.grantConsent()).not.toThrow();
    expect(injectedScripts()).toHaveLength(1);
  });
});

describe('no measurement ID configured (a fork, or a local build with no .env)', () => {
  it('is wholly inert — accept records the choice but loads nothing', () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', '');
    const seam = bootedSeam();
    seam.home();
    seam.grantConsent();
    seam.modePick('standard');
    seam.matchStart();
    seam.matchEnd();
    seam.requeue();
    expect(localStorage.getItem(CONSENT_KEY)).toBe('granted');
    expect(injectedScripts()).toHaveLength(0);
    expect((globalThis as Record<string, unknown>).dataLayer).toBeUndefined();
  });

  it('does not accumulate a queue it can never flush', () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', '');
    const seam = bootedSeam();
    for (let i = 0; i < 500; i++) seam.home();
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', TEST_ID);
    seam.grantConsent();
    expect(eventNames()).toEqual([]);
  });
});

describe('queue-then-flush across the undecided window', () => {
  it('flushes queued events, in order, when consent is granted', () => {
    const seam = bootedSeam();
    seam.home();
    seam.modePick('soloVsAi');
    expect(injectedScripts()).toHaveLength(0);
    seam.grantConsent();
    expect(eventNames()).toEqual(['home', 'mode_pick']);
    expect(events()[1].params).toEqual({ mode: 'soloVsAi' });
  });

  it('DISCARDS the queue on decline — a queued event is not a deferred consent', () => {
    const seam = bootedSeam();
    seam.home();
    seam.modePick('standard');
    seam.denyConsent();
    expect(injectedScripts()).toHaveLength(0);
    // even if a later grant somehow arrives, the declined events are gone
    seam.grantConsent();
    expect(eventNames()).toEqual([]);
  });

  it('is bounded, and past the cap it drops the NEWEST so the funnel keeps its head', () => {
    // Reversed at the review gate. Drop-oldest evicted `home` — the first event
    // queued and the whole reason the queue exists — so a player who cycled mode
    // picks before answering would have flushed a funnel with no beginning. A
    // funnel reads forwards; the earliest events are the ones worth keeping.
    const seam = bootedSeam();
    seam.home();
    for (let i = 0; i < 40; i++) seam.matchStart();
    seam.grantConsent();
    const names = eventNames();
    expect(names.length).toBeLessThanOrEqual(8);
    expect(names[0]).toBe('home'); // the head survives
  });
});

describe('the funnel is exactly five events, and `mode` is the only parameter', () => {
  it('names the five and nothing else', () => {
    expect(Object.values(FUNNEL_EVENTS)).toEqual([
      'home',
      'mode_pick',
      'match_start',
      'match_end',
      'requeue',
    ]);
  });

  it('sends them in journey order with no PII and no gameplay state', () => {
    localStorage.setItem(CONSENT_KEY, 'granted');
    const seam = bootedSeam();
    seam.home();
    seam.modePick('standard');
    seam.matchStart();
    seam.matchEnd();
    seam.requeue();
    expect(eventNames()).toEqual(['home', 'mode_pick', 'match_start', 'match_end', 'requeue']);
    const [home, modePick, matchStart, matchEnd] = events();
    expect(home.params).toEqual({});
    expect(modePick.params).toEqual({ mode: 'standard' });
    expect(matchStart.params).toEqual({});
    expect(matchEnd.params).toEqual({});
  });

  it('carries NO key other than `mode`, anywhere — literally, with no exception', () => {
    // This used to allow `transport_type` as a second key and call it a
    // directive rather than payload. The review gate was right that a documented
    // exception to NFR19 is worse than not needing one: gtag.js takes the
    // transport on `config`, so every parameter bag is now empty except
    // `mode_pick`'s. See the config assertion in the beacon suite below.
    localStorage.setItem(CONSENT_KEY, 'granted');
    Object.defineProperty(navigator, 'sendBeacon', { value: () => true, configurable: true });
    const seam = bootedSeam();
    seam.home();
    seam.modePick('soloVsAi');
    seam.matchStart();
    seam.matchEnd();
    seam.requeue();
    const keys = new Set(events().flatMap((e) => Object.keys(e.params)));
    expect([...keys]).toEqual(['mode']);
    Reflect.deleteProperty(navigator, 'sendBeacon');
  });
});

describe('requeue must outlive the reload', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'sendBeacon');
  });

  it('asks for beacon transport ON THE CONFIG, so every hit gets it', () => {
    Object.defineProperty(navigator, 'sendBeacon', { value: () => true, configurable: true });
    localStorage.setItem(CONSENT_KEY, 'granted');
    const seam = bootedSeam();
    seam.requeue();
    const config = commands().find((c) => c[0] === 'config');
    expect((config?.[2] as Record<string, unknown>).transport_type).toBe('beacon');
    // …and the event itself stays empty, which is what NFR19 asks for.
    expect(events()).toEqual([{ name: 'requeue', params: {} }]);
  });

  it('still sends — and never throws — on a browser with no sendBeacon (jsdom has none)', () => {
    expect(typeof navigator.sendBeacon).toBe('undefined');
    localStorage.setItem(CONSENT_KEY, 'granted');
    const seam = bootedSeam();
    expect(() => seam.requeue()).not.toThrow();
    expect(events()).toEqual([{ name: 'requeue', params: {} }]);
    const config = commands().find((c) => c[0] === 'config');
    expect((config?.[2] as Record<string, unknown>).transport_type).toBeUndefined();
  });

  it('a queued requeue still gets beacon transport when it is flushed', () => {
    // The transport now rides the config that `activate()` sends BEFORE draining
    // the queue, so a pre-consent requeue is covered by construction rather than
    // by carrying the directive around with it.
    Object.defineProperty(navigator, 'sendBeacon', { value: () => true, configurable: true });
    const seam = bootedSeam();
    seam.requeue();
    seam.grantConsent();
    const config = commands().find((c) => c[0] === 'config');
    expect((config?.[2] as Record<string, unknown>).transport_type).toBe('beacon');
    expect(events()[0]).toEqual({ name: 'requeue', params: {} });
  });
});

describe('nothing in the analytics graph may reach the game', () => {
  it('survives a document with no head to append to', () => {
    const spy = vi.spyOn(document.head, 'appendChild').mockImplementation(() => {
      throw new Error('CSP / detached document');
    });
    const seam = bootedSeam();
    expect(() => seam.grantConsent()).not.toThrow();
    expect(() => seam.home()).not.toThrow();
    spy.mockRestore();
  });

  it('survives a hostile gtag that throws on every command', () => {
    localStorage.setItem(CONSENT_KEY, 'granted');
    const seam = bootedSeam();
    (globalThis as Record<string, unknown>).gtag = () => {
      throw new Error('vendor blew up');
    };
    expect(() => seam.home()).not.toThrow();
    expect(() => seam.requeue()).not.toThrow();
  });

  it('every method returns undefined — the seam is fire-and-forget, never awaited', () => {
    const seam = bootedSeam();
    expect(seam.boot()).toBeUndefined();
    expect(seam.home()).toBeUndefined();
    expect(seam.modePick('standard')).toBeUndefined();
    expect(seam.matchStart()).toBeUndefined();
    expect(seam.matchEnd()).toBeUndefined();
    expect(seam.requeue()).toBeUndefined();
    expect(seam.grantConsent()).toBeUndefined();
    expect(seam.denyConsent()).toBeUndefined();
  });
});

// --- THE SHIPPED PAGE ITSELF (Story 7.2, Eric ruling R7) --------------------
//
// Every other test in this file proves the RUNTIME contract. This one proves
// the STATIC one, and it is the cheaper half to break: the whole "nothing loads
// until Accept" posture is undone the moment somebody pastes Google's stock
// snippet into the head, and no runtime assertion here would notice. Read off
// disk, in the style foghorn/projectiles/resumeWiring already use for main.ts.
describe('EVERY shipped page carries no third-party script (Consent Mode BASIC)', () => {
  // BOTH entries, not just the game's (review gate). The guard originally read
  // `index.html` alone, which left `privacy/index.html` — the NEWER, less-watched
  // page, and the natural place somebody would paste a CMP snippet — outside the
  // net. A leak there would be on the one page whose whole job is to say there
  // isn't one.
  const PAGES = ['index.html', 'privacy/index.html'] as const;
  const pageHtml = (rel: string): string => readFileSync(join(process.cwd(), rel), 'utf8');
  const indexHtml = (): string => pageHtml('index.html');

  it('has exactly one script element, and it is our own module entry', () => {
    const tags = indexHtml().match(/<script\b[^>]*>/g) ?? [];
    expect(tags).toHaveLength(1);
    expect(tags[0]).toContain('src="/src/main.ts"');
  });

  it('names no analytics or tag-manager origin anywhere, on either page', () => {
    for (const page of PAGES) {
      const html = pageHtml(page);
      for (const host of ['googletagmanager.com', 'google-analytics.com', 'gtag/js', 'dataLayer']) {
        expect(html, `${page} names ${host}`).not.toContain(host);
      }
    }
  });

  it('the privacy page has exactly one script element, and it is its own entry', () => {
    const tags = pageHtml('privacy/index.html').match(/<script\b[^>]*>/g) ?? [];
    expect(tags).toHaveLength(1);
    expect(tags[0]).toContain('/src/privacy/main.ts');
  });

  it('the ONLY third-party origins EITHER page may name are the font CDN', () => {
    // Pre-existing and disclosed in the privacy policy rather than removed —
    // Google Fonts receives every visitor's IP on page load, which is exactly
    // why the policy names it. A NEW third-party origin appearing here should
    // fail this test and force the same disclosure decision.
    for (const page of PAGES) {
      const origins = pageHtml(page).match(/https:\/\/[a-z0-9.-]+/g) ?? [];
      const hosts = [...new Set(origins.map((o) => o.replace('https://', '')))];
      expect(hosts.sort(), page).toEqual(['fonts.googleapis.com', 'fonts.gstatic.com']);
    }
  });
});
