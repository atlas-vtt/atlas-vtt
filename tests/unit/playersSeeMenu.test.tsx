// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SettingsService } from '../../src/app/services/SettingsService';
import { PlayersSeeMenu } from '../../src/app/packages/components/player-window-bar/PlayersSeeMenu';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { HP, STRESS } from '../mocks/resourceFixtures';

const context = vi.hoisted(() => ({ resources: [] as unknown[], updateCollectionSettings: vi.fn(async () => undefined) }));
vi.mock('../../src/app/resources/useMapResources', () => ({ useMapResources: () => context.resources }));
vi.mock('../../src/app/react/ViewStoreContext', () => ({ useAtlasStore: (selector: (state: { mapPath: string }) => unknown) => selector({ mapPath: 'atlas-vtt/collections/Own/scenes/Cave.atlasmap' }) }));
vi.mock('../../src/app/services/AssetService', () => ({ AssetService: { getInstance: () => ({ getCollectionForMap: () => 'Own', getCollectionSettings: () => ({ conditions: [] }), updateCollectionSettings: context.updateCollectionSettings }) } }));
vi.mock('../../src/app/react/root/AtlasUIContext', async (original) => ({ ...(await original<object>()), useAtlasUI: () => ({ app: {} }) }));
afterEach(() => { cleanup(); context.resources = []; context.updateCollectionSettings.mockClear(); });

const menu = (props: { windowOpen: boolean; online: boolean }): void => {
  const settings = new SettingsService({} as never);
  settings.setExperimental('onlinePlay', props.online);
  render(<TooltipProvider><PlayersSeeMenu open onToggle={() => {}} settings={settings} windowOpen={props.windowOpen} /></TooltipProvider>);
};
const group = (name: string): HTMLElement => screen.getByRole('region', { name });

it('groups what players see by where they see it: alike, the player window, online play', () => {
  menu({ windowOpen: true, online: true });
  expect(screen.getAllByRole('heading').map((heading) => heading.textContent)).toEqual(['Player window and online', 'Player window', 'Online play']);
  expect(within(group('Player window')).getByRole('switch', { name: 'Render up to 4K' })).toBeTruthy();
  expect(within(group('Online play')).getByRole('switch', { name: 'Show everyone\'s cursors' })).toBeTruthy();
  const modes = within(group('Online play')).getByRole('radiogroup', { name: 'Play mode' });
  expect(within(modes).getByRole('radio', { name: 'Token control' }).getAttribute('aria-checked')).toBe('true');
  expect(within(modes).getByRole('radio', { name: 'Remote control' }).getAttribute('aria-checked')).toBe('false');
});

it('shows the player window\'s group only while it is open, and online play\'s only while it is switched on', () => {
  menu({ windowOpen: false, online: false });
  expect(screen.queryByRole('region', { name: 'Player window' })).toBeNull();
  expect(screen.queryByRole('region', { name: 'Online play' })).toBeNull();
  expect(screen.queryByRole('switch', { name: 'Show everyone\'s cursors' })).toBeNull();
  expect(screen.queryByRole('switch', { name: 'Horizontal initiative' })).toBeNull();
});

it('lays the initiative list out on the player window only, its switches disabled while players see no list', () => {
  const settings = new SettingsService({} as never);
  settings.setLocalPlayerViewSettings({ showInitiative: false });
  render(<TooltipProvider><PlayersSeeMenu open onToggle={() => {}} settings={settings} windowOpen /></TooltipProvider>);
  expect(within(group('Player window')).getByRole('switch', { name: 'Horizontal initiative' })).toBeTruthy();
  expect(within(group('Player window and online')).queryByRole('switch', { name: 'Horizontal initiative' })).toBeNull();
  expect(within(group('Player window and online')).getByRole('switch', { name: 'Show initiative panel' })).toBeTruthy();
  expect(screen.getByRole('switch', { name: 'Horizontal initiative' }).getAttribute('aria-disabled')).toBe('true');
  expect(screen.getByRole('switch', { name: 'Mirrored initiative' }).getAttribute('aria-disabled')).toBe('true');
  expect(screen.getByRole('switch', { name: 'Show dice rolls' }).getAttribute('aria-disabled')).toBeNull();
});

it('chooses for each resource whose tokens players see it on', () => {
  context.resources = [{ ...HP, visibleToPlayers: true }, STRESS];
  menu({ windowOpen: true, online: false });
  const tokens = group('Player window and online');
  const hp = within(tokens).getByRole('radiogroup', { name: 'Who players see HP on' });
  expect(within(hp).getByRole('radio', { name: 'All' }).getAttribute('aria-checked')).toBe('true');
  fireEvent.click(within(hp).getByRole('radio', { name: 'Party' }));
  expect(context.updateCollectionSettings).toHaveBeenCalledWith('Own', {
    resources: [{ ...HP, visibleToPlayers: false, visibleOnSide: 'players' }, STRESS],
  });
});
