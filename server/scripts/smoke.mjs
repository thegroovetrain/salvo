// Throwaway schema-sync proof: connect to a running dev server, join 'arena',
// wait for the first state patch, assert the roster synced (proves the v3
// decorator wiring). Run against a booted server:  node server/scripts/smoke.mjs
import { Client } from 'colyseus.js';

const endpoint = process.env.WS_URL || 'ws://localhost:2567';

async function main() {
  const client = new Client(endpoint);
  const room = await client.joinOrCreate('arena', { name: 'SMOKE-01' });

  const state = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no state patch within 5s')), 5000);
    room.onStateChange.once((s) => {
      clearTimeout(timer);
      resolve(s);
    });
  });

  const players = [...state.players.values()];
  if (players.length !== 1) {
    throw new Error(`expected 1 player, got ${players.length}`);
  }
  if (players[0].name !== 'SMOKE-01') {
    throw new Error(`expected name SMOKE-01, got ${players[0].name}`);
  }

  console.log('SCHEMA SYNC OK:', {
    mapSeed: state.mapSeed,
    mapRadius: state.mapRadius,
    players: players.map((p) => ({ id: p.id, name: p.name, alive: p.alive })),
  });

  await room.leave();
  process.exit(0);
}

main().catch((err) => {
  console.error('SCHEMA SYNC FAILED:', err.message);
  process.exit(1);
});
