import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { rulesOfPreset } from '../../src/app/gameSystems/systemRules';
import { CollectionSettingsModal } from '../../src/app/react/components/CollectionSettingsModal';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { AssetService } from '../../src/app/services/AssetService';
import { SystemPresetService } from '../../src/app/services/SystemPresetService';
import type { CollectionSettings } from '../../src/app/types/collectionSettingsTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { withDynamicLighting } from '../mocks/experimentalFeatures';
import { memoryPresets } from '../mocks/memoryPresets';
import { AMMO, HP } from '../mocks/resourceFixtures';

const service = new SystemPresetService(memoryPresets());
vi.mock('../../src/app/react/hooks/useSystemPresets', () => ({
  useSystemPresets: () => ({ service, presets: service.list() }),
}));
vi.mock('../../src/app/services/collectionSystemSync', () => ({ syncCollectionSystem: vi.fn(async () => {}) }));

const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!;
const witchSight = {
  id: 'home-1', name: 'Witch sight', description: 'Sees in the dark within its range.', lineOfSight: true,
  sees: { bright: 'normal', dim: 'normal', dark: 'as-dim', magicalDark: 'none' }, look: 'colour', reveals: 'all', precise: true,
  seesInvisible: false, worksWhileBlinded: false, range: 'required', defaultRange: 30,
} as const;
const glowMoss = { id: 'home-light', name: 'Glow moss', bright: 5, dim: 15, color: '#7ee0a8', animation: 'none', kind: 'magical' } as const;
const fresh = (): CollectionSettings => ({ ...rulesOfPreset(dnd5e), systemPresetId: dnd5e.id }) as CollectionSettings;

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function open(settings: CollectionSettings, lighting = true): { saved: () => Partial<CollectionSettings> | undefined } {
  const { app } = createInMemoryApp({ files: {} });
  if (lighting) withDynamicLighting(app);
  let written: Partial<CollectionSettings> | undefined;
  const assets = {
    getCollectionSettings: () => settings,
    getCollections: async () => [{ id: 'dungeon', name: 'dungeon', version: '1.0.0', settings }],
    getAssets: async () => [],
    updateCollectionSettings: async (_id: string, next: Partial<CollectionSettings>) => { written = next; },
  };
  vi.spyOn(AssetService, 'getInstance').mockReturnValue(assets as unknown as AssetService);
  render(
    <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
      <CollectionSettingsModal isOpen onClose={() => {}} collectionId="dungeon" />
    </AtlasUIContext.Provider>,
  );
  return { saved: () => written };
}

const activeRow = (): HTMLElement => screen.getByRole('radio', { name: /D&D 5e/, checked: true });
const save = async (): Promise<void> => {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })); });
};

describe('the collection settings modal and what a collection has of its own', () => {
  it('shows a freshly applied system as not edited, and saving it stores no senses or lights of its own', async () => {
    const { saved } = open(fresh());
    await waitFor(() => expect(activeRow()).toBeTruthy());
    expect(within(activeRow()).queryByText('Edited')).toBeNull();
    await save();
    expect(saved()).toMatchObject({ systemPresetId: dnd5e.id, resources: dnd5e.rules.resources });
    expect(saved()).toHaveProperty('senses', undefined);
    expect(saved()).toHaveProperty('lightPresets', undefined);
    expect(saved()).toHaveProperty('defaultTokenVision', undefined);
  });

  const edits: Record<string, Partial<CollectionSettings>> = {
    senses: { senses: [...dnd5e.rules.senses!, witchSight] },
    'light presets': { lightPresets: [glowMoss] },
    'default token vision': { defaultTokenVision: { range: 60, senses: [{ id: 'dnd5e-darkvision', range: 60 }] } },
    resources: { resources: [{ ...HP }, { ...AMMO }] },
  };

  for (const [kind, patch] of Object.entries(edits)) {
    it(`marks the system as edited when only the collection's ${kind} differ, and Save keeps them`, async () => {
      const { saved } = open({ ...fresh(), ...patch });
      await waitFor(() => expect(within(activeRow()).getByText('Edited')).toBeTruthy());
      await save();
      expect(saved()).toMatchObject(patch);
    });
  }

  it('one save keeps senses, light presets, default vision and resources together', async () => {
    const all = Object.assign({}, ...Object.values(edits)) as Partial<CollectionSettings>;
    const { saved } = open({ ...fresh(), ...all });
    await waitFor(() => expect(within(activeRow()).getByText('Edited')).toBeTruthy());
    // Visit the tabs of both features without changing anything.
    for (const tab of ['Vision', 'Resources', 'Conditions', 'Game System']) fireEvent.click(screen.getByRole('button', { name: tab }));
    await save();
    expect(saved()).toMatchObject(all);
    expect(saved()!.defaultWidgets).toMatchObject({ hpBar: true });
  });

  it('has no Vision tab while dynamic lighting is switched off, and a save keeps what the collection has of its own', async () => {
    const all = Object.assign({}, ...Object.values(edits)) as Partial<CollectionSettings>;
    const { saved } = open({ ...fresh(), ...all }, false);
    await waitFor(() => expect(within(activeRow()).getByText('Edited')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Vision' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Conditions' })).toBeTruthy();
    await save();
    expect(saved()).toMatchObject(all);
  });

  it('applying the system again drops own senses, lights and default vision, takes the system\'s resources, and is not edited', async () => {
    const all = Object.assign({}, ...Object.values(edits)) as Partial<CollectionSettings>;
    const { saved } = open({ ...fresh(), ...all });
    await waitFor(() => expect(within(activeRow()).getByText('Edited')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Reset to D&D 5e' }));
    expect(within(activeRow()).queryByText('Edited')).toBeNull();
    await save();
    expect(saved()).toHaveProperty('senses', undefined);
    expect(saved()).toHaveProperty('lightPresets', undefined);
    expect(saved()).toHaveProperty('defaultTokenVision', undefined);
    expect(saved()!.resources?.map((resource) => resource.key)).toEqual(['hp']);
  });
});

describe('the collection settings modal and the initiative rules', () => {
  const cairn = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'Cairn')!;
  const rollField = (): HTMLInputElement => screen.getByLabelText<HTMLInputElement>('Initiative Roll');
  const type = (value: string): void => { fireEvent.change(rollField(), { target: { value } }); };
  const openWidgets = async (settings: CollectionSettings): Promise<{ saved: () => Partial<CollectionSettings> | undefined }> => {
    const opened = open(settings);
    await waitFor(() => expect(activeRow()).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Default Widgets' }));
    return opened;
  };

  it('keeps a roll as it is typed, cannot save half of one, and stores the finished roll as the collection\'s own', async () => {
    const { saved } = await openWidgets(fresh());
    expect(rollField().value).toBe('1d20');

    type('1d');
    expect(rollField().value).toBe('1d');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save' }).disabled).toBe(true);

    type('1d10 ');
    expect(rollField().value).toBe('1d10 ');
    await save();
    expect(saved()?.initiative).toEqual({ mode: 'turn-order', roll: '1d10', firstSide: 'players' });
  });

  it('stores nothing once the rules are the game system\'s again', async () => {
    const { saved } = await openWidgets(fresh());
    type('2d6');
    type('1d20');
    await save();
    expect(saved()).toHaveProperty('initiative', undefined);
  });

  it('shows a Cairn collection by sides without a roll, and as not edited', async () => {
    const { saved } = open({ ...rulesOfPreset(cairn), systemPresetId: cairn.id } as CollectionSettings);
    const cairnRow = (): HTMLElement => screen.getByRole('radio', { name: /Cairn/, checked: true });
    await waitFor(() => expect(cairnRow()).toBeTruthy());
    expect(within(cairnRow()).queryByText('Edited')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Default Widgets' }));
    expect(screen.queryByLabelText('Initiative Roll')).toBeNull();
    expect(screen.getByText('Acts First')).toBeTruthy();
    await save();
    expect(saved()).toHaveProperty('initiative', undefined);
  });
});

describe('the collection settings modal and the distance per square', () => {
  const distanceField = (): HTMLInputElement => screen.getAllByRole<HTMLInputElement>('textbox')[0]!;
  const saveButton = (): HTMLButtonElement => screen.getByRole<HTMLButtonElement>('button', { name: 'Save' });

  it('cannot save text that is no distance, also after the field and the tab were left, and saves a distance below 1', async () => {
    const { saved } = open(fresh());
    await waitFor(() => expect(activeRow()).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Grid & Measure' }));
    expect(distanceField().value).toBe('5');

    fireEvent.change(distanceField(), { target: { value: '0' } });
    fireEvent.blur(distanceField());
    expect(saveButton().disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Conditions' }));
    expect(saveButton().disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Grid & Measure' }));
    expect(distanceField().getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(distanceField(), { target: { value: '0,5' } });
    expect(saveButton().disabled).toBe(false);
    await save();
    expect(saved()?.gridDefaults?.unitDistance).toBe(0.5);
  });
});
