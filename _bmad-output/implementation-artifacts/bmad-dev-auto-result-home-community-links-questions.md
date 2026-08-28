---
status: answered
---

# BMad Dev Auto Result — Home Community Links (questions)

Status: ANSWERED 2026-08-28 — all four ruled by Eric in-session (via AskUserQuestion, same run).
Original blocking condition: intent gaps. Eric asked for Discord and subreddit links on the home
page, built from templates in code plus environment variables — never literal URLs in source. Where
the links go, what the env vars hold, what an unset var does, and what the labels say were all
undetermined.

## THE ANSWERS (Eric, 2026-08-28)

- **R1 — UNDERPLAY LINK ROW.** The links join the existing row beside HOW TO PLAY · PRIVACY, in the
  same hudMicro underlined phosphor treatment (`UNDERPLAY_LINK_CSS`). No new row, no corner
  register, no icons. The row's "exactly two children" test pin is UPDATED, not deleted — the row
  is still "places you can go" and nothing else.
- **R2 — CODE + TEMPLATE.** `VITE_DISCORD_INVITE` holds the invite CODE → `https://discord.gg/{code}`;
  `VITE_SUBREDDIT` holds the subreddit NAME (no `r/`) → `https://www.reddit.com/r/{name}/`. The
  templates are code; the identity is config.
- **R3 — HIDE THAT LINK.** An unset var renders no anchor at all, and nothing else changes.
  Absence-gated exactly like GA4 and AdSense. Staging, forks and a local `npm run dev` therefore
  show no community links unless configured. No fallback URL exists.
- **R4 — LABELS `DISCORD` / `REDDIT`; VALUES "Leave unset for now."** Both keys ship COMMENTED OUT
  in `render.yaml`'s production `envVars`, on the `VITE_ADSENSE_SLOT_RESULTS` precedent. No invite
  code or subreddit name is invented or committed.

---

## THE QUESTIONS

### Q1 — Where do the links go?

The home has one existing place for off-page destinations (the underplay row: HOW TO PLAY ·
PRIVACY, with the server-status line beneath it) and several places that would be new surfaces.

- **Option A (recommended): the underplay link row**, beside HOW TO PLAY and PRIVACY, same
  treatment. The row already means "places you can go", so this adds members rather than a concept.
  Costs one test-pin update (the row is pinned at exactly two children).
- **Option B: a new row of their own** beneath the underplay row, so community sits apart from
  the legal/help links.
- **Option C: a corner register** (the bottom-left liveness block's mirror), with icons.

### Q2 — What shape do the environment variables take?

- **Option A (recommended): code + template.** `VITE_DISCORD_INVITE=abc123` and
  `VITE_SUBREDDIT=hullcracker`, with `https://discord.gg/{code}` and
  `https://www.reddit.com/r/{name}/` living in a client module. The env carries identity only, and
  the repo can be read to learn what shape a URL takes without learning where it points.
- **Option B: full URLs in the env** (`VITE_DISCORD_URL=https://discord.gg/abc123`). Simpler to
  set; puts an arbitrary destination one env var away from the home screen, and validation becomes
  "is this a URL" rather than "is this a Discord invite code".

### Q3 — What happens when a var is unset?

- **Option A (recommended): hide that link.** The GA4/AdSense posture — no var, no anchor, and the
  other link is unaffected. A fork or a preview build shows no community links at all.
- **Option B: fall back to a default URL** compiled into the client.
- **Option C: render the label disabled/greyed** so the row's shape is constant.

### Q4 — What do the labels say, and what values ship today?

- **Labels:** `DISCORD` / `REDDIT`, or something longer (`JOIN THE DISCORD`, `r/hullcracker`).
- **Values:** paste the real invite code and subreddit name into `render.yaml` now, or ship both
  keys commented out until the community exists.

---

## Orchestrator rulings derived from the four answers

These are implementation consequences of R1–R4, decided by the orchestrator rather than by Eric,
and recorded here so they are not re-litigated:

- **Paste tolerance.** The two mistakes a human actually makes are absorbed rather than rejected: a
  full invite link (`https://discord.gg/<code>` or `https://discord.com/invite/<code>`, `www.` and
  a trailing slash included) yields its `<code>`, and a leading `r/` or `/r/` on the subreddit is
  stripped. Values are trimmed first.
- **Validation regexes.** After that reduction, a Discord code must match `^[A-Za-z0-9_-]+$` and a
  subreddit `^[A-Za-z0-9_]{2,21}$` (Reddit's own rule). Anything that fails is treated as UNSET —
  the link is hidden, silently — so no unvalidated value is ever interpolated into an href. This
  extends R3 from "absent" to "absent or malformed", which is the only reading that keeps R2's
  template safe.
- **`target="_blank"` + `rel="noopener noreferrer"`.** These destinations are off-site, so they
  open in a new tab and are denied a window handle back onto the game tab (and the referrer). The
  two static-page links keep their same-tab behaviour — they are this site.
- **Fixed row order.** `HOW TO PLAY`, `PRIVACY`, then `DISCORD`, then `REDDIT`. Community links
  follow the static-page links, and a missing or malformed one simply drops out without reordering
  the rest.
- **Env is read at CALL time**, inside try/catch, through `import.meta.env` — the
  `analytics/ga.ts` `measurementId()` shape. A module-load read would freeze the value before a
  test could stub it and would make the fold-away untestable.
- **No `PROTOCOL_VERSION` bump.** The change is client-only; nothing on the wire moves.

## Next command

Answered in-session; no re-invocation was needed. Spec: `spec-home-community-links.md`.
