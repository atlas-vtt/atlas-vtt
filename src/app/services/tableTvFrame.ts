import type { PlayerCameraState } from '../types/playerCamera';
import type { PlayerFrame, Screen, Size } from '../types/playerFrame';
import { playerFrame, viewOf } from './playerFrame';
import type { TableTvSettings } from './tableTvSettings';
import { cellPx, parseResolution } from './tableTv';
import { t } from '../i18n';

/**
 * The player window as a table TV: turned by `rotation`, and with true scale a grid cell measures
 * `cellMm` on its glass. The window turns its canvas (`player-window.scss`), whose box is then the
 * window as the players see it (its sides swapped when it is turned a quarter): frames are
 * rendered for that box, so no pixel is drawn twice.
 */
export interface TableTv {
  settings: TableTvSettings;
  /** Device pixels per CSS pixel of the player window. */
  devicePixelRatio: number;
  /** The player window's screen in device pixels, for the resolution `auto` reads. */
  screenPixels(): { w: number; h: number };
}

/** The table TV `win` is, with `settings`. */
export function tableTvOf(win: Window, settings: TableTvSettings): TableTv {
  const devicePixelRatio = win.devicePixelRatio || 1;
  return {
    settings,
    devicePixelRatio,
    screenPixels: () => ({ w: Math.round(win.screen.width * devicePixelRatio), h: Math.round(win.screen.height * devicePixelRatio) }),
  };
}

/** How many device pixels a grid cell takes on the TV for it to measure `cellMm` on the glass. */
export function targetCellPx(tv: TableTv): number {
  const { settings } = tv;
  const resolution = parseResolution(settings.resolution, tv.screenPixels());
  return cellPx(resolution.w, resolution.h, settings.diagonalIn, settings.cellMm, settings.trim);
}

/**
 * The players' frame of `camera` for `window` (the canvas' box, as the players see it): the
 * frame `playerFrame` gives, with true scale zoomed so a cell of `cellWorld` world pixels
 * measures `cellMm` on the glass. Without true scale, or on a scene without a grid for it
 * (`cellWorld` undefined), the frame is `playerFrame`'s. Null where there is nothing to render.
 */
export function tableTvPlayerFrame(
  window: Screen, camera: PlayerCameraState, pane: Screen | undefined, tv: TableTv | undefined, cellWorld: number | undefined,
  pixelBudget?: number,
): PlayerFrame | null {
  const view = viewOf(camera, pane);
  const frame = view ? playerFrame(window, view, pane, pixelBudget) : null;
  if (!frame || !tv?.settings.trueScale || !cellWorld || !(cellWorld > 0)) return frame;
  // Points (CSS pixels) per world pixel: the cell's device pixels on the glass, in CSS pixels
  return { ...frame, scale: targetCellPx(tv) / tv.devicePixelRatio / cellWorld };
}

/** The world area a frame shows. */
export function frameWorldSize(frame: PlayerFrame): Size {
  return { width: frame.width / frame.resolution / frame.scale, height: frame.height / frame.resolution / frame.scale };
}

/** Ten cells of the true size across the middle of the frame, to measure with a ruler on the glass. */
export function drawCalibrationRuler(ctx: CanvasRenderingContext2D, frame: PlayerFrame, tv: TableTv): void {
  const { width: w, height: h } = frame;
  // The cell in the frame's pixels: device pixels to CSS pixels to frame pixels
  const cell = (targetCellPx(tv) / tv.devicePixelRatio) * frame.resolution;
  const { cellMm, trueScale } = tv.settings;
  const left = Math.round(w / 2 - cell * 5);
  const top = Math.round(h / 2 - cell / 2);
  // Fixed colours: the ruler is measured on the glass, whatever the GM's theme
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(left - cell / 2, top - cell, cell * 11, cell * 2.6);
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = i % 2 ? '#ffffff' : '#ff3b30';
    ctx.fillRect(left + i * cell, top, cell, cell);
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = `${Math.max(14, Math.round(cell * 0.35))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(t('tableTv.rulerLength', { mm: Math.round(cellMm * 100) / 10 }), w / 2, top - cell * 0.3);
  if (!trueScale) ctx.fillText(t('tableTv.rulerOff'), w / 2, top + cell * 1.4);
}
