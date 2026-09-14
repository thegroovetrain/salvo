# Deploy (archived from CLAUDE.md)

> Snapshot taken 2026-09-14 (cycle 133) when `CLAUDE.md` was cut to current best-practice size. This file is NOT auto-loaded; read it on demand. `render.yaml` is the live source of truth for deploy configuration; `CLAUDE.md`'s `## Deploy` section holds the short operational summary. The old `## Deploy Configuration (configured by /setup-deploy)` field block that preceded this text in `CLAUDE.md` is archived verbatim at the END of this file under "Retired" — gstack is no longer used on this project (Eric, 2026-09-14), so nothing parses it; deploys are plain `git`/`gh` merges that Render auto-deploys. Canonical rulings live in `_bmad-output/implementation-artifacts/epic-N-context-amendments.md` (append-only); this is a narrative digest and its numbers may be stale.

Accurate as of cycle 127: **TWO Render web services, from one `render.yaml`** — production and staging.

# The two environments

Each service still serves the built client AND the Colyseus game process from one process; this is an ENVIRONMENT split, not a service split. Story 7-7 *would* split frontend from backend and is DEFERRED IN FULL (Eric ruling F2, 2026-08-21) — do not pre-empt it.

**`render.yaml` is live configuration, not documentation.** Render Blueprint `salvobp` has autoSync ON against it on `main`. Adding a service there creates and bills it; changing `plan` there changes the instance being paid for. Never reach for the Render API or dashboard to make a config change that belongs in the file — the file is the source of truth, and drift between the two is what cycle 127 existed to clean up.

| | production | staging |
|---|---|---|
| Service | `hullcracker` | `hullcracker-dev` |
| Branch | `main` | `development` |
| Plan | pro (2 CPU / 4 GB) | starter (0.5 CPU / 512 MB) |
| Analytics / ads | GA4 + AdSense live | **neither** — both absence-gated off |
| Indexable | yes | no (`HC_NOINDEX=1` → `X-Robots-Tag`) |
| Access | public | **shared password** (`HC_STAGING_KEY`) |

**The staging password.** Set `HC_STAGING_KEY` in the Render dashboard for `hullcracker-dev` (it is `sync: false` in `render.yaml`, so the value is never committed). Visiting the host shows a password page; entering it sets a cookie and you are in. Hand the same password to a playtester. **To rotate, change the env var** — every issued cookie is a digest of the old key, so all of them stop matching at once and everyone is re-prompted. Leave the var unset to run staging open.

It gates **two** doors with one secret, and both are required: an Express middleware in front of `express.static` for the page, and `stagingGateError()` in **both** rooms' `static onAuth` for matchmaking. An Express-only gate would be a facade — `/matchmake/*` and the socket never enter Express, so the game server would stay open. Gating only the queue would likewise leave SOLO VS AI open, since it reaches the game through `client.create('arena')`. `/liveness` and `/metrics` stay open, and a mid-match reconnect is not re-gated (the resume token is the auth) — the same posture the `PROTOCOL_VERSION` gate has always had.

# The development flow
1. Branch from `development` (**not** from `main`).
2. Build the feature; open the PR against `development`.
3. Merge to `development` → the dev service auto-deploys.
4. **Manual QA on the dev host.** This is the gate.
5. Only once QA passes, merge `development` → `main` → production auto-deploys.

**If anything ever lands on `main` directly** — an emergency hotfix, or the bootstrap PR that created this setup — merge `main` back into `development` immediately. Otherwise `development` is behind, the next feature branches from stale code, and the fix is silently re-reverted the next time `development` merges up.

**What the staging gate cannot catch.** Two known blind spots, both structural — do not read "QA passed on staging" as "safe":
1. **Performance.** Staging is `starter` (0.5 CPU / 512 MB) against production's `pro`. Functional QA is trustworthy; frame timings are not. A 20-hull SOLO VS AI match is where the gap shows. Raise the dev plan in `render.yaml` for a cycle that needs to trust its own numbers.
2. **Analytics and ads.** Because staging deliberately omits `VITE_GA_MEASUREMENT_ID` and `VITE_ADSENSE_CLIENT`, the code behind them never runs there — `analytics/consent.ts`, `consentMarker.ts`, `ga.ts`, `ads/adsAdapter.ts`, `adsense.ts`, `resultsAd.ts`, and the interstitial call site in `app/returnToPort.ts`, which takes a *different branch* on staging than in production. Those are the most third-party-fragile modules in the repo and they reach production unexercised. A change touching any of them needs a production smoke immediately after merge.


# Retired: the gstack deploy field block (deleted from CLAUDE.md 2026-09-14)

> Kept verbatim for the record only. gstack is no longer used on this project, so nothing reads these fields; the live facts are in `render.yaml` and `CLAUDE.md`'s `## Deploy` section.

- Platform: Render
- Production URL: https://hullcracker.io/
- Staging URL: https://hullcracker-dev.onrender.com/
- Deploy workflow: feature → `development` → manual QA on staging → `main`
- Deploy status command: HTTP health check
- Merge method: merge
- Project type: web app (multiplayer game)
- Post-deploy health check: https://hullcracker.io/

### Custom deploy hooks
- Pre-merge: none
- Deploy trigger: automatic on push to the service's own branch (Render auto-deploy)
- Deploy status: poll the URL of whichever environment was deployed
- Health check: https://hullcracker.io/ for production; https://hullcracker-dev.onrender.com/ after a staging deploy — never health-check production after a staging deploy. **Once `HC_STAGING_KEY` is set, a healthy staging host answers `401`, not `200`** — that is the password page doing its job, not a failed deploy. `200` there means the gate is OFF.
