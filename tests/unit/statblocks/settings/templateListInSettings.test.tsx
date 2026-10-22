// @vitest-environment jsdom
import React from 'react';
import { MotionGlobalConfig } from 'framer-motion';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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
const apps: App[] = [];

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  Element.prototype.scrollIntoView = vi.fn();
});
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const app of apps.splice(0)) TemplateLibrary.release(app);
});

function open(): { events: string[]; onEditTemplate: ReturnType<typeof vi.fn> } {
  const { app } = createInMemoryApp({ files: {} });
  apps.push(app);
  withStatblockEditor(app);
  const settings = { ...rulesOfPreset(dnd5e), systemPresetId: dnd5e.id } as CollectionSettings;
  const events: string[] = [];
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({
    getCollectionSettings: () => settings,
    getCollections: async () => [{ id: 'marsh', name: 'marsh', version: '1.0.0', settings }],
    getAssets: async () => [],
    updateCollectionSettings: async () => { events.push('saved'); },
  } as unknown as AssetService);
  const onEditTemplate = vi.fn((templateId: string, collectionId: string) => { events.push(`edit ${templateId} for ${collectionId}`); });
  render(
    <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
      <CollectionSettingsModal isOpen onClose={() => events.push('closed')} collectionId="marsh" onEditTemplate={onEditTemplate} />
    </AtlasUIContext.Provider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Statblocks' }));
  return { events, onEditTemplate };
}

describe('the template list inside the collection settings', () => {
  it('saves the settings and closes the dialog before Open shows the template', async () => {
    const { events } = open();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Actions for 5E (2024 rules)' }), { key: 'Enter' });
    await act(async () => { fireEvent.click(await screen.findByRole('menuitem', { name: 'Open' })); });
    await waitFor(() => expect(events).toEqual(['saved', 'closed', 'edit builtin:5e-2024-monster for marsh']));
  });

  it('closes the gallery on Escape and leaves the settings open', async () => {
    const { events } = open();
    fireEvent.click(screen.getByRole('button', { name: 'New template' }));
    fireEvent.keyDown(screen.getByRole('radio', { name: '5E (2024 rules)' }), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New template' })).toBeNull());
    expect(screen.getByRole('dialog', { name: /Settings/ })).toBeTruthy();
    expect(events).toEqual([]);
  });
});
