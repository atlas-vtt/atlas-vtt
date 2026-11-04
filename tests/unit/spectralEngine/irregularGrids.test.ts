import { describe, it, expect } from 'vitest';
import { detectGridInImage, detectGridInMapGray, snapGridToMapGray } from '../../../src/app/pixi/spectralEngine/detectGrid';
import type { GridType } from '../../../src/app/grid/GridSystem';
import { syntheticMap, wrapToGrid, cornerError, trueCorners } from './fixtures';

describe('grids whose cells are not regular', () => {
  // The first is the map a GM reported: pointy hexes 33.7 px wide in rows 4.8 % too far apart.
  it.each<[GridType, number, number, number, number, number, number]>([
    ['hex-vertical', 33.7, 9.3, 14.1, 714, 1024, 1.048],
    ['hex-horizontal', 58.7, 5.4, 30.2, 1400, 1000, 1.12],
    ['square', 64.4, 17.3, 41.8, 1400, 1000, 0.93],
    ['hex-vertical', 71.2, 22.5, 9.1, 1400, 1000, 0.985],
  ])('finds a %s grid of %f px printed with aspect %f', (gridType, cellSize, offsetX, offsetY, width, height, aspect) => {
    const detected = detectGridInImage(syntheticMap(gridType, cellSize, offsetX, offsetY, width, height, aspect))!;

    expect(detected).not.toBeNull();
    expect(detected.gridType).toBe(gridType);
    expect(Math.abs(detected.aspect - aspect) / aspect).toBeLessThan(0.001);
    expect(Math.abs(detected.cellSize - cellSize) / cellSize).toBeLessThan(0.002);
    expect(detected.support).toBeGreaterThan(0.5);
    // The grid is given on the squared-up image, where the true grid was drawn.
    for (const corner of trueCorners(gridType, cellSize, offsetX, offsetY, width, height, aspect)) {
      expect(cornerError(gridType, detected.cellSize, detected.offsetX, detected.offsetY, corner)).toBeLessThan(1);
    }
  }, 60000);

  it('returns the grid in the world of the stretched map, which only ever grows', () => {
    const [width, height] = [1400, 1000];
    const tall = detectGridInMapGray(syntheticMap('hex-vertical', 70, 12, 20, width, height, 1.06), { width: 2 * width, height: 2 * height })!;
    const wide = detectGridInMapGray(syntheticMap('square', 64.4, 17.3, 41.8, width, height, 0.93), { width, height })!;

    // Rows too far apart: the map is drawn wider, and its cells take the size of their height.
    expect(tall.mapStretch!.y).toBe(1);
    expect(tall.mapStretch!.x).toBeCloseTo(1.06, 3);
    expect(tall.cellSize).toBeCloseTo(70 * 2 * 1.06, 0);
    // Rows too close together: the map is drawn taller.
    expect(wide.mapStretch!.x).toBe(1);
    expect(wide.mapStretch!.y).toBeCloseTo(1 / 0.93, 3);
    expect(wide.cellSize).toBeCloseTo(64.4, 1);
    // A line of the map drawn at image row y lies at world row y × stretch, on the detected grid.
    const imageRow = (41.8 + 5 * 64.4) * 0.93 + 0.5;
    expect(wrapToGrid(imageRow * wide.mapStretch!.y, wide.offsetY, wide.cellSize)).toBeLessThan(0.75);
    expect(wrapToGrid(17.3 + 7 * 64.4 + 0.5, wide.offsetX, wide.cellSize)).toBeLessThan(0.75);
  }, 60000);

  it('leaves a regular map without a stretch', () => {
    const detected = detectGridInMapGray(syntheticMap('square', 64.4, 17.3, 41.8, 1400, 1000), { width: 1400, height: 1000 })!;
    expect(detected).not.toHaveProperty('mapStretch');
  }, 30000);
});

describe('snapGridToMapGray', () => {
  const size = { width: 1400, height: 1000 };

  it('places a grid measured by hand exactly on the lines, whatever its offsets were', () => {
    const image = syntheticMap('hex-vertical', 71.2, 22.5, 9.1, size.width, size.height);
    const snapped = snapGridToMapGray({ image, size }, [{ gridType: 'hex-vertical', cellSize: 75, offsetX: 3, offsetY: 60 }])!;

    expect(snapped.gridType).toBe('hex-vertical');
    expect(snapped.cellSize).toBeCloseTo(71.2, 1);
    expect(snapped.confidence).toBeGreaterThan(0.5);
    expect(snapped).not.toHaveProperty('mapStretch');
  }, 30000);

  it('finds the stretch of a map whose cells are not regular from a rough size', () => {
    const image = syntheticMap('hex-vertical', 33.7, 9.3, 14.1, 714, 1024, 1.048);
    const snapped = snapGridToMapGray({ image, size: { width: 714, height: 1024 } }, [{ gridType: 'hex-vertical', cellSize: 36, offsetX: 0, offsetY: 0 }])!;

    expect(snapped.mapStretch!.x).toBeCloseTo(1.048, 2);
    expect(snapped.cellSize).toBeCloseTo(33.7 * 1.048, 0);
  }, 30000);

  it('takes the reading of the measurement that the lines support', () => {
    const image = syntheticMap('hex-vertical', 71.2, 22.5, 9.1, size.width, size.height);
    // Two opposite corners read as a hex edge give twice the size; the second reading is the map's.
    const snapped = snapGridToMapGray({ image, size }, [
      { gridType: 'hex-vertical', cellSize: 142, offsetX: 0, offsetY: 0 },
      { gridType: 'hex-vertical', cellSize: 71, offsetX: 0, offsetY: 0 },
    ])!;

    expect(snapped.cellSize).toBeCloseTo(71.2, 1);
  }, 30000);

  it('keeps to the type it was given: a map with another grid gives nothing', () => {
    const image = syntheticMap('square', 64.4, 17.3, 41.8, size.width, size.height);
    expect(snapGridToMapGray({ image, size }, [{ gridType: 'hex-horizontal', cellSize: 64, offsetX: 0, offsetY: 0 }])).toBeNull();
  }, 30000);

  it('asks for the other orientation only where the chosen one settled nothing', () => {
    const image = syntheticMap('hex-horizontal', 58.7, 5.4, 30.2, size.width, size.height);
    const snapped = snapGridToMapGray({ image, size }, [
      { gridType: 'hex-vertical', cellSize: 58, offsetX: 0, offsetY: 0 },
      { gridType: 'hex-horizontal', cellSize: 101, offsetX: 0, offsetY: 0 },
      { gridType: 'hex-horizontal', cellSize: 60, offsetX: 0, offsetY: 0 },
    ])!;

    expect(snapped.gridType).toBe('hex-horizontal');
    expect(snapped.cellSize).toBeCloseTo(58.7, 1);
  }, 30000);
});
