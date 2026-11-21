import { describe, expect, it, vi } from 'vitest';
import type { FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { EventEmitter } from '../../src/app/utils/typedEmitter';
import type { App } from 'obsidian';
import { InteractionController } from '../../src/app/pixi/token-renderer/InteractionController';
import type { GridSystem } from '../../src/app/grid/GridSystem';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import type { ContextMenuEntry } from '../../src/app/react/components/context-menu/AtlasContextMenu';
import type { Token } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const opened = vi.hoisted(() => ({ entries: [] as ContextMenuEntry[] }));
vi.mock('../../src/app/react/root/ContextMenuContext', () => ({
  openContextMenuGlobal: (entries: ContextMenuEntry[]) => { opened.entries = entries; },
  closeContextMenuGlobal: () => {},
}));

const token = (id: string, isHidden?: boolean): Token => ({
  id, kind: 'token', imagePath: `${id}.png`, x: 0, y: 0, ...(isHidden !== undefined && { isHidden }),
});

function setup(selectedIds: string[], hidden: string[] = []): { store: ReturnType<typeof createViewAtlasStore>; rightClick: (id: string) => void } {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `hide-${Math.random()}`);
  const tokens = Object.fromEntries(['a', 'b', 'c'].map((id) => [id, token(id, hidden.includes(id) || undefined)]));
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

const hiddenIds = (store: ReturnType<typeof createViewAtlasStore>): string[] =>
  Object.values(store.getState().objects.tokens).filter((t) => t.isHidden).map((t) => t.id);

describe('token context menu Hide', () => {
  it('hides every selected token in one undo step when a selected token is right-clicked', () => {
    const { store, rightClick } = setup(['a', 'b']);
    const steps = getHistoryStore(store)!.getState().pastStates.length;
    rightClick('b');
    clickItem('Hide');
    expect(hiddenIds(store)).toEqual(['a', 'b']);
    expect(getHistoryStore(store)!.getState().pastStates.length).toBe(steps + 1);
  });

  it('shows the whole selection when the right-clicked token is hidden', () => {
    const { store, rightClick } = setup(['a', 'b', 'c'], ['a', 'c']);
    rightClick('a');
    clickItem('Show');
    expect(hiddenIds(store)).toEqual([]);
  });

  it('hides only the right-clicked token when it is not selected', () => {
    const { store, rightClick } = setup(['a', 'b']);
    rightClick('c');
    clickItem('Hide');
    expect(hiddenIds(store)).toEqual(['c']);
  });
});
