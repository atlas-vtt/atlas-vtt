// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { BUILT_IN_SYSTEM_PRESETS } from '../../../../src/app/gameSystems/builtInPresets';
import { rulesOfPreset } from '../../../../src/app/gameSystems/systemRules';
import { CollectionSettingsModal } from '../../../../src/app/react/components/CollectionSettingsModal';
import { AtlasUIContext } from '../../../../src/app/react/root/AtlasUIContext';
import { AssetService } from '../../../../src/app/services/AssetService';
import { SystemPresetService } from '../../../../src/app/services/SystemPresetService';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import type { CollectionSettings } from '../../../../src/app/types/collectionSettingsTypes';
import { withStatblockEditor } from '../../../mocks/experimentalFeatures';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { memoryPresets } from '../../../mocks/memoryPresets';

const service = new SystemPresetService(memoryPresets());
vi.mock('../../../../src/app/react/hooks/useSystemPresets', () => ({
  useSystemPresets: () => ({ service, presets: service.list() }),
}));
vi.mock('../../../../src/app/services/collectionSystemSync', () => ({ syncCollectionSystem: vi.fn(async () => {}) }));

const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!;
const fresh = (): CollectionSettings => ({ ...rulesOfPreset(dnd5e), systemPresetId: dnd5e.id }) as CollectionSettings;
const apps: App[] = [];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const app of apps.splice(0)) TemplateLibrary.release(app);
});

interface Opened {
  saved: () => Partial<CollectionSettings> | undefined;
  onClose: ReturnType<typeof vi.fn>;
}

function open({ editor = true, onEditTemplate }: {
  editor?: boolean;
  onEditTemplate?: (templateId: string, collectionId: string) => void;
} = {}): Opened {
  const { app } = createInMemoryApp({ files: {}, folders: ['Bestiary', 'Bestiary/Hags'] });
  apps.push(app);
  if (editor) withStatblockEditor(app);
  const settings = fresh();
  let written: Partial<CollectionSettings> | undefined;
  const assets = {
    getCollectionSettings: () => settings,
    getCollections: async () => [{ id: 'marsh', name: 'marsh', version: '1.0.0', settings }],
    getAssets: async () => [],
    updateCollectionSettings: async (_id: string, next: Partial<CollectionSettings>) => { written = next; },
  };
  vi.spyOn(AssetService, 'getInstance').mockReturnValue(assets as unknown as AssetService);
  const onClose = vi.fn();
  render(
    <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
      <CollectionSettingsModal isOpen onClose={onClose} collectionId="marsh" {...(onEditTemplate && { onEditTemplate })} />
    </AtlasUIContext.Provider>,
  );
  return { saved: () => written, onClose };
}

const tabNames = (): string[] => Array.from(document.querySelectorAll('.atlas-collection-settings-tab')).map((tab) => tab.textContent ?? '');
const openStatblocks = async (): Promise<void> => {
  fireEvent.click(screen.getByRole('button', { name: 'Statblocks' }));
  await waitFor(() => expect(screen.getAllByRole('textbox', { name: 'Role name' })).toHaveLength(2));
};
const nameField = (index: number): HTMLElement => screen.getAllByRole('textbox', { name: 'Role name' })[index]!;
const saveButton = (): HTMLButtonElement => screen.getByRole('button', { name: 'Save' });
const save = async (): Promise<void> => {
  await act(async () => { fireEvent.click(saveButton()); });
};

describe('the collection settings\' Statblocks tab', () => {
  it('is not offered while the statblock editor is switched off', () => {
    open({ editor: false });
    expect(screen.queryByRole('button', { name: 'Statblocks' })).toBeNull();
    expect(tabNames()).toContain('Vision');
  });

  it('sits between Resources and Creature Filters while the editor is switched on', () => {
    open();
    const tabs = tabNames();
    expect(tabs.indexOf('Statblocks')).toBe(tabs.indexOf('Resources') + 1);
    expect(tabs.indexOf('Creature Filters')).toBe(tabs.indexOf('Statblocks') + 1);
  });

  it('saves an edited name as the collection\'s own roles', async () => {
    const { saved } = open();
    await openStatblocks();
    fireEvent.change(nameField(0), { target: { value: 'Beast' } });
    await save();
    expect(saved()?.statblockRoles).toEqual([
      { id: 'monster', name: 'Beast', templateId: 'builtin:5e-2024-monster' },
      { id: 'npc', name: 'NPC', templateId: 'builtin:5e-2024-monster' },
    ]);
  });

  it('saves a folder alone, leaving the roles the system\'s', async () => {
    const { saved } = open();
    await openStatblocks();
    fireEvent.change(screen.getByRole('combobox', { name: 'Folder for new statblocks of NPC' }), { target: { value: 'People' } });
    await save();
    expect(saved()).toMatchObject({ statblockRoles: undefined, statblockRoleFolders: { npc: 'People' } });
  });

  it('saves the folder of a role added in the dialog under the id the role is saved with', async () => {
    const { saved } = open();
    await openStatblocks();
    fireEvent.click(screen.getByRole('button', { name: 'Add role' }));
    fireEvent.change(nameField(2), { target: { value: 'Hag' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Folder for new statblocks of Hag' }), { target: { value: 'Bestiary/Hags' } });
    await save();
    expect(saved()?.statblockRoles?.[2]).toEqual({ id: 'hag', name: 'Hag', templateId: 'builtin:generic-creature' });
    expect(saved()?.statblockRoleFolders).toEqual({ hag: 'Bestiary/Hags' });
  });

  it('cannot save a role without a name, or two roles with one name', async () => {
    const { saved } = open();
    await openStatblocks();
    fireEvent.change(nameField(1), { target: { value: ' ' } });
    expect(saveButton().disabled).toBe(true);
    fireEvent.change(nameField(1), { target: { value: 'monster' } });
    expect(saveButton().disabled).toBe(true);
    await save();
    expect(saved()).toBeUndefined();
    fireEvent.change(nameField(1), { target: { value: 'Villager' } });
    expect(saveButton().disabled).toBe(false);
  });

  it('saves and closes the dialog before Edit opens the template, and not while it cannot save', async () => {
    const edit = vi.fn();
    const { saved, onClose } = open({ onEditTemplate: edit });
    await openStatblocks();
    fireEvent.change(nameField(1), { target: { value: '' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]!);
    await act(async () => {});
    expect(edit).not.toHaveBeenCalled();
    fireEvent.change(nameField(1), { target: { value: 'Villager' } });
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[1]!); });
    expect(saved()?.statblockRoles?.[1]).toMatchObject({ id: 'npc', name: 'Villager' });
    expect(onClose).toHaveBeenCalledOnce();
    expect(edit).toHaveBeenCalledWith('builtin:5e-2024-monster', 'marsh');
  });

  it('stays open when Escape closes a list in it, and closes on the next', async () => {
    const { onClose } = open();
    await openStatblocks();
    const field = screen.getByRole('combobox', { name: 'Folder for new statblocks of Monster' });
    fireEvent.focus(field);
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
