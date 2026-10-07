import { EventEmitter } from 'events';
import { Container, Sprite, type FederatedPointerEvent, type Graphics } from 'pixi.js';
import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';
import { SelectionManager } from '../../src/app/pixi/SelectionManager';
import type { DrawingStroke } from '../../src/app/types';

export type ScreenPoint = [number, number];

export interface SelectionHarness {
  store: { getState: () => { selectedIds: string[] }; setState: (patch: Record<string, unknown>) => void };
  overlay: Graphics;
  /** Presses at `from`, moves through `via` to `to` and releases there. */
  drag: (from: ScreenPoint, to: ScreenPoint, via?: ScreenPoint[]) => void;
}

export interface SelectionScene {
  selectionMode?: 'box' | 'lasso';
  /** Token groups by id, as the token renderer hands them over. */
  tokens: Record<string, Container>;
  drawings?: Record<string, DrawingStroke>;
  /** Fog sprites by id, as the fog renderer hands them over. */
  fog?: Record<string, Container>;
}

/** A token group at (x, y) with art 70 px wide; the canvas shows it or hides it, as with the GM view switch off. */
export function tokenSprite(x: number, y: number, visible: boolean): Container {
  const group = new Container();
  const sprite = group.addChild(new Sprite());
  sprite.width = 70;
  sprite.height = 70;
  group.position.set(x, y);
  group.visible = visible;
  return group;
}

/** A pen stroke through `points`, 2 px wide. */
export function penStroke(id: string, points: Array<{ x: number; y: number }>): DrawingStroke {
  return { id, kind: 'drawing', timestamp: 0, type: 'pen', points, color: '#000000', width: 2, opacity: 1 };
}

/**
 * A `SelectionManager` with the select tool, on a viewport whose world
 * coordinates are its screen coordinates, over the given tokens, drawings and fog.
 */
export function selectionHarness({ selectionMode = 'box', tokens, drawings = {}, fog = {} }: SelectionScene): SelectionHarness {
  const viewport = Object.assign(new Container(), { toWorld: (point: { x: number; y: number }) => ({ x: point.x, y: point.y }) });
  const tokenRecords = Object.fromEntries(Object.keys(tokens).map((id) => [id, { id }]));
  const store = createStore(subscribeWithSelector(() => ({
    selectedIds: [] as string[],
    activeTool: 'select',
    selectionMode,
    objects: { tokens: tokenRecords, drawings },
    setSelection(ids: string[]) { store.setState({ selectedIds: ids }); },
  })));
  const manager = new SelectionManager(viewport as never, () => tokens, () => fog, store as never, new EventEmitter());
  manager.setHitTestTokensProvider(() => null);
  const event = ([x, y]: ScreenPoint): FederatedPointerEvent => ({ button: 0, global: { x, y }, stopPropagation: () => undefined }) as unknown as FederatedPointerEvent;
  const overlay = manager.getPlayerViewLayers()[0]!.layer as Graphics;
  return {
    store: store as never,
    overlay,
    drag: (from, to, via = []) => {
      viewport.emit('pointerdown', event(from));
      for (const point of [...via, to]) viewport.emit('pointermove', event(point));
      viewport.emit('pointerup', event(to));
    },
  };
}
