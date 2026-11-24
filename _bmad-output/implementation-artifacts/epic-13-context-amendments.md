# Epic 13 Context — Ratified Amendments (durable)

This file is the DURABLE home for every ratified correction to Epic 13's context: Eric rulings, review patches, adjudicated contradictions. `epic-13-context.md` (when generated) is regenerable and anything living only there is erased on recompile; on any conflict between an entry here and planning-artifact text, the entry here wins until the planning artifact carries its dated supersession stamp.

Epic 13 is **The Front Door** — inserted 2026-10-25 by `sprint-change-proposal-2026-10-25.md` (as Epic 12), shifted to Epic 13 with its text whole by `sprint-change-proposal-2026-11-08.md`, re-cut 2026-11-24 (amendment 1).

Format: numbered, dated, source-attributed. "Supersedes" names the exact planning-artifact clause it overrides.

---

## Correct-course 2026-11-24 — the re-cut (no build cycle; `sprint-change-proposal-2026-11-24.md`)

1. **EPIC 13 RE-CUT: NO LANDING REDESIGN; CRAWLABLE PAGES, SHIP SELECT, SETTINGS, PUBLISHER APPROVAL.** Eric 2026-11-24 (`/gds-correct-course` + AskUserQuestion).
   - (a) **The list, verbatim:** *"1. The home page looks great, it just isn't crawlable because it doesn't have a crawlable semantic structure. So we need to make *some* changes. 2. Redesign of ship select. 3. Redesign of settings page so its not a garbled mess. 4. Anything else that needs to happen for adsense publisher approval. That's it."* Supersedes the old Story 13.1 (Google Stitch landing redesign, now `cancelled`) and every "follows the 13.1 design" clause.
   - (b) **Home look unchanged.** Semantic structure (headings, landmarks, real links), the home's existing words in the served HTML, and an invisible meta description; nothing new on screen. How to Play and Privacy carry the long text. Rejected: a visible pitch paragraph.
   - (c) **Ship select (13.2) and settings (13.3) are designed by agent-rendered candidates.** 2–3 layouts on one artifact page from DESIGN.md's real tokens; Eric picks or adjusts; nothing built before his pick. What each screen offers changes only by his ruling at the sitting. Rejected: Google Stitch; Eric-describes-and-build.
   - (d) **No About / Contact page up front.** 13.4 adds one only if Google's review names it.
   - (e) **Order is Eric's numbered list:** 13.1 Crawlable Pages (was 13.2) → 13.2 Ship Select → 13.3 Settings → 13.4 Publisher Approval (was 13.3). The resubmit needs only 13.1 on production; resubmitting early is Eric's call.
   - (f) Evidence on the day: production `/robots.txt` and `/sitemap.xml` 404; `/ads.txt` 200 and correct; all three pages are JS-filled empty shells.
