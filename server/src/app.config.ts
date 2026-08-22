import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '@colyseus/tools';
import { monitor } from '@colyseus/monitor';
import { playground } from '@colyseus/playground';
import { createRouter } from 'colyseus';
import express, { type Request, type Response } from 'express';
import { ArenaRoom } from './rooms/ArenaRoom.js';
import { StandardQueueRoom } from './rooms/StandardQueueRoom.js';
import { metricsEndpoint } from './metrics.js';
import { livenessEndpoint } from './liveness.js';
import { noIndexEnabled, robotsTagMiddleware } from './robots.js';
import {
  GATE_PATH,
  gateEnabled,
  handleGateSubmit,
  stagingGateMiddleware,
} from './stagingGate.js';
import { logInfo } from './log.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'),
) as { version: string };

const isProd = process.env.NODE_ENV === 'production';

export default config({
  // Typed HTTP routes (Colyseus 0.17): served alongside the default
  // matchmaking routes. `/metrics` returns the process-local ops snapshot;
  // `/liveness` (Story 6.6) returns the DRIVER-backed, cross-process,
  // player-facing snapshot the home screen polls. The two numbers differ on
  // purpose — see the note at the top of metrics.ts.
  //
  // ONE `createRouter` CALL CARRYING BOTH ENDPOINTS, never `metricsRoutes
  // .extend({...})`. Both build a router that serves both paths, but only
  // core's `createRouter` assigns the module-level `__globalEndpoints`
  // (@colyseus/core 0.17.44 build/router/index.mjs:71-74), and that global is
  // what `@colyseus/playground` reads to list the server's routes. `.extend()`
  // delegates straight to better-call's own router factory and never touches
  // it — so the extended endpoint (i.e. /liveness, the one added second) was
  // invisible in the dev playground while working perfectly over HTTP.
  //
  // `metricsEndpoint` itself is untouched — same object, same path, same
  // method, same handler — and metrics.ts still exports its own `metricsRoutes`
  // for anything that wants the ops route standalone.
  routes: createRouter({ getMetrics: metricsEndpoint, getLiveness: livenessEndpoint }),

  initializeGameServer: (gameServer) => {
    // 'queue' is the ONLY door a production client knocks on (Story 6.1): it
    // pools captains and reserves them a seat in an arena it creates through
    // the matchmaker. 'arena' stays defined because that is what the queue
    // creates — but its own public door is closed in ArenaRoom.static onAuth
    // unless HC_DEV_OPTIONS=1 (smokes still join it directly).
    gameServer.define('queue', StandardQueueRoom);
    gameServer.define('arena', ArenaRoom);
  },

  initializeExpress: (app) => {
    app.get('/health', (_req: Request, res: Response) => {
      res.json({ ok: true, version: pkg.version });
    });

    if (!isProd) {
      app.use('/playground', playground());
      app.use('/monitor', monitor());
    } else {
      // INSIDE the prod branch, immediately before the static mount, and both
      // halves of that placement are load-bearing.
      //
      // BEFORE static, because the layer that serves the pages must be the one
      // the header is already set for. INSIDE the prod branch, because the
      // client is the only thing here worth de-indexing and it exists only in
      // this branch — and because a path-less `app.use` registers a layer that
      // matches '/', which is exactly what @colyseus/core's `expressRootRoute`
      // looks for when deciding whether to add its own `GET /` fallback
      // (core/build/router/index.mjs:18-27). Mounting this at the top of
      // initializeExpress would therefore suppress that fallback and 404 the
      // root in NON-prod, where no static mount exists to serve it. In prod,
      // express.static already sets that flag, so this adds nothing new.
      //
      // Only mounted on a host that opted in with HC_NOINDEX=1 — the staging
      // service in render.yaml. Production leaves it unset and never mounts it.
      //
      // LOGGED EITHER WAY, because the only symptom of this silently failing is
      // a staging page turning up in search weeks later. One line in the deploy
      // log makes "is this host protected?" answerable without a live request,
      // and it is the ops-surface habit log.ts/metrics.ts/liveness.ts already
      // set. The env value is deliberately NOT logged — only the decision.
      const noIndex = noIndexEnabled();
      logInfo('robots.noindex', { enabled: noIndex });
      if (noIndex) {
        app.use(robotsTagMiddleware);
      }

      // THE STAGING PASSWORD, page half (cycle 127). Ahead of express.static so
      // nothing is served without the cookie, and the POST route is registered
      // FIRST so it stays reachable to someone who does not have one yet.
      // The GAME half of the same secret lives in both rooms' static onAuth —
      // an Express-only gate would leave matchmaking and the socket open, since
      // neither ever enters Express. See stagingGate.ts.
      //
      // Inert unless HC_STAGING_KEY is set, which only the staging service
      // does, so production adds no route, no middleware and no per-request
      // work. Logged either way, like the noindex decision above.
      const gated = gateEnabled();
      logInfo('stagingGate', { enabled: gated });
      if (gated) {
        app.post(GATE_PATH, express.urlencoded({ extended: false }), handleGateSubmit);
        app.use(stagingGateMiddleware);
      }

      // In production the game server IS the web server: Vite only exists in
      // dev, so the built client must be served from here or the site 404s.
      // express.static also serves index.html at '/'; no catch-all route, so
      // Colyseus's own matchmaking endpoints are never shadowed. The client's
      // same-origin wss fallback (client connection.ts) pairs with this.
      app.use(express.static(resolve(__dirname, '../../client/dist')));
    }
  },
});
