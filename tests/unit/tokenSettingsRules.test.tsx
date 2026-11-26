// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AtlasView } from '../../src/app/atlas-view';
import { CampaignService } from '../../src/app/campaigns/CampaignService';
import { TokenSettingsPanel } from '../../src/app/react/components/command-palette/TokenSettingsPanel';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { CollectionSettings } from '../../src/app/types/collectionSettingsTypes';
import { DUNGEON_MAP, playedCampaignWorld, releasePlayedCampaignWorlds, type PlayedCampaignWorld } from '../mocks/playedCampaignWorld';
import { AMMO, ARMOR, HP, STRESS } from '../mocks/resourceFixtures';

const NOTICE = 'While Saga is played, every map uses its game system.';

/** A scene of the collection `dungeon`, which tracks four resources, beside the 5e campaign `saga`, which tracks hit points. */
function world(): PlayedCampaignWorld & { view: AtlasView } {
  const dungeon: CollectionSettings = { conditions: [], resources: [HP, STRESS, AMMO, ARMOR] };
  const played = playedCampaignWorld(dungeon);
  const store = createViewAtlasStore(played.app, 'token-settings-rules-test');
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath(DUNGEON_MAP);
  return { ...played, view: { app: played.app, atlasStore: store } as unknown as AtlasView };
}

const switches = (): string[] => screen.getAllByRole('switch').map((toggle) => toggle.getAttribute('aria-labelledby'))
  .map((id) => (id ? document.getElementById(id)?.textContent ?? '' : ''));
const resourceSwitches = (): string[] => switches().filter((label) => /(bars|wheels)$/.test(label));
const isOn = (name: string): boolean => screen.getByRole('switch', { name }).getAttribute('aria-checked') === 'true';

const FOUR = ['Show HP bars', 'Show Stress bars', 'Show Ammo wheels', 'Show Armor wheels'];

afterEach(() => {
  cleanup();
  releasePlayedCampaignWorlds();
  vi.restoreAllMocks();
});

describe('the scene\'s token settings and the rules its map plays by', () => {
  it('offer the collection\'s resources while no campaign system applies, and say nothing of a campaign', () => {
    const { view } = world();
    render(<TokenSettingsPanel view={view} />);
    expect(resourceSwitches()).toEqual(FOUR);
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('follow the played campaign\'s system while the panel is open, and the collection\'s again once play stops (#657)', () => {
    const { view, play } = world();
    render(<TokenSettingsPanel view={view} />);
    act(() => play.play('saga'));
    expect(resourceSwitches()).toEqual(['Show HP bars']);
    act(() => play.stop());
    expect(resourceSwitches()).toEqual(FOUR);
  });

  it('follow a resource added to the played campaign\'s system', () => {
    const { view, play, campaigns } = world();
    play.play('saga');
    render(<TokenSettingsPanel view={view} />);
    expect(resourceSwitches()).toEqual(['Show HP bars']);
    act(() => new CampaignService(campaigns).update('saga', { system: { resources: [HP, AMMO] } }));
    expect(resourceSwitches()).toEqual(['Show HP bars', 'Show Ammo bars']);
  });

  it('say whose resources they are while a campaign\'s system applies', () => {
    const { view, play } = world();
    render(<TokenSettingsPanel view={view} />);
    act(() => play.play('saga'));
    expect(screen.getByText(NOTICE)).toBeTruthy();
    act(() => play.stop());
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('show a switch as the map holds it once it is flipped', () => {
    const { view } = world();
    render(<TokenSettingsPanel view={view} />);
    expect(isOn('Show Ammo wheels')).toBe(true);
    fireEvent.click(screen.getByRole('switch', { name: 'Show Ammo wheels' }));
    expect(isOn('Show Ammo wheels')).toBe(false);
    expect(view.atlasStore.getState().tokenSettings.hiddenResources).toEqual(['ammo']);
  });
});
