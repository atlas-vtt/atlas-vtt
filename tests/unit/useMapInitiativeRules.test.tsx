// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { InitiativeRules } from '../../src/app/types/initiativeRulesTypes';

const TURN_ORDER: InitiativeRules = { mode: 'turn-order', roll: '1d20', firstSide: 'players' };
const SIDES: InitiativeRules = { mode: 'sides', roll: '1d20', firstSide: 'players' };

const world = vi.hoisted(() => ({
  rules: undefined as unknown,
  indexLoaded: (): void => undefined,
  settingsChanged: (): void => undefined,
}));
const app = vi.hoisted(() => ({
  workspace: {
    on: (_name: string, listener: () => void) => { world.settingsChanged = listener; return {}; },
    offref: (): void => undefined,
  },
}));

vi.mock('../../src/app/react/root/AtlasUIContext', () => ({ useAtlasUI: () => ({ app }) }));
vi.mock('../../src/app/react/ViewStoreContext', () => ({ useAtlasStore: () => 'atlas-vtt/collections/Cairn/scenes/Caves.atlasmap' }));
vi.mock('../../src/app/services/mapInitiativeRules', () => ({ mapInitiativeRules: () => world.rules }));
vi.mock('../../src/app/services/AssetService', () => ({
  AssetService: { getInstance: () => ({ initialize: () => new Promise<void>((resolve) => { world.indexLoaded = resolve; }) }) },
}));

import { useMapInitiativeRules } from '../../src/app/initiative/useMapInitiativeRules';

it('reads the rules again once the asset index is loaded: before that the map reads as outside every collection', async () => {
  world.rules = TURN_ORDER;
  const { result } = renderHook(() => useMapInitiativeRules());
  expect(result.current).toEqual(TURN_ORDER);

  world.rules = SIDES;
  await act(async () => { world.indexLoaded(); await Promise.resolve(); });

  expect(result.current).toEqual(SIDES);
});

it('follows the collection\'s settings', () => {
  world.rules = SIDES;
  const { result } = renderHook(() => useMapInitiativeRules());
  world.rules = TURN_ORDER;
  act(() => world.settingsChanged());
  expect(result.current).toEqual(TURN_ORDER);
});
