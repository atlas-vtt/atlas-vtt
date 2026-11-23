import { describe, expect, it, vi } from 'vitest';
import type { FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { EventEmitter } from '../../src/app/utils/typedEmitter';
import type { App } from 'obsidian';
import { InteractionController } from '../../src/app/pixi/token-renderer/InteractionController';
import type { GridSystem } from '../../src/app/grid/GridSystem';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { ContextMenuEntry } from '../../src/app/react/components/context-menu/AtlasContextMenu';
import type { Token } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const opened = vi.hoisted(() => ({ entries: [] as ContextMenuEntry[] }));
vi.mock('../../src/app/react/root/ContextMenuContext', () => ({
  openContextMenuGlobal: (entries: ContextMenuEntry[]) => { opened.entries = entries; },
  closeContextMenuGlobal: () => {},
}));

const token = (id: string): Token => ({ id, kind: 'token', imagePath: `${id}.png`, x: 0, y: 0 });

function setup(selectedIds: string[]): { store: ReturnType<typeof createViewAtlasStore>; rightClick: (id: string) => void } {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `initiative-${Math.random()}`);
  const tokens = Object.fromEntries(['a', 'b', 'c'].map((id) => [id, token(id)]));
  store.setState({ persistenceEnabled: false, activeTool: 'select', selectedIds, objects: { ...store.getState().objects, tokens } });
  const controller = new InteractionController(
    {} as Viewport, store, {} as GridSystem, {} as EventEmitter, app as unknown as App,
  );
  const rightClick = (id: string): void => controller.handleViewportTokenPointerDown(
    id, { button: 2, stopPropagation: () => {}, clientX: 0, clientY: 0, global: { x: 0, y: 0 } } as unknown as FederatedPointerEvent,
  );
  return { store, rightClick };
}

function clickItem(label: string): void {
  const item = opened.entries.find((entry) => entry.type === 'item' && entry.label === label);
  if (item?.type !== 'item') throw new Error(`no "${label}" item`);
  void item.onClick?.();
}

const combatants = (store: ReturnType<typeof createViewAtlasStore>): string[] =>
  store.getState().initiative.entries.map((entry) => entry.tokenId);

describe('token context menu Add to Initiative', () => {
  it('adds every selected token and opens the tracker when a selected token is right-clicked', () => {
    const { store, rightClick } = setup(['a', 'b']);
    rightClick('b');
    clickItem('Add to Initiative');
    expect(combatants(store)).toEqual(['a', 'b']);
    expect(store.getState().initiativeTrackerOpen).toBe(true);
  });

  it('adds only the right-clicked token when it is not selected', () => {
    const { store, rightClick } = setup(['a', 'b']);
    rightClick('c');
    clickItem('Add to Initiative');
    expect(combatants(store)).toEqual(['c']);
  });

  it('adds the rest of a selection without a second entry for a token already in', () => {
    const { store, rightClick } = setup(['a', 'b', 'c']);
    rightClick('a');
    clickItem('Add to Initiative');
    store.setState({ selectedIds: ['a', 'b', 'c'] });
    store.getState().removeFromInitiative(store.getState().initiative.entries[1]!.id);
    rightClick('b');
    clickItem('Add to Initiative');
    expect(combatants(store)).toEqual(['a', 'c', 'b']);
  });

  it('removes the whole selection when the right-clicked token is a combatant', () => {
    const { store, rightClick } = setup(['a', 'b']);
    rightClick('a');
    clickItem('Add to Initiative');
    rightClick('c');
    clickItem('Add to Initiative');
    store.setState({ selectedIds: ['a', 'b'] });
    rightClick('b');
    clickItem('Remove from Initiative');
    expect(combatants(store)).toEqual(['c']);
  });
});
