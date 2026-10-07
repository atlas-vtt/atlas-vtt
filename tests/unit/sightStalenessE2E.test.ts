import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Application, EventSystem } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { TFile } from 'obsidian';
import { CreatureIndex } from '../../src/app/creatures/CreatureIndex';
import { tokenSensesResolver } from '../../src/app/creatures/tokenSensesResolver';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { worldTexel } from '../../src/app/lighting/lightingConstants';
import { unitScaleOf } from '../../src/app/lighting/lightingUnits';
import { sealedWalls } from '../../src/app/lighting/sealWalls';
import { heldForSight } from '../../src/app/lighting/sightOnDrop';
import { LightingController } from '../../src/app/pixi/lighting/LightingController';
import { tokenPerception } from '../../src/app/vision/tokenPerception';
import type { TokenRenderer } from '../../src/app/pixi/TokenRenderer';
import { AssetService } from '../../src/app/services/AssetService';
import { mapMeasurementSettings } from '../../src/app/services/mapMeasurementSettings';
import { mapSenseRulesSource } from '../../src/app/services/mapSenseRules';
import { mapSightRules } from '../../src/app/services/mapSightRules';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import type { CollectionSettings } from '../../src/app/types/collectionSettingsTypes';
import { sceneSight, sightSources, type Sight } from '../../src/app/vision/sight';
import { wallList } from '../../src/app/vision/wallList';
import { creatureVault, type CreatureVault } from '../mocks/creatureVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

// The line-of-sight fallback is the whole lighting view here: real sight, real cache, no GPU.
vi.mock('../../src/app/pixi/utils/rendererType', () => ({ usesCanvasRenderer: () => true }));
vi.mock('../../src/app/utils/activeLeafGuard', () => ({ isActiveAtlasLeaf: () => true }));

const MAP = 'atlas-vtt/collections/dungeon/scenes/cave.atlasmap';
const OTHER = 'atlas-vtt/collections/dungeon/scenes/hall.atlasmap';
const GOBLIN = 'Bestiary/Goblin.md';
const BOUNDS = { width: 2000, height: 2000 };
const dnd = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.id === 'builtin:dnd5e')!;
const nextFrame = (): Promise<void> => new Promise((resolve) => window.requestAnimationFrame(() => resolve()));

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  vi.restoreAllMocks();
});

interface World {
  current: CreatureVault;
  store: ViewAtlasStore;
  controller: LightingController;
  settings: { value: CollectionSettings };
  save: (patch: Partial<CollectionSettings>) => void;
}

function world(): World {
  const restoreGraphics = stubJsdomGraphics();
  const current = creatureVault();
  const settings = { value: { systemPresetId: 'builtin:dnd5e', gridDefaults: structuredClone(dnd.rules.gridDefaults), conditions: structuredClone(dnd.rules.conditions) } as unknown as CollectionSettings };
  const assets = AssetService.getInstance(current.app);
  vi.spyOn(assets, 'getCollectionForMap').mockImplementation((path) => (path.includes('collections/dungeon/') ? 'dungeon' : null));
  vi.spyOn(assets, 'getCollectionSettings').mockImplementation(() => settings.value);
  const events = { domElement: document.createElement('canvas') } as unknown as EventSystem;
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events });
  const store = createViewAtlasStore(current.app, `sight-stale-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath(MAP);
  const controller = new LightingController({
    viewport,
    app: { canvas: document.createElement('canvas'), renderer: { name: 'canvas' } } as unknown as Application,
    store,
    eventBus: new EventEmitter(),
    obsApp: current.app,
    viewId: 'stale',
    bounds: () => BOUNDS,
    albedo: () => null,
  });
  controller.wire({
    setWallPointerDownHandler: vi.fn(), setWallPointerMoveHandler: vi.fn(), setWallPointerUpHandler: vi.fn(), setWallDoubleClickHandler: vi.fn(),
    setWallContextMenuHandler: vi.fn(), setWallCursorProvider: vi.fn(), setDoorMenuHandlers: () => undefined, setDoorClickHandler: vi.fn(), setLightHandlers: vi.fn(),
    setPlayerSightProvider: vi.fn(), refreshPlayerSight: vi.fn(), getSensedOutlineLayer: () => ({ visible: false }),
  } as unknown as TokenRenderer);
  cleanup = () => {
    controller.destroy();
    viewport.destroy();
    CreatureIndex.release(current.app);
    Reflect.deleteProperty(window, 'FantasyStatblocks');
    restoreGraphics();
  };
  const save = (patch: Partial<CollectionSettings>): void => {
    settings.value = { ...settings.value, ...patch };
    current.workspace.trigger('atlas-vtt:collection-settings-changed', 'dungeon');
  };
  return { current, store, controller, settings, save };
}

/** Sight as a comparable value: every region with its sense, reach and outline. */
function describeSight(sight: Sight): unknown {
  return {
    all: sight.all,
    regions: sight.regions.map((region) => ({
      token: region.tokenId, sense: region.sense.id, radius: Math.round(region.radius), invisible: region.seesInvisible,
      sees: region.sense.sees, los: region.sense.lineOfSight,
      outline: region.polygon?.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') ?? null,
    })),
  };
}

/** What the view holds, and what the same scene works out from nothing. */
function compare({ current, store, controller }: World): { held: unknown; fresh: unknown } {
  const state = store.getState();
  const assets = AssetService.getInstance(current.app);
  const perception = controller.playerSight();
  const ids = Object.keys(state.objects.tokens);
  if (!state.lighting.enabled) return { held: perception, fresh: undefined };
  const scale = unitScaleOf(mapMeasurementSettings(assets, state), state.grid);
  const walls = sealedWalls(wallList(state.objects.walls), worldTexel(BOUNDS));
  const resolver = tokenSensesResolver(CreatureIndex.forApp(current.app), mapSenseRulesSource(current.app, assets, () => state));
  const rules = mapSightRules(current.app, state, (token) => resolver.visionOf(token));
  const sight = sceneSight(state.lighting, sightSources(state.objects.tokens, scale, BOUNDS, rules), walls);
  const fresh = tokenPerception(sight, { ambient: 1 }, [], state.objects.tokens, { conditions: rules.conditions, held: heldForSight(state) });
  return {
    held: { sight: describeSight(controller.renderer.currentSight()), tokens: Object.fromEntries(ids.map((id) => [id, perception?.(id)])) },
    fresh: { sight: describeSight(sight), tokens: Object.fromEntries(ids.map((id) => [id, fresh(id)])) },
  };
}

describe('what the view holds is what the scene works out from nothing', () => {
  it('after every kind of change', async () => {
    const w = world();
    const { store, current, save } = w;
    const stale: string[] = [];
    const check = async (step: string): Promise<void> => {
      await nextFrame();
      await nextFrame();
      const { held, fresh } = compare(w);
      try {
        expect(held).toEqual(fresh);
      } catch (error) {
        stale.push(`${step}: ${(error as Error).message.split('\n').slice(0, 30).join('\n')}`);
      }
    };
    const s = (): ReturnType<ViewAtlasStore['getState']> => store.getState();

    s().setSceneLighting({ enabled: true, ambient: 0 });
    s().addWall({ type: 'solid', p1: { x: 450, y: 0 }, p2: { x: 450, y: 450 }, closed: true });
    const v = s().addToken({ id: 'v', x: 300, y: 300, imagePath: 'v.png', vision: { enabled: true, senses: [{ id: 'dnd5e-darkvision', range: 60 }] } } as never);
    const m = s().addToken({ id: 'm', x: 600, y: 300, imagePath: 'm.png' } as never);
    s().addToken({ id: 'n', x: 300, y: 700, imagePath: 'n.png' } as never);
    await check('initial');
    expect(w.controller.playerSight()!(m)).toBe('unseen');
    expect(w.controller.playerSight()!('n')).toBe('seen');

    s().updateToken(m, { x: 400 });
    await check('monster moved into sight');
    s().updateToken(v, { x: 500, y: 200 });
    await check('viewer moved');
    s().updateToken(m, { x: 700, y: 200, conditions: ['dnd5e-invisible'] });
    await check('monster invisible');
    expect(w.controller.playerSight()!(m)).toBe('unseen');
    s().updateToken(v, { vision: { enabled: true, senses: [{ id: 'dnd5e-blindsight', range: 30 }] } });
    await check('viewer gets blindsight');
    expect(w.controller.playerSight()!(m)).toBe('seen');
    s().updateToken(v, { conditions: ['dnd5e-blinded'] });
    await check('viewer blinded');
    s().updateToken(v, { vision: { enabled: true, range: 20, angle: 90, senses: [{ id: 'dnd5e-darkvision', range: 60 }] }, rotation: 90, conditions: [] });
    await check('viewer gets a cone and a range');
    s().updateToken(v, { rotation: 270 });
    await check('viewer turned');

    save({ conditions: s().objects.tokens[m] ? w.settings.value.conditions.map((condition) => (condition.id === 'dnd5e-invisible' ? { ...condition, effect: 'none' as const } : condition)) : [] });
    await check('collection: invisible has no effect');
    save({ conditions: structuredClone(dnd.rules.conditions) });
    await check('collection: invisible acts again');
    s().updateToken(v, { vision: { enabled: true, senses: [{ id: 'dnd5e-blindsight', range: 30 }] }, rotation: 0 });
    await check('viewer back to blindsight');
    save({ senses: dnd.rules.senses!.map((sense) => (sense.id === 'dnd5e-blindsight' ? { ...sense, seesInvisible: false } : sense)) });
    await check('collection: blindsight no longer sees invisible');
    expect(w.controller.playerSight()!(m)).toBe('unseen');
    save({ senses: undefined });
    await check('collection: senses back to the preset');
    save({ gridDefaults: { ...w.settings.value.gridDefaults!, unitType: 'meters', unitDistance: 1.5 } });
    await check('collection: metres');
    save({ gridDefaults: structuredClone(dnd.rules.gridDefaults) });
    await check('collection: feet');
    save({ systemPresetId: 'builtin:pathfinder2e' });
    await check('collection: another system');
    save({ systemPresetId: 'builtin:dnd5e' });
    await check('collection: the first system again');

    s().setSceneLighting({ tokenVision: false });
    await check('token vision off');
    s().setSceneLighting({ tokenVision: true });
    await check('token vision on');
    s().setSceneLighting({ enabled: false });
    await check('lighting off');
    s().updateToken(v, { x: 300, y: 300 });
    s().updateToken(m, { x: 600, y: 300, conditions: [] });
    await check('moved while lighting is off');
    s().setSceneLighting({ enabled: true });
    await check('lighting on');
    s().setSceneLighting({ litThreshold: 0.6, brightThreshold: 0.9, ambient: 0.5 });
    await check('thresholds');
    s().setSceneLighting({ sightOnDrop: false });
    await check('sight on drop off');

    const door = s().addWall({ type: 'door', p1: { x: 450, y: 450 }, p2: { x: 450, y: 2000 }, closed: true });
    await check('door added');
    s().toggleDoor(door);
    await check('door opened');
    s().updateToken(v, { vision: { enabled: true, senses: [{ id: 'dnd5e-darkvision', range: 60 }] } });
    await check('viewer back to darkvision');
    getHistoryStore(store).getState().undo();
    await check('undo');
    getHistoryStore(store).getState().undo();
    await check('undo again');
    getHistoryStore(store).getState().redo();
    await check('redo');
    s().setGrid({ ...s().grid, size: 100 });
    await check('grid size');

    // A token that follows its statblock.
    current.frontmatter[GOBLIN]!.senses = 'darkvision 60 ft., passive Perception 9';
    const g = s().addToken({ id: 'g', x: 900, y: 900, imagePath: 'g.png', statblockPath: GOBLIN, vision: { enabled: true } } as never);
    await check('statblock token added (unread)');
    await vi.waitFor(() => expect(CreatureIndex.forApp(current.app).get(GOBLIN)).toBeTruthy());
    await check('statblock read');
    expect((compare(w).fresh as { sight: { regions: { token: string; sense: string }[] } }).sight.regions.some((region) => region.token === g && region.sense === 'dnd5e-darkvision')).toBe(true);
    current.frontmatter[GOBLIN]!.senses = 'blindsight 30 ft. (blind beyond this radius)';
    current.metadata.trigger('changed', new TFile(GOBLIN));
    await vi.waitFor(() => expect(String(CreatureIndex.forApp(current.app).get(GOBLIN)?.fields.senses)).toContain('blind beyond'));
    await check('statblock edited');
    s().updateToken(g, { vision: { enabled: true, range: 100 } });
    await check('statblock token gets its own range');
    s().deleteToken(g);
    await check('statblock token deleted');

    // Another scene of the same collection.
    s().setMapLoading(true);
    s().setMapPath(OTHER);
    s().clearMapState();
    s().addToken({ id: 'v2', x: 200, y: 200, imagePath: 'v.png', vision: { enabled: true, senses: [{ id: 'dnd5e-tremorsense', range: 30 }] } } as never);
    s().addToken({ id: 'm2', x: 260, y: 200, imagePath: 'm.png', conditions: ['dnd5e-invisible'] } as never);
    s().setSceneLighting({ enabled: true });
    s().setMapLoading(false);
    await check('scene switched');
    // A scene outside every collection: generic senses, no conditions.
    s().setMapLoading(true);
    s().setMapPath('maps/loose.atlasmap');
    s().clearMapState();
    s().addToken({ id: 'v3', x: 200, y: 200, imagePath: 'v.png', vision: { enabled: true, darkvision: 30 } } as never);
    s().addToken({ id: 'm3', x: 260, y: 200, imagePath: 'm.png', conditions: ['dnd5e-invisible'] } as never);
    s().setSceneLighting({ enabled: true });
    s().setMapLoading(false);
    await check('scene outside a collection');

    expect(stale).toEqual([]);
  });
});

describe('the lighting controller reads the rules of its map\'s collection', () => {
  it('reads a linked statblock with the collection\'s senses', async () => {
    const { current, store, controller } = world();
    current.frontmatter[GOBLIN]!.senses = 'darkvision 60 ft., passive Perception 9';
    store.getState().setSceneLighting({ enabled: true, ambient: 0 });
    store.getState().addToken({ id: 'g', x: 900, y: 900, imagePath: 'g.png', statblockPath: GOBLIN, vision: { enabled: true } } as never);
    await vi.waitFor(() => expect(CreatureIndex.forApp(current.app).get(GOBLIN)).toBeTruthy());
    await nextFrame();
    await nextFrame();
    // The generic senses would read the line as `darkvision`: the collection's is D&D's.
    expect(controller.renderer.currentSight().regions.map((region) => [region.sense.id, Math.round(region.radius)])).toEqual([['sight', 2828], ['dnd5e-darkvision', 840]]);
  });

  it('names the ranges of a selected token as the collection names its senses, in what it measures in', async () => {
    const { store, controller, save } = world();
    const thermal = { ...dnd.rules.senses!.find((sense) => sense.id === 'dnd5e-darkvision')!, id: 'home-thermal', name: 'Thermal sight' };
    save({ senses: [...dnd.rules.senses!, thermal], gridDefaults: { ...structuredClone(dnd.rules.gridDefaults), unitType: 'meters', unitDistance: 1.5 } });
    store.getState().setSceneLighting({ enabled: true, ambient: 0 });
    const id = store.getState().addToken({ id: 'v', x: 900, y: 900, imagePath: 'v.png', vision: { enabled: true, range: 18, senses: [{ id: 'home-thermal', range: 7.5 }] } } as never);
    store.getState().setSelection([id]);
    await nextFrame();
    await nextFrame();
    expect(controller.sightAids.rings.labels()).toEqual(['Sight 18m', 'Thermal sight 7.5m']);
  });
});
