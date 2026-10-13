import { afterAll, describe, expect, it } from 'vitest';
import type { GridType } from '../../src/app/grid/GridSystem';
import type { GridPath } from '../../src/app/grid/gridLineStyle';
import { createHexLayout } from '../../src/app/grid/hexGeometry';
import { drawHexGrid } from '../../src/app/grid/hexGridDrawer';
import { drawSquareGrid } from '../../src/app/grid/squareGridDrawer';
import { detectGridFromMapImage, detectGridInMapGray, MAX_ANALYSIS_SIDE } from '../../src/app/pixi/gridDetection/detectGrid';
import { grayFromCanvasSource } from '../../src/app/pixi/gridDetection/grayImage';
import { tileDatabaseName } from '../../src/app/pixi/mapImage/indexedDbTileBackend';
import { decoderTiles } from '../../src/app/pixi/mapImage/mapImageTiles';
import { TileDecoderClient } from '../../src/app/pixi/mapImage/TileDecoderClient';
import { workerPort } from '../../src/app/pixi/mapImage/tilePorts';
import TileWorker from '../../src/app/pixi/mapImage/tileWorker?worker&inline';

/**
 * Grid auto-detect reads the map through `MapImage.overview`, composed in the tile worker from the
 * cached pyramid, where it once drew the whole texture into a canvas. Both must find the same grid.
 */

const APP_ID = `grid-detect-overview-test-${Date.now()}`;

interface GridCase {
  type: GridType;
  width: number;
  height: number;
  size: number;
  offsetX: number;
  offsetY: number;
  /** Prints the grid with its rows this many times further apart; a regular grid without. */
  aspect?: number;
}

/** Deterministic pseudo-random numbers, so the maps are the same on every run. */
function rng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** A parchment-like map with blotches and a thin dark grid drawn by the real drawers. */
function drawMap({ type, width, height, size, offsetX, offsetY, aspect = 1 }: GridCase): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#c8b890';
  ctx.fillRect(0, 0, width, height);
  const random = rng(3);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `hsl(${30 + random() * 40} 30% ${30 + random() * 50}%)`;
    ctx.beginPath();
    ctx.arc(random() * width, random() * height, 40 + random() * 300, 0, Math.PI * 2);
    ctx.fill();
  }
  const path: GridPath = {
    moveTo: (x, y) => (ctx.moveTo(x, y), path),
    lineTo: (x, y) => (ctx.lineTo(x, y), path),
    poly: () => path,
  };
  const bounds = { minX: 0, minY: 0, maxX: width, maxY: height / aspect };
  ctx.beginPath();
  ctx.save();
  ctx.scale(1, aspect);
  if (type === 'square') drawSquareGrid(path, bounds, size, offsetX, offsetY, 'solid');
  else drawHexGrid(path, bounds, createHexLayout(type, size, offsetX, offsetY), 'solid');
  ctx.restore();
  ctx.strokeStyle = '#302820';
  ctx.lineWidth = 3;
  ctx.stroke();
  return canvas;
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = (): void => resolve();
    request.onerror = (): void => resolve();
    request.onblocked = (): void => resolve();
  });
}

describe('grid auto-detect through the map image overview', () => {
  const client = new TileDecoderClient({
    appId: APP_ID,
    worker: workerPort(() => new TileWorker({ name: 'grid detect overview test' })),
    inThread: () => {
      throw new Error('The worker should have started.');
    },
  });

  afterAll(async () => {
    client.dispose();
    await deleteDatabase(tileDatabaseName(APP_ID));
  });

  const cases: GridCase[] = [
    // Larger than the analysis side: both paths scale the map down to 4096 px.
    { type: 'square', width: 6000, height: 4000, size: 97.3, offsetX: 31.4, offsetY: 58.2 },
    // Smaller: both read it at its own size.
    { type: 'hex-vertical', width: 3000, height: 2200, size: 88.6, offsetX: 17.5, offsetY: 40.3 },
    // Hexes printed 5 % too tall: the grid comes with the stretch that makes them regular.
    { type: 'hex-vertical', width: 2400, height: 3000, size: 88.6, offsetX: 17.5, offsetY: 40.3, aspect: 1.05 },
  ];

  for (const grid of cases) {
    it(`finds the grid the whole texture gave: ${grid.type}, ${grid.width} × ${grid.height}`, async () => {
      const source = drawMap(grid);
      const imageSize = { width: grid.width, height: grid.height };

      // The way detection read a map before tiles: the whole image drawn into a canvas.
      const direct = grayFromCanvasSource(source, grid.width, grid.height, MAX_ANALYSIS_SIDE)!;
      const before = detectGridInMapGray(direct, imageSize);

      const png = await (await source.convertToBlob({ type: 'image/png' })).arrayBuffer();
      const identity = { path: `maps/${grid.type}.png`, size: png.byteLength, mtime: grid.width };
      const complete = new Promise<void>((resolve) => client.onPyramidComplete(() => resolve()));
      const opened = await client.open(() => Promise.resolve(png.slice(0)), identity);
      await complete;
      const tiles = decoderTiles(client, opened);
      const sizes: Array<[number, number]> = [];
      const after = await detectGridFromMapImage({
        worldRect: { x: 0, y: 0, ...imageSize },
        imageSize,
        overview: async (maxSide) => {
          const bitmap = await tiles.overview(maxSide);
          sizes.push([bitmap.width, bitmap.height]);
          return bitmap;
        },
      });
      tiles.close();

      expect(sizes).toEqual([[direct.width, direct.height]]);
      const aspect = grid.aspect ?? 1;
      expect(before).toMatchObject({ gridType: grid.type, cellSize: expect.closeTo(grid.size * aspect, 0) });
      if (grid.aspect) expect(before!.mapStretch).toEqual({ x: expect.closeTo(aspect, 3), y: 1 });
      else expect(before).not.toHaveProperty('mapStretch');
      // Cached tiles are WebP at quality 0.9, so a map read at its own size may move an offset by a few hundredths.
      expect({ ...after, offsetX: 0, offsetY: 0 }).toEqual({ ...before, offsetX: 0, offsetY: 0 });
      expect(Math.abs(after!.offsetX - before!.offsetX)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(after!.offsetY - before!.offsetY)).toBeLessThanOrEqual(0.1);
    }, 60_000);
  }
});
