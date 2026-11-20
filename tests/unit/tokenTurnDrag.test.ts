// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { Container, type FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { GridSystem } from '../../src/app/grid/GridSystem';
import { InteractionController } from '../../src/app/pixi/token-renderer/InteractionController';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import type { Token } from '../../src/app/types';
import type { EventEmitter } from '../../src/app/utils/typedEmitter';
import { createInMemoryApp } from '../mocks/inMemoryVault';

interface Pointer { x: number; y: number; shift?: boolean; alt?: boolean }

function setup(selectedIds: string[]): {
  store: ViewAtlasStore;
  controller: InteractionController;
  press: (id: string, at: Pointer) => void;
  move: (at: Pointer) => void;
  release: (at: Pointer) => void;
} {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `turn-${Math.random()}`);
  const token = (id: string, x: number): Token => ({ id, kind: 'token', imagePath: `${id}.png`, x, y: 35 });
  store.setState({ persistenceEnabled: false, activeTool: 'select', selectedIds, objects: { ...store.getState().objects, tokens: { a: token('a', 35), b: token('b', 105) } } });
  const viewport = Object.assign(new Container(), {
    toWorld: (point: { x: number; y: number }) => ({ x: point.x, y: point.y }),
    plugins: { pause: vi.fn(), resume: vi.fn() },
  });
  const controller = new InteractionController(viewport as unknown as Viewport, store, {} as GridSystem, {} as EventEmitter, app as unknown as App);
  controller.setTokenSpriteProvider((id) => {
    const placed = store.getState().objects.tokens[id];
    return placed ? ({ position: { x: placed.x, y: placed.y, set: vi.fn() }, tokenSize: 70 } as never) : null;
  });
  const event = ({ x, y, shift = false, alt = false }: Pointer): FederatedPointerEvent => (
    { button: 0, shiftKey: shift, altKey: alt, global: { x, y }, clientX: x, clientY: y, stopPropagation: () => {} } as unknown as FederatedPointerEvent
  );
  getHistoryStore(store)!.getState().clear();
  return {
    store,
    controller,
    press: (id, at) => controller.handleViewportTokenPointerDown(id, event(at)),
    move: (at) => viewport.emit('pointermove', event(at)),
    release: (at) => viewport.emit('pointerup', event(at)),
  };
}

const rotations = (store: ViewAtlasStore): Array<number | undefined> => ['a', 'b'].map((id) => store.getState().objects.tokens[id]?.rotation);

describe('a Shift-drag on a token', () => {
  it('turns it to look at the pointer where it stands, in 15° steps, as one undo step', () => {
    const { store, press, move, release } = setup([]);
    press('a', { x: 35, y: 35, shift: true });
    // A token looks towards its art's bottom: the pointer to its right turns it a quarter anticlockwise
    move({ x: 135, y: 38, shift: true });
    expect(store.getState().objects.tokens.a).toMatchObject({ x: 35, y: 35, rotation: 270 });
    move({ x: 35, y: -100, shift: true });
    release({ x: 35, y: -100, shift: true });
    expect(store.getState().objects.tokens.a).toMatchObject({ x: 35, y: 35, rotation: 180 });
    const history = getHistoryStore(store)!.getState();
    expect(history.pastStates).toHaveLength(1);
    history.undo();
    expect(rotations(store)).toEqual([undefined, undefined]);
  });

  it('turns every selected token the same way and moves none', () => {
    const { store, press, move, release } = setup(['a', 'b']);
    press('b', { x: 105, y: 35, shift: true });
    move({ x: 70, y: 300, shift: true });
    release({ x: 70, y: 300, shift: true });
    expect(rotations(store)).toEqual([0, 0]);
    expect(store.getState().selectedIds).toEqual(['a', 'b']);
    expect(['a', 'b'].map((id) => store.getState().objects.tokens[id]?.x)).toEqual([35, 105]);
  });

  it('adds a token outside the selection and turns them together', () => {
    const { store, press, move, release } = setup(['a']);
    press('b', { x: 105, y: 35, shift: true });
    move({ x: 300, y: 35, shift: true });
    release({ x: 300, y: 35, shift: true });
    expect(store.getState().selectedIds).toEqual(['a', 'b']);
    expect(rotations(store)).toEqual([270, 270]);
  });

  it('still picks with a Shift-click: a selected token leaves the selection', () => {
    const { store, press, release } = setup(['a', 'b']);
    press('b', { x: 105, y: 35, shift: true });
    release({ x: 105, y: 35, shift: true });
    expect(store.getState().selectedIds).toEqual(['a']);
    expect(rotations(store)).toEqual([undefined, undefined]);
  });

  it('shows its chevrons only while it turns', () => {
    const { controller, press, move, release } = setup([]);
    press('a', { x: 35, y: 35, shift: true });
    move({ x: 135, y: 35, shift: true });
    expect(controller.turnLayers()[0]?.children).toHaveLength(1);
    release({ x: 135, y: 35, shift: true });
    expect(controller.turnLayers()[0]?.children).toHaveLength(0);
  });

  it('hides the turned tokens\' UI while it turns, as a turn by the handle does', () => {
    const { controller, press, move, release } = setup(['a', 'b']);
    const heard: string[] = [];
    const hear = (e: Event): void => { heard.push(`${e.type}:${(e as CustomEvent<{ tokenIds: string[] }>).detail.tokenIds.join()}`); };
    window.addEventListener('atlas-token-rotation-started', hear);
    window.addEventListener('atlas-token-rotation-ended', hear);
    try {
      press('a', { x: 35, y: 35, shift: true });
      move({ x: 135, y: 35, shift: true });
      expect(controller.isTurningTokens()).toBe(true);
      release({ x: 135, y: 35, shift: true });
    } finally {
      window.removeEventListener('atlas-token-rotation-started', hear);
      window.removeEventListener('atlas-token-rotation-ended', hear);
    }
    expect(heard).toEqual(['atlas-token-rotation-started:a,b', 'atlas-token-rotation-ended:a,b']);
    expect(controller.isTurningTokens()).toBe(false);
  });
});
