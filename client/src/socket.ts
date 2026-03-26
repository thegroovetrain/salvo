import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@salvo/shared';
import { getOrCreateGuestId } from './helpers/storage.js';

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  auth: {
    guestId: getOrCreateGuestId(),
  },
});
