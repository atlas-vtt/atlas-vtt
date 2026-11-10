import { afterEach, expect, it, vi } from 'vitest';
import { CampaignService } from '../../src/app/campaigns/CampaignService';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { vanillaSystemSettings } from '../../src/app/gameSystems/systemRules';
import { AssetService } from '../../src/app/services/AssetService';
import { SystemPresetService } from '../../src/app/services/SystemPresetService';
import { deleteSystemPreset } from '../../src/app/services/systemPresetDeletion';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { memoryCampaigns } from '../mocks/memoryCampaigns';
import { memoryPresets } from '../mocks/memoryPresets';

afterEach(() => vi.restoreAllMocks());

it('deletes the preset and leaves the collections that used it without a game system', async () => {
  const { app } = createInMemoryApp();
  app.workspace = { getLeavesOfType: () => [] } as any;
  const presets = new SystemPresetService(memoryPresets());
  const homebrew = presets.create('Homebrew', structuredClone(BUILT_IN_SYSTEM_PRESETS[0]!.rules));
  const updateCollectionSettings = vi.fn(async () => undefined);
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({
    getCollections: async () => [
      { id: 'uses-it', settings: { conditions: [], systemPresetId: homebrew.id } },
      { id: 'other', settings: { conditions: [], systemPresetId: 'builtin:dnd5e' } },
    ],
    updateCollectionSettings,
    getCollectionSettings: () => ({ conditions: [] }),
    getCollectionForMap: () => null,
  } as any);

  const affected = await deleteSystemPreset(app as any, presets, homebrew.id);

  expect(affected).toEqual(['uses-it']);
  expect(presets.list().some((preset) => preset.id === homebrew.id)).toBe(false);
  expect(updateCollectionSettings).toHaveBeenCalledOnce();
  expect(updateCollectionSettings).toHaveBeenCalledWith('uses-it', vanillaSystemSettings());
});

it('leaves the campaigns that used it without a system of their own, and a newer Atlas\' campaign as it is', async () => {
  const { app } = createInMemoryApp();
  const presets = new SystemPresetService(memoryPresets());
  const homebrew = presets.create('Homebrew', structuredClone(BUILT_IN_SYSTEM_PRESETS[0]!.rules));
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({ getCollections: async () => [] } as unknown as AssetService);
  const { gridDefaults, conditions } = homebrew.rules;
  const system = (systemPresetId: string): Record<string, unknown> => ({ systemPresetId, gridDefaults, conditions });
  const campaigns = memoryCampaigns([
    { id: 'uses-it', name: 'Uses it', createdAt: 1, system: system(homebrew.id) },
    { id: 'other', name: 'Other', createdAt: 1, system: system('builtin:dnd5e') },
    { id: 'future', name: 'Future', createdAt: 1, format: 2, system: system(homebrew.id) },
  ]);

  await deleteSystemPreset(app, presets, homebrew.id, campaigns);

  const service = new CampaignService(campaigns);
  expect(service.get('uses-it')).not.toHaveProperty('system');
  expect(service.get('other')?.system?.systemPresetId).toBe('builtin:dnd5e');
  expect(service.get('future')?.system?.systemPresetId).toBe(homebrew.id);
});
