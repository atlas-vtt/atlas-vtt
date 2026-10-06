import { describe, expect, it, vi } from 'vitest';
import type { FederatedPointerEvent } from 'pixi.js';
import { FogOfWarRenderer } from '../../src/app/pixi/fog/FogOfWarRenderer';
import { ShapeStroke, type StrokeMode } from '../../src/app/tools/shapeStroke';

interface FogState {
  activeTool: string;
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
  cursorPreview: { shown: boolean; erasing: boolean | null };
  rebuildFogSprites: ReturnType<typeof vi.fn>;
  renderPreviewFromStore: ReturnType<typeof vi.fn>;
  compositor: { composite: ReturnType<typeof vi.fn> };
}

const at = (x: number, y: number): FederatedPointerEvent => ({ button: 0, global: { x, y } }) as unknown as FederatedPointerEvent;
const graphics = (): Record<string, ReturnType<typeof vi.fn>> => ({ clear: vi.fn(), rect: vi.fn(), poly: vi.fn(), stroke: vi.fn().mockReturnThis(), fill: vi.fn() });

/** The fog renderer's drawing tool on a 70 px grid, without its canvas: what a stroke commits is what the store is given. */
function fogTool(activeTool: 'fog' | 'eraser', mode: StrokeMode): { tool: FogToolHarness; state: FogState; notify: () => void } {
  const state: FogState = { activeTool, isMapLoading: false, grid: { size: 70 }, objects: { fog: {} }, addFogOperation: vi.fn() };
  const listeners: ((state: FogState) => void)[] = [];
  const tool = Object.assign(Object.create(FogOfWarRenderer.prototype) as FogOfWarRenderer, {
    store: { getState: () => state, subscribe: (listener: (state: FogState) => void) => (listeners.push(listener), () => undefined) },
    viewport: { toWorld: (point: { x: number; y: number }) => point },
    stroke: Object.assign(new ShapeStroke(), { mode }),
    compositor: { composite: vi.fn() },
    updatePreviewTexture: vi.fn(),
    cursorPreview: {
      shown: true,
      erasing: null as boolean | null,
      updatePosition: vi.fn(),
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

  it('drops the stroke under way when the mode is switched: nothing is committed, and the brush\'s preview goes', () => {
    const { tool, state } = fogTool('fog', 'brush');
    tool.onPointerDown(at(100, 100));
    tool.onPointerMove(at(160, 100));
    expect(tool.compositor.composite).toHaveBeenCalledTimes(2);
    expect(tool.renderPreviewFromStore).not.toHaveBeenCalled();

    tool.setFogMode('lasso');
    expect(tool.stroke.active).toBe(false);
    expect(tool.stroke.mode).toBe('lasso');
    // The fog as the store holds it, without the stroke that was painted on it.
    expect(tool.rebuildFogSprites).toHaveBeenCalledTimes(1);
    tool.onPointerUp();
    expect(state.addFogOperation).not.toHaveBeenCalled();
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
