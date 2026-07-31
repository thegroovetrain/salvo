// THE CONTAINER-FIT LAW, as two reusable DOM guards (amendment 47: "nothing
// anywhere in the game may render larger than its container — no text or element
// may extend past its box such that it covers, or can be covered by, another
// part of the UX").
//
// Every DOM port surface that caps its size against the viewport goes through
// here, for two reasons.
//
// 1. THE DEFECT THESE ENCODE. All three port panels (results, class bay,
//    settings) capped their height in viewport terms — `max-height:100%`,
//    `calc(100vh - 48px)` — under the CSS default box model. `max-height` caps
//    the CONTENT box under content-box, so each panel's BORDER box came out at
//    `cap + padding + border`: results +66px, class bay +62px, settings +58px,
//    at EVERY viewport size, half clipped off each edge. Three identical bugs
//    from one missing declaration; this is the declaration, written once.
//
// 2. THE CSSOM-BLOB HAZARD. Those panels build their style as one `cssText`
//    blob containing `border:1px solid var(--x)`, which the test environment's
//    CSSOM parser rejects — voiding the ENTIRE blob and leaving the element
//    unstyled in jsdom. Anything load-bearing therefore has to be assigned as
//    its own property, which is also what makes it assertable
//    (__tests__/containerFit.test.ts). The refit band documents the same hazard.

/**
 * A panel whose height is capped against the viewport: make the cap apply to the
 * BORDER box, and make sure whatever the cap cuts off is still reachable.
 * Idempotent, and safe to call after any cssText assignment.
 */
export function applyViewportCap(el: HTMLElement): void {
  el.style.boxSizing = 'border-box';
  el.style.overflowY = 'auto';
}

/**
 * A centred column that can outgrow its container: make it scroll, and stop it
 * centring its overflow out of reach.
 *
 * `justify-content:center` distributes overflow to BOTH ends, and a scroll
 * container cannot be scrolled back past its start edge — so a centred column
 * taller than the viewport puts its own head permanently out of reach (the home
 * page's wordmark, at any viewport under ~668px tall). `safe center` degrades to
 * flex-start exactly when the content overflows. The plain value is written
 * first so a browser (or parser) that does not know `safe` keeps centring and
 * still scrolls to the foot.
 */
export function applySafeCenterScroll(el: HTMLElement): void {
  el.style.overflowY = 'auto';
  el.style.justifyContent = 'center';
  el.style.justifyContent = 'safe center';
}
