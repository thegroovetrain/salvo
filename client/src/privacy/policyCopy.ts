// THE PRIVACY POLICY, AS DATA (Story 7.2, Eric rulings R8-R11).
//
// FROZEN COPY once approved — the `ui/taglines.ts:7-10` treatment (R9). Every
// sentence below is a claim about what the shipped code actually does, checked
// against the code rather than drafted from a template, so an edit here is a
// factual change and not a wording change. If a behaviour moves, this file moves
// with it in the SAME change; a policy that has drifted from the code is worse
// than no policy, because it is a published false statement.
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
//     on stdout. No names, no IP addresses in our own logs. Render keeps its own
//     edge logs, outside our control.
//   * GA4: loaded ONLY after Accept (Consent Mode BASIC, R7), first-party
//     cookie, exactly five events, `mode` the only parameter (NFR19).
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
}

export const POLICY_TITLE = 'PRIVACY POLICY';

/** R10 — it MUST receive mail before beta. An unreachable contact address in a
 *  published policy is a defect, not a placeholder. */
export const POLICY_CONTACT = 'contact@hullcracker.io';

/** Stamped, not computed: a policy's date is the date its CONTENTS were last
 *  changed, so it must not tick with the build. */
export const POLICY_UPDATED = 'Last updated 18 August 2026';

export const POLICY_SECTIONS: readonly PolicySection[] = [
  {
    heading: 'THE SHORT VERSION',
    paragraphs: [
      'Hullcracker.io has no accounts, no sign-up and no player database. Nothing about you is '
      + 'kept on our servers after your match ends. Your callsign, class and settings live in your '
      + 'own browser and are never sent to us as a profile.',
      'Two things do involve other companies, and both are set out in full below: the page loads '
      + 'its typefaces from Google Fonts, and — only if you accept — it uses Google Analytics to '
      + 'count how the game is used.',
    ],
  },
  {
    heading: 'WHO RUNS THIS',
    paragraphs: [
      'Hullcracker.io is run by Eric Seibt, an individual operator based in the United States. '
      + 'There is no company behind it. For anything in this policy — questions, requests, '
      + 'complaints — write to ' + POLICY_CONTACT + '.',
    ],
  },
  {
    heading: 'WHAT STAYS ON YOUR DEVICE',
    paragraphs: [
      'The game remembers your preferences in your own browser, using local storage. This never '
      + 'travels to us as a profile; it is read by the game running on your machine. Clearing site '
      + 'data for hullcracker.io removes all of it.',
    ],
    bullets: [
      'hullcracker.name — the callsign you typed',
      'hullcracker.class, hullcracker.mode, hullcracker.color, hullcracker.horn — your last ship '
      + 'class, launch mode, colour preference and horn',
      'hullcracker.settings — audio, motion, UI scale and other accessibility settings',
      'hullcracker.helm — whether you have already been shown the helm hints',
      'hullcracker.session, hullcracker.session.handoff — the short-lived tokens that let a '
      + 'refresh drop you back into a match in progress',
      'hullcracker.consent — your answer to the analytics question on this page',
      'hullcracker.resume, hullcracker.tab — per-tab values that live only as long as the tab is '
      + 'open (session storage)',
    ],
  },
  {
    heading: 'YOUR CALLSIGN IS PUBLIC',
    paragraphs: [
      'The callsign you type is free text, capped at 14 characters, and it is shown to every '
      + 'other player in your match — on nameplates, in the kill feed, and in the results table. '
      + 'We do not check it, moderate it, or store it after the match.',
      'Because of that: please do not use your real name, an email address, or anything else you '
      + 'would not want strangers to read.',
    ],
  },
  {
    heading: 'TYPEFACES (GOOGLE FONTS)',
    paragraphs: [
      'The page loads the Geist typefaces from fonts.googleapis.com and fonts.gstatic.com, which '
      + 'are run by Google. That means Google receives your IP address every time you load the '
      + 'page, including before you answer the analytics question. We do not control what Google '
      + 'does with that request; their handling is covered by the Google Privacy Policy at '
      + 'https://policies.google.com/privacy.',
      'This is a consequence of how the fonts are delivered rather than something the game asks '
      + 'for, and we intend to serve the fonts from our own server instead, which would remove the '
      + 'request entirely.',
    ],
  },
  {
    heading: 'THE PLAYERS-ONLINE COUNTER',
    paragraphs: [
      'So the home screen can tell you whether anyone else is around, your browser asks our server '
      + 'for the current counts every few seconds, sending a random value that identifies the '
      + 'browser tab. That value is generated fresh for each tab, is held in memory only, is never '
      + 'written to your device, and is discarded by the server 30 seconds after your last request. '
      + 'It is not linked to your callsign or to anything else about you.',
    ],
  },
  {
    heading: 'SERVER LOGS',
    paragraphs: [
      'Our game server writes ordinary operational logs: a short-lived identifier for each '
      + 'connection, and aggregate facts about a match such as how many ships were in it, how long '
      + 'it ran, and which classes won. These carry no callsigns and no IP addresses, and they '
      + 'exist so we can tell whether the game is working.',
      'Our hosting provider, Render, keeps its own connection logs at the network edge as part of '
      + 'running the service. Those are outside our control and are governed by Render’s own '
      + 'privacy policy.',
    ],
  },
  {
    heading: 'ANALYTICS, ONLY IF YOU ACCEPT',
    paragraphs: [
      'If — and only if — you press ACCEPT on the analytics bar, the game loads Google Analytics '
      + '(GA4). Until you do, nothing is requested from Google Analytics at all, and if you press '
      + 'DECLINE nothing ever will be. Your answer is remembered in your browser so you are not '
      + 'asked again.',
      'Google Analytics sets a first-party cookie that recognises your browser on later visits, '
      + 'and records your IP address as part of the request. It measures five moments and nothing '
      + 'else:',
    ],
    bullets: [
      'reaching the home screen',
      'choosing a launch mode (which mode is the only detail sent — standard, or solo against AI)',
      'a match starting',
      'a match ending',
      'returning to port',
    ],
  },
  {
    heading: 'WHAT ANALYTICS NEVER SEES',
    paragraphs: [
      'It never receives your callsign, your colour, your kills, your placement, your damage, the '
      + 'match or room you were in, or anything else about what happened on the water. There is no '
      + 'advertising, no ad network, and no sharing of any of this with anyone other than Google as '
      + 'the analytics provider.',
      'Google processes this data as our provider and under its own terms; see '
      + 'https://policies.google.com/privacy. Data may be processed outside your country, including '
      + 'in the United States.',
    ],
  },
  {
    heading: 'WHY WE ARE ALLOWED TO DO THIS',
    paragraphs: [
      'Analytics runs on your consent, and on nothing else — that is what the bar is for, and you '
      + 'may refuse without losing any part of the game.',
      'Everything else described here is what it takes to run the game you asked to play: '
      + 'connecting you to a match, remembering your own preferences on your own device, showing '
      + 'how many people are online, and keeping operational logs so the service can be maintained. '
      + 'Where the law calls for a basis, that is our legitimate interest in operating the game, '
      + 'and in the case of your saved preferences, your own request to have them remembered.',
    ],
  },
  {
    heading: 'HOW LONG THINGS ARE KEPT',
    paragraphs: [
      'Nothing about a player survives their match on our servers: match state is discarded when '
      + 'the room closes, and the players-online value expires 30 seconds after your last request. '
      + 'Operational logs are short-lived and are kept only as long as they are useful for '
      + 'diagnosing problems. What is stored in your browser stays there until you clear it. '
      + 'Analytics data is retained by Google under the retention period set on the property, at '
      + 'most 14 months.',
    ],
  },
  {
    heading: 'CHANGING YOUR MIND',
    paragraphs: [
      'Your analytics answer is stored in your browser. To change it, clear site data for '
      + 'hullcracker.io in your browser settings — that removes the stored answer along with your '
      + 'other saved preferences, and the analytics bar will ask again on your next visit. '
      + 'Clearing site data also removes the Google Analytics cookie. Your browser’s own '
      + '"do not track" or cookie-blocking settings are respected by simply never being asked to '
      + 'load anything you have blocked.',
    ],
  },
  {
    heading: 'CHILDREN',
    paragraphs: [
      'The game has no age gate and does not ask how old you are. It is not directed at children, '
      + 'and we do not knowingly collect information from them. Since there are no accounts and no '
      + 'stored player records, there is nothing about a child for us to hold; if you believe a '
      + 'child has provided information through the game, write to ' + POLICY_CONTACT + ' and we '
      + 'will look into it.',
    ],
  },
  {
    heading: 'YOUR RIGHTS',
    paragraphs: [
      'Depending on where you live, you may have rights to access, correct, delete or object to '
      + 'the use of personal data about you, and to withdraw consent at any time.',
      'In practice there is very little for us to act on: we hold no accounts and no player '
      + 'records, so there is no profile to retrieve or delete. Withdrawing consent for analytics '
      + 'is done by clearing site data, as described above. For anything else — including a '
      + 'request about the Google Analytics data associated with your browser — write to '
      + POLICY_CONTACT + ' and we will do what we can.',
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
      'Eric Seibt, individual operator, United States — ' + POLICY_CONTACT + '.',
    ],
  },
];
