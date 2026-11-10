// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Menu, Notice, TFile, type Plugin } from 'obsidian';
import { AssetService } from '../../src/app/services/AssetService';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const spawning = vi.hoisted(() => ({ spawnTokenAsset: vi.fn(async () => ['t1']) }));
vi.mock('../../src/app/packages/components/asset-manager/utils/tokenSpawnService', () => spawning);
vi.mock('obsidian', async (importOriginal) => ({ ...(await importOriginal<typeof import('obsidian')>()), Notice: vi.fn() }));

import { addStatblockCombatant, registerStatblockInitiativeMenu } from '../../src/app/initiative/statblockCombatant';

const STATBLOCK = 'Bestiary/Goblin.md';

async function setup() {
  const vault = createInMemoryApp({ files: { [STATBLOCK]: '---\nstatblock: true\n---\n', 'Notes/Tavern.md': 'A tavern', 'art/goblin.webp': 'WEBP' } });
  const frontmatter: Record<string, Record<string, unknown>> = { [STATBLOCK]: { statblock: true } };
  vault.app.metadataCache.getFileCache = vi.fn((file: TFile) => (frontmatter[file.path] ? { frontmatter: frontmatter[file.path] } : null)) as never;
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  return { vault, assets };
}

beforeEach(() => {
  spawning.spawnTokenAsset.mockClear();
  vi.mocked(Notice).mockClear();
});

describe('adding a statblock\'s creature to initiative', () => {
  it('adds a copy of the library token that links the statblock, beside the map', async () => {
    const { vault, assets } = await setup();
    await assets.addTokenAsset({ name: 'Goblin', imagePath: 'art/goblin.webp', statblockPath: STATBLOCK, collection: 'Default', tags: [] });
    await addStatblockCombatant(vault.app, STATBLOCK);
    expect(spawning.spawnTokenAsset).toHaveBeenCalledWith(expect.objectContaining({ view: null, assetService: assets, random: expect.any(Function) }), expect.objectContaining({ type: 'tokens', name: 'Goblin' }), 1, 'beside');
  });

  it('says what is missing where no library token links it', async () => {
    const { vault } = await setup();
    await addStatblockCombatant(vault.app, 'Bestiary/Unlinked.md');
    expect(spawning.spawnTokenAsset).not.toHaveBeenCalled();
    expect(vi.mocked(Notice).mock.calls[0]?.[0]).toMatch(/No token in the library/);
  });

  it('is offered in the file menu of statblock notes only', async () => {
    const { vault } = await setup();
    let handler: ((menu: Menu, file: TFile) => void) | null = null;
    vault.app.workspace.on = vi.fn((name: string, callback: (menu: Menu, file: TFile) => void) => { if (name === 'file-menu') handler = callback; return {}; }) as never;
    registerStatblockInitiativeMenu({ app: vault.app, registerEvent: vi.fn() } as unknown as Plugin);
    const titles = (path: string): string[] => {
      const menu = new Menu();
      handler?.(menu, new TFile(path));
      return menu.items.map((item) => item.title);
    };
    expect(titles(STATBLOCK)).toEqual(['Add to initiative']);
    expect(titles('Notes/Tavern.md')).toEqual([]);
  });
});
