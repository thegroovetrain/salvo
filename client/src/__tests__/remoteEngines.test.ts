// OTHER SHIPS' ENGINES (audio/remoteEngines.ts) — Story 11.2 gate C6: the
// earshot is the client FEEL radius (`CLIENT_CONFIG.audio.remoteEngineHearU`),
// never the gameplay eye reach. When 11.2 moved sight to 200 hm the engines
// silently became audible ~9× farther; the contract here is that a hull inside
// eye reach but outside the feel earshot is not heard.

import { describe, expect, it } from 'vitest';
import { CONFIG, DEFAULT_CLASS_ID } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { CLOSE_ALONGSIDE_CUTOFF } from '../audio/engine.js';
import { RemoteEngines, type RemoteMaker } from '../audio/remoteEngines.js';

const maker: RemoteMaker = () => ({ update: () => {}, release: () => {} });
const bus = { ctx: { currentTime: 0 } as BaseAudioContext, sink: {} as AudioNode };
const at = (x: number) => ({ id: 'h', cls: DEFAULT_CLASS_ID, x, y: 0, speed: 1 });

describe('RemoteEngines — earshot is the feel radius, not the eye reach', () => {
  const earshotU = CLIENT_CONFIG.audio.remoteEngineHearU * CLOSE_ALONGSIDE_CUTOFF;

  it('a hull just inside the feel earshot is heard', () => {
    const e = new RemoteEngines(maker);
    e.update(bus, { x: 0, y: 0 }, [at(earshotU * 0.5)]);
    expect(e.size).toBe(1);
  });

  it('a hull past the feel earshot is not heard, even well inside the eye reach', () => {
    const d = earshotU * 1.5;
    expect(d).toBeLessThan(CONFIG.vision.sight * CLOSE_ALONGSIDE_CUTOFF); // the precondition: an eye-reach earshot would hear it
    const e = new RemoteEngines(maker);
    e.update(bus, { x: 0, y: 0 }, [at(d)]);
    expect(e.size).toBe(0);
  });
});
