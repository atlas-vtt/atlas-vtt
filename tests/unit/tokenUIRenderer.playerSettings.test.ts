// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { Text } from 'pixi.js';
import { createStore } from 'zustand/vanilla';
import { TokenUIRenderer } from '../../src/app/pixi/TokenUIRenderer';
import { HP, STRESS } from '../mocks/resourceFixtures';

afterEach(() => vi.restoreAllMocks());

it('shows players the resources their definitions allow, whatever the DM hides on the map', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    createLinearGradient: () => ({ addColorStop: vi.fn() }), fillRect: vi.fn(),
  } as any);
  vi.spyOn(Text.prototype, 'getLocalBounds').mockReturnValue({ width: 80, height: 20 } as any);
  const store = createStore(() => ({ tokenSettings: { showNameplates: false, hiddenResources: ['hp', 'stress'] }, grid: { size: 70 } }));
  const ui = new TokenUIRenderer(store as any);
  ui.resourceDefsProvider = () => [{ ...HP, visibleToPlayers: true }, { ...STRESS, visibleToPlayers: false }];
  const token = { id: 'hero', kind: 'character', name: 'Hero', showNameplate: true, statblockPath: 'hero.md',
    resources: { hp: { current: 8, max: 10 }, stress: { current: 2, max: 6 } } } as any;
  const original = store.getState();
  try {
    // The DM hides both bars on this map
    ui.update(token, 70);
    expect(ui.getResourceSlots()).toEqual([]);

    ui.update(token, 70, { showTokenNameplates: true });
    expect(ui.getResourceSlots().map((slot) => slot.key)).toEqual(['hp']);
    expect((ui as any).nameText.visible).toBe(true);

    ui.update(token, 70, { showTokenNameplates: false });
    expect(ui.getResourceSlots().map((slot) => slot.key)).toEqual(['hp']);
    expect((ui as any).nameText.visible).toBe(false);
    expect(store.getState()).toBe(original);
  } finally { ui.destroy(); }
});
