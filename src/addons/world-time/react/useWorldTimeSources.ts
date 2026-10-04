import { useEffect, useState, useSyncExternalStore } from 'react';
import type { App } from 'obsidian';
import { SettingsService } from 'src/app/services/SettingsService';
import type { CalendarDefinition } from '../calendar/calendarDefinition';
import { CalendarService } from '../calendar/CalendarService';
import { WorldNoteIndex } from '../notes/WorldNoteIndex';
import { worldSettingsOf, type WorldSettings } from '../worldSettings';

export interface WorldTimeSources {
  calendar: CalendarDefinition;
  notes: WorldNoteIndex;
  /** Changes whenever a note's world data changes, for memoised derivations. */
  notesRevision: number;
  settings: WorldSettings;
}

/** The app-wide world-time services, re-rendering the caller whenever one of them changes. */
export function useWorldTimeSources(app: App): WorldTimeSources {
  const calendars = CalendarService.forApp(app);
  const notes = WorldNoteIndex.forApp(app);
  useSyncExternalStore(calendars.subscribe, calendars.getRevision);
  const notesRevision = useSyncExternalStore(notes.subscribe, notes.getRevision);
  const settings = useWorldSettings(app);
  return { calendar: calendars.calendar(), notes, notesRevision, settings };
}

/** The world-time settings, re-rendering the caller when they change. */
export function useWorldSettings(app: App): WorldSettings {
  const settingsService = SettingsService.forApp(app);
  const [settings, setSettings] = useState<WorldSettings>(() => worldSettingsOf(settingsService));
  useEffect(() => {
    if (!settingsService) return undefined;
    return settingsService.onChange(() => setSettings(worldSettingsOf(settingsService)));
  }, [settingsService]);
  return settings;
}
