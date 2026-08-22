---
title: 'Render reality sync + a development branch and staging service'
type: 'chore'
created: '2026-08-22'
status: 'in-progress'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/render.yaml'
  - '{project-root}/CLAUDE.md'
warnings: ['multiple-goals']
---

<intent-contract>

## Intent

**Problem:** `render.yaml` under-declares the live `hullcracker` service — it omits `plan`, `region`, `branch` and `autoDeploy`, so the fact that production now runs a **Pro** instance exists only in the Render dashboard. And there is exactly one environment: every merge to `main` deploys straight to the public game, with no host to manually QA a feature on first.

**Approach:** Declare the live service's real settings in `render.yaml` (which the `salvobp` Blueprint already auto-syncs from `main`), add a second `hullcracker-dev` service in the same file tracking a new `development` branch, and rewrite the documented deploy process to `feature -> development -> manual QA -> main`.

## Boundaries & Constraints

**Always:**
- `render.yaml` is LIVE CONFIG, not documentation: Blueprint `salvobp` (`exs-d6vln4sr85hc73beab80`) has `autoSync: true` against `render.yaml` on `main`. Every declared field must equal the value already live on `srv-d71cpnv5gffc73foa6m0`, so the prod half of the sync is a verified no-op: `plan: pro`, `region: oregon`, `branch: main`, `autoDeploy: true`.
- Push the `development` branch to `origin` BEFORE the render.yaml change can reach `main` — a service naming a branch that does not exist cannot sync.
- The dev service reuses the prod `buildCommand`/`startCommand` verbatim. A staging host that builds differently from production tests the wrong artifact.
- `NODE_ENV=production` on dev too: the point of the host is to exercise the production code path.

**Block If:**
- Applying anything to the live service directly through the Render API. Every change reaches Render by merging `render.yaml`, so Eric's merge is the approval — including the approval to start billing a second instance.
- A change would restart or redeploy production as a side effect.

**Never:**
- Do not set `VITE_GA_MEASUREMENT_ID` or `VITE_ADSENSE_CLIENT` on the dev service. Both are deliberately absence-gated (`render.yaml` comments; `isGaConfigured()`), so omitting them keeps staging traffic out of the GA4 property and serves no ads from a test host.
- Do not enable `HC_DEV_OPTIONS` on the dev service — manual QA must exercise the same gate production runs (`ArenaRoom.ts:196,276` open direct arena joins and client-supplied room overrides on `'1'`).
- Do not set `NODE_ENV` to anything but `production` on the dev service. It is load-bearing, not cosmetic: `app.config.ts:19` gates `express.static` on it, so a non-prod value serves no client at all AND mounts `/playground` + `/monitor` publicly.
- Do not set `VITE_WS_URL` on either service. Unset, `wsEndpoint()` falls through to `wss://${location.host}`, which is what makes one build work on both hosts; set, a dev client would talk to whatever it names.
- Do not add `healthCheckPath`, delete the stale `HC_RADAR_*` env vars, or verify `www.hullcracker.io`. All three are real findings but all three mutate production; ledger them.
- Do not split frontend and backend into two services — Story 7-7 is deferred in full (Eric, 2026-08-21).
- Do not add branch protection, CI, or a `dev.hullcracker.io` custom domain (needs registrar DNS Eric controls).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Prod sync is a no-op | `render.yaml` on `main` gains `plan: pro`, `region: oregon`, `branch: main` — all already live | Blueprint reports in_sync; no new prod deploy is triggered by the settings themselves | If Render reports a settings diff on the prod service, the declared value is wrong — correct it to the API's value |
| Dev service is created | Blueprint syncs a `render.yaml` naming `hullcracker-dev`, branch `development` | Render creates the service and builds `development` at its own `*.onrender.com` host | Build failure is isolated to the dev service; prod is untouched |
| Dev branch missing | `render.yaml` names `branch: development`, branch absent on `origin` | N/A — prevented by pushing `development` first | Blueprint sync errors on the unknown branch |
| Dev host analytics | A player loads the dev host | No GA4 beacon, no AdSense loader, no `ads.txt` — the absence-gates are all false | None expected |
| Dev host is not indexable | `HC_NOINDEX=1` set on the dev service; any request | Response carries `X-Robots-Tag: noindex, nofollow` | None expected |
| Prod stays indexable | `HC_NOINDEX` unset (production) | No `X-Robots-Tag` header on any response; middleware never mounted | None expected |
| Feature flow | A feature branch merges to `development` | Dev service auto-deploys; prod unchanged until `development` merges to `main` | None expected |

</intent-contract>

## Code Map

- `render.yaml` -- the Blueprint source; one `services:` list, currently one entry. Both edits land here.
- `server/src/robots.ts` -- NEW ops surface, sibling of `log.ts`/`metrics.ts`/`liveness.ts`: the `HC_NOINDEX` search-engine guard.
- `server/src/app.config.ts` -- `initializeExpress`; mount the guard ahead of `express.static` (line 66). `isProd` at line 19 is the load-bearing `NODE_ENV` switch.
- `client/src/net/connection.ts:232-239` -- `wsEndpoint()`; already same-origin, so NO client change is needed for a second host. Confirms the dev service needs no `VITE_WS_URL`.
- `CLAUDE.md` -- "Deploy Configuration (configured by /setup-deploy)" section states the single-service, push-to-main flow.
- `_bmad-output/project-context.md` -- two lines assert "Render, auto-deploy on push to main" (Technology Stack, Platform & Build Rules).
- `VERSION` + `package.json` -- 0.17.126, single-sourced into the client by Vite; this cycle is 127.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`, `_bmad-output/gds-workflow-status.yaml` -- both trackers must move in this same PR.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- home for the four ledgered production findings.

## Tasks & Acceptance

**Execution:**
- [ ] `development` branch -- create from `main` at 0.17.126 and push to `origin` -- must exist before the Blueprint names it.
- [ ] `render.yaml` -- add `plan: pro`, `region: oregon`, `branch: main`, `autoDeploy: true` to the `hullcracker` service -- close the drift Eric asked about; each value copied from the live API response.
- [ ] `render.yaml` -- add a second `hullcracker-dev` web service: same runtime/build/start, `branch: development`, `plan: starter`, `region: oregon`, `autoDeploy: true`, `NODE_ENV=production` only -- the staging host, with a comment stating why GA/AdSense are absent and that `plan` is the one knob to reconsider.
- [ ] `server/src/robots.ts` + `server/src/app.config.ts` + `server/src/__tests__/robots.test.ts` -- add an `HC_NOINDEX=1` middleware sending `X-Robots-Tag: noindex, nofollow`, set only on the dev service -- without it the staging host is fully indexable and duplicates hullcracker.io's three pages; the repo has no robots.txt, canonical URL or noindex anywhere, so the dev service creates this exposure and must close it.
- [ ] `CLAUDE.md` -- rewrite the Deploy Configuration section for two services and the `feature -> development -> QA -> main` flow -- agents read this to know where a push lands.
- [ ] `_bmad-output/project-context.md` -- correct both "auto-deploy on push to main" assertions -- they are now wrong for feature work.
- [ ] `VERSION`, `package.json` -- 0.17.126 -> 0.17.127 -- Eric's cycle-count ruling.
- [ ] `_bmad-output/implementation-artifacts/deferred-work.md` -- ledger the four production findings (empty `healthCheckPath` vs the working `/liveness`; stale `HC_RADAR_GRAMMAR`/`HC_RADAR_IDENTITY` env vars orphaned on the service since cycle ~103; `www.hullcracker.io` unverified; no `dev.hullcracker.io`) -- each needs an Eric action that mutates production.
- [ ] `_bmad-output/implementation-artifacts/sprint-status.yaml`, `_bmad-output/gds-workflow-status.yaml` -- one-line cycle-127 stamps -- standing rule: both trackers move in the landing PR.

**Acceptance Criteria:**
- Given the live API response for `srv-d71cpnv5gffc73foa6m0`, when each field declared for the `hullcracker` service in `render.yaml` is compared to it, then every value is identical.
- Given `render.yaml` after the change, when it is parsed as YAML, then it contains exactly two services, named `hullcracker` and `hullcracker-dev`.
- Given the `hullcracker-dev` service block, when its `envVars` are read, then the only keys present are `NODE_ENV` and `HC_NOINDEX` — no `VITE_*` key of any kind, and no `HC_DEV_OPTIONS`.
- Given `git ls-remote origin development`, when run after the branch task, then it resolves to the same commit as `main` did at branch time.
- Given `CLAUDE.md` and `_bmad-output/project-context.md` after the change, when searched for a claim that merging to `main` is the normal deploy path for a feature, then no such claim remains.
- Given `npm run check`, when run on the branch, then it passes with the new `robots.test.ts` cases included and no pre-existing test changed.
- Given the server booted with `HC_NOINDEX` unset, when any route is requested, then no `X-Robots-Tag` header is present — production behaviour is byte-identical to today.

## Design Notes

The Blueprint is why this is one atomic change rather than two. `render.yaml` is not a description of the deployment that someone later applies by hand — `salvobp` watches it on `main` and reconciles. So declaring `plan: pro` and creating the dev service are the same kind of act, and both take effect at Eric's merge. That also means the merge, not an API call, is where the second instance starts costing money; `plan: starter` is staged as the cheapest tier that does not spin down, and it is one word to change before merging if faithful perf QA matters more than $7/mo.

The two `HC_RADAR_*` env vars are worth reading as a lesson rather than a bug: Blueprint sync adds and updates env vars but does not remove ones dropped from the file, so Story 7-3 deleting them from `render.yaml` and from the source left them live on the service, read by nothing. Removing them requires an API call that triggers a production redeploy, which is why it is ledgered rather than done.

## Verification

**Commands:**
- `python3 -c "import yaml,sys; d=yaml.safe_load(open('render.yaml')); print([s['name'] for s in d['services']])"` -- expected: `['hullcracker', 'hullcracker-dev']`
- `curl -s -H "Authorization: Bearer $RENDER_API_KEY" https://api.render.com/v1/services/srv-d71cpnv5gffc73foa6m0` -- expected: `plan`, `region`, `branch`, `autoDeploy` equal the values declared in `render.yaml`
- `git ls-remote origin development` -- expected: one ref, matching `main`'s tip at branch time
- `npm run check` -- expected: passes; this cycle touches no source
- `grep -rn "HC_RADAR" shared/src server/src client/src render.yaml` -- expected: empty (confirms the orphaned vars are dead)

**Manual checks (if no CLI):**
- After Eric merges: the Render dashboard lists two services; `hullcracker` shows no new deploy caused by the settings sync; `hullcracker-dev` builds `development` green and its host serves the game with no GA/AdSense network requests.
