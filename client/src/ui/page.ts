// THE STANDARD PAGE CHROME'S BEHAVIOR (Story 7.2, Eric ruling R12; Story 13.1).
//
// ONE VERSION OF EVERY PAGE (Eric 2026-11-24). The page itself — every element
// and every style — is built ONCE, as an HTML string, by `ui/pageMarkup.ts`,
// and the build writes it into the served document. This module builds
// nothing: `attachPage` finds the served root and wires only what needs
// JavaScript (ESC returns home; `pagehide` disposes the listeners). It never
// removes, clones or redraws the served page.
//
// THE ONE EXCEPTION IS A DOCUMENT WITH NO SERVED ROOT — a bare jsdom test, never
// a production page. There `attachPage` inserts the SAME `markup()` string
// first, so the one builder is still the one source.

/** An attached page: its served root, and the one teardown path. */
export interface AttachedPage {
  /** The served root element (never built here). */
  root: HTMLElement;
  /** Unbind ESC and the `pagehide` disposal hook. Idempotent. Leaves the page
   *  in the document: it is the served page, not something this module made. */
  detach(): void;
}

export interface AttachOptions {
  /** The served root's DOM id (`PageMarkupOptions.id`). */
  id: string;
  /** The page's build string — inserted ONLY when no served root exists. */
  markup: () => string;
  /** Where ESC goes. Defaults to `goHome`. */
  onBack?: () => void;
}

/**
 * RETURN HOME — an explicit navigation to `/`, NEVER `history.back()`.
 *
 * A visitor can land on `/privacy` directly (a search result, a link in a store
 * listing), and for that visitor `history.back()` leaves the site entirely.
 * EXPERIENCE.md:37's contract is "returns home", a destination, not a
 * direction. The browser's own back button needs no code: these pages are real
 * navigations. The served back link is `<a href="/">`, the same destination.
 */
export function goHome(): void {
  window.location.href = '/';
}

/** The served root, or the build string inserted first thing in `<body>`. */
function servedRoot(opts: AttachOptions): HTMLElement {
  const served = document.getElementById(opts.id);
  if (served !== null) return served;
  document.body.insertAdjacentHTML('afterbegin', opts.markup());
  return document.getElementById(opts.id) as HTMLElement;
}

/**
 * THE ONE LIVE ATTACHMENT. A second `attachPage` detaches the previous one
 * first: the ESC binding is document-level and capture-phase, so two live
 * attachments would answer one key press twice. A boot that discarded its
 * handle (both page mains do) is still covered — replacing is correct without
 * the caller's cooperation.
 */
let live: AttachedPage | null = null;

/**
 * Attach the page's behavior to its served root.
 *
 * ESC is bound on `document` in the CAPTURE phase so the page gets the key
 * first; `detach()` unbinds with the same flag, or the removal silently does
 * nothing. The binding can no longer outlive its page three ways: attaching
 * again detaches the previous attachment, the handler DISOWNS ITSELF if the
 * root has left the document, and `pagehide` disposes it when the document
 * goes away (Story 7-8: both page mains discard the handle, so this is what
 * makes disposal reachable at all; `pagehide` rather than `unload`, which is
 * deprecated and disables the back/forward cache).
 *
 * TEARDOWN NO LONGER REMOVES THE ROOT. The old renderer removed its root on
 * destroy because the root was something it had built and appended — a second
 * mount would otherwise stack two full-viewport sheets. The root is now the
 * served document's own content: nothing here created it, a second attach
 * re-finds the same node rather than stacking another, and a terminating
 * document is discarded whole anyway. Deleting it would only reintroduce the
 * delete-and-redraw this story removes. So teardown = unbind, nothing more.
 */
export function attachPage(opts: AttachOptions): AttachedPage {
  live?.detach();
  const root = servedRoot(opts);
  const onBack = opts.onBack ?? goHome;

  let bound = true;
  const detach = (): void => {
    if (!bound) return;
    bound = false;
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('pagehide', onPageHide);
    if (live === page) live = null;
  };
  /**
   * The document is going away — unbind, so the capture-phase ESC listener
   * cannot outlive the page that owns it.
   *
   * `persisted` IS THE TRAP. A `pagehide` with `persisted: true` means the
   * document is entering the back/forward cache and may be shown again exactly
   * as it is. There is nothing to clean up (a frozen document's listeners are
   * frozen with it), and unbinding there would restore a page whose ESC no
   * longer works. The listener stays bound (no `once`) so the real termination
   * still reaches here.
   */
  function onPageHide(e: PageTransitionEvent): void {
    if (e.persisted) return;
    detach();
  }
  function onKey(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    // The page left the DOM without a teardown: unbind instead of navigating.
    if (!root.isConnected) {
      detach();
      return;
    }
    e.preventDefault();
    onBack();
  }
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('pagehide', onPageHide);

  const page: AttachedPage = { root, detach };
  live = page;
  return page;
}
