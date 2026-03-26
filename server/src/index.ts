import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ClientToServerEvents, ServerToClientEvents } from '@salvo/shared';
import { ConnectionManager } from './connections.js';
import { LobbyManager } from './lobby.js';
import { GuestSessionManager } from './guestSessions.js';
import { PartyManager } from './party/state.js';
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
const partyManager = new PartyManager();

// Wire up GC: guest sessions check if games still exist via lobby
guestSessions.setGameExistsCheck((gameId) => lobby.getGame(gameId) !== undefined);

// Wire up party manager with guest sessions
partyManager.setGuestSessions(guestSessions);

// Wire up party state change callback for timer-driven events
partyManager.setOnStateChange((party, removedGuestIds) => {
  if (party.members.size === 0) {
    // Party destroyed — notify removed members
    for (const guestId of removedGuestIds ?? []) {
      const session = guestSessions.getSession(guestId);
      if (session?.socketId) {
        io.to(session.socketId).emit('party-disbanded');
      }
    }
    return;
  }
  // Party still alive — broadcast updated state to remaining members
  const payload = partyManager.toPayload(party);
  for (const member of party.members.values()) {
    const session = guestSessions.getSession(member.guestId);
    if (session?.socketId) {
      io.to(session.socketId).emit('party-updated', payload);
    }
  }
});

// Initialize module-level references for emitters (avoids circular deps)
initEmitters(io, connections, lobby, guestSessions, partyManager);

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
    parties: partyManager.getActivePartyCount(),
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
partyManager.startGC();

httpServer.listen(PORT, () => {
  console.log(`Salvo server listening on port ${PORT}`);
});

export { app, httpServer, io, lobby, connections, guestSessions, partyManager };
