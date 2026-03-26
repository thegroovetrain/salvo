// ============================================================
// Join Code Generation
// Shared utility for generating 4-character join codes.
// Used by both PartyManager and LobbyManager.
// ============================================================

export const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I,O,0,1 to avoid confusion
const CODE_LENGTH = 4;

export function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}
