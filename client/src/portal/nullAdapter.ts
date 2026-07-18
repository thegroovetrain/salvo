import type { PortalAdapter } from './portalAdapter.js';

/**
 * The no-op PortalAdapter used until a real portal SDK lands (Epic 7). Every
 * method does nothing and every promise resolves immediately, so boot timing
 * and match flow are identical to having no portal at all.
 */
export function createNullAdapter(): PortalAdapter {
  return {
    init: () => Promise.resolve(),
    loadingProgress: () => undefined,
    matchStart: () => undefined,
    matchEnd: () => undefined,
    requestAdBreak: () => Promise.resolve(),
  };
}
