import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '@colyseus/tools';
import { monitor } from '@colyseus/monitor';
import { playground } from '@colyseus/playground';
import express, { type Request, type Response } from 'express';
import { ArenaRoom } from './rooms/ArenaRoom.js';
import { metricsRoutes } from './metrics.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'),
) as { version: string };

const isProd = process.env.NODE_ENV === 'production';

export default config({
  // Typed HTTP routes (Colyseus 0.17): served alongside the default
  // matchmaking routes. `/metrics` returns the process-local ops snapshot.
  routes: metricsRoutes,

  initializeGameServer: (gameServer) => {
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
