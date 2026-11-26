import { describe, expect, it } from 'vitest';
import { changedCanvasRect, changedFogBox, unitedCanvasRect, type FogCanvasFrame } from '../../src/app/pixi/fog/fogChangedRect';
import type { FogOperation } from '../../src/app/types/fogTypes';
import { fogRectangle } from '../helpers/fogOperations';

const hall = fogRectangle({ id: 'hall', x: 100, y: 200, width: 300, height: 100 });
const cellar = fogRectangle({ id: 'cellar', x: 600, y: 50, width: 100, height: 400 });
const stroke: FogOperation = { id: 'stroke', kind: 'fog', type: 'brush', timestamp: 3, isErasing: true, brushRadius: 25, points: [{ x: 800, y: 800 }, { x: 900, y: 850 }] };

describe('the box a change of the fog lies in', () => {
  it('is none where both records hold the same operations', () => {
    expect(changedFogBox({ hall, cellar }, { hall, cellar })).toBeNull();
    expect(changedFogBox({}, {})).toBeNull();
    // Another record of the same operations (another level's fog was edited)
    expect(changedFogBox({ hall }, { ...{ hall } })).toBeNull();
  });

  it('is the box around an operation that came or went, a brush stroke with its radius', () => {
    expect(changedFogBox({ hall }, { hall, cellar })).toEqual({ left: 600, top: 50, right: 700, bottom: 450 });
    expect(changedFogBox({ hall, cellar }, { cellar })).toEqual({ left: 100, top: 200, right: 400, bottom: 300 });
    expect(changedFogBox({ hall }, { hall, stroke })).toEqual({ left: 775, top: 775, right: 925, bottom: 875 });
  });

  it('holds an operation as it was and as it is: an area flipped, reshaped or moved', () => {
    expect(changedFogBox({ hall, cellar }, { hall: { ...hall, isErasing: true, timestamp: 9 }, cellar })).toEqual({ left: 100, top: 200, right: 400, bottom: 300 });
    expect(changedFogBox({ hall }, { hall: { ...hall, x: 150, width: 400 } })).toEqual({ left: 100, top: 200, right: 550, bottom: 300 });
    expect(changedFogBox({ hall }, { hall: { ...hall, offsetX: -60, offsetY: 500 } })).toEqual({ left: 40, top: 200, right: 400, bottom: 800 });
  });

  it('holds everything that came and went at once: the whole map revealed', () => {
    expect(changedFogBox({ hall, cellar, stroke }, {})).toEqual({ left: 100, top: 50, right: 925, bottom: 875 });
  });

  it('is unbounded where an operation that changed cannot be read', () => {
    const everywhere = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
    expect(changedFogBox({ hall }, { hall, broken: fogRectangle({ id: 'broken', x: Number.NaN }) })).toEqual(everywhere);
    expect(changedFogBox({ hall, broken: null as unknown as FogOperation }, { hall })).toEqual(everywhere);
    expect(changedFogBox({ hall }, { hall, endless: fogRectangle({ id: 'endless', width: Infinity }) })).toEqual(everywhere);
    // One nobody changed is not read
    const broken = fogRectangle({ id: 'broken', x: Number.NaN });
    expect(changedFogBox({ broken }, { broken, cellar })).toEqual({ left: 600, top: 50, right: 700, bottom: 450 });
  });
});

describe('the canvas pixels a change shows in', () => {
  /** A map of 1000 by 800 with the canvas' 200 px of room around it, at half resolution. */
  const frame: FogCanvasFrame = { bounds: { x: -200, y: -200, width: 1400, height: 1200 }, scale: 0.5, width: 700, height: 600, reach: 0, map: { x: 0, y: 0, width: 1000, height: 800 } };

  it('are the box in canvas pixels with a rim of three around it', () => {
    expect(changedCanvasRect({ left: 100, top: 200, right: 400, bottom: 300 }, frame)).toEqual({ x: 147, y: 197, width: 156, height: 56 });
    // Whole pixels, outward
    expect(changedCanvasRect({ left: 101, top: 201, right: 399, bottom: 299 }, frame)).toEqual({ x: 147, y: 197, width: 156, height: 56 });
  });

  it('end at the canvas, and are none for a change off it', () => {
    expect(changedCanvasRect({ left: -5000, top: 700, right: 10, bottom: 5000 }, frame)).toEqual({ x: 0, y: 447, width: 108, height: 153 });
    expect(changedCanvasRect({ left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity }, frame)).toEqual({ x: 0, y: 0, width: 700, height: 600 });
    expect(changedCanvasRect({ left: 3000, top: 100, right: 3100, bottom: 200 }, frame)).toBeNull();
  });

  it('reach as far beyond the box as the fog\'s edge carries a change', () => {
    expect(changedCanvasRect({ left: 400, top: 300, right: 500, bottom: 400 }, { ...frame, reach: 30 })).toEqual({ x: 282, y: 232, width: 86, height: 86 });
  });

  it('reach the canvas\' edge where a fog with an edge is changed at the map\'s edge, which it is repeated past', () => {
    const soft = { ...frame, reach: 30 };
    // Up to the map's top edge: the canvas' top; its left is still far
    expect(changedCanvasRect({ left: 400, top: 0, right: 500, bottom: 100 }, soft)).toEqual({ x: 282, y: 0, width: 86, height: 168 });
    // Within the edge's reach of the map's right and bottom edges
    expect(changedCanvasRect({ left: 900, top: 700, right: 980, bottom: 780 }, soft)).toEqual({ x: 532, y: 432, width: 168, height: 168 });
    // A hard edge repeats nothing
    expect(changedCanvasRect({ left: 400, top: 0, right: 500, bottom: 100 }, frame)).toEqual({ x: 297, y: 97, width: 56, height: 56 });
  });

  it('unite to the box that holds both', () => {
    expect(unitedCanvasRect({ x: 10, y: 20, width: 30, height: 40 }, { x: 100, y: 0, width: 5, height: 30 })).toEqual({ x: 10, y: 0, width: 95, height: 60 });
  });
});
