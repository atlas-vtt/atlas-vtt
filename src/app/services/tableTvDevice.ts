import type { App } from 'obsidian';
import { isRecord } from '../utils/guards';
import { TV_ROTATIONS, type TvRotation } from './tableTvSettings';

/**
 * TrueScale's facts about the TVs this device shows the player view on, kept in the vault's local
 * storage (`deviceSettings.ts`): the size of a millimetre of glass belongs to one TV on one computer.
 */
export const TABLE_TV_STORAGE_KEY = 'atlas-vtt:table-tv';

/** The grid cells Atlas offers, in mm of glass: an inch, the 25 mm of most bases, and 30 mm. */
export const CELL_MM_CHOICES = [25.4, 25, 30] as const;

/** A screen fitted to a bank card: what the players' frame reads. */
export interface TvScreenSetup {
  /** Device pixels per millimetre of glass on this screen. */
  pxPerMm: number;
  rotation: TvRotation;
}

/**
 * A screen as stored. Its rotation is kept as soon as the GM picks one, the first step of the
 * set-up; `pxPerMm` only once a card fit was committed. A screen without it is not set up yet:
 * read it with `setupOf`.
 */
export type TvScreenRecord = Omit<TvScreenSetup, 'pxPerMm'> & { pxPerMm?: number };

export interface TableTvDevice {
  /** Lock the player zoom so a grid cell measures `cellMm` on the glass. */
  trueScale: boolean;
  /** What a grid cell measures on the glass, in mm: one of `CELL_MM_CHOICES`, though any positive value stored is kept. */
  cellMm: number;
  /** By `screenKey` of the player window's screen. */
  screens: Record<string, TvScreenRecord>;
}

export const DEFAULT_TABLE_TV_DEVICE: TableTvDevice = { trueScale: false, cellMm: 25.4, screens: {} };

type DeviceStorage = Pick<App, 'loadLocalStorage' | 'saveLocalStorage'>;

/** A screen by its size in device pixels, which is what tells TVs apart: Chromium reports no more of them. */
export function screenKey(width: number, height: number): string {
  return `${Math.round(width)}x${Math.round(height)}`;
}

/** The setup of the screen `key`, or null while it has none: never fitted, or only turned so far. */
export function setupOf(device: TableTvDevice, key: string): TvScreenSetup | null {
  const screen = device.screens[key];
  return screen && positive(screen.pxPerMm) ? { ...screen, pxPerMm: screen.pxPerMm } : null;
}

/** The device's facts as stored; a value Atlas cannot use reads as the default's, and fields of a newer Atlas are kept. */
export function readTableTvDevice(stored: unknown): TableTvDevice {
  if (!isRecord(stored)) return { ...DEFAULT_TABLE_TV_DEVICE, screens: {} };
  const screens: Record<string, TvScreenRecord> = {};
  if (isRecord(stored.screens)) {
    for (const [key, screen] of Object.entries(stored.screens)) {
      const read = readScreen(screen);
      if (read) screens[key] = read;
    }
  }
  const d = DEFAULT_TABLE_TV_DEVICE;
  return {
    ...stored,
    trueScale: typeof stored.trueScale === 'boolean' ? stored.trueScale : d.trueScale,
    cellMm: positive(stored.cellMm) ? stored.cellMm : d.cellMm,
    screens,
  };
}

function readScreen(stored: unknown): TvScreenRecord | null {
  if (!isRecord(stored)) return null;
  const screen: TvScreenRecord = { ...stored, rotation: TV_ROTATIONS.find((turn) => turn === stored.rotation) ?? 0 };
  if (positive(stored.pxPerMm)) screen.pxPerMm = stored.pxPerMm;
  else delete screen.pxPerMm;
  return screen;
}

export function loadTableTvDevice(storage: DeviceStorage): TableTvDevice {
  try {
    const stored: unknown = storage.loadLocalStorage(TABLE_TV_STORAGE_KEY);
    return readTableTvDevice(typeof stored === 'string' ? JSON.parse(stored) : stored);
  } catch (error) {
    console.error('[Atlas] Could not read the table TVs of this device', error);
    return readTableTvDevice(null);
  }
}

export function saveTableTvDevice(storage: DeviceStorage, device: TableTvDevice): void {
  try {
    // As JSON: a string that is never empty, so Obsidian keeps it
    storage.saveLocalStorage(TABLE_TV_STORAGE_KEY, JSON.stringify(device));
  } catch (error) {
    console.error('[Atlas] Could not save the table TVs of this device', error);
  }
}

function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
