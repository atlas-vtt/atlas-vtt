import { describe, expect, it } from 'vitest';
import { MAX_ROTATION_DEGREES, MAX_STRETCH_FACTOR, readMapStretch } from '../../../../src/app/grid/mapStretch';
import { readLevelAlignment } from '../../../../src/app/levels/levelAlignment';
import { MAX_FIT_OFFSET, MAX_FIT_SCALE, MAX_MAP_ROTATION, MAX_MAP_STRETCH, MIN_FIT_SCALE, parseGmMessage, parseLevelFit, parseMapStretch } from '../../../../src/app/online/protocol/index.ts';

const MAP = { hash: 'c'.repeat(64), size: 10, mime: 'image/png' };
const FIT = { scale: 0.5, offset: { x: 140, y: 0 } };

describe("a map's stretch", () => {
  it('reads as written: a factor each way, with or without the angle the image lies turned by', () => {
    expect(parseMapStretch({ x: 1.05745, y: 1 })).toEqual({ x: 1.05745, y: 1 });
    expect(parseMapStretch({ x: 1, y: 1.2 })).toEqual({ x: 1, y: 1.2 });
    expect(parseMapStretch({ x: 1.05724, y: 1, rotation: 1.29614 })).toEqual({ x: 1.05724, y: 1, rotation: 1.29614 });
    expect(parseMapStretch({ x: 1, y: 1, rotation: -0.4 })).toEqual({ x: 1, y: 1, rotation: -0.4 });
    expect(parseMapStretch({ x: MAX_MAP_STRETCH, y: MAX_MAP_STRETCH, rotation: -MAX_MAP_ROTATION })).toEqual({ x: 1.5, y: 1.5, rotation: -5 });
    // An angle of nothing is no angle, and fields the page has no use for are left out.
    expect(parseMapStretch({ x: 1.1, y: 1, rotation: 0, extra: 'x' })).toEqual({ x: 1.1, y: 1 });
    expect(parseMapStretch({ x: 1.1, y: 1, rotation: -0 })).toEqual({ x: 1.1, y: 1 });
    expect(parseMapStretch({ x: 1.1, y: 1, offset: { x: 5, y: 5 } })).toEqual({ x: 1.1, y: 1 });
  });

  it('is none for a map drawn as it is, and for a missing one', () => {
    for (const none of [undefined, null, {}, { x: 1, y: 1 }, { x: 1, y: 1, rotation: 0 }]) expect(parseMapStretch(none), JSON.stringify(none)).toBeNull();
  });

  it('is none, whole, when a factor or the angle is out of range', () => {
    const bad = [
      { x: 0.99, y: 1 }, { x: 1, y: 0.5 }, { x: 1.5001, y: 1 }, { x: 1, y: 2 }, { x: -1.2, y: 1 }, { x: 0, y: 0 }, { x: 1e9, y: 1 },
      { x: 1.1, y: 1, rotation: 5.0001 }, { x: 1.1, y: 1, rotation: -6 }, { x: 1, y: 1, rotation: 90 }, { x: 1.1, y: 1, rotation: 1e9 },
    ];
    for (const stretch of bad) expect(parseMapStretch(stretch), JSON.stringify(stretch)).toBeNull();
  });

  it('is none for wrong types and for numbers that are none', () => {
    const bad: unknown[] = [
      'stretch', 1.2, true, [], [1.2, 1], { x: '1.2', y: 1 }, { x: 1.2, y: '1' }, { x: 1.2 }, { y: 1.2 }, { x: null, y: 1 }, { x: [1.2], y: 1 }, { x: {}, y: 1 },
      { x: Number.NaN, y: 1 }, { x: 1, y: Number.NaN }, { x: Number.POSITIVE_INFINITY, y: 1 }, { x: 1.2, y: Number.NEGATIVE_INFINITY },
      { x: 1.2, y: 1, rotation: Number.NaN }, { x: 1.2, y: 1, rotation: Number.POSITIVE_INFINITY }, { x: 1.2, y: 1, rotation: '1' }, { x: 1.2, y: 1, rotation: null }, { x: 1.2, y: 1, rotation: true }, { x: 1.2, y: 1, rotation: [1] },
    ];
    for (const stretch of bad) expect(parseMapStretch(stretch), JSON.stringify(stretch)).toBeNull();
    // As it comes off the wire: JSON writes a number that is none as null.
    expect(parseMapStretch(JSON.parse(JSON.stringify({ x: 1.2, y: 1, rotation: Number.NaN })))).toBeNull();
    expect(parseMapStretch(JSON.parse(JSON.stringify({ x: Number.NaN, y: 1 })))).toBeNull();
  });

  it('reads every value as Atlas reads a stored one, and its limits are Atlas\'s', () => {
    expect([MAX_MAP_STRETCH, MAX_MAP_ROTATION]).toEqual([MAX_STRETCH_FACTOR, MAX_ROTATION_DEGREES]);
    const values: unknown[] = [
      { x: 1.2, y: 1 }, { x: 1, y: 1.5 }, { x: 1.5001, y: 1 }, { x: 0.99, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 1, rotation: 0 }, { x: 1, y: 1, rotation: 2 },
      { x: 1.1, y: 1, rotation: 5 }, { x: 1.1, y: 1, rotation: -5.01 }, { x: 1.1, y: 1, rotation: '2' }, { x: 1.1, y: 1, rotation: null }, { x: Number.NaN, y: 1 }, null, 'x', [],
    ];
    for (const value of values) {
      const atlas = readMapStretch(value);
      expect(parseMapStretch(value) ?? { x: 1, y: 1 }, JSON.stringify(value)).toEqual(atlas);
    }
  });
});

describe("a fitted floor's placement", () => {
  it('reads as written, also where it changes nothing (it still draws the floor by its own stretch)', () => {
    expect(parseLevelFit(FIT)).toEqual(FIT);
    expect(parseLevelFit({ scale: 1, offset: { x: 0, y: 0 } })).toEqual({ scale: 1, offset: { x: 0, y: 0 } });
    expect(parseLevelFit({ scale: MIN_FIT_SCALE, offset: { x: MAX_FIT_OFFSET, y: 3.5 }, extra: 1 })).toEqual({ scale: 0.05, offset: { x: 1_000_000, y: 3.5 } });
    expect(parseLevelFit({ scale: MAX_FIT_SCALE, offset: { x: 0, y: 0, z: 9 } })).toEqual({ scale: 20, offset: { x: 0, y: 0 } });
  });

  it('is none for anything missing, malformed or out of range', () => {
    const bad: unknown[] = [
      undefined, null, 'fit', [], {}, { scale: 1 }, { offset: { x: 0, y: 0 } }, { scale: 1, offset: null }, { scale: 1, offset: [0, 0] }, { scale: 1, offset: { x: 0 } },
      { scale: 0.049, offset: { x: 0, y: 0 } }, { scale: 20.01, offset: { x: 0, y: 0 } }, { scale: 0, offset: { x: 0, y: 0 } }, { scale: -1, offset: { x: 0, y: 0 } }, { scale: '1', offset: { x: 0, y: 0 } },
      { scale: Number.NaN, offset: { x: 0, y: 0 } }, { scale: 1, offset: { x: -1, y: 0 } }, { scale: 1, offset: { x: 0, y: MAX_FIT_OFFSET + 1 } }, { scale: 1, offset: { x: Number.POSITIVE_INFINITY, y: 0 } }, { scale: 1, offset: { x: '0', y: 0 } },
    ];
    for (const fit of bad) expect(parseLevelFit(fit), JSON.stringify(fit)).toBeNull();
  });

  it('takes the scales Atlas reads from a scene file', () => {
    for (const scale of [0.04, 0.05, 1, 20, 20.5]) {
      const atlas = readLevelAlignment({ scale, offset: { x: 0, y: 0 } });
      expect(parseLevelFit({ scale, offset: { x: 0, y: 0 } })?.scale, String(scale)).toBe(atlas?.scale);
    }
  });
});

describe('a scene with a placed map', () => {
  const scene = (extra: Record<string, unknown>, map: unknown = MAP): unknown => ({ t: 'scene', scene: { id: 's', map, lit: false, ...extra } });

  it('carries the stretch beside the map, and a fitted floor its fit', () => {
    const stretched = scene({ stretch: { x: 1.05724, y: 1, rotation: 1.29614 } });
    expect(parseGmMessage(JSON.parse(JSON.stringify(stretched)))).toEqual(stretched);
    const fitted = scene({ stretch: { x: 1.2, y: 1 }, fit: FIT, floor: { group: 'g', level: 1, name: 'Tower' } });
    expect(parseGmMessage(JSON.parse(JSON.stringify(fitted)))).toEqual(fitted);
    expect(parseGmMessage(scene({ fit: FIT }))).toEqual(scene({ fit: FIT }));
  });

  it('reads without either as every scene did, from a GM that knows none', () => {
    const read = parseGmMessage(scene({}));
    expect(read).toEqual(scene({}));
    expect(read?.t === 'scene' && read.scene !== null && ('stretch' in read.scene || 'fit' in read.scene)).toBe(false);
  });

  it('is shown with its map unplaced where a placement is malformed: the scene is not refused for it', () => {
    for (const stretch of [{ x: 3, y: 1 }, { x: 1.1, y: 1, rotation: 45 }, 'wide', null, { x: Number.NaN, y: 1 }]) {
      expect(parseGmMessage(scene({ stretch })), JSON.stringify(stretch)).toEqual(scene({}));
    }
    for (const fit of [{ scale: 99, offset: { x: 0, y: 0 } }, { scale: 1, offset: { x: -4, y: 0 } }, 'fit', null]) {
      expect(parseGmMessage(scene({ fit, stretch: { x: 1.2, y: 1 } })), JSON.stringify(fit)).toEqual(scene({ stretch: { x: 1.2, y: 1 } }));
    }
  });

  it('has neither without a map', () => {
    expect(parseGmMessage(scene({ stretch: { x: 1.2, y: 1 }, fit: FIT }, null))).toEqual(scene({}, null));
  });
});
