import { describe, it, expect } from 'vitest';
import { detectGridInImage, MAX_ANALYSIS_SIDE, snapGridToMapGray } from '../../../src/app/pixi/spectralEngine/detectGrid';
import type { DetectableMap } from '../../../src/app/pixi/spectralEngine/detectGrid';
import { runDetection } from '../../../src/app/pixi/spectralEngine/detectionJob';
import { chooseWindows, detectGridInWindows } from '../../../src/app/pixi/spectralEngine/windowedDetection';
import { dashedDungeon } from './dashedDungeon';
import { drawnGrid } from './fixtures';

describe('grids a program drew, whose lines are all alike', () => {
  // Every harmonic of such a grid is as strong as the grid itself: a fifth of the cell is proposed first.
  it('finds the grid and not a finer copy of it', () => {
    const detected = detectGridInImage(drawnGrid(80, 1, 2000, 1500))!;

    expect(detected).toMatchObject({ gridType: 'square', aspect: 1, rotation: 0 });
    expect(detected.cellSize).toBeCloseTo(80, 1);
    expect(detected.support).toBeGreaterThan(0.9);
  }, 60000);

  it('finds cells that are rectangles, and not a grid of every fourth line one way and every fifth the other', () => {
    const detected = detectGridInImage(drawnGrid(80, 1.03, 2000, 1500))!;

    expect(detected.gridType).toBe('square');
    expect(detected.cellSize).toBeCloseTo(80, 1);
    expect(detected.aspect).toBeCloseTo(1.03, 3);
  }, 60000);

  it('finds small cells on a large map', () => {
    const detected = detectGridInImage(drawnGrid(20, 1, 4096, 3000, 120))!;

    expect(detected.gridType).toBe('square');
    expect(detected.cellSize).toBeCloseTo(20, 1);
  }, 60000);

  // A map uploaded small (a preview of 400 px) has cells of ten pixels: its grid is that one, not every second line of it.
  it('finds the cells of a small picture, and not four of them as one', () => {
    const detected = detectGridInImage(drawnGrid(10, 1, 400, 300, 120))!;

    expect(detected.gridType).toBe('square');
    expect(detected.cellSize).toBeCloseTo(10, 1);
  }, 60000);

  it('fits a measurement to cells that are rectangles', () => {
    const [width, height] = [2000, 1500];
    const snapped = snapGridToMapGray({ image: drawnGrid(80, 1.03, width, height), size: { width, height } }, [{ gridType: 'square', cellSize: 76, offsetX: 0, offsetY: 0 }])!;

    expect(snapped.mapStretch).toEqual({ x: expect.closeTo(1.03, 3), y: 1 });
    expect(snapped.cellSize).toBeCloseTo(82.4, 1);
    expect(snapped.confidence).toBeGreaterThan(0.9);
  }, 60000);

  // A generator's dungeon too large to see whole: in a window, lattices that sit on the rock's dither outscore the grid on the floors.
  it('finds the dashed grid of a huge dungeon drawn on its floors alone', async () => {
    const size = { width: 8400, height: 6800 };
    const draw = dashedDungeon(size.width, size.height, 200, 40);
    const map: DetectableMap = { worldRect: { x: 0, y: 0, ...size }, imageSize: size, overview: () => Promise.resolve(null), window: () => Promise.resolve(null) };
    const whole = { x: 0, y: 0, ...size };
    const scale = MAX_ANALYSIS_SIDE / Math.max(size.width, size.height);
    // A window's picture names its size only: windows are read in the order they were chosen.
    const windows = chooseWindows(runDetection({ gray: { image: draw(whole, scale), size }, ink: false, linesOnly: true }, () => {}).lines!, size);

    const found = await detectGridInWindows(map, {}, (pixels, options) => {
      const rect = pixels.size.width === size.width && pixels.size.height === size.height ? whole : windows.shift()!;
      const image = rect === whole ? draw(whole, scale) : draw(rect, 1);
      return Promise.resolve(runDetection({ gray: { image, size: pixels.size }, ink: false, linesOnly: options.linesOnly }, () => {}));
    });

    expect(found.result).toMatchObject({ gridType: 'square' });
    expect(found.result!.cellSize).toBeCloseTo(200, 0);
  }, 600000);

  // A dot sits on every crossing, so lattices of three and six fifths of the cell find one under each long edge and outscore the grid.
  it('finds a grid dotted every fifth of a cell in the reduced picture of the whole map', () => {
    const size = { width: 4800, height: 4000 };
    const picture = dashedDungeon(size.width, size.height, 200, 40, 'dots')({ x: 0, y: 0, ...size }, 0.5);

    const detected = detectGridInImage(picture)!;

    expect(detected).toMatchObject({ gridType: 'square', aspect: 1 });
    expect(detected.cellSize).toBeCloseTo(100, 0);
  }, 120000);

  // Rows 3 % off on a map this size are found by no proposal: a grid of nearly the measured size shares every eighth line with the map's.
  it('keeps a measurement as it is where only a grid that shares some lines with the map\'s fits', () => {
    const [width, height] = [1600, 1200];
    const gray = { image: drawnGrid(70, 1.03, width, height), size: { width, height } };

    for (const cellSize of [66.5, 62.3, 75.6]) {
      expect(snapGridToMapGray(gray, [{ gridType: 'square', cellSize, offsetX: 0, offsetY: 0 }])).toBeNull();
    }
    // Nor is the map taken for hexes a fifth off regular, which a third of its lines would agree with.
    expect(detectGridInImage(gray.image)).toBeNull();
  }, 60000);
});
