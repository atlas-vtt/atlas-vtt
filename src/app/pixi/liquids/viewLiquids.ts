import type { Application } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { DEFAULT_LIGHTING_QUALITY, type LightingQualitySource } from '../../lighting/lightingQuality';
import { requestRender } from '../RenderScheduler';
import { LiquidLayer, type LiquidLayerDeps } from './LiquidLayer';
import type { WorldBox } from './LiquidMesh';
import type { LiquidDetail } from './liquidShader';

/** The view rect, in world units. */
interface WorldRect { left: number; top: number; right: number; bottom: number }

/** What the player window shows of a view it shows live: the world it frames and its screen points to a world pixel. */
export interface PlayersView {
  view: WorldRect;
  scale: number;
}

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

/** Whether anything of `box` is seen: in the GM's `view` (grown, `boxInView`), or in what the player window frames. */
export function liquidSeen(view: WorldRect, players: PlayersView | null, box: WorldBox): boolean {
  return boxInView(view, box) || (players !== null && boxInView(players.view, box, 0));
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
 * Frames a second liquids move at for whoever sees them closest: the GM at `scale` points to a
 * world pixel, or the player window (`players`) where it shows the cells larger. Asked on every
 * tick, so the players' frame is worked out only where the GM's zoom slows the liquids.
 */
export function seenLiquidFps(qualityFps: number, cell: number, scale: number, players: () => PlayersView | null): number {
  const own = liquidFps(qualityFps, cell * scale);
  if (own >= qualityFps) return own;
  const shown = players();
  return shown ? Math.max(own, liquidFps(qualityFps, cell * shown.scale)) : own;
}

/**
 * How much of their material liquids draw at a quality (`LiquidDetail`), told by the frames a second
 * it gives them (`LightingQuality.liquidFps`: 30 / 15 / 10 at high / balanced / saver), never by zoom.
 */
export function liquidDetail(qualityFps: number): LiquidDetail {
  return qualityFps >= 30 ? 2 : qualityFps >= 15 ? 1 : 0;
}

/**
 * The liquid surfaces of a view's scene, moving on its stage, as often as `quality` lets them,
 * while the view or the player window it shows live (`players`) sees them: players framed
 * elsewhere, or closer than the GM's zoom, see them move as the GM's view would there.
 */
export function createViewLiquids(app: Application, viewport: Viewport, store: LiquidLayerDeps['store'], quality?: LightingQualitySource, players: () => PlayersView | null = () => null): LiquidLayer {
  const qualityFps = (): number => (quality?.current() ?? DEFAULT_LIGHTING_QUALITY).liquidFps;
  // Working the players' frame out reads the window and the TV's settings: once a tick, for every surface
  let shown: { at: number; view: PlayersView | null } | null = null;
  const playersNow = (): PlayersView | null => {
    if (shown?.at !== app.ticker.lastTime) shown = { at: app.ticker.lastTime, view: players() };
    return shown.view;
  };
  return new LiquidLayer({
    store,
    ticker: app.ticker,
    requestRender: () => requestRender(app),
    inView: (box) => liquidSeen(viewport.getVisibleBounds(), playersNow(), box),
    fps: () => seenLiquidFps(qualityFps(), store.getState().grid?.size ?? 0, viewport.scale.x, playersNow),
    detail: () => liquidDetail(qualityFps()),
    drawable: app.renderer.name === 'webgl',
  });
}
