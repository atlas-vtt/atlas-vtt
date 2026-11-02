import type { PlayerCameraState } from '../types/playerCamera';
import type { PlayerFrame, Screen, Size } from '../types/playerFrame';
import { playerFrame, viewOf } from './playerFrame';
import type { TableTvSettings, TvRotation } from './tableTvSettings';
import { screenKey, setupOf, type TableTvDevice, type TvScreenSetup } from './tableTvDevice';
import { CARD_MM } from './tableTv';
import { t } from '../i18n';

/**
 * The player window as a table TV: turned by its screen's rotation, and with true scale a grid
 * cell measures `cellMm` on its glass, by the pixels per mm the GM fitted to a bank card there. The window turns its
 * canvas (`player-window.scss`), whose box is then the window as the players see it (its sides
 * swapped when it is turned a quarter): frames are rendered for that box, so no pixel is drawn twice.
 */
export interface TableTv {
  prefs: TableTvSettings;
  trueScale: boolean;
  /** What a grid cell measures on the glass at true scale, in mm. */
  cellMm: number;
  /** The screen's fit, or null while it was never fitted. */
  setup: TvScreenSetup | null;
  /** The screen's turn: its setup's, or the one picked while it is being set up; 0 without. */
  rotation: TvRotation;
  /** Device pixels per CSS pixel of the player window. */
  devicePixelRatio: number;
  /** The player window's screen (`screenKey`), which its setup is stored by. */
  screenKey: string;
}

/** What the TV shows over the players' frame while the GM sets it up. */
export type TvSetupScreen = { kind: 'orientation' } | { kind: 'fit'; pxPerMm: number };

/** The table TV `win` is, with the GM's `prefs` and this device's TVs. */
export function tableTvOf(win: Window, prefs: TableTvSettings, device: TableTvDevice): TableTv {
  const devicePixelRatio = win.devicePixelRatio || 1;
  // A window without a screen (a test's stand-in) is a screen of its own, never set up
  const screen: { width?: number; height?: number } | undefined = win.screen;
  const key = screenKey((screen?.width ?? 0) * devicePixelRatio, (screen?.height ?? 0) * devicePixelRatio);
  return {
    prefs,
    trueScale: device.trueScale,
    cellMm: device.cellMm,
    setup: setupOf(device, key),
    rotation: device.screens[key]?.rotation ?? 0,
    devicePixelRatio,
    screenKey: key,
  };
}

/** How many device pixels a grid cell takes on the TV; null while its screen was never fitted. */
export function targetCellPx(tv: TableTv): number | null {
  return tv.setup ? tv.setup.pxPerMm * tv.cellMm : null;
}

/**
 * The players' frame of `camera` for `window` (the canvas' box, as the players see it): the
 * frame `playerFrame` gives, with true scale zoomed so a cell of `cellWorld` world pixels
 * measures `cellMm` on the glass. Without true scale, on a screen never fitted, or on a scene without
 * a grid for it (`cellWorld` undefined), the frame is `playerFrame`'s. Null where there is nothing to render.
 */
export function tableTvPlayerFrame(
  window: Screen, camera: PlayerCameraState, pane: Screen | undefined, tv: TableTv | undefined, cellWorld: number | undefined,
  pixelBudget?: number,
): PlayerFrame | null {
  const view = viewOf(camera, pane);
  const frame = view ? playerFrame(window, view, pane, pixelBudget) : null;
  const cell = tv?.trueScale ? targetCellPx(tv) : null;
  if (!frame || !tv || cell === null || !cellWorld || !(cellWorld > 0)) return frame;
  // Points (CSS pixels) per world pixel: the cell's device pixels on the glass, in CSS pixels
  return { ...frame, scale: cell / tv.devicePixelRatio / cellWorld };
}

/** The world area a frame shows. */
export function frameWorldSize(frame: PlayerFrame): Size {
  return { width: frame.width / frame.resolution / frame.scale, height: frame.height / frame.resolution / frame.scale };
}

// Fixed colours: the set-up screen is looked at on the glass, whatever the GM's theme
const SHADE = 'rgba(0, 0, 0, 0.75)';
const INK = '#ffffff';

/**
 * The set-up screen over a players' frame of `frame`'s size, in its pixels and as the players
 * see it, so the window's turn turns it too: a line at the top says what the screen is, Which way
 * is up shows an arrow pointing up, the card fit the outline of a bank card at `state.pxPerMm`
 * device pixels per mm, centred.
 */
export function drawTvSetup(
  ctx: CanvasRenderingContext2D, frame: Pick<PlayerFrame, 'width' | 'height' | 'resolution'>, state: TvSetupScreen, tv: TableTv,
): void {
  const { width: w, height: h, resolution } = frame;
  const unit = Math.min(w, h);
  ctx.save();
  ctx.fillStyle = SHADE;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const caption = (text: string, y: number, title: boolean): void => drawCaption(ctx, text, w, y, unit, resolution, title);
  caption(t('tableTv.setup.screen'), unit * 0.07, false);
  if (state.kind === 'orientation') {
    const length = unit * 0.36;
    drawUpArrow(ctx, w / 2, h / 2 - unit * 0.08, length);
    caption(t('tableTv.setup.upTitle'), h / 2 + unit * 0.2, true);
    caption(t('tableTv.setup.upHint'), h / 2 + unit * 0.28, false);
  } else {
    // Millimetres of glass in frame pixels: device pixels to points to frame pixels
    const px = (mm: number): number => (mm * state.pxPerMm / tv.devicePixelRatio) * resolution;
    const card = { width: px(CARD_MM.width), height: px(CARD_MM.height), radius: px(CARD_MM.radius) };
    const line = Math.max(2, 1.5 * resolution);
    // Stroked outside the outline, so its inner edge is the card's
    ctx.strokeStyle = INK;
    ctx.lineWidth = line;
    roundedRect(ctx, (w - card.width - line) / 2, (h - card.height - line) / 2, card.width + line, card.height + line, card.radius + line / 2);
    ctx.stroke();
    const gap = Math.max(card.height / 2, unit * 0.06) + line * 4;
    caption(t('tableTv.setup.fitTitle'), h / 2 - gap - unit * 0.04, true);
    caption(t('tableTv.setup.fitHint'), h / 2 + gap + unit * 0.04, false);
  }
  ctx.restore();
}

/** A path around the rectangle at (x, y) of `width` × `height` with corners of `radius`. */
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/** An arrow `length` long pointing up, centred on (x, y). */
function drawUpArrow(ctx: CanvasRenderingContext2D, x: number, y: number, length: number): void {
  const tip = y - length / 2;
  const base = y + length / 2;
  const neck = tip + length * 0.45;
  const head = length * 0.3;
  const shaft = length * 0.11;
  ctx.beginPath();
  ctx.moveTo(x, tip);
  ctx.lineTo(x + head, neck);
  ctx.lineTo(x + shaft, neck);
  ctx.lineTo(x + shaft, base);
  ctx.lineTo(x - shaft, base);
  ctx.lineTo(x - shaft, neck);
  ctx.lineTo(x - head, neck);
  ctx.closePath();
  ctx.fillStyle = INK;
  ctx.fill();
}

/** A centred line at height `y`, made smaller where it would not fit `width` (a TV turned a quarter is narrow). */
function drawCaption(
  ctx: CanvasRenderingContext2D, text: string, width: number, y: number, unit: number, resolution: number, title: boolean,
): void {
  const fontOf = (size: number): string => `${title ? '600 ' : ''}${size}px sans-serif`;
  const size = Math.max(14 * resolution, Math.round(unit * (title ? 0.05 : 0.032)));
  ctx.font = fontOf(size);
  const room = width * 0.92;
  const measured = ctx.measureText(text).width;
  if (measured > room) ctx.font = fontOf(size * room / measured);
  ctx.fillStyle = INK;
  ctx.fillText(text, width / 2, y);
}
