// ============================================================
// Party Manager
// Pre-game social layer for grouping friends before queuing
// or creating a custom match.
//
//   GuestSessionManager             PartyManager
//   ──────────────────             ────────────
//   guestId → { partyId? }  ◄───  parties (partyId → Party)
//                                  guestToParty (guestId → partyId)
//                                  codeToParty (code → partyId)
//
// PartyManager is the single authority for partyId.
// GuestSession.partyId is set/cleared only by PartyManager methods.
// ============================================================

import crypto from 'node:crypto';
import { generateCode } from '../joinCode.js';
import type { GuestSessionManager } from '../guestSessions.js';
import type { PartyErrorReason, WirePartyMember, PartyStatePayload } from '@salvo/shared';

export interface PartyMember {
  guestId: string;
  displayId: string;              // opaque per-party ID sent to clients (NOT guestId)
  name: string | null;
  joinedAt: number;
  disconnectedAt: number | null;  // null = connected, timestamp = DC'd
}

export interface Party {
  partyId: string;
  code: string;
  leaderId: string;
  members: Map<string, PartyMember>;  // guestId → member
  createdAt: number;
}

export type PartyResult =
  | { ok: true; party: Party }
  | { ok: false; reason: PartyErrorReason };

const MAX_PARTY_SIZE = 3;
const RATE_LIMIT_MS = 5_000;        // 1 create per 5 seconds
const LEADER_GRACE_MS = 30_000;     // 30s grace for leader disconnect
const MEMBER_DC_TIMEOUT_MS = 30_000; // 30s before DC'd members are removed
const GC_INTERVAL_MS = 60_000;      // sweep every 60s
const GC_STALE_MS = 5 * 60_000;     // 5 min before destroying all-DC'd parties

export class PartyManager {
  private parties = new Map<string, Party>();
  private guestToParty = new Map<string, string>();
  private codeToParty = new Map<string, string>();
  private leaderGraceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private memberDcTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private lastCreateTime = new Map<string, number>();
  private lastJoinAttempt = new Map<string, number>();
  private gcInterval: ReturnType<typeof setInterval> | null = null;
  private guestSessions: GuestSessionManager | null = null;
  private onStateChange: ((party: Party, removedGuestIds?: string[]) => void) | null = null;
  /** Injected global code generator (checks both party + game namespaces) */
  private globalCodeGen: (() => string) | null = null;

  setGuestSessions(gs: GuestSessionManager): void {
    this.guestSessions = gs;
  }

  setCodeGenerator(fn: () => string): void {
    this.globalCodeGen = fn;
  }

  /** Register a callback for timer-driven state changes (leader transfer, member removal). */
  setOnStateChange(fn: (party: Party, removedGuestIds?: string[]) => void): void {
    this.onStateChange = fn;
  }

  // ── Core Operations ───────────────────────────────

  createParty(leaderId: string): PartyResult {
    // Rate limit
    const now = Date.now();
    const lastCreate = this.lastCreateTime.get(leaderId);
    if (lastCreate && (now - lastCreate) < RATE_LIMIT_MS) {
      return { ok: false, reason: 'rate-limited' };
    }

    // Mutual exclusion
    if (this.guestToParty.has(leaderId)) {
      return { ok: false, reason: 'already-in-party' };
    }
    if (this.isInGame(leaderId)) {
      return { ok: false, reason: 'in-game' };
    }

    const partyId = crypto.randomUUID();
    const code = this.generateUniqueCode();
    const leaderName = this.guestSessions?.getName(leaderId) ?? null;

    const leaderDisplayId = crypto.randomUUID().slice(0, 8);

    const party: Party = {
      partyId,
      code,
      leaderId,
      members: new Map([[leaderId, {
        guestId: leaderId,
        displayId: leaderDisplayId,
        name: leaderName,
        joinedAt: now,
        disconnectedAt: null,
      }]]),
      createdAt: now,
    };

    this.parties.set(partyId, party);
    this.guestToParty.set(leaderId, partyId);
    this.codeToParty.set(code, partyId);
    this.lastCreateTime.set(leaderId, now);
    this.bindPartyId(leaderId, partyId);

    return { ok: true, party };
  }

  joinParty(guestId: string, code: string): PartyResult {
    // Rate limit join attempts
    const now = Date.now();
    const lastJoin = this.lastJoinAttempt.get(guestId);
    if (lastJoin && (now - lastJoin) < RATE_LIMIT_MS) {
      return { ok: false, reason: 'rate-limited' };
    }
    this.lastJoinAttempt.set(guestId, now);

    // Mutual exclusion
    if (this.guestToParty.has(guestId)) {
      return { ok: false, reason: 'already-in-party' };
    }
    if (this.isInGame(guestId)) {
      return { ok: false, reason: 'in-game' };
    }

    const partyId = this.codeToParty.get(code.toUpperCase());
    if (!partyId) {
      return { ok: false, reason: 'invalid-code' };
    }

    const party = this.parties.get(partyId);
    if (!party) {
      return { ok: false, reason: 'invalid-code' };
    }

    if (party.members.size >= MAX_PARTY_SIZE) {
      return { ok: false, reason: 'party-full' };
    }

    const name = this.guestSessions?.getName(guestId) ?? null;

    party.members.set(guestId, {
      guestId,
      displayId: crypto.randomUUID().slice(0, 8),
      name,
      joinedAt: Date.now(),
      disconnectedAt: null,
    });

    this.guestToParty.set(guestId, partyId);
    this.bindPartyId(guestId, partyId);

    return { ok: true, party };
  }

  leaveParty(guestId: string): PartyResult {
    const partyId = this.guestToParty.get(guestId);
    if (!partyId) {
      return { ok: false, reason: 'not-in-party' };
    }

    const party = this.parties.get(partyId);
    if (!party) {
      this.cleanupGuestMapping(guestId);
      return { ok: false, reason: 'not-in-party' };
    }

    const wasLeader = party.leaderId === guestId;

    // Remove the member
    this.removeMember(party, guestId);

    // If party is now empty, destroy it
    if (party.members.size === 0) {
      this.destroyParty(party);
      return { ok: true, party };
    }

    // If the leader left, transfer immediately
    if (wasLeader) {
      this.clearLeaderGraceTimer(partyId);
      this.transferLeadership(party);
    }

    return { ok: true, party };
  }

  disbandParty(partyId: string, requesterId: string): PartyResult {
    const party = this.parties.get(partyId);
    if (!party) {
      return { ok: false, reason: 'not-in-party' };
    }

    if (party.leaderId !== requesterId) {
      return { ok: false, reason: 'not-leader' };
    }

    // Block disband while any member is in-game
    if (this.anyMemberInGame(party)) {
      return { ok: false, reason: 'members-in-game' };
    }

    this.destroyParty(party);
    return { ok: true, party };
  }

  // ── Disconnect / Reconnect ────────────────────────

  /**
   * Handle a real disconnect (not eviction).
   * Caller must verify this is not an eviction before calling.
   */
  handleDisconnect(guestId: string): { party: Party; wasLeader: boolean } | null {
    const partyId = this.guestToParty.get(guestId);
    if (!partyId) return null;

    const party = this.parties.get(partyId);
    if (!party) return null;

    const member = party.members.get(guestId);
    if (!member) return null;

    member.disconnectedAt = Date.now();
    const wasLeader = party.leaderId === guestId;

    if (wasLeader) {
      // Start 30s grace timer for leader
      this.startLeaderGraceTimer(party);
    } else {
      // Start 30s DC timer for non-leader (same grace period)
      this.startMemberDcTimer(party, guestId);
    }

    return { party, wasLeader };
  }

  handleReconnect(guestId: string): { party: Party; wasLeader: boolean } | null {
    const partyId = this.guestToParty.get(guestId);
    if (!partyId) return null;

    const party = this.parties.get(partyId);
    if (!party) return null;

    const member = party.members.get(guestId);
    if (!member) return null;

    member.disconnectedAt = null;
    const wasLeader = party.leaderId === guestId;

    if (wasLeader) {
      this.clearLeaderGraceTimer(partyId);
    } else {
      this.clearMemberDcTimer(guestId);
    }

    return { party, wasLeader };
  }

  // ── Lookups ───────────────────────────────────────

  getParty(partyId: string): Party | undefined {
    return this.parties.get(partyId);
  }

  getPartyByGuest(guestId: string): Party | undefined {
    const partyId = this.guestToParty.get(guestId);
    if (!partyId) return undefined;
    return this.parties.get(partyId);
  }

  getPartyByCode(code: string): Party | undefined {
    const partyId = this.codeToParty.get(code.toUpperCase());
    if (!partyId) return undefined;
    return this.parties.get(partyId);
  }

  getActivePartyCount(): number {
    return this.parties.size;
  }

  isInParty(guestId: string): boolean {
    return this.guestToParty.has(guestId);
  }

  // ── Fail-safe ─────────────────────────────────────

  /** Unconditionally remove a guest from their party. Used as fail-safe on error. */
  forceDestroyByGuest(guestId: string): void {
    const partyId = this.guestToParty.get(guestId);
    if (!partyId) {
      this.cleanupGuestMapping(guestId);
      return;
    }

    const party = this.parties.get(partyId);
    if (party) {
      this.destroyParty(party);
    } else {
      this.cleanupGuestMapping(guestId);
    }
  }

  // ── GC ────────────────────────────────────────────

  startGC(): void {
    if (this.gcInterval) return;
    this.gcInterval = setInterval(() => this.sweep(), GC_INTERVAL_MS);
  }

  stopGC(): void {
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
      this.gcInterval = null;
    }
  }

  sweep(): void {
    const now = Date.now();

    // Prune stale rate limit entries
    for (const [guestId, ts] of this.lastCreateTime) {
      if ((now - ts) > RATE_LIMIT_MS) {
        this.lastCreateTime.delete(guestId);
      }
    }
    for (const [guestId, ts] of this.lastJoinAttempt) {
      if ((now - ts) > RATE_LIMIT_MS) {
        this.lastJoinAttempt.delete(guestId);
      }
    }

    for (const [, party] of this.parties) {
      // Skip if any member is in-game
      if (this.anyMemberInGame(party)) continue;

      // Check if all members are disconnected
      const allDc = [...party.members.values()].every(m => m.disconnectedAt !== null);
      if (!allDc) continue;

      // Check if the oldest disconnect is stale enough
      const oldestDc = Math.min(...[...party.members.values()]
        .filter(m => m.disconnectedAt !== null)
        .map(m => m.disconnectedAt!));

      if ((now - oldestDc) > GC_STALE_MS) {
        this.destroyParty(party);
      }
    }
  }

  // ── Serialization ─────────────────────────────────

  toPayload(party: Party): PartyStatePayload {
    const members: WirePartyMember[] = [];
    let leaderDisplayId = '';
    for (const m of party.members.values()) {
      members.push({
        displayId: m.displayId,
        name: m.name,
        joinedAt: m.joinedAt,
      });
      if (m.guestId === party.leaderId) {
        leaderDisplayId = m.displayId;
      }
    }
    return {
      partyId: party.partyId,
      code: party.code,
      leaderId: leaderDisplayId,
      members,
    };
  }

  // ── Internal Helpers ──────────────────────────────

  private isInGame(guestId: string): boolean {
    if (!this.guestSessions) return false;
    const session = this.guestSessions.getSession(guestId);
    return session?.gameId !== null && session?.gameId !== undefined;
  }

  private anyMemberInGame(party: Party): boolean {
    for (const member of party.members.values()) {
      if (this.isInGame(member.guestId)) return true;
    }
    return false;
  }

  private generateUniqueCode(): string {
    if (this.globalCodeGen) return this.globalCodeGen();
    // Fallback: party-only check (used in tests without full wiring)
    let attempts = 0;
    while (attempts < 100) {
      const code = generateCode();
      if (!this.codeToParty.has(code)) return code;
      attempts++;
    }
    return generateCode() + generateCode();
  }

  private bindPartyId(guestId: string, partyId: string): void {
    if (!this.guestSessions) return;
    const session = this.guestSessions.getSession(guestId);
    if (session) session.partyId = partyId;
  }

  private unbindPartyId(guestId: string): void {
    if (!this.guestSessions) return;
    const session = this.guestSessions.getSession(guestId);
    if (session) session.partyId = null;
  }

  private removeMember(party: Party, guestId: string): void {
    party.members.delete(guestId);
    this.cleanupGuestMapping(guestId);
    this.clearMemberDcTimer(guestId);
  }

  private cleanupGuestMapping(guestId: string): void {
    this.guestToParty.delete(guestId);
    this.unbindPartyId(guestId);
  }

  private destroyParty(party: Party): void {
    // Clear all timers
    this.clearLeaderGraceTimer(party.partyId);
    for (const member of party.members.values()) {
      this.clearMemberDcTimer(member.guestId);
    }

    // Remove all member mappings
    for (const member of party.members.values()) {
      this.cleanupGuestMapping(member.guestId);
    }

    // Remove party
    this.codeToParty.delete(party.code);
    this.parties.delete(party.partyId);
  }

  private transferLeadership(party: Party): void {
    // Transfer to longest-tenured remaining member
    let oldest: PartyMember | null = null;
    for (const member of party.members.values()) {
      if (!oldest || member.joinedAt < oldest.joinedAt) {
        oldest = member;
      }
    }
    if (oldest) {
      party.leaderId = oldest.guestId;
    }
  }

  private startLeaderGraceTimer(party: Party): void {
    this.clearLeaderGraceTimer(party.partyId);

    const timer = setTimeout(() => {
      this.leaderGraceTimers.delete(party.partyId);

      // Verify party still exists and leader is still DC'd
      const p = this.parties.get(party.partyId);
      if (!p) return;

      const leader = p.members.get(p.leaderId);
      if (!leader || leader.disconnectedAt === null) return;

      // Don't remove leader who is in a game
      if (this.isInGame(p.leaderId)) return;

      // Remove the DC'd leader
      const removedId = p.leaderId;
      this.removeMember(p, removedId);

      if (p.members.size === 0) {
        this.destroyParty(p);
        this.onStateChange?.(p, [removedId]);
      } else {
        this.transferLeadership(p);
        this.onStateChange?.(p, [removedId]);
      }
    }, LEADER_GRACE_MS);

    this.leaderGraceTimers.set(party.partyId, timer);
  }

  private clearLeaderGraceTimer(partyId: string): void {
    const timer = this.leaderGraceTimers.get(partyId);
    if (timer) {
      clearTimeout(timer);
      this.leaderGraceTimers.delete(partyId);
    }
  }

  private startMemberDcTimer(party: Party, guestId: string): void {
    this.clearMemberDcTimer(guestId);

    const timer = setTimeout(() => {
      this.memberDcTimers.delete(guestId);

      // Verify party still exists and member is still DC'd
      const p = this.parties.get(party.partyId);
      if (!p) return;

      const member = p.members.get(guestId);
      if (!member || member.disconnectedAt === null) return;

      // Don't remove members who are in a game
      if (this.isInGame(guestId)) return;

      // Remove the DC'd member
      this.removeMember(p, guestId);

      if (p.members.size === 0) {
        this.destroyParty(p);
      }
      this.onStateChange?.(p, [guestId]);
    }, MEMBER_DC_TIMEOUT_MS);

    this.memberDcTimers.set(guestId, timer);
  }

  private clearMemberDcTimer(guestId: string): void {
    const timer = this.memberDcTimers.get(guestId);
    if (timer) {
      clearTimeout(timer);
      this.memberDcTimers.delete(guestId);
    }
  }

  // ── Test Helpers ──────────────────────────────────

  get partyCount(): number {
    return this.parties.size;
  }

  clearAllTimers(): void {
    for (const timer of this.leaderGraceTimers.values()) clearTimeout(timer);
    this.leaderGraceTimers.clear();
    for (const timer of this.memberDcTimers.values()) clearTimeout(timer);
    this.memberDcTimers.clear();
    this.stopGC();
  }
}
