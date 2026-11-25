// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SettingsService } from '../../src/app/services/SettingsService';
import { PlayerViewSettingsPanel } from '../../src/app/react/components/command-palette/PlayerViewSettingsPanel';

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
  render(<PlayerViewSettingsPanel />);
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

it('offers the cursor switch only while online play is switched on, in a section of its own', () => {
  context.settings = new SettingsService({} as never);
  const settings = context.settings as SettingsService;
  const { unmount } = render(<PlayerViewSettingsPanel />);
  expect(screen.queryByRole('switch', { name: 'Show everyone\'s cursors' })).toBeNull();
  expect(screen.getByRole('heading', { name: 'Player window and online' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Player window' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Online play' })).toBeNull();
  unmount();
  settings.setExperimental('onlinePlay', true);
  render(<PlayerViewSettingsPanel />);
  expect(screen.getByRole('heading', { name: 'Online play' })).toBeTruthy();
  const toggle = screen.getByRole('switch', { name: 'Show everyone\'s cursors' });
  expect(toggle.getAttribute('aria-checked')).toBe('false');
  fireEvent.click(toggle);
  expect(settings.getLocalPlayerViewSettings().showCursors).toBe(true);
});

it('offers Players may draw only while online play is switched on, off until the GM switches it on, and says what it does', () => {
  context.settings = new SettingsService({} as never);
  const settings = context.settings as SettingsService;
  const { unmount } = render(<PlayerViewSettingsPanel />);
  expect(screen.queryByRole('switch', { name: 'Players may draw' })).toBeNull();
  unmount();
  settings.setExperimental('onlinePlay', true);
  render(<PlayerViewSettingsPanel />);
  const toggle = screen.getByRole('switch', { name: 'Players may draw' });
  expect(toggle.getAttribute('aria-checked')).toBe('false');
  expect(screen.getByText('Online players get a Draw tool of their own. You can change and clear what they draw.')).toBeTruthy();
  fireEvent.click(toggle);
  expect(settings.getLocalPlayerViewSettings().playersDraw).toBe(true);
  expect(screen.getByRole('switch', { name: 'Players may draw' }).getAttribute('aria-checked')).toBe('true');
});

const audienceOf = (name: string): HTMLElement => screen.getByRole('radiogroup', { name: `Who players see ${name} on` });
const chosen = (name: string): string | null | undefined =>
  within(audienceOf(name)).getAllByRole('radio').find((radio) => radio.getAttribute('aria-checked') === 'true')?.textContent;

it('offers whose tokens players see each resource of the open scene\'s collection on, bars and wheels alike', () => {
  context.settings = new SettingsService({} as never);
  context.resources = [{ ...HP, visibleToPlayers: true }, STRESS, { ...AMMO, visibleToPlayers: false, visibleOnSide: 'opponents' }];
  render(<PlayerViewSettingsPanel />);

  expect([chosen('HP'), chosen('Stress'), chosen('Ammo')]).toEqual(['All', 'None', 'Foes']);

  fireEvent.click(within(audienceOf('Stress')).getByRole('radio', { name: 'Party' }));
  expect(context.updateCollectionSettings).toHaveBeenCalledWith('Own', {
    resources: [{ ...HP, visibleToPlayers: true }, { ...STRESS, visibleToPlayers: false, visibleOnSide: 'players' }, { ...AMMO, visibleToPlayers: false, visibleOnSide: 'opponents' }],
  });
  fireEvent.click(within(audienceOf('Ammo')).getByRole('radio', { name: 'All' }));
  expect(context.updateCollectionSettings).toHaveBeenLastCalledWith('Own', {
    resources: [{ ...HP, visibleToPlayers: true }, STRESS, { ...AMMO, visibleToPlayers: true }],
  });
});

it('offers no resource choices for a scene outside every collection', () => {
  context.settings = new SettingsService({} as never);
  context.resources = [HP];
  context.collection = null;
  render(<PlayerViewSettingsPanel />);
  expect(screen.queryByRole('radiogroup', { name: 'Who players see HP on' })).toBeNull();
});

it('lists all six sockets in their order, whatever the order of the list', () => {
  context.settings = new SettingsService({} as never);
  const named = (name: string, slot: number) => ({ ...AMMO, key: name.toLowerCase(), name, slot });
  context.resources = [named('Grit', 5), { ...AMMO, slot: 3 }, { ...STRESS, slot: 1 }, { ...HP, slot: 4 }, named('Luck', 2), named('Mana', 0)];
  render(<PlayerViewSettingsPanel />);
  const groups = ['Mana', 'Stress', 'Luck', 'Ammo', 'HP', 'Grit'].map(audienceOf);
  expect(screen.getAllByRole('radiogroup', { name: /^Who players see/ })).toEqual(groups);
});

it('lays the players\' initiative list out across the table from its switch, as a row at the top and at the bottom', () => {
  context.settings = new SettingsService({} as never);
  const settings = context.settings as SettingsService;
  render(<PlayerViewSettingsPanel />);
  const toggle = screen.getByRole('switch', { name: 'Horizontal initiative' });
  expect(toggle.getAttribute('aria-checked')).toBe('false');
  fireEvent.click(toggle);
  expect(settings.initiativeLayout()).toMatchObject({ edges: ['bottom'], facesPlayers: true });
  fireEvent.click(screen.getByRole('switch', { name: 'Horizontal initiative' }));
  expect(settings.initiativeLayout()).toMatchObject({ edges: ['right'], facesPlayers: false });
});

it('mirrors the players\' initiative list for the far side of the table, as a column or a row, keeping the other switch', () => {
  context.settings = new SettingsService({} as never);
  const settings = context.settings as SettingsService;
  render(<PlayerViewSettingsPanel />);
  const mirrored = (): HTMLElement => screen.getByRole('switch', { name: 'Mirrored initiative' });
  expect(mirrored().getAttribute('aria-checked')).toBe('false');
  fireEvent.click(mirrored());
  expect(settings.initiativeLayout()).toMatchObject({ edges: ['right', 'left'], facesPlayers: false });
  // Turned horizontal, it stays mirrored: a row at the top and one at the bottom
  fireEvent.click(screen.getByRole('switch', { name: 'Horizontal initiative' }));
  expect(settings.initiativeLayout()).toMatchObject({ edges: ['top', 'bottom'], facesPlayers: true });
  fireEvent.click(mirrored());
  expect(settings.initiativeLayout()).toMatchObject({ edges: ['bottom'], facesPlayers: true });
});

it('offers Players move only on their turn among online play\'s settings, off until the GM switches it on', () => {
  context.settings = new SettingsService({} as never);
  const settings = context.settings as SettingsService;
  const { unmount } = render(<PlayerViewSettingsPanel />);
  expect(screen.queryByRole('switch', { name: 'Players move only on their turn' })).toBeNull();
  unmount();
  settings.setExperimental('onlinePlay', true);
  render(<PlayerViewSettingsPanel />);
  const toggle = screen.getByRole('switch', { name: 'Players move only on their turn' });
  expect(toggle.getAttribute('aria-checked')).toBe('false');
  fireEvent.click(toggle);
  expect(settings.initiativeTurnOptions().movesOnTurn).toBe(true);
});
