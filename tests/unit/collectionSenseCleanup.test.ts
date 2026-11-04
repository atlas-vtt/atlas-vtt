import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { newSense } from '../../src/app/gameSystems/senseEditing';
import { senseWithRole } from '../../src/app/gameSystems/senseRules';
import { GENERIC_SENSES } from '../../src/app/gameSystems/senses/generic';
import { ATLAS_VIEW_TYPE } from '../../src/app/atlasViewType';
import { AssetService } from '../../src/app/services/AssetService';
import { dropUnknownSenses, dropUnknownSensesFromJson, removeUndefinedSenses } from '../../src/app/services/collectionSenseCleanup';
import { sceneSnapshotFolder } from '../../src/app/snapshots/snapshotPaths';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import type { TokenEntity } from '../../src/app/types';
import type { CollectionSettings } from '../../src/app/types/collectionSettingsTypes';
import type { TokenVision } from '../../src/app/types/lightingTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const SCENE = 'atlas-vtt/collections/heist/scenes/Vault.atlasmap';
const OTHER_COLLECTION_SCENE = 'atlas-vtt/collections/other/scenes/Inn.atlasmap';
const SNAPSHOT = `${sceneSnapshotFolder('heist', 'scene-vault')}/s1.json`;

const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!;
const darkvision = senseWithRole(dnd5e.rules.senses!, 'darkvision').id;
const genericDarkvision = senseWithRole(GENERIC_SENSES, 'darkvision').id;
const witchSight = { ...newSense('home-witch-sight'), name: 'Witch sight' };
const GONE = 'home-deleted';

type Visions = Record<string, TokenVision | undefined>;

const envelope = (visions: Visions): Record<string, unknown> => ({
  version: 4,
  state: { objects: { tokens: Object.fromEntries(Object.entries(visions).map(([id, vision]) => [id, { id, ...(vision && { vision }) }])) } },
});

const visionsIn = (json: string): Visions =>
  Object.fromEntries(Object.entries(JSON.parse(json).state.objects.tokens as Record<string, { vision?: TokenVision }>).map(([id, token]) => [id, token.vision]));

afterEach(() => vi.restoreAllMocks());

describe('dropUnknownSenses', () => {
  const known = [...dnd5e.rules.senses!, witchSight];

  it('takes away the senses the collection does not define and keeps the others with their ranges', () => {
    const tokens: Record<string, { vision?: TokenVision }> = {
      a: { vision: { enabled: true, range: 60, senses: [{ id: darkvision, range: 60 }, { id: GONE, range: 30 }, { id: witchSight.id }] } },
      b: { vision: { enabled: false, senses: [{ id: darkvision }] } },
      c: {},
    };
    expect(dropUnknownSenses(tokens, known)).toBe(true);
    expect(tokens.a!.vision).toEqual({ enabled: true, range: 60, senses: [{ id: darkvision, range: 60 }, { id: witchSight.id }] });
    expect(tokens.b!.vision).toEqual({ enabled: false, senses: [{ id: darkvision }] });
    expect(dropUnknownSenses(tokens, known)).toBe(false);
  });

  it('leaves a token whose every sense is gone without a list, so it follows its statblock again', () => {
    const tokens = { a: { vision: { enabled: true, senses: [{ id: GONE }] } as TokenVision } };
    expect(dropUnknownSenses(tokens, known)).toBe(true);
    expect(tokens.a.vision).toEqual({ enabled: true });
  });

  it('keeps a list that was empty already, the old distances and the generic senses every collection can use', () => {
    const tokens: Record<string, { vision?: TokenVision }> = {
      none: { vision: { enabled: true, senses: [] } },
      old: { vision: { enabled: true, darkvision: 60 } },
      generic: { vision: { enabled: true, senses: [{ id: genericDarkvision, range: 30 }] } },
    };
    const before = structuredClone(tokens);
    expect(dropUnknownSenses(tokens, known)).toBe(false);
    expect(tokens).toEqual(before);
  });

  it('leaves JSON without undefined senses untouched', () => {
    expect(dropUnknownSensesFromJson(JSON.stringify(envelope({ a: { enabled: true, senses: [{ id: darkvision }] } })), known)).toBeNull();
  });
});

describe('removeUndefinedSenses', () => {
  function vault(settings: Partial<CollectionSettings>, openViews: unknown[] = []) {
    const { app, files } = createInMemoryApp({
      files: {
        [SCENE]: JSON.stringify(envelope({ a: { enabled: true, senses: [{ id: darkvision, range: 60 }, { id: GONE }] }, b: { enabled: true, senses: [{ id: GONE }] } })),
        [OTHER_COLLECTION_SCENE]: JSON.stringify(envelope({ c: { enabled: true, senses: [{ id: GONE }] } })),
        [SNAPSHOT]: JSON.stringify({ format: 1, id: 's1', name: 'Before the heist', createdAt: 1, ...envelope({ a: { enabled: true, senses: [{ id: GONE, range: 10 }, { id: witchSight.id }] } }) }),
      },
    });
    app.workspace = { getLeavesOfType: () => openViews } as never;
    const updateCollectionSettings = vi.fn(async () => undefined);
    vi.spyOn(AssetService, 'getInstance').mockReturnValue({
      getCollectionSettings: () => ({ conditions: [], ...settings }),
      getCollectionForMap: (path: string) => (path.includes('/heist/') ? 'heist' : 'other'),
      updateCollectionSettings,
    } as never);
    return { app, files, updateCollectionSettings };
  }

  it('cleans the scenes and snapshots of the collection and nothing else', async () => {
    const { app, files } = vault({ systemPresetId: dnd5e.id, senses: [...dnd5e.rules.senses!, witchSight] });
    await removeUndefinedSenses(app as never, 'heist', BUILT_IN_SYSTEM_PRESETS);
    expect(visionsIn(files.get(SCENE)!)).toEqual({ a: { enabled: true, senses: [{ id: darkvision, range: 60 }] }, b: { enabled: true } });
    expect(visionsIn(files.get(SNAPSHOT)!)).toEqual({ a: { enabled: true, senses: [{ id: witchSight.id }] } });
    expect(visionsIn(files.get(OTHER_COLLECTION_SCENE)!)).toEqual({ c: { enabled: true, senses: [{ id: GONE }] } });
  });

  it('takes the senses of a game system the collection left off its tokens', async () => {
    const { app, files } = vault({ systemPresetId: BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'Pathfinder 2e')!.id });
    await removeUndefinedSenses(app as never, 'heist', BUILT_IN_SYSTEM_PRESETS);
    expect(visionsIn(files.get(SCENE)!)).toEqual({ a: { enabled: true }, b: { enabled: true } });
  });

  it('takes a deleted sense out of what new tokens start with', async () => {
    const defaults = { range: 60, senses: [{ id: GONE, range: 30 }, { id: darkvision, range: 60 }] };
    const { app, updateCollectionSettings } = vault({ systemPresetId: dnd5e.id, defaultTokenVision: defaults });
    await removeUndefinedSenses(app as never, 'heist', BUILT_IN_SYSTEM_PRESETS);
    expect(updateCollectionSettings).toHaveBeenCalledWith('heist', { defaultTokenVision: { range: 60, senses: [{ id: darkvision, range: 60 }] } });
  });

  it('writes no settings when the default names only senses the collection has', async () => {
    const { app, updateCollectionSettings } = vault({ systemPresetId: dnd5e.id, defaultTokenVision: { senses: [{ id: darkvision }] } });
    await removeUndefinedSenses(app as never, 'heist', BUILT_IN_SYSTEM_PRESETS);
    expect(updateCollectionSettings).not.toHaveBeenCalled();
  });

  it('cleans an open map in its store, without an undo step, and saves it', async () => {
    const { app: storeApp } = createInMemoryApp();
    const store = createViewAtlasStore(storeApp, `sense-cleanup-${Math.random()}`);
    const token = (id: string, vision: TokenVision): TokenEntity => ({ id, kind: 'token', imagePath: `${id}.png`, x: 0, y: 0, vision });
    store.setState({
      persistenceEnabled: false, mapPath: SCENE, mapLoaded: true,
      objects: { ...store.getState().objects, tokens: { a: token('a', { enabled: true, senses: [{ id: darkvision, range: 60 }, { id: GONE }] }), b: token('b', { enabled: true, senses: [{ id: darkvision }] }) } },
    });
    const history = getHistoryStore(store)!;
    history.getState().clear();
    const saveMap = vi.fn(async () => undefined);
    const view = { getViewType: () => ATLAS_VIEW_TYPE, atlasStore: store, getStore: () => store, saveMap };
    const { app } = vault({ systemPresetId: dnd5e.id }, [{ view }]);
    const before = store.getState().objects.tokens.b;

    await removeUndefinedSenses(app as never, 'heist', BUILT_IN_SYSTEM_PRESETS);

    expect(store.getState().objects.tokens.a!.vision).toEqual({ enabled: true, senses: [{ id: darkvision, range: 60 }] });
    expect(store.getState().objects.tokens.b).toBe(before);
    expect(history.getState().pastStates).toHaveLength(0);
    expect(saveMap).toHaveBeenCalledOnce();
  });
});
