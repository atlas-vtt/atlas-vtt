import { afterEach, describe, expect, it, vi } from 'vitest';
import { CampaignService } from '../../../../src/app/campaigns/CampaignService';
import { rulesForMap } from '../../../../src/app/gameSystems/mapRules';
import { rulesOfPreset } from '../../../../src/app/gameSystems/systemRules';
import { formatDistance } from '../../../../src/app/grid/measurementFormat';
import { RulesShare } from '../../../../src/app/online/gm/RulesShare.ts';
import type { SceneState, SceneStore } from '../../../../src/app/online/gm/atlasView.ts';
import { parseGmMessage, type GmMessage, type SharedRules } from '../../../../src/app/online/protocol/index.ts';
import { AssetService } from '../../../../src/app/services/AssetService';
import { mapLightPresets } from '../../../../src/app/services/mapCollectionRules';
import { mapMeasurementSettings } from '../../../../src/app/services/mapMeasurementSettings';
import { rulesLookup } from '../../../../src/app/services/mapRules';
import { mapSenseRules } from '../../../../src/app/services/mapSenseRules';
import { setMapUnitType } from '../../../../src/app/services/mapUnits';
import type { CollectionSettings } from '../../../../src/app/types/collectionSettingsTypes';
import type { GridState } from '../../../../src/app/types/gridTypes';
import { DND5E, DUNGEON_MAP as MAP, playedCampaignWorld, releasePlayedCampaignWorlds, type PlayedCampaignWorld } from '../../../mocks/playedCampaignWorld';
import { sceneState } from './shareHarness.ts';

/** A scene made while its collection still measured in feet: its grid keeps that copy. */
const GRID: GridState = { enabled: true, size: 70, offsetX: 0, offsetY: 0, opacity: 1, measurementType: 'units', unitType: 'feet', unitDistance: 5 };
/** The 5e collection `dungeon`, switched to metres by its GM. */
const METRES: CollectionSettings = { ...rulesOfPreset(DND5E), systemPresetId: DND5E.id, gridDefaults: { ...DND5E.rules.gridDefaults, unitType: 'meters', unitDistance: 1.5 } };

type Measurement = SharedRules['measurement'];

/** The shared scene of a table: the GM's own measurement of it, and the rules its players were sent. */
function table(world: PlayedCampaignWorld, grid: GridState = GRID): { scene: { mapPath: string; grid: GridState; setGrid(next: GridState): void }; share: RulesShare; sent: Measurement[] } {
  const scene = { mapPath: MAP, grid, setGrid: (): void => undefined };
  const state: SceneState = sceneState({ grid });
  const store: SceneStore = { getState: () => state, setState: () => undefined, subscribe: () => () => undefined };
  const sent: Measurement[] = [];
  const send = (body: GmMessage): void => {
    const read = parseGmMessage(JSON.parse(JSON.stringify(body)));
    if (read?.t === 'rules') sent.push(read.measurement);
  };
  // The port as `sceneBinding` wires it: the measure renderer's provider, which is this read.
  const share = new RulesShare(store, { send, measurement: () => mapMeasurementSettings(rulesLookup(world.app), scene) });
  share.setScene('s1');
  return { scene, share, sent };
}

afterEach(() => {
  releasePlayedCampaignWorlds();
  vi.restoreAllMocks();
});

describe('the unit a shared scene measures in', () => {
  it('is its collection\'s metres for the GM and the players while the table\'s campaign has no system of its own', () => {
    const world = playedCampaignWorld(METRES);
    new CampaignService(world.campaigns).update('saga', { system: undefined });
    const { scene, share, sent } = table(world);

    world.play.play('saga');
    share.update();

    expect(rulesForMap(rulesLookup(world.app), MAP).source).toEqual({ kind: 'collection', id: 'dungeon' });
    expect(formatDistance(4, mapMeasurementSettings(rulesLookup(world.app), scene))).toBe('6m');
    expect(mapSenseRules(world.app, AssetService.getInstance(world.app), scene).unit).toMatchObject({ unitType: 'meters', unitDistance: 1.5 });
    expect(mapLightPresets(world.app, scene).find((preset) => preset.name === 'Torch')).toMatchObject({ bright: 6, dim: 12 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ mode: 'metric', unitType: 'meters', unitDistance: 1.5, ruleDistance: 1.5 });
  });

  it('is the campaign\'s while its system applies, changed there from the map, and the collection\'s again once the table closes', async () => {
    const world = playedCampaignWorld(METRES);
    const { scene, share, sent } = table(world);

    world.play.play('saga');
    share.update();
    expect(rulesForMap(rulesLookup(world.app), MAP).source).toEqual({ kind: 'campaign', id: 'saga' });
    expect(formatDistance(4, mapMeasurementSettings(rulesLookup(world.app), scene))).toBe('20ft');

    await setMapUnitType(world.app, { getState: () => scene }, 'meters');
    share.update();
    expect(world.collectionWrites).toEqual([]);

    world.play.stop();
    share.update();
    expect(sent.map(({ unitType, unitDistance }) => [unitType, unitDistance])).toEqual([['meters', 1.5], ['feet', 5], ['meters', 5], ['meters', 1.5]]);
  });

  it('reaches players with a scene\'s own distance per cell, in the collection\'s unit', () => {
    const world = playedCampaignWorld(METRES);
    const { scene, sent } = table(world, { ...GRID, unitDistanceOverride: 2 });

    expect(formatDistance(4, mapMeasurementSettings(rulesLookup(world.app), scene))).toBe('8m');
    expect(sent[0]).toMatchObject({ mode: 'metric', unitType: 'meters', unitDistance: 2, ruleDistance: 1.5 });
  });
});
