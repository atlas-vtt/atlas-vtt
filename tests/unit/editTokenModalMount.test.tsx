// @vitest-environment jsdom
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GENERIC_LIGHT_PRESETS } from '../../src/app/gameSystems/lightPresets/generic';
import { GENERIC_SENSES } from '../../src/app/gameSystems/senses/generic';
import { emissionOf, lightPresetsOnMap } from '../../src/app/lighting/lightPresetChoice';
import { senseWithRole } from '../../src/app/gameSystems/senseRules';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../src/app/packages/components/primitives/tooltip';
import { openEditTokenModal } from '../../src/app/pixi/token-renderer/EditTokenModal';
import { AssetService } from '../../src/app/services/AssetService';
import type { TokenEntity } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { HP, STR } from '../mocks/resourceFixtures';

const darkvision = senseWithRole(GENERIC_SENSES, 'darkvision');
const tremorsense = senseWithRole(GENERIC_SENSES, 'tremorsense');

// Cancel unmounts the modal's root and removes its container.
afterEach(() => {
  const cancel = screen.queryByRole('button', { name: 'Cancel' });
  if (cancel) act(() => cancel.click());
});

function open(overrides: Partial<TokenEntity> = {}): { store: ViewAtlasStore; saved: () => TokenEntity } {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `edit-token-${Math.random()}`);
  const token: TokenEntity = { id: 't', kind: 'token', imagePath: 't.png', x: 0, y: 0, ...overrides };
  store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens: { t: token } } });
  act(() => openEditTokenModal(token, store, app, []));
  return { store, saved: () => store.getState().objects.tokens.t! };
}

const save = (): void => act(() => screen.getByRole('button', { name: 'Save' }).click());
const vision = (): HTMLElement => screen.getByRole('switch', { name: 'Vision (party member)' });

describe('openEditTokenModal', () => {
  it('opens with its vision switch through its own React root, outside every tooltip provider', () => {
    open({ vision: { enabled: true } });
    expect(vision().getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Edit Token')).toBeTruthy();
    act(() => screen.getByRole('button', { name: 'Cancel' }).click());
    expect(document.body.querySelector('.atlas-vtt-root')).toBeNull();
  });

  it('has its sections and fields in the order they are read and tabbed through, which a dialog of one column keeps: token, resources, vision, carried light, sounds', () => {
    const app = createInMemoryApp().app;
    const store = createViewAtlasStore(app, `edit-token-order-${Math.random()}`);
    const token: TokenEntity = { id: 't', kind: 'character', name: 'Mirabel', imagePath: 't.png', x: 0, y: 0, vision: { enabled: true }, light: emissionOf(lightPresetsOnMap(GENERIC_LIGHT_PRESETS, { unitType: 'feet', ruleDistance: 5 }, Infinity)[0]!) };
    store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens: { t: token } } });
    act(() => openEditTokenModal(token, store, app, [HP, STR]));
    expect(screen.getAllByRole('heading', { level: 4 }).map((heading) => heading.textContent)).toEqual(['Token', 'Resources', 'Vision', 'Carried light', 'Sounds']);
    // Every section is named by its heading, and the columns hold them in this order: the left one, then the right one.
    expect(screen.getAllByRole('region').map((section) => section.getAttribute('aria-labelledby'))).toEqual(screen.getAllByRole('heading', { level: 4 }).map((heading) => heading.id));
    const columns = [...document.querySelectorAll('.atlas-edit-token__column')];
    expect(columns.map((column) => [...column.querySelectorAll('h4')].map((heading) => heading.textContent))).toEqual([['Token', 'Resources', 'Vision'], ['Carried light', 'Sounds']]);
    const stops = [
      screen.getByLabelText('Name'), screen.getByRole('switch', { name: 'Show nameplate' }), screen.getByLabelText('Max HP'), screen.getByLabelText('Max STR'),
      vision(), screen.getByLabelText(/^Sight range/), screen.getByLabelText(/^Vision angle/), screen.getByRole('button', { name: 'Add sense' }),
      screen.getByRole('switch', { name: 'Carries a light' }), screen.getByRole('button', { name: 'Candle' }), screen.getByLabelText('Bright'), screen.getByRole('slider', { name: 'Intensity' }),
      screen.getByRole('combobox', { name: 'Flicker' }), screen.getByRole('switch', { name: 'Outshines magical darkness' }), screen.getByRole('button', { name: 'Add sound' }),
      screen.getByRole('button', { name: 'Cancel' }), screen.getByRole('button', { name: 'Save' }),
    ];
    for (const [index, stop] of stops.slice(1).entries()) {
      expect(stops[index]!.compareDocumentPosition(stop) & Node.DOCUMENT_POSITION_FOLLOWING, `${stop.textContent || stop.getAttribute('aria-label') || stop.id} comes after the stop before it`).toBeTruthy();
    }
  });

  it('says in one line what the vision switch means', () => {
    open();
    expect(screen.getByText('The players see the map through this token. The token itself is always visible to them.')).toBeTruthy();
    expect(vision().getAttribute('aria-describedby')).toBe(screen.getByText('The players see the map through this token. The token itself is always visible to them.').id);
  });

  it('shows sight range, angle and senses only for a token with vision', () => {
    open();
    expect(screen.queryByLabelText(/^Sight range/)).toBeNull();
    expect(screen.queryByRole('group', { name: 'Senses' })).toBeNull();
    fireEvent.click(vision());
    expect(screen.getByLabelText(/^Sight range/)).toBeTruthy();
    expect(screen.getByLabelText(/^Vision angle/)).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Senses' })).toBeTruthy();
    expect(screen.queryByLabelText(/^Darkvision \(/)).toBeNull();
  });

  it('shows an old token\'s darkvision and tremorsense as senses and saves them as senses once its vision is edited', () => {
    const { saved } = open({ vision: { enabled: true, range: 120, darkvision: 60, tremorsense: 10 } });
    expect((screen.getByLabelText('Darkvision range') as HTMLInputElement).value).toBe('60');
    expect((screen.getByLabelText('Tremorsense range') as HTMLInputElement).value).toBe('10');
    fireEvent.change(screen.getByLabelText('Tremorsense range'), { target: { value: '15' } });
    save();
    expect(saved().vision).toEqual({ enabled: true, range: 120, senses: [{ id: darkvision.id, range: 60 }, { id: tremorsense.id, range: 15 }] });
  });

  it('adds a sense with its range and saves it', () => {
    const { saved } = open({ vision: { enabled: true } });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Add sense' }), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('menuitem', { name: /^Darkvision/ }));
    fireEvent.change(screen.getByLabelText('Darkvision range'), { target: { value: '60' } });
    save();
    expect(saved().vision).toEqual({ enabled: true, senses: [{ id: darkvision.id, range: 60 }] });
  });

  it('saves no list of senses when one is added and removed again, so the token still follows its statblock', () => {
    const { saved } = open({ vision: { enabled: true } });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Add sense' }), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('menuitem', { name: /^Darkvision/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Darkvision' }));
    save();
    expect(saved().vision).toEqual({ enabled: true });
  });

  it('keeps what is set while vision is switched off', () => {
    const { saved } = open({ vision: { enabled: true, range: 30, senses: [{ id: darkvision.id, range: 60 }] } });
    fireEvent.click(vision());
    save();
    expect(saved().vision).toEqual({ enabled: false, range: 30, senses: [{ id: darkvision.id, range: 60 }] });
  });

  it('closes on Escape, but not when a control inside took the key', () => {
    open({ vision: { enabled: true } });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Add sense' }), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.getByText('Edit Token')).toBeTruthy();
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByText('Edit Token')).toBeNull();
  });
});

describe('openEditTokenModal in a collection with senses of its own', () => {
  it('offers the collection\'s senses, by their names, and saves the one chosen', () => {
    const witchSight = { ...darkvision, id: 'home-witch', name: 'Witch sight', role: undefined, range: 'required' as const, defaultRange: 30 };
    const app = createInMemoryApp().app;
    const assets = AssetService.getInstance(app);
    vi.spyOn(assets, 'getCollectionForMap').mockReturnValue('coven');
    vi.spyOn(assets, 'getCollectionSettings').mockReturnValue({ conditions: [], senses: [witchSight] } as never);
    const store = createViewAtlasStore(app, `edit-token-own-${Math.random()}`);
    const token: TokenEntity = { id: 't', kind: 'token', imagePath: 't.png', x: 0, y: 0, vision: { enabled: true } };
    store.setState({ persistenceEnabled: false, mapPath: 'atlas-vtt/collections/coven/scenes/Hut.atlasmap', objects: { ...store.getState().objects, tokens: { t: token } } });
    act(() => openEditTokenModal(token, store, app, []));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Add sense' }), { key: 'ArrowDown' });
    // Only what the collection defines: its own sense, none of the generic ones it replaced.
    expect(screen.queryByRole('menuitem', { name: /^Darkvision/ })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: /^Witch sight/ }));
    save();
    expect(store.getState().objects.tokens.t!.vision).toEqual({ enabled: true, senses: [{ id: 'home-witch' }] });
    vi.restoreAllMocks();
  });
});

describe('openEditTokenModal: the carried light', () => {
  // The generic lights as a map on the default 5-foot grid offers them.
  const onMap = lightPresetsOnMap(GENERIC_LIGHT_PRESETS, { unitType: 'feet', ruleDistance: 5 }, Infinity);
  const torch = onMap.find((preset) => preset.id === 'torch')!;
  const lantern = onMap.find((preset) => preset.id === 'lantern')!;
  const carried = (): HTMLElement => screen.getByRole('switch', { name: 'Carries a light' });

  it('is off for a token without one, with no light fields, and saves none', () => {
    const { saved } = open();
    expect(carried().getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByRole('group', { name: 'Kind of light' })).toBeNull();
    save();
    expect(saved().light).toBeUndefined();
  });

  it('switches on as the collection\'s torch, with the fields of the light popover', () => {
    const { saved } = open();
    fireEvent.click(carried());
    expect(screen.getByRole('button', { name: 'Torch' }).getAttribute('aria-pressed')).toBe('true');
    for (const name of ['Candle', 'Lantern', 'Magical light', 'Custom light', 'Torch orange']) screen.getByRole('button', { name });
    expect((screen.getByLabelText('Bright') as HTMLInputElement).value).toBe('20');
    expect((screen.getByLabelText('Dim') as HTMLInputElement).value).toBe('40');
    for (const slider of ['Bright range', 'Dim range', 'Intensity', 'Softness', 'Beam']) screen.getByRole('slider', { name: slider });
    // A carried light faces as its token does.
    expect(screen.queryByRole('slider', { name: 'Direction' })).toBeNull();
    expect(screen.getByText('All around')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Flicker' }).textContent).toBe('Torch');
    save();
    expect(saved().light).toEqual(emissionOf(torch));
  });

  it('edits the light a token carries: preset, range, colour and flicker', () => {
    const { saved } = open({ light: emissionOf(torch) });
    expect(carried().getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Lantern' }));
    const bright = screen.getByLabelText('Bright') as HTMLInputElement;
    fireEvent.change(bright, { target: { value: '35' } });
    fireEvent.blur(bright);
    fireEvent.click(screen.getByRole('button', { name: 'Arcane blue' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Flicker' }));
    fireEvent.click(screen.getByRole('option', { name: 'Pulse' }));
    save();
    expect(saved().light).toEqual({ ...emissionOf(lantern), bright: 35, color: '#8fb8ff', animation: 'pulse' });
  });

  it('stays open on the Escape that closes a select\'s list while a tooltip shows, and closes on the next', () => {
    open({ light: emissionOf(torch) });
    fireEvent.click(screen.getByRole('combobox', { name: 'Flicker' }));
    // A tooltip that shows now is the topmost layer: Escape is its own first, and it marks the key.
    const tooltip = render(<TooltipProvider><Tooltip open><TooltipTrigger>Hovered</TooltipTrigger><TooltipContent>Tip</TooltipContent></Tooltip></TooltipProvider>);
    fireEvent.keyDown(screen.getByRole('option', { name: 'Pulse' }), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByText('Edit Token')).toBeTruthy();
    tooltip.unmount();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByText('Edit Token')).toBeNull();
  });

  it('commits a typed range with Enter without saving the token', () => {
    const { saved } = open({ light: emissionOf(torch) });
    const dim = screen.getByLabelText('Dim') as HTMLInputElement;
    fireEvent.change(dim, { target: { value: '50' } });
    fireEvent.keyDown(dim, { key: 'Enter' });
    expect(screen.getByText('Edit Token')).toBeTruthy();
    expect(saved().light).toEqual(emissionOf(torch));
    save();
    expect(saved().light).toMatchObject({ bright: 20, dim: 50 });
  });

  it('leaves Enter on the colour cell to the colour picker', () => {
    const { saved } = open({ light: emissionOf(torch) });
    fireEvent.click(screen.getByRole('button', { name: 'Arcane blue' }));
    fireEvent.keyDown(screen.getByLabelText('Custom colour'), { key: 'Enter' });
    expect(screen.getByText('Edit Token')).toBeTruthy();
    expect(saved().light).toEqual(emissionOf(torch));
  });

  it('takes the light away when it is switched off, and leaves an untouched light as it was', () => {
    const edited = { ...emissionOf(torch), bright: 12, intensity: 0.4 };
    const kept = open({ light: edited });
    save();
    expect(kept.saved().light).toEqual(edited);
    const removed = open({ light: edited });
    fireEvent.click(carried());
    save();
    expect(removed.saved().light).toBeUndefined();
  });
});
