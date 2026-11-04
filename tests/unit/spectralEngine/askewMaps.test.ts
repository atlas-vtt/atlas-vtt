import { describe, it, expect } from 'vitest';
import { detectGridInImage, detectGridInMapGray } from '../../../src/app/pixi/spectralEngine/detectGrid';
import type { GridType } from '../../../src/app/grid/GridSystem';
import { wrapToGrid, printedMap } from './fixtures';

describe('maps that lie askew', () => {
  const DEGREE = Math.PI / 180;

  it.each<[GridType, number, number, number]>([
    ['hex-horizontal', 126, 0.979, -0.29],
    ['square', 70, 1, 0.6],
    ['hex-vertical', 72, 0.981, 0.19],
  ])('finds a %s grid of %f px on a scan with aspect %f turned by %f°', (gridType, cellSize, aspect, degrees) => {
    const detected = detectGridInImage(printedMap(gridType, cellSize, 2400, 1900, { aspect, rotation: degrees * DEGREE }))!;

    expect(detected).not.toBeNull();
    expect(detected.gridType).toBe(gridType);
    expect(Math.abs(detected.cellSize - cellSize) / cellSize).toBeLessThan(0.002);
    expect(Math.abs(detected.aspect - aspect) / aspect).toBeLessThan(0.001);
    // A hundredth of a degree moves a line at the rim of this map by a fifth of a pixel.
    expect(Math.abs(detected.rotation / DEGREE - degrees)).toBeLessThan(0.01);
  }, 60000);

  // The size and shape of the map a GM reported, scanned 1.3° askew: far enough from level and regular that the fit must find both at once.
  it('finds a map that is stretched and lies askew at once', () => {
    const detected = detectGridInImage(printedMap('hex-horizontal', 194.9, 1229, 1048, { aspect: 1.057, rotation: 1.3 * DEGREE }))!;

    expect(detected).not.toBeNull();
    expect(detected.gridType).toBe('hex-horizontal');
    expect(Math.abs(detected.cellSize - 194.9) / 194.9).toBeLessThan(0.003);
    expect(Math.abs(detected.aspect - 1.057) / 1.057).toBeLessThan(0.002);
    expect(Math.abs(detected.rotation / DEGREE - 1.3)).toBeLessThan(0.02);
    expect(detected.support).toBeGreaterThan(0.5);
  }, 60000);

  it('leaves a level map level', () => {
    const detected = detectGridInImage(printedMap('square', 70, 1600, 1200, {}))!;
    expect(detected.rotation).toBe(0);
    expect(detected.aspect).toBe(1);
  }, 30000);

  it('returns the grid in the world of the map drawn level: a line of the map lies on the grid there', () => {
    const [width, height, cellSize, degrees] = [2000, 1500, 80, 0.5];
    const image = printedMap('square', cellSize, width, height, { rotation: degrees * DEGREE });
    const result = detectGridInMapGray(image, { width, height })!;

    expect(result.mapStretch).toEqual({ x: 1, y: 1, rotation: expect.closeTo(degrees, 2) });
    expect(result.cellSize).toBeCloseTo(cellSize, 1);
    // The map is drawn turned back about its centre, and the world begins at the corner of the box that then holds it.
    const turn = -result.mapStretch!.rotation! * DEGREE;
    const box = { width: width * Math.cos(turn) + height * Math.abs(Math.sin(turn)), height: width * Math.abs(Math.sin(turn)) + height * Math.cos(turn) };
    const inWorld = (x: number, y: number): { x: number; y: number } => ({
      x: box.width / 2 + Math.cos(turn) * (x - width / 2) - Math.sin(turn) * (y - height / 2),
      y: box.height / 2 + Math.sin(turn) * (x - width / 2) + Math.cos(turn) * (y - height / 2),
    });
    // Crossings of the drawn grid, as they lie on the image (the drawing was level and then turned).
    for (const [column, row] of [[2, 3], [20, 4], [5, 15], [22, 16]] as Array<[number, number]>) {
      const level = { x: 11.3 + column * cellSize - width / 2, y: 7.9 + row * cellSize - height / 2 };
      const onImage = {
        x: width / 2 + Math.cos(degrees * DEGREE) * level.x - Math.sin(degrees * DEGREE) * level.y + 0.5,
        y: height / 2 + Math.sin(degrees * DEGREE) * level.x + Math.cos(degrees * DEGREE) * level.y + 0.5,
      };
      const world = inWorld(onImage.x, onImage.y);
      expect(wrapToGrid(world.x, result.offsetX, result.cellSize)).toBeLessThan(0.75);
      expect(wrapToGrid(world.y, result.offsetY, result.cellSize)).toBeLessThan(0.75);
    }
  }, 60000);
});
