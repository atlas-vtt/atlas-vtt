import { isRecord } from '../utils/guards';

/** How far the TV lies turned, clockwise, as the players see it. */
export type TvRotation = 0 | 90 | 180 | 270;
export const TV_ROTATIONS: readonly TvRotation[] = [0, 90, 180, 270];

export const MAX_VIEW_GLIDE_MS = 3000;

/**
 * The GM's preferences for the player view on a TV lying on the table (TrueScale), synced with
 * Atlas' settings. What belongs to one TV (true scale, its cell and turn) is the device's
 * (`tableTvDevice.ts`).
 */
export interface TableTvSettings {
  /** How long frozen players glide to a view pushed on the map they see, in ms; 0 jumps. */
  viewGlideMs: number;
}

export const DEFAULT_TABLE_TV_SETTINGS: TableTvSettings = { viewGlideMs: 800 };

/**
 * The settings as stored; a value Atlas cannot use reads as the default's, and fields of a newer
 * Atlas are kept, as are those earlier builds stored here (`rotation`, `widgetPosition`, `widgetScale`…).
 */
export function readTableTvSettings(stored: unknown): TableTvSettings {
  if (!isRecord(stored)) return DEFAULT_TABLE_TV_SETTINGS;
  const { viewGlideMs } = stored;
  return {
    ...stored,
    viewGlideMs: typeof viewGlideMs === 'number' && viewGlideMs >= 0 && viewGlideMs <= MAX_VIEW_GLIDE_MS ? viewGlideMs : DEFAULT_TABLE_TV_SETTINGS.viewGlideMs,
  };
}
