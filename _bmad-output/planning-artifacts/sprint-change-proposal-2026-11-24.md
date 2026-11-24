# Sprint Change Proposal — 2026-11-24: Epic 13 The Front Door re-cut — no landing redesign; crawlable pages, ship select, settings, publisher approval

**Status:** APPROVED by Eric 2026-11-24 ("Yes, apply it"; gds-correct-course, batch mode) (gds-correct-course, batch mode; four rulings by AskUserQuestion this session)
**Trigger:** Eric, 2026-11-24: `/gds-correct-course I think epic 13 isn't quite right. Here is what *actually* needs to happen: 1. The home page looks great, it just isn't crawlable because it doesn't have a crawlable semantic structure. So we need to make *some* changes. 2. Redesign of ship select. 3. Redesign of settings page so its not a garbled mess. 4. Anything else that needs to happen for adsense publisher approval. That's it.`
**Author:** Developer agent with Eric
**Predecessors:** `sprint-change-proposal-2026-10-25.md` (The Front Door inserted), `sprint-change-proposal-2026-11-08.md` (→ Epic 13, text whole), `sprint-change-proposal-2026-11-20.md` (Epic 13 is next)

---

## 1. Issue Summary

**Problem statement.** Epic 13 as written opens with a full landing-page redesign in Google Stitch (13.1), then crawlable pages (13.2), then publisher approval (13.3). Eric: the home *looks great*; what is wrong is that Google cannot read it. The redesign story is the wrong work. Two screens that DO need a redesign — ship select and settings — are not in the plan at all.

**Rulings (Eric, AskUserQuestion, 2026-11-24):**
- (a) **Home look unchanged.** Proper semantic structure (headings, landmarks, links) and the words already on the home written into the served HTML, plus an invisible meta description. Nothing new on screen. How to Play and Privacy carry the long text for Google. Rejected: adding a visible pitch paragraph.
- (b) **Ship select and settings are designed by agent-rendered candidates.** The agent renders 2–3 layouts from DESIGN.md's real tokens on one page; Eric picks or adjusts; then it is built. Rejected: Google Stitch; Eric-describes-and-build.
- (c) **No About/Contact page up front.** Ship the definite fixes, resubmit, and add pages only if Google's review names them.
- (d) Batch review.
- **Order** is Eric's numbered list: crawlable → ship select → settings → approval.

**Issue type.** Requirement correction by the stakeholder. No technical failure and no work lost: no Epic 13 story was started (all `backlog`; no story file, spec or branch).

**Evidence (production, probed 2026-11-24):**

| URL on hullcracker.io | Result |
|---|---|
| `/` , `/how-to-play/` , `/privacy/` | 200 — but each is an empty `<div id="app">` filled by JavaScript; `index.html` has no description, no Open Graph, no canonical, `<title>` is just `HULLCRACKER.IO` |
| `/ads.txt` | 200 — `google.com, pub-8667818947296707, DIRECT, f08c47fec0942fa0` (Story 7.4; correct) |
| `/robots.txt` | **404** |
| `/sitemap.xml` | **404** |

The staging host's `X-Robots-Tag: noindex, nofollow` (`server/src/robots.ts`, cycle 127) and password gate are correct and stay.

## 2. Impact Analysis

### Epic impact

| Epic | Impact |
|---|---|
| **Epic 13 The Front Door** | Re-cut to four stories in Eric's order. Old 13.1 (Stitch landing redesign) **cancelled**. Old 13.2 Crawlable Pages becomes **13.1**, re-scoped to "home look unchanged". **New 13.2 Ship Select, Redesigned** and **new 13.3 Settings, Redesigned**. Old 13.3 Publisher Approval becomes **13.4**, gains "About/Contact only if the review names it". Name kept. |
| Epic 14 The Account | None. (14.x stories that touch the ship screen / settings — unlocks, two-state settings, key rebinding — will build on the redesigned screens; their create-story reads them as built.) |
| Closed epics | None. |

### Story impact

| Old | New | Change |
|---|---|---|
| 13.1 The Landing Page, Redesigned | — | **cancelled** (Eric: the home looks great) |
| 13.2 Crawlable Pages | **13.1 Crawlable Pages** | home visible look unchanged; its "follows the 13.1 design" clause dropped; semantic structure added explicitly |
| — | **13.2 Ship Select, Redesigned** | new |
| — | **13.3 Settings, Redesigned** | new |
| 13.3 Publisher Approval | **13.4 Publisher Approval** | renumbered; + About/Contact only if named; "13.2 on production" → "13.1 on production" |

### Artifact conflicts

| Artifact | Change |
|---|---|
| `epics.md` | Summary-list Epic 13 entry rewritten; body: Epic 13 intro rewritten with a dated note, old 13.1 struck through as cancelled (text kept as history), stories rewritten per §4 |
| GDD `gdd.md` | E13 row: goal text re-cut (one dated stamp) |
| `DESIGN.md` / `EXPERIENCE.md` | None now. 13.2 and 13.3 each record Eric's pick in DESIGN.md as a dated update when they land (the story does it, not this proposal) |
| `game-architecture.md` | None |
| `render.yaml`, code | None |
| `epic-13-context-amendments.md` | **Created** with amendment 1 (rulings a–d + order) |
| `sprint-status.yaml` | Epic 13 keys re-cut per §4; `last_updated` one-line stamp |
| `gds-workflow-status.yaml` | `last_updated` + `correct-course` + `next_expected` one-line stamps |

### Technical impact

None from this proposal. No build cycle, no version bump (0.20.12 stays), PV 115 unchanged. 13.2 and 13.3 are client-only UI; neither should touch the wire unless the design sitting moves a setting into the game, which would be Eric's ruling at that time.

## 3. Recommended Approach

**Direct Adjustment** inside Epic 13. Effort: one documentation PR now; the epic itself shrinks (one design-tool pass removed) and gains two screen redesigns. Risk: low.

**Timing note (not a ruling):** AdSense reviews can take days to weeks. 13.4's resubmit only needs 13.1 on production, so Eric may resubmit as soon as 13.1 ships and let the review run while 13.2 / 13.3 build. The story order stays Eric's either way.

## 4. Detailed Change Proposals

### 4.1 `epics.md` — Epic List entry (line ~670)

OLD:
> ### Epic 13: The Front Door *(…)*
> H5 Games Ads is approved; the AdSense site review says Google cannot crawl the site and finds no content (…). The landing page is redesigned in Google Stitch (prompts by the agent, Eric driving), every page carries its real text in the HTML at build time with the meta set, robots.txt and sitemap, and the site is carried through publisher approval to the first live interstitial on production.
> **Standing constraints:** DESIGN.md is the source of truth and the Stitch output is reconciled with it before anything is built; NFR2's load budget untouched; staging's noindex / gate untouched; no in-game copy.

NEW (header line unchanged):
> H5 Games Ads is approved; the AdSense site review says Google cannot crawl the site and finds no content (…unchanged…). *(Re-cut 2026-11-24 — `sprint-change-proposal-2026-11-24.md`; Eric: "The home page looks great, it just isn't crawlable.")* Every page carries its real text in the HTML at build time with a semantic structure and the meta set, plus robots.txt and sitemap — the home's look unchanged; ship select and settings are redesigned (agent-rendered candidates, Eric picks); and the site is carried through publisher approval to the first live interstitial on production.
> **Standing constraints:** DESIGN.md is the design source of truth; the home's visible look is unchanged; NFR2's load budget untouched; staging's noindex / gate untouched; no in-game copy; what each redesigned screen offers changes only by Eric's ruling at its design sitting.

### 4.2 `epics.md` — Epic 13 body

Intro paragraph: replace "This epic redesigns the landing page (Google Stitch, …) , makes every page crawlable …" with: "This epic makes every page crawlable with its real text in the HTML (the home's look unchanged), redesigns ship select and settings, and carries the site through approval. *(Re-cut 2026-11-24 — `sprint-change-proposal-2026-11-24.md`: the Stitch landing redesign is cancelled; ship select and settings added.)*" Standing constraints sentence: drop the Stitch clause; add "the home's visible look is unchanged".

**Old Story 13.1** — heading becomes `### ~~Story 13.1: The Landing Page, Redesigned~~ — CANCELLED 2026-11-24` with one line *"Eric: the home looks great; it only needs to be crawlable (`sprint-change-proposal-2026-11-24.md`). Text kept below as history."*

**Story 13.1: Crawlable Pages** *(was 13.2)*

> As Google's crawler (and a reader with scripting off),
> I want every page to carry its words in the HTML it serves, with a real document structure,
> So that the site has content to index and nothing to guess.
>
> **Eric (2026-11-24):** *"The home page looks great, it just isn't crawlable because it doesn't have a crawlable semantic structure."* **Ruled:** the home's look is unchanged; How to Play and Privacy carry the long text.
>
> **Given** the three Vite entries (`/`, `/how-to-play`, `/privacy`) whose bodies are filled by JS from `home.ts`, `how-to-play/copy.ts`, `privacy/policyCopy.ts`
> **When** crawlable pages land
> **Then** every page's content is in the document AT BUILD TIME with a semantic structure (one `<h1>`, headings in order, `<main>` / `<nav>` landmarks, the HOW TO PLAY / PRIVACY / community links as real `<a href>`s) — the home's existing words, the How-to-Play copy and the privacy policy prerendered from their existing copy modules (the modules stay the single source; the runtime hydrates, never re-renders different text); a scripting-disabled reader gets the full text
> **And** the home looks and behaves exactly as today: the canvas, every DOM layer, the queue / class / settings layers and every key binding unchanged; no new visible text
> **And** the home carries a `<meta name="description">` (Eric's words, `[unruled]` at create-story); every page carries Open Graph + Twitter-card tags, a canonical URL and a page-specific `<title>`; production serves `/robots.txt` (allow all; sitemap pointer) and `/sitemap.xml` (the three pages); `ads.txt` stays as built; the staging host keeps `X-Robots-Tag: noindex` and the gate exactly as today
> **And** NFR2's load budget untouched; the client build order and `express.static` serving unchanged
> **And** structural tests only (the three documents contain their copy modules' headings; the meta set per page; robots / sitemap routes) — never a copy pin; `PROTOCOL_VERSION` unchanged.

**Story 13.2: Ship Select, Redesigned** *(new)*

> As a captain picking a hull before a match,
> I want the ship select screen laid out clearly,
> So that I can read the four hulls and my pick at a glance.
>
> **Eric (2026-11-24):** *"Redesign of ship select."* **Ruled:** agent-rendered candidates, Eric picks.
>
> **Given** today's ship select layer (`client/src/ui/classSelect.ts`: four hull cards, the SPECIAL pick, the horn row, CONFIRM SELECTION) and DESIGN.md
> **When** the design sitting runs
> **Then** the agent renders 2–3 candidate layouts on one artifact page using DESIGN.md's real tokens and type ramp and the real hull art and index data; Eric picks or adjusts; the pick is built
> **And** what the screen offers (hulls, SPECIAL, horn, confirm / ESC, keyboard 1–4 / arrows / Enter) stays unless Eric rules a change at the sitting; no new visible text without his words
> **And** the pick is recorded in DESIGN.md as a dated update; the 1366×768 floor holds; no tiny text; fixed-size elements stay fixed-size
> **And** client-only; `PROTOCOL_VERSION` unchanged; structural tests only.

**Story 13.3: Settings, Redesigned** *(new)*

> As a captain changing a setting,
> I want the settings page organized so I can find a row and read its value,
> So that it is not a garbled mess.
>
> **Eric (2026-11-24):** *"Redesign of settings page so its not a garbled mess."* **Ruled:** agent-rendered candidates, Eric picks.
>
> **Given** today's settings layer (`client/src/ui/settings.ts`) and DESIGN.md
> **When** the design sitting runs
> **Then** the agent renders 2–3 candidate layouts on one artifact page using DESIGN.md's real tokens and the real list of settings rows; Eric picks or adjusts; the pick is built
> **And** every setting keeps its stored key and behavior; none is added, removed or renamed unless Eric rules it at the sitting
> **And** the pick is recorded in DESIGN.md as a dated update; the 1366×768 floor holds; no tiny text
> **And** client-only; `PROTOCOL_VERSION` unchanged; structural tests only.

**Story 13.4: Publisher Approval** *(was 13.3)* — text unchanged except:
- "**Given** 13.2 on production" → "**Given** 13.1 on production"
- after "whatever the review names is fixed in this story" add: "— including an About / Contact page only if the review names one (Eric 2026-11-24: not up front)"

### 4.3 GDD `gdd.md` — E13 row (line 546)

OLD goal cell: "…landing page redesigned in Google Stitch (agent prompts, Eric drives), every page's text in the HTML at build time + description / Open Graph / canonical / robots.txt / sitemap, publisher approval and the first live interstitial"
NEW: "…every page's text in the HTML at build time with a semantic structure (home look unchanged) + description / Open Graph / canonical / robots.txt / sitemap; ship select and settings redesigned; publisher approval and the first live interstitial *(re-cut 2026-11-24 — `sprint-change-proposal-2026-11-24.md`: Stitch landing redesign cancelled)*"

### 4.4 `epic-13-context-amendments.md` — created

Amendment 1 (2026-11-24): rulings (a)–(d) and the order, verbatim from §1; pointer to this proposal.

### 4.5 `sprint-status.yaml`

```
epic-13: backlog  # 2026-11-24 correct-course (sprint-change-proposal-2026-11-24.md, epic-13 amendment 1): re-cut — no landing redesign; 13-1 crawlable, 13-2 ship select, 13-3 settings, 13-4 approval; <existing history kept>
13-1-the-landing-page-redesigned: cancelled  # 2026-11-24 Eric: the home looks great, only needs to be crawlable
13-1-crawlable-pages: backlog  # was 13-2; home look unchanged; semantic structure + text at build time, meta, robots.txt, sitemap
13-2-ship-select-redesigned: backlog  # agent-rendered candidates, Eric picks
13-3-settings-redesigned: backlog  # agent-rendered candidates, Eric picks
13-4-publisher-approval: backlog  # was 13-3; resubmit; About/Contact only if named; production CMP + interstitial smoke (Epic 7 debt)
epic-13-retrospective: optional
```
`last_updated`: one-line stamp.

### 4.6 `gds-workflow-status.yaml`

`last_updated`, `correct-course` (proposal path + one line), `next_expected` → "next: Epic 13 — 13-1 Crawlable Pages (create-story)".

## 5. Implementation Handoff

**Scope: Minor** — documentation only, applied directly by the Developer agent in one branch off `development` with one PR (no merge without Eric).

**Next after approval:** `gds-create-story 13-1` (Crawlable Pages). The meta description's words are Eric's at that step.

**Success criteria:** epics.md, the GDD row, both trackers and the new amendments file all say the same four stories in the same order; nothing in them still asks for a Stitch landing redesign.
