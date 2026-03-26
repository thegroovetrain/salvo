import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@salvo/shared';
import { getGuestSessions, getPartyManager, emitToGuest } from '../emitters.js';
import { isInQueue, getTicketByGuest, dissolveTicket } from '../queue/index.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

function broadcastToPartyMembers(party: { members: Map<string, { guestId: string }> }, event: string, data: unknown, excludeGuestId?: string): void {
  for (const member of party.members.values()) {
    if (member.guestId !== excludeGuestId) {
      emitToGuest(member.guestId, event, data);
    }
  }
}

/** Dissolve any active queue ticket for a party member's party. */
function dissolveQueueTicketForParty(guestId: string): void {
  if (!isInQueue(guestId)) return;
  const ticket = getTicketByGuest(guestId);
  if (ticket) {
    dissolveTicket(ticket.id);
    console.log(`[queue] party mutation dissolved ticket=${ticket.id}`);
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

    // Dissolve the joiner's own queue ticket (if any)
    dissolveQueueTicketForParty(guestId);

    // Dissolve the TARGET party's queue ticket (party composition is about to change)
    const targetParty = partyManager.getPartyByCode(code);
    if (targetParty) {
      for (const memberId of targetParty.members.keys()) {
        dissolveQueueTicketForParty(memberId);
        break; // only need one member to find the party ticket
      }
    }

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

    // Dissolve any active queue ticket (party composition changed)
    dissolveQueueTicketForParty(guestId);

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

    // Dissolve any active queue ticket before disbanding
    dissolveQueueTicketForParty(guestId);

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
