// THE PRIVACY POLICY, AS DATA (Story 7.2, Eric rulings R8-R11).
//
// FROZEN COPY once approved — the `ui/taglines.ts:7-10` treatment (R9). Every
// sentence below is a claim about what the shipped code actually does, checked
// against the code rather than drafted from a template, so an edit here is a
// factual change and not a wording change. If a behaviour moves, this file moves
// with it in the SAME change; a policy that has drifted from the code is worse
// than no policy, because it is a published false statement.
//
// THE POLICY SPEAKS AS HULLCRACKER.IO (cycle 108, ERIC RULING 2026-08-19, which
// SUPERSEDES Story 7.2's R11). The operator's personal identity - legal name,
// entity type, country of residence - is DELIBERATELY ABSENT, and the
// first-person voice went with it: no sentence below says "we", "us" or "our",
// because "we" is a reference to the operator by another name. The actor is
// Hullcracker.io, or a concrete non-personal noun where that reads better ("the
// game", "the game server", "the hosting provider"). A LATER AGENT MUST NOT
// "RESTORE" A NAMED OPERATOR as a missing disclosure - the absence IS the ruling,
// not an oversight. POLICY_CONTACT (R10) is the route for every request and is
// unchanged, as is every factual claim: this was a change of VOICE and IDENTITY
// DISCLOSURE only, never of what the policy says the code does. Section HEADINGS
// are otherwise frozen; the ONE that moved is 'WHY WE ARE ALLOWED TO DO THIS' ->
// 'WHY THIS IS ALLOWED', because a first-person heading is the same reference to
// the operator that the body text just stopped making.
//
// THE VERIFIED INVENTORY THIS IS BUILT FROM, with its sources:
//   * localStorage: `hullcracker.name` `.class` `.mode` `.color` `.horn`
//     `.settings` `.helm` `.session` `.session.handoff` `.consent`;
//     sessionStorage: `hullcracker.resume` `hullcracker.tab`.
//   * The callsign is user-entered free text, capped at 14 characters, and is
//     shown to every other player (nameplates, kill feed, results table).
//   * Google Fonts: `client/index.html` preconnects and preloads
//     fonts.googleapis.com / fonts.gstatic.com, so Google receives the visitor's
//     IP on EVERY page load, including before any consent choice exists
//     (amendment 14 — in scope to disclose, out of scope to change).
//   * `GET /liveness?c=<random per tab>` (client/src/net/liveness.ts,
//     server/src/liveness.ts): held in memory only, never persisted, expires 30s
//     after the last poll.
//   * Server logs: an ephemeral per-connection session id plus match aggregates
//     on stdout. No names, no IP addresses in Hullcracker.io's own logs. Render
//     keeps its own edge logs, outside Hullcracker.io's control.
//   * GA4: loaded at boot for everyone (Consent Mode ADVANCED, Story 7.4 —
//     `analytics/index.ts` `boot()` always calls `startGa`), first-party cookie,
//     exactly five events, `mode` the only parameter (NFR19). The GLOBAL consent
//     default grants all four v2 signals; a REGION-SCOPED default denies all
//     four across the EEA, the UK and Switzerland until Google's CMP updates it
//     (`analytics/consent.ts`, `EEA_UK_CH_REGIONS` — 32 codes).
//   * Google AdSense: the ad script loads on the game page and delivers BOTH the
//     ads and Google's certified consent dialog (it has no standalone script).
//     Exactly ONE ad surface exists — a full-screen interstitial at
//     death → RETURN TO PORT, never during play (`app/returnToPort.ts`).
//   * `hullcracker.consent` is no longer "the answer to the banner"; there is no
//     banner. It is a LOCAL ANALYTICS OVERRIDE set from the ANALYTICS row in
//     SETTINGS, and absent means "follow Google's dialog and the region defaults".
//
// WHAT STORY 7.4 CHANGED HERE AND WHY IT HAD TO: the previous text promised
// "nothing is requested from Google Analytics until you press ACCEPT" and "there
// is no advertising, no ad network". Both became FALSE the day the ad script
// shipped, and amendment 14's standing rule is that a policy which misstates
// collection is a defect rather than a wording preference. Google additionally
// REQUIRES the third-party-cookie disclosure and the Ads Settings opt-out
// pointer that now sit in ADVERTISING (support.google.com/adsense/answer/1348695).
//
// A POLICY SAYING "WE COLLECT NOTHING" WOULD BE FALSE. That is why this file is
// long enough to be honest and no longer.
//
// REGISTER: prose, in plain English. EXPERIENCE.md:53 permits sentences in page
// copy, and a privacy policy is the one surface in this game where the naval
// voice would be actively harmful — nothing here is terse, clever, or winking.
// The headings stay uppercase mono, because they are still system lines.

/** One section of the policy: a heading, prose, and optional bullets. */
export interface PolicySection {
  heading: string;
  paragraphs?: readonly string[];
  bullets?: readonly string[];
  /** Prose that must read AFTER the bullets — used where a list needs a
   *  qualification that would be wrong to state before it. */
  trailing?: readonly string[];
}

export const POLICY_TITLE = 'PRIVACY POLICY';

/** R10 — it MUST receive mail before beta. An unreachable contact address in a
 *  published policy is a defect, not a placeholder. */
export const POLICY_CONTACT = 'contact@hullcracker.io';

/** Stamped, not computed: a policy's date is the date its CONTENTS were last
 *  changed, so it must not tick with the build. */
export const POLICY_UPDATED = 'Last updated 27 August 2026';

export const POLICY_SECTIONS: readonly PolicySection[] = [
  {
    heading: 'THE SHORT VERSION',
    paragraphs: [
      'Hullcracker.io has no accounts, no sign-up and no player database. Your callsign, class '
      + 'and settings live in your own browser and are never sent to Hullcracker.io as a profile, '
      + 'and nothing about you is stored on Hullcracker.io’s servers once your match is over — '
      + 'beyond ordinary server logs, which are described below.',
      'Three things do involve other companies, and all three are set out in full below: the page '
      + 'loads its typefaces from Google Fonts, it uses Google Analytics to count how the game is '
      + 'used, and it shows advertising through Google AdSense — a full-screen ad when you return '
      + 'to port after a match, and one boxed ad beside your score screen once you have been sunk. '
      + 'Never while you are playing.',
      'If you are in the European Economic Area, the United Kingdom or Switzerland, Google shows '
      + 'you its own consent dialog and asks you there. Wherever you are, you can turn analytics '
      + 'off at any time using the ANALYTICS row in SETTINGS.',
    ],
  },
  {
    heading: 'WHO RUNS THIS',
    paragraphs: [
      'This site and the game on it are run by Hullcracker.io. For anything in this policy — '
      + 'questions, requests, complaints — write to ' + POLICY_CONTACT + '.',
    ],
  },
  {
    heading: 'WHAT STAYS ON YOUR DEVICE',
    paragraphs: [
      'The game remembers your preferences in your own browser, using local storage. This never '
      + 'travels to Hullcracker.io as a profile; it is read by the game running on your '
      + 'machine. Clearing site data for hullcracker.io removes all of it.',
    ],
    bullets: [
      'hullcracker.name — the callsign you typed',
      'hullcracker.class, hullcracker.mode, hullcracker.color, hullcracker.horn — your last ship '
      + 'class, launch mode, colour preference and horn',
      'hullcracker.settings — audio, motion, UI scale and other accessibility settings',
      'hullcracker.helm — whether you have already been shown the helm hints',
      'hullcracker.session, hullcracker.session.handoff — how the game keeps you to one match at '
      + 'a time in this browser, and hands that place over when you move to another tab',
      'hullcracker.consent — your analytics setting, if you have changed it using the '
      + 'ANALYTICS row in SETTINGS. When it is absent, Google’s own consent dialog and its '
      + 'regional defaults decide',
      'hullcracker-muted — a mute setting kept by older versions of the game, still read if your '
      + 'browser has one from before',
      'hullcracker.resume, hullcracker.tab — per-tab values that live only as long as the tab is '
      + 'open (session storage). hullcracker.resume is what lets a refresh drop you back into a '
      + 'match already in progress',
    ],
  },
  {
    heading: 'YOUR CALLSIGN IS PUBLIC',
    paragraphs: [
      'The callsign you type is free text, capped at 14 characters, and it is shown to every '
      + 'other player in your match — on nameplates, in the kill feed, and in the results table. '
      + 'Hullcracker.io does not check it, moderate it, or store it after the match.',
      'Because of that: please do not use your real name, an email address, or anything else you '
      + 'would not want strangers to read.',
    ],
  },
  {
    heading: 'TYPEFACES (GOOGLE FONTS)',
    paragraphs: [
      'The page loads the Geist typefaces from fonts.googleapis.com and fonts.gstatic.com, which '
      + 'are run by Google. That means Google receives your IP address every time you load the '
      + 'page, including before any consent dialog is shown or answered. Hullcracker.io does not '
      + 'control what Google does with that request; their handling is covered by the Google '
      + 'Privacy Policy at https://policies.google.com/privacy.',
      'This is a consequence of how the fonts are delivered rather than something the game asks '
      + 'for, and Hullcracker.io intends to serve the fonts from its own server instead, which '
      + 'would remove the request entirely.',
    ],
  },
  {
    heading: 'THE PLAYERS-ONLINE COUNTER',
    paragraphs: [
      'So the home screen can tell you whether anyone else is around, your browser asks the game '
      + 'server for the current counts every few seconds, sending a random value that identifies '
      + 'the browser tab. That value is generated fresh for each tab, is held in memory only, is never '
      + 'written to your device, and stops counting 30 seconds after your last request — the server '
      + 'clears it out as later requests come through. '
      + 'It is not linked to your callsign or to anything else about you.',
    ],
  },
  {
    heading: 'SERVER LOGS',
    paragraphs: [
      'The game server writes ordinary operational logs: a short-lived identifier for each '
      + 'connection, and aggregate facts about a match such as how many ships were in it, how long '
      + 'it ran, and which classes won. These carry no callsigns and no IP addresses, and they '
      + 'exist so Hullcracker.io can tell whether the game is working.',
      'The hosting provider, Render, keeps its own connection logs at the network edge as part of '
      + 'running the service. Those are outside Hullcracker.io’s control and are governed by '
      + 'Render’s own privacy policy.',
    ],
  },
  {
    heading: 'ANALYTICS (GOOGLE ANALYTICS)',
    paragraphs: [
      'The game uses Google Analytics (GA4) to count how it is used. The Google tag loads when '
      + 'the page loads, and what it is allowed to store depends on your consent: if you are in '
      + 'the European Economic Area, the United Kingdom or Switzerland, everything is withheld '
      + 'until you answer Google’s consent dialog, and Google reports only anonymous, '
      + 'cookie-less signals in the meantime. Everywhere else, analytics is on unless you turn it '
      + 'off — see CHANGING YOUR MIND below, which is one press on the ANALYTICS row in SETTINGS and is '
      + 'remembered in your browser.',
      'When it is allowed to, Google Analytics sets a first-party cookie that recognises your '
      + 'browser on later visits, and records your IP address as part of the request. The game '
      + 'itself reports five moments and nothing else:',
    ],
    bullets: [
      'reaching the home screen',
      'choosing a launch mode (which mode is the only detail sent — standard, or solo against AI)',
      'a match starting',
      'a match ending',
      'returning to port',
    ],
    trailing: [
      'Google Analytics also records some things on its own, without the game asking. Its script '
      + 'notes that a session started and whether this browser has been here before, and Google’s '
      + '"enhanced measurement" feature is switched on, which can additionally record how far down '
      + 'a page you scroll, clicks on links that lead off this site, file downloads, searches made '
      + 'through a site-search box, and plays of embedded video. In practice this game has no '
      + 'downloads, no site search and no embedded video, so what it realistically sees is page '
      + 'scrolling and outbound link clicks. None of it carries anything about your play.',
    ],
  },
  {
    heading: 'WHAT ANALYTICS NEVER SEES',
    paragraphs: [
      'It never receives your callsign, your colour, your kills, your placement, your damage, the '
      + 'match or room you were in, or anything else about what happened on the water. None of it '
      + 'is shared with anyone other than Google as the analytics provider. Hullcracker.io never '
      + 'sends Google anything about your match for advertising purposes — nothing about how you '
      + 'played can reach the advertising side, because Hullcracker.io never sends it in the '
      + 'first place.',
      'Google processes this data as Hullcracker.io’s provider and under its own terms; see '
      + 'https://policies.google.com/privacy. Data may be processed outside your country, including '
      + 'in the United States.',
    ],
  },
  {
    heading: 'ADVERTISING (GOOGLE ADSENSE)',
    paragraphs: [
      'The game is paid for by advertising, served by Google AdSense. There are exactly two places '
      + 'an advertisement can appear. The first is a single full-screen ad shown when you leave a '
      + 'match and return to port — whether your match ended or you chose to abandon it. The second '
      + 'is one ordinary boxed advertisement beside your score screen after you have been sunk, '
      + 'which disappears the moment you go back to watching the match and returns if you reopen '
      + 'the score screen.',
      'No advertisement is ever shown while you are playing, and there are none on the home screen, '
      + 'the how-to-play page or this page. Both places above are moments when your own match is '
      + 'already over.',
      'Google’s advertising script loads with the page, before any advertisement is shown, because '
      + 'it is also what presents Google’s consent dialog to visitors in the European Economic '
      + 'Area, the United Kingdom and Switzerland. If you are in one of those places, nothing is '
      + 'stored on your device for advertising until you answer that dialog, and any ad you see '
      + 'before then is not personalised.',
      'If you are anywhere else, no dialog is shown and advertising cookies may be used from your '
      + 'first visit, which is what makes the advertising personalised. You can opt out at any '
      + 'time using the links below; opting out does not remove the advertisement.',
      'Because that script loads with the page, Google receives your IP address on every visit to '
      + 'the game page, whether or not an advertisement is ever shown to you. Loading it also '
      + 'contacts several other Google advertising and ad-quality servers. This is the same kind '
      + 'of disclosure as the fonts described above, and it applies before you answer any dialog.',
      'Third-party vendors, including Google, use cookies to serve ads based on your prior visits '
      + 'to this website or other websites. Google’s use of advertising cookies enables it and its '
      + 'partners to serve ads to you based on your visit to this site and/or other sites on the '
      + 'Internet.',
      'You can opt out of personalised advertising by visiting Google’s Ads Settings at '
      + 'https://www.google.com/settings/ads. You can also opt out of a third-party vendor’s use of '
      + 'cookies for personalised advertising at https://www.aboutads.info/choices. Opting out does '
      + 'not remove the advertisement — it makes it non-personalised.',
      'Advertising is handled entirely by Google. Hullcracker.io never sends Google your callsign, '
      + 'your settings, or anything about what happened in your match, and receives no information '
      + 'about you back from it — only aggregate earnings figures. Google’s handling is covered by '
      + 'https://policies.google.com/technologies/ads.',
    ],
  },
  {
    heading: 'WHY THIS IS ALLOWED',
    paragraphs: [
      'Analytics and advertising cookies run on your consent, and on nothing else. In the European '
      + 'Economic Area, the United Kingdom and Switzerland that consent is collected by Google’s '
      + 'own consent dialog before anything is stored; everywhere else you may withdraw it for '
      + 'analytics at any time using the ANALYTICS row in SETTINGS, and for personalised advertising through '
      + 'Google’s Ads Settings. Refusing costs you no part of the game.',
      'Everything else described here is what it takes to run the game you asked to play: '
      + 'connecting you to a match, remembering your own preferences on your own device, showing '
      + 'how many people are online, and keeping operational logs so the service can be maintained. '
      + 'Where the law calls for a basis, that is Hullcracker.io’s legitimate interest in '
      + 'operating the game, and in the case of your saved preferences, your own request to have '
      + 'them remembered.',
    ],
  },
  {
    heading: 'HOW LONG THINGS ARE KEPT',
    paragraphs: [
      'Nothing about a player survives their match on Hullcracker.io’s servers: match state is '
      + 'discarded when the room closes, and the players-online value expires 30 seconds after '
      + 'your last request. '
      + 'Operational logs are short-lived and are kept only as long as they are useful for '
      + 'diagnosing problems. What is stored in your browser stays there until you clear it. '
      + 'Analytics data is retained by Google under the retention period set on the property, at '
      + 'most 14 months.',
    ],
  },
  {
    heading: 'CHANGING YOUR MIND',
    paragraphs: [
      'For ANALYTICS: open SETTINGS from the gear on the home screen and use the ANALYTICS row. '
      + 'Turning it off stops any further measurement immediately; turning it on starts it. Your '
      + 'choice is remembered in your browser, and it overrides whatever the default for your '
      + 'region would otherwise be.',
      'For ADVERTISING: use Google’s Ads Settings at https://www.google.com/settings/ads, or '
      + 'https://www.aboutads.info/choices. If Google showed you its consent dialog, you can '
      + 'reopen it from the privacy or consent control Google places on the page.',
      'Hullcracker.io honours the Global Privacy Control signal: a browser that sends it is '
      + 'treated as having declined analytics and advertising consent.',
      'Clearing site data for hullcracker.io also clears your analytics setting and the Google '
      + 'cookies — but it removes your saved callsign, class, colour and settings along with them, '
      + 'so the settings row is the easier route.',
      'If your browser blocks Google’s scripts itself — an extension, a content blocker, a '
      + 'tracker-blocking setting — the game keeps working normally, measures nothing, and simply '
      + 'shows no advertisement.',
    ],
  },
  {
    heading: 'CHILDREN',
    paragraphs: [
      'The game has no age gate and does not ask how old you are. It is not directed at children, '
      + 'and Hullcracker.io does not knowingly collect information from them. Since there are no '
      + 'accounts and no stored player records, there is nothing about a child for Hullcracker.io '
      + 'to hold; if you believe a child has provided information through the game, write to '
      + POLICY_CONTACT + ' and Hullcracker.io will look into it.',
    ],
  },
  {
    heading: 'YOUR RIGHTS',
    paragraphs: [
      'Depending on where you live, you may have rights to access, correct, delete or object to '
      + 'the use of personal data about you, and to withdraw consent at any time.',
      'In practice there is very little to act on: Hullcracker.io holds no accounts and no player '
      + 'records, so there is no profile to retrieve or delete. Withdrawing consent is done in '
      + 'the ANALYTICS row in SETTINGS, and in Google’s Ads Settings for personalised '
      + 'advertising, as described above. For anything else — including a request about the '
      + 'Google Analytics or Google advertising data associated with your browser — write to '
      + POLICY_CONTACT + ' and Hullcracker.io will do what it can.',
    ],
  },
  {
    heading: 'CHANGES TO THIS POLICY',
    paragraphs: [
      'If what the game collects changes, this page changes with it, and the date at the top is '
      + 'updated. Any change that widens what is collected will be reflected here before it ships.',
    ],
  },
  {
    heading: 'CONTACT',
    paragraphs: [
      'Hullcracker.io — ' + POLICY_CONTACT + '.',
    ],
  },
];
