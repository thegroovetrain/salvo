---
title: 'Story 13.1 Crawlable Pages — one version of every page: the served HTML is the page, plus meta, robots.txt and sitemap.xml'
type: 'feature'
created: '2026-11-24'
status: 'review'
baseline_revision: '5383375e'
final_revision: 'PR (this branch: story-13-1-crawlable-pages)'
cycle: '255'
version: '0.20.13'
protocol_version: '115 (unchanged)'
amendments: 'epic-13 amendments 2 (description), 3 (one version; Playwright), 4 (home redesign: top/bottom bars)'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/13-1-crawlable-pages.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-13-context-amendments.md'
  - '{project-root}/_bmad-output/project-context.md'
---

# Story 13.1 — cycle record

The story file (`13-1-crawlable-pages.md`) holds the ACs; epic-13 amendment 2 holds the home description, amendment 3 Eric's mid-build "one version" ruling (which supersedes AC 6's reading of record, the AC 17 composer-equality bullet and AC 9's `<button>` clause) and the Playwright install. This file records what was built and how it was verified.

## What was built

**Build time (`client/src/seo/`, the `hc-crawlable` plugin in `client/vite.config.ts`)**
- Every served document (`/`, `/how-to-play/`, `/privacy/`) carries its words and structure: one `<h1>`, ordered headings, `<main>`, a `<nav>` of real `<a href>`s.
- Head set per page from one page table (`seo/site.ts`, `SITE_ORIGIN = https://hullcracker.io`): canonical, `og:type/site_name/title/description/url`, `twitter:card/title/description`; titles and descriptions read from each document's own `<title>` / description meta. The home's description is Eric's, verbatim, in `client/index.html`.
- `robots.txt` (allow all + sitemap line) and `sitemap.xml` (the three canonicals, no lastmod) emitted every build. `ads.txt` untouched.
- The plugin never imports the page builder: `serve` loads it per request via `server.ssrLoadModule`, `build` via `runnerImport` (config dependency graph 39 → 9 files; dev no longer restarts on client edits and never serves stale markup).

**One version (Eric 2026-11-24, amendment 3)**
- How to Play / Privacy: the build writes the whole styled page (`ui/pageMarkup.ts`, `how-to-play/pageMarkup.ts`, `privacy/pageMarkup.ts`; stat tables and glyphs included; theme vars in `<head>` from `theme.ts` `themeVars()`, the list `injectTheme` also reads). `ui/page.ts` `attachPage` binds only ESC → home, Space on the back link and `pagehide` (bfcache `persisted` trap kept). BACK TO PORT is an `<a href="/">` in a `<nav>`, styled as the old button. `seo/prerender.ts` (the second implementation) is deleted.
- Home: the served wordmark `<h1>`, version line and link `<nav>` are adopted (moved, never cloned) by `ui/homeStatic.ts` at boot and reused by every `showHome`; the console column is `<main>`. Everything else on the home is built by JS as before. `#app` is opaque over the served container before JS; `<noscript>` hides it for scripting-off readers.

**Home redesign (Eric 2026-11-24/25, amendment 4)**
- `#main-menu` is a full-height grid: `header` (server status | players / games | gear) / `main` (wordmark + tagline, squared 540px console) / `footer` (© build year + version | nav links | social brand icons). No absolute positioning; short windows tighten via CSS variables (`ui/homeBars.ts`, one injected `<style id="hc-home-style">`).
- The © line, version, nav and social anchors are served and adopted (one version). Social icons: Font Awesome Free brands as build-time inline SVG (`seo/socialIcons.ts`); `ui/communityLinks.ts` is a services table, still absence-gated (no icons on production until the Discord / Reddit values are set).
- UI text is not highlightable (`user-select: none`; inputs selectable).

**Tooling:** `playwright-core` 1.65.1 is a client devDependency; `client/scripts/perfLib.mjs` and `readabilityCapture.mjs` no longer resolve gstack's copy (Eric: *"just install playwright if you use it"*).

## Verification

- Client suite 186 files / 4580 tests; tsc clean; ESLint 0 errors; `npm run check` once at the end (see the PR).
- Build: one `<h1>`/`<main>`/`<nav>`/`<script>` per dist document; robots.txt and sitemap.xml present. A `@vitest-environment node` test runs the transform over the three real source files (guards the build-time graph's Node safety).
- Screenshots (`vite build` + `vite preview`, muted Chromium, time-bounded): home 1366×768 and 1920×1080 identical to the baseline apart from the random tagline and background; How to Play and Privacy within anti-aliasing noise (≈100 px of 1–2 levels on rounded corners, the same noise as two runs of one build). Scripting-off: the home shows its words; How to Play and Privacy render the full styled page (previously all three were blank).
- Review gate: Fable (build-on-it; 2 confirmed + 3 plausible, all fixed with regression tests) and Codex `gpt-5.6-sol` (build-on-it, no defects).
- Production check: pages are served Brotli-compressed (Render/Cloudflare edge), so How to Play's ~231 KB raw HTML (inline styles) is ~12 KB on the wire.

- Redesign: screenshots at 1366×768, 1920×1080 and 1366×480 (bars pinned 0–60 / 708–768 etc., gear 26 px from the right, main never scrolls at those sizes); no phone sizes by Eric's rule. Review gate: Fable + Codex on the redesign diff.

## Not done here

- AdSense's own view of `ads.txt` / the site (amendment 2): Story 13.4's loop.
- `CLAUDE.md` is frozen; nothing there needed a change this cycle.
