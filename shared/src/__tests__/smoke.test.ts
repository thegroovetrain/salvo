import { describe, it, expect } from 'vitest';
import { PROTOCOL_VERSION, SHARED } from '../index';

describe('shared barrel', () => {
  it('exposes a protocol version', () => {
    expect(PROTOCOL_VERSION).toBe(1);
    expect(SHARED.PROTOCOL_VERSION).toBe(PROTOCOL_VERSION);
  });
});
