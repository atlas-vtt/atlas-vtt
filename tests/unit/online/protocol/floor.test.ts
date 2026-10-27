import { describe, expect, it } from 'vitest';
import { parseGmMessage, sameMapFloors } from '../../../../src/app/online/protocol/index.ts';

const HASH = 'a'.repeat(64);
const MAP = { hash: HASH, size: 10, mime: 'image/webp' };
const scene = (extra: Record<string, unknown>): unknown => ({ t: 'scene', scene: { id: 's1', map: MAP, lit: true, ...extra } });

describe('a floor of a scene with several', () => {
  it('names its floor, which an older GM leaves out', () => {
    expect(parseGmMessage(scene({}))).toEqual({ t: 'scene', scene: { id: 's1', map: MAP, lit: true } });
    const floor = { group: 'g1', level: 2, name: 'Tower top' };
    expect(parseGmMessage(scene({ floor }))).toEqual({ t: 'scene', scene: { id: 's1', map: MAP, lit: true, floor } });
  });

  it('leaves out a malformed floor and still shows the scene', () => {
    for (const floor of [null, 'upper', { group: '', level: 0, name: 'A' }, { group: 'g', level: -1, name: 'A' }, { group: 'g', level: 1.5, name: 'A' }, { group: 'g', level: 0, name: '' }, { group: 'g', level: 0, name: 'x'.repeat(81) }]) {
      expect(parseGmMessage(scene({ floor }))).toEqual({ t: 'scene', scene: { id: 's1', map: MAP, lit: true } });
    }
  });

  it('shows a name as text: controls and direction marks go, white space collapses', () => {
    const parsed = parseGmMessage(scene({ floor: { group: 'g', level: 0, name: ' Crypt‮\n of  bones ' } }));
    expect(parsed).toMatchObject({ scene: { floor: { name: 'Crypt of bones' } } });
  });

  it('tells floors of one map from another map', () => {
    const a = { floor: { group: 'g', level: 0, name: 'A' } };
    expect(sameMapFloors(a, { floor: { group: 'g', level: 1, name: 'B' } })).toBe(true);
    expect(sameMapFloors(a, { floor: { group: 'h', level: 1, name: 'B' } })).toBe(false);
    expect(sameMapFloors({}, {})).toBe(false);
    expect(sameMapFloors(null, a)).toBe(false);
  });
});
