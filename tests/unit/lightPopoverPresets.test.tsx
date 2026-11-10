// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { emissionOf } from '../../src/app/lighting/lightPresetChoice';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../src/app/packages/components/primitives/tooltip';
import { LightPopoverHost } from '../../src/app/pixi/lighting/LightPopover';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { AssetService } from '../../src/app/services/AssetService';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { CollectionSettings } from '../../src/app/types/collectionSettingsTypes';
import type { LightEmission } from '../../src/app/types/lightingTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const system = (name: string) => BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === name)!;
const dnd5e = system('D&D 5e');
const light5e = (name: string) => dnd5e.rules.lightPresets!.find((preset) => preset.name === name)!;

beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** The popover of a light on a map of a collection with the game system `presetName`. */
function renderPopover(presetName: string, emission: LightEmission, settings: Partial<CollectionSettings> = {}): () => LightEmission {
  vi.spyOn(AssetService.prototype, 'getCollectionForMap').mockReturnValue('dungeon');
  vi.spyOn(AssetService.prototype, 'getCollectionSettings').mockReturnValue({ conditions: [], systemPresetId: system(presetName).id, ...settings });
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `light-presets-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/crypt.atlasmap');
  store.getState().setSceneLighting({ enabled: true });
  const id = store.getState().addLight({ x: 400, y: 300, emission });
  const ui: AtlasUIContextValue = { app, view: null, pixiApp: null, renderer: null };
  render(
    <AtlasUIContext.Provider value={ui}>
      <ViewStoreProvider store={store}><LightPopoverHost /></ViewStoreProvider>
    </AtlasUIContext.Provider>,
  );
  act(() => store.getState().openLightPopover(id));
  return () => store.getState().objects.lights[id]!.emission;
}

const kinds = (): HTMLElement => screen.getByRole('group', { name: 'Kind of light' });
const chipNames = (): string[] => within(kinds()).getAllByRole('button').map((button) => button.getAttribute('aria-labelledby'))
  .map((id) => document.getElementById(id!)!.textContent!);
const pressed = (name: string): boolean => screen.getByRole('button', { name }).getAttribute('aria-pressed') === 'true';

function openMore(): void {
  fireEvent.keyDown(screen.getByRole('button', { name: /more lights$/i }), { key: 'ArrowDown' });
}

describe('LightPopover with a game system\'s light presets', () => {
  it('shows a system with few lights as one chip each, and Custom last', () => {
    renderPopover('Shadowdark', emissionOf(system('Shadowdark').rules.lightPresets![0]!));
    expect(chipNames()).toEqual(['Torch (near)', 'Lantern (double near)', 'Light spell (near)', 'Custom light']);
    expect(pressed('Torch (near)')).toBe(true);
  });

  it('shows the most common lights of D&D 5e and its Darkness as chips, one glyph each, and the others under More', () => {
    renderPopover('D&D 5e', emissionOf(light5e('Torch')));
    expect(chipNames()).toEqual(['Candle', 'Torch', 'Hooded lantern', 'Light', 'Darkness', 'More lights']);
    expect(pressed('Torch')).toBe(true);
    expect(pressed('More lights')).toBe(false);
    openMore();
    expect(screen.getAllByRole('menuitemcheckbox').map((item) => item.textContent)).toEqual(['Lamp', 'Continual Flame', 'Daylight', 'Bullseye lantern', 'Custom light']);
  });

  it('gives the light a preset from the More menu, and marks More with it', () => {
    const emission = renderPopover('D&D 5e', emissionOf(light5e('Torch')));
    openMore();
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Daylight' }));
    expect(emission()).toMatchObject({ bright: 60, dim: 120, kind: 'magical', preset: light5e('Daylight').id });
    expect(pressed('Daylight, more lights')).toBe(true);
    expect(pressed('Torch')).toBe(false);
    openMore();
    expect(screen.getByRole('menuitemcheckbox', { name: 'Daylight' }).getAttribute('aria-checked')).toBe('true');
  });

  it('makes the light a custom one from the More menu, keeping its values', () => {
    const emission = renderPopover('D&D 5e', emissionOf(light5e('Torch')));
    openMore();
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Custom light' }));
    expect(emission()).toMatchObject({ bright: 20, dim: 40, kind: 'custom' });
    expect(emission()).not.toHaveProperty('preset');
    expect(pressed('Custom light, more lights')).toBe(true);
  });

  it('keeps the chip of a preset whose values were edited, and reads an older light by its kind', () => {
    renderPopover('D&D 5e', { ...emissionOf(light5e('Hooded lantern')), bright: 35, color: '#ffffff' });
    expect(pressed('Hooded lantern')).toBe(true);
    cleanup();
    renderPopover('D&D 5e', { bright: 12, dim: 30, color: '#ffd28a', intensity: 1, animation: 'none', kind: 'candle' });
    expect(pressed('Candle')).toBe(true);
  });

  it('gives a preset in what the collection measures in: a 5e torch is 6 and 12 metres', () => {
    const metres = { gridDefaults: { unitType: 'meters', unitDistance: 1.5, measurementMode: 'metric' } } as const;
    const emission = renderPopover('D&D 5e', emissionOf(light5e('Candle')), metres);
    fireEvent.click(screen.getByRole('button', { name: 'Torch' }));
    expect(emission()).toMatchObject({ bright: 6, dim: 12, preset: light5e('Torch').id });
    expect((screen.getByLabelText('Bright') as HTMLInputElement).value).toBe('6');
    expect((screen.getByLabelText('Dim') as HTMLInputElement).value).toBe('12');
    expect(screen.getByText('m')).toBeTruthy();
    expect(pressed('Torch')).toBe(true);
  });

  it('opens the menu of more lights inside the popover, so a press in it is no press outside', () => {
    renderPopover('D&D 5e', emissionOf(light5e('Torch')));
    openMore();
    const dialog = screen.getByRole('dialog', { name: 'Light' });
    expect(dialog.contains(screen.getByRole('menu'))).toBe(true);
  });

  it('stays open on an Escape pressed while the menu of more lights is open under a tooltip', () => {
    renderPopover('D&D 5e', emissionOf(light5e('Torch')));
    openMore();
    expect(screen.getByRole('menu')).toBeTruthy();
    // The tooltip shows after the menu opened: it is the topmost layer, and takes Escape first.
    const tooltip = render(<TooltipProvider><Tooltip open><TooltipTrigger>Hovered</TooltipTrigger><TooltipContent>Tip</TooltipContent></Tooltip></TooltipProvider>);
    fireEvent.keyDown(screen.getAllByRole('menuitemcheckbox')[0]!, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Light' })).toBeTruthy();
    tooltip.unmount();
    // With the menu closed and no tooltip, Escape is the popover's.
    if (screen.queryByRole('menu')) fireEvent.keyDown(screen.getAllByRole('menuitemcheckbox')[0]!, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Light' })).toBeTruthy();
    const popover = screen.getByRole('dialog', { name: 'Light' });
    expect(popover.hasAttribute('inert')).toBe(false);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Torch' }), { key: 'Escape' });
    // Closed: it takes no more input while it leaves.
    expect(popover.hasAttribute('inert')).toBe(true);
  });
});
