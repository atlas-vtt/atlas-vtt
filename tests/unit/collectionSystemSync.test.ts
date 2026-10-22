// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { AssetService } from '../../src/app/services/AssetService';
import { syncCollectionSystem } from '../../src/app/services/collectionSystemSync';
import { WidgetSyncService } from '../../src/app/services/WidgetSyncService';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const shadowdark = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'Shadowdark')!;
const torch = shadowdark.rules.widgets![0]!;
const SCENE = 'atlas-vtt/collections/dungeon/scenes/Crypt.atlasmap';
const scene = (conditions: string[]): string => JSON.stringify({ version: 4, state: { objects: { tokens: { a: { id: 'a', conditions } } } } });

afterEach(() => vi.restoreAllMocks());

function collection(presetId: string | undefined, widgets: Record<string, unknown>) {
  const settings = { conditions: presetId ? structuredClone(shadowdark.rules.conditions) : [], widgets, systemPresetId: presetId };
  const assets = {
    getCollectionSettings: () => settings,
    getCollectionForMap: () => 'dungeon',
    updateCollectionSettings: vi.fn(async () => undefined),
  };
  vi.spyOn(AssetService, 'getInstance').mockReturnValue(assets as any);
  return assets;
}

describe('syncCollectionSystem', () => {
  it('adds the system\'s widgets and removes old conditions from every scene', async () => {
    const { app, files } = createInMemoryApp({ files: { [SCENE]: scene(['dnd5e-prone', 'shadowdark-dying']) } });
    app.workspace = { getLeavesOfType: () => [] } as any;
    const assets = collection(shadowdark.id, {});

    await syncCollectionSystem(app as any, 'dungeon', BUILT_IN_SYSTEM_PRESETS);

    expect(assets.updateCollectionSettings).toHaveBeenCalledWith('dungeon', { widgets: { [torch.id]: { ...torch, order: 0 } } });
    expect(JSON.parse(files.get(SCENE)!).state.objects.tokens.a.conditions).toEqual(['shadowdark-dying']);
  });

  it('takes the senses the collection no longer defines off the tokens of every scene', async () => {
    const adapted = shadowdark.rules.senses![0]!.id;
    const token = { id: 'a', vision: { enabled: true, senses: [{ id: 'dnd5e-darkvision', range: 60 }, { id: adapted }] } };
    const { app, files } = createInMemoryApp({ files: { [SCENE]: JSON.stringify({ version: 4, state: { objects: { tokens: { a: token } } } }) } });
    app.workspace = { getLeavesOfType: () => [] } as any;
    collection(shadowdark.id, { [torch.id]: { ...torch, order: 0 } });

    await syncCollectionSystem(app as any, 'dungeon', BUILT_IN_SYSTEM_PRESETS);

    expect(JSON.parse(files.get(SCENE)!).state.objects.tokens.a.vision).toEqual({ enabled: true, senses: [{ id: adapted }] });
  });

  it('removes the old system\'s widgets through the widget sync while a map is open', async () => {
    const { app } = createInMemoryApp();
    app.workspace = { getLeavesOfType: () => [] } as any;
    collection(undefined, { [torch.id]: torch });
    const sync = new WidgetSyncService({ app } as any);
    const edit = vi.spyOn(sync, 'editCollectionWidgets');

    await syncCollectionSystem(app as any, 'dungeon', BUILT_IN_SYSTEM_PRESETS);

    const change = edit.mock.calls[0]![1];
    expect(change({ [torch.id]: torch })).toEqual({});
    sync.destroy();
  });
});
