import { describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import { DEFAULT_CLASS_ID, MAX_LAUNCHERS } from '@salvo/shared';
import { LauncherMounts } from '../render/launcherViews';

describe('LauncherMounts', () => {
  it('builds at most MAX_LAUNCHERS housings however long the wire list is', () => {
    const parent = new Container();
    const deck = new Container();
    parent.addChild(deck);
    const mounts = new LauncherMounts(parent, deck);
    mounts.set(DEFAULT_CLASS_ID, [0, Math.PI, 0, Math.PI, 0], null, 0xffffff);
    expect(mounts.count).toBe(MAX_LAUNCHERS);
  });
});
