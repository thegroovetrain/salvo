import { PROTOCOL_VERSION } from '@salvo/shared';

// Placeholder client for the rt-prototype scaffold. The real PixiJS client
// (stage, camera, netcode) arrives in later build-order steps.
declare const __APP_VERSION__: string;

const app = document.getElementById('app');
if (app) {
  app.textContent = `rt-prototype client v${__APP_VERSION__} (protocol ${PROTOCOL_VERSION})`;
}

console.log('rt-prototype client', {
  version: __APP_VERSION__,
  protocol: PROTOCOL_VERSION,
});
