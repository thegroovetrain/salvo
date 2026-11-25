// THE SOCIAL BRAND ICONS (Eric 2026-11-25: "social links ... using their
// particular service's icon (these should be in fontawesome or some library
// like that)"). Node-safe: the build writes them into the served home through
// `seo/homeMarkup.ts`.
//
// Only the icon DEFINITIONS come from Font Awesome (`free-brands-svg-icons`,
// plain data: width, height and path). No FA runtime, no FA stylesheet, no
// script and no origin: each icon is written as an inline `<svg>` string, filled
// with `currentColor` so it takes the bar text's color. No `xmlns` either — an
// inline `<svg>` in HTML is in the SVG namespace by parsing, and the attribute
// would put a URL in the served markup that the origin pins would have to
// carve out.

import { faDiscord, faReddit } from '@fortawesome/free-brands-svg-icons';
import type { CommunityService } from '../ui/communityLinks.js';

/** The part of an FA icon definition this reads: `[width, height, _, _, path]`. */
interface IconData {
  icon: readonly [number, number, unknown, unknown, string | readonly string[]];
}

/** Each service's brand icon. A new service adds its line here. */
const ICONS: Record<CommunityService, IconData> = {
  discord: faDiscord,
  reddit: faReddit,
};

/** The rendered icon height in px; the width follows the icon's own aspect. */
export const SOCIAL_ICON_PX = 22;

/** A service's brand icon as an inline, decorative `<svg>` (its anchor carries
 *  the accessible name). */
export function socialIconSvg(service: CommunityService): string {
  const [w, h, , , path] = ICONS[service].icon;
  const paths = (typeof path === 'string' ? [path] : path).map((d) => `<path d="${d}"></path>`).join('');
  const width = Math.round((SOCIAL_ICON_PX * w) / h);
  return (
    `<svg viewBox="0 0 ${w} ${h}" width="${width}" height="${SOCIAL_ICON_PX}" fill="currentColor" ` +
    `aria-hidden="true" focusable="false">${paths}</svg>`
  );
}
