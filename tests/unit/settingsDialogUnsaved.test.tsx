// @vitest-environment jsdom
import React from 'react';
import type { App } from 'obsidian';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CampaignService } from '../../src/app/campaigns/CampaignService';
import { rulesOfPreset } from '../../src/app/gameSystems/systemRules';
import { CollectionSettingsModal } from '../../src/app/react/components/CollectionSettingsModal';
import { CampaignRulesDialog } from '../../src/app/react/components/dashboard/CampaignRulesDialog';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { SystemPresetService } from '../../src/app/services/SystemPresetService';
import type { CollectionSettings } from '../../src/app/types/collectionSettingsTypes';
import { memoryPresets } from '../mocks/memoryPresets';
import { DND5E, playedCampaignWorld, releasePlayedCampaignWorlds } from '../mocks/playedCampaignWorld';

const presetService = new SystemPresetService(memoryPresets());
vi.mock('../../src/app/react/hooks/useSystemPresets', () => ({
  useSystemPresets: () => ({ service: presetService, presets: presetService.list() }),
}));

const dnd5e = (): CollectionSettings => ({ ...rulesOfPreset(DND5E), systemPresetId: DND5E.id }) as CollectionSettings;

afterEach(() => {
  cleanup();
  releasePlayedCampaignWorlds();
  vi.restoreAllMocks();
});

const systemShown = (): Promise<void> => waitFor(() => expect(screen.getByRole('radio', { name: /D&D 5e/, checked: true })).toBeTruthy());

/** Opens the settings of the collection `dungeon`; `closes` counts how often the dialog asked to close. */
async function openCollection(): Promise<{ closes: () => number; show: (isOpen: boolean) => void }> {
  const world = playedCampaignWorld(dnd5e());
  const onClose = vi.fn();
  const dialog = (isOpen: boolean): React.ReactElement => (
    <AtlasUIContext.Provider value={{ app: world.app, view: null, pixiApp: null, renderer: null }}>
      <CollectionSettingsModal isOpen={isOpen} onClose={onClose} collectionId="dungeon" />
    </AtlasUIContext.Provider>
  );
  const { rerender } = render(dialog(true));
  await systemShown();
  return { closes: () => onClose.mock.calls.length, show: (isOpen) => rerender(dialog(isOpen)) };
}

/** Opens the game system of the campaign `Saga`. */
function openCampaign(): () => number {
  const world = playedCampaignWorld(dnd5e());
  const service = new CampaignService(world.campaigns);
  const app: App = world.app;
  const onClose = vi.fn();
  render(
    <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
      <CampaignRulesDialog app={app} campaign={service.get('saga')!} service={service} onClose={onClose} />
    </AtlasUIContext.Provider>,
  );
  return () => onClose.mock.calls.length;
}

const pressBeside = (): void => { fireEvent.click(document.querySelector('.atlas-collection-settings-backdrop')!); };
const pressEscape = (): void => { fireEvent.keyDown(document, { key: 'Escape' }); };
const openTab = (name: string): void => { fireEvent.click(screen.getByRole('button', { name })); };
const addCondition = (): void => {
  openTab('Conditions');
  fireEvent.click(screen.getByRole('button', { name: 'Add condition' }));
};

describe('a settings dialog and what was not saved', () => {
  it('closes on a press beside it and on Escape while nothing was changed', async () => {
    const { closes } = await openCollection();
    pressBeside();
    expect(closes()).toBe(1);
    pressEscape();
    expect(closes()).toBe(2);
  });

  it('still counts as unchanged after every tab was looked at', async () => {
    const { closes } = await openCollection();
    for (const tab of ['Dice', 'Grid and measurement', 'Vision', 'Default widgets', 'Conditions', 'Resources', 'Creature filters', 'Random tables', 'Game system']) openTab(tab);
    pressBeside();
    expect(closes()).toBe(1);
  });

  it('stays open on a press beside it and on Escape once a condition was added, named or not', async () => {
    const { closes } = await openCollection();
    addCondition();
    pressBeside();
    pressEscape();
    expect(closes()).toBe(0);
    expect(screen.getByRole('dialog')).toBeTruthy();

    fireEvent.change(screen.getAllByPlaceholderText('Condition name').at(-1)!, { target: { value: 'Dazed' } });
    pressBeside();
    pressEscape();
    expect(closes()).toBe(0);
  });

  it('keeps Cancel and the close button as the ways out of a changed dialog', async () => {
    const { closes } = await openCollection();
    addCondition();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(closes()).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(closes()).toBe(2);
  });

  it('closes on a press beside it again once the change was taken back', async () => {
    const { closes } = await openCollection();
    addCondition();
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove condition' }).at(-1)!);
    pressBeside();
    expect(closes()).toBe(1);
  });

  it('opens unchanged again after a changed dialog was cancelled', async () => {
    const { closes, show } = await openCollection();
    addCondition();
    show(false);
    show(true);
    // The dialog remembers its tab, and no longer holds the condition that was dropped.
    expect(screen.queryAllByPlaceholderText('Condition name')).toHaveLength(DND5E.rules.conditions.length);
    pressBeside();
    expect(closes()).toBe(1);
  });

  it('opens unchanged again after a change was saved', async () => {
    const { closes, show } = await openCollection();
    addCondition();
    fireEvent.change(screen.getAllByPlaceholderText('Condition name').at(-1)!, { target: { value: 'Dazed' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })); });
    expect(closes()).toBe(1);
    show(false);
    show(true);
    expect(screen.getByDisplayValue('Dazed')).toBeTruthy();
    pressBeside();
    expect(closes()).toBe(2);
  });

  it('holds a campaign\'s game system to the same rule', () => {
    const closes = openCampaign();
    pressBeside();
    expect(closes()).toBe(1);

    addCondition();
    pressBeside();
    pressEscape();
    expect(closes()).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(closes()).toBe(2);
  });

  it('counts a campaign that gives up its game system as changed', () => {
    const closes = openCampaign();
    fireEvent.click(screen.getByRole('radio', { name: /Every map plays by its collection's rules/ }));
    pressBeside();
    pressEscape();
    expect(closes()).toBe(0);
  });
});
