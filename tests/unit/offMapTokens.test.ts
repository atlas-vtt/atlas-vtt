import { describe, expect, it } from 'vitest';
import { isOffMap, mapTokens, offMapPlaces, sceneTokens } from '../../src/app/tokens/offMap';
import type { TokenEntity } from '../../src/app/types';
import { tokenFromFile, tokenToFile } from '../../src/app/resources/resourceFileFormat';

const token = (id: string, extra: Partial<TokenEntity> = {}): TokenEntity => ({ id, kind: 'token', x: 100, y: 100, imagePath: 'art/goblin.png', ...extra } as TokenEntity);

describe('tokens kept beside the map', () => {
  it('are the ones flagged true, and only those', () => {
    expect(isOffMap(token('a', { offMap: true }))).toBe(true);
    expect(isOffMap(token('a'))).toBe(false);
    expect(isOffMap(token('a', { offMap: undefined }))).toBe(false);
    expect(isOffMap(undefined)).toBe(false);
    // A value that is not `true` (a hand edit, a newer version's) reads as on the map, as older versions read it
    expect(isOffMap({ offMap: 'yes' } as unknown as TokenEntity)).toBe(false);
  });

  it('are left out of the map, which is the scene record itself while none is beside it', () => {
    const tokens = { a: token('a'), b: token('b', { offMap: true }), c: token('c') };
    expect(Object.keys(mapTokens({ tokens }))).toEqual(['a', 'c']);
    expect(sceneTokens({ tokens })).toBe(tokens);
    const plain = { a: token('a') };
    expect(mapTokens({ tokens: plain })).toBe(plain);
  });

  it('keep the same map record for as long as the scene record stays', () => {
    const tokens = { a: token('a'), b: token('b', { offMap: true }) };
    expect(mapTokens({ tokens })).toBe(mapTokens({ tokens }));
    expect(mapTokens({ tokens: { ...tokens } })).not.toBe(mapTokens({ tokens }));
  });

  it('wait in a column left of the map image, below those already there', () => {
    const places = offMapPlaces({ a: token('a', { offMap: true }), b: token('b') }, 70, 2);
    expect(places.every((place) => place.x < 0)).toBe(true);
    expect(places[0]!.x).toBe(places[1]!.x);
    expect(places[1]!.y).toBeGreaterThan(places[0]!.y);
    expect(places[0]!.y).toBeGreaterThan(offMapPlaces({}, 70, 1)[0]!.y);
  });

  it('keep their flag in the scene file, beside the fields every version reads', () => {
    const saved = tokenToFile(token('a', { offMap: true, resources: { hp: { current: 3, max: 7 } } }));
    expect(saved).toMatchObject({ offMap: true, x: 100, y: 100, hp: { current: 3, max: 7 } });
    expect(isOffMap(tokenFromFile(saved as TokenEntity))).toBe(true);
  });
});
