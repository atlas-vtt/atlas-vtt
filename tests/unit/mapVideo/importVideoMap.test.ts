import { TFile, type App } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { importVideoMap, videoMapRefusal, type VideoMapImportDeps } from '../../../src/app/import/videoMaps/importVideoMap';
import { MAX_VIDEO_MAP_BYTES } from '../../../src/app/pixi/mapImage/video/videoMapFiles';
import type { NewAsset } from '../../../src/app/services/AssetService';

vi.mock('../../../src/app/pixi/mapImage/prebuildMapImage', () => ({ prebuildMapImageAt: vi.fn() }));

const BYTES = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4]);

interface Fixture {
  deps: VideoMapImportDeps;
  written: Map<string, Uint8Array>;
  added: NewAsset[];
  trashed: string[];
}

function fixture(options: { playable?: boolean; collection?: boolean; addFails?: boolean } = {}): Fixture {
  const written = new Map<string, Uint8Array>();
  const added: NewAsset[] = [];
  const trashed: string[] = [];
  const app = {
    vault: {
      getAbstractFileByPath: (path: string) => (written.has(path) || path === 'atlas-vtt/assets' ? Object.assign(new TFile(), { path }) : null),
      createFolder: async () => undefined,
      createBinary: async (path: string, data: ArrayBuffer) => {
        written.set(path, new Uint8Array(data.slice(0)));
      },
    },
    fileManager: { trashFile: async (file: { path: string }) => { trashed.push(file.path); written.delete(file.path); } },
  } as unknown as App;
  return {
    written,
    added,
    trashed,
    deps: {
      app,
      assetService: {
        getCollection: async (id) => (options.collection === false ? null : { id, name: id } as never),
        addAssets: async (assets) => {
          if (options.addFails) throw new Error('index locked');
          added.push(...assets);
          return [];
        },
      },
      thumbnails: { tryThumbnailForImage: async (path) => `atlas-vtt/assets/thumbnails/${path.split('/').pop()}.webp` },
      poster: async () => {
        if (options.playable === false) throw new Error('no decoder');
        return new Blob(['poster'], { type: 'image/png' });
      },
      thumbnail: async () => new Blob(['thumbnail'], { type: 'image/webp' }),
    },
  };
}

describe('which files may become animated maps', () => {
  it('takes WebM, MP4 and M4V videos, whatever their names are cased', () => {
    expect(videoMapRefusal({ name: 'River.webm', size: 1 })).toBeNull();
    expect(videoMapRefusal({ name: 'Lava.MP4', size: 1 })).toBeNull();
    expect(videoMapRefusal({ name: 'Rain.m4v', size: 1 })).toBeNull();
  });

  it('refuses other files and videos larger than the limit', () => {
    expect(videoMapRefusal({ name: 'River.mov', size: 1 })).toMatch(/WebM and MP4/);
    expect(videoMapRefusal({ name: 'River.webm.png', size: 1 })).toMatch(/WebM and MP4/);
    expect(videoMapRefusal({ name: 'River.webm', size: MAX_VIDEO_MAP_BYTES })).toBeNull();
    expect(videoMapRefusal({ name: 'River.webm', size: MAX_VIDEO_MAP_BYTES + 1 })).toMatch(/larger than/);
  });
});

describe('importing a video as an animated map', () => {
  let file: File;
  beforeEach(() => {
    file = new File([BYTES], 'Flooded Crypt.webm', { type: 'video/webm' });
    // jsdom's files cannot be read.
    Object.defineProperty(file, 'arrayBuffer', { value: async () => BYTES.slice().buffer });
  });

  it('stores the video byte for byte under its own extension, with a thumbnail of its poster', async () => {
    const run = fixture();
    const result = await importVideoMap(run.deps, file, 'Dungeons');
    expect(result).toEqual({ ok: true, name: 'Flooded Crypt' });
    const [path, data] = [...run.written][0]!;
    expect(path).toMatch(/^atlas-vtt\/assets\/Flooded_Crypt_.*\.webm$/);
    expect(Array.from(data)).toEqual(Array.from(BYTES));
    expect(run.added).toEqual([{ type: 'map', name: 'Flooded Crypt', mapFilePath: path, collection: 'Dungeons', tags: [], thumbnailPath: expect.stringContaining('thumbnails/') }]);
  });

  it('stores nothing for a video that cannot be played here', async () => {
    const run = fixture({ playable: false });
    const result = await importVideoMap(run.deps, file, 'Dungeons');
    expect(result.ok).toBe(false);
    expect(run.written.size).toBe(0);
    expect(run.added).toEqual([]);
  });

  it('stores nothing when the collection is gone', async () => {
    const run = fixture({ collection: false });
    expect((await importVideoMap(run.deps, file, 'Dungeons')).ok).toBe(false);
    expect(run.written.size).toBe(0);
  });

  it('takes its file back when the map cannot be recorded', async () => {
    const run = fixture({ addFails: true });
    const result = await importVideoMap(run.deps, file, 'Dungeons');
    expect(result).toEqual({ ok: false, problem: expect.stringContaining('index locked') });
    expect(run.written.size).toBe(0);
    expect(run.trashed).toHaveLength(1);
  });
});
