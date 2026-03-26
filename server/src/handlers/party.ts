import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@salvo/shared';
import { getGuestSessions, getPartyManager, emitToGuest } from '../emitters.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

function broadcastToPartyMembers(party: { members: Map<string, { guestId: string }> }, event: string, data: unknown, excludeGuestId?: string): void {
  for (const member of party.members.values()) {
    if (member.guestId !== excludeGuestId) {
      emitToGuest(member.guestId, event, data);
    }
  }
}

export function registerPartyHandlers(io: IO, socket: TypedSocket): void {
  const guestSessions = getGuestSessions();
  const partyManager = getPartyManager();

  socket.on('create-party', () => {
    const guestId = guestSessions.getGuestIdBySocket(socket.id);
    if (!guestId) return;

    const result = partyManager.createParty(guestId);
    if (!result.ok) {
      socket.emit('party-error', { reason: result.reason });
      return;
    }

    socket.emit('party-created', partyManager.toPayload(result.party));
  });

  socket.on('join-party', ({ code }) => {
    const guestId = guestSessions.getGuestIdBySocket(socket.id);
    if (!guestId) return;

    const result = partyManager.joinParty(guestId, code);
    if (!result.ok) {
      socket.emit('party-error', { reason: result.reason });
      return;
    }

    const payload = partyManager.toPayload(result.party);

    // Send full state to the joiner
    socket.emit('party-joined', payload);

    // Notify existing members
    broadcastToPartyMembers(result.party, 'party-updated', payload, guestId);
  });

  socket.on('leave-party', () => {
    const guestId = guestSessions.getGuestIdBySocket(socket.id);
    if (!guestId) return;

    const result = partyManager.leaveParty(guestId);
    if (!result.ok) {
      socket.emit('party-error', { reason: result.reason });
      return;
    }

    // Confirm to the leaving player
    socket.emit('party-left');

    // Notify remaining members (if any)
    if (result.party.members.size > 0) {
      const payload = partyManager.toPayload(result.party);
      broadcastToPartyMembers(result.party, 'party-updated', payload);
    }
  });

  socket.on('disband-party', () => {
    const guestId = guestSessions.getGuestIdBySocket(socket.id);
    if (!guestId) return;

    const party = partyManager.getPartyByGuest(guestId);
    if (!party) {
      socket.emit('party-error', { reason: 'not-in-party' });
      return;
    }

    // Collect member guestIds before disband (destroyParty clears them)
    const memberIds = [...party.members.keys()];

    const result = partyManager.disbandParty(party.partyId, guestId);
    if (!result.ok) {
      socket.emit('party-error', { reason: result.reason });
      return;
    }

    // Notify all members (including the leader)
    for (const memberId of memberIds) {
      emitToGuest(memberId, 'party-disbanded', undefined);
    }
  });
}
