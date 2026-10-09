import { afterEach, describe, expect, it } from 'vitest';
import { Viewport, type ClampZoom } from 'pixi-viewport';
import type { EventSystem } from 'pixi.js';
import { fitMapRect, fitZoomRange, mapFit } from '../../src/app/pixi/fitMapRect';
import { allowZoom, MAX_ZOOM, MIN_ZOOM } from '../../src/app/pixi/zoomRange';

const viewports: Viewport[] = [];

function createViewport(width: number, height: number): Viewport {
  const viewport = new Viewport({
    screenWidth: width,
    screenHeight: height,
    noTicker: true,
    events: { domElement: createEl('canvas') } as EventSystem,
  });
  viewport.clampZoom({ minScale: MIN_ZOOM, maxScale: MAX_ZOOM });
  viewports.push(viewport);
  return viewport;
}

const minScale = (viewport: Viewport): unknown => viewport.plugins.get<ClampZoom>('clamp-zoom')?.options.minScale;

/** What the wheel can reach: a zoom far below every limit, clamped. */
function zoomOutAllTheWay(viewport: Viewport): number {
  viewport.setZoom(0.001);
  viewport.plugins.get<ClampZoom>('clamp-zoom')?.clamp();
  return viewport.scale.x;
}

afterEach(() => {
  viewports.splice(0).forEach(viewport => viewport.destroy());
});

describe('the zoom range of a map', () => {
  const huge = { x: 0, y: 0, width: 17000, height: 12746 };
  const small = { x: 0, y: 0, width: 2000, height: 1500 };

  it('fits a map larger than the least zoom allows, and lets the wheel reach that zoom', () => {
    const viewport = createViewport(1412, 1027);
    fitMapRect(viewport, huge);

    expect(viewport.scale.x).toBeLessThan(MIN_ZOOM);
    expect(viewport.scale.x * huge.width).toBeLessThanOrEqual(1412);
    expect(viewport.scale.x * huge.height).toBeLessThanOrEqual(1027);
    expect(zoomOutAllTheWay(viewport)).toBeCloseTo(mapFit(viewport, huge).scale, 10);
  });

  it('keeps the usual least zoom for a map that fits within it, also after a larger one', () => {
    const viewport = createViewport(1412, 1027);
    fitMapRect(viewport, huge);
    fitMapRect(viewport, small);

    expect(minScale(viewport)).toBe(MIN_ZOOM);
    expect(zoomOutAllTheWay(viewport)).toBe(MIN_ZOOM);
  });

  it('opens the range for a map shown through a camera of its own', () => {
    const viewport = createViewport(800, 600);
    fitZoomRange(viewport, huge);

    expect(minScale(viewport)).toBeCloseTo(mapFit(viewport, huge).scale, 10);
  });

  it('leaves the range alone for a screen without a size', () => {
    const viewport = createViewport(0, 0);
    fitZoomRange(viewport, huge);

    expect(minScale(viewport)).toBe(MIN_ZOOM);
  });

  it('widens the range to a zoom asked for, never narrows it', () => {
    const viewport = createViewport(1412, 1027);
    allowZoom(viewport, 0.05);
    allowZoom(viewport, 0.08);
    allowZoom(viewport, 8);

    expect(minScale(viewport)).toBe(0.05);
    expect(viewport.plugins.get<ClampZoom>('clamp-zoom')?.options.maxScale).toBe(8);
  });
});
