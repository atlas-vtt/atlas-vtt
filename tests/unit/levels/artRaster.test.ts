import { describe, expect, it } from 'vitest';
import { NO_STRETCH, worldToImage, type MapStretch } from '../../../src/app/grid/mapStretch';
import { artCells, type ArtAlpha, type LevelArt } from '../../../src/app/levels/artRaster';
import { stackGrid } from '../../../src/app/levels/levelStack';

/** A seeded random number in [0, 1). */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** An overview of `width` × `height` whose pixels hold art where `art` says so. */
function alphaOf(width: number, height: number, art: (x: number, y: number) => boolean): ArtAlpha {
  const opaque = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) opaque[y * width + x] = art(x, y) ? 1 : 0;
  return { width, height, opaque };
}

/** Round transparent blobs in opaque art. */
function blobs(rand: () => number, width: number, height: number): ArtAlpha {
  const holes = Array.from({ length: 3 + Math.floor(rand() * 4) }, () => ({ x: rand() * width, y: rand() * height, r: 3 + rand() * width * 0.2 }));
  return alphaOf(width, height, (x, y) => !holes.some((hole) => Math.hypot(x + 0.5 - hole.x, y + 0.5 - hole.y) < hole.r));
}

describe('a level\'s map on the stack\'s grid', () => {
  const grid = stackGrid({ width: 100, height: 100 });

  it('opens a transparent square less one texel all round, and nothing of the art', () => {
    const alpha = alphaOf(100, 100, (x, y) => !(x >= 20 && x < 60 && y >= 30 && y < 50));
    const { open, box } = artCells({ width: 100, height: 100, alpha }, NO_STRETCH, true, grid);
    // Texels 20 and 59 touch art at their outer edge (a square touches the pixels its edges lie on), 21 and 58 lie next to them.
    expect(box).toEqual({ x: 22, y: 32, columns: 36, rows: 16 });
    expect(open.reduce((sum, value) => sum + value, 0)).toBe(36 * 16);
  });

  it('opens everything outside the image, and nothing of an image whose transparency is unknown or not looked at', () => {
    const art: LevelArt = { width: 50, height: 40, alpha: alphaOf(50, 40, () => false) };
    const placed: MapStretch = { x: 1, y: 1, offset: { x: 10, y: 20 } };
    const known = artCells(art, placed, true, grid);
    expect(known.box).toEqual({ x: 0, y: 0, columns: 100, rows: 100 });
    for (const cells of [artCells({ ...art, alpha: null }, placed, true, grid), artCells(art, placed, false, grid)]) {
      // Every texel the image touches is floor, including the texels its edges lie on.
      for (let row = 0; row < 100; row++) {
        for (let column = 0; column < 100; column++) {
          const onImage = column >= 9 && column <= 60 && row >= 19 && row <= 60;
          expect(cells.open[row * 100 + column], `${column},${row}`).toBe(onImage ? 0 : 1);
        }
      }
    }
  });

  it('works out an area alone as the whole grid has it, and reads the rest as art', () => {
    const alpha = blobs(rng(3), 90, 70);
    const placement: MapStretch = { x: 1.2, y: 1.1, rotation: 2, offset: { x: 4, y: 7 } };
    const whole = artCells({ width: 90, height: 70, alpha }, placement, true, grid);
    const area = { x: 17, y: 9, columns: 40, rows: 33 };
    const part = artCells({ width: 90, height: 70, alpha }, placement, true, grid, area);
    for (let row = 0; row < 100; row++) {
      for (let column = 0; column < 100; column++) {
        const inArea = column >= area.x && column < area.x + area.columns && row >= area.y && row < area.y + area.rows;
        expect(part.open[row * 100 + column], `${column},${row}`).toBe(inArea ? whole.open[row * 100 + column] : 0);
      }
    }
  });

  it('closes a transparent line one texel wide', () => {
    const alpha = alphaOf(100, 100, (x) => x !== 50);
    expect(artCells({ width: 100, height: 100, alpha }, NO_STRETCH, true, grid).box).toBeNull();
  });

  it('opens a texel only where no pixel its square touches holds art, nor any its neighbours\' squares touch, on stretched and turned images', () => {
    const rand = rng(5);
    let opened = 0;
    for (let trial = 0; trial < 24; trial++) {
      const side = 30 + Math.floor(rand() * 50);
      const size = { width: side * 2, height: Math.round(side * 1.5) };
      // The overview is the image fit within a side of at most `side` pixels, as the worker reads it.
      const scale = side / Math.max(size.width, size.height);
      const alpha = blobs(rand, Math.round(size.width * scale), Math.round(size.height * scale));
      const placement: MapStretch = {
        x: (0.5 + rand()) * (trial % 2 ? 1.3 : 1), y: 0.5 + rand(),
        ...(trial % 3 === 0 && { rotation: (rand() - 0.5) * 10 }),
        ...(trial % 4 === 1 && { offset: { x: rand() * 30, y: rand() * 30 } }),
      };
      const texelGrid = stackGrid({ width: 80 + rand() * 60, height: 80 + rand() * 60 });
      const { open } = artCells({ ...size, alpha }, placement, true, texelGrid);
      const { columns, rows, texel } = texelGrid;
      const artAt = (wx: number, wy: number): boolean => {
        const p = worldToImage({ x: wx, y: wy }, size, placement);
        const [u, v] = [Math.floor((p.x * alpha.width) / size.width), Math.floor((p.y * alpha.height) / size.height)];
        return u >= 0 && v >= 0 && u < alpha.width && v < alpha.height && alpha.opaque[v * alpha.width + u] === 1;
      };
      // Whether art lies in a texel's closed square, sampled finely.
      const hasArt = new Uint8Array(columns * rows);
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          let found = false;
          for (let sy = 0; sy <= 8 && !found; sy++) for (let sx = 0; sx <= 8 && !found; sx++) found = artAt((column + sx / 8) * texel, (row + sy / 8) * texel);
          hasArt[row * columns + column] = found ? 1 : 0;
        }
      }
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          if (!open[row * columns + column]) continue;
          opened++;
          expect(hasArt[row * columns + column], `trial ${trial}: open texel ${column},${row} holds art`).toBe(0);
          // Outside the image a texel is open whatever lies beside it.
          if (outsideImage(texelGrid, column, row, size, placement)) continue;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const [c, r] = [column + dx, row + dy];
              if (c < 0 || r < 0 || c >= columns || r >= rows) continue;
              expect(hasArt[r * columns + c], `trial ${trial}: open texel ${column},${row} lies next to art at ${c},${r}`).toBe(0);
            }
          }
        }
      }
    }
    expect(opened).toBeGreaterThan(5000);
  });
});

/** Whether texel (`column`, `row`) lies wholly outside the image: then its open neighbours may touch art. */
function outsideImage(grid: { texel: number }, column: number, row: number, size: { width: number; height: number }, placement: MapStretch): boolean {
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
    const p = worldToImage({ x: (column + dx) * grid.texel, y: (row + dy) * grid.texel }, size, placement);
    if (p.x >= 0 && p.y >= 0 && p.x <= size.width && p.y <= size.height) return false;
  }
  return true;
}
