import { describe, it, expect } from 'vitest';
import { detectGridInImage, detectGridInMapGray, snapGridToMapGray } from '../../src/app/pixi/gridDetection/detectGrid';
import { gridLineSamples } from '../../src/app/pixi/gridDetection/gridTemplate';
import type { GrayImage } from '../../src/app/pixi/gridDetection/grayImage';
import { fftInPlace } from '../../src/app/pixi/gridDetection/fft';
import type { GridType } from '../../src/app/grid/GridSystem';
import { axialToPixel, createHexLayout, hexVertices, isHexGridType, pixelToAxial } from '../../src/app/grid/hexGeometry';

/** Deterministic pseudo-random numbers so the synthetic maps are reproducible. */
function rng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * A fake map: textured background, some large blobs, and a thin grid drawn with the real drawers.
 * `aspect` prints the grid with its rows that many times further apart, as maps with cells that are not regular do.
 */
function syntheticMap(gridType: GridType, cellSize: number, offsetX: number, offsetY: number, width: number, height: number, aspect = 1): GrayImage {
  const random = rng(7);
  const data = new Float32Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = 170 + (random() - 0.5) * 40;

  for (let b = 0; b < 12; b++) {
    const cx = random() * width;
    const cy = random() * height;
    const r = 30 + random() * 120;
    const shade = 60 + random() * 120;
    for (let y = Math.max(0, cy - r); y < Math.min(height, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x < Math.min(width, cx + r); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) data[Math.floor(y) * width + Math.floor(x)] = shade;
      }
    }
  }

  const bounds = { minX: -cellSize, minY: -cellSize, maxX: width + cellSize, maxY: height / aspect + cellSize };
  for (const s of gridLineSamples(gridType, cellSize, offsetX, offsetY, bounds, 0.5)) {
    for (let t = -1; t <= 1; t += 0.5) {
      const x = Math.round(s.x + s.nx * t);
      const y = Math.round((s.y + s.ny * t) * aspect);
      if (x >= 0 && y >= 0 && x < width && y < height) data[y * width + x] = 40;
    }
  }
  return { width, height, data };
}

/** Distance from `value` to the nearest line of a square grid of `cellSize` starting at `offset`. */
function wrapToGrid(value: number, offset: number, cellSize: number): number {
  const m = (((value - offset) % cellSize) + cellSize) % cellSize;
  return Math.min(m, cellSize - m);
}

/** Distance from `point` to the nearest line of the grid described by the detection. */
function distanceToGrid(gridType: GridType, cellSize: number, offsetX: number, offsetY: number, point: { x: number; y: number }): number {
  if (!isHexGridType(gridType)) {
    return Math.min(wrapToGrid(point.x, offsetX, cellSize), wrapToGrid(point.y, offsetY, cellSize));
  }
  const layout = createHexLayout(gridType, cellSize, offsetX, offsetY);
  let best = Infinity;
  for (let q = -40; q <= 40; q++) {
    for (let r = -40; r <= 40; r++) {
      for (const v of hexVertices(layout, axialToPixel(layout, { q, r }))) {
        best = Math.min(best, Math.hypot(v.x - point.x, v.y - point.y));
      }
    }
  }
  return best;
}

/**
 * A map that behaves like real art: heavy texture, thick off-grid ink strokes, and a
 * faint anti-aliased grid that is only visible on part of the map.
 */
function difficultMap(gridType: GridType, cellSize: number, offsetX: number, offsetY: number, width: number, height: number, withGrid = true): GrayImage {
  const random = rng(11);
  const data = new Float32Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = 150 + (random() - 0.5) * 70;

  // Grid coverage: visible only inside a handful of large "floor" areas.
  const floors = Array.from({ length: 9 }, () => ({ x: random() * width, y: random() * height, r: 250 + random() * 450 }));
  const onFloor = (x: number, y: number): boolean => floors.some((f) => (x - f.x) ** 2 + (y - f.y) ** 2 < f.r * f.r);

  const ink = new Float32Array(width * height);
  const splat = (px: number, py: number, nx: number, ny: number, halfWidth: number, strength: number): void => {
    const reach = Math.ceil(halfWidth + 1);
    for (let y = Math.floor(py) - reach; y <= Math.floor(py) + reach + 1; y++) {
      for (let x = Math.floor(px) - reach; x <= Math.floor(px) + reach + 1; x++) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const along = Math.abs((x - px) * -ny + (y - py) * nx);
        if (along > 0.75) continue;
        const across = Math.abs((x - px) * nx + (y - py) * ny);
        const coverage = Math.min(1, Math.max(0, halfWidth + 0.5 - across)) * strength;
        const i = y * width + x;
        if (coverage > ink[i]!) ink[i] = coverage;
      }
    }
  };

  const bounds = { minX: -cellSize, minY: -cellSize, maxX: width + cellSize, maxY: height + cellSize };
  for (const s of gridLineSamples(gridType, cellSize, offsetX, offsetY, bounds, 0.5)) {
    if (withGrid && onFloor(s.x, s.y)) splat(s.x, s.y, s.nx, s.ny, 0.8, 0.45);
  }
  // Thick wall strokes at arbitrary positions and angles.
  for (let w = 0; w < 60; w++) {
    const angle = random() * Math.PI;
    const length = 200 + random() * 600;
    const sx = random() * width;
    const sy = random() * height;
    for (let t = 0; t < length; t += 0.5) splat(sx + Math.cos(angle) * t, sy + Math.sin(angle) * t, -Math.sin(angle), Math.cos(angle), 3, 1);
  }
  for (let i = 0; i < data.length; i++) data[i] = data[i]! * (1 - ink[i]!) + 25 * ink[i]!;
  return { width, height, data };
}

/** Distance from a true lattice corner to the nearest corner of the detected grid. */
function cornerError(gridType: GridType, cellSize: number, offsetX: number, offsetY: number, corner: { x: number; y: number }): number {
  if (isHexGridType(gridType)) return distanceToGrid(gridType, cellSize, offsetX, offsetY, corner);
  return Math.hypot(wrapToGrid(corner.x, offsetX, cellSize), wrapToGrid(corner.y, offsetY, cellSize));
}

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

/** Corners of the true grid (drawn on the squared-up image) spread over a map of `width` × `height` image pixels. */
function trueCorners(gridType: GridType, cellSize: number, offsetX: number, offsetY: number, width: number, height: number, aspect: number): Array<{ x: number; y: number }> {
  return [[0.05, 0.05], [0.95, 0.05], [0.05, 0.95], [0.95, 0.95], [0.5, 0.5]].map(([fx, fy]) => {
    const near = { x: fx! * width, y: (fy! * height) / aspect };
    if (isHexGridType(gridType)) {
      const truth = createHexLayout(gridType, cellSize, offsetX, offsetY);
      return hexVertices(truth, axialToPixel(truth, pixelToAxial(truth, near)))[0]!;
    }
    return {
      x: offsetX + Math.round((near.x - offsetX) / cellSize) * cellSize,
      y: offsetY + Math.round((near.y - offsetY) / cellSize) * cellSize,
    };
  });
}

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

/**
 * A map as hex map makers print them: white paper, pale grid lines of `lineWidth`, and in every cell
 * a black terrain icon that reaches across the cell's upper edges. Drawn on the squared-up image and
 * printed with `aspect`.
 */
function printedMap(gridType: GridType, cellSize: number, width: number, height: number, { aspect = 1, lineWidth = 2, icons = false, rotation = 0 }): GrayImage {
  const data = new Float32Array(width * height).fill(250);
  const [cos, sin] = [Math.cos(rotation), Math.sin(rotation)];
  // A point of the level, regular drawing on the image: rows `aspect` times further apart, then turned about the centre.
  const plot = (x: number, y: number, shade: number): void => {
    const qx = x - width / 2;
    const qy = y * aspect - height / 2;
    const px = Math.round(width / 2 + cos * qx - sin * qy);
    const py = Math.round(height / 2 + sin * qx + cos * qy);
    if (px >= 0 && py >= 0 && px < width && py < height) data[py * width + px] = Math.min(data[py * width + px]!, shade);
  };
  const pad = cellSize + Math.abs(sin) * Math.max(width, height);
  const bounds = { minX: -pad, minY: -pad, maxX: width + pad, maxY: height / aspect + pad };
  for (const s of gridLineSamples(gridType, cellSize, 11.3, 7.9, bounds, 0.5)) {
    for (let t = -lineWidth / 2; t <= lineWidth / 2; t += 0.5) plot(s.x + s.nx * t, s.y + s.ny * t, 195);
  }
  if (icons && isHexGridType(gridType)) {
    const layout = createHexLayout(gridType, cellSize, 11.3, 7.9);
    for (let q = -20; q <= 40; q++) {
      for (let r = -20; r <= 40; r++) {
        const centre = axialToPixel(layout, { q, r });
        if (centre.x < -cellSize || centre.y < -cellSize || centre.x > width + cellSize || centre.y > height / aspect + cellSize) continue;
        // Blades fanning up from the middle of the hex, past its upper edges, as a grass icon does.
        for (const lean of [-0.7, -0.35, 0, 0.35, 0.7]) {
          for (let t = 0; t <= 0.68 * cellSize; t += 0.5) {
            for (let w = -0.05 * cellSize; w <= 0.05 * cellSize; w += 0.5) plot(centre.x + lean * t + w, centre.y + 0.12 * cellSize - t, 0);
          }
        }
      }
    }
  }
  return { width, height, data };
}

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

/** A grid as a program draws it: flat paper and lines one pixel wide, every one alike, rows `aspect` times further apart. */
function drawnGrid(cellSize: number, aspect: number, width: number, height: number, ink = 205): GrayImage {
  const data = new Float32Array(width * height).fill(235);
  for (let x = 13; x < width; x += cellSize) for (let y = 0; y < height; y++) data[y * width + Math.round(x)] = ink;
  for (let y = 9; y < height; y += cellSize * aspect) for (let x = 0; x < width; x++) data[Math.round(y) * width + x] = ink;
  return { width, height, data };
}

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

  it('fits a measurement to cells that are rectangles', () => {
    const [width, height] = [2000, 1500];
    const snapped = snapGridToMapGray({ image: drawnGrid(80, 1.03, width, height), size: { width, height } }, [{ gridType: 'square', cellSize: 76, offsetX: 0, offsetY: 0 }])!;

    expect(snapped.mapStretch).toEqual({ x: expect.closeTo(1.03, 3), y: 1 });
    expect(snapped.cellSize).toBeCloseTo(82.4, 1);
    expect(snapped.confidence).toBeGreaterThan(0.9);
  }, 60000);

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
