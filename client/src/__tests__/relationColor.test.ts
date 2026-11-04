// Story 10.4 (Eric's ruling R6): the hue wheel is gone — every ship's linework
// reads ONE relation to the viewer. Own vs enemy, drones unchanged.

import { describe, expect, it } from 'vitest';
import { DRONE_HULL_IDS, SHIP_CLASS_IDS } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { relationFill, relationOf, relationStroke, relationStyle, scaleValue } from '../render/relationColor.js';
import { DRONE_STYLE, contactStyle } from '../render/ships.js';
import { OWN_ACCENT } from '../ui/ownAccent.js';
import { cssHex } from '../util/color.js';

describe('relationOf — own is exactly the viewer, everyone else an enemy', () => {
  it('names the viewer own and any other id enemy', () => {
    expect(relationOf('me', 'me')).toBe('own');
    expect(relationOf('them', 'me')).toBe('enemy');
  });

  it('a spectator (no own id) sees every ship as an enemy', () => {
    expect(relationOf('me', null)).toBe('enemy');
    expect(relationOf('me', undefined)).toBe('enemy');
  });
});

describe('relation colors — two tokens, one fill rule', () => {
  it('own and enemy strokes are the two relation tokens, and they differ', () => {
    expect(relationStroke('own')).toBe(CLIENT_CONFIG.colors.relationOwn);
    expect(relationStroke('enemy')).toBe(CLIENT_CONFIG.colors.relationEnemy);
    expect(relationStroke('own')).not.toBe(relationStroke('enemy'));
  });

  it('the fill is the stroke scaled by the fill value, per channel, and darker', () => {
    for (const r of ['own', 'enemy'] as const) {
      const k = CLIENT_CONFIG.ship.relationFillValue;
      expect(relationFill(r)).toBe(scaleValue(relationStroke(r), k));
      const max = (c: number): number => Math.max((c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff);
      expect(max(relationFill(r))).toBeLessThan(max(relationStroke(r)));
    }
  });

  it('relationStyle pairs the stroke with its fill', () => {
    for (const r of ['own', 'enemy'] as const) {
      expect(relationStyle(r)).toEqual({ stroke: relationStroke(r), fill: relationFill(r) });
    }
  });
});

describe('contactStyle — captains wear the relation, drones keep their greys', () => {
  it('every captain hull takes its relation style', () => {
    for (const id of SHIP_CLASS_IDS) {
      expect(contactStyle(id, 'own')).toEqual(relationStyle('own'));
      expect(contactStyle(id, 'enemy')).toEqual(relationStyle('enemy'));
    }
  });

  it('every drone hull keeps DRONE_STYLE whatever the relation', () => {
    for (const id of DRONE_HULL_IDS) {
      expect(contactStyle(id, 'own')).toBe(DRONE_STYLE);
      expect(contactStyle(id, 'enemy')).toBe(DRONE_STYLE);
    }
  });
});

describe('OWN_ACCENT — the port chrome wears the own relation color', () => {
  it('is the own stroke and fill', () => {
    expect(OWN_ACCENT.accentValue).toBe(relationStroke('own'));
    expect(OWN_ACCENT.accent).toBe(cssHex(relationStroke('own')));
    expect(OWN_ACCENT.accentFill).toBe(cssHex(relationFill('own')));
  });
});
