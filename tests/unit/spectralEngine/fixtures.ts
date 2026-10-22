import { gridLineSamples } from '../../../src/app/pixi/spectralEngine/gridTemplate';
import type { GrayImage } from '../../../src/app/pixi/spectralEngine/grayImage';
import type { GridType } from '../../../src/app/grid/GridSystem';
import { axialToPixel, createHexLayout, hexVertices, isHexGridType, pixelToAxial } from '../../../src/app/grid/hexGeometry';

/** Deterministic pseudo-random numbers so the synthetic maps are reproducible. */
export function rng(seed: number): () => number {
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
export function syntheticMap(gridType: GridType, cellSize: number, offsetX: number, offsetY: number, width: number, height: number, aspect = 1): GrayImage {
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
export function wrapToGrid(value: number, offset: number, cellSize: number): number {
  const m = (((value - offset) % cellSize) + cellSize) % cellSize;
  return Math.min(m, cellSize - m);
}

/** Distance from `point` to the nearest line of the grid described by the detection. */
export function distanceToGrid(gridType: GridType, cellSize: number, offsetX: number, offsetY: number, point: { x: number; y: number }): number {
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
export function difficultMap(gridType: GridType, cellSize: number, offsetX: number, offsetY: number, width: number, height: number, withGrid = true): GrayImage {
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
export function cornerError(gridType: GridType, cellSize: number, offsetX: number, offsetY: number, corner: { x: number; y: number }): number {
  if (isHexGridType(gridType)) return distanceToGrid(gridType, cellSize, offsetX, offsetY, corner);
  return Math.hypot(wrapToGrid(corner.x, offsetX, cellSize), wrapToGrid(corner.y, offsetY, cellSize));
}

/** Corners of the true grid (drawn on the squared-up image) spread over a map of `width` × `height` image pixels. */
export function trueCorners(gridType: GridType, cellSize: number, offsetX: number, offsetY: number, width: number, height: number, aspect: number): Array<{ x: number; y: number }> {
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

/**
 * A map as hex map makers print them: white paper, pale grid lines of `lineWidth`, and in every cell
 * a black terrain icon that reaches across the cell's upper edges. Drawn on the squared-up image and
 * printed with `aspect`.
 */
export function printedMap(gridType: GridType, cellSize: number, width: number, height: number, { aspect = 1, lineWidth = 2, icons = false, rotation = 0 }): GrayImage {
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

/** A grid as a program draws it: flat paper and lines one pixel wide, every one alike, rows `aspect` times further apart. */
export function drawnGrid(cellSize: number, aspect: number, width: number, height: number, ink = 205): GrayImage {
  const data = new Float32Array(width * height).fill(235);
  for (let x = 13; x < width; x += cellSize) for (let y = 0; y < height; y++) data[y * width + Math.round(x)] = ink;
  for (let y = 9; y < height; y += cellSize * aspect) for (let x = 0; x < width; x++) data[Math.round(y) * width + x] = ink;
  return { width, height, data };
}
