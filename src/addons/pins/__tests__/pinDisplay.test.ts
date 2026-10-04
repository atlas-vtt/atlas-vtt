import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PIN_DISPLAY, MAX_PIN_MAP_SCALE, MIN_PIN_MAP_SCALE,
  isPinInFocus, isPinShownTo, pinScale, steppedMapScale,
} from '../pinDisplay';
import { mapMarkerScale } from 'src/app/pixi/utils/mapMarkerScale';
import type { NotePin } from 'src/app/types';

const pin = (overrides: Partial<NotePin> = {}): NotePin => ({ id: 'p', kind: 'pin', x: 0, y: 0, notePath: 'n.md', ...overrides });
const both = DEFAULT_PIN_DISPLAY;
const neither = { scaleWithMap: false, focusLevels: false };

describe('pinScale', () => {
  it('keeps a constant screen size without a map size', () => {
    expect(pinScale(pin(), 2, both)).toBeCloseTo(0.5);
    expect(pinScale(pin(), 0.5, both)).toBeCloseTo(2);
  });

  it('keeps its map size at every zoom once locked to the map', () => {
    const locked = pin({ mapScale: 3 });
    expect(pinScale(locked, 0.1, both)).toBe(3);
    expect(pinScale(locked, 4, both)).toBe(3);
  });

  it('falls back to screen size when the map switches map sizes off', () => {
    expect(pinScale(pin({ mapScale: 3 }), 2, neither)).toBe(mapMarkerScale(2));
  });
});

describe('isPinInFocus', () => {
  const village = pin({ minZoom: 1 });
  const kingdom = pin({ maxZoom: 0.5 });

  it('shows a small place only when zoomed in far enough', () => {
    expect(isPinInFocus(village, 0.5, both)).toBe(false);
    expect(isPinInFocus(village, 1, both)).toBe(true);
    expect(isPinInFocus(village, 3, both)).toBe(true);
  });

  it('hides an overview pin when zoomed in past its range', () => {
    expect(isPinInFocus(kingdom, 0.2, both)).toBe(true);
    expect(isPinInFocus(kingdom, 2, both)).toBe(false);
  });

  it('shows every pin when the map switches focus off', () => {
    expect(isPinInFocus(village, 0.1, neither)).toBe(true);
    expect(isPinInFocus(kingdom, 5, neither)).toBe(true);
  });
});

describe('isPinShownTo', () => {
  it('shows players only the pins shown to them', () => {
    expect(isPinShownTo(pin(), 'players')).toBe(false);
    expect(isPinShownTo(pin({ playerVisible: true }), 'players')).toBe(true);
    expect(isPinShownTo(pin(), 'gm')).toBe(true);
  });
});

describe('steppedMapScale', () => {
  it('stays within range', () => {
    expect(steppedMapScale(MAX_PIN_MAP_SCALE, 2)).toBe(MAX_PIN_MAP_SCALE);
    expect(steppedMapScale(MIN_PIN_MAP_SCALE, 0.5)).toBe(MIN_PIN_MAP_SCALE);
    expect(steppedMapScale(1, 1.2)).toBeCloseTo(1.2);
  });
});
