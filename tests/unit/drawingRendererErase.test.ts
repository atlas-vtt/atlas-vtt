import { EventEmitter } from 'events';
import { EventBoundary, FederatedPointerEvent, type EventSystem } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DrawingRenderer } from '../../src/app/pixi/DrawingRenderer';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import type { DrawingStroke } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

type AnnotatedStroke = DrawingStroke & {
  label: string;
  annotation: { tags: string[]; numbered: boolean };
};

vi.mock('../../src/app/pixi/utils/lucideIconTexture', async () => {
  const { Texture, TextureSource } = await import('pixi.js');
  return {
    createLucideIconTexture: async (): Promise<Texture> =>
      new Texture({ source: new TextureSource({ width: 96, height: 96 }) }),
  };
});

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.restoreAllMocks();
});

function setup(): {
  store: ReturnType<typeof createViewAtlasStore>;
  stroke: AnnotatedStroke;
  history: NonNullable<ReturnType<typeof getHistoryStore>>;
  pointer: (type: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y?: number) => void;
} {
  const canvas = createEl('canvas');
  const viewport = new Viewport({
    screenWidth: 800,
    screenHeight: 600,
    events: { domElement: canvas } as EventSystem,
  });
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, 'drawing-erase-test');
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/drawings.atlasmap');
  const stroke = {
    id: 'original', kind: 'drawing', timestamp: 10, type: 'pen',
    points: Array.from({ length: 21 }, (_, i) => ({ x: i * 10, y: 0 })),
    color: '#336699', width: 4, opacity: 0.6,
    label: 'Path to the gate', annotation: { tags: ['route'], numbered: false },
  } satisfies AnnotatedStroke;
  store.getState().setDrawings({ [stroke.id]: stroke });
  store.getState().setActiveTool('draw-eraser');
  const bus = new EventEmitter();
  const renderer = new DrawingRenderer(viewport, bus, store);
  bus.emit('drawing-settings-changed', { eraserWidth: 20 });
  const history = getHistoryStore(store)!;
  history.getState().clear();
  vi.spyOn(Date, 'now').mockReturnValue(2000);
  const boundary = new EventBoundary(viewport);
  function pointer(type: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y = 0): void {
    const event = new FederatedPointerEvent(boundary);
    event.button = 0;
    event.global.set(x, y);
    viewport.emit(type, event);
  }
  cleanup = () => {
    renderer.destroy();
    viewport.destroy();
  };
  return { store, stroke, history, pointer };
}

describe('drawing eraser', () => {
  it('keeps all saved properties on each fragment, with new identities and points', () => {
    const { store, stroke, pointer } = setup();
    pointer('pointerdown', 100);
    pointer('pointerup', 100);

    const fragments = Object.values(store.getState().objects.drawings);
    expect(fragments).toHaveLength(2);
    expect(fragments.map(fragment => fragment.points)).toEqual([
      stroke.points.slice(0, 9), stroke.points.slice(12),
    ]);
    expect(new Set(fragments.map(fragment => fragment.id)).size).toBe(2);
    for (const fragment of fragments) {
      expect(fragment).toMatchObject({
        type: stroke.type, color: stroke.color, width: stroke.width, opacity: stroke.opacity,
        label: stroke.label, annotation: stroke.annotation, kind: 'drawing', timestamp: 2000,
      });
      expect(fragment.id).not.toBe(stroke.id);
    }
    expect(stroke.points).toHaveLength(21);
    expect(stroke.timestamp).toBe(10);
    expect(store.getState().objects.drawings.original).toBeUndefined();
  });

  it('keeps a sweep across several fragments in one undo step', () => {
    const { store, stroke, history, pointer } = setup();
    pointer('pointerdown', 60);
    pointer('pointermove', 140);
    expect(history.getState().pastStates).toHaveLength(0);
    pointer('pointerup', 140);

    const erased = store.getState().objects.drawings;
    expect(Object.values(erased)).toHaveLength(3);
    for (const fragment of Object.values(erased)) {
      expect(fragment).toMatchObject({ label: stroke.label, annotation: stroke.annotation });
    }
    expect(history.getState().pastStates).toHaveLength(1);
    history.getState().undo();
    expect(store.getState().objects.drawings).toEqual({ original: stroke });
    history.getState().redo();
    expect(store.getState().objects.drawings).toEqual(erased);
  });

  it('keeps properties when trimming the end of a stroke', () => {
    const { store, stroke, pointer } = setup();
    pointer('pointerdown', 200);
    pointer('pointerup', 200);
    const fragments = Object.values(store.getState().objects.drawings);
    expect(fragments).toHaveLength(1);
    expect(fragments[0]).toMatchObject({
      points: stroke.points.slice(0, 19), label: stroke.label, annotation: stroke.annotation,
    });
  });

  it('leaves a missed stroke and history untouched', () => {
    const { store, history, pointer } = setup();
    const drawings = store.getState().objects.drawings;
    pointer('pointerdown', 100, 500);
    pointer('pointerup', 100, 500);
    expect(store.getState().objects.drawings).toBe(drawings);
    expect(history.getState().pastStates).toHaveLength(0);
  });

  it('removes a fully covered stroke without leaving fragments', () => {
    const { store, stroke, history, pointer } = setup();
    store.getState().setDrawings({ original: { ...stroke, points: [{ x: 0, y: 0 }, { x: 5, y: 0 }] } });
    history.getState().clear();
    pointer('pointerdown', 0);
    pointer('pointerup', 0);
    expect(store.getState().objects.drawings).toEqual({});
    expect(history.getState().pastStates).toHaveLength(1);
  });

  it('erases an icon as a whole and restores its properties on undo', async () => {
    const { store, stroke, history, pointer } = setup();
    const icon = { ...stroke, type: 'icon' as const, icon: 'door-open', points: [{ x: 0, y: 0 }] };
    store.getState().setDrawings({ original: icon });
    // Let the stubbed browser texture finish before the renderer is destroyed.
    await Promise.resolve();
    history.getState().clear();
    pointer('pointerdown', 0);
    pointer('pointerup', 0);
    expect(store.getState().objects.drawings).toEqual({});
    expect(history.getState().pastStates).toHaveLength(1);
    history.getState().undo();
    expect(store.getState().objects.drawings).toEqual({ original: icon });
  });
});
