import { describe, expect, it } from 'vitest';
import { MAX_SHARED_COURSE_POINTS, MAX_SHARED_LIQUID_CORNERS, MAX_SHARED_LIQUID_TOTAL, MAX_SHARED_LIQUIDS, parseGmMessage, parseLiquids, MAX_STORED_BYTES } from '../../../../src/app/online/protocol/index.ts';

const HASH = 'a'.repeat(64);
const MAP = { hash: HASH, size: 10, mime: 'image/png', id: 'e'.repeat(64) };
const VIDEO = { hash: 'b'.repeat(64), size: 5_000_000, mime: 'video/webm', id: 'e'.repeat(64) };
const scene = (extra: Record<string, unknown>, map: unknown = MAP): unknown => ({ t: 'scene', scene: { id: 's1', map, lit: false, ...extra } });

const id = (n: number): string => n.toString(16).padStart(24, '0');
const SQUARE = [0, 0, 100, 0, 100, 100, 0, 100];
const COLOURS = { surface: '#4f86a8', deep: '#1d3f5c', glint: '#e8f7ff' };
const pool = (n: number, extra: Record<string, unknown> = {}): Record<string, unknown> => ({ id: id(n), liquid: 'water', polygon: SQUARE, colours: COLOURS, ...extra });
/** A ring of `corners` corners around a circle. */
const ring = (corners: number, radius = 1000): number[] => Array.from({ length: corners }, (_, i) => [radius * Math.cos((2 * Math.PI * i) / corners), radius * Math.sin((2 * Math.PI * i) / corners)]).flat();

describe("an animated map's video beside its poster", () => {
  it('is named by hash, size and video type; an older GM names none', () => {
    expect(parseGmMessage(scene({}))).toEqual({ t: 'scene', scene: { id: 's1', map: MAP, lit: false } });
    expect(parseGmMessage(scene({ video: VIDEO }))).toEqual({ t: 'scene', scene: { id: 's1', map: MAP, lit: false, video: VIDEO } });
    expect(parseGmMessage(scene({ video: { ...VIDEO, mime: 'video/mp4' } }))).toMatchObject({ scene: { video: { mime: 'video/mp4' } } });
  });

  it('is left out where malformed or of another type, and the poster still shows', () => {
    const bad = [null, 'video.webm', { ...VIDEO, mime: 'image/png' }, { ...VIDEO, mime: 'video/quicktime' }, { ...VIDEO, hash: 'B'.repeat(64) }, { ...VIDEO, size: MAX_STORED_BYTES + 1 }, { ...VIDEO, size: -1 }, { hash: VIDEO.hash, size: VIDEO.size, mime: VIDEO.mime }];
    for (const video of bad) expect(parseGmMessage(scene({ video }))).toEqual({ t: 'scene', scene: { id: 's1', map: MAP, lit: false } });
  });

  it('needs a poster: a scene without a map plays none', () => {
    expect(parseGmMessage(scene({ video: VIDEO }, null))).toEqual({ t: 'scene', scene: { id: 's1', map: null, lit: false } });
  });
});

describe('the liquids of a floor', () => {
  it('are read whole, each with its corners, holes, flow, colours, art and glow', () => {
    const lava = { id: id(2), liquid: 'lava', polygon: SQUARE, holes: [[10, 10, 20, 10, 20, 20]], flow: { x: 3, y: 4 }, colours: { surface: '#e0531b', deep: '#2a1612', glint: '#ffd27a' }, art: 'engraved', glow: id(9) };
    expect(parseGmMessage({ t: 'liquids', scene: 's1', liquids: [pool(1), lava] })).toEqual({
      t: 'liquids', scene: 's1', liquids: [{ id: id(1), liquid: 'water', polygon: SQUARE, colours: COLOURS }, { ...lava, flow: { x: 0.6, y: 0.8 } }],
    });
  });

  it('keep the two looks a surface may be drawn in, and only those', () => {
    const arts = ['engraved', 'crayon', 'oil'].map((art) => {
      const message = parseGmMessage({ t: 'liquids', scene: 's1', liquids: [{ id: '0'.repeat(24), liquid: 'water', polygon: [0, 0, 100, 0, 100, 100], colours: { surface: '#102030', deep: '#102030', glint: '#102030' }, art }] });
      return message?.t === 'liquids' ? message.liquids[0]?.art : null;
    });
    expect(arts).toEqual(['engraved', 'crayon', undefined]);
  });

  it('pass over a surface that is no area, of no kind, without colours or with an id that is no alias', () => {
    const bad = [
      pool(2, { polygon: [0, 0, 100, 0] }),
      pool(3, { polygon: [0, 0, 50, 50, 100, 100] }),
      pool(4, { polygon: [0, 0, 100, 0, 100] }),
      pool(5, { polygon: [0, 0, 2_000_000, 0, 0, 100] }),
      pool(6, { polygon: [0, 0, Number.NaN, 0, 0, 100] }),
      pool(7, { liquid: 'oil' }),
      pool(8, { colours: { ...COLOURS, deep: 'blue' } }),
      pool(9, { colours: { ...COLOURS, glint: '#E8F7FF' } }),
      pool(1, { id: 'pool_1' }),
      pool(1),
    ];
    expect(parseLiquids([pool(1), ...bad])).toEqual([{ id: id(1), liquid: 'water', polygon: SQUARE, colours: COLOURS }]);
  });

  it('drop what is no flow, no art, a glow off lava and holes that are no areas', () => {
    const read = parseLiquids([pool(1, { flow: { x: 0, y: 0 }, art: 'painted', glow: id(9), holes: [[0, 0, 1, 1, 2, 2], 'hole'] })]);
    expect(read).toEqual([{ id: id(1), liquid: 'water', polygon: SQUARE, colours: COLOURS }]);
  });

  it('read a river\'s course on flowing water only and its open edges as indices of its outline; an older GM sends neither', () => {
    const course = [0, 50, 50, 55, 100, 50];
    const river = parseLiquids([pool(1, { flow: { x: 1, y: 0 }, course, openEdges: [3, 1, 0.5, 'x'] })])![0]!;
    expect(river.course).toEqual(course);
    expect(river.openEdges).toEqual([1, 3]);
    expect(parseLiquids([pool(1, { openEdges: [2, 2, 4, -1] })])![0]!.openEdges).toEqual([2]);
    const unread = parseLiquids([
      pool(2, { course }),
      pool(3, { flow: { x: 1, y: 0 }, course: [0, 0] }),
      pool(4, { flow: { x: 1, y: 0 }, course: [5, 5, 5, 5] }),
      pool(5, { flow: { x: 1, y: 0 }, course: [0, 0, 1] }),
      pool(6, { flow: { x: 1, y: 0 }, course: ring(MAX_SHARED_COURSE_POINTS + 1) }),
      pool(7, { flow: { x: 1, y: 0 }, course: [0, 0, Number.NaN, 1] }),
      pool(8, { flow: { x: 1, y: 0 }, openEdges: 'all' }),
      pool(9, { flow: { x: 1, y: 0 }, openEdges: [0, 1, 2, 3, 0] }),
    ])!;
    for (const surface of unread) {
      expect(surface.course).toBeUndefined();
      expect(surface.openEdges).toBeUndefined();
    }
  });

  it('count a course\'s points with the corners all surfaces of a message may have', () => {
    const course = ring(MAX_SHARED_COURSE_POINTS);
    const rivers = Array.from({ length: Math.ceil(MAX_SHARED_LIQUID_TOTAL / MAX_SHARED_COURSE_POINTS) + 1 }, (_, n) => pool(n + 1, { flow: { x: 1, y: 0 }, course }));
    expect(parseLiquids(rivers)!.length).toBeLessThan(rivers.length);
  });

  it('keep a surface within its corners, holes stopping where the limit is reached', () => {
    const outline = ring(MAX_SHARED_LIQUID_CORNERS - 6);
    const hole = ring(3, 10);
    expect(parseLiquids([pool(1, { polygon: outline, holes: [hole, hole, hole] })])?.[0]?.holes).toEqual([hole, hole]);
    expect(parseLiquids([pool(1, { polygon: ring(MAX_SHARED_LIQUID_CORNERS + 1) })])).toEqual([]);
  });

  it('are refused as a whole when they are no list or longer than a floor holds, and stop at the corners all may have', () => {
    expect(parseGmMessage({ t: 'liquids', scene: 's1', liquids: {} })).toBeNull();
    expect(parseLiquids(Array.from({ length: MAX_SHARED_LIQUIDS + 1 }, (_, n) => pool(n)))).toBeNull();
    expect(parseLiquids(Array.from({ length: MAX_SHARED_LIQUIDS }, (_, n) => pool(n)))).toHaveLength(MAX_SHARED_LIQUIDS);
    const big = ring(MAX_SHARED_LIQUID_CORNERS);
    const fit = MAX_SHARED_LIQUID_TOTAL / MAX_SHARED_LIQUID_CORNERS;
    expect(parseLiquids(Array.from({ length: fit + 1 }, (_, n) => pool(n, { polygon: big })))).toHaveLength(fit);
  });

  it('are a scene\'s, and nothing without one', () => {
    expect(parseGmMessage({ t: 'liquids', liquids: [] })).toBeNull();
    expect(parseGmMessage({ t: 'liquids', scene: 's1', liquids: [] })).toEqual({ t: 'liquids', scene: 's1', liquids: [] });
  });
});
