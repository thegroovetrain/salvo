// THE COMMUNITY LINK TEMPLATES (Eric ruling 2026-08-28). The port's underplay
// row gains DISCORD and REDDIT beside HOW TO PLAY · PRIVACY, and this module is
// the one place their URLs are built.
//
// THE SPLIT IS THE POINT: THE TEMPLATE IS CODE, THE IDENTITY IS CONFIG. No
// literal Discord or Reddit URL is committed anywhere else in the repo —
// `VITE_DISCORD_INVITE` carries the invite CODE (the part after `discord.gg/`)
// and `VITE_SUBREDDIT` carries the subreddit NAME (no `r/`), and the shapes
// `https://discord.gg/{code}` / `https://www.reddit.com/r/{name}/` live here.
// That is the same mechanism `VITE_GA_MEASUREMENT_ID` and the AdSense publisher
// id already prove: Vite inlines `VITE_`-prefixed vars at BUILD time and Render
// exposes envVars to the build, so the value reaches `import.meta.env` in the
// bundle. (The ad layer's own var is deliberately NOT named here — ads.test.ts
// pins it to `ads/adsense.ts` and nowhere else.)
//
// AN UNSET VAR HIDES ITS LINK, AND NOTHING ELSE CHANGES (Eric ruling R3) — the
// same absence gating GA4 and AdSense use. A fork, a contributor's `npm run
// dev`, the staging host and any preview build therefore show no community
// links at all; there is NO fallback URL, because a default destination is
// exactly the thing that would send a stranger's players somewhere Eric does
// not run.
//
// A MALFORMED VALUE IS TREATED AS UNSET rather than rendered. The paste
// mistakes a human actually makes are tolerated first — a full invite link in
// any shape Discord's own UI hands out (`discord.gg/x`, `discord.com/invite/x`,
// the legacy `discordapp.com`, `www.`/`canary.`/`ptb.` hosts, a trailing slash,
// a `?event=` query, with or without the scheme) yields its code; a subreddit
// pasted as `r/x`, `/r/x`, `R/x` or the full `reddit.com/r/x/` URL yields its
// name; and the zero-width characters a rich-text copy drags along are
// stripped with the whitespace. Whatever survives that must still match the
// platform's own character set (and a sane length) before it is interpolated.
// Anything else drops the link silently: this is a home-screen affordance, not
// an error surface. (Review gate, cycle 132: the first draft rejected real
// `?event=` invites and every full Reddit URL — both reviewers flagged it.)
//
// The env is read at CALL time (the `analytics/ga.ts` `measurementId()` shape),
// never at module load, so tests can stub it and the fold-away is honest.

/** One rendered anchor in the underplay row. `href` is always a built, validated URL. */
export interface CommunityLink {
  label: 'DISCORD' | 'REDDIT';
  href: string;
}

/** A Discord invite code's character set, bounded so an href can never be
 *  arbitrarily long (real codes are 2-32 characters; 64 leaves headroom). */
const DISCORD_CODE = /^[A-Za-z0-9_-]{2,64}$/;

/** A full invite link in every shape Discord's own UI (or a bot, or an older
 *  client) hands out: optional scheme, `www`/`canary`/`ptb` host, `discord.gg`
 *  or `discord(app).com/invite`, optional trailing slash, optional query or
 *  fragment (the "invite with event" share link carries `?event=…`). */
const DISCORD_URL =
  /^(?:https?:\/\/)?(?:(?:www|canary|ptb)\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/([^/?#]+)\/?(?:[?#].*)?$/i;

/** The subreddit-name character set and length band: 2-21 word characters. This
 *  is deliberately NOT Reddit's full creation rule (3-21, no leading underscore)
 *  — legacy two-letter subs exist, and the job here is to keep URL-significant
 *  bytes out of the href, not to prove the sub exists. */
const SUBREDDIT_NAME = /^[A-Za-z0-9_]{2,21}$/;

/** A pasted full subreddit URL's host part, in the shapes Reddit serves. */
const SUBREDDIT_HOST = /^(?:https?:\/\/)?(?:(?:www|old|new)\.)?reddit\.com\//i;

/** A leading `r/` or `/r/` (any case), which is how a subreddit is written
 *  everywhere but a URL. */
const SUBREDDIT_PREFIX = /^\/?r\//i;

/** Trailing slashes, from a pasted `…/r/name/`. */
const TRAILING_SLASHES = /\/+$/;

/** The zero-width characters a rich-text copy (a dashboard field, a chat
 *  message) drags along invisibly; `trim()` alone keeps them. */
const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g;

function trimmed(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(ZERO_WIDTH, '').trim() : '';
}

/**
 * `VITE_DISCORD_INVITE` → `https://discord.gg/{code}`, or `null` when unset or
 * malformed. A full invite URL is reduced to its code first.
 */
export function discordHref(raw: unknown): string | null {
  const value = trimmed(raw);
  if (value === '') return null;
  const code = DISCORD_URL.exec(value)?.[1] ?? value;
  return DISCORD_CODE.test(code) ? `https://discord.gg/${code}` : null;
}

/**
 * `VITE_SUBREDDIT` → `https://www.reddit.com/r/{name}/`, or `null` when unset or
 * malformed. A pasted full URL, `r/` / `/r/` prefix and trailing slash are
 * stripped first, and the result is re-trimmed so `r/ name` still resolves.
 */
export function subredditHref(raw: unknown): string | null {
  const name = trimmed(raw)
    .replace(SUBREDDIT_HOST, '')
    .replace(SUBREDDIT_PREFIX, '')
    .replace(TRAILING_SLASHES, '')
    .trim();
  if (name === '') return null;
  return SUBREDDIT_NAME.test(name) ? `https://www.reddit.com/r/${name}/` : null;
}

/** `import.meta.env`, or an empty record on any host that has no such thing. */
function viteEnv(): Record<string, unknown> {
  try {
    return (import.meta.env as Record<string, unknown> | undefined) ?? {};
  } catch {
    return {};
  }
}

/**
 * The community anchors, in ROW ORDER — DISCORD then REDDIT — with each entry
 * simply absent when its var is unset or invalid. A missing one drops out
 * without reordering the rest.
 */
export function communityLinks(env: Record<string, unknown> = viteEnv()): CommunityLink[] {
  const out: CommunityLink[] = [];
  const discord = discordHref(env.VITE_DISCORD_INVITE);
  if (discord !== null) out.push({ label: 'DISCORD', href: discord });
  const reddit = subredditHref(env.VITE_SUBREDDIT);
  if (reddit !== null) out.push({ label: 'REDDIT', href: reddit });
  return out;
}
