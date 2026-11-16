import { describe, expect, it } from 'vitest';
import { annotationList } from '../../../../src/app/annotations/annotationList';
import type { Annotation } from '../../../../src/app/annotations/annotationTypes';
import type { FogCoverage } from '../../../../src/app/fog/fogCoverage';
import { AnnotationTelling, MEMORY_READ_MS } from '../../../../src/app/online/gm/annotationTelling.ts';
import type { MapLayerSource } from '../../../../src/app/online/gm/atlasMapLayers.ts';
import { rememberedAt, type MaskAlpha } from '../../../../src/app/online/gm/exploredMaskAlpha.ts';
import { KnownOnMap, samplePoints, type KnownPlaces } from '../../../../src/app/online/gm/knownOnMap.ts';
import type { DrawingStroke, TextElement } from '../../../../src/app/types';
import { sceneState } from './shareHarness.ts';
import { settled } from './settled.ts';

type Point = { x: number; y: number };

const NO_FOG: FogCoverage = { shape: [], covers: () => false };
const MAP = { width: 2000, height: 2000 };
const line = (id: string, from: Point, to: Point, more: Partial<DrawingStroke> = {}): DrawingStroke => ({ id, kind: 'drawing', timestamp: 1, type: 'pen', points: [from, to], color: '#12ab34', width: 4, opacity: 1, layer: 'map', ...more });
const label = (id: string, at: Point, text: string): TextElement => ({ id, kind: 'text', ...at, text, fontSize: 24, fontFamily: 'serif', color: '#ffffff', layer: 'map' });
const read = (drawings: Record<string, DrawingStroke>, texts: Record<string, TextElement> = {}): Annotation[] => [...annotationList({ drawings, texts })];
/** Sight that shows the map left of `edge`, and counts how often and of how many places it was asked. */
function sight(edge: () => number): KnownPlaces & { asked: number; places: number } {
  const places: KnownPlaces & { asked: number; places: number } = {
    asked: 0, places: 0,
    seen: (points) => {
      places.asked += 1;
      places.places += points.length;
      return points.map(({ x }) => x < edge());
    },
  };
  return places;
}

describe('which drawings and texts on the map players know of', () => {
  it('knows one once a place of it is seen, keeps knowing it, and asks about it no more', () => {
    const known = new KnownOnMap();
    const drawings = { near: line('near', { x: 100, y: 100 }, { x: 200, y: 100 }), far: line('far', { x: 1500, y: 100 }, { x: 1600, y: 100 }) };
    const onMap = read(drawings);
    let edge = 1000;
    const part = {};
    const places = Object.assign(sight(() => edge), { sight: [part] });
    known.look(onMap, [drawings], places);
    expect(onMap.map((annotation) => known.knows(annotation))).toEqual([true, false]);
    // Nothing changed: nothing is asked.
    const asked = places.asked;
    known.look(onMap, [drawings], places);
    expect(places.asked).toBe(asked);
    // Sight is another: only what is not known yet is asked about, and what was known stays known though it is seen no more.
    edge = 0;
    places.places = 0;
    places.sight = [{}];
    known.look(onMap, [drawings], places);
    expect(places.places).toBe(samplePoints(onMap[1]!).length);
    expect(onMap.map((annotation) => known.knows(annotation))).toEqual([true, false]);
    const version = known.version;
    edge = 5000;
    places.sight = [{}];
    known.look(onMap, [drawings], places);
    expect(onMap.map((annotation) => known.knows(annotation))).toEqual([true, true]);
    expect(known.version).toBeGreaterThan(version);
  });

  it('asks anew about one that was moved, and not about one that only changed its colour', () => {
    const known = new KnownOnMap();
    const first = { a: line('a', { x: 100, y: 100 }, { x: 200, y: 100 }) };
    const places = sight(() => 1000);
    known.look(read(first), [first], places);
    const recoloured = { a: { ...first.a, color: '#ffffff' } };
    expect(known.knows(read(recoloured)[0]!)).toBe(true);
    // Moved into the dark: players are told of it no more until they see it there.
    const moved = { a: { ...first.a, points: [{ x: 1500, y: 100 }, { x: 1600, y: 100 }] } };
    known.look(read(moved), [moved], places);
    expect(known.knows(read(moved)[0]!)).toBe(false);
    // Gone and made again under the same id: not known by the name it had.
    known.look([], [{}], places);
    known.look(read(first), [first], { ...places, seen: (points) => points.map(() => false) });
    expect(known.knows(read(first)[0]!)).toBe(false);
  });

  it('asks about no more places in one look than its budget, and goes on with the rest at the next', () => {
    const known = new KnownOnMap();
    const drawings: Record<string, DrawingStroke> = {};
    for (let index = 0; index < 1500; index += 1) drawings[`d${index}`] = line(`d${index}`, { x: index, y: 100 }, { x: index, y: 200 });
    const onMap = read(drawings);
    const places = Object.assign(sight(() => 5000), { sight: [{}] });
    known.look(onMap, [drawings], places);
    expect(places.places).toBeLessThanOrEqual(1024 + 16);
    expect(known.pending).toBe(true);
    let looks = 1;
    while (known.pending) {
      known.look(onMap, [drawings], places);
      looks += 1;
    }
    expect(looks).toBe(Math.ceil((1500 * 2) / 1024));
    expect(onMap.every((annotation) => known.knows(annotation))).toBe(true);
    expect(places.places).toBe(1500 * 2);
  });

  it('samples a line along itself, a text and a stamp by their boxes, and a fill inside too: few places each', () => {
    const [long] = read({ long: line('long', { x: 0, y: 0 }, { x: 0, y: 0 }, { points: Array.from({ length: 500 }, (_, index) => ({ x: index, y: 0 })) }) });
    expect(samplePoints(long!)).toHaveLength(16);
    expect(samplePoints(long!)[0]).toEqual({ x: 0, y: 0 });
    expect(samplePoints(long!).at(-1)).toEqual({ x: 499, y: 0 });
    const square = [{ x: 0, y: 0 }, { x: 900, y: 0 }, { x: 900, y: 900 }, { x: 0, y: 900 }, { x: 0, y: 0 }];
    const [floor] = read({ floor: line('floor', square[0]!, square[1]!, { type: 'line', points: square, fill: 'solid', width: 0 }) });
    // A room coloured in is known by its floor: the middle of it is asked about, not only its outline.
    expect(samplePoints(floor!)).toContainEqual({ x: 450, y: 450 });
    expect(samplePoints(floor!).length).toBeLessThanOrEqual(16);
    const [name] = read({}, { name: label('name', { x: 500, y: 500 }, 'Old Mill') });
    expect(samplePoints(name!)).toHaveLength(5);
    expect(samplePoints(name!)[0]).toEqual({ x: 500, y: 500 });
  });
});

describe('what players are told of the map by what they remember', () => {
  /** A memory of the map's left half, as a grid of 4 by 4. */
  const half: MaskAlpha = { width: 4, height: 4, alpha: Uint8Array.from({ length: 16 }, (_, index) => (index % 4 < 2 ? 255 : index % 4 === 2 ? 200 : 0)) };

  it('remembers a place whose cell of the memory is remembered whole, and none beside the map', () => {
    expect(rememberedAt(half, MAP, 100, 100)).toBe(true);
    expect(rememberedAt(half, MAP, 999, 1999)).toBe(true);
    // A cell the memory's edge passes through is not remembered: what lies behind a remembered room's wall is not known by it.
    expect(rememberedAt(half, MAP, 1200, 100)).toBe(false);
    expect(rememberedAt(half, MAP, 1900, 100)).toBe(false);
    for (const [x, y] of [[-1, 5], [5, -1], [2000, 5], [5, 2000], [Number.NaN, 5]] as const) expect(rememberedAt(half, MAP, x, y)).toBe(false);
  });

  it('tells what lies on the map of a room players remember, once the saved memory was read, and reads it only while something waits', async () => {
    let now = 0;
    let changes = 0;
    const decoded: string[] = [];
    const telling = new AnnotationTelling({
      now: () => now, map: () => MAP, changed: () => (changes += 1),
      decodeMask: (mask) => {
        decoded.push(mask);
        return Promise.resolve(half);
      },
    });
    // Nobody sees anything now: the hero is elsewhere.
    const source: MapLayerSource = { grid: () => null, doorsSeen: () => new Set(), pointsSeen: (points) => points.map(() => false), sensed: () => [], rules: () => null, sightParts: () => [] };
    const drawings = { old: line('old', { x: 100, y: 100 }, { x: 200, y: 100 }), unseen: line('unseen', { x: 1700, y: 100 }, { x: 1800, y: 100 }, { color: '#ab1234' }) };
    const texts = { name: label('name', { x: 300, y: 300 }, 'Old Mill') };
    const state = sceneState({ lighting: { enabled: true, ambient: 0.2 }, exploredMask: 'data:image/png;base64,AAAA', objects: { ...sceneState().objects, drawings, texts } });
    expect(telling.lists(state, NO_FOG, true, source).shared).toEqual({ drawings: [], texts: [] });
    await settled();
    expect(changes).toBe(1);
    const told = telling.lists(state, NO_FOG, true, source).shared;
    expect(told.onMap?.drawings.map(({ colour }) => colour)).toEqual(['#12ab34']);
    expect(told.onMap?.texts.map(({ text }) => text)).toEqual(['Old Mill']);
    // The same memory is not read again, and another one not sooner than a while after the last.
    telling.lists(state, NO_FOG, true, source);
    const later = { ...state, exploredMask: 'data:image/png;base64,BBBB' };
    telling.lists(later, NO_FOG, true, source);
    expect(decoded).toHaveLength(1);
    now += MEMORY_READ_MS;
    telling.lists(later, NO_FOG, true, source);
    expect(decoded).toEqual(['data:image/png;base64,AAAA', 'data:image/png;base64,BBBB']);
    await settled();
    // With everything on the map known, the memory is left alone.
    const all = { ...later, exploredMask: 'data:image/png;base64,CCCC', objects: { ...later.objects, drawings: { old: drawings.old } } };
    now += MEMORY_READ_MS;
    expect(telling.lists(all, NO_FOG, true, source).shared.onMap?.drawings).toHaveLength(1);
    expect(decoded).toHaveLength(2);
  });

  it('tells what lies above the tokens by the same rule: only what players have seen, and what a player drew at any time', () => {
    const telling = new AnnotationTelling({ now: () => 0, map: () => MAP, changed: () => undefined });
    let edge = 1000;
    const source: MapLayerSource = { grid: () => null, doorsSeen: () => new Set(), pointsSeen: (points) => points.map(({ x }) => x < edge), sensed: () => [], rules: () => null };
    const above = { layer: 'above' } as const;
    const drawings = {
      near: line('near', { x: 100, y: 100 }, { x: 200, y: 100 }, above),
      far: line('far', { x: 1500, y: 100 }, { x: 1600, y: 100 }, { ...above, color: '#ab1234' }),
      theirs: line('theirs', { x: 1500, y: 300 }, { x: 1600, y: 300 }, { ...above, color: '#0000ff', by: 'player-1' }),
    };
    const texts = { secret: { ...label('secret', { x: 1700, y: 500 }, 'Secret door'), ...above } };
    const state = sceneState({ lighting: { enabled: true, ambient: 0 }, objects: { ...sceneState().objects, drawings, texts } });
    const first = telling.lists(state, NO_FOG, true, source);
    expect(first.shared.drawings.map(({ colour }) => colour)).toEqual(['#12ab34', '#0000ff']);
    expect(first.shared.texts).toEqual([]);
    expect(first.above).toEqual({ drawings: ['near', 'theirs'], texts: [] });
    // The party walks on: the rest is seen and told, and stays told when they leave.
    edge = 5000;
    const state2 = { ...state };
    const second = telling.lists({ ...state2, objects: { ...state.objects, drawings: { ...drawings } } }, NO_FOG, true, source);
    expect(second.shared.drawings).toHaveLength(3);
    expect(second.shared.texts.map(({ text }) => text)).toEqual(['Secret door']);
    // Where players do not see by their tokens' sight, all of it is told at once.
    const fresh = new AnnotationTelling({ now: () => 0, map: () => MAP, changed: () => undefined });
    edge = 0;
    expect(fresh.lists(state, NO_FOG, false, source).shared.drawings).toHaveLength(3);
  });

  it('keeps what players know of a scene that is shared again, and knows nothing of another', () => {
    const telling = new AnnotationTelling({ now: () => 0, map: () => MAP, changed: () => undefined });
    let seen = true;
    const source: MapLayerSource = { grid: () => null, doorsSeen: () => new Set(), pointsSeen: (points) => points.map(() => seen), sensed: () => [], rules: () => null };
    const drawings = { old: line('old', { x: 100, y: 100 }, { x: 200, y: 100 }) };
    const state = sceneState({ lighting: { enabled: true, ambient: 0.2 }, objects: { ...sceneState().objects, drawings } });
    telling.setScene('first');
    expect(telling.lists(state, NO_FOG, true, source).shared.onMap?.drawings).toHaveLength(1);
    seen = false;
    // Its files were handed anew: the scene goes and comes back under its id.
    telling.setScene(null);
    telling.setScene('first');
    expect(telling.lists(state, NO_FOG, true, source).shared.onMap?.drawings).toHaveLength(1);
    telling.setScene('second');
    expect(telling.lists(state, NO_FOG, true, source).shared.onMap).toBeUndefined();
  });

  it('tells all that lies on the map where players do not see by their tokens\' sight, and nothing while a scene keeps no memory', async () => {
    const telling = new AnnotationTelling({ now: () => 0, map: () => MAP, changed: () => undefined, decodeMask: () => Promise.resolve(half) });
    const source: MapLayerSource = { grid: () => null, doorsSeen: () => new Set(), pointsSeen: (points) => points.map(() => false), sensed: () => [], rules: () => null };
    const drawings = { old: line('old', { x: 100, y: 100 }, { x: 200, y: 100 }) };
    const lit = sceneState({ lighting: { enabled: true, ambient: 0.2, exploredMemory: false }, exploredMask: 'data:image/png;base64,AAAA', objects: { ...sceneState().objects, drawings } });
    telling.lists(lit, NO_FOG, true, source);
    await settled();
    expect(telling.lists(lit, NO_FOG, true, source).shared.onMap).toBeUndefined();
    const everyone = { ...lit, lighting: { enabled: true, ambient: 0.2, tokenVision: false } };
    expect(telling.lists(everyone, NO_FOG, true, source).shared.onMap?.drawings).toHaveLength(1);
    expect(telling.lists(lit, NO_FOG, false, source).shared.onMap?.drawings).toHaveLength(1);
  });
});
