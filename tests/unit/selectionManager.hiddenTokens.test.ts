import { EventEmitter } from 'events';
import { describe, expect, it } from 'vitest';
import { Container, Sprite, type FederatedPointerEvent, type Graphics } from 'pixi.js';
import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';
import { SelectionManager } from '../../src/app/pixi/SelectionManager';

interface Harness {
  store: { getState: () => { selectedIds: string[] }; setState: (patch: Record<string, unknown>) => void };
  sprites: Record<string, Container>;
  overlay: Graphics;
  drag: (from: [number, number], to: [number, number], via?: [number, number][]) => void;
}

function token(x: number, y: number, visible: boolean): Container {
  const group = new Container();
  const sprite = group.addChild(new Sprite());
  sprite.width = 70;
  sprite.height = 70;
  group.position.set(x, y);
  group.visible = visible;
  return group;
}

/** A goblin the canvas shows at (100, 100) and a lurker it hides at (200, 100), as session view hides unseen tokens. */
function setup(selectionMode: 'box' | 'lasso' = 'box'): Harness {
  const viewport = Object.assign(new Container(), { toWorld: (point: { x: number; y: number }) => ({ x: point.x, y: point.y }) });
  const sprites = { goblin: token(100, 100, true), lurker: token(200, 100, false) };
  const store = createStore(subscribeWithSelector(() => ({
    selectedIds: [] as string[],
    activeTool: 'select',
    selectionMode,
    objects: { tokens: { goblin: { id: 'goblin' }, lurker: { id: 'lurker' } }, drawings: {} },
    objectMask: { hidden: {}, ghost: {} },
    setSelection(ids: string[]) { store.setState({ selectedIds: ids }); },
  })));
  const manager = new SelectionManager(viewport as never, () => sprites, () => ({}), store as never, new EventEmitter());
  manager.setHitTestTokensProvider(() => null);
  const event = ([x, y]: [number, number]): FederatedPointerEvent => ({ button: 0, global: { x, y }, stopPropagation: () => undefined }) as unknown as FederatedPointerEvent;
  const overlay = manager.getPlayerViewLayers()[0]!.layer as Graphics;
  return {
    store: store as never,
    sprites,
    overlay,
    drag: (from, to, via = []) => {
      viewport.emit('pointerdown', event(from));
      for (const point of [...via, to]) viewport.emit('pointermove', event(point));
      viewport.emit('pointerup', event(to));
    },
  };
}

describe('SelectionManager and tokens the canvas hides', () => {
  it('leaves hidden tokens out of a box selection', () => {
    const { store, drag } = setup();
    drag([20, 20], [300, 200]);
    expect(store.getState().selectedIds).toEqual(['goblin']);
  });

  it('leaves hidden tokens out of a lasso selection', () => {
    const { store, drag } = setup('lasso');
    drag([20, 20], [20, 200], [[300, 20], [300, 200]]);
    expect(store.getState().selectedIds).toEqual(['goblin']);
  });

  it('draws no selection box around a selected token that is hidden', () => {
    const { store, overlay } = setup();
    store.setState({ selectedIds: ['lurker'] });
    expect(overlay.context.instructions).toHaveLength(0);
    store.setState({ selectedIds: ['goblin'] });
    expect(overlay.context.instructions.length).toBeGreaterThan(0);
  });
});
