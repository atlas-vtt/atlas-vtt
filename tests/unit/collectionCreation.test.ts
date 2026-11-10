import { expect, it, vi } from 'vitest';
import { AssetService } from '../../src/app/services/AssetService';
import { createCollectionWithSystem } from '../../src/app/services/collectionCreation';
import * as collectionSystemSync from '../../src/app/services/collectionSystemSync';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { GENERIC_STATBLOCK_ROLES, collectionStatblockRoles } from '../../src/app/statblocks/roles/collectionStatblockRoles';
import type { CollectionSettings } from '../../src/app/types/collectionSettingsTypes';

it('stores the resources and bar switches of a collection without a game system, so it never reads as one saved before resources', async () => {
  const updateCollectionSettings = vi.fn(async () => undefined);
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({
    createCollection: async (name: string) => ({ id: name, name }),
    updateCollectionSettings,
  } as unknown as AssetService);

  await createCollectionWithSystem({} as never, 'Plain', undefined, []);

  expect(updateCollectionSettings).toHaveBeenCalledOnce();
  const [id, settings] = updateCollectionSettings.mock.calls[0] as unknown as [string, { resources: Array<{ key: string }>; defaultWidgets: unknown; conditions: unknown[] }];
  expect(id).toBe('Plain');
  expect(settings.resources.map((r) => r.key)).toEqual(['hp']);
  expect(settings.defaultWidgets).toEqual({ hpBar: true, stressBar: false });
  expect(settings.conditions).toEqual([]);
});

it('gives a new collection the roles of its preset to read, and the generic roles without one', async () => {
  const updateCollectionSettings = vi.fn(async () => undefined);
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({
    createCollection: async (name: string) => ({ id: name, name }),
    updateCollectionSettings,
  } as unknown as AssetService);
  vi.spyOn(collectionSystemSync, 'syncCollectionSystem').mockResolvedValue(undefined);
  const daggerheart = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'Daggerheart')!;

  await createCollectionWithSystem({} as never, 'Witherwild', daggerheart, BUILT_IN_SYSTEM_PRESETS);
  await createCollectionWithSystem({} as never, 'Plain', undefined, BUILT_IN_SYSTEM_PRESETS);

  const [withSystem, without] = updateCollectionSettings.mock.calls.map((call) => (call as unknown as [string, CollectionSettings])[1]);
  // Nothing of its own, so a later correction of the preset's roles reaches it
  expect(withSystem).not.toHaveProperty('statblockRoles');
  expect(collectionStatblockRoles(withSystem!, BUILT_IN_SYSTEM_PRESETS).map((role) => role.name)).toEqual(['Adversary', 'Environment']);
  expect(without).toHaveProperty('statblockRoles', undefined);
  expect(collectionStatblockRoles(without!, BUILT_IN_SYSTEM_PRESETS)).toBe(GENERIC_STATBLOCK_ROLES);
});

it('gives a new collection its preset\'s dice set alone, with no dice rules beside it for older versions', async () => {
  const updateCollectionSettings = vi.fn(async () => undefined);
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({
    createCollection: async (name: string) => ({ id: name, name }),
    updateCollectionSettings,
  } as unknown as AssetService);
  vi.spyOn(collectionSystemSync, 'syncCollectionSystem').mockResolvedValue(undefined);
  const cairn = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'Cairn')!;

  await createCollectionWithSystem({} as never, 'Woods', cairn, BUILT_IN_SYSTEM_PRESETS);

  const [, settings] = updateCollectionSettings.mock.calls[0] as unknown as [string, CollectionSettings];
  expect(settings.diceSetId).toBe('builtin:d20-roll-under');
  expect(settings).not.toHaveProperty('dice');
});
