import { isRecord } from '../utils/guards';

/** How far the TV lies turned, clockwise, as the players see it. */
export type TvRotation = 0 | 90 | 180 | 270;
export const TV_ROTATIONS: readonly TvRotation[] = [0, 90, 180, 270];

/** Where the widgets sit on the player view, as the players see it. */
export const PLAYER_WIDGET_POSITIONS = ['top-left', 'top', 'top-right', 'bottom-left', 'bottom', 'bottom-right'] as const;
export type PlayerWidgetPosition = typeof PLAYER_WIDGET_POSITIONS[number];
export const MIN_WIDGET_SCALE = 0.5;
export const MAX_WIDGET_SCALE = 2.5;
export const MAX_VIEW_GLIDE_MS = 3000;

/**
 * The GM's preferences for the player view on a TV lying on the table (TrueScale), synced with
 * Atlas' settings. What belongs to one TV (true scale, its cell and turn) is the device's
 * (`tableTvDevice.ts`).
 */
export interface TableTvSettings {
  /** How long frozen players glide to a view pushed on the map they see, in ms; 0 jumps. */
  viewGlideMs: number;
  widgetPosition: PlayerWidgetPosition;
  widgetScale: number;
}

/** What players saw before these settings existed: widgets top right at their size. */
export const DEFAULT_TABLE_TV_SETTINGS: TableTvSettings = {
  viewGlideMs: 800,
  widgetPosition: 'top-right',
  widgetScale: 1,
};

const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

/**
 * The settings as stored; a value Atlas cannot use reads as the default's, and fields of a newer
 * Atlas are kept, as are those earlier builds stored here (`rotation`, `trueScale`, `diagonalIn`…).
 */
export function readTableTvSettings(stored: unknown): TableTvSettings {
  if (!isRecord(stored)) return DEFAULT_TABLE_TV_SETTINGS;
  const d = DEFAULT_TABLE_TV_SETTINGS;
  const { widgetScale } = stored;
  return {
    ...stored,
    viewGlideMs: typeof stored.viewGlideMs === 'number' && stored.viewGlideMs >= 0 && stored.viewGlideMs <= MAX_VIEW_GLIDE_MS ? stored.viewGlideMs : d.viewGlideMs,
    widgetPosition: PLAYER_WIDGET_POSITIONS.find((position) => position === stored.widgetPosition) ?? d.widgetPosition,
    widgetScale: positive(widgetScale) && widgetScale >= MIN_WIDGET_SCALE && widgetScale <= MAX_WIDGET_SCALE ? widgetScale : d.widgetScale,
  };
}
