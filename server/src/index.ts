import { listen } from '@colyseus/tools';
import appConfig from './app.config.js';

const port = Number(process.env.PORT) || 2567;

listen(appConfig, port);
