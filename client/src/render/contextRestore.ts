// WEBGL CONTEXT RESTORE: BRING THE TEXT BACK (Story 11.2 follow-up, ruling G3).
//
// Pixi 8 handles a lost context itself (`GlContextSystem` calls
// `preventDefault` on `webglcontextlost`, so the browser may restore it, and on
// `webglcontextrestored` re-runs `contextChange`, after which every texture
// re-uploads from its retained resource). Measured on the staged scene with a
// forced `WEBGL_lose_context` loss + restore: the ocean, islands, fog, radar
// heat, sweep, rings, hulls and HUD panels all came back — and EVERY `Text`
// stayed blank (the HUD numbers, labels, ring and compass numerals, hull names).
//
// Why: Pixi's WebGL text system draws each string into a POOLED 2d canvas,
// uploads it, and hands the canvas back to the pool (`retainCanvasContext:
// false`), while caching the uploaded texture per style key. After a restore the
// re-upload reads a canvas that now holds some other string (or nothing), and the
// cache hands that same dead texture to every text with that key — nothing ever
// re-draws it, because to Pixi the text is unchanged.
//
// The fix: on restore, forget the cached text textures and mark every live text
// as needing a fresh one, so the next frame re-draws each string. It reaches
// into Pixi internals (`canvasText._activeTextures`, the text pipe's managed
// set, `_gpuData`), so every step is feature-checked and a Pixi upgrade that
// renames them degrades to today's behavior rather than throwing.

/** The slice of a Pixi text node this touches. */
interface TextLike {
  _gpuData?: Record<number, { currentKey?: string } | undefined>;
  onViewUpdate?: () => void;
}

/** The slice of a Pixi renderer this touches. */
export interface RestoreRenderer {
  uid: number;
  canvasText?: { _activeTextures?: Record<string, unknown> };
  renderPipes?: { text?: { _managedTexts?: { items?: Record<string, TextLike | null | undefined> } } };
}

/**
 * Drop the text texture cache and flag every managed text for a re-draw.
 * Returns how many texts were flagged (0 when the internals are not there).
 */
export function invalidateTextTextures(renderer: RestoreRenderer): number {
  const cache = renderer.canvasText;
  const items = renderer.renderPipes?.text?._managedTexts?.items;
  if (cache?._activeTextures === undefined || items === undefined) return 0;
  // The cached textures' GL objects died with the context; drop the entries so
  // `getManagedTexture` draws each string afresh rather than re-serving them.
  cache._activeTextures = {};
  let n = 0;
  for (const key of Object.keys(items)) if (flagText(items[key], renderer.uid)) n++;
  return n;
}

/** Flag one text for a fresh texture; false when it has no GPU data here. */
function flagText(text: TextLike | null | undefined, uid: number): boolean {
  const gpu = text?._gpuData?.[uid];
  if (!text || !gpu) return false;
  // A key that matches nothing: `validateRenderable` sees a change (the render
  // group rebuilds) and `addRenderable` fetches a new texture.
  gpu.currentKey = '--';
  text.onViewUpdate?.();
  return true;
}

/**
 * Re-draw every text after a WebGL context restore. Pixi registers its own
 * restore handler when the renderer initializes — i.e. before this — so by the
 * time this runs the GPU systems are already rebuilt.
 */
export function watchContextRestore(canvas: HTMLCanvasElement, renderer: RestoreRenderer): void {
  canvas.addEventListener('webglcontextrestored', () => {
    invalidateTextTextures(renderer);
  });
}
