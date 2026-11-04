import { expect, it, vi } from 'vitest';
import type { FederatedPointerEvent } from 'pixi.js';
import { FogOfWarRenderer } from '../../src/app/pixi/fog/FogOfWarRenderer';
import { ShapeStroke } from '../../src/app/tools/shapeStroke';

interface FogToolHarness {
  stroke: ShapeStroke;
  enableFogMode(): void;
  onPointerDown(event: FederatedPointerEvent): void;
  onPointerMove(event: FederatedPointerEvent): void;
  onPointerUp(): void;
}

const pointer = (button: number, at = 140): FederatedPointerEvent =>
  ({ button, global: { x: at, y: at } }) as unknown as FederatedPointerEvent;

function fogTool(): { tool: FogToolHarness; viewport: { pause: boolean }; addFogOperation: ReturnType<typeof vi.fn> } {
  const viewport = { pause: false, toWorld: (point: { x: number; y: number }) => point };
  const addFogOperation = vi.fn();
  const state = { activeTool: 'fog', isMapLoading: false, grid: { size: 70 }, objects: { fog: {} }, addFogOperation };
  const tool = Object.assign(Object.create(FogOfWarRenderer.prototype) as FogOfWarRenderer, {
    store: { getState: () => state },
    viewport,
    stroke: Object.assign(new ShapeStroke(), { mode: 'rectangle' }),
    container: {},
    fogSprites: new Map(),
    previewSprite: {},
    renderPreviewFromStore: vi.fn(),
    refreshBounds: vi.fn(),
    rectPreviewGraphics: { clear: vi.fn(), rect: vi.fn(), stroke: vi.fn().mockReturnThis(), fill: vi.fn() },
  }) as unknown as FogToolHarness;
  return { tool, viewport, addFogOperation };
}

it('keeps the map pannable and zoomable while the fog tool is active', () => {
  const { tool, viewport } = fogTool();

  tool.enableFogMode();

  expect(viewport.pause).toBe(false);
});

it('paints fog with the primary button only, so a right-drag pans', () => {
  const { tool, addFogOperation } = fogTool();

  tool.onPointerDown(pointer(2));
  expect(tool.stroke.active).toBe(false);

  tool.onPointerDown(pointer(0));
  expect(tool.stroke.active).toBe(true);
  tool.onPointerMove(pointer(0, 215));

  tool.onPointerUp();
  expect(tool.stroke.active).toBe(false);
  // The rectangle's corners snap to the 70 px grid's.
  expect(addFogOperation).toHaveBeenCalledOnce();
  expect(addFogOperation).toHaveBeenCalledWith({ type: 'rectangle', isErasing: false, x: 140, y: 140, width: 70, height: 70 });
});
