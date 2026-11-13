import { describe, expect, it, vi } from 'vitest';
import type { FederatedPointerEvent } from 'pixi.js';
import { FogOfWarRenderer } from '../../src/app/pixi/fog/FogOfWarRenderer';
import { DEFAULT_FOG_TOOL, type FogToolChoices } from '../../src/app/fog/fogToolChoices';
import { ShapeStroke, type StrokeMode } from '../../src/app/tools/shapeStroke';

interface FogState {
  activeTool: string;
  fogTool: FogToolChoices;
  isMapLoading: boolean;
  grid: { size: number };
  objects: { fog: Record<string, unknown> };
  addFogOperation: ReturnType<typeof vi.fn>;
}

interface FogToolHarness {
  stroke: ShapeStroke;
  setFogMode(mode: StrokeMode): void;
  setupStoreSubscriptions(): void;
  onPointerDown(event: FederatedPointerEvent): void;
  onPointerMove(event: FederatedPointerEvent): void;
  onPointerUp(): void;
  onPointerLeave(): void;
  /** What the stroke's keys tell the tool (`FogStrokeKeys`): Alt went down or up, and Escape. */
  setFlipped(held: boolean): void;
  dropStroke(): void;
  strokeKeys: { hold: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };
  cursorPreview: { shown: boolean; erasing: boolean | null; radius: number | null };
  rebuildFogSprites: ReturnType<typeof vi.fn>;
  renderPreviewFromStore: ReturnType<typeof vi.fn>;
  compositor: { composite: ReturnType<typeof vi.fn> };
}

const at = (x: number, y: number, altKey = false): FederatedPointerEvent => ({ button: 0, global: { x, y }, altKey }) as unknown as FederatedPointerEvent;
const graphics = (): Record<string, ReturnType<typeof vi.fn>> => ({ clear: vi.fn(), rect: vi.fn(), poly: vi.fn(), stroke: vi.fn().mockReturnThis(), fill: vi.fn() });

/** The fog renderer's drawing tool on a 70 px grid, without its canvas: what a stroke commits is what the store is given. */
function fogTool(activeTool: 'fog' | 'eraser', mode: StrokeMode): { tool: FogToolHarness; state: FogState; notify: () => void } {
  const state: FogState = { activeTool, fogTool: { ...DEFAULT_FOG_TOOL, shape: mode }, isMapLoading: false, grid: { size: 70 }, objects: { fog: {} }, addFogOperation: vi.fn() };
  const listeners: ((state: FogState) => void)[] = [];
  const tool = Object.assign(Object.create(FogOfWarRenderer.prototype) as FogOfWarRenderer, {
    store: { getState: () => state, subscribe: (listener: (state: FogState) => void) => (listeners.push(listener), () => undefined) },
    viewport: { toWorld: (point: { x: number; y: number }) => point, scale: { x: 1 } },
    stroke: Object.assign(new ShapeStroke(), { mode }),
    flipped: false,
    strokeKeys: { hold: vi.fn(), release: vi.fn() },
    compositor: { composite: vi.fn() },
    updatePreviewTexture: vi.fn(),
    cursorPreview: {
      shown: true,
      erasing: null as boolean | null,
      radius: null as number | null,
      updatePosition: vi.fn(),
      setBrushRadius(radius: number): void { this.radius = radius; },
      show(erasing: boolean): void { Object.assign(this, { shown: true, erasing }); },
      hide(): void { this.shown = false; },
    },
    lassoGraphics: graphics(),
    rectPreviewGraphics: graphics(),
    rebuildFogSprites: vi.fn(),
    refreshBounds: vi.fn(),
    renderPreviewFromStore: vi.fn(),
    container: { visible: true },
    previewSprite: {},
  }) as unknown as FogToolHarness;
  return { tool, state, notify: () => listeners.forEach((listener) => listener(state)) };
}

describe('the fog tool\'s stroke', () => {
  it('does not redraw fog for a pointer release without a stroke', () => {
    const { tool } = fogTool('fog', 'brush');
    tool.onPointerUp();
    expect(tool.rebuildFogSprites).not.toHaveBeenCalled();
  });

  it('commits fog with the fog tool and an erase with the eraser, as wide as the brush', () => {
    for (const [activeTool, isErasing] of [['fog', false], ['eraser', true]] as const) {
      const { tool, state } = fogTool(activeTool, 'brush');
      tool.stroke.brushRadius = 35;
      tool.onPointerDown(at(100, 100));
      tool.onPointerMove(at(130, 110));
      tool.onPointerUp();
      expect(state.addFogOperation).toHaveBeenCalledTimes(1);
      expect(state.addFogOperation).toHaveBeenCalledWith({ type: 'brush', isErasing, brushRadius: 35, points: [{ x: 100, y: 100 }, { x: 130, y: 110 }] });
    }
  });

  it('snaps only the rectangle to the grid: a lasso and a brush stroke go where the pointer went', () => {
    const lasso = fogTool('fog', 'lasso');
    lasso.tool.onPointerDown(at(33, 33));
    lasso.tool.onPointerMove(at(141, 37));
    lasso.tool.onPointerMove(at(90, 121));
    lasso.tool.onPointerUp();
    expect(lasso.state.addFogOperation).toHaveBeenCalledWith({ type: 'lasso', isErasing: false, points: [{ x: 33, y: 33 }, { x: 141, y: 37 }, { x: 90, y: 121 }] });

    const brush = fogTool('fog', 'brush');
    brush.tool.onPointerDown(at(33, 33));
    brush.tool.onPointerUp();
    expect(brush.state.addFogOperation).toHaveBeenCalledWith({ type: 'brush', isErasing: false, brushRadius: 50, points: [{ x: 33, y: 33 }] });

    const rectangle = fogTool('eraser', 'rectangle');
    rectangle.tool.onPointerDown(at(33, 33));
    rectangle.tool.onPointerMove(at(141, 121));
    rectangle.tool.onPointerUp();
    expect(rectangle.state.addFogOperation).toHaveBeenCalledWith({ type: 'rectangle', isErasing: true, x: 0, y: 0, width: 140, height: 140 });
  });

  it('drops the stroke under way when the bar chooses another shape: nothing is committed, and the brush\'s preview goes', () => {
    const { tool, state, notify } = fogTool('fog', 'brush');
    tool.setupStoreSubscriptions();
    tool.onPointerDown(at(100, 100));
    tool.onPointerMove(at(160, 100));
    expect(tool.compositor.composite).toHaveBeenCalledTimes(2);
    expect(tool.renderPreviewFromStore).not.toHaveBeenCalled();
    expect(tool.strokeKeys.hold).toHaveBeenCalledTimes(1);

    state.fogTool = { ...state.fogTool, shape: 'lasso' };
    notify();
    expect(tool.stroke.active).toBe(false);
    expect(tool.stroke.mode).toBe('lasso');
    expect(tool.strokeKeys.release).toHaveBeenCalled();
    // The fog as the store holds it, without the stroke that was painted on it.
    expect(tool.rebuildFogSprites).toHaveBeenCalledTimes(1);
    // A lasso has no ring.
    expect(tool.cursorPreview.shown).toBe(false);
    tool.onPointerUp();
    expect(state.addFogOperation).not.toHaveBeenCalled();
  });

  it('takes the brush\'s size from the tool\'s choices, and keeps a stroke under way while only the size changes', () => {
    const { tool, state, notify } = fogTool('fog', 'brush');
    tool.setupStoreSubscriptions();
    tool.onPointerDown(at(100, 100));
    state.fogTool = { ...state.fogTool, brushSize: 80 };
    notify();
    expect(tool.stroke.active).toBe(true);
    expect(tool.cursorPreview.radius).toBe(80);
    tool.onPointerUp();
    expect(state.addFogOperation).toHaveBeenCalledWith({ type: 'brush', isErasing: false, brushRadius: 80, points: [{ x: 100, y: 100 }] });
  });

  it('does the other of hiding and revealing while Alt is held, as the ring and the preview show', () => {
    for (const [activeTool, reveals] of [['fog', false], ['eraser', true]] as const) {
      const { tool, state } = fogTool(activeTool, 'brush');
      tool.onPointerDown(at(100, 100, true));
      expect(tool.cursorPreview.erasing).toBe(!reveals);
      expect(tool.compositor.composite.mock.lastCall?.[1]).toMatchObject({ type: 'brush', isErasing: !reveals });
      tool.onPointerMove(at(130, 100, true));
      tool.onPointerUp();
      expect(state.addFogOperation).toHaveBeenCalledWith(expect.objectContaining({ isErasing: !reveals }));
    }
  });

  it('follows Alt pressed and let go during a stroke: what is committed is what the key says at the release', () => {
    const { tool, state } = fogTool('fog', 'rectangle');
    tool.onPointerDown(at(0, 0));
    tool.onPointerMove(at(140, 140));
    expect(tool.compositor.composite.mock.lastCall?.[1]).toMatchObject({ type: 'rectangle', isErasing: false });
    // The key goes down while the pointer rests: the preview turns around without a move.
    tool.setFlipped(true);
    expect(tool.compositor.composite.mock.lastCall?.[1]).toMatchObject({ type: 'rectangle', isErasing: true });
    tool.setFlipped(false);
    expect(tool.compositor.composite.mock.lastCall?.[1]).toMatchObject({ type: 'rectangle', isErasing: false });
    tool.onPointerUp();
    expect(state.addFogOperation).toHaveBeenCalledWith({ type: 'rectangle', isErasing: false, x: 0, y: 0, width: 140, height: 140 });
    expect(tool.strokeKeys.release).toHaveBeenCalled();
  });

  it('drops the stroke under way on Escape: nothing is committed and the fog is drawn as the store holds it', () => {
    const { tool, state } = fogTool('fog', 'lasso');
    tool.onPointerDown(at(33, 33));
    tool.onPointerMove(at(141, 37));
    tool.onPointerMove(at(90, 121));
    tool.dropStroke();
    expect(tool.stroke.active).toBe(false);
    expect(tool.strokeKeys.release).toHaveBeenCalled();
    expect(tool.rebuildFogSprites).toHaveBeenCalledTimes(1);
    // The pointer is still down: what it does until its release belongs to no stroke.
    tool.onPointerMove(at(60, 200));
    tool.onPointerUp();
    expect(state.addFogOperation).not.toHaveBeenCalled();
    // Without a stroke there is nothing to drop.
    tool.dropStroke();
    expect(tool.rebuildFogSprites).toHaveBeenCalledTimes(1);
  });

  it('shows a lasso and a rectangle as the fog they will make, once they are a shape', () => {
    const lasso = fogTool('eraser', 'lasso');
    lasso.tool.onPointerDown(at(33, 33));
    lasso.tool.onPointerMove(at(141, 37));
    // Two points are no area yet: the fog as it is.
    expect(lasso.tool.compositor.composite.mock.lastCall?.[1]).toBeUndefined();
    lasso.tool.onPointerMove(at(90, 121));
    expect(lasso.tool.compositor.composite.mock.lastCall?.[1]).toMatchObject({ type: 'lasso', isErasing: true, points: [{ x: 33, y: 33 }, { x: 141, y: 37 }, { x: 90, y: 121 }] });

    const rectangle = fogTool('fog', 'rectangle');
    rectangle.tool.onPointerDown(at(33, 33));
    expect(rectangle.tool.compositor.composite.mock.lastCall?.[1]).toBeUndefined();
    rectangle.tool.onPointerMove(at(141, 121));
    expect(rectangle.tool.compositor.composite.mock.lastCall?.[1]).toMatchObject({ type: 'rectangle', isErasing: false, x: 0, y: 0, width: 140, height: 140 });
    // Back on the first corner: no area, and the preview goes.
    rectangle.tool.onPointerMove(at(33, 33));
    expect(rectangle.tool.compositor.composite.mock.lastCall?.[1]).toBeUndefined();
  });

  it('commits nothing for a lasso of two points or a rectangle that never moved', () => {
    const lasso = fogTool('fog', 'lasso');
    lasso.tool.onPointerDown(at(33, 33));
    lasso.tool.onPointerMove(at(141, 37));
    lasso.tool.onPointerUp();
    expect(lasso.state.addFogOperation).not.toHaveBeenCalled();
    const rectangle = fogTool('fog', 'rectangle');
    rectangle.tool.onPointerDown(at(33, 33));
    rectangle.tool.onPointerUp();
    expect(rectangle.state.addFogOperation).not.toHaveBeenCalled();
  });

  it('does not rebuild the fog\'s sprites while a stroke is under way, and does once it is over', () => {
    const { tool, state, notify } = fogTool('fog', 'brush');
    tool.setupStoreSubscriptions();
    tool.onPointerDown(at(100, 100));
    // Fog changes under the stroke, as an undo would change it.
    state.objects = { fog: { a: {} } };
    notify();
    expect(tool.rebuildFogSprites).not.toHaveBeenCalled();

    tool.onPointerUp();
    state.objects = { fog: { a: {}, b: {} } };
    notify();
    expect(tool.rebuildFogSprites).toHaveBeenCalledTimes(1);
  });

  it('hides the brush\'s ring when the pointer leaves the map, and shows it again at the next move', () => {
    const { tool } = fogTool('eraser', 'brush');
    tool.onPointerMove(at(100, 100));
    expect(tool.cursorPreview.shown).toBe(true);
    tool.onPointerLeave();
    expect(tool.cursorPreview.shown).toBe(false);
    tool.onPointerMove(at(120, 100));
    expect(tool.cursorPreview).toMatchObject({ shown: true, erasing: true });

    // A lasso has no ring to bring back.
    const lasso = fogTool('fog', 'lasso');
    lasso.tool.onPointerLeave();
    lasso.tool.onPointerMove(at(120, 100));
    expect(lasso.tool.cursorPreview.shown).toBe(false);
  });
});
