---
title: 'Sprint Change Proposal — Epic 7 Rescope: Portal Launch → Self-Published Beta'
date: '2026-08-18'
trigger: 'Strategic pivot (Eric, 2026-08-18) — distribution, monetization and hosting model all change before Epic 7 begins'
scope_classification: 'MAJOR — epic redefinition + requirements inventory changes'
mode: 'Batch (decisions pre-collected via question gate)'
status: 'awaiting-approval'
supersedes_partially: '_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-19.md (unrelated scope — three-class re-scope; no conflict)'
---

# Sprint Change Proposal — Epic 7 Rescope

## Section 1 — Issue Summary

### Problem statement

Epic 7 was planned as **Portal Launch Readiness**: ship the beta on Poki/CrazyGames, with a
low-end Chromebook as the permanent reference device. On 2026-08-18, before any Epic 7 story
work began, Eric changed the distribution, monetization and hosting model:

> *"I no longer wish to release to a portal site, I think this would be a terrible idea and
> I'd like to control my own ad placements and servers and everything. I do not care about
> chromebook enough to acquire one, and frankly if it runs as well as it does on my i7
> macbook (old now) then i think it will be fine. The How to Play Page is still relevant. But
> we need to rescope this epic to include integrating google analytics, integrating google
> adsense (including figuring out good, non-intrusive ad placements — this needs research),
> and getting the server prepared (should we split things into multiple services, like the
> game server, matchmaking server, etc?)."*

Followed by:

> *"Additional things: v2 of the upgrade cards: changes to battleship, changes to mines and
> buoy, balance."*

And on hosting, after the service-split question was answered:

> *"i like your first suggestion of the static site and game server, but can't we stay on
> render for now? I don't mind vertically scaling the game server right now. I have friends
> that are playing from south america with low latency. I just want to able to re-version
> this project, giving the server, client, and any individual services their own version
> numbers."*

### Issue category

**Strategic pivot.** Not a technical limitation, not a misunderstanding of requirements, and
not a failed approach. The plan was sound for the distribution model it assumed; the
distribution model changed.

### Context — when and how discovered

Discovered at the cleanest possible moment: **after the Epic 6 retrospective, before
`create-story 7.1`.** Zero Epic 7 implementation exists. No work is thrown away.

The Epic 6 retrospective (2026-08-18) independently recommended *"a short Epic 7 planning
review before create-story 7.1"* on the strength of three findings of its own. This proposal
is that review, widened by the pivot.

### Evidence

| Evidence | Source |
|---|---|
| Epic 7 as written is 100% portal-framed — Story 7.3 is entirely Poki/CrazyGames | `epics.md` Epic 7 |
| NFR1, NFR2, NFR8 all name portal or Chromebook constraints | `epics.md:90,91,97` |
| Chromebook acquisition was Epic 7's stated critical path | epic-6 retro, action item #10 |
| The portal ad-break seam already exists and is unused | `client/src/portal/` (Story 0.4) |
| One Render service serves both client and game server today | `server/src/app.config.ts:66` |
| All three workspaces carry a stub version `0.1.0`; only root is real | `*/package.json` |
| Four upgrade-card rulings made, full plan held by Eric for the story | Eric, 2026-08-18 (see Story 7.5) |
| Three Epic 6 findings already change what Epic 7's stories must contain | epic-6 retro §Significant Discovery |

---

## Section 2 — Impact Analysis

### 2.1 Epic impact

**Epic 7 cannot be completed as planned.** One of six stories (7.3, Portal SDK Integrations)
is invalidated outright; two more (7.1, 7.2) are gated on a device that will never be
acquired. Three new workstreams have no home in the current plan.

**Epics 0–6 are unaffected.** No shipped behaviour changes, no wire contract moves, and no
completed story is invalidated. The single asset built *for* the portal — the Story 0.4
`PortalAdapter` seam — **survives the pivot intact** and is retargeted rather than deleted
(see §2.4).

**No new epic is required for launch work**; Epic 7 absorbs all of it. The upgrade-cards v2
pass enters Epic 7 as one story, per Eric's ruling, with its plan delivered at the story.

### 2.2 Story impact

| Old story | Verdict | New # | Reason |
|---|---|---|---|
| 7.1 Chromebook Performance Pass | **RESCOPE + MERGE** | **7.1** | Reference device rebases to Eric's i7 MacBook; merges with old 7.2 (both were gated on the same absent hardware) |
| 7.2 Ten-Second Load | **MERGE** | **7.1** | Loses its portal-network framing; the load budget survives on its own merits |
| 7.3 Portal SDK Integrations | **REPLACE** | **7.4** | Poki/CrazyGames deleted; becomes AdSense H5 Games Ads |
| 7.4 How-to-Play Page | **SURVIVES** | **7.3** | Explicitly confirmed still relevant; promoted to a beta gate |
| 7.5 DESIGN.md Real-Time Refresh | **SURVIVES, WIDENED** | **7.6** | Reconciliation list grew by ≥4 Epic 6 items plus this proposal's own doc changes |
| 7.6 The Release Gate | **SURVIVES, WIDENED** | **7.8** | Absorbs `loadTest.mjs` construction and the solo-create cost ruling |
| — | **NEW** | **7.2** | Analytics, consent & privacy |
| — | **NEW** | **7.5** | Upgrade cards v2 |
| — | **NEW** | **7.7** | Frontend/backend split + per-service versioning — **sequenced LAST** (Eric, 2026-08-18) so beta cuts clean at `0.1.0` / `0.1.0` |

Net: **6 stories → 8 stories.** Numbering matches execution order.

### 2.3 Requirements inventory conflicts

Five requirements contain portal or Chromebook language that is now false:

- **NFR1** — names a low-end school Chromebook as the reference device
- **NFR2** — "Portal click → playable in under ~10 s"
- **NFR8** — "Poki/CrazyGames portal compliance… a hard launch gate"
- **NFR9** — procedural assets justified by "portal size limits"
- **NFR10** — horizontal scale-out framing predates the accepted vertical-scaling posture

Two architecture decisions are superseded:

- **AR1** — the Track-2 hosting move (game server → Colyseus Cloud, site → static hosting)
- **AR11** — the portal adapter seam, specced against Poki/CrazyGames SDK shapes

One requirement is **struck entirely**: NFR8's portal clause. Its replacement is a different
obligation, not a reworded one.

### 2.4 Technical impact

**The Story 0.4 seam survives the pivot — this is the single luckiest fact in the change.**
Google's Ad Placement API surface is:

```js
adConfig({ preloadAdBreaks, sound })
adBreak({ type, name, beforeAd, afterAd, adBreakDone })   // types: preroll|start|pause|next|browse|reward
```

That maps 1:1 onto `PortalAdapter.requestAdBreak(): Promise<void>`, already awaited in
`returnToPort()` before `room.leave()`/reload. The seam's ratified contract — *"implementations
must never throw and returned promises must always settle; callers proceed on rejection as if
it resolved (never strand the player on an ad)"* — is **exactly** the contract an ad-blocked
or script-failed AdSense integration needs. `safeAdapter.ts` already enforces it.

AR11's judgement to install the seam at Epic 0 rather than Epic 7 has now paid off against a
portal integration that will never happen. **Retarget, do not delete.**

**The split itself is small and well-bounded:**

| Change | Location | Size |
|---|---|---|
| Stop serving `client/dist` from the game server | `server/src/app.config.ts:66` | one line deleted |
| Game-server URL becomes build-time client config | `client/src/net/connection.ts` | small |
| CORS + WebSocket origin allowances | server | small |
| Per-workspace versions (all three are stub `0.1.0`) | `*/package.json` | mechanical |
| `__APP_VERSION__` reads client's own package, not root | `client/vite.config.ts:7` | one line |
| Second Render service (Static Site) | `render.yaml` | additive |

**`shared/` is not a third deployable.** It is a build-time library both sides compile
against — the determinism story depends on both sides running byte-identical sim functions.
It carries a version because a client/server mismatch is real, but it never deploys alone.
`PROTOCOL_VERSION` (currently 40) remains the runtime compatibility gate and is **independent
of every release version** — this is what makes independent versioning safe.

**New attack surface, flagged:** the split makes the game-server origin publicly and
separately addressable. The already-ledgered unauthenticated solo-create cost vector
(`deferred-work.md:1150` — a bare `POST /matchmake/create/arena` mints a full 20-hull
simulating room, no rate limit anywhere) becomes **more** exposed, not less. It was already an
Epic 7 hardening item and an open Eric ruling; the split raises its priority.

### 2.5 Ledger and retro items this change moves

**Closed by this proposal:**

| Item | Status |
|---|---|
| "ACQUIRE THE REFERENCE CHROMEBOOK — Epic 7's true critical path" (`sprint-status.yaml`, retro #10) | ✅ **CLOSED** — no device will be acquired |
| Portal bundle-size limits as a hard gate (NFR9's stated rationale) | ✅ **CLOSED** — constraint survives, gate does not |
| epic-5 amendment 46(c): win condition readable nowhere by a new player | ✅ **ADDRESSED** — Story 7.4 promoted to a beta gate, with the win condition named in its AC |

**Premise changed, needs re-reading:**

| Item | Change |
|---|---|
| Home liveness block overlaps the wordmark below 768px (`deferred-work.md:1178`) | Its stated urgency was *"Epic 7 names Chromebooks as a target, so real users will land here."* **That premise is now false.** Still a real ≤720p collision and still unruled — but re-derive the priority rather than inheriting it |

**Carried into Epic 7 unchanged (all still open):**

- `loadTest.mjs` does not exist and Story 7.8's AC names it — third epic assumed present
- The unauthenticated solo-create cost vector — unruled, now more exposed (§2.4)
- Story 7.7's reconciliation list is ≥4 items longer than its AC says
- NFR1 whole-frame read never obtained across three epics of growth
- Deferred-work triage — 250 entries, untriaged since 2026-07-18, third epic carried
- Two bot quality bars fail by design-of-bar, unruled
- **A full-roster multiplayer playtest, four retrospectives overdue** — still the highest-value item available, and now the last chance before strangers arrive

---

## Section 3 — Recommended Approach

### Path selected: **Direct Adjustment** (redefine Epic 7 in place)

Not a rollback — nothing built needs reverting. Not an MVP reduction — scope grows. Epic 7 is
redefined and its requirements inventory corrected.

**Rationale:** the pivot landed before any Epic 7 code existed, and every prior epic is
untouched. The only "waste" is planning text, and the one artifact built specifically for the
abandoned model (the portal seam) is directly reusable. This is the cheapest possible moment
for this change, and no alternative path buys anything.

### Effort and risk

| Story | Effort | Risk | Notes |
|---|---|---|---|
| 7.1 Performance & load | Medium | Medium | Three epics of unmeasured growth; may surface real work |
| 7.2 Analytics + consent + privacy | Medium | **Medium** | Consent Mode v2 + CMP is fiddly; it also puts a banner in front of a new player |
| 7.3 How-to-Play | Medium | Low | Content work; boon glossary already drafted (Story 2.8) |
| 7.4 AdSense integration | Small (code) | **HIGH — external** | Code is small behind the existing seam. **Approval is not ours to schedule** |
| 7.5 Upgrade cards v2 | **Large** | **Medium** | Eric holds the plan, so the design risk is retired. What remains is surface area: a weapon deleted, a new arc-limited weapon built, and per-card retooling across four subdecks |
| 7.6 Doc reconciliation | Medium | Low | Known list, now enumerated |
| 7.7 Split + versioning | Small–Medium | **Low–Medium** | Mostly config; one deleted line is the crux. Risk ticks up only because it now lands late, so a cross-origin surprise has less runway |
| 7.8 Release gate | Medium | Medium | Includes building `loadTest.mjs` from scratch, **and is the first verification the split topology gets** |

### ⚠️ The new critical path is AdSense approval, and it replaces the Chromebook

The Chromebook was Epic 7's stated critical path — hardware, not code. **It is now AdSense
approval**, and it has the same shape: an external dependency with lead time that no amount of
engineering removes.

H5 Games Ads requires an approved AdSense account **and** a separate application, with access
*"subject to partner eligibility."* AdSense review generally expects a live site with real
content and a published privacy policy. That produces a hard sequence:

```
7.2 privacy policy + analytics published (on the CURRENT single service — no split needed)
  → APPLY FOR ADSENSE + H5 GAMES ADS ...................... ← start this the day 7.2 lands
    → (review latency, not ours to control)
      → 7.4 integrate against the approved account
```

**Deferring the split to the end shortened this path.** The site is already live at
hullcracker.io, so the AdSense application needs only the privacy policy — not the new
topology. The application can start earlier than the original plan allowed.

**One constraint the split must respect because of it:** AdSense approval and GA4 property are
**per-domain**. Keep the **client on the apex domain** (`hullcracker.io`) and move the **game
server to a subdomain** (e.g. `game.hullcracker.io`). If the client moved instead, ad approval
and analytics history would be pointing at the wrong host after a late-epic change.

**Recommendation: Eric should start the AdSense account application as early as it will be
accepted** — in parallel with story work, exactly as the Chromebook acquisition was meant to
be. Every other story has no dependency on it and proceeds regardless. If approval slips past
everything else, **beta can launch ad-free and ads can land as a client-only deploy
afterward** — which is precisely what the frontend/backend split buys us, and is worth noting
as the risk mitigation it is.

### Sequencing

```
7.1 Performance & load (early read)  ← the retro asked for a cheap read three epics running
7.2 Analytics + consent              ← unblocks the AdSense application immediately
7.3 How-to-Play                      ← independent; content-heavy
7.4 AdSense                          ← gated on external approval
7.5 Upgrade cards v2                 ← independent of all launch infra; Eric's plan first
7.6 Doc reconciliation               ← wants the gameplay changes settled
7.7 Split + versioning               ← LAST BUILD STORY (Eric, 2026-08-18); beta cuts at 0.1.0/0.1.0
7.8 Release gate                     ← final verification, ON THE SPLIT TOPOLOGY
```

**Story numbering now matches execution order** — the split moved from first to last on Eric's
ruling, and everything ahead of it shifted up one.

> **Why the release gate still comes after the split, not before.** Eric's ruling is that the
> split is **last**; the release gate is not a build story but the verification pass over
> whatever shipped. Running it before the split would validate a topology that is about to
> change — including the browser matrix, the debug-strip check, and the "full pipeline on
> production" clause, all of which move when the origins do. So the split is the **last thing
> built** and the gate is the **last thing run.** If Eric wants the gate to precede the split
> literally, that is a one-line reorder, but it would mean shipping beta on a topology the gate
> never saw.

### Timeline impact

Epic 7 grows from 6 stories to 8, with one (7.5) carrying an unresolved design question and
one (7.3) carrying an external dependency. **Beta is later than the old plan implied** — but
the old plan's own critical path was a device Eric was never going to buy, so the comparison
is against a schedule that could not have held either.

---

## Section 4 — Detailed Change Proposals

### 4.1 Requirements inventory — `_bmad-output/planning-artifacts/epics.md`

---

**NFR1 — reference device**

> **OLD:** NFR1: 60 FPS sustained on a low-end school Chromebook in a fully populated match —
> 20 contestants plus PvE fleets, in-flight ordnance, and all E6 effects. Per-epic frame
> budget on the reference device (Chrome at 4× CPU throttle until a real Chromebook is
> benched): 16.6 ms = sim ≤ 3 ms + render ≤ 10 ms + headroom ≥ 3.6 ms.

> **NEW:** NFR1: 60 FPS sustained on the **reference device — Eric's Intel i7 MacBook** — in a
> fully populated match: 20 contestants plus PvE fleets, in-flight ordnance, and all shipped
> effects. Frame budget on that device: 16.6 ms = sim ≤ 3 ms + render ≤ 10 ms + headroom ≥
> 3.6 ms. **The Chromebook target is RETIRED (Eric, 2026-08-18): no low-end reference device
> will be acquired, and the reference MacBook's performance is accepted as the bar.** The 4×
> CPU throttle proxy is retained as a cheap stress check, never as the gate.

*Rationale:* Eric — *"I do not care about chromebook enough to acquire one, and frankly if it
runs as well as it does on my i7 macbook (old now) then i think it will be fine."* Closes Epic
7's previously-stated critical path.

*Open detail for story time:* the exact MacBook model/year should be stamped into the story so
the bar is reproducible by anyone but Eric.

---

**NFR2 — load budget**

> **OLD:** NFR2: Portal click → playable in under ~10 s on that hardware; no install, no account.

> **NEW:** NFR2: **Cold load → playable in under ~10 s** on the reference device over a typical
> residential connection; no install, no account. **Ad, analytics and consent scripts count
> against this budget** and must not block first paint.

*Rationale:* the target survives its portal framing; the new third-party scripts are a real new
threat to it and must be named in the requirement rather than discovered at 7.6.

---

**NFR8 — monetization compliance (struck and replaced)**

> **OLD:** NFR8: Poki/CrazyGames portal compliance: bundle size limits, SDK integration,
> ad-break seam at death→requeue — a hard launch gate.

> **NEW:** NFR8: **Self-published monetization compliance — a hard launch gate.** Google AdSense
> **H5 Games Ads** (Ad Placement API) integrated behind the Story 0.4 seam; **interstitial at
> death→return-to-port**; **display units on the home/port screen and How-to-Play only**, ≥150
> px clear of the game canvas; **no ad surface of any kind during a match**. A **Google-certified
> CMP** (Google's own free CMP) plus a **published privacy policy** gate personalized ads in the
> EEA/UK/Switzerland. **No portal (Poki/CrazyGames) integration ships** — Eric, 2026-08-18. The
> game must remain fully playable when ad scripts are blocked or fail.

*Rationale:* Eric's pivot plus the placement research. The 150 px clearance rule and the
"natural transition points" restriction are Google policy, not preference. The
never-strand-the-player clause is inherited verbatim from the Story 0.4 contract.

---

**NFR9 — asset pipeline (rationale rebase only)**

> **OLD:** NFR9: Assets are procedural vector linework and synthesized WebAudio tones — no
> texture, model, or sound-file pipeline.

> **NEW:** NFR9: Assets are procedural vector linework and synthesized WebAudio tones — no
> texture, model, or sound-file pipeline. *(The constraint's original justification was portal
> bundle-size limits; with the portal gone it now stands on NFR2's load budget. The constraint
> survives its reason — it is not relaxed.)*

*Rationale:* minimal edit. A shipped, load-bearing constraint should not silently lose its
justification when the justification changes — but neither should it be re-litigated.

---

**NFR10 — scale posture**

> **OLD:** NFR10: Horizontal scale-out as a deploy-time knob: no single-process assumptions;
> Presence/Driver injectable (memory → Redis as config); never enable Render autoscaling.

> **NEW:** NFR10: Horizontal scale-out as a deploy-time knob: no single-process assumptions;
> Presence/Driver injectable (memory → Redis as config); **never enable Render autoscaling.**
> **Beta posture is a single VERTICALLY scaled game-server instance on Render** (Eric,
> 2026-08-18 — *"I don't mind vertically scaling the game server right now"*); horizontal
> scale-out stays a knob, explicitly **not** beta work.

*Rationale:* the code obligations are unchanged and still binding — what changes is that
horizontal scale-out is now explicitly out of Epic 7's scope rather than implicitly looming.
The autoscaling prohibition is untouched and remains critical.

---

**NEW — NFR18: Deployment topology**

> NFR18: **Two deployables.** The client ships as a **Render Static Site** (`client/dist`,
> CDN-served, no Node process) on the **apex domain**; the game server ships as a **Render Web
> Service** running only the Colyseus arena, on a **subdomain** (ad and analytics identity is
> per-domain and must not move). `shared/` is a build-time library of both and is **never
> deployed independently**. Each deployable carries **its own version number**, cutting
> **`0.1.0` at beta**; the game-server URL is build-time client config; the server declares
> explicit CORS and WebSocket origin allowances. `PROTOCOL_VERSION` remains the runtime
> client↔server compatibility gate and is independent of every release version.

---

**NEW — NFR19: Analytics and privacy**

> NFR19: **Google Analytics 4 with Consent Mode v2**, loaded on the static site only and gated
> by the certified CMP. **No PII, ever** — consistent with NFR14 (client-side localStorage only,
> no accounts, no server player DB). Match telemetry remains stdout log lines per NFR15; GA4
> measures the site and funnel (home → mode pick → match start → match end → requeue), never
> gameplay state.

---

**NEW — FR39: How-to-Play page**

> FR39: A static **How to Play** page, linked from home (ESC/back returns), teaches the controls,
> the three sensor tiers, the storm rhythm, classes and slot grammar, the boon economy, and
> **states the win condition explicitly**; it hosts the boon glossary and positions Solo vs AI as
> the live tutorial.

*Rationale:* the page had a story but no requirement. Adding one gives epic-5 amendment 46(c) —
*"the win condition is now stated nowhere a new player can read"* — a permanent home rather than
a ledger entry.

---

**NEW — FR40: Ad break placement**

> FR40: One **interstitial ad break at death→return-to-port**, requested through the Story 0.4
> `PortalAdapter` seam and awaited before the room leave/reload. Audio mutes for the break and
> restores after. **No ad interrupts a live match.** If the break fails, is blocked, or never
> resolves, the player proceeds exactly as if it had completed.

---

### 4.2 Architecture decisions — `_bmad-output/game-architecture.md`

---

**AR1 — hosting (Track-2 superseded)**

> **OLD (excerpt):** The Track-2 hosting move (game server → Colyseus Cloud, client/site →
> static hosting, Redis-backed Presence/Driver) is a separate, trigger-based item: it happens
> before the first public/stranger link, at Eric's call.

> **NEW:** **SUPERSEDED IN PART (Eric, 2026-08-18).** The trigger fired — open beta is the first
> public link — but the destination changed. **The client/site → static hosting half IS
> executed** (Story 7.7, as a Render Static Site). **The game server → Colyseus Cloud half is
> NOT**: Eric elected to stay on Render and scale vertically, retaining control of his own
> servers. Redis-backed Presence/Driver is therefore **deferred with it** — a single instance
> needs no shared registry, and the injectability obligation (NFR10) is what keeps the door open.
> The standing warning is unchanged and still load-bearing: **Render cannot host Colyseus
> horizontal scale-out (no WebSocket sticky sessions), and Render autoscaling must never be
> enabled** — it would actively break matchmaking. Vertical scaling only.

*Correction of record, worth stating once:* **matchmaking is not a separable service.** In
Colyseus 0.17 the matchmaker is a library every process shares through Presence/Driver, not a
deployable tier. Eric's question — *"should we split things into multiple services, like the game
server, matchmaking server, etc?"* — is answered: **two deployables, frontend and backend.** A
third "matchmaking service" is not something the framework offers, and building one would mean
replacing Colyseus's matchmaker rather than deploying it.

---

**AR11 — the portal seam is retargeted, not retired**

> **OLD:** AR11: Portal adapter seam installed NOW (not at E7): `PortalAdapter { init,
> loadingProgress, matchStart, matchEnd, requestAdBreak }` with a null implementation; game code
> never imports a portal SDK directly; the death→requeue flow routes through `requestAdBreak`.

> **NEW:** AR11: The ad/lifecycle adapter seam, installed at Epic 0 (Story 0.4): `PortalAdapter
> { init, loadingProgress, matchStart, matchEnd, requestAdBreak }` with a null implementation;
> **game code never imports an ad SDK directly**; the death→requeue flow routes through
> `requestAdBreak`. **RETARGETED (Eric, 2026-08-18): the concrete implementation is Google
> AdSense H5 Games Ads (Ad Placement API), not Poki/CrazyGames.** The seam is unchanged —
> `adBreak({type:'next', beforeAd, afterAd, adBreakDone})` fits `requestAdBreak(): Promise<void>`
> exactly, and the seam's never-throw / always-settle contract is precisely what an ad-blocked
> integration requires. *The interface name is retained deliberately: renaming ratified code to
> match a changed destination is churn, and `safeAdapter.ts`'s guarantees are the valuable part.*

---

### 4.3 Epic 7 — full restructure

**Title:** ~~Epic 7: Portal Launch Readiness~~ → **Epic 7: Beta Launch Readiness**

**Summary:** ~~The beta, live on a portal: Chromebook 60 FPS…~~ → **The beta, self-published:
split frontend/backend deploys with independent versions, our own analytics and ad placements, a
How-to-Play page, an upgrade-card rebalance, and the release gate.**

---

#### Story 7.1 — Performance & Load Pass *(MERGES old 7.1 + 7.2, device rebased)*

> As the operator,
> I want the frame budget and the load budget verified on a device that actually exists,
> So that beta's performance claim is measured rather than assumed.

**Acceptance Criteria**

- **Given** the **reference i7 MacBook** (NFR1 as amended — the Chromebook is retired)
- **When** the reference scenario runs — 20 contestants + full PvE fleets + in-flight ordnance + all shipped effects
- **Then** 60 FPS sustains with the frame budget holding (sim ≤ 3 ms, render ≤ 10 ms, headroom ≥ 3.6 ms) (NFR1)
- **And** any breach is fixed at the offending system (pooling, batching, decay caps) — never by cutting a ratified feature without Eric's sign-off
- **And** cold load to interactive home lands under ~10 s **including ad, analytics and consent scripts** (NFR2), with fonts not blocking first paint
- **And** the perf overlay evidence (frame-time split, entity counts) and the load waterfall are captured as the audit record.

> **Take the cheap read FIRST.** The whole-frame NFR1 verdict has never been obtained and now
> carries **three epics** of unmeasured growth (return heatmap, radar shadows, wakes, chop, a 2800 u
> ocean, up to 63 fleet hulls, 20-hull bot lobbies, the reveal chart). Three consecutive
> retrospectives asked for a rough early read. **The device excuse is now gone — the reference
> device is the machine this is being built on.**

---

#### Story 7.2 — Analytics, Consent & Privacy *(NEW)*

> As the operator,
> I want to know how players find, enter and leave the game — lawfully,
> So that beta produces evidence instead of impressions.

**Acceptance Criteria**

- **Given** the static site from 7.1
- **When** analytics lands
- **Then** **GA4 with Consent Mode v2** measures the funnel (home → mode pick → match start → match end → requeue) and **never** carries PII or gameplay state (NFR14/NFR19)
- **And** a **Google-certified CMP** (Google's own free CMP) gates personalized ads and analytics storage in the EEA/UK/Switzerland, per Eric's 2026-08-18 ruling
- **And** a **privacy policy page** is published in standard page chrome and linked from home and How-to-Play
- **And** neither analytics nor consent blocks first paint, and both are counted against NFR2's 10 s budget with the measurement recorded
- **And** the consent banner is designed to DESIGN.md's register rather than shipped as vendor default — it is the first thing a new player sees, and it sits between them and the water.

---

#### Story 7.3 — How-to-Play Page *(SURVIVES — promoted to beta gate)*

Acceptance criteria as originally written, plus:

- **And** it **states the win condition explicitly** (FR39) — closing epic-5 amendment 46(c), which found it stated nowhere a new player can read
- **And** it carries the privacy-policy link and, per 7.3, may carry one display unit
- **And** it is a **beta launch gate**, not optional polish: Solo vs AI is positioned as the tutorial, and with strangers arriving there is no other onboarding surface.

---

#### Story 7.4 — AdSense H5 Games Ads *(REPLACES Portal SDK Integrations)*

> As the operator,
> I want my own ad placements, in the two places this game has room for them,
> So that the beta earns without ever interrupting a match.

**Acceptance Criteria**

- **Given** an approved AdSense account with H5 Games Ads access, and the Story 0.4 seam
- **When** the integration lands
- **Then** a concrete adapter implements `PortalAdapter` against the **Ad Placement API** (`adConfig()` + `adBreak()`), and **game code still never imports an ad SDK directly**
- **And** an **interstitial fires at death→return-to-port** through `requestAdBreak()`, with audio muted for the break and match/UI state intact after (FR40)
- **And** **display units appear on the home/port screen and How-to-Play only**, ≥150 px clear of the game canvas, with **no ad surface during a live match**
- **And** the game remains fully playable with ads blocked, failing, or never resolving — the never-strand-the-player contract is tested, not assumed
- **And** ad script cost is measured against NFR2.

> **⚠️ EXTERNAL DEPENDENCY — the critical path.** H5 Games Ads requires an approved AdSense
> account plus a separate application, subject to partner eligibility, and review generally
> expects a live site with content and a published privacy policy. **Eric should apply as soon as
> 7.2 lands.** No other story depends on this one, and **beta can launch ad-free with ads
> following as a client-only deploy** — which is exactly what the 7.7 split buys, and the
> reason deferring the split does not endanger the ad revenue.

---

#### Story 7.5 — Upgrade Cards v2 *(NEW — Eric's plan, delivered at the story)*

> As the designer (Eric),
> I want the Battleship's armament replaced, the mines and buoy changed, mutual exclusivity
> removed, and the affected cards retooled as added verbs,
> So that beta launches on a catalog where every card adds something and no card is dead.

**Structure:** **Eric holds the plan.** It is delivered in full when the story is reached
(Eric, 2026-08-18). This story therefore opens with him stating it, and **does not proceed to
implementation until it is stated** — per standing project law, an implementer may not invent
game mechanics. What follows is *not* a design proposal: it is the four rulings already made,
plus the structural consequences the story must carry so they are not discovered mid-build.

**Also in scope from Eric's 2026-08-18 scoping message, and not yet ruled on in detail:**
changes to **mines** and to the **buoy**.

**Rulings already made (Eric, 2026-08-18):**

1. **The cannon is REMOVED from the game.**
2. **The Battleship gets a BROADSIDE BARRAGE** in its place.
3. **Mutually exclusive upgrades are REMOVED** — "at least for now."
4. **SOME existing cards are retooled to work as "added verbs."** Specifically: the
   formerly-exclusive cards that **stay in the game** need retooling. A card authored as one
   half of an either/or has to work as a standalone addition once nothing is opposing it.
   **This is retooling, not deletion** — which cards stay, and how each is retooled, is part
   of the plan Eric delivers at the story.

> **The forge sessions are IRRELEVANT to this story** (Eric, 2026-08-18) and must not be
> mined for direction. `boon-deck-rebalance` and `loadout-equipment-rework` are superseded by
> Eric's own plan; do not cite their locks, kills or directions as input. They are left in
> place as history only.

**Structural consequences to carry into the story — verified against the code, not proposed:**

*From removing the cannon:*

- The **cannon subdeck deletes entirely** — 7 cards since cycle 93 (5 commons + `cannonArcing`/`cannonAp`) plus the `acquireCannon` acquisition card. Every deck-size test moves.
- `CannonMode` in `stats.ts` goes dead, and **`shell.ts:412`'s plunging-fire branch loses its only consumer** — `shell.arcing` is set by nothing else.
- **Deleting AP orphans a ratified clause.** Epic-4 amendment 17 fixed *"exactly one `hc` per shell resolution even when an AP shell pierces several hulls."* With AP gone the clause survives with nothing to exercise it; it should be explicitly retired or re-homed rather than left dangling.
- The 2026-08-04 global-cooldown ruling drove **base cannon reload 15 s → 50 s → 45 s**; that tuning history retires with the weapon, and nothing else should inherit those numbers by accident.
- `loadout.ts:124` (Battleship = cannon + starShells) changes, and the **`bulwark`/`siege` bot profiles** need rework — Story 6-4's per-profile boon weights carry per-line overrides that will reference deleted lines.

*From the broadside barrage:*

- **It is the first non-360° weapon of the class era.** `gun`/`cannon`/`starShells` are all `arc: 'full'`, ratified 2026-07-23 as *"360° with no mounts and no arc."* A broadside is a **mounted** weapon, which re-activates FR6 (mouse aim constrained to the selected weapon's arc) and FR12 (explicit denial, never silence) on a path the gun family has never exercised.
- **`ArcShape` has no twin-sector kind.** It supports `full`, `sector` (torpedo bow, mine rear), `stern-drop` and `none`. A true port/starboard broadside needs either a new arc kind or a single wide beam sector — a design call, not an implementer's pick. Once the kind exists, enforcement and rendering come free: **both sides consume `arcs.ts`, so the enforced arc and the rendered arc cannot diverge.**
- **"Barrage" implies a salvo**, and every existing weapon fires one projectile per activation. Multiple shells per activation touches the ammo pool, the reload contract, and the perception surface — a salvo's `mz` muzzle flashes, `sp` splashes and `hc` Hit Calls all multiply, against rows whose volume nobody has costed.

*From removing mutual exclusivity:*

- **The exclusivity spans 8 cards / 4 pairs**, not one: cannon (`cannonArcing`/`cannonAp` — dying with the weapon), **torpedoes** (`torpedoHoming`/`torpedoCommand`), **mines** (`mineSelfPropelled`/`minePropFouling`) and **star shells** (`starIncendiary`/`starDazzle`). **The six non-cannon cards are candidates to STAY** (per ruling 4) — which ones do is Eric's plan, not an inference to be drawn here.
- **The load-bearing consequence: `mode` is single-valued per weapon.** `boons.ts` states *"only one doctrine"* — `doctrine` effects fold into a per-weapon `mode` field on `EffectiveStats`, and two simultaneously-held doctrines **cannot both set it**. So a surviving pair cannot simply have its `exclusiveWith` link deleted and be left alone: **this is precisely why ruling 4 says those cards need retooling.** A card that currently *switches a mode* has to become a card that *adds a verb*. Rulings 3 and 4 are one change, not two.
- **The retooling is per-card design work, not a mechanical sweep.** Each surviving card was authored knowing exactly what it was traded against; standing alone, each needs its own answer. `minePropFouling` is the worked example already on record — cycle 95 stripped its bundled `mult: 0.6` damage penalty and ruled it *"a pure behaviour change,"* explicitly noting that this turned it from a side-grade into a pure upgrade, *"so taking a doctrine at all is strictly correct."* That is the exact pressure every de-exclusived card now comes under.
- `validateBoonDef`/`validateCatalog` enforce **`exclusiveWith` symmetry**; that validation changes rather than simply relaxing, and it must not be loosened into accepting a dangling one-sided link.
- **A deck refill path disappears.** `deferred-work.md:972` records exactly two — *doctrine return* and *acquisition subdeck*. If doctrines stop returning cards to the deck, that entry's terminal empty-deck analysis must be **re-derived**, not assumed still-safe.

*Alignment worth naming:* ruling 4 is a **return to ratified intent, not a new direction** —
FR20 already specifies *"Hades-style: qualitative, build-defining boons (not stat multipliers)."*
"Added verbs" is that requirement restated. Cards that drifted into multipliers are the drift.

*Already-known dead cards, still unruled, that this pass should sweep* (cycles 93/95):
`mineDamage` × `minePropFouling` pick-order dependence, `mineTrigger`'s 5th card ~75% clamped
away, and *at most 1 of 6 acquisition cards can ever fire*.

**Implementation acceptance criteria** (once the plan is stated):

- **Given** Eric's stated plan
- **Then** the catalog change lands through `effectiveStats()` and `BOON_STAT_PATHS` with no ad-hoc stat derivation, `PROTOCOL_VERSION` bumps (catalog content is wire contract), and the deck/offer tests are updated rather than deleted
- **And** a **batch-sim evidence pass** runs — the cycle-39/2.10 mould — because the last catalog change (cycle 42) shipped **explicitly unmeasured** and that debt is still ledgered
- **And** any ratified amendment this supersedes is recorded in `epic-7-context-amendments.md` with its supersession stated, per project law.

---

#### Story 7.6 — Design & Doc Reconciliation *(was 7.5, widened)*

Original acceptance criteria, plus the enumerated additions:

- **From Epic 6:** UX-DR30's sailable weapons-safe waiting room **no longer exists in production** (amendments 1/8 — a frozen held start line replaced it; the grammar survives only for the dev/sandbox door); `EXPERIENCE.md:67`'s home sub-line was overridden by Story 6-5; `EXPERIENCE.md:108`'s *"absence, not placeholders"* was **scoped** rather than followed (amendment 39); amendment 41's copy law and amendment 49's DRAFT reconnect string both want ratification in a copy pass
- **From this proposal:** every portal and Chromebook reference across DESIGN.md, EXPERIENCE.md, the GDD, the brief and `game-architecture.md` must be reconciled — this is a **large** mechanical sweep touching ~19 files
- **And** the deprecated-doc pointers in CLAUDE.md and both tracker files stay accurate.

---

#### Story 7.7 — The Frontend/Backend Split + Per-Service Versioning *(NEW — LAST BUILD STORY)*

> As the operator,
> I want the client and the game server to be two independently deployable, independently
> versioned services,
> So that I can ship an ad tweak without redeploying the arena, and a sim fix without rebuilding
> the site.

**Acceptance Criteria**

- **Given** one Render web service serving both `client/dist` and the Colyseus arena
- **When** the split lands
- **Then** the client deploys as a **Render Static Site** and the game server as a **Render Web Service** running only the arena (`server/src/app.config.ts:66`'s `express.static` is removed)
- **And** the game-server URL is build-time client config, with explicit server-side CORS and WebSocket origin allowances
- **And** the **client stays on the apex domain** (`hullcracker.io`) and the **game server moves to a subdomain** — AdSense approval and the GA4 property are per-domain, and both land before this story
- **And** `client` and `server` each cut **`0.1.0`** as the beta release version (Eric, 2026-08-18), with `shared` versioned as the library it is; `client/vite.config.ts` sources `__APP_VERSION__` from the client's own `package.json` rather than root
- **And** **the 0.17.X cycle-counting scheme is retired** at this point, with the build-cycle ledger rehomed to `sprint-status.yaml` where cycles are already recorded
- **And** `PROTOCOL_VERSION` is untouched and still refuses a mismatched client/server pair — independent versions must never weaken the wire gate, and a test pins that they don't
- **And** both services deploy green and a full match runs cross-origin end to end.

> **Why this story is LAST** (Eric, 2026-08-18): *"I want the split/versioning to be last, that
> way I can release beta as 0.1.0/0.1.0 cleanly."* Doing it first would burn version numbers on
> pre-beta cycles; doing it last means the first number each service ever carries is its beta
> release. This **refines** the earlier ruling ("split now, in Epic 7") rather than reversing it
> — the split still lands inside Epic 7, at the end of it.
>
> **Note — this ends a ratified rule.** *"The game stays 0.17.X until all 7 epics complete"* is
> superseded here. `X` will have counted its final landed cycle; that ledger moves rather than
> ends, and every cycle up to this story still increments it.

---

#### Story 7.8 — The Release Gate *(was 7.6, widened)*

Original acceptance criteria, minus the portal/ad-break clause (now 7.3), plus:

- **And** **`loadTest.mjs` is BUILT** — it does not exist. AR12's load-test leg died with epic-5 amendment 41's drone-fill deletion; Story 6-4 rebuilt the bot-evaluation leg only. **This is the third epic to assume the capability present.** It must be scoped as construction work, not invocation
- **And** the **unauthenticated solo-create cost vector is RULED** (`deferred-work.md:1150`) — per-IP create throttle, global concurrent-solo ceiling, or explicit acceptance. **The 7.7 split makes the game-server origin separately addressable, which raises this from ledgered to live — and because the split now lands immediately before this gate, the gate is the FIRST verification the new topology ever gets**
- **And** the browser matrix (Chrome, Edge, Firefox, Safari) and the 1366×768 floor viewport pass — **noting the ledgered ≤720p liveness-block collision, whose stated urgency rested on the now-retired Chromebook target and should be re-derived, not inherited**
- **And** nothing debug ships (`import.meta.env.DEV`, `HC_DEV_OPTIONS`, no `P` toggle in prod), `npm run check` is green, and the full pipeline runs manually **on both production services**.

---

### 4.4 Documents requiring reconciliation (Story 7.6 inventory)

Portal/Chromebook language appears in **19 files**. The load-bearing ones:

| File | What changes |
|---|---|
| `planning-artifacts/epics.md` | NFR1/2/8/9/10, new NFR18/19, new FR39/40, all of Epic 7 |
| `game-architecture.md` | AR1 (Track-2), AR11 (seam retarget), hosting §, scale primitives § |
| `gdds/…/gdd.md` + `epics.md` | Portal distribution, Chromebook target |
| `ux-designs/…/DESIGN.md` | Portal chrome assumptions; **new: consent banner + ad unit treatment** |
| `ux-designs/…/EXPERIENCE.md` | Portal load/ad-break flow; the four Epic 6 items above |
| `briefs/…/brief.md` + `addendum.md` | Distribution strategy |
| `CLAUDE.md` | Versioning ruling (0.17.X retirement), deploy configuration, architecture pointers |
| `implementation-readiness-report-2026-07-17.md` | Historical — annotate, do not rewrite |

**Convention reminder:** `sprint-status.yaml` and `gds-workflow-status.yaml` get a **one-line stamp
each**, never narrative. Rationale belongs in `epic-7-context-amendments.md`; open threads in
`deferred-work.md`.

---

## Section 5 — Implementation Handoff

### Scope classification: **MAJOR**

An epic is redefined, five NFRs change, two ARs are superseded, four new requirements are added,
and one ratified versioning ruling ends. This exceeds "backlog reorganization."

### Routing

| Recipient | Deliverable |
|---|---|
| **Eric** | Approve this proposal; **start the AdSense application** (new critical path); stamp the reference MacBook model; **deliver the Story 7.5 card plan when the story is reached** |
| **`gds-create-epics-and-stories`** (or a targeted edit pass) | Apply §4.1–4.3 to `epics.md` and `game-architecture.md` |
| **`gds-sprint-planning`** | Regenerate `sprint-status.yaml` for the 8-story Epic 7 |
| **`gds-create-story`** | Story specs, in the §3 sequence |

### Success criteria

1. Epic 7 contains eight stories with no portal or Chromebook language anywhere
2. NFR1/2/8/9/10 amended; NFR18/19 and FR39/40 added; AR1/AR11 marked superseded-in-part with dates
3. Both tracker files regenerated, **in the same PR** as the artifact changes
4. The AdSense application is submitted and its status tracked as a first-class dependency
5. Story 7.5's plan is stated and recorded in `epic-7-context-amendments.md` before any card code moves
6. The three carried Epic 6 findings are scoped into 7.6 and 7.8 **at create-story time**, not discovered at the gate

### Recommended before story work begins

Unchanged from the Epic 6 retrospective, and now more urgent rather than less:

1. **Run a full-roster multiplayer playtest.** Four retrospectives overdue. Epic 6's entire min-2
   queue path, the 2:00/0:10 rhythm, the frozen start line, the departure scuttle and the two-human
   sinking-window duel have **never been exercised by humans**, and no solo session can exercise
   them. This is the **last epic before strangers arrive.**
2. **Rule the two failing bot quality bars** — bots are the Solo vs AI experience and sit directly
   on the retention path.
3. **Run the deferred-work triage pass** — 250 entries, untriaged for three epics, now containing
   launch-relevant items whose visibility falls as the file grows.
4. **Nothing further for Story 7.5 before it starts.** Eric holds the plan and delivers it at
   the story. The forge sessions are explicitly **not** input to it.

---

## Appendix A — Change Navigation Checklist Record

**Section 1 — Trigger and context**

| # | Item | Status |
|---|---|---|
| 1.1 | Triggering story identified | **[N/A]** — pre-emptive; no Epic 7 story exists yet |
| 1.2 | Core problem defined | **[x]** Strategic pivot: distribution, monetization, hosting |
| 1.3 | Impact assessed, evidence gathered | **[x]** §1 evidence table |

**Section 2 — Epic impact**

| # | Item | Status |
|---|---|---|
| 2.1 | Current epic completable as planned? | **[!]** **No** — 1 story invalid, 2 hardware-gated on an absent device |
| 2.2 | Epic-level changes required | **[x]** Redefine in place; 6 → 8 stories |
| 2.3 | Remaining epics reviewed | **[x]** Epic 7 is the last; Epics 0–6 unaffected |
| 2.4 | Future epics invalidated / new needed? | **[x]** None — Epic 7 absorbs all new work |
| 2.5 | Order or priority changed? | **[!]** Yes — new critical path (AdSense approval); split sequences first |

**Section 3 — Artifact conflicts**

| # | Item | Status |
|---|---|---|
| 3.1 | GDD | **[!]** Portal distribution + Chromebook target |
| 3.2 | Narrative | **[N/A]** No narrative artifact affected |
| 3.3 | Architecture | **[!]** AR1, AR11, hosting §, scale primitives § |
| 3.4 | UX (DESIGN/EXPERIENCE) | **[!]** Portal chrome; **new** consent banner + ad unit treatment |
| 3.5 | Requirements inventory | **[!]** NFR1/2/8/9/10 amended; NFR18/19, FR39/40 added |

**Section 4 — Path evaluation**

| # | Item | Status |
|---|---|---|
| 4.1 | Direct adjustment viable? | **[x]** **Yes — selected.** No code exists to unwind |
| 4.2 | Rollback needed? | **[N/A]** Nothing to roll back |
| 4.3 | MVP review / scope reduction? | **[x]** Considered, rejected — scope grows by owner decision |
| 4.4 | Effort / risk assessed | **[x]** §3 table; two HIGH-risk stories flagged (7.3 external, 7.5 design) |

**Section 5 — Proposal**

| # | Item | Status |
|---|---|---|
| 5.1 | Edit proposals drafted | **[x]** §4, before/after with rationale |
| 5.2 | Handoff defined | **[x]** §5 |
| 5.3 | Owner approval | **[ ]** **Pending** |

---

## Appendix B — Research Record

**Ad placement — AdSense H5 Games Ads**

- H5 Games Ads supports **interstitial** and **rewarded** formats via the **Ad Placement API**
  (`adConfig()` / `adBreak()`); placement types `preroll | start | pause | next | browse | reward`;
  callbacks `beforeAd` / `afterAd` / `adBreakDone`, plus `beforeReward` / `adDismissed` / `adViewed`
  for rewarded.
- Full-screen ads must appear at **natural transition points** and **may not be confused with normal
  operation** of the app. Only **one preroll per page load**; `adBreak()` fails while another ad is
  showing.
- Standard **content ad units must sit ≥150 px from the game**, or be removed from gameplay pages
  entirely — because games involve heavy mouse movement and players click adjacent ads by accident.
- Access requires an **approved AdSense account plus a separate application**, subject to partner
  eligibility.

**Rewarded ads — recommended AGAINST, and not selected**

Raised at the question gate and not chosen. Recording the reasoning so it need not be re-derived:
Hullcracker has **no meta-progression, no cosmetics and no currency**, so there is nothing fair to
pay out. Any in-match reward (a boon, a heal, a level) is **pay-to-win in a battle royale** and would
breach the game's own fairness posture. If rewarded ads are ever revisited, **what the reward buys is
a design ruling first** and an integration second.

**Consent — Google-certified CMP**

Since **16 Jan 2024**, serving **personalized** ads to the **EEA/UK** requires a **Google-certified
CMP** integrated with **IAB TCF v2.2**; extended to **Switzerland** on **31 Jul 2024**. Without one,
personalized ads simply stop serving in those regions. Non-personalized ads do not require a
certified CMP — which is what made this a revenue question rather than a legal one. **Eric selected
Google's own free certified CMP.**

**Analytics — GA4**

GA4 processes events only when `analytics_storage` consent is granted; denied consent sends cookieless
pings. **Consent Mode v2** is the integration point, driven by the same CMP as ads — one banner serves
both.

**Sources:**
[AdSense H5 Games Ads](https://adsense.google.com/start/h5-games-ads/) ·
[Get started with H5 Games Ads](https://support.google.com/adsense/answer/9959170?hl=en) ·
[Ad Placement API reference](https://developers.google.com/ad-placement/apis) ·
[H5 game structure](https://developers.google.com/ad-placement/docs/html5-game-structure) ·
[Ad placement policies](https://support.google.com/adsense/answer/1346295?hl=en) ·
[AdSense for content ads on game play pages](https://support.google.com/adsense/answer/2768340?hl=en) ·
[Google consent management requirements (publishers)](https://support.google.com/adsense/answer/13554116?hl=en) ·
[New CMP requirements for the EEA and UK](https://blog.google/products/adsense/new-consent-management-platform-requirements-for-serving-ads-in-the-eea-and-uk/) ·
[How the Google CMP works](https://support.google.com/adsense/answer/16918505?hl=en)

---

## Appendix C — Eric's Rulings (2026-08-18)

| # | Ruling | Consequence |
|---|---|---|
| 1 | **No portal release.** Self-published, own ads, own servers | Old Story 7.3 replaced (now 7.4); NFR8 struck and rewritten; AR11 retargeted |
| 2 | **Chromebook retired.** The i7 MacBook is the reference device | NFR1 rebased; Epic 7's stated critical path closes; old 7.1 + 7.2 merge |
| 3 | **How to Play still relevant** | Story 7.4 survives, promoted to a beta gate; FR39 added |
| 4 | **Frontend/backend split, both on Render**, vertical scaling accepted | New Story 7.7; NFR10 amended; NFR18 added; AR1 superseded in part |
| 5 | **Independent per-service versions** | The 0.17.X-until-epics-complete ruling ends; ledger rehomes to `sprint-status.yaml` |
| 5a | **The split is sequenced LAST** so beta cuts at **`0.1.0` / `0.1.0`** cleanly | Story 7.7 is the last build story; all other stories renumber up one; client must stay on the apex domain so AdSense/GA4 identity is stable |
| 6 | **Interstitial at death→port + home-screen display unit** | FR40 added; NFR8 placement clauses |
| 7 | **Google's own free certified CMP + privacy policy** | Story 7.2; NFR19 |
| 8 | **Upgrade cards v2 as one Epic 7 story**, plan delivered by Eric at the story | New Story 7.5 |
| 8a | **The cannon is REMOVED from the game** | Cannon subdeck + `acquireCannon` delete; `CannonMode` and `shell.ts:412` plunging fire go dead; amendment 17's AP Hit Call clause is orphaned |
| 8b | **The Battleship gets a BROADSIDE BARRAGE** | First non-360° weapon of the class era; `ArcShape` has no twin-sector kind; a salvo multiplies the `mz`/`sp`/`hc` signal surface |
| 8c | **Mutually exclusive upgrades REMOVED** ("at least for now") | 8 cards / 4 pairs affected; `exclusiveWith` symmetry validation changes; a deck refill path disappears |
| 8d | **SOME cards retooled as "added verbs"** — the formerly-exclusive cards that STAY need retooling | A card that switches a single-valued `mode` must become one that adds a verb; rulings 8c and 8d are one change |
| 8e | **The forge sessions are IRRELEVANT** to Story 7.5 | Not to be mined for direction or cited as input |
| 9 | **Matchmaking is not a separate service** *(assistant finding, accepted premise correction)* | Two deployables, not three |
