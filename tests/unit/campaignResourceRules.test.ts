import { afterEach, describe, expect, it, vi } from 'vitest';
import { CampaignService } from '../../src/app/campaigns/CampaignService';
import { StatblockTokenSync } from '../../src/app/plugin/StatblockTokenSync';
import { TokenCollectionSync } from '../../src/app/plugin/TokenCollectionSync';
import type { ResourceDefinition, ResourceValue } from '../../src/app/resources/resourceTypes';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { CollectionSettings } from '../../src/app/types/collectionSettingsTypes';
import { DUNGEON_MAP, playedCampaignWorld, releasePlayedCampaignWorlds, type PlayedCampaignWorld } from '../mocks/playedCampaignWorld';
import { HP } from '../mocks/resourceFixtures';
import { character, statblockFixture } from '../mocks/statblockTokenSync';

/** A sheet that keeps its hit points under a key of its own, beside the usual one, and a list of spell slots. */
const SHEET = { name: 'Hero', hp: 20, hit_point: 31, slots: [3, 2] };
const SHEET_HP: ResourceDefinition = { ...HP, field: 'hit_point' };
const SLOTS: ResourceDefinition = { ...HP, key: 'slots', name: 'Slots', field: 'slots.0', color: '#3b82f6', defeatedWhenSpent: false };

interface OpenMap extends PlayedCampaignWorld {
  /** What the token `hero` holds of each resource. */
  held(): Record<string, ResourceValue> | undefined;
  campaign: CampaignService;
  close(): void;
}

/**
 * An open scene of the collection `dungeon` with one token linked to `SHEET`, its rules followed as
 * `TokenRenderer` follows them: once when the map has loaded, and again whenever they change.
 */
function openMap(dungeon: CollectionSettings, held: Record<string, ResourceValue>): OpenMap {
  const world = playedCampaignWorld(dungeon);
  const { links } = statblockFixture();
  links.readStatblockRecord.mockResolvedValue({ fields: SHEET });
  const store = createViewAtlasStore(world.app, 'campaign-resource-rules-test');
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath(DUNGEON_MAP);
  store.getState().addToken(character({ resources: held }));
  const rules = new TokenCollectionSync(world.app, store.getState, {
    refreshRules: () => statblock.followRules(),
    refreshArt: async () => undefined,
  });
  const statblock = new StatblockTokenSync(world.app, store, links, rules.resources);
  statblock.followRules();
  return {
    ...world,
    held: () => store.getState().objects.tokens.hero?.resources,
    campaign: new CampaignService(world.campaigns),
    close: () => { rules.destroy(); statblock.destroy(); },
  };
}

afterEach(() => {
  releasePlayedCampaignWorlds();
  vi.restoreAllMocks();
});

describe('a linked token while a campaign with a game system is played', () => {
  it('reads the statblock field the campaign\'s rules name, and follows it at once when it is changed there (#648)', async () => {
    const map = openMap({ conditions: [], resources: [SHEET_HP] }, { hp: { current: 31, max: 31 } });
    // The campaign's 5e rules read `hp`, whatever the collection's read.
    map.play.play('saga');
    await vi.waitFor(() => expect(map.held()?.hp).toEqual({ current: 20, max: 20 }));

    map.campaign.update('saga', { system: { resources: [SHEET_HP] } });
    await vi.waitFor(() => expect(map.held()?.hp).toEqual({ current: 31, max: 31 }));
    map.close();
  });

  it('follows its collection\'s field again once play stops', async () => {
    const map = openMap({ conditions: [], resources: [SHEET_HP] }, { hp: { current: 31, max: 31 } });
    map.play.play('saga');
    await vi.waitFor(() => expect(map.held()?.hp).toEqual({ current: 20, max: 20 }));
    map.play.stop();
    await vi.waitFor(() => expect(map.held()?.hp).toEqual({ current: 31, max: 31 }));
    map.close();
  });

  it('starts a resource the campaign\'s rules add, read from a dotted field as a collection\'s is', async () => {
    const ofCollection = openMap({ conditions: [], resources: [HP, SLOTS] }, { hp: { current: 20, max: 20 } });
    await vi.waitFor(() => expect(ofCollection.held()?.slots).toEqual({ current: 3, max: 3 }));
    ofCollection.close();

    const ofCampaign = openMap({ conditions: [], resources: [HP] }, { hp: { current: 20, max: 20 } });
    ofCampaign.play.play('saga');
    ofCampaign.campaign.update('saga', { system: { resources: [HP, SLOTS] } });
    await vi.waitFor(() => expect(ofCampaign.held()?.slots).toEqual({ current: 3, max: 3 }));
    ofCampaign.close();
  });

  it('starts no resource of a campaign that is not played: its rules apply only then', async () => {
    const map = openMap({ conditions: [], resources: [HP] }, { hp: { current: 20, max: 20 } });
    map.campaign.update('saga', { system: { resources: [HP, SLOTS] } });
    await Promise.resolve();
    expect(map.held()).toEqual({ hp: { current: 20, max: 20 } });
    map.play.play('saga');
    await vi.waitFor(() => expect(map.held()?.slots).toEqual({ current: 3, max: 3 }));
    map.close();
  });
});
