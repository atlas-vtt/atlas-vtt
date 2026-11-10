// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { InteractionController } from '../../src/app/pixi/token-renderer/InteractionController';

function makeController(selectedIds: string[]): { controller: InteractionController; setSelection: ReturnType<typeof vi.fn>; setTokenPositions: ReturnType<typeof vi.fn>; viewport: any } {
  const setSelection = vi.fn();
  const setTokenPositions = vi.fn();
  const viewport = {
    on: vi.fn(),
    off: vi.fn(),
    toWorld: vi.fn(() => ({ x: 0, y: 0 })),
    plugins: { pause: vi.fn(), resume: vi.fn() },
  } as any;
  const store = {
    getState: () => ({
      activeTool: 'select',
      selectedIds,
      setSelection,
      setIsDragging: vi.fn(),
      setTokenPositions,
      dropTokens: vi.fn(),
      grid: { snapToGrid: false },
      objects: { tokens: { a: { id: 'a' }, b: { id: 'b' } } },
      heldTokens: {},
      setHeldTokens: vi.fn(),
    }),
  } as any;
  const controller = new InteractionController(viewport, store, {} as any, {} as any, {} as any, false);
  controller.setTokenSpriteProvider(() => null);
  return { controller, setSelection, setTokenPositions, viewport };
}

const shiftClick = { button: 0, shiftKey: true, global: { x: 0, y: 0 }, stopPropagation: vi.fn() } as any;
const plainClick = { ...shiftClick, shiftKey: false } as any;

describe('InteractionController shift-click selection', () => {
  it('adds an unselected token to the selection and prepares a group drag', () => {
    const { controller, setSelection, viewport } = makeController(['a']);
    controller.handleViewportTokenPointerDown('b', shiftClick);
    expect(setSelection).toHaveBeenCalledWith(['a', 'b']);
    expect(viewport.plugins.pause).toHaveBeenCalledWith('drag');
    expect(controller.isDraggingTokens()).toBe(true);
  });

  it('removes a selected token without starting a drag', () => {
    const { controller, setSelection, viewport } = makeController(['a', 'b']);
    controller.handleViewportTokenPointerDown('b', shiftClick);
    expect(setSelection).toHaveBeenCalledWith(['a']);
    expect(viewport.plugins.pause).not.toHaveBeenCalled();
    expect(controller.isDraggingTokens()).toBe(false);
  });

  it('plain click replaces the selection once the button is released', () => {
    const { controller, setSelection, viewport } = makeController(['a']);
    controller.handleViewportTokenPointerDown('b', plainClick);
    expect(setSelection).not.toHaveBeenCalled();
    const onUp = viewport.on.mock.calls.find(([name]: [string]) => name === 'pointerup')[1];
    onUp({ global: { x: 0, y: 0 } });
    expect(setSelection).toHaveBeenCalledWith(['b']);
  });

  it('a drag of a token outside the selection leaves the selection as it was', () => {
    const { controller, setSelection, viewport } = makeController(['a']);
    controller.setTokenSpriteProvider(() => ({ position: { x: 35, y: 35, set: vi.fn() } }) as any);
    (viewport.toWorld as ReturnType<typeof vi.fn>).mockImplementation((point: { x: number; y: number }) => point);
    controller.handleViewportTokenPointerDown('b', { ...plainClick, global: { x: 35, y: 35 } });
    const onMove = viewport.on.mock.calls.find(([name]: [string]) => name === 'pointermove')[1];
    const onUp = viewport.on.mock.calls.find(([name]: [string]) => name === 'pointerup')[1];
    onMove({ global: { x: 105, y: 35 } });
    onUp({ global: { x: 105, y: 35 } });
    expect(setSelection).not.toHaveBeenCalled();
  });
});

describe('InteractionController drag ruler', () => {
  it('measures the grabbed token of a group drag and stops on release', () => {
    const { controller, viewport } = makeController(['a', 'b']);
    const sprites: Record<string, { position: { x: number; y: number; set: ReturnType<typeof vi.fn> } }> = {
      a: { position: { x: 35, y: 35, set: vi.fn() } },
      b: { position: { x: 105, y: 35, set: vi.fn() } },
    };
    controller.setTokenSpriteProvider(id => (sprites[id] ?? null) as any);
    const ruler = { begin: vi.fn(), update: vi.fn(), end: vi.fn() };
    controller.setDragRuler(ruler as any);
    (viewport.toWorld as ReturnType<typeof vi.fn>).mockImplementation((point: { x: number; y: number }) => point);

    controller.handleViewportTokenPointerDown('b', { ...plainClick, global: { x: 105, y: 35 } });
    const onMove = viewport.on.mock.calls.find(([name]: [string]) => name === 'pointermove')[1];
    const onUp = viewport.on.mock.calls.find(([name]: [string]) => name === 'pointerup')[1];
    onMove({ global: { x: 245, y: 35 } });

    expect(ruler.begin).toHaveBeenCalledWith('b', { x: 105, y: 35 });
    expect(ruler.update).toHaveBeenLastCalledWith({ x: 245, y: 35 });

    onUp({ global: { x: 245, y: 35 } });
    expect(ruler.end).toHaveBeenCalled();
  });
});

describe('InteractionController drag positions', () => {
  it('moves the stored token with every pointer move, so sight and its footprint never trail the sprite', () => {
    const { controller, setTokenPositions, viewport } = makeController(['a']);
    const sprite = { position: { x: 35, y: 35, set: vi.fn() } };
    controller.setTokenSpriteProvider(() => sprite as any);
    (viewport.toWorld as ReturnType<typeof vi.fn>).mockImplementation((point: { x: number; y: number }) => point);

    controller.handleViewportTokenPointerDown('a', { ...plainClick, global: { x: 35, y: 35 } });
    const onMove = viewport.on.mock.calls.find(([name]: [string]) => name === 'pointermove')[1];
    onMove({ global: { x: 60, y: 35 } });
    onMove({ global: { x: 70, y: 35 } });

    expect(sprite.position.set).toHaveBeenLastCalledWith(70, 35);
    expect(setTokenPositions).toHaveBeenLastCalledWith([{ id: 'a', x: 70, y: 35 }]);
  });
});
