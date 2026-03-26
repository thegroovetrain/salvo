import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ClientToServerEvents, ServerToClientEvents } from '@salvo/shared';
import { ConnectionManager } from './connections.js';
import { LobbyManager } from './lobby.js';
import { GuestSessionManager } from './guestSessions.js';
import { initEmitters } from './emitters.js';
import { setupSocket } from './socketSetup.js';

// ============================================================
// Core Instances
// ============================================================

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: '*' },
});

const lobby = new LobbyManager();
const connections = new ConnectionManager();
const guestSessions = new GuestSessionManager();

// Wire up GC: guest sessions check if games still exist via lobby
guestSessions.setGameExistsCheck((gameId) => lobby.getGame(gameId) !== undefined);

// Initialize module-level references for emitters (avoids circular deps)
initEmitters(io, connections, lobby, guestSessions);

// Wire up socket event handlers
setupSocket(io);

// ============================================================
// Static Files (production)
// ============================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');
const repoRoot = path.resolve(__dirname, '../..');

// Health endpoint — server state visibility
const serverStartTime = Date.now();
app.get('/health', (_req, res) => {
  res.json({
    guests: guestSessions.sessionCount,
    games: lobby.gameCount,
    players: connections.connectionCount,
    uptime: Math.floor((Date.now() - serverStartTime) / 1000),
  });
});

// Serve CHANGELOG.md from repo root
app.get('/CHANGELOG.md', (_req, res) => {
  res.sendFile(path.join(repoRoot, 'CHANGELOG.md'));
});

app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// ============================================================
// Server Start
// ============================================================

const PORT = parseInt(process.env.PORT ?? '3000', 10);

lobby.startCleanup();
guestSessions.startGC();

httpServer.listen(PORT, () => {
  console.log(`Salvo server listening on port ${PORT}`);
});

export { app, httpServer, io, lobby, connections, guestSessions };
