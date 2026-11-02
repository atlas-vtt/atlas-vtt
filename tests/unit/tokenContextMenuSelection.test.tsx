// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { EventEmitter } from 'events';
import type { App } from 'obsidian';
import { InteractionController } from '../../src/app/pixi/token-renderer/InteractionController';
import type { GridSystem } from '../../src/app/grid/GridSystem';
import type { ResourceDefinition } from '../../src/app/resources/resourceTypes';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import type { ContextMenuEntry } from '../../src/app/react/components/context-menu/AtlasContextMenu';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const opened = vi.hoisted(() => ({ entries: [] as ContextMenuEntry[] }));
vi.mock('../../src/app/react/root/ContextMenuContext', () => ({
  openContextMenuGlobal: (entries: ContextMenuEntry[]) => { opened.entries = entries; },
  closeContextMenuGlobal: () => {},
}));

const HP: ResourceDefinition = { key: 'hp', name: 'HP', field: 'hp', direction: 'drains', color: '#e93147', defeatedWhenSpent: true, visibleToPlayers: true };

const character = (id: string, current: number) => ({
  id, kind: 'character', name: id, imagePath: `${id}.png`, x: 100, y: 100, size: 1, resources: { hp: { current, max: 10 } },
});

function setup(selectedIds: string[]) {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `menu-${Math.random()}`);
  const tokens = { a: character('a', 8), b: character('b', 6), c: character('c', 4) };
  store.setState({
    persistenceEnabled: false, activeTool: 'select', selectedIds,
    grid: { ...store.getState().grid, size: 70 },
    objects: { ...store.getState().objects, tokens },
  } as never);
  const controller = new InteractionController({} as Viewport, store, {} as GridSystem, {} as EventEmitter, app as unknown as App);
  controller.resourceDefsProvider = () => [HP];
  const rightClick = (id: string): void => controller.handleViewportTokenPointerDown(
    id, { button: 2, stopPropagation: () => {}, clientX: 0, clientY: 0, global: { x: 0, y: 0 } } as unknown as FederatedPointerEvent,
  );
  const steps = (): number => getHistoryStore(store)!.getState().pastStates.length;
  const hp = (): Record<string, number | undefined> => Object.fromEntries(
    Object.values(store.getState().objects.tokens).map((token) => [token.id, (token as unknown as ReturnType<typeof character>).resources.hp.current]),
  );
  return { store, rightClick, steps, hp };
}

function pressInRow(name: string): void {
  const row = opened.entries.find((entry) => entry.type === 'custom');
  if (row?.type !== 'custom') throw new Error('no destructive row');
  render(row.render() as ReactNode);
  fireEvent.click(screen.getByText(name));
}

afterEach(cleanup);

describe('the token menu over a selection', () => {
  it('kills every selected token in one undo step', () => {
    const { rightClick, steps, hp } = setup(['a', 'b']);
    const before = steps();
    rightClick('b');
    pressInRow('Kill');
    expect(hp()).toEqual({ a: 0, b: 0, c: 4 });
    expect(steps()).toBe(before + 1);
  });

  it('deletes every selected token in one undo step, and lets go of them', () => {
    const { store, rightClick, steps } = setup(['a', 'b']);
    const before = steps();
    rightClick('a');
    pressInRow('Delete');
    expect(Object.keys(store.getState().objects.tokens)).toEqual(['c']);
    expect(store.getState().selectedIds).toEqual([]);
    expect(steps()).toBe(before + 1);
  });

  it('resets every selected token', () => {
    const { rightClick, hp } = setup(['a', 'b']);
    rightClick('a');
    const reset = opened.entries.find((entry) => entry.type === 'item' && entry.icon === 'rotate-ccw');
    if (reset?.type !== 'item') throw new Error('no reset');
    void reset.onClick?.();
    expect(hp()).toEqual({ a: 10, b: 10, c: 4 });
  });

  it('resizes every selected token in one undo step', () => {
    const { store, rightClick, steps } = setup(['a', 'b']);
    const before = steps();
    rightClick('a');
    const size = opened.entries.find((entry) => entry.type === 'submenu' && entry.label === 'Size');
    if (size?.type !== 'submenu' || !Array.isArray(size.children)) throw new Error('no size menu');
    const large = size.children.find((child) => child.type === 'item' && child.label?.includes('Large'));
    if (large?.type !== 'item') throw new Error('no large');
    void large.onClick?.();
    const { a, b, c } = store.getState().objects.tokens;
    expect(a?.size).toBeGreaterThan(1);
    expect(b?.size).toBe(a?.size);
    expect(c?.size).toBe(1);
    expect(steps()).toBe(before + 1);
  });

  it('acts on the clicked token alone when it is not selected', () => {
    const { rightClick, hp } = setup(['a', 'b']);
    rightClick('c');
    pressInRow('Kill');
    expect(hp()).toEqual({ a: 8, b: 6, c: 0 });
  });
});
