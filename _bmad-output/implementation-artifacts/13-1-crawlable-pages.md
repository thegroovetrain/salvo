---
baseline_commit: 1093bff2
---
# Story 13.1: Crawlable Pages

Status: in-progress

<!-- Created 2026-11-24 by gds-create-story from epics.md Story 13.1 (re-cut by sprint-change-proposal-2026-11-24.md, epic-13 amendment 1). First story of Epic 13 The Front Door. Build order: 13.1 → 13.2 ship select → 13.3 settings → 13.4 approval. -->

## Story

As Google's crawler (and a reader with scripting off),
I want every page to carry its words in the HTML it serves, with a real document structure,
so that the site has content to index and nothing to guess.

Eric, 2026-11-24, verbatim: *"The home page looks great, it just isn't crawlable because it doesn't have a crawlable semantic structure. So we need to make *some* changes."* **Ruled** (epic-13 amendment 1(b)): the home's look is unchanged; semantic structure, the home's existing words in the served HTML, and an invisible meta description; nothing new on screen; How to Play and Privacy carry the long text. Rejected: a visible pitch paragraph. Eric 2026-11-20: *"All I need is the page to be crawlable."*

Eric, 2026-11-24 (at this create-story): *"despite the fact that I am able to visit hullcracker.io/ads.txt and see it just fine, adsense has been having trouble finding it for some reason."* See Dev Notes → "The ads.txt report".

## Scope

- **In:** the three documents (`/`, `/how-to-play/`, `/privacy/`) carry their words and a semantic structure in the HTML the server serves; the live (JS-built) DOM of all three gains the same landmarks with zero visual change; per-page meta (description, Open Graph, Twitter card, canonical, title); `/robots.txt` and `/sitemap.xml` emitted into the build; stale comments in `render.yaml` / `docs/deploy.md` corrected.
- **Out:** any visible change to the home (look, words, layout, behavior, keys); new copy anywhere visible; JSON-LD (it needs a `<script>` tag, which the one-script pin forbids, and no AC asks for it); an `og:image` (no raster asset exists; NFR9; deferred); About / Contact pages (13.4, only if the review names one); the `ads.txt` generator (stays as built, Story 7.4); server middleware order, `express.static`, the staging gate and `X-Robots-Tag` (all unchanged); `PROTOCOL_VERSION`.

## Acceptance Criteria

### A. Words in the served HTML (build time)

1. The built `client/dist/index.html`, `client/dist/how-to-play/index.html` and `client/dist/privacy/index.html` each contain the page's content as static markup, produced at build time by a Vite `transformIndexHtml` hook (the `hc-adsense` plugin's pattern: pure functions in `client/src/…`, only the hooks in `vite.config.ts`). A reader with scripting off gets the full text.
2. **Single source.** The prerendered text comes from the existing copy modules: `client/src/how-to-play/copy.ts` (`HOWTO_TITLE`, `HOWTO_SECTIONS`, the `HOWTO_FOOTER_*` trio) and `client/src/privacy/policyCopy.ts` (`POLICY_TITLE`, `POLICY_UPDATED`, `POLICY_SECTIONS`). No string is retyped. If the runtime transforms a string before showing it (for example the section-heading form, or the key-binding rows), that transform becomes ONE pure exported function that both the runtime renderer and the prerenderer call.
3. **Semantic structure, in every served document:** exactly one `<h1>`; headings in order with no skipped level (h1 → h2 section headings → h3 entry names, as `page.ts` / `how-to-play/main.ts` already nest them); a `<main>` landmark around the content; a `<nav>` landmark holding the page's links as real `<a href>`s.
   - **Home:** `<h1>` = the wordmark's words (`HULLCRACKER.IO`); `<nav>` = HOW TO PLAY (`/how-to-play`), PRIVACY (`CLIENT_CONFIG.consent.policyHref`), and the community links that `communityLinks()` yields for the BUILD's env (none today: `VITE_DISCORD_INVITE` / `VITE_SUBREDDIT` are unset on both hosts); the version line `v{version}`. **Reading of record:** the random tagline (`pickTagline()`, changes every mount), the localStorage-dependent class chip, and the controls that only work with JS (callsign field, SOLO, SOLO VS AI, CREATE / JOIN, gear) are NOT prerendered. They are not stable words, or they do nothing without scripting.
   - **How to Play:** `<h1>` `HOWTO_TITLE`; one `<section>` + `<h2>` per `HOWTO_SECTIONS` entry with its paragraphs, its key bindings (as a list or table of key and action), its entries (an `<h3>` name and the description; the stat tables and glyphs are derived data, not copy, and are left out), its tail; the footer paragraph with the privacy link; a `<nav>` link back to `/` using the page's existing back words.
   - **Privacy:** `<h1>` `POLICY_TITLE`, the `POLICY_UPDATED` line, one `<section>` + `<h2>` per `POLICY_SECTIONS` entry (paragraphs, bullets as `<ul><li>`, trailing); the `<nav>` back link.
4. All text is HTML-escaped (`&`, `<`, `>`, `"`); no markup comes from the copy modules.
5. The prerender adds **no `<script>`** and **no third-party origin** to any document (the `analytics.test.ts:577-622` source-page pins stay green and unweakened; the built-output test in AC 17 adds the same guarantee for the transform).

### B. The runtime takes over: no different text, no visible change

6. **Hydration, reading of record:** "hydrate" means the live renderer takes over the document. When the live tree mounts, the prerendered block is removed and the live tree (built from the same modules) replaces it. The live tree never shows text the prerendered block did not carry, except the runtime-only parts named in AC 3. There is never more than one `<h1>` in the document.
   - Home: the prerendered block is removed when the live home mounts (`showHome`, `client/src/ui/home.ts:1193`) AND on the resume path that never builds a home (`tryResumeMatch` → `'resumed'`, `client/src/main.ts` `main()`), so a resumed match never carries the static block.
   - How to Play / Privacy: removed in `mountHowToPlayPage` / `mountPrivacyPage` (or inside `renderPage`) before the live page mounts.
7. **The home looks and behaves exactly as today:** the canvas, every DOM layer (`#main-menu`, queue modal, class select, settings overlay, liveness, gear), every key binding (Enter, ESC, chip and gear Enter/Space, callsign autofocus) and every word unchanged; no new visible text. **No pre-mount flash:** on a JS-enabled load the prerendered home block is never visible. Recommended: the static `<style>` gives `#app` an opaque `#050807` (the one allowed color literal, `tokens.test.ts`) background above the in-flow block, and a `<noscript><style>` in `<head>` hides `#app` so a scripting-off reader sees the text. `<noscript>` does not match the one-script pin's `<script\b`.
8. **The live home DOM gains the same landmarks with zero visual change.** The wordmark's mark element becomes `<h1>`, with `margin:0` and its existing `font:` so the look is identical; the underplay link row becomes `<nav>`; the console column (or the overlay content) is wrapped in or becomes `<main>`. Mind the CSSOM-blob hazard (no `border:` / `background:` shorthands in a `style.cssText` blob: jsdom voids the whole blob) and the `homeYieldStyle` rule (no descendant writes `visibility`).
9. **The live static pages gain `<main>`:** `renderPage` (`client/src/ui/page.ts:479`) wraps the body in `<main>` (or makes the body element one). The header keeps its `<h1>`; the BACK TO PORT control stays a `<button>` with its ESC chip (behavior unchanged).
10. On How to Play and Privacy, a JS-enabled load shows no flash of a different-looking page before the live page mounts. Recommended: a page-local `<style>` gives the prerendered block the page's background, foreground and font, so the frame before JS reads as the same page. Verify by a first-paint screenshot.

### C. Meta, robots, sitemap

11. **Every page** carries, injected at build time (not written into the source HTML, which keeps the origin pin in `analytics.test.ts` true):
    - a page-specific `<title>`: the existing titles stand (`HULLCRACKER.IO`, `HOW TO PLAY — HULLCRACKER.IO`, `PRIVACY — HULLCRACKER.IO`);
    - `<link rel="canonical" href="https://hullcracker.io{path}">` with the served path: `/`, `/how-to-play/`, `/privacy/` (the trailing-slash form that `express.static` serves; the bare form 301s there);
    - Open Graph: `og:type` `website`, `og:site_name`, `og:title`, `og:description`, `og:url` (= canonical);
    - Twitter card: `twitter:card` `summary`, `twitter:title`, `twitter:description`.
12. **The home's `<meta name="description">`** carries Eric's words: **"Naval battle royale in your browser. Last hull floating wins."** (Eric 2026-11-24, AskUserQuestion at create-story: "Bare minimum"; verbatim, never reworded). The two existing subpage descriptions (`how-to-play/index.html:12`, `privacy/index.html:12`) stand, and every page's `og:description` / `twitter:description` reads its own page's description.
13. One origin constant, `SITE_ORIGIN = 'https://hullcracker.io'`, lives in one client module (with the pure SEO helpers), not retyped. One build serves both hosts, so staging's documents also name the production canonical. That is correct: staging is noindexed and gated.
14. **`/robots.txt` and `/sitemap.xml`** are emitted into `client/dist` by the plugin's `generateBundle` (`this.emitFile`, the `ads.txt` precedent at `vite.config.ts:88-91`), unconditionally, on every build:
    - `robots.txt`: `User-agent: *`, `Allow: /`, a blank line, `Sitemap: https://hullcracker.io/sitemap.xml`, and a trailing newline. It disallows nothing; `ads.txt` must stay fetchable.
    - `sitemap.xml`: a valid `urlset` (sitemaps.org 0.9 namespace) with the three canonical URLs, generated from the same page table as the canonicals. No `lastmod`: a build-time date is not a content date.
    - Production serves both at 200 through the unchanged `express.static`.
15. **The staging host is unchanged:** `X-Robots-Tag: noindex, nofollow` (`HC_NOINDEX=1`, `server/src/robots.ts`) and the password gate (`stagingGate.ts`) exactly as today. Behind the gate the new files answer 401 like every static file; that is correct. No server code changes; the middleware order pins in `robots.test.ts` / `stagingGate.test.ts` stay green untouched.
16. `ads.txt` stays as built (generator, gate, content untouched).

### D. Tests, records, gates

17. Tests are **structural only**, never a copy pin (project-context Testing Rules; Story 9.14):
    - The prerender functions: every heading in the copy module (`HOWTO_SECTIONS[].heading`, `POLICY_SECTIONS[].heading`, entry names, the titles) appears in the output in source order; exactly one `<h1>`; `<main>` and `<nav>` present; heading levels never skip; every nav link is an `<a href>`; escaping holds for a string with `<&>"`.
    - **Composer equality (the single-source contract):** mount the live page in jsdom (`mountHowToPlayPage` / `mountPrivacyPage`), collect its h1/h2/h3/p/li text in order (excluding the stat tables and glyph SVGs, which are not prerendered), and assert it equals the same collection from the prerendered markup. This is the test that fails if the two ever show different text.
    - The head transform: each page gets its own canonical / `og:url` from the page table; one `<title>`; description present; OG + Twitter set present; the output adds no `<script>` and no origin other than `SITE_ORIGIN` and the fonts origins.
    - robots / sitemap generators: the robots `Sitemap:` line equals `SITE_ORIGIN + '/sitemap.xml'`; the sitemap's `<loc>` set equals the canonical set; the sitemap parses as XML (jsdom `DOMParser`, no `parsererror`).
    - The live DOM: after `showHome`, the document has exactly one `h1` and it is inside `#main-menu`; `nav a[href="/how-to-play"]` exists; the prerendered block is gone. After `mountHowToPlayPage`, exactly one `h1` and one `main`.
    - Plugin wiring: a source-structure pin like `ads.test.ts:150-173` (the hook is registered; the emit names `robots.txt` and `sitemap.xml`).
    - Optional, preferred if it stays fast: one test runs the three transforms over the three real source HTML files and asserts the built shape (one h1, main, nav, canonical, no added script).
18. `PROTOCOL_VERSION` unchanged. `npm run check` green once at the end. `npm run build` succeeds, and the built `dist` holds the three documents with their text plus `robots.txt`, `sitemap.xml` and (with `VITE_ADSENSE_CLIENT` set) `ads.txt`.
19. **Look verified:** before/after screenshots of the home at 1366×768 and 1920×1080, of How to Play and of Privacy, from YOUR worktree's dev server, built with `vite build` + `vite preview` so the transform runs. Kill the server after; the browser is muted (`perfLib.mjs` `launchMuted`); every run is time-bounded. They must be visually identical (the home pixel-identical apart from the random tagline and the live probe). Attach to the PR. A JS-disabled screenshot of each page shows the text.
20. Records: the cycle number, version `0.20.(X+1)` and amendment number are taken at PR time after `git fetch` (numbers at PR time). Then: `VERSION` + root `package.json`; an epic-13 amendment (append-only) recording the readings of record in AC 3 and 6 and Eric's description ruling (AC 12); one-line stamps in both trackers; `spec-13-1-crawlable-pages.md`; the stale `render.yaml` staging comment ("Nothing in the build carries a robots.txt, a canonical URL or a noindex") corrected, comment only; one line in `docs/deploy.md`'s environment table on robots / sitemap / canonical. Never edit `CLAUDE.md`.

## Tasks / Subtasks

- [ ] **T1 Pure SEO module** (AC 2-5, 11-14): new `client/src/seo/` (e.g. `site.ts`: `SITE_ORIGIN`, the page table `{ key, path, sourceSuffix }` for the three entries, `pageForHtmlPath(filename)` modelled on `isGameIndexPath`; `head.ts`: `injectHead(html, page, description)`; `robots.ts`: `robotsTxt()`, `sitemapXml()`; `prerender.ts`: `prerenderHome(opts)`, `prerenderHowToPlay()`, `prerenderPrivacy()`, `escapeHtml`). Zero DOM and zero `import.meta.env` at module scope: they are imported by `vite.config.ts` and run in Node.
  - [ ] T1.1 Extract any runtime string transform (heading form, key-row form) into one exported pure function used by both sides (AC 2).
- [ ] **T2 Vite plugin** (AC 1, 11, 14): a `hc-crawlable` plugin in `vite.config.ts`, beside `adsensePlugin`. `transformIndexHtml` (default order, after `hc-adsense`'s `pre`) injects the head set + the prerendered body block per page. `generateBundle` emits `robots.txt` + `sitemap.xml`. Community links: pass the `loadEnv` result into `communityLinks(env)` explicitly (its default reads `import.meta.env`, which does not exist in the config bundle). Version: `pkg.version` (already loaded at `vite.config.ts:10`).
- [ ] **T3 Source HTML** (AC 7, 10): `client/index.html` gets the cover CSS for `#app` + `<noscript><style>`; the subpages get a page-local style for the prerendered block. Still exactly one `<script>` per file; still only the fonts origins; still one `#050807` in `index.html`.
- [ ] **T4 Runtime takeover** (AC 6, 8, 9): remove the prerendered block in `showHome`, the resume path and the static-page mounts; home wordmark → `h1`, underplay row → `nav`, `main` landmark; `renderPage` body → `main`.
- [ ] **T5 Tests** (AC 17), in `client/src/__tests__/` (flat; jsdom; Vitest 4). Extend `home.test.ts` / `page.test.ts` / `howToPlay.test.ts` / `privacyPolicy.test.ts` rather than duplicating mounts; new `seo.test.ts` for the pure module.
- [ ] **T6 Verify** (AC 18, 19): `npm run build` and inspect `dist` (three documents' text, `robots.txt`, `sitemap.xml`); the screenshots; `npm run check` once.
- [ ] **T7 Records** (AC 20) at PR time; one PR to `development`; never merge.

## Dev Notes

### Current state of the files this story touches

- **`client/vite.config.ts` (221 lines):** `defineConfig(({ mode }) => …)` (:98). Entries `main` / `privacy` / `how-to-play` at :175-181. `adsensePlugin(adsClient)` (:75-93): `transformIndexHtml { order:'pre', handler(html, {filename}) }`, game index only via `isGameIndexPath`; `generateBundle` emits `ads.txt` when injected. The only `loadEnv` is at :109. `hc-static-page-dev-url` (`apply:'serve'`, :189-217) 301s bare `/privacy` and `/how-to-play` in dev and preview. No `base`, `outDir` or `publicDir` (there is no `client/public`). The client `build` script is `tsc && vite build && node scripts/readabilityCapture.mjs --verify-bundle`. `vite.config.ts` is outside `tsc`'s `include: ["src"]`, but what it imports from `src` is type-checked.
- **`client/index.html` (42 lines):** `<title>HULLCRACKER.IO</title>`, font preconnect / preload / `<noscript>` stylesheet, `<style>` (`body{background:#050807;overflow:hidden}` `#app{position:fixed;inset:0;…}`), body `<div id="app"></div><script type="module" src="/src/main.ts">`. No description, OG or canonical.
- **`client/how-to-play/index.html`, `client/privacy/index.html`:** title + `<meta name="description">` at :11-12, the same fonts, an EMPTY body except the module script (no container div).
- **`client/src/ui/home.ts` (1307 lines, over the soft cap: put new code in the SEO module, not here):** `showHome` (:1193-1245) removes any `#main-menu` and builds a fixed overlay (z 1100) appended to `document.body`; `#app` holds only the Pixi canvas (`main.ts:6449`). The wordmark is `makeWordmark` (:461-481): the mark div (`HULLCRACKER` + `<span>.IO</span>`, `font:700 clamp(48px,9vw,104px)`), the tagline (random, `ui/taglines.ts`), and `v${version}`. The underplay row (:756-794) has real anchors already: `<a href="/how-to-play">` (`HOWTO_HREF` :737), `<a href={policyHref}>` (`/privacy`, `config.ts:2024`), and community anchors from `communityLinks()` (:791). There are no h1-h6 and no main/nav/header on the home today.
- **`client/src/ui/page.ts` (539 lines):** `renderPage` (:479) builds root div → panel → `<header>` (`<h1>` title, sub-line, BACK TO PORT `<button>` + ESC chip) + body div. It appends to `document.body`, is a singleton (`liveMount`), and has capture-phase ESC → `goHome` and `pagehide` disposal (read the `persisted` trap comment before touching teardown). Section `<h2>` at :99.
- **`client/src/how-to-play/main.ts`:** `sectionBlock` → `makePageSection(heading, …)`; entry names are `<h3>` with an SVG glyph (`equipmentGlyphSvg`) + stat tables (`weaponTables.ts` pulls `@salvo/shared`); footer = `HOWTO_FOOTER_LEAD` + `makePageLink(HOWTO_FOOTER_LINK, policyHref)` + `HOWTO_FOOTER_TAIL`. It self-boots at :137: **never import a `main.ts` from the config** (it would run at config load with no `document`).
- **`client/src/privacy/main.ts`:** `renderPage({ title, subtitle: POLICY_UPDATED, body: POLICY_SECTIONS.map(sectionBlock) })`, self-boots at :57.
- **Copy modules:** `how-to-play/copy.ts` imports only `type KeyBinding` from `ui/page.js` (type-only, so Node-safe); `privacy/policyCopy.ts` has no imports. Both are plain strings (no markdown). URLs and the contact email inside the policy prose are plain text, not links; keep them plain (no new links).
- **`client/src/ui/communityLinks.ts`:** `communityLinks(env = viteEnv())` returns `[{label, href}]`, absence-gated.
- **Server:** `server/src/app.config.ts` prod branch: robots header (if `HC_NOINDEX`) → gate (if `HC_STAGING_KEY`) → `express.static(client/dist)` (:146), no catch-all. `/health` is before the gate. **Do not touch server code**: the files land through the existing static mount.

### Must preserve

- The home: every pixel, word, layer, key, focus behavior. `home.test.ts` queries such as `home().querySelector('a[href="/how-to-play"]')` keep working. `homeYieldStyle` stays the only `visibility` writer.
- `analytics.test.ts:577-622`: exactly one `<script>` per source page, no GA strings, origins exactly the two fonts origins. Do NOT relax it; inject the canonical at build time instead.
- `tokens.test.ts`: one `#050807` literal in `client/index.html`.
- `ads.txt` emission and its tests (`ads.test.ts`); `isGameIndexPath` stays false for the subpages.
- Staging: noindex header, gate, `/health` order; the order pins in the server tests.
- NFR2: the added markup is static text (a few KB, the How-to-Play the largest); no new request, no new font, no new script. `readabilityCapture.mjs --verify-bundle` still passes.

### The ads.txt report (Eric, at create-story)

Probed 2026-11-24 from outside, to report the facts rather than guess:
- `https://hullcracker.io/ads.txt` → 200, `text/plain; charset=UTF-8`, body `google.com, pub-8667818947296707, DIRECT, f08c47fec0942fa0\n`, no redirect.
- `www.` and `http://` variants → 301 to the apex, then 200.
- The same 200 for user agents Googlebot (desktop + smartphone), `Mediapartners-Google`, `AdsBot-Google`; a HEAD gets 200 too. DNS: apex and www both → `216.24.57.1` (Render; Cloudflare edge headers present).
- `/robots.txt` → 404 (Google reads a 404 robots as "allow all", so it is not a blocker on its own, but this story adds one).

**What this means:** nothing visible from outside blocks the file. What cannot be checked from here: (a) AdSense re-crawls `ads.txt` on its own slow schedule, so its status can say "not found" for days after the file is correct; (b) which domain the AdSense **Sites** list holds (it must be `hullcracker.io`, not an `onrender.com` host or a typo); (c) whether Render's edge treats Google's real crawler IPs differently from a spoofed user agent. This story keeps `ads.txt` untouched and adds `robots.txt` (allows everything, `ads.txt` included). The live check of AdSense's view belongs to 13.4's approval loop.

### Architecture compliance

- Client-only plus build config. The `shared` and `server` code is untouched; no wire change; `PROTOCOL_VERSION` unchanged.
- DOM is chrome only; the prerender is markup for documents, never for the canvas.
- Complexity ≤ 10 is a lint error: keep the prerenderers as small composed functions. ~500 LOC soft cap: new module, not `home.ts` / `page.ts` growth.
- lowerCamelCase file names. No new dependency: plain string building, no SSR framework (jsdom stays a test-only dep). If one is truly needed, it lands here (never pre-installed) and is current (memory: keep deps current).

### Testing (Eric's pyramid, functional style)

Unit tests on the pure SEO functions; integration via jsdom mounts for the composer-equality and live-landmark tests. No copy pins, no CONFIG literals, no wall-clock. The description is never asserted by value, only by presence and length > 0.

### Previous story / git intelligence

- No earlier Epic 13 story. Most recent work (12.3, 12.4, PRs #384-#388) was gameplay and HUD; nothing touched the entries or `vite.config.ts`. The relevant precedents are Story 7.4 (`spec-7-4-adsense-h5-games-ads.md`: the `hc-adsense` plugin, `ads.txt` emit, the one-script source pins), Story 7.2 (the static pages and `page.ts`), cycle 127 (`robots.ts`: why staging uses a header, not robots.txt), cycle 132 (community links).
- Story 7.4 lesson that applies: the source HTML stays free of origins and scripts, and the build injects. Pure functions in `src`, hooks in the config.

### Latest tech notes

- Vite 6 `transformIndexHtml` returns either a string or `{ html, tags }`; with `tags` (`injectTo: 'head' | 'body-prepend'`) it can insert meta / link / body markup without string surgery. Either is fine. `ctx.filename` identifies the entry. The hook runs in both `serve` and `build`, so dev sees the same documents.
- `this.emitFile({ type: 'asset', fileName, source })` in `generateBundle` writes the file to `dist` root.
- Google renders JS for Search, so the live DOM's landmarks (AC 8-9) matter as much as the static HTML. AdSense's site review may read the raw HTML, which is why the build-time text matters.
- Sitemaps protocol 0.9: `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>…</loc></url></urlset>`; absolute URLs; UTF-8.

### References

- `_bmad-output/planning-artifacts/epics.md` → Epic 13 / Story 13.1 (~:3155)
- `_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-24.md` (§1 evidence table, §4.2)
- `_bmad-output/implementation-artifacts/epic-13-context-amendments.md` amendment 1
- `_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-25.md` (the original crawl finding)
- NFR2 (`epics.md:180`), NFR9, NFR30
- `_bmad-output/implementation-artifacts/spec-7-4-adsense-h5-games-ads.md`
- `server/src/robots.ts`, `server/src/stagingGate.ts`, `server/src/app.config.ts:87-148`, `docs/deploy.md`, `render.yaml`
- DESIGN.md (`_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/DESIGN.md`): the home's look is the spec; nothing here changes it

### Project Context Rules (from `_bmad-output/project-context.md` + CLAUDE.md)

- Branch from `development`; one PR to `development` at the end; commit and push continuously; NEVER merge without Eric's explicit order.
- Halt on any error and surface it. `npm run check` once at the end; scoped `npm test -w client` while working. Fresh worktree: `npm install --include=dev && npm run build -w shared` first.
- Dev server only in your own worktree, killed after; browsers muted; every test / probe run time-bounded. A Vite dev build is no perf verdict (use `vite build` + `preview` for the screenshots).
- No in-game copy; no new visible text; Eric's words only (the description, AC 12). Terse. American spelling.
- Never pin copy in a test. Numbers (cycle, version, amendment) at PR time after `git fetch`. Amendment files are append-only. Every landed PR stamps both trackers with one-line stamps; the merge step stamps `done`.
- `CLAUDE.md` is frozen; note stale lines in the report instead.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-11-24: story created (gds-create-story), status ready-for-dev.
