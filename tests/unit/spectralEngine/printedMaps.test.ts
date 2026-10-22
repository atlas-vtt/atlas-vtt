import { describe, it, expect } from 'vitest';
import { detectGridInImage, detectGridInMapGray } from '../../../src/app/pixi/spectralEngine/detectGrid';
import { inkOf, runDetection } from '../../../src/app/pixi/spectralEngine/detectionJob';
import type { DetectionEvent } from '../../../src/app/pixi/spectralEngine/detectionJob';
import type { GridType } from '../../../src/app/grid/GridSystem';
import { syntheticMap, distanceToGrid, cornerError, trueCorners, printedMap } from './fixtures';

describe('grids as map makers print them', () => {
  // The map a GM reported: flat-top hexes 5.7 % too tall, pale lines, grass icons across every hex's edges.
  it('finds pale lines under terrain icons that cross them', () => {
    const detected = detectGridInImage(printedMap('hex-horizontal', 194.9, 1206, 1021, { aspect: 1.057, icons: true }))!;

    expect(detected).not.toBeNull();
    expect(detected.gridType).toBe('hex-horizontal');
    expect(Math.abs(detected.cellSize - 194.9) / 194.9).toBeLessThan(0.003);
    expect(Math.abs(detected.aspect - 1.057) / 1.057).toBeLessThan(0.002);
  }, 60000);

  it.each<[GridType, number, number]>([
    ['hex-horizontal', 310, 7],
    ['square', 256, 9],
  ])('finds the thick lines of a large %s grid of %f px', (gridType, cellSize, lineWidth) => {
    const detected = detectGridInImage(printedMap(gridType, cellSize, 2600, 2100, { lineWidth }))!;

    expect(detected).not.toBeNull();
    expect(detected.gridType).toBe(gridType);
    expect(detected.aspect).toBe(1);
    expect(Math.abs(detected.cellSize - cellSize) / cellSize).toBeLessThan(0.002);
    for (const corner of trueCorners(gridType, cellSize, 11.3, 7.9, 2600, 2100, 1)) {
      expect(cornerError(gridType, detected.cellSize, detected.offsetX, detected.offsetY, corner)).toBeLessThan(1);
    }
  }, 60000);

  it('finds a few large cells that are not regular', () => {
    const detected = detectGridInImage(printedMap('hex-vertical', 420, 2300, 2500, { aspect: 1.06, lineWidth: 6 }))!;

    expect(detected).not.toBeNull();
    expect(detected.gridType).toBe('hex-vertical');
    expect(Math.abs(detected.aspect - 1.06) / 1.06).toBeLessThan(0.002);
    expect(Math.abs(detected.cellSize - 420) / 420).toBeLessThan(0.003);
  }, 60000);
});

describe('a detection as the worker runs it', () => {
  const map = syntheticMap('square', 64, 20, 28, 640, 480);
  const gray = { image: map, size: { width: 1280, height: 960 } };

  it('reports the fits it finds without finding anything else', () => {
    const events: DetectionEvent[] = [];
    const { result, hits } = runDetection({ gray, ink: true }, (event) => events.push(event));

    // Listening changes nothing: the answer is the one a plain detection gives.
    expect(result).toEqual(detectGridInMapGray(map, gray.size));
    expect(result?.gridType).toBe('square');

    expect(events[0]?.type).toBe('ink');
    const fits = events.flatMap((event) => (event.type === 'fit' ? [event.fit] : []));
    expect(fits.length).toBeGreaterThan(0);
    // The answer is one of the grids reported on the way.
    expect(fits).toContainEqual(result);

    // Every edge named as lying on a line of the map lies on a line of the answer's grid.
    expect(hits!.length % 4).toBe(0);
    expect(hits!.length).toBeGreaterThan(100);
    for (let i = 0; i < hits!.length; i += 2) {
      expect(distanceToGrid('square', result!.cellSize, result!.offsetX, result!.offsetY, { x: hits![i]!, y: hits![i + 1]! })).toBeLessThan(0.05);
    }
  });

  it('reads the line evidence small, with the grid in it', () => {
    const ink = inkOf(map);
    expect(Math.max(ink.width, ink.height)).toBeLessThanOrEqual(768);
    expect(ink.data).toHaveLength(ink.width * ink.height);
    // Along a grid line the ink is strong, along the middle of a column of cells there is little.
    const columnMean = (x: number): number => {
      let sum = 0;
      for (let y = 0; y < ink.height; y++) sum += ink.data[y * ink.width + x]!;
      return sum / ink.height;
    };
    expect(columnMean(20 + 64 * 3)).toBeGreaterThan(150);
    expect(columnMean(20 + 64 * 3 + 32)).toBeLessThan(40);
  });

  it('asks for no line evidence where nobody wants it, and names no edges for a map without a grid', () => {
    const blank = { image: { width: 256, height: 256, data: new Float32Array(256 * 256).fill(128) }, size: { width: 256, height: 256 } };
    const events: DetectionEvent[] = [];
    expect(runDetection({ gray: blank, ink: false }, (event) => events.push(event))).toEqual({ result: null, hits: null });
    expect(events).toEqual([]);
  });
});
