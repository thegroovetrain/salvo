// THE HOME'S SERVED BLOCK, FOR A READER WITHOUT SCRIPTING (Story 13.1, AC 7).
//
// HOME ONLY. How to Play and Privacy no longer use it: their served markup IS
// the page, styled by its own inline styles and the theme's custom properties
// (`ui/theme.ts`'s `themeCss`, injected into their head by `seo/crawlable.ts`).
//
// The home's block lives in `#hc-prerender` (`seo/homeMarkup.ts`). This writes
// a `<style>` at BUILD time from the token source itself (`CLIENT_CONFIG`) —
// the page panel's bed, the primary text color, the body face, headings and
// links in phosphor — so a reader with scripting off gets legible text.
// Generated rather than typed into the source HTML: `tokens.test.ts` allows
// `client/index.html` exactly one color literal, and a hand-copied hex would
// drift from its token.
//
// With scripting on, the block sits under `#app` (fixed, opaque), so it is
// never seen; `<noscript>` hides `#app` for a reader without it.

import { CLIENT_CONFIG } from '../config.js';
import { cssHex } from '../util/color.js';
import { PRERENDER_ID } from './homeMarkup.js';

/** The `<style>` element for the prerendered block. */
export function prerenderStyle(): string {
  const c = CLIENT_CONFIG.colors;
  const p = CLIENT_CONFIG.page;
  const t = CLIENT_CONFIG.type;
  const body = t.registers.body;
  const id = `#${PRERENDER_ID}`;
  const rules = [
    `${id}{box-sizing:border-box;max-width:${p.maxWidthPx}px;margin:${p.gutter}px auto;padding:${p.pad}px;` +
      `background-color:${cssHex(c.panel)};color:${cssHex(c.textPrimary)};` +
      `font:${body.weight} ${body.size}px/1.6 ${t.display}}`,
    `${id} h1,${id} h2,${id} h3,${id} kbd{font-family:${t.mono};color:${cssHex(c.phosphor)}}`,
    `${id} a{color:${cssHex(c.phosphor)}}`,
  ];
  return `<style>${rules.join('')}</style>`;
}
