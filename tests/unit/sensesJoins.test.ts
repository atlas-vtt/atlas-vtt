import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreatureIndex } from '../../src/app/creatures/CreatureIndex';
import { inheritedSensesOf } from '../../src/app/creatures/creatureSenses';
import { tokenSensesResolver, type TokenSensesResolver } from '../../src/app/creatures/tokenSensesResolver';
import { seeing } from '../../src/app/gameSystems/senses/senseHelpers';
import { emissionOf } from '../../src/app/lighting/lightPresetChoice';
import { gameUnitsToWorld, unitScaleOf } from '../../src/app/lighting/lightingUnits';
import { visionForm, visionFromForm } from '../../src/app/lighting/tokenLighting';
import { tokenPerception } from '../../src/app/vision/tokenPerception';
import { senseRings } from '../../src/app/pixi/lighting/senseRings';
import { SightRulesWatch } from '../../src/app/pixi/lighting/SightRulesWatch';
import { AssetService } from '../../src/app/services/AssetService';
import { mapLightPresets } from '../../src/app/services/mapCollectionRules';
import { mapMeasurementSettings } from '../../src/app/services/mapMeasurementSettings';
import { mapSenseRules, mapSenseRulesSource } from '../../src/app/services/mapSenseRules';
import type { ViewAtlasStore } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';
import type { CollectionSettings } from '../../src/app/types/collectionSettingsTypes';
import type { SenseDefinition } from '../../src/app/types/senseTypes';
import { computeSight, sightSources, type SightSource } from '../../src/app/vision/sight';
import { creatureVault, type CreatureVault } from '../mocks/creatureVault';

const GOBLIN = 'Bestiary/Goblin.md';
const MAP = 'atlas-vtt/collections/dungeon/scenes/cave.atlasmap';
const BOUNDS = { width: 4000, height: 4000 };
const FEET = { unitType: 'feet', unitDistance: 5, measurementMode: 'metric', abstractRangeBands: [], diagonalRule: 'equidistant' } as CollectionSettings['gridDefaults'];
const METRES = { ...FEET, unitType: 'meters', unitDistance: 1.5 } as CollectionSettings['gridDefaults'];
const THERMAL: SenseDefinition = { id: 'thermal', name: 'Thermal sight', description: '', ...seeing({ bright: 'normal', dim: 'normal', dark: 'as-dim', magicalDark: 'none' }, 'heat'), range: 'required' };
const UNLIMITED = Math.hypot(BOUNDS.width, BOUNDS.height);
const nextFrame = (): Promise<void> => new Promise((resolve) => window.requestAnimationFrame(() => resolve()));

/**
 * The seams between the senses editor, statblocks, the collection's settings and sight: each
 * test writes on one side and reads on the other, through the objects a map view wires.
 */
describe('senses, from where they are edited to what sight does', () => {
  let current: CreatureVault;
  let settings: CollectionSettings;
  let resolver: TokenSensesResolver;
  let watch: SightRulesWatch;
  let rebuilt: ReturnType<typeof vi.fn>;
  const state = { mapPath: MAP, grid: null };

  /** The collection's settings were saved, as `AssetService` tells the workspace. */
  const save = (patch: Partial<CollectionSettings>): void => {
    settings = { ...settings, ...patch };
    current.workspace.trigger('atlas-vtt:collection-settings-changed', 'dungeon');
  };
  const token = (extra: Partial<TokenEntity> = {}): TokenEntity => ({ id: 't', kind: 'character', name: 'Goblin', imagePath: 'g.png', x: 2000, y: 2000, vision: { enabled: true }, ...extra }) as TokenEntity;
  const sourceOf = (viewer: TokenEntity): SightSource => {
    const measurement = mapMeasurementSettings(AssetService.getInstance(current.app), state);
    return sightSources({ [viewer.id]: viewer }, unitScaleOf(measurement, null), BOUNDS, watch.current())[0]!;
  };
  /** Sense ids with their reach in game units, as sight has them. */
  const reaches = (viewer: TokenEntity): [string, number][] => {
    const { unitDistance } = mapMeasurementSettings(AssetService.getInstance(current.app), state);
    return sourceOf(viewer).senses.map(({ definition, range }) => [definition.id, Math.round((range / 70) * unitDistance)]);
  };
  const read = async (): Promise<void> => {
    resolver.visionOf(token({ statblockPath: GOBLIN }));
    await vi.waitFor(() => expect(CreatureIndex.forApp(current.app).get(GOBLIN)).toBeTruthy());
  };

  beforeEach(() => {
    current = creatureVault();
    settings = { systemPresetId: 'builtin:dnd5e', gridDefaults: FEET, conditions: [] } as unknown as CollectionSettings;
    const assets = AssetService.getInstance(current.app);
    vi.spyOn(assets, 'getCollectionForMap').mockReturnValue('dungeon');
    vi.spyOn(assets, 'getCollectionSettings').mockImplementation(() => settings);
    resolver = tokenSensesResolver(CreatureIndex.forApp(current.app), mapSenseRulesSource(current.app, assets, () => state));
    rebuilt = vi.fn();
    watch = new SightRulesWatch({ obsApp: current.app, store: { getState: () => state } as unknown as ViewAtlasStore, senses: resolver, frames: () => window, onChange: rebuilt });
  });

  afterEach(() => {
    watch.destroy();
    CreatureIndex.release(current.app);
    Reflect.deleteProperty(window, 'FantasyStatblocks');
    vi.restoreAllMocks();
  });

  it('sees by the senses Edit Token saves', () => {
    const { definitions } = mapSenseRules(current.app, AssetService.getInstance(current.app), state);
    const form = visionForm({ enabled: true }, definitions);
    const vision = visionFromForm({ ...form, range: '80', senses: [{ id: 'dnd5e-darkvision', range: '90' }, { id: 'dnd5e-tremorsense', range: '' }] });
    expect(vision.senses).toEqual([{ id: 'dnd5e-darkvision', range: 90 }, { id: 'dnd5e-tremorsense' }]);
    const viewer = token({ vision });
    expect(Math.round((sourceOf(viewer).range / 70) * 5)).toBe(80);
    // Tremorsense given no distance takes the one its definition names.
    const tremor = definitions.find((definition) => definition.id === 'dnd5e-tremorsense')!.defaultRange;
    expect(reaches(viewer)).toEqual([['dnd5e-darkvision', 90], ['dnd5e-tremorsense', tremor]]);
    // Opened again, the editor shows what sight uses.
    expect(visionForm(vision, definitions).senses).toEqual([{ id: 'dnd5e-darkvision', range: '90' }, { id: 'dnd5e-tremorsense', range: '' }]);
  });

  it('shows in Edit Token the senses and the sight range a token takes from its statblock, as sight uses them', async () => {
    current.frontmatter[GOBLIN]!.senses = 'blindsight 30 ft. (blind beyond this radius), darkvision 60 ft., passive Perception 9';
    await read();
    const linked = token({ statblockPath: GOBLIN });
    const rules = mapSenseRules(current.app, AssetService.getInstance(current.app), state);
    // What `useStatblockSenses` gives the editor.
    const shown = inheritedSensesOf({ statblockPath: GOBLIN }, CreatureIndex.forApp(current.app).get(GOBLIN), rules.definitions, rules.unit)!;
    const used = resolver.visionOf(linked);
    expect(shown.senses).toEqual(used.senses);
    expect(shown.senses.map((sense) => sense.id)).toEqual(['dnd5e-blindsight', 'dnd5e-darkvision']);
    expect([shown.blindBeyond, shown.blindBeyondRange]).toEqual([true, 30]);
    expect(used.sightRange).toBe(shown.blindBeyondRange);
    expect(Math.round((sourceOf(linked).range / 70) * 5)).toBe(30);
    expect(reaches(linked)).toEqual([['dnd5e-blindsight', 30], ['dnd5e-darkvision', 60]]);
    // Darkvision is of the eyes: where sight is worked out it ends with the creature's sight, at 30 feet.
    const regions = computeSight([sourceOf(linked)], []).regions.map((region) => [region.sense.id, Math.round((region.radius / 70) * 5)]);
    expect(regions).toEqual([['sight', 30], ['dnd5e-blindsight', 30], ['dnd5e-darkvision', 30]]);
    // Once the token has senses of its own, the editor shows no statblock senses and sight uses the token's.
    const own = token({ statblockPath: GOBLIN, vision: { enabled: true, senses: [{ id: 'dnd5e-truesight', range: 20 }] } });
    expect(inheritedSensesOf(own, CreatureIndex.forApp(current.app).get(GOBLIN), rules.definitions, rules.unit)).toBeNull();
    expect(reaches(own)).toEqual([['dnd5e-truesight', 20]]);
  });

  it('hides an invisible token from sight, and not one whose condition had its effect switched off', () => {
    const viewer = token();
    const invisible = token({ id: 'i', x: 2100, vision: undefined, conditions: ['dnd5e-invisible'] });
    const tokens = { t: viewer, i: invisible };
    const perceived = (): string => {
      const rules = watch.current();
      const sight = computeSight(sightSources(tokens, { unitDistance: 5, cellSize: 70 }, BOUNDS, rules), []);
      return tokenPerception(sight, { ambient: 1 }, [], tokens, { conditions: rules.conditions })('i');
    };
    // A copy from before effects existed is read by its built-in id.
    settings = { ...settings, conditions: [{ id: 'dnd5e-invisible', name: 'Invisible', color: '#c7d2fe' }] };
    expect(perceived()).toBe('unseen');
    save({ conditions: [{ id: 'dnd5e-invisible', name: 'Invisible', color: '#c7d2fe', effect: 'none' }] });
    watch.destroy();
    watch = new SightRulesWatch({ obsApp: current.app, store: { getState: () => state } as unknown as ViewAtlasStore, senses: resolver, frames: () => window, onChange: rebuilt });
    expect(perceived()).toBe('seen');
  });

  it('works sight out anew when the conditions\' effects are saved', async () => {
    watch.current();
    save({ conditions: [{ id: 'dnd5e-invisible', name: 'Invisible', color: '#c7d2fe' }] });
    await nextFrame();
    expect(rebuilt).toHaveBeenCalledTimes(1);
    save({ conditions: [{ id: 'dnd5e-invisible', name: 'Invisible', color: '#c7d2fe', effect: 'none' }] });
    await nextFrame();
    expect(rebuilt).toHaveBeenCalledTimes(2);
    expect(watch.current().conditions).toEqual(settings.conditions);
    // A save that changes nothing sight goes by builds nothing.
    save({ lootCurrency: 'gp' } as Partial<CollectionSettings>);
    await nextFrame();
    expect(rebuilt).toHaveBeenCalledTimes(2);
  });

  it('gives sight a homebrew sense as soon as the Vision tab saves it, and takes it away when it is deleted, without the map being reopened', async () => {
    const viewer = token({ vision: { enabled: true, senses: [{ id: 'thermal', range: 45 }, { id: 'dnd5e-darkvision', range: 60 }] } });
    // The collection does not define the sense yet: sight has nothing of that name.
    expect(reaches(viewer)).toEqual([['dnd5e-darkvision', 60]]);
    const builtIn = watch.current().definitions;
    save({ senses: [...builtIn, THERMAL] });
    await nextFrame();
    expect(rebuilt).toHaveBeenCalledTimes(1);
    expect(reaches(viewer)).toEqual([['thermal', 45], ['dnd5e-darkvision', 60]]);
    // The GM's rings name it as the editor does: by the definition's name.
    const rings = senseRings(sourceOf(viewer), UNLIMITED, (radius) => `${Math.round((radius / 70) * 5)}ft`);
    expect(rings.rings.map((ring) => ring.label)).toEqual(['Darkvision 60ft', 'Thermal sight 45ft']);

    save({ senses: [...builtIn, { ...THERMAL, name: 'Heat sight' }] });
    await nextFrame();
    expect(rebuilt).toHaveBeenCalledTimes(2);
    expect(senseRings(sourceOf(viewer), UNLIMITED, () => '').rings.map((ring) => ring.label.trim())).toEqual(['Darkvision', 'Heat sight']);

    save({ senses: [...builtIn] });
    await nextFrame();
    expect(rebuilt).toHaveBeenCalledTimes(3);
    expect(reaches(viewer)).toEqual([['dnd5e-darkvision', 60]]);
  });

  it('offers a light preset in the distances the map\'s lights, their rings and their reach are measured in', () => {
    const reachOf = (): { dim: number; world: number } => {
      const torch = mapLightPresets(current.app, state).find((preset) => preset.kind === 'torch')!;
      const emission = emissionOf(torch);
      // The popover shows `emission.dim`; the rings and the light's reach turn it into world pixels with the map's measurement.
      const scale = unitScaleOf(mapMeasurementSettings(AssetService.getInstance(current.app), state), state.grid);
      return { dim: emission.dim, world: gameUnitsToWorld(emission.dim, scale) };
    };
    expect(reachOf()).toEqual({ dim: 40, world: 560 });
    settings = { ...settings, gridDefaults: METRES };
    // A 5e torch is 40 feet, 12 metres, eight squares: the same eight squares on the map.
    expect(reachOf()).toEqual({ dim: 12, world: 560 });
  });
});
