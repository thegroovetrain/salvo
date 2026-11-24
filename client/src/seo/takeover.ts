// THE PRERENDER HANDOFF (Story 13.1, AC 6).
//
// The build writes each page's words into the served HTML inside ONE element
// with this id (`prerender.ts`, via the `hc-crawlable` Vite plugin). When the
// live renderer mounts, it removes that element and builds the same words from
// the same copy modules, so the document never holds two `<h1>`s and never
// shows text the static block did not carry.
//
// Node-safe at module scope (the Vite config imports `PRERENDER_ID`): the DOM
// is touched only inside `removePrerendered`.

/** The id of the build-time prerendered block in every served document. */
export const PRERENDER_ID = 'hc-prerender';

/** Remove the prerendered block, if the document has one. Idempotent. */
export function removePrerendered(doc: Document = document): void {
  doc.getElementById(PRERENDER_ID)?.remove();
}
