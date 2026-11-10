import { describe, expect, it } from 'vitest';
import { PIN_MAP_SHARE, PIN_SCREEN, pinGroupScale, pinScreenDiameter, pinsAreDots } from '../../src/app/pixi/pinSizing';

const map = { width: 2000, height: 3000 };

describe('a pin\'s size on screen', () => {
  it('is its full size in play, however far the map is zoomed in', () => {
    expect(pinScreenDiameter(1, map)).toBe(PIN_SCREEN.max);
    expect(pinScreenDiameter(8, map)).toBe(PIN_SCREEN.max);
  });

  it('shrinks with the map once the map is small on screen, never below a findable size', () => {
    expect(pinScreenDiameter(0.3, map)).toBeCloseTo(PIN_MAP_SHARE * 2000 * 0.3);
    expect(pinScreenDiameter(0.01, map)).toBe(PIN_SCREEN.min);
    expect(pinScreenDiameter(0.2, map)).toBeLessThan(pinScreenDiameter(0.4, map));
  });

  it('never covers more of a map seen whole than its share, until the floor', () => {
    const zoom = 0.3;
    expect(pinScreenDiameter(zoom, map) / (2000 * zoom)).toBeLessThanOrEqual(PIN_MAP_SHARE + 1e-9);
  });

  it('turns pins into dots on a map seen whole', () => {
    expect(pinsAreDots(0.1, map)).toBe(true);
    expect(pinsAreDots(1, map)).toBe(false);
  });

  it('is full size while the map has no size yet, and scales the group to it', () => {
    expect(pinScreenDiameter(0.1, null)).toBe(PIN_SCREEN.max);
    expect(pinGroupScale(0.5, null) * 0.5 * PIN_SCREEN.max).toBeCloseTo(PIN_SCREEN.max);
  });
});
