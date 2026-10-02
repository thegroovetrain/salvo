// The private lobby's ready/countdown/host POLICY (cycle 167, Eric rulings
// 2026-10-02) — plain TS over plain data, ZERO Colyseus imports and no
// world/match imports, exactly like queue.ts. LobbyRoom.ts is the thin
// adapter: it owns the sockets, the schema mirror and the matchMaker calls,
// and reads every decision out of this class. Time is always INJECTED (`now`
// in epoch ms), so the whole I/O matrix is unit-testable with no clock.
//
// The rules, all from the spec's I/O matrix:
//   - ELIGIBLE to start = 2+ captains aboard, OR bot-fill on (ruling 2).
//   - The automatic countdown ARMS only at an all-ready moment that is also
//     eligible (ruling 2: "it only arms when a start would be legal"), and
//     runs CONFIG.lobby.countdownMs (ruling 1).
//   - Any un-ready cancels it; a late join cancels it (ruling 10 — the
//     newcomer is not ready); a bot-fill-off that makes the lobby ineligible
//     cancels it.
//   - A LEAVE is a fresh all-ready moment: the count restarts from the full
//     duration if the rest are all ready and still eligible, else it stops.
//   - Host = the longest-present captain (lowest join sequence) when the host
//     leaves (ruling 6).

import { CONFIG } from '@salvo/shared';

export interface LobbyCaptain {
  id: string;
  name: string;
  ready: boolean;
  /** Monotonic per lobby: the order captains arrived in (host succession). */
  joinSeq: number;
}

/** What one evaluation step asks the adapter to do. */
export type LobbyVerdict = 'idle' | 'counting' | 'form';

export class LobbyPolicy {
  /** Captains aboard, keyed by session id. */
  readonly captains = new Map<string, LobbyCaptain>();
  /** Session id of the host; '' only while the lobby is empty. */
  hostId = '';
  botFill = false;
  /** Epoch ms the countdown ends at; 0 = no countdown running. */
  countdownEndT = 0;
  private seq = 0;

  constructor(private readonly countdownMs: number = CONFIG.lobby.countdownMs) {}

  /** A start would be legal right now (ruling 2). */
  startEligible(): boolean {
    const n = this.captains.size;
    return n >= 2 || (n >= 1 && this.botFill);
  }

  /** Every captain aboard is ready (false for an empty lobby). */
  allReady(): boolean {
    if (this.captains.size === 0) return false;
    for (const c of this.captains.values()) if (!c.ready) return false;
    return true;
  }

  /** A captain boards. The first one is host. Cancels a running count. */
  onJoin(id: string, name: string): LobbyCaptain {
    const captain: LobbyCaptain = { id, name, ready: false, joinSeq: this.seq++ };
    this.captains.set(id, captain);
    if (this.hostId === '') this.hostId = id;
    this.countdownEndT = 0;
    return captain;
  }

  /**
   * A captain leaves. Host passes to the longest-present captain; the count
   * is re-decided from scratch (restart if the rest are all ready + eligible).
   * Returns true when the host changed.
   */
  onLeave(id: string, now: number): boolean {
    if (!this.captains.delete(id)) return false;
    let hostChanged = false;
    if (this.hostId === id) {
      this.hostId = this.nextHost();
      hostChanged = true;
    }
    this.countdownEndT = 0;
    this.armIfReady(now);
    return hostChanged;
  }

  /** A ready toggle. Un-ready cancels; ready may arm. Unknown ids ignored. */
  onReady(id: string, ready: boolean, now: number): void {
    const captain = this.captains.get(id);
    if (!captain) return;
    captain.ready = ready;
    if (!ready) this.countdownEndT = 0;
    else this.armIfReady(now);
  }

  /** The host's bot-fill toggle: a count that becomes ineligible stops; an
   *  all-ready lobby that becomes eligible arms. Non-host is dropped. */
  onBotFill(id: string, on: boolean, now: number): void {
    if (id !== this.hostId) return;
    this.botFill = on;
    if (!this.startEligible()) this.countdownEndT = 0;
    else this.armIfReady(now);
  }

  /** The host's START NOW: true when the adapter should form immediately. */
  forceStart(id: string): boolean {
    return id === this.hostId && this.startEligible();
  }

  /** One tick: has the count elapsed? Re-checks eligibility at fire time. */
  evaluate(now: number): LobbyVerdict {
    if (this.countdownEndT === 0) return 'idle';
    if (!this.allReady() || !this.startEligible()) {
      this.countdownEndT = 0;
      return 'idle';
    }
    return now >= this.countdownEndT ? 'form' : 'counting';
  }

  /** The remaining captain with the lowest join sequence, or ''. */
  nextHost(): string {
    let best: LobbyCaptain | null = null;
    for (const c of this.captains.values()) if (best === null || c.joinSeq < best.joinSeq) best = c;
    return best === null ? '' : best.id;
  }

  /** Captains in join order — the order seats are reserved in. */
  inJoinOrder(): LobbyCaptain[] {
    return [...this.captains.values()].sort((a, b) => a.joinSeq - b.joinSeq);
  }

  /** Arm a fresh count at an all-ready, eligible moment (never extends one). */
  private armIfReady(now: number): void {
    if (this.countdownEndT !== 0) return;
    if (this.allReady() && this.startEligible()) this.countdownEndT = now + this.countdownMs;
  }
}

const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** Bounded so a pathological rng or a saturated code space can never spin. */
const MINT_ATTEMPTS = 1000;

/**
 * Mint a join code (ruling 5): CONFIG.lobby.codeLength letters A–Z, never one
 * already in `taken`. `rng` is injected (a [0, 1) source) so tests can drive
 * it; the adapter passes a crypto-backed one. Throws after MINT_ATTEMPTS
 * collisions rather than looping forever.
 */
export function mintCode(
  rng: () => number,
  taken: ReadonlySet<string>,
  length: number = CONFIG.lobby.codeLength,
): string {
  for (let attempt = 0; attempt < MINT_ATTEMPTS; attempt += 1) {
    let code = '';
    for (let i = 0; i < length; i += 1) {
      const k = Math.min(CODE_ALPHABET.length - 1, Math.floor(rng() * CODE_ALPHABET.length));
      code += CODE_ALPHABET[k];
    }
    if (!taken.has(code)) return code;
  }
  throw new Error(`mintCode: no free code within ${MINT_ATTEMPTS} attempts`);
}

/**
 * Codes minted by THIS process and not yet released. The live-lobby query
 * (matchMaker.query) and setMetadata are both async, so two creates landing in
 * the same window could read the same `taken` set and mint the same code; the
 * reservation is taken SYNCHRONOUSLY at mint, which closes that window for
 * every lobby on this process. Released on the room's dispose.
 */
const reservedCodes = new Set<string>();

/** Mint a code avoiding both `taken` (live listings) and every in-process
 *  reservation, and reserve it before returning. */
export function reserveCode(rng: () => number, taken: ReadonlySet<string>): string {
  const code = mintCode(rng, new Set([...taken, ...reservedCodes]));
  reservedCodes.add(code);
  return code;
}

/** Give a code back (the lobby that held it disposed). Unknown codes no-op. */
export function releaseCode(code: string): void {
  reservedCodes.delete(code);
}

/** Whether a code is currently reserved by this process (tests). */
export function isCodeReserved(code: string): boolean {
  return reservedCodes.has(code);
}

/** A join code as typed: trimmed + uppercased; null unless exactly
 *  CONFIG.lobby.codeLength letters A–Z (malformed answers NO SUCH LOBBY). */
export function normalizeCode(raw: unknown, length: number = CONFIG.lobby.codeLength): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return code.length === length && /^[A-Z]+$/.test(code) ? code : null;
}

/**
 * Host seed text as it arrives on `ls`: control/format code points stripped
 * (the sanitizeName posture), trimmed, capped at CONFIG.lobby.seedTextMax
 * CODE POINTS. Non-strings answer null (the message is dropped); a blank
 * result is '' (= clear the seed, ruling 3).
 */
export function cleanSeedText(raw: unknown, max: number = CONFIG.lobby.seedTextMax): string | null {
  if (typeof raw !== 'string') return null;
  return Array.from(raw.replace(/\p{C}/gu, '').trim()).slice(0, max).join('').trim();
}
