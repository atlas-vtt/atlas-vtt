import type { Application } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { DEFAULT_LIGHTING_QUALITY, type LightingQualitySource } from '../../lighting/lightingQuality';
import { requestRender } from '../RenderScheduler';
import { LiquidLayer, type LiquidLayerDeps } from './LiquidLayer';
import type { WorldBox } from './LiquidMesh';
import type { LiquidDetail } from './liquidShader';

/** The view rect, in world units. */
interface WorldRect { left: number; top: number; right: number; bottom: number }

/** Below this many screen points a cell, a surface's motion is held: its finest detail has faded and the rest barely moves. */
const STILL_BELOW_CELL_PX = 10;
/** Below this many screen points a cell, a surface moves at half its rate: its finest layers have faded out (`near`). */
const HALF_RATE_BELOW_CELL_PX = 40;

/**
 * Whether anything of `box` lies in `view` grown by `margin` of its size on every side: the
 * player window frames at least the GM's view and often a little more around it.
 */
export function boxInView(view: WorldRect, box: WorldBox, margin = 0.5): boolean {
  const growX = (view.right - view.left) * margin;
  const growY = (view.bottom - view.top) * margin;
  return box.maxX >= view.left - growX && box.minX <= view.right + growX && box.maxY >= view.top - growY && box.minY <= view.bottom + growY;
}

/**
 * Frames a second liquids move at: the quality's (`LightingQuality.liquidFps`), half of it where a
 * cell is drawn smaller than `HALF_RATE_BELOW_CELL_PX` points, none where smaller than `STILL_BELOW_CELL_PX`.
 */
export function liquidFps(qualityFps: number, cellPx: number): number {
  if (!(cellPx >= STILL_BELOW_CELL_PX)) return 0;
  return cellPx < HALF_RATE_BELOW_CELL_PX ? qualityFps / 2 : qualityFps;
}

/**
 * How much of their material liquids draw at a quality (`LiquidDetail`), told by the frames a second
 * it gives them (`LightingQuality.liquidFps`: 30 / 15 / 10 at high / balanced / saver), never by zoom.
 */
export function liquidDetail(qualityFps: number): LiquidDetail {
  return qualityFps >= 30 ? 2 : qualityFps >= 15 ? 1 : 0;
}

/** The liquid surfaces of a view's scene, moving on its stage, as often as `quality` lets them. */
export function createViewLiquids(app: Application, viewport: Viewport, store: LiquidLayerDeps['store'], quality?: LightingQualitySource): LiquidLayer {
  return new LiquidLayer({
    store,
    ticker: app.ticker,
    requestRender: () => requestRender(app),
    inView: (box) => boxInView(viewport.getVisibleBounds(), box),
    fps: () => liquidFps((quality?.current() ?? DEFAULT_LIGHTING_QUALITY).liquidFps, (store.getState().grid?.size ?? 0) * viewport.scale.x),
    detail: () => liquidDetail((quality?.current() ?? DEFAULT_LIGHTING_QUALITY).liquidFps),
    drawable: app.renderer.name === 'webgl',
  });
}
