import { describe, expect, it } from 'vitest';
import { fogCanvasScale } from '../../src/app/pixi/fog/FogCanvasCompositor';
import { DESKTOP_BUDGETS, MOBILE_BUDGETS } from '../../src/app/platform/deviceBudgets';

describe('the scale of the fog\'s canvas', () => {
  it('is the scale asked for on a desktop, whatever the map\'s size', () => {
    expect(fogCanvasScale({ width: 2400, height: 1800 }, 0.5, DESKTOP_BUDGETS.fogCanvasSide)).toBe(0.5);
    expect(fogCanvasScale({ width: 16783, height: 16783 }, 0.5, DESKTOP_BUDGETS.fogCanvasSide)).toBe(0.5);
  });

  it('is the same on a tablet while the canvas stays within its longest side', () => {
    expect(fogCanvasScale({ width: 4400, height: 3400 }, 0.5, MOBILE_BUDGETS.fogCanvasSide)).toBe(0.5);
    expect(fogCanvasScale({ width: 6144, height: 100 }, 0.5, MOBILE_BUDGETS.fogCanvasSide)).toBe(0.5);
  });

  it('is coarser on a tablet for a map whose canvas would be longer, so that the canvas has that side', () => {
    const bounds = { width: 8592, height: 4296 };
    const scale = fogCanvasScale(bounds, 0.5, MOBILE_BUDGETS.fogCanvasSide);
    expect(scale).toBeLessThan(0.5);
    expect(Math.round(bounds.width * scale)).toBe(3072);
    expect(Math.round(bounds.height * scale)).toBe(1536);
  });

  it('leaves the blurred copy of the widest edge room within the canvas every iPadOS draws on', () => {
    // The blur's reach is the edge's width at the canvas' scale, on either side (`fadeEdges`).
    const widestEdge = 300 * 0.5;
    expect(MOBILE_BUDGETS.fogCanvasSide + 2 * Math.ceil(widestEdge)).toBeLessThanOrEqual(4096);
  });
});
