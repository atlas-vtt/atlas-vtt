import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SettingsService } from '../../src/app/services/SettingsService';
import { LocalPlayerViewSettingsPanel } from '../../src/app/react/components/command-palette/LocalPlayerViewSettingsPanel';

import { AMMO, HP, STRESS } from '../mocks/resourceFixtures';

const context = vi.hoisted(() => ({ settings: null as any, resources: [] as unknown[], collection: 'Own' as string | null, updateCollectionSettings: vi.fn(async () => undefined) }));
vi.mock('../../src/app/resources/useMapResources', () => ({ useMapResources: () => context.resources }));
vi.mock('../../src/app/react/ViewStoreContext', () => ({ useAtlasStore: (selector: (state: { mapPath: string }) => unknown) => selector({ mapPath: 'atlas-vtt/collections/Own/scenes/Cave.atlasmap' }) }));
vi.mock('../../src/app/services/AssetService', () => ({ AssetService: { getInstance: () => ({ getCollectionForMap: () => context.collection, updateCollectionSettings: context.updateCollectionSettings }) } }));
vi.mock('../../src/app/react/root/AtlasUIContext', () => ({ useAtlasUI: () => ({ app: {}, view: { serviceManager: { getSettingsService: () => context.settings } } }) }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentActiveTab: vi.fn(), openPlayerWindow: vi.fn() }));
afterEach(() => { cleanup(); vi.useRealTimers(); context.resources = []; context.collection = 'Own'; context.updateCollectionSettings.mockClear(); });

it('updates every supported setting and follows settings changed elsewhere', () => {
  vi.useFakeTimers();
  context.settings = new SettingsService({} as any);
  render(<LocalPlayerViewSettingsPanel />);
  const settings = context.settings as SettingsService;
  for (const [label, key] of [
    ['Show initiative panel', 'showInitiative'], ['Show grid', 'showGrid'], ['Show widgets', 'showWidgets'],
    ['Show nameplates', 'showTokenNameplates'], ['Show dice rolls', 'showDiceRolls'],
  ] as const) {
    const toggle = screen.getByRole('switch', { name: label });
    const before = settings.getLocalPlayerViewSettings()[key];
    fireEvent.click(toggle);
    expect(settings.getLocalPlayerViewSettings()[key]).toBe(!before);
    act(() => settings.setLocalPlayerViewSettings({ [key]: before }));
    expect(toggle.getAttribute('aria-checked')).toBe(String(before));
  }
  expect(screen.queryByRole('switch', { name: 'Show note previews' })).toBeNull();
  expect(screen.getByText('Note previews are not shared with the player window.')).toBeTruthy();
});

it('offers the bar switches the player view always had, for the bars of the open scene\'s collection', () => {
  context.settings = new SettingsService({} as never);
  context.resources = [{ ...HP, visibleToPlayers: true }, STRESS, AMMO];
  render(<LocalPlayerViewSettingsPanel />);

  expect(screen.getByRole('switch', { name: 'Show HP bars' }).getAttribute('aria-checked')).toBe('true');
  const stress = screen.getByRole('switch', { name: 'Show Stress bars' });
  expect(stress.getAttribute('aria-checked')).toBe('false');
  // Wheels show on hover and selection, which the player window has not
  expect(screen.queryByRole('switch', { name: /Ammo/ })).toBeNull();

  fireEvent.click(stress);
  expect(context.updateCollectionSettings).toHaveBeenCalledWith('Own', {
    resources: [{ ...HP, visibleToPlayers: true }, { ...STRESS, visibleToPlayers: true }, AMMO],
  });
});

it('offers no bar switches for a scene outside every collection', () => {
  context.settings = new SettingsService({} as never);
  context.resources = [HP];
  context.collection = null;
  render(<LocalPlayerViewSettingsPanel />);
  expect(screen.queryByRole('switch', { name: 'Show HP bars' })).toBeNull();
});

it('offers a switch for the resources in the bar sockets, wherever they are in the list', () => {
  context.settings = new SettingsService({} as never);
  context.resources = [{ ...AMMO, slot: 3 }, { ...STRESS, slot: 1 }, { ...HP, slot: 4 }];
  render(<LocalPlayerViewSettingsPanel />);
  expect(screen.getByRole('switch', { name: 'Show Stress bars' })).toBeTruthy();
  expect(screen.queryByRole('switch', { name: /HP|Ammo/ })).toBeNull();
});
