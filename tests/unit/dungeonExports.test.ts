import { describe, expect, it, vi } from 'vitest';
import { TFolder, type App } from 'obsidian';
import { generateDungeon } from '../../src/app/dungeons/generate';
import { DEFAULT_VIEW } from '../../src/app/dungeons/style';
import { dungeonStyle } from '../../src/app/dungeons/styleCatalog';
import { mapLayout } from '../../src/app/dungeons/render/layoutSize';
import type { DungeonJob, DungeonRendered } from '../../src/app/dungeons/worker/dungeonJob';
import { saveDungeonExport, type DungeonExportKind } from '../../src/app/packages/components/dungeon-generator/dungeonExports';

const request = { seed: 7, tags: [], floors: 1 };
const model = generateDungeon(request);

/** A vault that holds one folder and records what is written. */
function vault(): { app: App; written: Map<string, string | ArrayBuffer> } {
  const written = new Map<string, string | ArrayBuffer>();
  const folder = new TFolder('atlas-vtt/collections/Dungeons/dungeon-exports');
  const app = {
    vault: {
      getAbstractFileByPath: (path: string) => (path === folder.path ? folder : null),
      getFolderByPath: (path: string) => (path === folder.path ? folder : null),
      createFolder: vi.fn(),
      create: vi.fn(async (path: string, text: string) => { written.set(path, text); }),
      createBinary: vi.fn(async (path: string, bytes: ArrayBuffer) => { written.set(path, bytes); }),
    },
  } as unknown as App;
  return { app, written };
}

async function save(kind: DungeonExportKind, extra: { pxPerCell?: number; transparent?: boolean; name?: string; floor?: number; model?: typeof model } = {}): Promise<{ job: DungeonJob | undefined; path: string; written: Map<string, string | ArrayBuffer> }> {
  const { app, written } = vault();
  let job: DungeonJob | undefined;
  const render = (asked: DungeonJob): Promise<DungeonRendered> => {
    job = asked;
    const image = asked.output.kind === 'map' && asked.output.svg ? { type: 'svg' as const, svg: '<svg/>' } : { type: 'png' as const, blob: new Blob(['png']) };
    return Promise.resolve({ model, map: mapLayout(model, 30), image });
  };
  const path = await saveDungeonExport({ app, render }, kind, { request, model: extra.model ?? model, style: dungeonStyle('parchment'), view: DEFAULT_VIEW, collectionId: 'Dungeons', ...extra });
  return { job, path, written };
}

describe('saving a dungeon', () => {
  it('saves the map as an SVG document, named as the GM named the dungeon', async () => {
    const { job, path, written } = await save('svg', { name: 'Grey Vault' });
    expect(job?.output).toMatchObject({ kind: 'map', svg: true });
    expect(path).toBe('atlas-vtt/collections/Dungeons/dungeon-exports/Grey Vault.svg');
    expect(written.get(path)).toBe('<svg/>');
  });

  it('saves the map without the paper when asked', async () => {
    expect((await save('map', { pxPerCell: 40, transparent: true })).job?.output).toEqual({ kind: 'map', pxPerCell: 40, transparent: true });
    expect((await save('map', { pxPerCell: 40, transparent: false })).job?.output).toEqual({ kind: 'map', pxPerCell: 40 });
  });

  it('draws the floor shown, named for it where the dungeon has several', async () => {
    const floors = generateDungeon({ seed: 7, tags: [], floors: 2 });
    const png = await save('map', { name: 'Grey Vault', model: floors, floor: 1, pxPerCell: 40 });
    expect(png.job?.output).toEqual({ kind: 'map', pxPerCell: 40, floor: 1 });
    expect(png.path).toBe('atlas-vtt/collections/Dungeons/dungeon-exports/Grey Vault, Floor B.png');
    const svg = await save('svg', { name: 'Grey Vault', model: floors, floor: 0 });
    expect(svg.path).toBe('atlas-vtt/collections/Dungeons/dungeon-exports/Grey Vault, Floor A.svg');
    // One floor needs no letter
    expect((await save('svg', { name: 'Grey Vault' })).path).toBe('atlas-vtt/collections/Dungeons/dungeon-exports/Grey Vault.svg');
  });

  it('saves every floor of the model as JSON, whichever floor is shown', async () => {
    const floors = generateDungeon({ seed: 7, tags: [], floors: 3 });
    const { path, written } = await save('json', { name: 'Grey Vault', model: floors, floor: 2 });
    expect(path).toBe('atlas-vtt/collections/Dungeons/dungeon-exports/Grey Vault.json');
    expect(JSON.parse(written.get(path) as string)).toEqual(JSON.parse(JSON.stringify(floors)));
  });
});
