import { describe, expect, it } from 'vitest';
import { parseGmMessage, sameMapFloors } from '../../../../src/app/online/protocol/index.ts';

const HASH = 'a'.repeat(64);
const MAP = { hash: HASH, size: 10, mime: 'image/webp', id: 'e'.repeat(64) };
const scene = (extra: Record<string, unknown>): unknown => ({ t: 'scene', scene: { id: 's1', map: MAP, lit: true, ...extra } });

describe('a floor of a scene with several', () => {
  it('names its floor, which an older GM leaves out', () => {
    expect(parseGmMessage(scene({}))).toEqual({ t: 'scene', scene: { id: 's1', map: MAP, lit: true } });
    const floor = { group: 'g1', level: 2 };
    expect(parseGmMessage(scene({ floor }))).toEqual({ t: 'scene', scene: { id: 's1', map: MAP, lit: true, floor } });
  });

  it('leaves out a malformed floor and still shows the scene', () => {
    for (const floor of [null, 'upper', { group: '', level: 0 }, { group: 'g', level: -1 }, { group: 'g', level: 1.5 }]) {
      expect(parseGmMessage(scene({ floor }))).toEqual({ t: 'scene', scene: { id: 's1', map: MAP, lit: true } });
    }
  });

  it('leaves behind the name an older GM still sends', () => {
    expect(parseGmMessage(scene({ floor: { group: 'g', level: 0, name: 'Crypt of bones' } }))).toEqual({ t: 'scene', scene: { id: 's1', map: MAP, lit: true, floor: { group: 'g', level: 0 } } });
  });

  it('tells floors of one map from another map', () => {
    const a = { floor: { group: 'g', level: 0 } };
    expect(sameMapFloors(a, { floor: { group: 'g', level: 1 } })).toBe(true);
    expect(sameMapFloors(a, { floor: { group: 'h', level: 1 } })).toBe(false);
    expect(sameMapFloors({}, {})).toBe(false);
    expect(sameMapFloors(null, a)).toBe(false);
  });
});
