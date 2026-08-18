import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '@colyseus/tools';
import { monitor } from '@colyseus/monitor';
import { playground } from '@colyseus/playground';
import express, { type Request, type Response } from 'express';
import { ArenaRoom } from './rooms/ArenaRoom.js';
import { StandardQueueRoom } from './rooms/StandardQueueRoom.js';
import { metricsRoutes } from './metrics.js';
import { livenessEndpoint } from './liveness.js';

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
  // `.extend()` composes a new router from the metrics one rather than
  // replacing it (verified against @colyseus/core 0.17.44's
  // build/router/index.d.ts, which declares `extend` on createRouter's return).
  routes: metricsRoutes.extend({ getLiveness: livenessEndpoint }),

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
      // In production the game server IS the web server: Vite only exists in
      // dev, so the built client must be served from here or the site 404s.
      // express.static also serves index.html at '/'; no catch-all route, so
      // Colyseus's own matchmaking endpoints are never shadowed. The client's
      // same-origin wss fallback (client connection.ts) pairs with this.
      app.use(express.static(resolve(__dirname, '../../client/dist')));
    }
  },
});
