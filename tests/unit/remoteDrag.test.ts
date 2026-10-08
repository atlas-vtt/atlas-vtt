import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import { InteractionController } from '../../src/app/pixi/token-renderer/InteractionController';
import { cancelLostDrag, mayDragInRemoteView, REMOTE_DRAG_CANCEL, REMOTE_TOKEN_DROPPED } from '../../src/app/remote-view/remoteDrag';
import { initialRemoteViewState, type RemoteViewState } from '../../src/app/remote-view/remoteViewState';

const movable = (ids: string[]): RemoteViewState => ({ ...initialRemoteViewState(), movableTokenIds: ids });
const SNAPPING = { enabled: true, snapToGrid: true, type: 'square', size: 70, offsetX: 0, offsetY: 0, opacity: 1 };

function makeController(options: { player: boolean; remoteView: RemoteViewState | null; selectedIds?: string[]; grid?: object }) {
  const setSelection = vi.fn();
  const viewport = {
    on: vi.fn(), off: vi.fn(),
    toWorld: vi.fn((point: { x: number; y: number }) => point),
    plugins: { pause: vi.fn(), resume: vi.fn() },
  } as any;
  const state = {
    activeTool: 'move', selectedIds: options.selectedIds ?? [], setSelection, setIsDragging: vi.fn(),
    setTokenPositions: vi.fn(), dropTokens: vi.fn(), heldTokens: {}, setHeldTokens: vi.fn(), grid: options.grid ?? { snapToGrid: false },
    objects: { tokens: { a: { id: 'a', x: 35, y: 35 }, b: { id: 'b', x: 105, y: 35 } } },
    remoteView: options.remoteView,
  };
  const store = { getState: () => state } as any;
  const eventBus = new EventEmitter();
  const gridSystem = { snapTokenCenter: (x: number, y: number) => ({ x, y }) } as any;
  const controller = new InteractionController(viewport, store, gridSystem, eventBus, {} as any, options.player);
  const sprites: Record<string, { position: { x: number; y: number; set: ReturnType<typeof vi.fn> } }> = {
    a: { position: { x: 35, y: 35, set: vi.fn() } },
    b: { position: { x: 105, y: 35, set: vi.fn() } },
  };
  controller.setTokenSpriteProvider((id) => (sprites[id] ?? null) as any);
  const drops: unknown[] = [];
  eventBus.on(REMOTE_TOKEN_DROPPED, (drop) => drops.push(drop));
  const press = (tokenId: string, extra: Record<string, unknown> = {}): void => controller.handleViewportTokenPointerDown(tokenId, {
    button: 0, shiftKey: false, altKey: false, global: { x: sprites[tokenId]!.position.x, y: sprites[tokenId]!.position.y }, stopPropagation: vi.fn(), ...extra,
  } as any);
  const handler = (name: string) => viewport.on.mock.calls.find(([event]: [string]) => event === name)[1];
  const dragTo = (x: number, y: number): void => {
    handler('pointermove')({ global: { x, y } });
    handler('pointerup')({ global: { x, y } });
  };
  return { controller, viewport, setSelection, drops, press, dragTo, handler, state, eventBus, sprites };
}

describe('mayDragInRemoteView', () => {
  it('allows only a token its owner lets the player move, and never outside a remote view', () => {
    expect(mayDragInRemoteView({ remoteView: movable(['a']) }, 'a')).toBe(true);
    expect(mayDragInRemoteView({ remoteView: movable(['a']) }, 'b')).toBe(false);
    expect(mayDragInRemoteView({ remoteView: null }, 'a')).toBe(false);
  });
});

describe('dragging in the remote view', () => {
  it('drags only a token the player may move', () => {
    const t = makeController({ player: true, remoteView: movable(['a']) });
    t.press('b');
    expect(t.viewport.plugins.pause).not.toHaveBeenCalled();
    t.press('a');
    expect(t.viewport.plugins.pause).toHaveBeenCalledWith('drag');
    expect(t.controller.isDraggingTokens()).toBe(true);
  });

  it('drags one token at a time: no Shift groups, no Alt copies', () => {
    const t = makeController({ player: true, remoteView: movable(['a', 'b']), selectedIds: ['a', 'b'] });
    t.press('a', { shiftKey: true, altKey: true });
    expect(t.setSelection).toHaveBeenCalledWith(['a']);
    t.dragTo(175, 105);
    expect(t.drops).toEqual([{ tokenId: 'a', x: 175, y: 105 }]);
  });

  it('reports each drop once at its snapped point, and the token goes back without a drop of its own', () => {
    const t = makeController({ player: true, remoteView: movable(['a']), grid: SNAPPING });
    t.press('a');
    t.dragTo(160, 100);
    expect(t.drops).toEqual([{ tokenId: 'a', x: 175, y: 105 }]);
    expect(t.state.dropTokens).not.toHaveBeenCalled();
    expect(t.sprites.a!.position.set).toHaveBeenLastCalledWith(35, 35);
    expect(t.state.setTokenPositions).toHaveBeenLastCalledWith([{ id: 'a', x: 35, y: 35 }]);
  });

  it('drags nothing in the local player window', () => {
    const local = makeController({ player: true, remoteView: null });
    local.press('a');
    expect(local.viewport.plugins.pause).not.toHaveBeenCalled();
  });

  it('cancels a drag in progress: the token goes back and nothing is dropped', () => {
    const t = makeController({ player: true, remoteView: movable(['a']) });
    t.press('a');
    t.handler('pointermove')({ global: { x: 175, y: 105 } });
    t.eventBus.emit(REMOTE_DRAG_CANCEL);
    expect(t.sprites.a!.position.set).toHaveBeenLastCalledWith(35, 35);
    expect(t.controller.isDraggingTokens()).toBe(false);
    expect(t.viewport.plugins.resume).toHaveBeenCalledWith('drag');
    expect(t.viewport.off).toHaveBeenCalledWith('pointerup', expect.anything(), expect.anything());
    expect(t.drops).toEqual([]);
  });

  it('ends a drag whose token may no longer move or left the scene', () => {
    const eventBus = { emit: vi.fn() };
    const objects = { tokens: { a: {} } } as never;
    cancelLostDrag({ remoteView: movable(['a']), selectedIds: ['a'], objects }, eventBus);
    expect(eventBus.emit).not.toHaveBeenCalled();
    cancelLostDrag({ remoteView: movable([]), selectedIds: ['a'], objects }, eventBus);
    cancelLostDrag({ remoteView: movable(['b']), selectedIds: ['b'], objects }, eventBus);
    expect(eventBus.emit).toHaveBeenCalledTimes(2);
    expect(eventBus.emit).toHaveBeenCalledWith(REMOTE_DRAG_CANCEL);
  });

  it('GM view: keeps group drags and reports no drop', () => {
    const t = makeController({ player: false, remoteView: null, selectedIds: ['a', 'b'] });
    t.press('b');
    expect(t.setSelection).not.toHaveBeenCalled();
    t.dragTo(175, 105);
    expect(t.state.dropTokens).toHaveBeenLastCalledWith([{ id: 'a', x: 105, y: 105 }, { id: 'b', x: 175, y: 105 }]);
    expect(t.drops).toEqual([]);
  });
});
