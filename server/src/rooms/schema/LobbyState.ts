import { Schema, MapSchema, type } from '@colyseus/schema';

/**
 * One captain aboard a private lobby (cycle 167). Identity and the READY mark
 * only — a lobby has no ocean, and NOTHING SPATIAL may ever ride this schema.
 */
export class LobbyPlayer extends Schema {
  @type('string') id = '';
  @type('string') name = '';
  @type('boolean') ready = false;
}

/**
 * The private lobby's public plane (cycle 167, Eric rulings 2026-10-02),
 * synced to every captain aboard. Server-authoritative throughout: the client
 * only renders it.
 */
export class LobbyState extends Schema {
  /** The 6-letter A–Z join code (ruling 5). */
  @type('string') code = '';
  /** Session id of the host (ruling 6: passes to the longest-present). */
  @type('string') hostId = '';
  /** The seed text exactly as the host typed it (after trim/cap); every
   *  captain sees it (ruling 9). '' = no seed (random map). */
  @type('string') seedText = '';
  /** The text that actually generated after the suffix retry (ruling 3),
   *  e.g. 'bananas0'; '' when no seed. Informational. */
  @type('string') seedResolved = '';
  @type('boolean') botFill = false;
  /** EPOCH ms (server Date.now()) the countdown ends at; 0 = none. */
  @type('float64') countdownEndT = 0;
  /** The running countdown was started by the host's START NOW: it runs
   *  regardless of ready status. False whenever no countdown is running. */
  @type('boolean') forced = false;
  /** 'open' | 'started' (LobbyPhase). */
  @type('string') phase = 'open';
  @type({ map: LobbyPlayer }) players = new MapSchema<LobbyPlayer>();
}
