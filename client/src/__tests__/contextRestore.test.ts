// WEBGL CONTEXT RESTORE (Story 11.2 follow-up, G3): after a restore every live
// text must be re-drawn — Pixi re-serves its cached (now dead) text texture to
// any text whose key is unchanged. Contract: the cache is dropped and every
// managed text is flagged for a fresh texture; with the internals absent it is a
// no-op, never a throw.

import { describe, it, expect, vi } from 'vitest';
import { invalidateTextTextures, watchContextRestore, type RestoreRenderer } from '../render/contextRestore.js';

function fake(): { r: RestoreRenderer; texts: Array<{ _gpuData: Record<number, { currentKey: string }>; onViewUpdate: () => void }> } {
  const texts = ['a', 'b'].map((k) => ({ _gpuData: { 7: { currentKey: `key-${k}` } }, onViewUpdate: vi.fn() }));
  const r: RestoreRenderer = {
    uid: 7,
    canvasText: { _activeTextures: { 'key-a': {}, 'key-b': {} } },
    renderPipes: { text: { _managedTexts: { items: { 1: texts[0], 2: texts[1], 3: null } } } },
  };
  return { r, texts };
}

describe('invalidateTextTextures', () => {
  it('drops the text texture cache and flags every managed text for a fresh texture', () => {
    const { r, texts } = fake();
    expect(invalidateTextTextures(r)).toBe(2);
    expect(r.canvasText!._activeTextures).toEqual({});
    for (const t of texts) {
      expect(t._gpuData[7].currentKey).toBe('--');
      expect(t.onViewUpdate).toHaveBeenCalledOnce();
    }
  });

  it('is a no-op when the Pixi internals are not there', () => {
    expect(invalidateTextTextures({ uid: 1 })).toBe(0);
    expect(invalidateTextTextures({ uid: 1, canvasText: {} })).toBe(0);
  });

  it('runs on the canvas\'s webglcontextrestored event', () => {
    const { r, texts } = fake();
    const canvas = document.createElement('canvas');
    watchContextRestore(canvas, r);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(texts[0]._gpuData[7].currentKey).toBe('--');
  });
});
