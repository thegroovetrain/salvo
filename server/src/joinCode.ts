// ============================================================
// Join Code Generation
// Shared utility for generating 4-character join codes.
// Used by both PartyManager and LobbyManager.
// ============================================================

import type { Game } from '@salvo/shared';

export const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I,O,0,1 to avoid confusion
const CODE_LENGTH = 4;

export function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

/** Check both party and game namespaces for code uniqueness */
interface CodeNamespace {
  getPartyByCode?(code: string): unknown;
  getGameByCode?(code: string): unknown;
}

export function generateGloballyUniqueCode(partyManager: CodeNamespace, lobbyManager: CodeNamespace): string {
  for (let i = 0; i < 20; i++) {
    const code = generateCode();
    const partyExists = partyManager.getPartyByCode?.(code) != null;
    const gameExists = lobbyManager.getGameByCode?.(code) != null;
    if (!partyExists && !gameExists) return code;
  }
  return generateCode(); // fallback
}

/** Resolve a join code to either a party or a game */
export function resolveJoinCode(
  code: string,
  partyManager: { getPartyByCode(code: string): { partyId: string; members: Map<string, unknown> } | undefined },
  lobbyManager: { getGameByCode(code: string): Game | undefined },
): { type: 'party'; party: { partyId: string; members: Map<string, unknown> } }
 | { type: 'game'; game: Game }
 | { type: 'invalid' } {
  const party = partyManager.getPartyByCode(code);
  if (party) return { type: 'party', party };

  const game = lobbyManager.getGameByCode(code);
  if (game) return { type: 'game', game };

  return { type: 'invalid' };
}
