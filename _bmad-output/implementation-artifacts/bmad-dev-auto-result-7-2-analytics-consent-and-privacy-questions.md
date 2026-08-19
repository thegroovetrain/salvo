---
status: blocked
blocking_condition: intent gaps — pre-implementation question gate (Eric rulings required)
story: 'Story 7.2 — Analytics, Consent & Privacy'
cycle: 104 (0.17.104 if landed)
created: '2026-08-18'
base: main @ 4f54598 (cycle 103, 0.17.103, PROTOCOL_VERSION 40)
---

# Story 7-2 — Analytics, Consent & Privacy: pre-implementation question gate

Eric asked for questions before implementation and supplied the live GA4 tag:

> `<!-- Google tag (gtag.js) --> <script async src="https://www.googletagmanager.com/gtag/js?id=G-LLCR4XRZGG"></script> … gtag('config', 'G-LLCR4XRZGG');`

So **the GA4 property exists and its measurement ID is `G-LLCR4XRZGG`.** That closes the only
external prerequisite this story had. What it does not close is the rest of the story, and the
reason is not vagueness — it is that **the acceptance criteria contain a contradiction and a
dependency inversion, both of which are provable against Google's own current documentation.**

Five parallel read-only investigations were run against this worktree (client boot + DOM chrome,
the funnel's real call sites, the design system, build/deploy topology, and the
requirements/prior-rulings ledger), plus a live documentation pass over Google's AdSense and
Tag Platform help centres. Everything below is evidenced with `file:line` or a quoted URL; where a
claim is an inference it says so.

**Read §1 first — it is the one that changes what gets built.**

---

## §1. THE HEADLINE: the CMP the AC names cannot be obtained at Story 7.2, and Eric's own approved proposal already says why it does not have to be

### 1a. The dependency inversion, in Google's words

The AC requires *"a Google-certified CMP (Google's own free CMP)"* (`epics.md:1252`). Google's own
free CMP is the **European regulations message** in the AdSense **Privacy & messaging** tab. Its
setup article opens with the prerequisite, verbatim:

> **"After you add your sites to AdSense**, complete the following steps to create the European
> regulations message that you want to display to the eligible EEA (European Economic Area) and UK
> (United Kingdom) users of your sites."
>
> **"Note: Make sure you've placed the AdSense code on your site."**
>
> — https://support.google.com/adsense/answer/10960768

Adding the site to AdSense and placing the AdSense code on it **is Story 7.4**
(`epics.md:1279-1289`; NFR8 at `epics.md:97`). But Epic 7 sequences 7.2 **before** 7.4 and states
that the AdSense application starts *because of* 7.2:

> `7.2 privacy policy + analytics published (on the CURRENT single service — no split needed)`
> `  → APPLY FOR ADSENSE + H5 GAMES ADS ..... ← start this the day 7.2 lands`
> — `sprint-change-proposal-2026-08-18.md:240-245`

The same article also asks you to *"Enter your site's privacy policy URL"* — the artefact 7.2
delivers. **So 7.2 produces the CMP's input and 7.4 produces the CMP's prerequisite.** As written,
this AC clause cannot be satisfied in this story by anyone.

### 1b. The contradiction inside the AC

Two clauses of the same AC, three lines apart:

> **And** a Google-certified CMP (**Google's own free CMP**) gates personalized ads and analytics
> storage… — `epics.md:1252`
>
> **And** the consent banner is **designed to DESIGN.md's register rather than shipped as vendor
> default** — it is the first thing a new player sees. — `epics.md:1255`

Google's CMP renders **its own dialog**: *"The Google CMP appears to users as dialog messages
overlaying on sites or apps"* (https://support.google.com/adsense/answer/16918505). You may
*"Edit and format the message to match your editorial and visual standards"*
(https://support.google.com/adsense/answer/10960768) — text, logo, colours inside Google's message
editor — but you cannot render it as our own DOM in our own type ramp. **Adopting Google's CMP IS
shipping the vendor surface.** The two clauses are not both fully satisfiable.

### 1c. Why this is not actually a problem — Eric's approved proposal already draws the line

The certified-CMP requirement is Google's **publisher-ads** policy, not a law and not an analytics
requirement. Google states it as a condition on *"serving personalized ads"*
(https://support.google.com/adsense/answer/13554116), and adds that *"Traffic from a non-certified
CMP may be eligible for non-personalized ads or limited ads."* The sprint change proposal Eric
approved says exactly this, unprompted:

> *"Non-personalized ads do not require a certified CMP — **which is what made this a revenue
> question rather than a legal one.** Eric selected Google's own free certified CMP."*
> — `sprint-change-proposal-2026-08-18.md:830-841`

**GA4 needs consent; it does not need a TCF-certified CMP.** Consent Mode v2 is a plain
`gtag('consent', …)` API that any banner can drive
(https://developers.google.com/tag-platform/security/guides/consent — the page is titled *"for
developers who maintain their own consent solution"*).

### ❓ Q1 — Which consent mechanism ships in Story 7.2?

| | Option | Consequence |
|---|---|---|
| **(a)** | **Own-built banner now; Google's CMP arrives with the ads at 7.4** *(recommended)* | 7.2 ships a Hullcracker-register banner driving Consent Mode v2 for **analytics** only. Satisfies `epics.md:1255` completely. When 7.4 lands AdSense, Google's certified CMP takes over EEA/UK/CH **ads** consent and our banner either retires there or continues to serve analytics consent elsewhere. Nothing is thrown away: the Consent Mode v2 plumbing, the default-denied call and the privacy policy are all required either way. |
| **(b)** | Defer the banner and GA4 until after AdSense approval | 7.2 becomes "privacy policy page only". Costs the entire beta ramp's funnel data, and inverts the epic — the policy is what unblocks the AdSense application in the first place. |
| **(c)** | Pull the AdSense site-add into 7.2 and adopt Google's CMP now | Requires placing AdSense code on the site before the ad story, and knowingly accepts Google's dialog UI in place of `epics.md:1255`. Also gated on AdSense review latency, which is not ours to control. |

**Recommendation: (a).** It is the only option that satisfies both AC clauses, and it matches the
distinction Eric's own approved document already drew.

**If (a):** note one Google constraint for 7.4's benefit — *"Messages may not be eligible to show
on web if the referrer-policy isn't configured to share the 'Referrer' header on cross-origin
requests"* (same URL). We set no referrer policy today; the default (`strict-origin-when-cross-origin`)
satisfies it, but nothing must tighten it later without knowing this.

---

## §2. WHO SEES THE BANNER, AND DOES IT STAND BETWEEN THEM AND THE WATER

The AC says the CMP gates *"in the EEA/UK/Switzerland"* (region-scoped) and, three lines later,
that the banner *"is the first thing a new player sees"* (reads global). Consent Mode supports
both: region-scoped defaults take an ISO 3166-2 list, and *"A gtag consent default command without
a region parameter sets the default for all visitors not covered by another region-specific
command"* (https://developers.google.com/tag-platform/security/guides/consent).

### ❓ Q2 — Global banner, or EEA/UK/CH only?

- **(a) Region-scoped** *(recommended)* — EEA/UK/CH: all four signals default `denied`, banner
  shown. Everywhere else: defaults `granted`, no banner. Maximises measurement, and every
  non-European player reaches the water with zero friction. This is what Google's region API exists
  for and what their CMP does by default.
- **(b) Global banner** — everyone answers before playing. More conservative, and it is what
  *"the first thing a new player sees"* literally describes. Costs the first impression worldwide,
  including the friends in South America Eric mentioned during the hosting decision.

**Region detection caveat, stated plainly because it shapes (a):** we do not know the visitor's
country client-side. Under (a) the region logic must be Google's own — `gtag`'s `region:` parameter
is evaluated by Google's tag, but **our banner's visibility is our code's decision**, and we have
no geo signal. Two honest ways to do (a): show the banner to everyone but set region-scoped
defaults so only Europeans are actually blocked (which is (b) in UX terms), or add a geo lookup
(a new third-party request, against NFR2 and against the spirit of the privacy posture).
**A third way, and the one I would build: show the banner to everyone, but make it non-blocking
(Q3b), and set region-scoped defaults.** European users are correctly denied-by-default until they
answer; everyone else is measured immediately; nobody is stopped from playing.

### ❓ Q3 — Does the banner block PLAY?

- **(a) Blocking modal** — sits above home (a new z rung above `1100`; the ladder is
  `client/src/config.ts:1734-1745`, home `1100`, queue modal `1150`, class bay `1200`). Matches
  *"it sits between them and the water"* (`sprint-change-proposal-2026-08-18.md:529`). This is what
  vendor CMPs do.
- **(b) Non-blocking bottom bar** *(recommended, paired with Q2a)* — home stays fully usable; the
  bar persists until answered. Nothing is measured until consent, so the strictness is in the
  *data*, not in the player's way. The risk row for this story already names the concern:
  *"it also puts a banner in front of a new player"* (`sprint-change-proposal-2026-08-18.md:210`).

---

## §3. BASIC OR ADVANCED CONSENT MODE — does gtag.js load at all before an answer?

Two implementations, and Google presents them as a deliberate choice
(https://developers.google.com/tag-platform/security/guides/consent):

- **Advanced** — the Google tag loads immediately with defaults `denied` and sends **cookieless
  pings** while consent is withheld, so Google can model the unconsented traffic. The proposal
  records this behaviour: *"denied consent sends cookieless pings"*
  (`sprint-change-proposal-2026-08-18.md:840`).
- **Basic** — no Google tag loads at all until consent is granted. Nothing is sent, modelled or
  otherwise. Costs the modelled traffic; costs one script's worth of load only on granted sessions.

### ❓ Q4 — Advanced (cookieless pings pre-consent) or Basic (nothing until yes)?

**Recommendation: Basic.** This project has never sent anything about a person anywhere, and a
pre-consent ping — even a cookieless one — is the kind of thing that would have to be disclosed in
the privacy policy in a sentence nobody enjoys writing. Basic also removes gtag.js entirely from the
cold-load path for a first-time visitor, which is free headroom against NFR2. Advanced is Google's
own recommendation and is defensible; it is Eric's call which side of that line beta sits on.

---

## §4. GA4 SETS A PERSISTED DEVICE IDENTIFIER, AND THIS CODEBASE HAS A WRITTEN COMMITMENT AGAINST EXACTLY THAT

This is not a legal problem — a consent-gated analytics cookie is ordinary and lawful. It is a
**values** problem, and it is written into the source in capital letters. `client/src/net/liveness.ts:62-67`:

> `// IT IS ANONYMOUS BY CONSTRUCTION AND MUST STAY THAT WAY. It is a fresh random`
> `// value per tab, held in memory only: NOT the callsign, NOT the colour`
> `// preference, NOT anything in localStorage, and deliberately NOT persisted —`
> `// persisting it would make it a device identifier, and a per-tab value is also`
> `// the correct granularity, since two tabs are two viewers.`

GA4's `client_id` lives in a first-party `_ga` cookie with a two-year lifetime. **It is precisely
"a persisted device identifier"** — the thing that comment refuses. The single-session lock carries
the same posture: *"No server identity, **no IP tracking**, no rate limiting — those were
considered and set aside"* (`client/src/app/sessionLock.ts:8`, quoting Eric's 2026-08-17 ruling).

### ❓ Q5 — Accept GA4's persisted `client_id` under consent, or run GA4 cookieless?

- **(a) Accept it under consent** *(recommended)* — the normal integration. Users and sessions are
  measurable, the funnel actually works, and the privacy policy names the cookie honestly. The
  `liveness.ts` comment stays true of `liveness.ts` — it is a statement about that endpoint, not a
  project-wide vow — but it should get one added line pointing at the policy so a future reader does
  not think the two contradict.
- **(b) Cookieless GA4** (`gtag('config', …, { client_storage: 'none' })`) — no cookie, no
  identifier, no persistence. Every page load is a new "user", so **home → mode pick → match start →
  match end → requeue cannot be linked into a funnel at all** — and since every requeue is a full
  page reload (§5), the funnel would fragment on the very transition it exists to measure. This
  effectively buys a hit counter.

**(b) makes the story's own goal unachievable.** Recommending (a), but flagging it loudly because it
is the first time this project will persist an identifier on a player's machine, and the code
currently says it does not do that.

---

## §5. THE FIVE FUNNEL MOMENTS — three of the five are genuinely ambiguous, and one already fires wrongly

The funnel is fixed by NFR19 (`epics.md:108`): **home → mode pick → match start → match end →
requeue**. Every one of those has a real call site; three have more than one defensible one.

**The structural fact that dominates all of it: RETURN TO PORT is a literal page reload.**
`client/src/app/returnToPort.ts:82` ends the chain with `.finally(() => deps.reload())`, bound to
`location.reload()` at `client/src/main.ts:1707`. So every normal loop iteration is a full
navigation. Consequences: the requeue event must be sent **before** the reload (GA4
`transport_type: 'beacon'` becomes mandatory, not optional), and **consent must persist in
`localStorage`** or the banner reappears after every single match. The existing namespace is
`hullcracker.*` (`client/src/ui/home.ts:84-86`, `client/src/config.ts:1713`,
`client/src/net/resumeToken.ts:30`), so `hullcracker.consent` fits. *I am treating the persistence
point as settled unless Eric says otherwise — a consent record is "strictly necessary" storage
under every reading, and the alternative is a banner every match.*

### ❓ Q6 — Confirm or correct these five definitions

| Moment | Recommended definition | Call site | The ambiguity |
|---|---|---|---|
| **home** | Fire from `enterPort()` when `autoQueue === false` | `client/src/main.ts:4327` | **Not** page load: a refresh-resume goes straight into the match and never shows home (`main.ts:4807-4810`). And the auto-requeue after cohort collapse builds a home that is on screen for a fraction of a frame and immediately deploys (`main.ts:4313` → `:4375`) — counting it would inflate home→mode-pick with a step no human took. |
| **mode pick** | Fire inside `deploy()`, on a press that actually deploys | `client/src/ui/home.ts:940` | A press with no class saved opens the class bay instead (`home.ts:953`, `:961`); a press while busy does nothing (`home.ts:945`); Enter in the callsign field is a fourth input route to SOLO (`home.ts:1030`); and the auto-requeue calls `startGame` with no press at all (`main.ts:4375`). |
| **match start** | **NEEDS A RULING** — I lean "room joined + welcome" (`launchSession`, `main.ts:4534`), because for a funnel it means *the player got into a game* | `main.ts:4534` **or** `main.ts:1240` | The alternative is the countdown ending (`phase === 'active'`, `client/src/audio/tones.ts:485` → `portal.matchStart()` at `main.ts:1240`) — the gun going off. Both are defensible; they differ by the whole waiting-room + countdown, which is exactly where a bored player leaves. |
| **match end** | The player's **own** exit from play — elimination modal or results, whichever comes first, latched once per match | `main.ts:1557` (elimination) / `main.ts:2646` (results) | In a 20-player BR these are usually different moments. Firing only on `onResults` misses every player who died and left — i.e. most of them. Firing on both double-counts a spectating survivor. |
| **requeue** | The RETURN TO PORT **press**, before the reload | `client/src/ui/results.ts:811` → `main.ts:1610` | Two routes reach the same reload with **no player action**: the passive 45s room disposal (`main.ts:1837`) and the disconnect timeout (`main.ts:1841`). And the auto-requeue is the one loop iteration with **no reload at all** (`client/src/app/requeue.ts:97`). |

**A bug worth knowing about regardless of the ruling:** on a refresh-resume into a live match,
`INITIAL_CUE_STATE.lastPhase` is `'connecting'` (`tones.ts:464`), so the `phase === 'active' &&
prev !== 'active'` edge fires on the first resumed frame — **`portal.matchStart()` already fires for
a match that started ten minutes ago**, with no guard. If GA4 rides that seam it inherits the
defect. I would fix it here (it is two lines) rather than measure through it, but say so if you'd
rather it stay 7.8's problem.

**Also settled by NFR19 and not in question:** GA4 carries the funnel and nothing else — no
callsign, no class, no kills, no placement, no match ID. The server already owns class pick/win
rates and storm deaths as identity-free aggregates (`match.end`, `server/src/rooms/ArenaRoom.ts:1209`;
payload `server/src/game/match.ts:997`), and NFR19 says GA4 *"never [carries] gameplay state"*.
**Open sub-question:** may a `mode_pick` event carry the mode (`standard` / `soloVsAi`)? It is not
gameplay state and it is the only parameter that makes the funnel step worth measuring. I intend to
send it unless told not to.

---

## §6. THE PRIVACY POLICY — where it lives, and who writes it

### 6a. It must be a real URL, and `/privacy` 404s today

There is **no router in the client** and **no `client/public/` directory at all**. In production
the game server serves the built client with plain `express.static` and **no SPA fallback** — the
comment says so deliberately, so Colyseus's matchmaking endpoints are never shadowed
(`server/src/app.config.ts:60-67`). So an unmatched `/privacy` reaches Express's default handler and
returns a bare 404. An in-app overlay with no URL is not an option: Google's CMP setup asks you to
*"Enter your site's privacy policy URL"*, and AdSense site review expects a reachable policy page.

### ❓ Q7 — Which form does the policy page take?

- **(a) `client/privacy.html` as a second Vite entry** → served at `/privacy.html`
  *(recommended)*. Needs three lines of `build.rollupOptions.input` in `client/vite.config.ts`.
  Real URL, works identically in dev and prod, and survives Story 7.7's move to a Render Static Site
  unchanged.
- **(b) `client/public/privacy/index.html`** → served at `/privacy` (prettier URL; `express.static`
  resolves the directory index). Creates the `public/` directory the project has never had — which
  we will want anyway for `ads.txt`, `robots.txt` and a favicon, none of which exist.

Either is fine; (b) gives the nicer URL and the directory we need for 7.4 regardless. **I lean (b)
now that I have written it out.** Eric's call.

### 6b. A policy that says "we collect nothing" would be false

The inventory below is verified in code, and **three disclosures exist today that a naive policy
would miss**:

1. **Google Fonts.** `client/index.html:7-8,27-30` preconnects and preloads from
   `fonts.googleapis.com` / `fonts.gstatic.com`. **Google receives every visitor's IP on every page
   load, today, before any consent surface exists.** (Flagged, not a question: this is pre-existing
   and out of 7.2's scope to change. It must be disclosed. Self-hosting the two Geist faces would
   remove the disclosure entirely and would also delete the `fontWaitMs` boot race — worth a
   ledger entry for 7.6/7.8, not worth doing inside this story.)
2. **`GET /liveness?c=<per-tab id>`** records an anonymous per-tab value into server presence with a
   30s TTL (`server/src/liveness.ts:265`). In-memory, never persisted, never linked to anything —
   but it is a server-side record of a home-screen visitor and the policy should describe it
   honestly rather than omit it.
3. **`sessionId` in stdout log lines** — `client.join` / `drop` / `resume` / `leave` / `joiningKick`
   all log it (`server/src/rooms/ArenaRoom.ts:856,918,981,984,1024`). It is an ephemeral
   per-connection Colyseus id, regenerated every join, never persisted. **But `server/src/log.ts:9-11`
   states the discipline as "zero PII (player names, **session ids**) belongs in a telemetry line"
   — so either the comment or the callers is wrong.** Not a leak; a documentation defect that would
   make a policy sentence untrue. I'd correct the comment (the callers are right — an ephemeral
   connection id in an ops line is not PII) and note it.

Also to be disclosed, and it is a *disclosure* rather than a collection: **the callsign is
user-entered free text, capped at 14 code points, and is shown to every other player** — nameplates,
kill feed, results table (`client/src/ui/home.ts:102`, `server/src/rooms/roomOptions.ts:282`,
`server/src/game/match.ts:976`). Stored only in the player's own `localStorage`
(`hullcracker.name`), never server-side. A player who types their real name has published it to
strangers, and the policy should say so.

Everything else genuinely is local-only: `hullcracker.class`, `.mode`, `.color`, `.horn`,
`.settings`, `.helm`, `.session`, `.session.handoff` in `localStorage`; `hullcracker.resume` and
`hullcracker.tab` in `sessionStorage`. **No cookies are set anywhere today** (`document.cookie` has
zero hits). **No IP or user-agent logging exists in our code** — though Render's platform edge logs
are outside the repo, and a policy claiming completeness must account for them.

### ❓ Q8 — Who authors and approves the policy copy?

A privacy policy is a legal document, and there is **no ruling anywhere in the project** about
cookies, data-subject rights, retention periods, a governing-law clause, a contact address, or a
ToS — I checked; that territory is entirely undecided
(no `gdpr|cookie|ccpa|ePrivacy` hits in `_bmad-output/` outside the one line in the change proposal).

- **(a)** I draft it from the verified inventory above, Eric reviews and approves the wording, and
  it ships as frozen copy in the manner of `client/src/ui/taglines.ts:7-10` *(recommended)*.
- **(b)** Eric supplies the text (or a generator's output) and I only build the page.
- **(c)** A lawyer reviews before beta.

**Two things I cannot invent and will need from Eric under (a):** a **contact address** for privacy
enquiries (a real mailbox is required — an unreachable one is a defect), and the **legal entity /
jurisdiction** the policy is written under. Everything else I can draft from evidence.

---

## §7. "STANDARD PAGE CHROME" IS SPECIFIED BUT HAS NEVER BEEN BUILT

The AC says the policy is *"published in standard page chrome"* (`epics.md:1253`). That pattern
exists as **two sentences and no component**: a `1100px` max-width token (`DESIGN.md:94`, `:201`;
UX-DR39 at `epics.md:199`) and *"ESC/back returns home"* (`EXPERIENCE.md:37`). Nothing specifies a
header, margins, background or scroll behaviour, and **`1100` appears nowhere in the client as a
width** — every occurrence is a z-index. Every shipped surface is a fixed full-viewport overlay with
an ad-hoc panel width (settings 720px `client/src/ui/settings.ts:190-215`; results 620px
`client/src/ui/results.ts:381-396`).

The nearest shipped model is the settings overlay: panel bed + hairline + 12px radius + its own
`overflow-y:auto`, over the ambient canvas, no full-screen dim (*"DESIGN dims behind results only"*,
`settings.ts:14`).

### ❓ Q9 — Does 7.2 mint the reusable page-chrome component that 7.3 will reuse?

- **(a) Yes** *(recommended)* — build `client/src/ui/page.ts` once, at the 1100px cap, ESC/back to
  home; the privacy policy is its first consumer and How-to-Play (7.3) its second. One pattern, two
  pages, no divergence.
- **(b) No** — ship a one-off privacy page and let 7.3 mint the pattern. Guarantees the two pages
  differ and that 7.3 pays to retrofit.

**Related, and flagged rather than asked:** the AC says the policy is *"linked from home and
How-to-Play"*, but **How-to-Play does not exist yet** — it is Story 7.3, and today it is a stub
that paints `FIELD MANUAL ARRIVES IN A LATER REFIT` (`client/src/ui/home.ts:88`, `:1014`). 7.2 will
link from home only (the underplay row at `home.ts:716` is the obvious home for a `PRIVACY` sibling
beside `HOW TO PLAY`), and 7.3 adds its own link. Recording it so it does not read as a missed AC.

**Design register facts the banner and page must obey either way** (no ruling needed, listed so the
next agent does not re-derive them): buttons are amber outline + glow, **never a filled slab**
(`DESIGN.md:111`, `:244`), with the unlit-phosphor secondary from `client/src/ui/results.ts:733-770`;
purple is the storm and nothing else, ever (`DESIGN.md:255`); `text-muted` is barred from
load-bearing copy (`DESIGN.md:153`), which rules it out for a consent notice; prose sentences are
permitted only in descriptions and page copy, so legal prose is Geist body — **not** uppercase mono
(`EXPERIENCE.md:53`); any entrance animation must respect `pulseCapHz` and the flash budget
(`client/src/config.ts:1727-1732`, `:1774-1805`), and the only DOM animations that ship anywhere are
opacity fades. **And a live test will fail on the first hardcoded colour:**
`client/src/__tests__/tokens.test.ts:113` asserts `index.html` holds exactly one colour literal
(`#050807`) and that `client/src` holds none — so the banner must be built from `--hc-*` tokens.

One more, worth stating because it is a real gap and not mine to close: **the consent banner has no
ratified design at all.** No UX-DR covers it, and the change proposal lists *"new: consent banner +
ad unit treatment"* as DESIGN.md work still owed at Story 7.6
(`sprint-change-proposal-2026-08-18.md:703`). So whatever ships here is a **proposal**, in the same
sense `client/src/ui/home.ts:653` says of the SOLO VS AI button — *"THE STYLING OF THIS BUTTON IS A
PROPOSAL, NOT A RATIFIED DECISION."*

---

## §8. WHAT IS ALREADY SETTLED, AND WHAT I WILL DO WITHOUT FURTHER RULINGS

Settled, verified, not in question:

- **The story lands on the current single Render service**, not the split. `epics.md:1249` says
  *"Given the live site"*; the change proposal's *"Given the static site from 7.1"* (`:523`) is
  stale and `gds-workflow-status.yaml:43` already rules it so. The client stays on the apex domain
  through 7.7, so the GA4 property on `hullcracker.io` never moves (`epics.md:110`, NFR18).
- **The measurement obligation and its instrument.** NFR2 counts analytics and consent scripts and
  they must not block first paint (`epics.md:91`). Headroom is **~7.7s of a ~10s budget** (7.1
  measured interactive home at 3 076ms; epic-7 amendment 7). `client/scripts/loadCapture.mjs` is the
  ratified instrument, and its `HC_DIST` override exists precisely so a before/after pair can be
  taken honestly — I will re-run it rather than re-derive a method, and the JSON it writes already
  carries a `notMeasuredYet` field naming this story (`loadCapture.mjs:209-210`).
- **The measurement ID is build-time config, not a literal.** `VITE_WS_URL` already proves the
  mechanism (`client/src/net/connection.ts:234-241`); `G-LLCR4XRZGG` rides the same way, with a
  Render `envVars:` entry, so a fork or a local build does not report into Eric's property.
- **Server-side telemetry does not move.** NFR15's stdout lines stay exactly as they are; GA4's
  only territory is browser-session counts the server structurally cannot see.
- **No CSP exists anywhere** in the repo. Adding one is not 7.2's job, but adding the first
  third-party script is the moment it becomes worth having — ledgering for 7.8 rather than
  smuggling it in here.

Assumptions I will proceed on unless corrected: consent persists in `localStorage` as
`hullcracker.consent`; the requeue event uses `sendBeacon` transport; GA4 events carry no
identifiers beyond what GA4 itself sets; and the banner uses an opacity fade, not a slide.

---

## §9. THE ANSWERS I NEED

1. **Q1** — own-built banner now with Google's CMP at 7.4 *(recommended)*, defer, or pull AdSense forward?
2. **Q2** — banner shown globally, or EEA/UK/CH only? (See the region-detection caveat — I recommend shown to all, denied-by-default only in Europe.)
3. **Q3** — blocking modal, or non-blocking bar *(recommended)*?
4. **Q4** — Consent Mode **Basic** *(recommended)* or **Advanced** (cookieless pings before an answer)?
5. **Q5** — accept GA4's persisted `client_id` under consent *(recommended)*, or run cookieless and lose the funnel?
6. **Q6** — confirm/correct the five funnel definitions in §5, and say whether the refresh-resume `matchStart` defect is fixed here or ledgered.
7. **Q7** — `/privacy.html` second entry, or `client/public/privacy/index.html` → `/privacy` *(slight lean)*?
8. **Q8** — who authors the policy copy, and what contact address + legal entity go in it?
9. **Q9** — does 7.2 mint the reusable page chrome for 7.3 *(recommended)*, or ship a one-off?

Answer any subset; the recommendations are live defaults for anything left unanswered **except Q6's
"match start" and "match end" rows and Q8's contact address**, which I will not guess — the first
two change what the funnel means, and the third is a fact only Eric holds.

---

## §10. EVIDENCE INDEX

**External (fetched live, 2026-08-18):**
- CMP prerequisites + message editing + privacy-policy URL + referrer-policy — https://support.google.com/adsense/answer/10960768
- Google CMP is a Google-rendered dialog — https://support.google.com/adsense/answer/16918505
- Certified CMP required for **personalized ads** in EEA/UK/CH; non-certified traffic still eligible for non-personalized — https://support.google.com/adsense/answer/13554116
- Consent Mode v2: the four signals, snippet ordering ("the order of the code here is vital"), `wait_for_update`, region-scoped defaults, Basic vs Advanced — https://developers.google.com/tag-platform/security/guides/consent

**Planning artifacts:** `epics.md:91,97,103,104,106,108,110,177,199,1241-1255,1279-1289`;
`sprint-change-proposal-2026-08-18.md:210,238-262,515-529,703,830-841`;
`epic-7-context.md`; `epic-7-context-amendments.md` (amendment 7);
`deferred-work.md:1307`; `gds-workflow-status.yaml:43`;
`DESIGN.md:94,111,153,201,244,255`; `EXPERIENCE.md:37,53`.

**Code:** `client/index.html:7-8,27-30`; `client/vite.config.ts`; `client/src/main.ts:1240,1557,1610,1707,1837,1841,2646,4313,4327,4375,4534,4754-4758,4807-4810`;
`client/src/ui/home.ts:84-86,88,102,653,716,940,953,961,1014,1030`; `client/src/ui/results.ts:733-770,811`;
`client/src/ui/settings.ts:14,190-215`; `client/src/app/returnToPort.ts:82`; `client/src/app/requeue.ts:97`;
`client/src/app/sessionLock.ts:8`; `client/src/net/liveness.ts:62-67`; `client/src/net/connection.ts:234-241`;
`client/src/net/resumeToken.ts:30`; `client/src/audio/tones.ts:464,485`; `client/src/config.ts:534-556,1713,1727-1732,1734-1745,1774-1805`;
`client/src/portal/portalAdapter.ts:25-39`; `client/src/__tests__/tokens.test.ts:113`;
`client/scripts/loadCapture.mjs:38-43,209-210`; `server/src/app.config.ts:52-67`; `server/src/log.ts:9-11`;
`server/src/liveness.ts:265`; `server/src/rooms/ArenaRoom.ts:856,918,981,984,1024,1209`;
`server/src/rooms/roomOptions.ts:282`; `server/src/game/match.ts:976,997`; `render.yaml`.

---

## Auto Run Result

Status: `blocked`
Blocking condition: intent gaps — pre-implementation question gate (Eric rulings required)

No code was written. Five parallel read-only investigations plus a live pass over Google's current
AdSense and Tag Platform documentation. The blocking finding is §1: the CMP named in the AC has a
prerequisite Story 7.4 delivers, and adopting it contradicts the AC clause three lines below it —
while Eric's own approved change proposal already records that a certified CMP is *"a revenue
question rather than a legal one."* Nine questions, each with a recommendation and each evidenced.
