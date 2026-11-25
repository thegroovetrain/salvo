// HTML TEXT ESCAPING for the build-time prerender and head tags (Story 13.1,
// AC 4). Pure, Node-safe. No markup ever comes from the copy modules: every
// string they hold is text, and it is escaped on the way into a document.

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

/** Escape `& < > "` — safe in element text and in a double-quoted attribute. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ESCAPES[c] ?? c);
}

const UNESCAPES: Readonly<Record<string, string>> = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&amp;': '&',
};

/**
 * The inverse, for the few entities a source document's own `<title>` or
 * description attribute can carry. Read text is decoded and re-escaped on the
 * way out, so nothing is double-escaped and nothing slips through raw.
 */
export function unescapeHtml(text: string): string {
  return text.replace(/&(?:lt|gt|quot|#39|amp);/g, (e) => UNESCAPES[e] ?? e);
}
