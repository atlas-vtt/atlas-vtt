import { describe, expect, it, vi } from 'vitest';
import type { FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { EventEmitter } from 'events';
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

const token = (id: string, ringColor?: string): Token => ({
  id, kind: 'token', imagePath: `${id}.png`, x: 0, y: 0, ...(ringColor !== undefined && { ringColor }),
});

function setup(selectedIds: string[], rings: Record<string, string> = {}): { store: ReturnType<typeof createViewAtlasStore>; rightClick: (id: string) => void } {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `ring-${Math.random()}`);
  const tokens = Object.fromEntries(['a', 'b', 'c'].map((id) => [id, token(id, rings[id])]));
  store.setState({ persistenceEnabled: false, activeTool: 'select', selectedIds, objects: { ...store.getState().objects, tokens } });
  const controller = new InteractionController(
    {} as Viewport, store, {} as GridSystem, {} as EventEmitter, app as unknown as App,
  );
  const rightClick = (id: string): void => controller.handleViewportTokenPointerDown(
    id, { button: 2, stopPropagation: () => {}, clientX: 0, clientY: 0, global: { x: 0, y: 0 } } as unknown as FederatedPointerEvent,
  );
  return { store, rightClick };
}

function pickRing(colour: string): void {
  const menu = opened.entries.find((entry) => entry.type === 'submenu' && entry.label === 'Ring Color');
  if (menu?.type !== 'submenu') throw new Error('no ring colour submenu');
  const item = menu.children.find((entry) => entry.type === 'item' && entry.label === colour);
  if (item?.type !== 'item') throw new Error(`no "${colour}" item`);
  void item.onClick?.();
}

const rings = (store: ReturnType<typeof createViewAtlasStore>): Record<string, string | undefined> =>
  Object.fromEntries(Object.values(store.getState().objects.tokens).map((t) => [t.id, t.ringColor]));

describe('token context menu ring colour', () => {
  it('colours every selected token in one undo step when a selected token is right-clicked', () => {
    const { store, rightClick } = setup(['a', 'b']);
    const steps = getHistoryStore(store)!.getState().pastStates.length;
    rightClick('b');
    pickRing('Red');
    expect(rings(store)).toEqual({ a: '#e93147', b: '#e93147', c: undefined });
    expect(getHistoryStore(store)!.getState().pastStates.length).toBe(steps + 1);
  });

  it('gives the whole selection its default ring back', () => {
    const { store, rightClick } = setup(['a', 'c'], { a: '#e93147', b: '#086ddd', c: '#ffffff' });
    rightClick('a');
    pickRing('Default');
    expect(rings(store)).toEqual({ a: undefined, b: '#086ddd', c: undefined });
  });

  it('colours only the right-clicked token when it is not selected', () => {
    const { store, rightClick } = setup(['a', 'b']);
    rightClick('c');
    pickRing('Blue');
    expect(rings(store)).toEqual({ a: undefined, b: undefined, c: '#086ddd' });
  });
});
