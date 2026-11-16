import { afterAll, describe, expect, it } from 'vitest';
import { dungeonWalls } from '../../src/app/dungeons/scene/toWalls';
import { DEFAULT_VIEW } from '../../src/app/dungeons/style';
import { dungeonStyle } from '../../src/app/dungeons/styleCatalog';
import { DungeonWorkerClient } from '../../src/app/dungeons/worker/DungeonWorkerClient';
import DungeonWorker from '../../src/app/dungeons/worker/dungeonWorker?worker&inline';
import type { DungeonJob } from '../../src/app/dungeons/worker/dungeonJob';
import { imageDimensions } from '../../src/app/imageProcessing/imageDimensions';

/** The real worker, end to end: generation, drawing and the image it hands back. */

const STYLE = dungeonStyle('parchment');

const client = new DungeonWorkerClient({
  createWorker: () => new DungeonWorker({ name: 'Atlas dungeons (test)' }),
});

afterAll(() => client.dispose());

const job = (output: DungeonJob['output'], seed = 7): DungeonJob => ({ request: { seed, tags: ['medium'], floors: 1 }, style: STYLE, view: DEFAULT_VIEW, output });

describe('the dungeon worker', () => {
  it('generates a dungeon and draws its floor plan as a PNG of the map layout\'s size', async () => {
    const result = await client.render(job({ kind: 'map', pxPerCell: 60 }));

    expect(result.model.seed).toBe(7);
    expect(result.model.floors[0]!.rooms.length).toBeGreaterThan(3);
    expect(result.image.type).toBe('png');
    if (result.image.type !== 'png') throw new Error('No map');
    expect(await imageDimensions(result.image.blob)).toEqual({ width: result.map.widthPx, height: result.map.heightPx });
    expect(result.map.pxPerCell).toBe(60);
    const walls = dungeonWalls(result.model, STYLE, DEFAULT_VIEW, result.map);
    expect(Object.keys(walls.walls).length).toBeGreaterThan(10);
  });

  it('draws the same dungeon for the same seed', async () => {
    const [a, b] = await Promise.all([client.render(job({ kind: 'map', pxPerCell: 20 })), client.render(job({ kind: 'map', pxPerCell: 20 }))]);
    if (a.image.type !== 'png' || b.image.type !== 'png') throw new Error('No PNG');
    expect(a.model).toEqual(b.model);
    expect(new Uint8Array(await a.image.blob.arrayBuffer())).toEqual(new Uint8Array(await b.image.blob.arrayBuffer()));
  });

  it('fits the map into a preview, and answers only the latest of several previews', async () => {
    const stale = client.preview(job({ kind: 'preview', width: 700, height: 500 }, 1));
    const latest = client.preview(job({ kind: 'preview', width: 700, height: 500 }, 2));

    const result = await latest;
    expect(await stale).toBeNull();
    if (!result || result.image.type !== 'bitmap') throw new Error('No bitmap');
    const { width, height } = result.image.bitmap;
    expect(width).toBeLessThanOrEqual(700);
    expect(height).toBeLessThanOrEqual(500);
    expect(Math.max(width / 700, height / 500)).toBeGreaterThan(0.99);
    expect([width, height]).toEqual([result.map.widthPx, result.map.heightPx]);
    expect(result.model.seed).toBe(2);
    result.image.bitmap.close();
  });

  it('leaves the paper out of a map asked for transparent', async () => {
    const alphaAtCorner = async (transparent: boolean): Promise<number> => {
      const result = await client.render(job({ kind: 'map', pxPerCell: 20, transparent }));
      if (result.image.type !== 'png') throw new Error('No PNG');
      const bitmap = await createImageBitmap(result.image.blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      return ctx.getImageData(0, 0, 1, 1).data[3]!;
    };
    expect(await alphaAtCorner(true)).toBe(0);
    expect(await alphaAtCorner(false)).toBe(255);
  });

  it('draws a map as SVG, without text', async () => {
    const result = await client.render(job({ kind: 'map', pxPerCell: 30, svg: true }));
    if (result.image.type !== 'svg') throw new Error('No SVG');
    expect(result.image.svg.startsWith('<svg')).toBe(true);
    expect(result.image.svg).not.toContain('<text');
    expect(result.image.svg).toContain(`width="${result.map.widthPx}"`);
  });
});
