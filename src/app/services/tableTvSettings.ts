import { isRecord } from '../utils/guards';

/** How far the TV lies turned, clockwise, as the players see it. */
export type TvRotation = 0 | 90 | 180 | 270;
export const TV_ROTATIONS: readonly TvRotation[] = [0, 90, 180, 270];

/** Where the widgets sit on the player view, as the players see it. */
export const PLAYER_WIDGET_POSITIONS = ['top-left', 'top', 'top-right', 'bottom-left', 'bottom', 'bottom-right'] as const;
export type PlayerWidgetPosition = typeof PLAYER_WIDGET_POSITIONS[number];
export const MIN_WIDGET_SCALE = 0.5;
export const MAX_WIDGET_SCALE = 2.5;

/** The player view on a TV lying on the table (Atlas' settings, TrueScale). */
export interface TableTvSettings {
  rotation: TvRotation;
  /** Lock the player zoom so one grid cell measures `cellMm` on the glass. */
  trueScale: boolean;
  /** The TV's visible picture, corner to corner, in inches. */
  diagonalIn: number;
  /** `auto` or `WIDTHxHEIGHT` of the signal sent to the TV. */
  resolution: string;
  cellMm: number;
  /** Calibration factor in percent, found by measuring cells on the TV. */
  trim: number;
  /** Draws a 10-cell ruler on the player view to measure. */
  showCalibration: boolean;
  widgetPosition: PlayerWidgetPosition;
  widgetScale: number;
}

/** What players saw before these settings existed: an unturned window, no true scale, widgets top right at their size. */
export const DEFAULT_TABLE_TV_SETTINGS: TableTvSettings = {
  rotation: 0,
  trueScale: false,
  diagonalIn: 55,
  resolution: 'auto',
  cellMm: 27,
  trim: 100,
  showCalibration: false,
  widgetPosition: 'top-right',
  widgetScale: 1,
};

const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

/** The settings as stored; a value Atlas cannot use reads as the default's, and fields of a newer Atlas are kept. */
export function readTableTvSettings(stored: unknown): TableTvSettings {
  if (!isRecord(stored)) return DEFAULT_TABLE_TV_SETTINGS;
  const d = DEFAULT_TABLE_TV_SETTINGS;
  const { widgetScale } = stored;
  return {
    ...stored,
    rotation: TV_ROTATIONS.find((rotation) => rotation === stored.rotation) ?? d.rotation,
    trueScale: typeof stored.trueScale === 'boolean' ? stored.trueScale : d.trueScale,
    diagonalIn: positive(stored.diagonalIn) ? stored.diagonalIn : d.diagonalIn,
    resolution: typeof stored.resolution === 'string' ? stored.resolution : d.resolution,
    cellMm: positive(stored.cellMm) ? stored.cellMm : d.cellMm,
    trim: positive(stored.trim) ? stored.trim : d.trim,
    showCalibration: typeof stored.showCalibration === 'boolean' ? stored.showCalibration : d.showCalibration,
    widgetPosition: PLAYER_WIDGET_POSITIONS.find((position) => position === stored.widgetPosition) ?? d.widgetPosition,
    widgetScale: positive(widgetScale) && widgetScale >= MIN_WIDGET_SCALE && widgetScale <= MAX_WIDGET_SCALE ? widgetScale : d.widgetScale,
  };
}
