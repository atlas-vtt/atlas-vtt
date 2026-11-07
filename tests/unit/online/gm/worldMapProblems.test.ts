import { describe, expect, it } from 'vitest';
import { WORLD_MAP_PROBLEM_TEXT, WorldMaps, type FileStat } from '../../../../src/app/online/gm/book/worldMap.ts';
import type { WorldMapTree } from '../../../../src/app/online/gm/book/worldMapGate.ts';
import type { VaultImage } from '../../../../src/app/online/gm/TokenShare.ts';
import { ASSET_CAPS } from '../../../../src/app/online/protocol/index.ts';
import { fakeStoring } from './fakeStoring.ts';
import { NO_STRETCH } from '../../../../src/app/grid/mapStretch';

const tree = (image: string): WorldMapTree => ({ root: 'world', levels: [{ key: 'world', title: 'World', image, stretch: NO_STRETCH, entrances: [] }] });

/** A PNG's header naming its size, which is all the size is read from. */
function png(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

/** The world map of `image` read from `files`, once everything is read: what it is, and why it is none. */
async function read(image: string, files: Record<string, { stat: FileStat; image: VaultImage | null }>, stored = fakeStoring()): Promise<{ map: unknown; problem: unknown }> {
  const maps = new WorldMaps({
    stat: (path) => files[path]?.stat ?? null,
    readImage: (path) => Promise.resolve(files[path]?.image ?? null),
    source: () => Promise.resolve(tree(image)),
    read: () => undefined,
    stored,
  });
  for (let round = 0; round < 5 && maps.get() === undefined; round += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  return { map: maps.get(), problem: maps.problem() };
}

/**
 * The GM is told why players get no world map: its file is gone, too large, no image players can open
 * or not kept by the asset store. A world map players are sent has no problem.
 */
describe('a world map whose image cannot be sent', () => {
  const stat = (size: number): FileStat => ({ mtime: 1, size });

  it('says why: missing, too large, no image players can open, or not kept by the store', async () => {
    expect(await read('Maps/Gone.png', {})).toEqual({ map: null, problem: 'missing' });
    expect(await read('Maps/Huge.png', { 'Maps/Huge.png': { stat: stat(ASSET_CAPS.image + 1), image: null } })).toEqual({ map: null, problem: 'too-large' });
    expect(await read('Maps/World.svg', { 'Maps/World.svg': { stat: stat(10), image: null } })).toEqual({ map: null, problem: 'unreadable' });
    expect(await read('Maps/Broken.png', { 'Maps/Broken.png': { stat: stat(3), image: { bytes: new Uint8Array([1, 2, 3]), mime: 'image/png' } } })).toEqual({ map: null, problem: 'unreadable' });
    const shire = png(800, 600);
    expect(await read('Maps/Shire.png', { 'Maps/Shire.png': { stat: stat(shire.length), image: { bytes: shire, mime: 'image/png' } } }, fakeStoring(() => true))).toEqual({ map: null, problem: 'unstored' });
  });

  it('has none for an image players are sent, wherever in the vault it lies', async () => {
    const shire = png(8504, 6591);
    const { map, problem } = await read('Maps/Shire.png', { 'Maps/Shire.png': { stat: stat(shire.length), image: { bytes: shire, mime: 'image/png' } } });
    expect(map).toMatchObject({ map: { width: 8504, height: 6591 } });
    expect(problem).toBeNull();
  });

  it('has a sentence for every reason', () => {
    expect(Object.keys(WORLD_MAP_PROBLEM_TEXT).sort()).toEqual(['missing', 'too-large', 'unreadable', 'unstored']);
  });
});
