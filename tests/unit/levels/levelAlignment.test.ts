import { describe, expect, it } from 'vitest';
import { imageToWorld, worldToImage, NO_STRETCH } from '../../../src/app/grid/mapStretch';
import { alignsSceneGrid, levelImagePlacement, readLevelAlignment } from '../../../src/app/levels/levelAlignment';
import { fittedLevelAlignment } from '../../../src/app/levels/levelAlignmentFit';
import type { GridState } from '../../../src/app/types/gridTypes';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';

const level = (id: string): SceneLevel => ({ id, name: id, elevation: { bottom: 0, top: 10 }, background: null });
const LEVELS = [level('ground'), level('upper'), level('roof')];
const GRID: GridState = { enabled: true, visible: true, size: 70, offsetX: 5, offsetY: 5, opacity: 0.5, mapStretch: { x: 1.1, y: 1 } };

describe('where a level\'s image is drawn', () => {
  it('draws every level without an alignment of its own as the scene\'s grid alignment says, like the first', () => {
    const scene = { levels: LEVELS, grid: GRID };
    expect(levelImagePlacement(scene, 'ground')).toEqual({ x: 1.1, y: 1 });
    expect(levelImagePlacement(scene, 'upper')).toEqual({ x: 1.1, y: 1 });
    expect(levelImagePlacement({ grid: GRID }, null)).toEqual({ x: 1.1, y: 1 });
    expect(alignsSceneGrid(scene, 'ground')).toBe(true);
    expect(alignsSceneGrid(scene, 'upper')).toBe(false);
  });

  it('draws a level with an alignment of its own by it, its scale folded into the stretch', () => {
    const scene = { levels: LEVELS, grid: GRID, levelAlignments: { upper: { offset: { x: 12, y: 0 }, scale: 2, stretch: { x: 1, y: 1.2 } } } };
    expect(levelImagePlacement(scene, 'upper')).toEqual({ x: 2, y: 2.4, offset: { x: 12, y: 0 } });
    expect(levelImagePlacement(scene, 'roof')).toEqual({ x: 1.1, y: 1 });
    expect(levelImagePlacement(scene, 'ground')).toEqual({ x: 1.1, y: 1 });
  });

  it('reads an alignment from a file only where it is one, never left of or above the origin', () => {
    expect(readLevelAlignment({ offset: { x: -4, y: 3 }, scale: 1.5, stretch: { x: 1.2, y: 1 } })).toEqual({ offset: { x: 0, y: 3 }, scale: 1.5, stretch: { x: 1.2, y: 1 } });
    expect(readLevelAlignment({ offset: { x: 0, y: 0 }, scale: 0, stretch: {} })).toBeUndefined();
    expect(readLevelAlignment({ offset: { x: 'a', y: 0 }, scale: 1 })).toBeUndefined();
    expect(readLevelAlignment({ offset: { x: 0, y: 0 }, scale: 1, stretch: { x: 9, y: 1 } })?.stretch).toBe(NO_STRETCH);
  });

  it('places an image with an offset and back again', () => {
    const size = { width: 300, height: 200 };
    const placement = { x: 2, y: 2, rotation: 1, offset: { x: 40, y: 15 } };
    const back = worldToImage(imageToWorld({ x: 30, y: 77 }, size, placement), size, placement);
    expect(back.x).toBeCloseTo(30, 9);
    expect(back.y).toBeCloseTo(77, 9);
  });
});

describe('fitting a level\'s image to the scene\'s grid', () => {
  it('scales the image\'s cells to the scene\'s and lays its lines on the scene\'s, the grid unchanged', () => {
    const square: GridState = { ...GRID, type: 'square', mapStretch: undefined };
    const alignment = fittedLevelAlignment(square, { cellSize: 50, offsetX: 10, offsetY: 20 }, undefined);

    expect(alignment.scale).toBeCloseTo(1.4, 9);
    expect(alignment.offset).toEqual({ x: 61, y: 47 });
    // A line of the image's grid lands on a line of the scene's
    const placement = levelImagePlacement({ levels: LEVELS, grid: square, levelAlignments: { upper: alignment } }, 'upper');
    const line = imageToWorld({ x: 10 + 3 * 50, y: 20 }, { width: 500, height: 500 }, placement);
    expect(((line.x - 5) / 70) % 1).toBeCloseTo(0, 6);
    expect(((line.y - 5) / 70) % 1).toBeCloseTo(0, 6);
  });

  it('keeps a floor fitted again where it lay, and moves a hex grid only by what lays it on itself', () => {
    const hex: GridState = { ...GRID, type: 'hex-vertical', mapStretch: undefined, offsetX: 0, offsetY: 0 };
    const near = { offset: { x: 700, y: 500 }, scale: 1, stretch: NO_STRETCH };
    const alignment = fittedLevelAlignment(hex, { cellSize: 70, offsetX: 0, offsetY: 0 }, near);

    expect(alignment.offset.x).toBe(700);
    // Two rows of a pointy-top grid: √3 cells
    const rows = alignment.offset.y / (70 * Math.sqrt(3));
    expect(rows).toBeCloseTo(Math.round(rows), 3);
    expect(Math.abs(alignment.offset.y - 500)).toBeLessThanOrEqual(70 * Math.sqrt(3) / 2);
  });
});
