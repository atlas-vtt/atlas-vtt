import { describe, it, expect } from 'vitest';
import { detectGridInImage } from '../../../src/app/pixi/spectralEngine/detectGrid';
import { gridLineSamples } from '../../../src/app/pixi/spectralEngine/gridTemplate';
import { fftInPlace } from '../../../src/app/pixi/spectralEngine/fft';
import type { GridType } from '../../../src/app/grid/GridSystem';
import { axialToPixel, createHexLayout, hexVertices, isHexGridType, pixelToAxial } from '../../../src/app/grid/hexGeometry';
import { rng, syntheticMap, distanceToGrid, difficultMap, cornerError } from './fixtures';

describe('fft', () => {
  it('matches a direct DFT of a small signal', () => {
    const re = Float32Array.from([1, 2, 3, 4, 0, -1, 2, 5]);
    const im = new Float32Array(8);
    const expected = Array.from(re, (_, k) => {
      let sum = 0;
      for (let t = 0; t < 8; t++) sum += re[t]! * Math.cos((-2 * Math.PI * k * t) / 8);
      return sum;
    });
    fftInPlace(re, im);
    expected.forEach((value, k) => expect(re[k]).toBeCloseTo(value, 3));
  });
});

describe('detectGridInImage', () => {
  it.each<[GridType, number, number, number]>([
    ['square', 64.4, 17.3, 41.8],
    ['hex-vertical', 71.2, 22.5, 9.1],
    ['hex-horizontal', 58.7, 5.4, 30.2],
  ])('recovers a %s grid of size %f from a textured synthetic map', (gridType, cellSize, offsetX, offsetY) => {
    const width = 1400;
    const height = 1000;
    const image = syntheticMap(gridType, cellSize, offsetX, offsetY, width, height);

    const detected = detectGridInImage(image)!;

    expect(detected).not.toBeNull();
    expect(detected.gridType).toBe(gridType);
    expect(detected.aspect).toBe(1);
    expect(Math.abs(detected.cellSize - cellSize) / cellSize).toBeLessThan(0.002);
    expect(detected.support).toBeGreaterThan(0.5);

    // Corners of the true grid at the far corners of the map must lie on the detected grid.
    const truthSamples = gridLineSamples(gridType, cellSize, offsetX, offsetY, { minX: 0, minY: 0, maxX: width, maxY: height }, 200);
    for (const s of [truthSamples[0]!, truthSamples[truthSamples.length - 1]!, truthSamples[Math.floor(truthSamples.length / 2)]!]) {
      if (isHexGridType(gridType)) continue;
      expect(distanceToGrid(gridType, detected.cellSize, detected.offsetX, detected.offsetY, s)).toBeLessThan(1);
    }
    if (isHexGridType(gridType)) {
      const truth = createHexLayout(gridType, cellSize, offsetX, offsetY);
      for (const [q, r] of [[2, 2], [14, 5], [6, 11]] as Array<[number, number]>) {
        const corner = hexVertices(truth, axialToPixel(truth, { q, r }))[0]!;
        expect(distanceToGrid(gridType, detected.cellSize, detected.offsetX, detected.offsetY, corner)).toBeLessThan(1);
      }
    }
  }, 30000);

  it.each<[GridType, number, number, number]>([
    ['square', 47.37, 12.6, 30.9],
    ['hex-vertical', 83.21, 40.2, 17.7],
  ])('keeps a faint, partly covered %s grid aligned across a large map', (gridType, cellSize, offsetX, offsetY) => {
    const width = 3000;
    const height = 2200;
    const detected = detectGridInImage(difficultMap(gridType, cellSize, offsetX, offsetY, width, height))!;

    expect(detected).not.toBeNull();
    expect(detected.gridType).toBe(gridType);
    expect(detected.aspect).toBe(1);

    // True lattice corners nearest to the four map corners and the centre.
    for (const [fx, fy] of [[0.02, 0.02], [0.98, 0.02], [0.02, 0.98], [0.98, 0.98], [0.5, 0.5]] as Array<[number, number]>) {
      let corner: { x: number; y: number };
      if (isHexGridType(gridType)) {
        const truth = createHexLayout(gridType, cellSize, offsetX, offsetY);
        corner = hexVertices(truth, axialToPixel(truth, pixelToAxial(truth, { x: fx * width, y: fy * height })))[0]!;
      } else {
        corner = {
          x: offsetX + Math.round((fx * width - offsetX) / cellSize) * cellSize,
          y: offsetY + Math.round((fy * height - offsetY) / cellSize) * cellSize,
        };
      }
      expect(cornerError(gridType, detected.cellSize, detected.offsetX, detected.offsetY, corner)).toBeLessThan(0.25);
    }
  }, 60000);

  it('reports no grid on textured art with heavy ink but no grid', () => {
    expect(detectGridInImage(difficultMap('square', 47.37, 0, 0, 1600, 1200, false))).toBeNull();
  }, 60000);

  it('reports no grid on a map without periodic lines', () => {
    const random = rng(3);
    const width = 800;
    const height = 600;
    const data = new Float32Array(width * height);
    for (let i = 0; i < data.length; i++) data[i] = 120 + (random() - 0.5) * 80;
    expect(detectGridInImage({ width, height, data })).toBeNull();
  });
});
