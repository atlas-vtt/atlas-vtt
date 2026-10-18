import type { App } from 'obsidian';
import { vi } from 'vitest';
import { CampaignFiles } from '../../src/app/campaigns/CampaignFiles';
import { CampaignPlay } from '../../src/app/campaigns/campaignPlay';
import { readCampaignSystem, type CampaignSystem } from '../../src/app/campaigns/campaignSystem';
import { PlayedRules } from '../../src/app/campaigns/playedRules';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { rulesOfPreset } from '../../src/app/gameSystems/systemRules';
import { AssetService } from '../../src/app/services/AssetService';
import type { CollectionSettings } from '../../src/app/types/collectionSettingsTypes';
import { createInMemoryApp } from './inMemoryVault';
import { memoryCampaigns } from './memoryCampaigns';

/** A scene of the collection `dungeon`. */
export const DUNGEON_MAP = 'atlas-vtt/collections/dungeon/scenes/cave.atlasmap';
export const DND5E = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.id === 'builtin:dnd5e')!;

/** The 5e system, as the campaign's rules dialog saves it. */
export function dnd5eSystem(): CampaignSystem {
  const { defaultWidgets: _bars, ...rules } = rulesOfPreset(DND5E);
  return { ...rules, systemPresetId: DND5E.id };
}

export interface PlayedCampaignWorld {
  app: App;
  play: CampaignPlay;
  campaigns: ReturnType<typeof memoryCampaigns>;
  /** The changes saved to the collection's settings, which it then holds. */
  collectionWrites: Partial<CollectionSettings>[];
  /** The system the campaign's file holds now. */
  storedSystem(): CampaignSystem | undefined;
}

const opened: App[] = [];

/**
 * A collection `dungeon` holding `DUNGEON_MAP` with `dungeon` settings, and a campaign `Saga` (id
 * `saga`) whose system is 5e; nothing is played yet. Release it with `releasePlayedCampaignWorlds`.
 */
export function playedCampaignWorld(dungeon: CollectionSettings): PlayedCampaignWorld {
  const { app } = createInMemoryApp({ files: {} });
  let settings = dungeon;
  const collectionWrites: Partial<CollectionSettings>[] = [];
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({
    getCollectionForMap: (path: string) => (path === DUNGEON_MAP ? 'dungeon' : null),
    getCollectionSettings: () => settings,
    getCollections: async () => [{ id: 'dungeon', name: 'dungeon', version: '1.0.0', settings }],
    getAssets: async () => [],
    updateCollectionSettings: async (_id: string, changes: Partial<CollectionSettings>) => {
      collectionWrites.push(changes);
      settings = { ...settings, ...changes };
    },
    initialize: () => new Promise<void>(() => undefined),
  } as unknown as AssetService);
  const campaigns = memoryCampaigns([{ id: 'saga', name: 'Saga', createdAt: 1, system: dnd5eSystem() }]);
  vi.spyOn(CampaignFiles, 'forApp').mockReturnValue(campaigns as unknown as CampaignFiles);
  const play = CampaignPlay.forApp(app);
  PlayedRules.open(app, campaigns, play);
  opened.push(app);
  return { app, play, campaigns, collectionWrites, storedSystem: () => readCampaignSystem(campaigns.current()[0]?.system) };
}

/** Releases the played rules of every world made since the last call. */
export function releasePlayedCampaignWorlds(): void {
  for (const app of opened.splice(0)) PlayedRules.release(app);
}
