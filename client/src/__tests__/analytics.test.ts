// Story 7-2's analytics layer, tested against the spec's own I/O matrix — moved
// to Consent Mode ADVANCED by Story 7-4 (Eric rulings 2026-08-19).
//
// THE LOAD-BEARING ASSERTION MOVED, AND THAT MOVE IS THE STORY. Under BASIC the
// contract was a NEGATIVE one — "no script element, no dataLayer, no gtag before
// an Accept" — because a self-built card gated the tag. 7-4 deleted that card
// and adopted Google's own certified CMP, which has no standalone script and is
// delivered BY the ad script, so the tag now loads for everyone and the player's
// decision travels as consent SIGNALS instead. The contract is therefore now:
// the GLOBAL default grants, the REGION-SCOPED EEA/UK/CH default denies, and an
// update is sent ONLY when a real decision exists. Every test that asserted the
// old negative is retired below, each with the ruling that retired it.
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
  gpcDenied,
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
  it('sets ALL FOUR v2 signals, GRANTED, in the global default', () => {
    // INVERTED BY STORY 7.4. It used to assert all four DENIED, which was right
    // under Basic mode where the tag only ever existed after a grant. Under
    // Advanced the global default governs every visitor Google's CMP never asks
    // — Eric ruled that outside the EEA/UK/CH no dialog appears and analytics
    // simply runs — so a denied global default would mean "measure nobody,
    // anywhere, forever". The EEA is protected by the region default below.
    const d = consentDefaults();
    expect(d).toEqual({
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
      analytics_storage: 'granted',
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

  it('the region default STILL denies all four — it is what protects the EEA now', () => {
    // 7.2 shipped this inert and said so; 7.4 makes it the only thing standing
    // between an EEA visitor and a granted global default until the CMP updates.
    const r = consentRegionDefaults();
    expect(r.ad_storage).toBe('denied');
    expect(r.ad_user_data).toBe('denied');
    expect(r.ad_personalization).toBe('denied');
    expect(r.analytics_storage).toBe('denied');
  });

  it('the local override NAMES ONLY analytics_storage — it may not touch an ad signal', () => {
    // REPLACES 7.2's "the three ad signals stay denied even on accept". They are
    // not ours to write any more: Google's CMP asks for them and issues its own
    // update, and a `consent update` leaves every signal it OMITS alone. Writing
    // 'denied' here would stamp on a consent the player gave Google's dialog;
    // writing 'granted' would forge one they never gave. Absence is the point,
    // so this asserts the exact key set rather than three denied values.
    expect(Object.keys(consentUpdate('granted'))).toEqual(['analytics_storage']);
    expect(consentUpdate('granted')).toEqual({ analytics_storage: 'granted' });
    expect(consentUpdate('denied')).toEqual({ analytics_storage: 'denied' });
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

describe('first visit, no stored local override', () => {
  // RETIRED BY STORY 7.4: "loads NOTHING third-party — no script, no dataLayer,
  // no gtag". That was Consent Mode BASIC's whole posture, and BASIC is gone —
  // Google's CMP is delivered by the ad script, so the tag cannot sit behind a
  // gate of ours. The assertion is INVERTED rather than weakened: the tag is
  // built at boot, and what protects an EEA visitor is the region-scoped default
  // in the dataLayer, not the script's absence.
  it('builds the tag at boot and sends NO update — the defaults alone govern', () => {
    const seam = bootedSeam();
    expect(seam.consentState()).toBe('undecided');
    expect(injectedScripts()).toHaveLength(1);
    const verbs = commands().map((c) => `${c[0]}${c[0] === 'consent' ? `:${c[1]}` : ''}`);
    expect(verbs).toEqual(['consent:default', 'consent:default', 'js', 'config']);
    // An update here would OVERRIDE the EEA/UK/CH denial before the CMP asked.
    expect(commands().some((c) => c[0] === 'consent' && c[1] === 'update')).toBe(false);
  });

  it('dispatches the funnel — under Advanced, no local override means measured', () => {
    const seam = bootedSeam();
    seam.home();
    seam.modePick('standard');
    seam.matchStart();
    expect(eventNames()).toEqual(['home', 'mode_pick', 'match_start']);
  });
});

describe('boot', () => {
  it('injects the tag exactly once, however many times boot lands', () => {
    const seam = bootedSeam();
    seam.boot();
    seam.grantConsent();
    seam.grantConsent();
    expect(injectedScripts()).toHaveLength(1);
    expect(injectedScripts()[0].src).toBe(`${GA_SCRIPT_SRC}?id=${TEST_ID}`);
    expect(injectedScripts()[0].async).toBe(true);
  });

  it('sends the EEA/UK/CH default, then the global default, then js, then config', () => {
    // The `consent:update` that used to sit between the defaults and `js` is
    // RETIRED (Story 7.4) — see the first-visit block above for why.
    //
    // REGION FIRST, matching `ads/adsHead.ts`'s injected block exactly (review
    // gate). Google resolves a `default` by SPECIFICITY, so either order works —
    // but these are two statements of ONE contract, and two that disagree are
    // how a later reader concludes one of them is wrong.
    bootedSeam();
    const verbs = commands().map((c) => `${c[0]}${c[0] === 'consent' ? `:${c[1]}` : ''}`);
    expect(verbs.slice(0, 4)).toEqual(['consent:default', 'consent:default', 'js', 'config']);
    const defaults = commands().filter((c) => c[0] === 'consent' && c[1] === 'default');
    expect((defaults[0][2] as Record<string, unknown>).region).toBe(EEA_UK_CH_REGIONS);
    expect((defaults[1][2] as Record<string, unknown>).region).toBeUndefined();
  });

  it('configures the property with page_view and google signals OFF (NFR19: five events, nothing else)', () => {
    bootedSeam();
    const config = commands().find((c) => c[0] === 'config');
    expect(config?.[1]).toBe(TEST_ID);
    expect(config?.[2]).toEqual({ send_page_view: false, allow_google_signals: false });
  });
});

describe('the settings ANALYTICS row', () => {
  it('ON persists granted and sends a granting update naming only analytics_storage', () => {
    const seam = bootedSeam();
    seam.grantConsent();
    expect(localStorage.getItem(CONSENT_KEY)).toBe('granted');
    const updates = commands().filter((c) => c[0] === 'consent' && c[1] === 'update');
    expect(updates).toHaveLength(1);
    expect(updates[0][2]).toEqual({ analytics_storage: 'granted' });
  });

  it('OFF persists denied, sends a denying update, and stops dispatching', () => {
    // RETIRED BY STORY 7.4: "persists denied and never injects anything". The
    // tag is already up by the time this row can be pressed, so a denial is a
    // consent SIGNAL, not a withheld script. What still holds — and is what the
    // player asked for — is that no further funnel event leaves.
    const seam = bootedSeam();
    seam.denyConsent();
    seam.home();
    seam.modePick('soloVsAi');
    seam.matchStart();
    seam.matchEnd();
    seam.requeue();
    expect(localStorage.getItem(CONSENT_KEY)).toBe('denied');
    const updates = commands().filter((c) => c[0] === 'consent' && c[1] === 'update');
    expect(updates).toHaveLength(1);
    expect(updates[0][2]).toEqual({ analytics_storage: 'denied' });
    expect(eventNames()).toEqual([]);
  });

  it('never names an ad signal in either direction — those are the CMP\'s', () => {
    const seam = bootedSeam();
    seam.grantConsent();
    seam.denyConsent();
    for (const c of commands().filter((x) => x[0] === 'consent' && x[1] === 'update')) {
      expect(Object.keys(c[2] as Record<string, unknown>)).toEqual(['analytics_storage']);
    }
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

  it('granted: RE-ASSERTS the stored grant on every fresh boot', () => {
    // Every RETURN TO PORT ends in a `location.reload()`, so this is the common
    // path, not an edge case. Only the DENIAL used to be re-sent, which meant a
    // player who turned ANALYTICS ON got it for one page life and then silently
    // reverted to the region default forever — with the settings row still
    // reading ON, and the privacy policy still saying the stored choice
    // overrides the region default.
    localStorage.setItem(CONSENT_KEY, 'granted');
    bootedSeam();
    const verbs = commands().map((c) => `${c[0]}${c[0] === 'consent' ? `:${c[1]}` : ''}`);
    expect(verbs).toEqual(['consent:default', 'consent:default', 'js', 'config', 'consent:update']);
    expect(commands().at(-1)?.[2]).toEqual({ analytics_storage: 'granted' });
  });

  it('undecided: NO update at boot \u2014 the defaults and the CMP govern', () => {
    localStorage.removeItem(CONSENT_KEY);
    bootedSeam();
    expect(commands().some((c) => c[0] === 'consent' && c[1] === 'update')).toBe(false);
  });

  it('denied: the tag loads, a denying update follows it, and nothing dispatches', () => {
    // RETIRED BY STORY 7.4: "denied: nothing loads, ever". The stored record is
    // a LOCAL ANALYTICS OVERRIDE now, not a gate on the script — and the update
    // must land AFTER activation, because an update is only meaningful once the
    // defaults are in the dataLayer ahead of it.
    localStorage.setItem(CONSENT_KEY, 'denied');
    const seam = bootedSeam();
    expect(seam.consentState()).toBe('denied');
    seam.home();
    seam.matchStart();
    expect(injectedScripts()).toHaveLength(1);
    const verbs = commands().map((c) => `${c[0]}${c[0] === 'consent' ? `:${c[1]}` : ''}`);
    expect(verbs).toEqual(['consent:default', 'consent:default', 'js', 'config', 'consent:update']);
    expect(commands().at(-1)?.[2]).toEqual({ analytics_storage: 'denied' });
    expect(eventNames()).toEqual([]);
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
  it('reads as undecided, nothing throws, and the settings row still gets an answer', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const seam = __createAnalyticsForTests();
    expect(() => seam.boot()).not.toThrow();
    expect(seam.consentState()).toBe('undecided');
    // The tag builds regardless — a blocked store means no LOCAL override, and
    // the region defaults are what protect the EEA either way (Story 7.4).
    expect(injectedScripts()).toHaveLength(1);
    // an in-session opt-out still works; it simply will not survive the reload
    expect(() => seam.denyConsent()).not.toThrow();
    expect(seam.consentState()).toBe('denied');
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

  it('accumulates nothing, so an ID appearing later replays no backlog', () => {
    // Was "does not accumulate a queue it can never flush" — the queue is gone
    // (Story 7.4), so this now pins the stronger property: events sent while the
    // build was inert are simply lost, and a configured build starts clean.
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', '');
    const seam = bootedSeam();
    for (let i = 0; i < 500; i++) seam.home();
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', TEST_ID);
    seam.grantConsent();
    expect(eventNames()).toEqual([]);
  });
});

// THE PRE-CONSENT QUEUE SUITE IS RETIRED (Story 7.4, Eric rulings 2026-08-19).
//
// Three tests went with it — flush-on-grant, discard-on-decline, and the
// drop-newest cap — because the queue itself is deleted, not adapted. It existed
// solely to survive the undecided window Consent Mode BASIC created between
// `home` firing and an Accept arriving, and Advanced mode has no such window:
// the tag is built at boot, and `dataLayer` buffers every command until the
// remote script drains it. What the queue guaranteed — that `home` is never lost
// — is now guaranteed by construction, and is covered by the first-visit block
// above ("dispatches the funnel"). Retired rather than kept green against a
// mechanism that no longer exists.
describe('there is no pre-consent queue left to fill', () => {
  it('emits straight through from the first call, with no flush step', () => {
    const seam = bootedSeam();
    seam.home();
    expect(eventNames()).toEqual(['home']);
    seam.modePick('soloVsAi');
    expect(eventNames()).toEqual(['home', 'mode_pick']);
    expect(events()[1].params).toEqual({ mode: 'soloVsAi' });
  });

  it('is unbounded by construction — a cap that can never bind is not kept', () => {
    // The old suite proved a 8-event cap dropped the newest. Nothing is held any
    // more, so the honest replacement is that nothing is dropped either.
    const seam = bootedSeam();
    seam.home();
    for (let i = 0; i < 40; i++) seam.matchStart();
    expect(eventNames()).toHaveLength(41);
    expect(eventNames()[0]).toBe('home');
  });

  it('a local opt-out stops the stream from that moment, and does not rewrite the past', () => {
    const seam = bootedSeam();
    seam.home();
    seam.modePick('standard');
    seam.denyConsent();
    seam.matchStart();
    // Already-sent events are gone to Google; the denial governs what follows.
    expect(eventNames()).toEqual(['home', 'mode_pick']);
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

  it('a requeue from a player with no local override still gets beacon transport', () => {
    // Was "a queued requeue still gets beacon transport when it is flushed".
    // There is no queue and no flush since Story 7.4 — the transport rides the
    // config `activate()` sends at BOOT, so every hit is covered from the first
    // one, whatever the player's override says later.
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

// --- THE SOURCE PAGES THEMSELVES (Story 7.2, Eric ruling R7) ----------------
//
// Every other test in this file proves the RUNTIME contract. This one proves
// the STATIC one, and it is the cheaper half to break: no runtime assertion here
// would notice somebody pasting a vendor's stock snippet into a page head.
// Read off disk, in the style foghorn/projectiles/resumeWiring use for main.ts.
//
// WHAT IT MEANS AFTER STORY 7.4, WHICH IS NOT WHAT IT MEANT BEFORE. Under Basic
// mode it enforced "nothing loads until Accept". That posture is retired, and
// this guard is NOT: it now enforces that every third-party origin on a shipped
// page arrives through a REVIEWED PATH — a module that owns its vendor, or a
// build step that only fires when configured — rather than by being typed into
// source HTML where an unconfigured fork would inherit it too. A NEW origin
// appearing here should still fail, and still force a disclosure decision.
describe('EVERY source page carries no third-party script', () => {
  // EVERY entry, not just the game's (review gate). The guard originally read
  // `index.html` alone, which left `privacy/index.html` — the NEWER, less-watched
  // page, and the natural place somebody would paste a CMP snippet — outside the
  // net. A leak there would be on the one page whose whole job is to say there
  // isn't one.
  //
  // STORY 7.3 MADE THIS A TABLE rather than a third hand-written pair of tests.
  // The one-script assertion was written out per page, so the page most likely
  // to be forgotten was the newest one — exactly the failure this guard exists
  // to prevent. Adding a static page now means adding ONE row here, and every
  // assertion in the block covers it.
  const PAGES = [
    { rel: 'index.html', entry: 'src="/src/main.ts"' },
    { rel: 'privacy/index.html', entry: '/src/privacy/main.ts' },
    { rel: 'how-to-play/index.html', entry: '/src/how-to-play/main.ts' },
  ] as const;
  const pageHtml = (rel: string): string => readFileSync(join(process.cwd(), rel), 'utf8');

  it('every page has exactly one script element, and it is its own module entry', () => {
    for (const { rel, entry } of PAGES) {
      const tags = pageHtml(rel).match(/<script\b[^>]*>/g) ?? [];
      expect(tags, rel).toHaveLength(1);
      expect(tags[0], rel).toContain(entry);
    }
  });

  it('names no analytics or tag-manager origin anywhere, on any page', () => {
    for (const { rel } of PAGES) {
      const html = pageHtml(rel);
      for (const host of ['googletagmanager.com', 'google-analytics.com', 'gtag/js', 'dataLayer']) {
        expect(html, `${rel} names ${host}`).not.toContain(host);
      }
    }
  });

  it('the ONLY third-party origins ANY page may name are the font CDN', () => {
    // Pre-existing and disclosed in the privacy policy rather than removed —
    // Google Fonts receives every visitor's IP on page load, which is exactly
    // why the policy names it. A NEW third-party origin appearing here should
    // fail this test and force the same disclosure decision.
    for (const { rel } of PAGES) {
      const origins = pageHtml(rel).match(/https:\/\/[a-z0-9.-]+/g) ?? [];
      const hosts = [...new Set(origins.map((o) => o.replace('https://', '')))];
      expect(hosts.sort(), rel).toEqual(['fonts.googleapis.com', 'fonts.gstatic.com']);
    }
  });
});

// --- Global Privacy Control ---------------------------------------------------
//
// Eric ruling 2026-08-27 (epic-7 amendment 45), closing the legally-shaped
// Story 7.2 ledger entry: `navigator.globalPrivacyControl === true` is read as a
// PRE-EMPTIVE DENIAL — before and regardless of any grant, whether that grant is
// stored from a previous session or arrives later from Google's CMP.
//
// The two halves pinned here are (a) a GPC browser is never measured by this
// seam and never sees a granted signal leave it, and (b) a GPC-absent browser is
// BYTE-IDENTICAL to before the ruling, which is what every other block in this
// file is already asserting.

/** Stub the browser signal. `undefined` REMOVES it, which is the shipped reality
 *  for every browser that does not send GPC — the property is absent, not
 *  `false`. */
function setGpc(value: unknown): void {
  const nav = navigator as unknown as Record<string, unknown>;
  if (value === undefined) delete nav.globalPrivacyControl;
  else Object.defineProperty(nav, 'globalPrivacyControl', { value, configurable: true });
}

const ALL_DENIED = {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
} as const;

describe('Global Privacy Control (Eric ruling 2026-08-27)', () => {
  afterEach(() => setGpc(undefined));

  it('is absent by default, and everything above this block therefore holds', () => {
    expect(gpcDenied()).toBe(false);
    saveConsent('granted');
    expect(loadConsent()).toBe('granted');
    expect(consentDefaults()).toEqual({
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
      analytics_storage: 'granted',
    });
    expect(consentUpdate('granted')).toEqual({ analytics_storage: 'granted' });
  });

  it('reads ONLY the literal `true` — a truthy shim value is not a signal', () => {
    for (const junk of ['true', 1, {}, 'yes']) {
      setGpc(junk);
      expect(gpcDenied(), String(junk)).toBe(false);
    }
    setGpc(true);
    expect(gpcDenied()).toBe(true);
  });

  it('outranks a STORED grant — and leaves the stored record untouched', () => {
    saveConsent('granted');
    setGpc(true);
    expect(loadConsent()).toBe('denied');
    // Not persisted over: turning the browser signal off gives the player back
    // the decision they actually made.
    expect(localStorage.getItem(CONSENT_KEY)).toBe('granted');
    setGpc(undefined);
    expect(loadConsent()).toBe('granted');
  });

  it('turns the global default over, and names all four signals in the update', () => {
    setGpc(true);
    expect(consentDefaults()).toEqual(ALL_DENIED);
    // The 7.4 "never names an ad signal" rule is about this row forging a
    // consent or stamping on one the player gave Google's dialog. A denial the
    // player configured at their own browser is neither — and the ad signals are
    // what a "do not sell or share" signal is actually about. The update leg is
    // also the ONLY one that lands on an ads-configured build, where the
    // defaults are written into the page head at build time.
    expect(consentUpdate('granted')).toEqual(ALL_DENIED);
  });

  it('boots denied: a denying update rides the boot and no funnel event leaves', () => {
    setGpc(true);
    const seam = bootedSeam();
    expect(seam.consentState()).toBe('denied');
    const updates = commands().filter((c) => c[0] === 'consent' && c[1] === 'update');
    expect(updates).toHaveLength(1);
    expect(updates[0][2]).toEqual(ALL_DENIED);
    seam.home();
    seam.modePick('standard');
    seam.matchStart();
    expect(eventNames()).toEqual([]);
  });

  it('a settings grant cannot lift it — the press persists but never measures', () => {
    setGpc(true);
    const seam = bootedSeam();
    seam.grantConsent();
    seam.home();
    seam.matchStart();
    expect(seam.consentState()).toBe('denied');
    expect(eventNames()).toEqual([]);
    // The player's press IS recorded — it governs again the moment GPC is off.
    expect(localStorage.getItem(CONSENT_KEY)).toBe('granted');
    for (const c of commands().filter((x) => x[0] === 'consent' && x[1] === 'update')) {
      expect((c[2] as Record<string, unknown>).analytics_storage).toBe('denied');
    }
  });
});
