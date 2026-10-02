// Host seed text → map seed (private lobbies, cycle 167; Eric rulings
// 2026-10-02, ruling 3). Pure, zero I/O, no Math.random, no transcendentals:
// integer FNV-1a only, so every JS engine hashes the same text to the same seed.
//
// THE RULING: the host types free text. A BLANK seed means NO seed — the arena
// rolls its usual random map (resolveSeedText returns null). A seed whose map
// generation throws (the deferred map-gen bug, ~1 in 3000 seeds; the throw
// itself stays UNFIXED, Eric 2026-09-16) is retried deterministically with a
// decimal suffix — text, text0, text1, text2, … — and is never surfaced to
// players. Same failing text → same final seed, every time.
//
// The probe is injected so shared stays ignorant of who validates: the server
// passes a test-generate of the map (catching only MapGenerationError).

/** FNV-1a 32-bit offset basis and prime. */
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * Attempt cap for the suffix retry. Unreachable in practice (a throw is ~1 in
 * 3000 seeds, so 1000 consecutive throws never happen); past it we throw a
 * plain Error rather than loop forever.
 */
const MAX_ATTEMPTS = 1000;

/** FNV-1a 32-bit over the string's UTF-16 code units, as a uint32. */
export function hashSeedText(text: string): number {
  let h = FNV_OFFSET;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
}

/**
 * Resolve host seed text to the first candidate whose hashed seed passes
 * `probe`. Candidates: the trimmed text, then text+'0', text+'1', … in order.
 * Returns `{ text, seed }` of the candidate that passed (e.g. 'bananas0'), or
 * null for blank/whitespace input (no seed). Throws a plain Error after
 * MAX_ATTEMPTS failed candidates (unreachable in practice).
 */
export function resolveSeedText(
  text: string,
  probe: (seed: number) => boolean,
): { text: string; seed: number } | null {
  const base = text.trim();
  if (base === '') return null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = attempt === 0 ? base : base + String(attempt - 1);
    const seed = hashSeedText(candidate);
    if (probe(seed)) return { text: candidate, seed };
  }
  throw new Error(`resolveSeedText: no generating seed within ${MAX_ATTEMPTS} attempts`);
}
