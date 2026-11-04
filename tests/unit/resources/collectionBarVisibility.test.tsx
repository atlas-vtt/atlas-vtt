// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../../src/app/gameSystems/builtInPresets';
import { rulesOfPreset } from '../../../src/app/gameSystems/systemRules';
import { useCollectionSettingsDraft } from '../../../src/app/react/components/collection-settings/useCollectionSettingsDraft';
import { AMMO, HP, STRESS } from '../../mocks/resourceFixtures';
import { barsToShowOnScenes } from '../../../src/app/resources/sceneVisibility';
import { AssetService } from '../../../src/app/services/AssetService';
import { showBarsOnCollectionScenes } from '../../../src/app/services/collectionBarVisibility';
import { newSceneFile } from '../../../src/app/services/newSceneFile';
import { ATLAS_VIEW_TYPE } from '../../../src/app/atlasViewType';
import type { CollectionSettings } from '../../../src/app/types/collectionSettingsTypes';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

const daggerheart = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'Daggerheart')!;
const SCENE = 'atlas-vtt/collections/old/scenes/Keep.atlasmap';
const sceneFile = (tokenSettings: Record<string, unknown>): string => JSON.stringify({ version: 4, state: { tokenSettings, objects: { tokens: {} } } });

/** A Daggerheart collection as an older one holds it: its rules set, its scenes as they were written then. */
const oldCollection: CollectionSettings = { ...structuredClone(daggerheart.rules), conditions: [], systemPresetId: daggerheart.id };

function draftFor(settings: CollectionSettings) {
  const assets = { getCollectionSettings: () => settings } as unknown as AssetService;
  return renderHook(() => useCollectionSettingsDraft(assets, 'old', true));
}

function vaultWith(scene: string, otherFiles: Record<string, string> = {}) {
  const { app, files } = createInMemoryApp({ files: { [SCENE]: scene, ...otherFiles } });
  app.workspace = { getLeavesOfType: () => [] } as any;
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({ getCollectionForMap: () => 'old' } as any);
  return { app, files };
}

afterEach(() => vi.restoreAllMocks());

describe('resetting a system shows its bars on the collection\'s scenes (#566)', () => {
  it('shows Stress on a scene that hides it, where a new collection\'s scene never did', async () => {
    const fresh = newSceneFile({ ...rulesOfPreset(daggerheart), conditions: [] } as CollectionSettings, null);
    expect(fresh.state.tokenSettings.hiddenResources).toEqual([]);

    const { app, files } = vaultWith(sceneFile({ showNameplates: true, showHPBars: true, showStressBars: false }));
    const { result } = draftFor(oldCollection);
    act(() => result.current.applyPreset(daggerheart));

    await showBarsOnCollectionScenes(app as any, 'old', result.current.barsToShowOnScenes());

    expect(JSON.parse(files.get(SCENE)!).state.tokenSettings)
      .toMatchObject({ showNameplates: true, showHPBars: true, showStressBars: true, hiddenResources: [] });
  });

  it('keeps every other resource a scene hides', async () => {
    const { app, files } = vaultWith(sceneFile({ showHPBars: false, showStressBars: false, hiddenResources: ['ammo'] }));

    await showBarsOnCollectionScenes(app as any, 'old', ['stress']);

    expect(JSON.parse(files.get(SCENE)!).state.tokenSettings)
      .toMatchObject({ showHPBars: false, showStressBars: true, hiddenResources: ['ammo', 'hp'] });
  });

  it('leaves a scene that hides none of them as it is', async () => {
    const content = sceneFile({ showHPBars: true, showStressBars: true, hiddenResources: [] });
    const { app, files } = vaultWith(content);

    await showBarsOnCollectionScenes(app as any, 'old', ['stress']);

    expect(files.get(SCENE)).toBe(content);
  });

  it('shows the bar at once on an open map', async () => {
    const { app } = vaultWith(sceneFile({ showHPBars: true, showStressBars: false }));
    const setTokenSettings = vi.fn();
    const state = { mapPath: SCENE, mapLoaded: true, isPlayerView: false, tokenSettings: { showNameplates: true, hiddenResources: ['stress', 'ammo'] }, setTokenSettings };
    const store = { getState: () => state };
    const view = { getViewType: () => ATLAS_VIEW_TYPE, atlasStore: store, getStore: () => store, saveMap: vi.fn(async () => undefined) };
    app.workspace = { getLeavesOfType: () => [{ view }] } as any;

    await showBarsOnCollectionScenes(app as any, 'old', ['stress']);

    expect(setTokenSettings).toHaveBeenCalledWith({ showNameplates: true, hiddenResources: ['ammo'] });
    expect(view.saveMap).toHaveBeenCalled();
  });

  it('shows the bar in the scene\'s snapshots, which restoring would otherwise hide again', async () => {
    const snapshot = 'atlas-vtt/collections/old/snapshots/scene-1/snap.json';
    const content = JSON.stringify({ format: 1, id: 's', name: 'Before', createdAt: 1, state: { tokenSettings: { showHPBars: true, showStressBars: false } } });
    const { app, files } = vaultWith(sceneFile({ showHPBars: true, showStressBars: false }), { [snapshot]: content });

    await showBarsOnCollectionScenes(app as any, 'old', ['stress']);

    expect(JSON.parse(files.get(snapshot)!).state.tokenSettings).toMatchObject({ showStressBars: true, hiddenResources: [] });
  });

  it('saving the dialog without touching the system changes no scene: the switch is the GM\'s', () => {
    const { result } = draftFor(oldCollection);
    expect(result.current.barsToShowOnScenes()).toEqual([]);
  });
});

describe('barsToShowOnScenes', () => {
  const on = { hpBar: true, stressBar: true };

  it('shows a bar whose resource just came, with or without a system', () => {
    expect(barsToShowOnScenes(on, [HP], [HP, STRESS], false)).toEqual(['stress']);
    expect(barsToShowOnScenes(on, [STRESS], [HP, STRESS], false)).toEqual(['hp']);
  });

  it('shows Stress when the system is applied, and leaves a hidden HP bar that stayed to the GM', () => {
    expect(barsToShowOnScenes(on, [HP, STRESS], [HP, STRESS], true)).toEqual(['stress']);
  });

  it('never shows what the rules do not define or a new scene would hide', () => {
    expect(barsToShowOnScenes(on, [HP, AMMO], [HP, AMMO], true)).toEqual([]);
    expect(barsToShowOnScenes({ hpBar: true, stressBar: false }, [HP], [HP, STRESS], true)).toEqual([]);
  });
});
