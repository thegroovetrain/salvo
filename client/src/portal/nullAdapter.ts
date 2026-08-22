import type { PortalAdapter } from './portalAdapter.js';

/**
 * The no-op PortalAdapter — the UNCONFIGURED BUILD's implementation, and no
 * longer a placeholder. The real one is AdSense (`ads/adsAdapter.ts`); main.ts
 * picks between them on `isAdsConfigured()`, so a build with no publisher ID
 * (every dev build, and the self-hosted game before ads were switched on) lands
 * here. Every method does nothing and every promise resolves immediately, so
 * boot timing and match flow are identical to having no ad SDK at all.
 *
 * There is no portal implementation and there will not be one — Eric ruled out
 * portal hosting entirely at Epic 7; see `portalAdapter.ts`'s header for why
 * the interface keeps the name anyway.
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
