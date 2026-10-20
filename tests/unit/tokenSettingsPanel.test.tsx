import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AMMO, HP, STRESS } from '../mocks/resourceFixtures';

const definitions = vi.hoisted(() => ({ list: [] as unknown[] }));
// Plain Atlas: this test fakes the asset service, which add-ons may load parts of that it leaves out
vi.mock('../../src/app/addons/addonRegistry', () => ({ installedAddons: () => [] }));
vi.mock('../../src/app/services/AssetService', () => ({ AssetService: { getInstance: () => ({}) } }));
vi.mock('../../src/app/resources/collectionResources', () => ({ mapResources: () => definitions.list }));

import { TokenSettingsPanel } from '../../src/app/react/components/command-palette/TokenSettingsPanel';

function view(hiddenResources: string[]) {
  const state = {
    mapPath: 'maps/cave.atlasmap',
    tokenSettings: { showNameplates: false, hiddenResources, showInstanceBadges: true, tokenRingSize: 1 },
    setTokenSettings: vi.fn(),
  };
  return { state, view: { app: {}, atlasStore: { getState: () => state } } as never };
}
const isOn = (name: string): boolean => screen.getByRole('switch', { name }).getAttribute('aria-checked') === 'true';

afterEach(cleanup);

describe('scene token settings', () => {
  it('offers the two bar switches a map always had, each showing what the map hides', () => {
    definitions.list = [HP, STRESS];
    const { view: atlasView } = view(['stress']);
    render(<TokenSettingsPanel view={atlasView} />);
    expect(isOn('Show HP bars')).toBe(true);
    expect(isOn('Show Stress bars')).toBe(false);
  });

  it('hides and shows one resource without touching the others', () => {
    definitions.list = [HP, STRESS, AMMO];
    const { view: atlasView, state } = view(['stress']);
    render(<TokenSettingsPanel view={atlasView} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Show HP bars' }));
    expect(state.setTokenSettings).toHaveBeenLastCalledWith(expect.objectContaining({ hiddenResources: ['stress', 'hp'] }));
    fireEvent.click(screen.getByRole('switch', { name: 'Show Stress bars' }));
    expect(state.setTokenSettings).toHaveBeenLastCalledWith(expect.objectContaining({ hiddenResources: [] }));
    // The third resource of a collection is a wheel
    expect(screen.getByRole('switch', { name: 'Show Ammo wheels' })).toBeTruthy();
  });

  it('names a resource by the socket it is in, not by its place in the list', () => {
    definitions.list = [{ ...AMMO, slot: 4 }, { ...HP, slot: 1 }];
    render(<TokenSettingsPanel view={view([]).view} />);
    expect(screen.getByRole('switch', { name: 'Show HP bars' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Show Ammo wheels' })).toBeTruthy();
  });
});
