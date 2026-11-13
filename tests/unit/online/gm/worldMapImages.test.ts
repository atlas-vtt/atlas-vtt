import { describe, expect, it } from 'vitest';
import { WorldMaps, type MapForm } from '../../../../src/app/online/gm/book/worldMap.ts';
import type { AssetStoring, MapStanding } from '../../../../src/app/online/gm/assets/assetUses.ts';
import type { AssetRef } from '../../../../src/app/online/protocol/index.ts';
import { NO_STRETCH } from '../../../../src/app/grid/mapStretch';
import { fakeStoring } from './fakeStoring.ts';
import { png } from './fakeTable.ts';

const PATH = 'Maps/World.png';
const bytes = png(4000, 3000);

/** A store that makes a pyramid of every map (`pyramids`), or none, noting how each was asked for and what was let go of. */
function storing(pyramids: boolean): { readonly store: AssetStoring; readonly standings: (MapStanding | undefined)[]; readonly released: AssetRef[] } {
  const released: AssetRef[] = [];
  const standings: (MapStanding | undefined)[] = [];
  const base = fakeStoring(() => false, () => undefined, (ref) => released.push(ref));
  const store: AssetStoring = {
    ...base,
    mapRef: async (image, mime, _path, standing) => {
      standings.push(standing);
      const ref = (await base.refOf(image, mime, { kind: 'image', rank: 0 }))!;
      return pyramids ? { ...ref, id: ref.id.replace(/^./, 'f'), tiles: true } : ref;
    },
  };
  return { store, standings, released };
}

async function read(maps: WorldMaps, form: MapForm): Promise<AssetRef | undefined> {
  for (let round = 0; round < 5 && maps.get(form) === undefined; round += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  return maps.get(form)?.map.image;
}

function worldMaps(store: AssetStoring): WorldMaps {
  return new WorldMaps({
    stat: () => ({ mtime: 1, size: bytes.length }),
    readImage: () => Promise.resolve({ bytes, mime: 'image/png' }),
    source: () => Promise.resolve({ root: 'world', levels: [{ key: 'world', title: 'World', image: PATH, stretch: NO_STRETCH, entrances: [] }] }),
    read: () => undefined,
    stored: store,
  });
}

/** The world map goes as the table's map does, its tile pyramid in its turn after the table's maps; an image of it is made only for a page that draws none. */
describe('the world map\'s image as players are handed it', () => {
  it('is its tile pyramid, published as a map of the book, and an image only where a page asks for one', async () => {
    const { store, standings } = storing(true);
    const maps = worldMaps(store);
    expect(await read(maps, 'tiles')).toMatchObject({ tiles: true });
    expect(standings).toEqual(['book']);
    const image = await read(maps, 'whole');
    expect(image?.tiles).toBeUndefined();
    expect(standings).toEqual(['book']);
  });

  it('lets go of the image once no page holds it, never of a pyramid that is the image itself', async () => {
    const tiled = storing(true);
    const maps = worldMaps(tiled.store);
    await read(maps, 'tiles');
    const image = await read(maps, 'whole');
    maps.releaseWhole();
    expect(tiled.released).toEqual([image]);
    expect(await read(maps, 'whole')).toEqual(image);

    const plain = storing(false);
    const untiled = worldMaps(plain.store);
    expect(await read(untiled, 'tiles')).toEqual(await read(untiled, 'whole'));
    untiled.releaseWhole();
    expect(plain.released).toEqual([]);
  });
});
