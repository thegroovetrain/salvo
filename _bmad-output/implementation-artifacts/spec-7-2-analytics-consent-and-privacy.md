---
title: 'Story 7-2: Analytics, Consent & Privacy'
type: 'feature'
created: '2026-08-18'
status: 'done'
baseline_revision: '02f68a6'
review_loop_iteration: 0
final_revision: '79b293a339a05462ffafc8888bc6f1e1828507c5'
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context-amendments.md'
  - '{project-root}/_bmad-output/implementation-artifacts/bmad-dev-auto-result-7-2-analytics-consent-and-privacy-questions.md'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** The beta ships to strangers with no measurement of how they arrive, enter or leave, and
no lawful basis to measure them: there is no consent surface, no privacy policy, and no analytics of
any kind. GA4 property `G-LLCR4XRZGG` exists and is unused. Separately, the AC's named mechanism —
Google's own free CMP — is unbuildable in this story (it requires the site added to AdSense with its
code already placed, which is Story 7.4), and adopting it would contradict the AC clause three lines
below requiring the banner to be ours rather than the vendor's.

**Approach:** Ship our own consent surface and drive Consent Mode v2 from it, in the register the
design system already speaks. Nothing third-party loads until a player accepts (Consent Mode
**Basic**, globally — Eric ruling R7). The five funnel moments are wired to their ruled call sites
behind one seam so game code never touches `gtag` directly, exactly as `PortalAdapter` keeps ad SDKs
out of game code. A privacy policy page ships at `/privacy` in a reusable page chrome that Story 7.3
inherits, and the whole thing is re-measured against NFR2 with the instrument Story 7.1 built.

## Boundaries & Constraints

**Always:**
- **Nothing third-party loads before consent.** No `gtag.js`, no tag manager, no CMP script in
  `index.html` or on the boot path. The GA4 script is injected only after an explicit Accept, and
  never at all after a Decline. First paint is untouched.
- **The measurement ID is build-time config**, `import.meta.env.VITE_GA_MEASUREMENT_ID`, on the
  mechanism `VITE_WS_URL` already proves. Absent or empty ⇒ the whole analytics layer is inert and
  the bar still works. A fork or a local build must never report into Eric's property.
- **GA4 carries the funnel and nothing else** (NFR19). No callsign, no class, no kills, no placement,
  no match id, no room id, no gameplay state. The only parameter that ships is `mode`
  (`standard` | `soloVsAi`) on `mode_pick`.
- **Consent persists** in `localStorage` as `hullcracker.consent`, matching the existing
  `hullcracker.*` namespace. Every return-to-port is a real `location.reload()`, so without this the
  bar reappears every match.
- Every new surface is built from `--hc-*` tokens. `client/src/__tests__/tokens.test.ts:113` fails
  the suite on a single colour literal.
- The privacy policy describes what is **actually** collected, including the three disclosures that
  are easy to miss (Google Fonts receives every visitor's IP pre-consent; `/liveness?c=` records an
  anonymous per-tab id for 30s; `sessionId` appears in ops log lines), and the callsign being visible
  to strangers.
- Server telemetry does not move. NFR15's stdout lines stay byte-identical.

**Block If:**
- The NFR2 re-measurement shows interactive home crossing the ~10s budget — HALT rather than trim a
  ratified feature to fit.
- Wiring a funnel moment would require sending anything a player typed, or any gameplay state.
- The privacy-policy copy needs a fact not in the verified inventory and not supplied by Eric.

**Never:**
- Do not add Google's CMP, an AdSense script, `ads.txt`, or any ad surface — Story 7.4 owns all of it.
- Do not add a geo-lookup service to decide who sees the bar. There is no client-side geo signal and
  buying one costs a third-party request against NFR2.
- Do not build the How-to-Play page (Story 7.3) — only the chrome it will reuse.
- Do not add a CSP, fix the ungated production `P` toggle, or self-host the Geist faces. All three are
  real and all three are ledger items for 7.8 / 7.6.
- Do not touch `PROTOCOL_VERSION`, `shared/`, or anything on the server's simulation path.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First visit, no stored consent | `hullcracker.consent` absent | Bar shown; **no** GA4 script requested; home fully interactive | — |
| Accept | Player clicks ACCEPT | `granted` stored; `gtag.js` injected once; consent default+update sent; queued funnel events flush | Script load failure is swallowed; game unaffected |
| Decline | Player clicks DECLINE | `denied` stored; script never injected; bar dismissed for good | — |
| Return visit, granted | `hullcracker.consent = granted` | No bar; GA4 initialised on boot | — |
| Return visit, denied | `hullcracker.consent = denied` | No bar; nothing loads, ever | — |
| `localStorage` unavailable | Private mode / storage throws | Bar shows every load; analytics stays off; nothing throws | Fail-open, matching every other `hullcracker.*` reader |
| No measurement ID configured | `VITE_GA_MEASUREMENT_ID` unset | Analytics layer inert; bar still shown and still records the choice | — |
| Requeue | RETURN TO PORT pressed | `requeue` event sent by `sendBeacon` **before** `location.reload()` | Beacon refusal is ignored; reload proceeds |
| Passive 45s room-disposal reload | No player action | **No** `requeue` event | — |
| Auto-requeue after cohort collapse | No player action, no reload | **No** `home`, **no** `mode_pick` | — |
| Refresh-resume into a live match | Resume succeeds | **No** `home`; **no** duplicate `match_start`; `portal.matchStart()` also no longer fires | — |
| Press with no class saved | Class bay opens instead of deploying | **No** `mode_pick` | — |
| Queue cancelled before a seat | Player cancels | `mode_pick` already sent; **no** `match_start` | — |
| `/privacy` requested | Any build, dev or prod | The policy page renders in standard page chrome | — |

</intent-contract>

## Code Map

- `client/index.html` -- unchanged except a `PRIVACY` link is NOT added here; stays free of third-party script tags (NFR2, R7)
- `client/vite.config.ts` -- gains `build.rollupOptions.input` with a second entry so `/privacy` exists
- `client/privacy/index.html` -- the policy page's entry; imports the chrome and the token bridge
- `client/src/privacy/main.ts` -- the policy page's boot: `injectTheme()` + `renderPage()` + the policy body
- `client/src/privacy/policyCopy.ts` -- the policy text as data. FROZEN COPY once Eric approves (the `taglines.ts:7-10` treatment)
- `client/src/ui/page.ts` -- NEW: the reusable standard page chrome (1100px cap, ESC/back returns home). Story 7.3's inheritance (R12)
- `client/src/ui/consentBar.ts` -- NEW: the non-blocking bottom bar (R2), `--hc-*` tokens only
- `client/src/analytics/consent.ts` -- NEW: consent state — read/write `hullcracker.consent`, the region-scoped default call, pure decision logic
- `client/src/analytics/ga.ts` -- NEW: the ONLY module that may touch `gtag`/`dataLayer`. Injects the script on consent, sends the five events
- `client/src/analytics/index.ts` -- NEW: the `Analytics` seam game code calls. Queues events until consent resolves
- `client/src/ui/home.ts` -- `PRIVACY` link beside `HOW TO PLAY` in the underplay row (`:716`); `mode_pick` inside `deploy()` (`:940`)
- `client/src/main.ts` -- `home` at `enterPort()` (`:4327`, only when `autoQueue === false`); `match_start` at `launchSession` (`:4534`); `match_end` latched at `presentResults()` (`:1605`); `requeue` in the RETURN TO PORT chain
- `client/src/audio/tones.ts` -- R13: seed `lastPhase` so a refresh-resume does not trip the live edge
- `client/src/net/liveness.ts` -- one clarifying line so its anti-identifier comment is not read as contradicting GA4 (R3)
- `server/src/log.ts` -- correct the header comment: an ephemeral `sessionId` in an ops line is not PII, and the callers are right
- `client/scripts/loadCapture.mjs` -- the NFR2 instrument; re-run, not re-derived

## Tasks & Acceptance

**Execution:**
- [x] `client/src/analytics/consent.ts` -- consent state + persistence + the Consent Mode v2 default payload -- pure, testable, fail-open on storage errors
- [x] `client/src/analytics/ga.ts` -- script injection on consent, `gtag` calls, the five funnel senders, `sendBeacon` for requeue -- the single site that knows GA4 exists
- [x] `client/src/analytics/index.ts` -- the seam + a pre-consent event queue -- so callers never branch on consent state
- [x] `client/src/ui/consentBar.ts` -- the bottom bar, ACCEPT (amber outline+glow) / DECLINE (unlit phosphor), a `/privacy` link, opacity-fade entrance -- tokens only
- [x] `client/src/ui/page.ts` -- the reusable page chrome -- 1100px cap, ESC/back to home, settings-overlay bed grammar
- [x] `client/privacy/index.html` + `client/src/privacy/main.ts` + `policyCopy.ts` -- the policy page -- real URL, accurate inventory
- [x] `client/vite.config.ts` -- second Rollup entry -- so `dist/privacy/index.html` is emitted and served at `/privacy`
- [x] `client/src/ui/home.ts` -- `PRIVACY` link; `mode_pick` on a press that actually deploys
- [x] `client/src/main.ts` -- wire `home`, `match_start`, `match_end`, `requeue` at the ruled call sites
- [x] `client/src/audio/tones.ts` -- R13 resume guard
- [x] `client/src/net/liveness.ts`, `server/src/log.ts` -- comment corrections of record
- [x] `client/src/__tests__/` -- unit-test the I/O matrix: consent state machine, inertness without an ID, event definitions, queue-then-flush, the resume guard, page chrome, and a pin that `index.html` gains no third-party script
- [x] NFR2 re-measurement -- `loadCapture.mjs` before/after via `HC_DIST`, recorded under `perf-gate/`

**Acceptance Criteria:**
- Given a first-time visitor, when the page loads, then no request to any Google analytics or tag
  domain is made and first paint is unchanged.
- Given the bar is showing, when the player presses SOLO, then the match starts normally — the bar
  never blocks play.
- Given consent is granted, when the player completes home → mode pick → match start → match end →
  requeue, then exactly five funnel events are recorded, in order, carrying no PII and no gameplay
  state beyond `mode`.
- Given consent is denied, when the same journey runs, then zero network requests reach Google.
- Given a granted player returns after a match reload, then the bar does not reappear.
- Given `/privacy` is requested on the built artifact, then the policy renders in the standard page
  chrome and ESC/back returns home.
- Given `npm run check` runs, then lint, three type-checks and the full suite pass.
- Given `loadCapture.mjs` re-runs, then interactive home stays inside NFR2's ~10s budget, and the
  before/after delta is recorded.

## Spec Change Log

## Review Triage Log

### 2026-08-18 — Review pass

- intent_gap: 2: (high 1, medium 1)
- bad_spec: 0
- patch: 15: (high 4, medium 5, low 6)
- defer: 5
- reject: 2
- addressed_findings:
  - `[high]` `[intent_gap]` GA4's Enhanced Measurement and gtag.js's own `session_start`/`first_visit`/`user_engagement` are property-side and uncontrollable by this repo, so the policy's "five moments and nothing else" was untrue and NFR19's pin is structurally blind to it. RESOLVED IN-PASS by Eric ruling R16 rather than by halting: Enhanced Measurement stays ON and the policy widens to name scroll depth, outbound clicks, file downloads, site search and embedded video, stating which this game can realistically produce.
  - `[medium]` `[intent_gap]` No in-product consent withdrawal; the policy directed readers to clear site data, which also destroys callsign/class/colour/settings — the asymmetry GDPR Art. 7(3) names. RESOLVED IN-PASS by Eric ruling R15: a PRIVACY section with an ANALYTICS row in the settings overlay, wired by callback so the overlay stays renderable with no analytics layer.
  - `[high]` `[patch]` The consent card was never torn down on deploy — `hideConsentBar` had no caller outside its own module — so an unanswered card at z-1250 rode into the live HUD and results, and falsified its own same-tab policy-link rationale. Now taken down at the deploy door, recording no answer.
  - `[high]` `[patch]` R13's one-shot was consumed by the first FRAME rather than the first KNOWN phase (`publicState` is `g.room.state ?? {}`, falling back to `'waiting'`), so the guard did not work on a real refresh-resume. Now waits for `matchPhase !== undefined`. The stale rationale claiming the funnel hung on that edge was corrected too.
  - `[high]` `[patch]` The policy claimed "do not track"/cookie-blocking settings are respected; no code reads either signal. Clause deleted and replaced with a true statement about blocked scripts.
  - `[high]` `[patch]` The policy's short version claimed nothing is kept on our servers after a match, contradicting its own SERVER LOGS section. Reworded to carry the exception.
  - `[medium]` `[patch]` `transport_type` shipped as a second event parameter under a documented NFR19 exception; moved onto `config`, so "only `mode` ships" is now literally true.
  - `[medium]` `[patch]` The static third-party-script guard read `index.html` only, leaving `privacy/index.html` unguarded — the newer page and the natural place to paste a CMP snippet. Both pages now scanned; the privacy page's single-script shape pinned.
  - `[medium]` `[patch]` `match_end` never fired on ABANDON MATCH (`match_start -> requeue` with no end). Both real exits now route through a shared latched `sendMatchEndOnce()`.
  - `[medium]` `[patch]` `match_end` could fire on a refresh-resumed match that never reported a `match_start`. Gated on a module-level `funnelStartSent`.
  - `[medium]` `[patch]` The dev-server `/privacy` redirect dropped the query string, diverging from `express.static` for any shared link carrying `?utm_source=`.
  - `[low]` `[patch]` The redirect did not cover `vite preview`, the closest local stand-in for production. `configurePreviewServer` added.
  - `[low]` `[patch]` The pre-consent queue evicted its OLDEST entry — `home`, the reason the queue exists — so an overflowing funnel flushed with no beginning. Now drops the newest.
  - `[low]` `[patch]` `activate()` cleared the queue before knowing the tag would build, so a `startGa` throw discarded queued events with no retry. Reordered.
  - `[low]` `[patch]` The policy overstated liveness expiry as a hard 30s delete; expiry is lazy (fields clear as later polls walk the hash). Reworded to "stops counting".
  - `[low]` `[patch]` (found before the gate) The storage inventory described `hullcracker.session` as a match-resume token when it is the single-session lock, and omitted the legacy `hullcracker-muted` key.

## Design Notes

**Why the analytics seam mirrors `PortalAdapter`.** `client/src/portal/portalAdapter.ts:25-39` is the
project's ratified answer to "a third-party SDK must not reach into game code": one interface, one
null implementation, a `safeAdapter` that swallows throws, and a rule that only modules under
`portal/` may import the SDK. Analytics gets the same shape — `client/src/analytics/ga.ts` is the
only file permitted to name `gtag` or `dataLayer` — because the failure mode is identical: an ad
blocker, a blocked domain or a thrown initialiser must never reach the render loop.

**Why Basic mode makes the bar non-blocking honest.** Under R7 nothing loads until Accept, so a
player who ignores the bar is already fully unmeasured. The bar therefore has nothing to protect by
standing in the way, which is what makes R2 coherent rather than a lax reading of the AC. The
accepted cost is stated in amendment 14 and must not be quietly re-litigated by adding an
auto-accept, a timeout, or an "essential analytics" carve-out.

**The `match_end` latch.** `presentResults()` (`client/src/main.ts:1605`) is the single funnel point
both openers pass through — `showEliminationResults` (`:1557`) and `showMatchResults` (`:1582`) — so
one latch there gives R5's "whichever comes first, once per match" with no second detector to drift.

## Verification

**Commands:**
- `npm run check` -- expected: lint clean, three type-checks clean, full suite green (5127 tests + the new ones)
- `npm run build` -- expected: succeeds, and `client/dist/privacy/index.html` exists
- `node client/scripts/readabilityCapture.mjs --verify-bundle` -- expected: still passes (NFR17 dead-strip intact)
- `node client/scripts/loadCapture.mjs` -- expected: interactive home inside the ~10s budget on the throttled residential profile

**Manual checks (if no CLI):**
- Load the built client with a cold cache and confirm in devtools that no `googletagmanager.com` /
  `google-analytics.com` request is made before pressing ACCEPT, and that one is made after.
