// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { InteractionController } from '../../src/app/pixi/token-renderer/InteractionController';
import type { TokenEntity } from '../../src/app/types';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const START = { x: 100, y: 100 };
const BEYOND = { x: 300, y: 100 };
const WALL: WallSegment = { id: 'w', kind: 'wall', type: 'solid', p1: { x: 200, y: 0 }, p2: { x: 200, y: 400 } };

function createStore(isGMView: boolean): ViewAtlasStore {
  const store = createViewAtlasStore(createInMemoryApp().app, `session-walls-${Math.random()}`);
  const mover: TokenEntity = { id: 'mover', kind: 'token', imagePath: 'mover.png', ...START };
  const state = store.getState();
  store.setState({
    persistenceEnabled: false,
    isGMView,
    lighting: { ...state.lighting, enabled: true },
    grid: { ...state.grid, snapToGrid: false },
    objects: { ...state.objects, tokens: { mover }, walls: { w: WALL } },
  });
  return store;
}

function drag(store: ViewAtlasStore, to: { x: number; y: number }): void {
  const handlers = new Map<string, (event: unknown) => void>();
  const viewport = {
    on: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler),
    off: (name: string) => handlers.delete(name),
    toWorld: (point: { x: number; y: number }) => point,
    plugins: { pause: vi.fn(), resume: vi.fn() },
    options: { events: { domElement: document.body.createEl('canvas') } },
  };
  const gridSystem = { snapTokenCenter: (x: number, y: number) => ({ x, y }) };
  const controller = new InteractionController(viewport as never, store, gridSystem as never, {} as never, createInMemoryApp().app, false);
  controller.setTokenSpriteProvider((id) => {
    const entry = store.getState().objects.tokens[id];
    return entry ? { position: { x: entry.x, y: entry.y, set: vi.fn() }, getChildByLabel: () => null } as never : null;
  });
  controller.handleViewportTokenPointerDown('mover', { button: 0, shiftKey: false, altKey: false, global: START, stopPropagation: vi.fn() } as never);
  handlers.get('pointermove')?.({ global: to });
  handlers.get('pointerup')?.({ global: to });
}

describe('dragging a token across a wall', () => {
  afterEach(() => document.body.replaceChildren());

  it('stops before the wall in session view', () => {
    const store = createStore(false);
    drag(store, BEYOND);
    const { x } = store.getState().objects.tokens.mover!;
    expect(x).toBeGreaterThan(START.x);
    expect(x).toBeLessThan(WALL.p1.x);
  });

  it('passes the wall in GM view', () => {
    const store = createStore(true);
    drag(store, BEYOND);
    expect(store.getState().objects.tokens.mover).toMatchObject(BEYOND);
  });
});
