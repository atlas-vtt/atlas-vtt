import { afterEach, describe, expect, it } from 'vitest';
import type { App } from 'obsidian';
import { dungeonSceneThumbnail } from '../../src/app/dungeons/scene/sceneThumbnail';
import { dungeonStyle } from '../../src/app/dungeons/styleCatalog';
import { DEFAULT_DUNGEON_GENERATOR_SETTINGS } from '../../src/app/dungeons/generatorSettings';
import { DungeonWorkerClient } from '../../src/app/dungeons/worker/DungeonWorkerClient';
import { MAP_THUMBNAIL_SIZE } from '../../src/app/services/MapThumbnailService';

const app = {} as App;

describe('the thumbnail a new dungeon scene gets', () => {
  afterEach(() => DungeonWorkerClient.release(app));

  it('is a JPEG of the thumbnail’s size, drawn by the real worker and covering it with the map', async () => {
    const client = DungeonWorkerClient.forApp(app);
    const bytes = await dungeonSceneThumbnail((job) => client.render(job), {
      request: { seed: 7, tags: ['medium'], theme: 'fortress' },
      style: dungeonStyle(DEFAULT_DUNGEON_GENERATOR_SETTINGS.style),
      view: DEFAULT_DUNGEON_GENERATOR_SETTINGS.view,
    }, MAP_THUMBNAIL_SIZE);
    expect(bytes).not.toBeNull();
    const view = new Uint8Array(bytes!);
    expect([view[0], view[1]]).toEqual([0xff, 0xd8]);
    const bitmap = await createImageBitmap(new Blob([bytes!], { type: 'image/jpeg' }));
    expect([bitmap.width, bitmap.height]).toEqual([MAP_THUMBNAIL_SIZE.width, MAP_THUMBNAIL_SIZE.height]);
    // Not one flat colour: the map is on it, edge to edge
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const pixels = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const tones = new Set<number>();
    for (let i = 0; i < pixels.length; i += 4 * 97) tones.add((pixels[i]! >> 4) * 256 + (pixels[i + 1]! >> 4) * 16 + (pixels[i + 2]! >> 4));
    expect(tones.size).toBeGreaterThan(8);
    expect(pixels[3]).toBe(255);
  }, 60_000);
});
