import React from 'react';
import type { App } from 'obsidian';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rulesOfPreset } from '../../src/app/gameSystems/systemRules';
import { CollectionSettingsModal } from '../../src/app/react/components/CollectionSettingsModal';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { SystemPresetService } from '../../src/app/services/SystemPresetService';
import type { CollectionSettings } from '../../src/app/types/collectionSettingsTypes';
import { fakeGridView, renderGridPanel } from '../helpers/gridSettingsPanel';
import { memoryPresets } from '../mocks/memoryPresets';
import { DND5E, DUNGEON_MAP, playedCampaignWorld, releasePlayedCampaignWorlds } from '../mocks/playedCampaignWorld';

const presetService = new SystemPresetService(memoryPresets());
vi.mock('../../src/app/react/hooks/useSystemPresets', () => ({
  useSystemPresets: () => ({ service: presetService, presets: presetService.list() }),
}));

const NOTICE = 'While Saga is played, every map uses its game system.';

/** The 5e collection `dungeon`, measuring in metres, beside the 5e campaign `saga`, which measures in feet. */
function world(): ReturnType<typeof playedCampaignWorld> {
  const dungeon: CollectionSettings = { ...rulesOfPreset(DND5E), systemPresetId: DND5E.id };
  dungeon.gridDefaults = { ...dungeon.gridDefaults!, unitType: 'meters', unitDistance: 1.5 };
  return playedCampaignWorld(dungeon);
}

afterEach(() => {
  cleanup();
  releasePlayedCampaignWorlds();
  vi.restoreAllMocks();
});

function openSettings(app: App): void {
  render(
    <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
      <CollectionSettingsModal isOpen onClose={() => {}} collectionId="dungeon" initialTab="grid" />
    </AtlasUIContext.Provider>,
  );
}

const tab = (name: string): HTMLElement => screen.getByRole('button', { name });

describe('a collection\'s rules while a campaign with a game system is played', () => {
  it('say nothing while no campaign is played, or one without a system', () => {
    const { app, play, campaigns } = world();
    openSettings(app);
    expect(screen.queryByText(NOTICE)).toBeNull();
    act(() => {
      campaigns.update('saga', ({ system: _system, ...rest }) => rest);
      play.play('saga');
    });
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('say on every rules tab that the campaign\'s system applies, and on none of the collection\'s own', () => {
    const { app, play } = world();
    openSettings(app);
    act(() => play.play('saga'));
    expect(screen.getByText(NOTICE)).toBeTruthy();
    for (const name of ['Game System', 'Dice', 'Conditions', 'Resources']) {
      fireEvent.click(tab(name));
      expect(screen.getByText(NOTICE)).toBeTruthy();
    }
    fireEvent.click(tab('Creature Filters'));
    expect(screen.queryByText(NOTICE)).toBeNull();
    act(() => play.stop());
    fireEvent.click(tab('Grid & Measure'));
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('open the campaign\'s game system on the same tab, and come back to the collection\'s when it closes', async () => {
    const { app, play, storedSystem } = world();
    play.play('saga');
    openSettings(app);
    fireEvent.click(screen.getByRole('button', { name: 'Edit campaign rules' }));

    expect(screen.getByRole('heading', { name: 'Saga: Game System' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Feet' })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Feet' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Meters' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(storedSystem()?.gridDefaults.unitType).toBe('meters');

    await waitFor(() => expect(screen.getByRole('heading', { name: /dungeon/ })).toBeTruthy());
    expect(screen.getByText(NOTICE)).toBeTruthy();
  });
  it('say on Default Widgets, above the initiative rules, that the campaign\'s apply, and open them on its Initiative tab', () => {
    const { app, play } = world();
    play.play('saga');
    openSettings(app);
    fireEvent.click(tab('Default Widgets'));
    const notice = screen.getByText(NOTICE);
    expect(notice.compareDocumentPosition(screen.getByText('Initiative Tracker')) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit campaign rules' }));
    expect(screen.getByRole('heading', { name: 'Saga: Game System' })).toBeTruthy();
    expect(tab('Initiative').classList.contains('atlas-active')).toBe(true);
  });

  it('lose the campaign\'s dialog when the campaign stops, and do not bring it back when it is played again', () => {
    const { app, play } = world();
    play.play('saga');
    openSettings(app);
    fireEvent.click(screen.getByRole('button', { name: 'Edit campaign rules' }));
    expect(screen.getByRole('heading', { name: 'Saga: Game System' })).toBeTruthy();
    act(() => play.stop());
    expect(screen.queryByRole('heading', { name: 'Saga: Game System' })).toBeNull();
    act(() => play.play('saga'));
    expect(screen.queryByRole('heading', { name: 'Saga: Game System' })).toBeNull();
    expect(screen.getByText(NOTICE)).toBeTruthy();
  });
});

describe('the unit a scene measures in, set from the map', () => {
  const grid = { enabled: true, size: 70, offsetX: 0, offsetY: 0, opacity: 1, measurementType: 'units', unitType: 'feet', unitDistance: 5 } as const;
  const renderPanel = (app: App): void => renderGridPanel(fakeGridView({ ...grid }, { mapPath: DUNGEON_MAP, app }));

  it('is the played campaign\'s, and set there', async () => {
    const { app, play, collectionWrites, storedSystem } = world();
    play.play('saga');
    renderPanel(app);
    expect(screen.getByText('For every map while the campaign is played')).toBeTruthy();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Feet' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Meters' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Meters' })).toBeTruthy());
    expect(storedSystem()?.gridDefaults.unitType).toBe('meters');
    expect(collectionWrites).toEqual([]);
  });

  it('is the collection\'s while no campaign system applies, and follows Play', () => {
    const { app, play } = world();
    renderPanel(app);
    expect(screen.getByText('For every scene of the collection')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Meters' })).toBeTruthy();
    act(() => play.play('saga'));
    expect(screen.getByRole('button', { name: 'Feet' })).toBeTruthy();
  });
});
