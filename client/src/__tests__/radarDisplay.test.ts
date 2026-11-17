// The radar display's show rule (Story 11.2 follow-up, Eric 2026-11-13): the
// rings, the compass scale and the heading line are drawn whenever the own
// ship is on the water — from the start line on. Only the sweep's line waits
// for the beam.
import { describe, it, expect } from 'vitest';
import { CONFIG } from '@salvo/shared';
import { radarDisplayShows, type RadarDisplayFrame } from '../render/radarDisplay.js';

function frame(over: Partial<RadarDisplayFrame>): RadarDisplayFrame {
  return {
    own: { x: 100, y: -50, heading: 0.4 },
    beam: 1.2,
    ownScreen: { x: 960, y: 540 },
    zoom: 0.8,
    viewW: 1920,
    viewH: 1080,
    radarU: CONFIG.vision.radar,
    ...over,
  };
}

describe('radarDisplayShows — what is drawn this frame', () => {
  it('shows the display with the beam off (the start line) and hides only the beam line', () => {
    expect(radarDisplayShows(frame({ beam: null }))).toEqual({ display: true, beam: false });
  });

  it('shows the beam line once the beam is on', () => {
    expect(radarDisplayShows(frame({}))).toEqual({ display: true, beam: true });
  });

  it('hides everything with no own ship, whatever the beam says', () => {
    expect(radarDisplayShows(frame({ own: null }))).toEqual({ display: false, beam: false });
  });

  it('hides everything on a zoom or reach that is not a usable number', () => {
    expect(radarDisplayShows(frame({ zoom: 0 })).display).toBe(false);
    expect(radarDisplayShows(frame({ radarU: Number.NaN })).display).toBe(false);
  });
});
