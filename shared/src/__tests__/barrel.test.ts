import { describe, it, expect } from 'vitest';
import {
  PROTOCOL_VERSION,
  CONFIG,
  MSG,
  WEAPON,
  mapRadius,
  stepShip,
  generateMap,
  wrapAngle,
  mulberry32,
  segCircleHit,
} from '../index.js';

describe('shared barrel', () => {
  it('exposes the protocol version', () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });

  it('re-exports config, wire tags, and functions', () => {
    expect(CONFIG.tick.simDtMs).toBe(50);
    expect(MSG.input).toBe('i');
    expect(WEAPON.torpedo).toBe(1);
    expect(typeof mapRadius).toBe('function');
    expect(typeof stepShip).toBe('function');
    expect(typeof generateMap).toBe('function');
    expect(typeof wrapAngle).toBe('function');
    expect(typeof mulberry32).toBe('function');
    expect(typeof segCircleHit).toBe('function');
  });
});
