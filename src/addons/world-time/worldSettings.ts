import { isRecord } from 'src/app/services/assetMetadataGuards';
import type { SettingsService } from 'src/app/services/SettingsService';
import { normalizeWorldDate } from './calendar/worldDate';

/** How much of the date bar a scene shows. */
export type DateBarMode = 'always' | 'dated-scenes';

/** The edge of the map the date bar sits on. */
export type DateBarPosition = 'top' | 'bottom' | 'left' | 'right';

export const DATE_BAR_POSITIONS: ReadonlyArray<{ position: DateBarPosition; label: string }> = [
  { position: 'top', label: 'Top' },
  { position: 'bottom', label: 'Bottom' },
  { position: 'left', label: 'Left' },
  { position: 'right', label: 'Right' },
];

/** World-time settings, stored in Atlas' settings file under `world`. */
export interface WorldSettings {
  /** Vault path of the calendar file. */
  calendarPath: string;
  /** Calendar used to read and show dates; empty = the file's `default`. */
  calendarId: string;
  /** Viewing date of scenes that set none; empty = such scenes are not filtered. */
  defaultViewingDate: string;
  /** Show objects outside the viewing date faintly to the GM instead of hiding them. */
  showGhosted: boolean;
  /** Events stay on the map as rumours for this many years after they ended (0 = off). */
  rumourYears: number;
  /** Folder the "Log event" command writes new event notes to. */
  eventsFolder: string;
  dateBar: DateBarMode;
  /** Whether the date bar shows at all (also switched from the map's More options menu). */
  showDateBar: boolean;
  dateBarPosition: DateBarPosition;
  /** Shown after a year, e.g. "eO" or "AD"; empty = the calendar file's own label. */
  yearLabel: string;
  /** Shown after a year before year 0, e.g. "fO" or "BC"; empty = the calendar file's own label. */
  yearLabelBefore: string;
}

export const DEFAULT_WORLD_SETTINGS: WorldSettings = {
  calendarPath: 'atlas-vtt/world/calendar.json',
  calendarId: '',
  defaultViewingDate: '',
  showGhosted: false,
  rumourYears: 1,
  eventsFolder: 'World/Events',
  dateBar: 'always',
  showDateBar: true,
  dateBarPosition: 'bottom',
  yearLabel: '',
  yearLabelBefore: '',
};

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

/** Trust boundary for the stored settings; unknown or broken fields take their defaults. */
export function readWorldSettings(value: unknown): WorldSettings {
  if (!isRecord(value)) return { ...DEFAULT_WORLD_SETTINGS };
  const defaults = DEFAULT_WORLD_SETTINGS;
  const rumourYears = typeof value.rumourYears === 'number' && Number.isFinite(value.rumourYears) && value.rumourYears >= 0
    ? value.rumourYears
    : defaults.rumourYears;
  return {
    calendarPath: text(value.calendarPath, defaults.calendarPath) || defaults.calendarPath,
    calendarId: text(value.calendarId, defaults.calendarId),
    defaultViewingDate: normalizeWorldDate(value.defaultViewingDate) ?? '',
    showGhosted: typeof value.showGhosted === 'boolean' ? value.showGhosted : defaults.showGhosted,
    rumourYears,
    eventsFolder: text(value.eventsFolder, defaults.eventsFolder),
    dateBar: value.dateBar === 'dated-scenes' ? 'dated-scenes' : 'always',
    showDateBar: typeof value.showDateBar === 'boolean' ? value.showDateBar : defaults.showDateBar,
    dateBarPosition: DATE_BAR_POSITIONS.some(({ position }) => position === value.dateBarPosition)
      ? value.dateBarPosition as DateBarPosition
      : defaults.dateBarPosition,
    yearLabel: text(value.yearLabel, defaults.yearLabel),
    yearLabelBefore: text(value.yearLabelBefore, defaults.yearLabelBefore),
  };
}

/** Key of the world-time settings in Atlas' settings file. */
const WORLD_SETTINGS_KEY = 'world';

/** The stored world-time settings, checked; defaults without a settings service. */
export function worldSettingsOf(service: SettingsService | null | undefined): WorldSettings {
  return service ? readWorldSettings(service.getAddonSettings(WORLD_SETTINGS_KEY)) : { ...DEFAULT_WORLD_SETTINGS };
}

export function updateWorldSettings(service: SettingsService, changes: Partial<WorldSettings>): void {
  service.setAddonSettings(WORLD_SETTINGS_KEY, readWorldSettings({ ...worldSettingsOf(service), ...changes }));
}
