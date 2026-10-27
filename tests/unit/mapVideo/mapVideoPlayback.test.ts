import { describe, expect, it } from 'vitest';
import { animateMapsOn, mapVideoMode, type MapVideoConditions } from '../../../src/app/pixi/mapImage/video/mapVideoPlayback';

const seen: MapVideoConditions = { animate: true, loading: false, contextLost: false, viewShown: true, shownToPlayers: false };

describe('when an animated map plays', () => {
  it('plays while its view is on screen', () => {
    expect(mapVideoMode(seen)).toBe('play');
  });

  it('plays for the player window while the GM looks elsewhere', () => {
    expect(mapVideoMode({ ...seen, viewShown: false, shownToPlayers: true })).toBe('play');
  });

  it('holds its frame where nobody sees it', () => {
    expect(mapVideoMode({ ...seen, viewShown: false })).toBe('pause');
  });

  it('holds its frame while a scene loads or the graphics context is lost, even when shown', () => {
    expect(mapVideoMode({ ...seen, loading: true, shownToPlayers: true })).toBe('pause');
    expect(mapVideoMode({ ...seen, contextLost: true })).toBe('pause');
  });

  it('shows the poster when animation is off, whatever else holds', () => {
    expect(mapVideoMode({ ...seen, animate: false, shownToPlayers: true })).toBe('poster');
    expect(mapVideoMode({ ...seen, animate: false, loading: true })).toBe('poster');
  });
});

describe('Animate maps', () => {
  it('is on until chosen, unless the system asks for reduced motion', () => {
    expect(animateMapsOn(null, false)).toBe(true);
    expect(animateMapsOn(null, true)).toBe(false);
  });

  it('follows the choice made on the device', () => {
    expect(animateMapsOn(true, true)).toBe(true);
    expect(animateMapsOn(false, false)).toBe(false);
  });
});
