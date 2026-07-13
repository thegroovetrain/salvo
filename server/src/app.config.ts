import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '@colyseus/tools';
import { monitor } from '@colyseus/monitor';
import { playground } from '@colyseus/playground';
import type { Request, Response } from 'express';
import { ArenaRoom } from './rooms/ArenaRoom.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'),
) as { version: string };

const isProd = process.env.NODE_ENV === 'production';

export default config({
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
    }
  },
});
