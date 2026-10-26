// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CreatureIndex } from '../../src/app/creatures/CreatureIndex';
import { GENERIC_LIGHT_PRESETS } from '../../src/app/gameSystems/lightPresets/generic';
import { GENERIC_SENSES } from '../../src/app/gameSystems/senses/generic';
import { senseWithRole } from '../../src/app/gameSystems/senseRules';
import { emissionOf, lightPresetsOnMap } from '../../src/app/lighting/lightPresetChoice';
import { openEditTokenModal } from '../../src/app/pixi/token-renderer/EditTokenModal';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import type { Character } from '../../src/app/types';
import { creatureVault, type CreatureVault } from '../mocks/creatureVault';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { AMMO, HP } from '../mocks/resourceFixtures';

const darkvision = senseWithRole(GENERIC_SENSES, 'darkvision');
const tremorsense = senseWithRole(GENERIC_SENSES, 'tremorsense');
const onMap = lightPresetsOnMap(GENERIC_LIGHT_PRESETS, { unitType: 'feet', ruleDistance: 5 }, Infinity);
const torch = emissionOf(onMap.find((preset) => preset.id === 'torch')!);

afterEach(() => {
  const cancel = screen.queryByRole('button', { name: 'Cancel' });
  if (cancel) act(() => cancel.click());
  document.body.replaceChildren();
});

function open(overrides: Partial<Character> = {}): { store: ViewAtlasStore; saved: () => Character; input: (label: string) => HTMLInputElement } {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `edit-token-merge-${Math.random()}`);
  const token: Character = { id: 't', kind: 'character', name: 'Gunner', imagePath: 't.png', x: 0, y: 0, ...overrides };
  store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens: { t: token } } });
  act(() => openEditTokenModal(token, store, app, [HP, AMMO]));
  const input = (label: string): HTMLInputElement =>
    screen.getByText(label).parentElement!.querySelector<HTMLInputElement>('input[type="number"]')!;
  return { store, saved: () => store.getState().objects.tokens.t as Character, input };
}

const save = (): void => act(() => screen.getByRole('button', { name: 'Save' }).click());

describe('Edit Token writes senses, light and resources together', () => {
  it('editing only a resource keeps a statblock-following vision without a senses list, and the light', () => {
    const { saved, input } = open({ vision: { enabled: true, range: 30, angle: 90 }, light: torch, resources: { hp: { current: 5, max: 8 } } });
    fireEvent.change(input('Max Ammo'), { target: { value: '6' } });
    save();
    expect(saved().vision).toEqual({ enabled: true, range: 30, angle: 90 });
    expect(saved().vision).not.toHaveProperty('senses');
    expect(saved().light).toEqual(torch);
    expect(saved().resources).toEqual({ hp: { current: 5, max: 8 }, ammo: { current: 6, max: 6 } });
    expect(saved().overriddenMax).toEqual(['ammo']);
  });

  it('editing only a resource on a token without any vision does not give it a senses list', () => {
    const { saved, input } = open({ resources: { hp: { current: 5, max: 8 } } });
    fireEvent.change(input('Max HP'), { target: { value: '10' } });
    save();
    expect(saved().vision).toBeUndefined();
    expect(saved().light).toBeUndefined();
    expect(saved().resources).toEqual({ hp: { current: 5, max: 10 } });
  });

  it('editing only a resource keeps an own senses list, an own empty one too', () => {
    const own = open({ vision: { enabled: true, senses: [{ id: darkvision.id, range: 60 }, { id: tremorsense.id }] }, resources: { hp: { current: 5, max: 8 } } });
    fireEvent.change(own.input('Max HP'), { target: { value: '10' } });
    save();
    expect(own.saved().vision).toEqual({ enabled: true, senses: [{ id: darkvision.id, range: 60 }, { id: tremorsense.id }] });
    document.body.replaceChildren();

    const empty = open({ vision: { enabled: false, senses: [] }, resources: { hp: { current: 5, max: 8 } } });
    fireEvent.change(empty.input('Max HP'), { target: { value: '10' } });
    save();
    expect(empty.saved().vision).toEqual({ enabled: false, senses: [] });
  });

  it('editing only senses keeps resources, hand-set maxima and extra statblock quantities', () => {
    const resources = { hp: { current: 3, max: 8 }, ammo: { current: 2, max: 6 }, mana: { current: 1, max: 4 } };
    const { saved } = open({ vision: { enabled: true }, light: torch, resources, overriddenMax: ['ammo'] });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Add sense' }), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('menuitem', { name: /^Darkvision/ }));
    fireEvent.change(screen.getByLabelText('Darkvision range'), { target: { value: '60' } });
    save();
    expect(saved().vision).toEqual({ enabled: true, senses: [{ id: darkvision.id, range: 60 }] });
    expect(saved().resources).toEqual(resources);
    expect(saved().overriddenMax).toEqual(['ammo']);
    expect(saved().light).toEqual(torch);
  });

  it('one save writes a new sense, a switched-off light and a new maximum', () => {
    const { saved, input } = open({ vision: { enabled: true, darkvision: 60 }, light: torch, resources: { hp: { current: 5, max: 8 } } });
    fireEvent.change(screen.getByLabelText('Darkvision range'), { target: { value: '90' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Carries a light' }));
    fireEvent.change(input('Max HP'), { target: { value: '4' } });
    save();
    expect(saved().vision).toEqual({ enabled: true, senses: [{ id: darkvision.id, range: 90 }] });
    expect(saved().light).toBeUndefined();
    expect(saved().resources).toEqual({ hp: { current: 4, max: 4 } });
    expect(saved().overriddenMax).toEqual(['hp']);
  });

  it('a resources-only save leaves old darkvision and tremorsense numbers as they are; they become senses when the senses are edited', () => {
    const { saved, input } = open({ vision: { enabled: false, darkvision: 60, tremorsense: 10 }, resources: { hp: { current: 5, max: 8 } } });
    fireEvent.change(input('Max HP'), { target: { value: '9' } });
    save();
    expect(saved().vision).toEqual({ enabled: false, darkvision: 60, tremorsense: 10 });
    document.body.replaceChildren();

    const edited = open({ vision: { enabled: true, darkvision: 60, tremorsense: 10 } });
    fireEvent.change(screen.getByLabelText('Darkvision range'), { target: { value: '90' } });
    save();
    expect(edited.saved().vision).toEqual({ enabled: true, senses: [{ id: darkvision.id, range: 90 }, { id: tremorsense.id, range: 10 }] });
  });

  it('saves only what the form changed, onto the token as it is now: changes made on the map meanwhile stay', () => {
    const first = open({ vision: { enabled: true }, resources: { hp: { current: 8, max: 8 } } });
    // Damage arrives while the modal is open (the map, undo, another view).
    act(() => first.store.getState().updateToken('t', { resources: { hp: { current: 2, max: 8 } }, x: 140 }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Add sense' }), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('menuitem', { name: /^Darkvision/ }));
    save();
    expect(first.saved().resources).toEqual({ hp: { current: 2, max: 8 } });
    expect(first.saved().x).toBe(140);
    expect(first.saved().vision?.senses?.map((sense) => sense.id)).toEqual([darkvision.id]);
    document.body.replaceChildren();

    const second = open({ vision: { enabled: false }, resources: { hp: { current: 8, max: 8 } } });
    act(() => second.store.getState().updateToken('t', { light: torch, vision: { enabled: true }, resources: { hp: { current: 3, max: 8 } }, name: 'Sniper' }));
    fireEvent.change(second.input('Max HP'), { target: { value: '9' } });
    save();
    // The new maximum goes onto the hit points the token has now; light, vision and name are the map's.
    expect(second.saved().resources).toEqual({ hp: { current: 3, max: 9 } });
    expect(second.saved().light).toEqual(torch);
    expect(second.saved().vision).toEqual({ enabled: true });
    expect(second.saved().name).toBe('Sniper');
  });

  it('writes nothing when nothing was changed, and nothing onto a token that was deleted meanwhile', () => {
    const { store } = open({ vision: { enabled: true, darkvision: 60 }, light: torch, resources: { hp: { current: 5, max: 8 } } });
    const before = store.getState().objects.tokens.t;
    save();
    expect(store.getState().objects.tokens.t).toBe(before);
    document.body.replaceChildren();

    const gone = open({ resources: { hp: { current: 5, max: 8 } } });
    act(() => gone.store.getState().deleteToken('t'));
    fireEvent.change(gone.input('Max HP'), { target: { value: '9' } });
    save();
    expect(gone.store.getState().objects.tokens.t).toBeUndefined();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });
});

describe('Edit Token for a token that follows its statblock', () => {
  const GOBLIN = 'Bestiary/Goblin.md';
  let current: CreatureVault;

  afterEach(() => {
    CreatureIndex.release(current.app);
    Reflect.deleteProperty(window, 'FantasyStatblocks');
  });

  function openLinked(overrides: Partial<Character> = {}): { saved: () => Character; input: (label: string) => HTMLInputElement } {
    current = creatureVault();
    Object.assign(current.frontmatter[GOBLIN]!, { senses: 'darkvision 60 ft., passive Perception 9', hp: 7 });
    const store = createViewAtlasStore(current.app, `edit-token-linked-${Math.random()}`);
    const token: Character = { id: 't', kind: 'character', name: 'Goblin', imagePath: 't.png', x: 0, y: 0, statblockPath: GOBLIN, vision: { enabled: true }, resources: { hp: { current: 3, max: 7 } }, ...overrides };
    store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens: { t: token } } });
    act(() => openEditTokenModal(token, store, current.app, [HP, AMMO]));
    const input = (label: string): HTMLInputElement =>
      screen.getByText(label).parentElement!.querySelector<HTMLInputElement>('input[type="number"]')!;
    return { saved: () => store.getState().objects.tokens.t as Character, input };
  }

  it('a resources-only edit leaves it without a senses list, still following the statblock', async () => {
    const { saved, input } = openLinked();
    await waitFor(() => expect(screen.queryAllByRole('listitem')).toHaveLength(1));
    expect(input('Max HP').placeholder).toBe('Statblock default: 7');
    fireEvent.change(input('Max HP'), { target: { value: '12' } });
    save();
    expect(saved().vision).toEqual({ enabled: true });
    expect(saved().vision).not.toHaveProperty('senses');
    expect(saved().resources).toEqual({ hp: { current: 3, max: 12 } });
    expect(saved().overriddenMax).toEqual(['hp']);
  });

  it('a senses-only edit keeps the resources the statblock supplies and what the token spent of them', async () => {
    const { saved } = openLinked();
    await waitFor(() => expect(screen.queryAllByRole('listitem')).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Edit senses' }));
    fireEvent.change(screen.getByLabelText('Darkvision range'), { target: { value: '90' } });
    save();
    expect(saved().vision).toEqual({ enabled: true, senses: [{ id: darkvision.id, range: 90 }] });
    expect(saved().resources).toEqual({ hp: { current: 3, max: 7 } });
    expect(saved().overriddenMax).toBeUndefined();
  });

  it('saving with nothing changed changes neither side', async () => {
    const { saved } = openLinked({ light: torch, overriddenMax: ['ammo'], resources: { hp: { current: 3, max: 7 }, ammo: { current: 1, max: 6 } } });
    await waitFor(() => expect(screen.queryAllByRole('listitem')).toHaveLength(1));
    save();
    expect(saved().vision).toEqual({ enabled: true });
    expect(saved().light).toEqual(torch);
    expect(saved().resources).toEqual({ hp: { current: 3, max: 7 }, ammo: { current: 1, max: 6 } });
    expect(saved().overriddenMax).toEqual(['ammo']);
  });
});
