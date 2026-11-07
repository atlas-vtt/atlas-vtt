// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { loadStatblockOverrides } from '../../src/app/packages/components/asset-manager/utils/statblockLoader';

import { TokenStatblockLinkService } from '../../src/app/services/TokenStatblockLinkService';
import { HP_RESOURCE, STRESS_RESOURCE } from '../../src/app/resources/resourceDefinitions';
import { startingResources } from '../../src/app/resources/statblockResourceValues';

const DEFINITIONS = [HP_RESOURCE, STRESS_RESOURCE];

const path = 'statblocks/Mage.md';
afterEach(() => { delete (window as Window & { FantasyStatblocks?: unknown }).FantasyStatblocks; });
describe('resource import', () => {
  it.each([{ hp: '27 (5d8 + 5)' }, { Health: { current: 12, max: 27 } }])('imports HP %j without replacing it with a token default', async (values) => {
    const { app } = createInMemoryApp({ files: { [path]: '' } });
    Object.assign(window, { FantasyStatblocks: { getBestiaryCreatures: () => [{ name: 'Mage', path, ...values }] } });
    const result = await loadStatblockOverrides(app, path, DEFINITIONS);
    expect(result.resources?.hp).toEqual({ current: 'Health' in values ? 12 : 27, max: 27 });
  });

  it('loads inline statblock resources as well as bestiary creatures', async () => {
    const { app } = createInMemoryApp({ files: { [path]: '```statblock\nname: Mage\nhp: 27\nstress: 3\n```' } });
    app.vault.cachedRead = app.vault.read;
    Object.assign(window, { FantasyStatblocks: { getBestiaryCreatures: () => [], hasCreature: () => false } });
    expect((await loadStatblockOverrides(app, path, DEFINITIONS)).resources).toEqual({ hp: { current: 27, max: 27 }, stress: { current: 0, max: 3 } });
  });
});


it('uses inline resources when assigning a statblock link to existing tokens', async () => {
  const { app } = createInMemoryApp({ files: { [path]: '```statblock\nname: Mage\nhp: "12/27"\nstress: 3\n```' } });
  app.vault.cachedRead = app.vault.read;
  Object.assign(window, { FantasyStatblocks: { getBestiaryCreatures: () => [], hasCreature: () => false } });
  const service = Object.assign(Object.create(TokenStatblockLinkService.prototype), { app });
  const data = await service.extractStatblockData(path);
  expect(startingResources(data.record, DEFINITIONS)).toEqual({ hp: { current: 12, max: 27 }, stress: { current: 0, max: 3 } });
});

describe('linking a statblock to the tokens of closed maps', () => {
  const mapPath = 'atlas-vtt/collections/Own/scenes/Cave.atlasmap';
  const mage = { id: 't1', kind: 'character', imagePath: 'mage.webp', x: 0, y: 0, hp: { current: 3, max: 9 }, stress: 4, maxStress: 6, maxHpOverridden: true, statblockResources: { mana: { current: 1, max: 8 } } };
  const other = { id: 't2', kind: 'character', imagePath: 'ogre.webp', x: 0, y: 0, hp: { current: 5, max: 5 } };

  const rewrite = async (statblockPath: string | null): Promise<Record<string, Record<string, unknown>>> => {
    const scene = JSON.stringify({ version: 4, state: { version: 4, objects: { tokens: { t1: mage, t2: other } } } });
    const { app, files } = createInMemoryApp({ files: { [path]: '```statblock\nname: Mage\nhp: 27\nstress: 3\n```', [mapPath]: scene } });
    app.vault.cachedRead = app.vault.read;
    Object.assign(window, { FantasyStatblocks: { getBestiaryCreatures: () => [], hasCreature: () => false } });
    const assetService = { getCollectionForMap: () => 'Own', getCollectionSettings: () => ({ conditions: [], resources: DEFINITIONS }) };
    const service = Object.assign(Object.create(TokenStatblockLinkService.prototype), { app, assetService });
    await service.updateAllSpawnedTokens('mage.webp', statblockPath);
    return JSON.parse(files.get(mapPath)!).state.objects.tokens;
  };

  it('writes the statblock\'s values in the fields every Atlas reads, and keeps what the token held beyond them', async () => {
    const tokens = await rewrite(path);
    expect(tokens.t1).toEqual({
      id: 't1', kind: 'character', imagePath: 'mage.webp', x: 0, y: 0, name: 'Mage', statblockPath: path,
      hp: { current: 27, max: 27 }, stress: { current: 0, max: 3 }, maxStress: 3,
      statblockResources: { mana: { current: 1, max: 8 } },
    });
    expect(tokens.t2).toEqual(other);
  });

  it('clears every resource field when the link is removed', async () => {
    const tokens = await rewrite(null);
    expect(tokens.t1).toEqual({ id: 't1', kind: 'character', imagePath: 'mage.webp', x: 0, y: 0 });
  });
});
