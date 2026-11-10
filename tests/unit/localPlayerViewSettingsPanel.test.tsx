// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SettingsService } from '../../src/app/services/SettingsService';
import { LocalPlayerViewSettingsPanel } from '../../src/app/react/components/command-palette/LocalPlayerViewSettingsPanel';

import { AMMO, HP, STRESS } from '../mocks/resourceFixtures';

const context = vi.hoisted(() => ({ settings: null as any, resources: [] as unknown[], collection: 'Own' as string | null, updateCollectionSettings: vi.fn(async () => undefined) }));
vi.mock('../../src/app/resources/useMapResources', () => ({ useMapResources: () => context.resources }));
vi.mock('../../src/app/react/ViewStoreContext', () => ({ useAtlasStore: (selector: (state: { mapPath: string }) => unknown) => selector({ mapPath: 'atlas-vtt/collections/Own/scenes/Cave.atlasmap' }) }));
vi.mock('../../src/app/services/AssetService', () => ({ AssetService: { getInstance: () => ({ getCollectionForMap: () => context.collection, getCollectionSettings: () => ({ conditions: [] }), updateCollectionSettings: context.updateCollectionSettings }) } }));
vi.mock('../../src/app/react/root/AtlasUIContext', async (original) => ({ ...(await original<object>()), useAtlasUI: () => ({ app: {}, view: { serviceManager: { getSettingsService: () => context.settings } } }) }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentActiveTab: vi.fn(), openPlayerWindow: vi.fn() }));
afterEach(() => { cleanup(); vi.useRealTimers(); context.resources = []; context.collection = 'Own'; context.updateCollectionSettings.mockClear(); });

it('updates every supported setting and follows settings changed elsewhere', () => {
  vi.useFakeTimers();
  context.settings = new SettingsService({} as any);
  render(<LocalPlayerViewSettingsPanel />);
  const settings = context.settings as SettingsService;
  for (const [label, key] of [
    ['Show initiative panel', 'showInitiative'], ['Show widgets', 'showWidgets'],
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
  // Players see the grid as the GM sets it on the map
  expect(screen.queryByRole('switch', { name: 'Show grid' })).toBeNull();
  expect(screen.getByText('Note previews are not shared with the player window.')).toBeTruthy();
});

it('offers the cursor switch only while online play is switched on', () => {
  context.settings = new SettingsService({} as never);
  const settings = context.settings as SettingsService;
  const { unmount } = render(<LocalPlayerViewSettingsPanel />);
  expect(screen.queryByRole('switch', { name: 'Show everyone\'s cursors' })).toBeNull();
  unmount();
  settings.setExperimental('onlinePlay', true);
  render(<LocalPlayerViewSettingsPanel />);
  const toggle = screen.getByRole('switch', { name: 'Show everyone\'s cursors' });
  expect(toggle.getAttribute('aria-checked')).toBe('false');
  fireEvent.click(toggle);
  expect(settings.getLocalPlayerViewSettings().showCursors).toBe(true);
});

it('offers a switch for every resource of the open scene\'s collection, bars and wheels alike', () => {
  context.settings = new SettingsService({} as never);
  context.resources = [{ ...HP, visibleToPlayers: true }, STRESS, AMMO];
  render(<LocalPlayerViewSettingsPanel />);

  expect(screen.getByRole('switch', { name: 'Show HP bars' }).getAttribute('aria-checked')).toBe('true');
  expect(screen.getByRole('switch', { name: 'Show Stress bars' }).getAttribute('aria-checked')).toBe('false');
  const ammo = screen.getByRole('switch', { name: 'Show Ammo wheels' });
  expect(ammo.getAttribute('aria-checked')).toBe('false');

  fireEvent.click(ammo);
  expect(context.updateCollectionSettings).toHaveBeenCalledWith('Own', {
    resources: [{ ...HP, visibleToPlayers: true }, STRESS, { ...AMMO, visibleToPlayers: true }],
  });
});

it('offers no resource switches for a scene outside every collection', () => {
  context.settings = new SettingsService({} as never);
  context.resources = [HP];
  context.collection = null;
  render(<LocalPlayerViewSettingsPanel />);
  expect(screen.queryByRole('switch', { name: 'Show HP bars' })).toBeNull();
});

it('lists all six sockets in their order, whatever the order of the list', () => {
  context.settings = new SettingsService({} as never);
  const named = (name: string, slot: number) => ({ ...AMMO, key: name.toLowerCase(), name, slot });
  context.resources = [named('Grit', 5), { ...AMMO, slot: 3 }, { ...STRESS, slot: 1 }, { ...HP, slot: 4 }, named('Luck', 2), named('Mana', 0)];
  render(<LocalPlayerViewSettingsPanel />);
  const names = ['Show Mana bars', 'Show Stress bars', 'Show Luck wheels', 'Show Ammo wheels', 'Show HP wheels', 'Show Grit wheels'];
  const toggles = names.map((name) => screen.getByRole('switch', { name }));
  expect(screen.getAllByRole('switch', { name: /bars|wheels/ })).toEqual(toggles);
});
