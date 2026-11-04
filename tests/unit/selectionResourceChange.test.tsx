// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { PartyReconciler } from '../../src/app/campaigns/partyValues/PartyReconciler';
import { getHistoryStore } from '../../src/app/stores/history';
import { selectionResources, selectionResourceUpdates } from '../../src/app/resources/selectionResourceChange';
import { selectionResourceEntry, type OpenSelectionEditor } from '../../src/app/react/components/context-menu/selectionResourceMenu';
import { SelectionResourceEditing } from '../../src/app/pixi/selectionResourceEditor';
import { ContextMenuProvider, openContextMenuGlobal, type ContextMenuEntry } from '../../src/app/react/root/ContextMenuContext';
import type { TokenInput } from '../../src/app/types/viewState';
import { ARMOR, HP, STRESS } from '../mocks/resourceFixtures';

const DEFINITIONS = [HP, STRESS, ARMOR];

function scene(): { store: ViewAtlasStore; history: NonNullable<ReturnType<typeof getHistoryStore>> } {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `selection-change-${Math.random()}`);
  return { store, history: getHistoryStore(store)! };
}

const creature = (x: number, resources: NonNullable<TokenInput['resources']>, extra: Partial<TokenInput> = {}): TokenInput =>
  ({ kind: 'character', x, y: 0, imagePath: `t${x}.png`, resources, ...extra } as TokenInput);

const hpOf = (store: ViewAtlasStore, id: string): number | undefined => store.getState().objects.tokens[id]?.resources?.hp?.current;

/** Chooses the entry's item for `name` (the entry itself, or its submenu's child), and types `amount` into its editor. */
function choose(entry: ContextMenuEntry | null, name: string): void {
  if (!entry) throw new Error('no entry');
  const item = entry.type === 'submenu' ? entry.children.find((child) => child.type === 'item' && child.label.startsWith(name)) : entry;
  if (item?.type !== 'item') throw new Error(`no item for ${name}`);
  void item.onClick();
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('one change for the resource of every selected token', () => {
  it('offers the resources the selection holds that change in play, with how many hold each', () => {
    const { store } = scene();
    const [a, b, c] = store.getState().addTokens([
      creature(0, { hp: { current: 10, max: 10 }, armor: { current: 15, max: 15 } }),
      creature(70, { hp: { current: 7, max: 7 }, stress: { current: 0, max: 6 } }),
      creature(140, { armor: { current: 12, max: 12 } }),
    ]);
    const offered = selectionResources(store.getState().objects.tokens, [a!, b!, c!], DEFINITIONS);
    expect(offered.map(({ definition, count }) => [definition.key, count])).toEqual([['hp', 2], ['stress', 1]]);
  });

  it('takes the damage from every token that holds the resource, clamped, and leaves the others alone', () => {
    const { store } = scene();
    const [a, b, c] = store.getState().addTokens([
      creature(0, { hp: { current: 20, max: 20 } }),
      creature(70, { hp: { current: 3, max: 9 } }),
      creature(140, { stress: { current: 1, max: 6 } }),
    ]);
    const updates = selectionResourceUpdates(store.getState().objects.tokens, [a!, b!, c!], DEFINITIONS, 'hp', -4);
    expect(updates.map(({ id, changes }) => [id, changes.resources?.hp])).toEqual([[a, { current: 16, max: 20 }], [b, { current: 0, max: 9 }]]);
    // Healing a token at full health changes nothing
    expect(selectionResourceUpdates(store.getState().objects.tokens, [a!], DEFINITIONS, 'hp', 5)).toEqual([]);
  });

  it('is offered for a selection only, as one item for one resource and a submenu for several', () => {
    const { store } = scene();
    const [a, b] = store.getState().addTokens([creature(0, { hp: { current: 5, max: 5 } }), creature(70, { hp: { current: 5, max: 5 } })]);
    const open: OpenSelectionEditor = () => undefined;
    expect(selectionResourceEntry(store, [a!], DEFINITIONS, open)).toBeNull();
    expect(selectionResourceEntry(store, [a!, b!], DEFINITIONS, open)).toMatchObject({ type: 'item', label: 'Change HP of 2 tokens…' });
    store.getState().updateToken(b!, { resources: { hp: { current: 5, max: 5 }, stress: { current: 0, max: 3 } } });
    const several = selectionResourceEntry(store, [a!, b!], DEFINITIONS, open);
    expect(several).toMatchObject({ type: 'submenu', label: 'Change values of 2 tokens' });
    expect(several?.type === 'submenu' && several.children.map((child) => child.type === 'item' && child.label)).toEqual(['HP of 2 tokens', 'Stress of 1 token']);
  });

  it('is one undo step for the whole selection, typed as a sum in its popover, which takes focus from the menu', async () => {
    const { store, history } = scene();
    const [a, b] = store.getState().addTokens([creature(0, { hp: { current: 30, max: 30 } }), creature(70, { hp: { current: 12, max: 12 } })]);
    const canvas = document.body.createEl('canvas');
    const editing = new SelectionResourceEditing(canvas);
    const steps = history.getState().pastStates.length;
    const entry = selectionResourceEntry(store, [a!, b!], DEFINITIONS, (definition, count, apply) => {
      editing.open({ at: { x: 10, y: 10 }, resourceName: definition.name, count, onCommit: apply });
    });
    render(<ContextMenuProvider><div /></ContextMenuProvider>);
    act(() => openContextMenuGlobal([entry!], { x: 10, y: 10 }));
    const item = await screen.findByRole('menuitem', { name: 'Change HP of 2 tokens…' });
    act(() => { item.focus(); fireEvent.keyDown(item, { key: 'Enter' }); });

    // The field keeps focus once the menu has let it go, so the change is typed at once
    const input = await waitFor(() => {
      const field = document.querySelector<HTMLInputElement>('.atlas-token-value-editor__input');
      expect(field).not.toBeNull();
      expect(document.activeElement).toBe(field);
      return field!;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(document.activeElement).toBe(input);
    const enter = (): void => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); };

    // A number alone would set every token to it: refused, the popover stays open
    input.value = '8';
    enter();
    expect(input.hasAttribute('aria-invalid')).toBe(true);
    expect([hpOf(store, a!), hpOf(store, b!)]).toEqual([30, 12]);

    input.value = '-9/2-4';
    enter();
    expect(document.querySelector('.atlas-token-value-editor')).toBeNull();
    expect([hpOf(store, a!), hpOf(store, b!)]).toEqual([22, 4]);
    expect(history.getState().pastStates).toHaveLength(steps + 1);

    history.getState().undo();
    expect([hpOf(store, a!), hpOf(store, b!)]).toEqual([30, 12]);
  });

  it('opens in the document of the map it belongs to, and closes with the view', async () => {
    const popout = document.implementation.createHTMLDocument('popout');
    const canvas = popout.body.appendChild(popout.createElement('canvas'));
    const editing = new SelectionResourceEditing(canvas);
    editing.open({ at: { x: 0, y: 0 }, resourceName: 'HP', count: 3, onCommit: vi.fn() });
    await waitFor(() => expect(popout.querySelector('.atlas-token-value-editor')).not.toBeNull());
    expect(document.querySelector('.atlas-token-value-editor')).toBeNull();

    editing.close();
    expect(popout.querySelector('.atlas-token-value-editor')).toBeNull();
    // Closed before it opened: it never opens
    editing.open({ at: { x: 0, y: 0 }, resourceName: 'HP', count: 3, onCommit: vi.fn() });
    editing.close();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(popout.querySelector('.atlas-token-value-editor')).toBeNull();
  });

  it('changes a player character\'s other tokens and the campaign\'s value with it, in the same step', () => {
    const { store, history } = scene();
    new PartyReconciler(store).setContext({ campaignId: 'c', characterOf: (token) => (token.assetId === 'pc' ? 'pc' : null) });
    const [ayla, aylaElsewhere, goblin] = store.getState().addTokens([
      creature(0, { hp: { current: 20, max: 20 } }, { assetId: 'pc' }),
      creature(70, { hp: { current: 20, max: 20 } }, { assetId: 'pc' }),
      creature(140, { hp: { current: 7, max: 7 } }),
    ]);
    const steps = history.getState().pastStates.length;
    choose(selectionResourceEntry(store, [ayla!, goblin!], DEFINITIONS, (_definition, _count, apply) => apply(-6)), 'Change HP');
    expect([hpOf(store, ayla!), hpOf(store, aylaElsewhere!), hpOf(store, goblin!)]).toEqual([14, 14, 1]);
    expect(history.getState().pastStates).toHaveLength(steps + 1);
  });
});
