import { normalizePath, TAbstractFile, type App, type EventRef } from 'obsidian';
import { SettingsService } from 'src/app/services/SettingsService';
import { worldSettingsOf, type WorldSettings } from '../worldSettings';
import { pickCalendar, readCalendarFile, withYearLabels, type CalendarDefinition, type CalendarFile } from './calendarDefinition';

/**
 * The vault's calendar file (`world.calendarPath` in the settings), read once
 * and again whenever the file or the calendar settings change. Without a
 * readable file the built-in Arcivalian calendar (12 × 30 + 5 days) is used.
 * One per app, shared by every view.
 */
export class CalendarService {
  private static readonly instances = new WeakMap<App, CalendarService>();

  static forApp(app: App): CalendarService {
    let service = CalendarService.instances.get(app);
    if (!service) {
      service = new CalendarService(app);
      CalendarService.instances.set(app, service);
    }
    return service;
  }

  static release(app: App): void {
    CalendarService.instances.get(app)?.destroy();
    CalendarService.instances.delete(app);
  }

  private file: CalendarFile = readCalendarFile(null);
  private current: CalendarDefinition = pickCalendar(this.file);
  private loadedPath = '';
  private loadedId = '';
  private loadedLabels = '';
  private problem: string | null = null;
  private revision = 0;
  private readonly listeners = new Set<() => void>();
  private readonly eventRefs: EventRef[] = [];
  private unsubscribeSettings: (() => void) | null = null;

  private constructor(private readonly app: App) {
    const onFile = (file: TAbstractFile): void => {
      if (file.path === this.loadedPath) void this.load();
    };
    this.eventRefs.push(app.vault.on('modify', onFile), app.vault.on('create', onFile), app.vault.on('delete', onFile));
    this.eventRefs.push(app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
      if (file.path === this.loadedPath || oldPath === this.loadedPath) void this.load();
    }));
    this.unsubscribeSettings = SettingsService.forApp(app)?.onChange(() => {
      const settings = this.settings();
      if (normalizePath(settings.calendarPath) !== this.loadedPath || settings.calendarId !== this.loadedId) void this.load();
      else if (labelsKey(settings) !== this.loadedLabels) this.pick();
    }) ?? null;
    void this.load();
  }

  /** The calendar dates are read and shown in. */
  calendar(): CalendarDefinition {
    return this.current;
  }

  calendars(): CalendarDefinition[] {
    return this.file.calendars;
  }

  /** Why the calendar file could not be used, or null. */
  loadProblem(): string | null {
    return this.problem;
  }

  readonly getRevision = (): number => this.revision;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  destroy(): void {
    for (const ref of this.eventRefs) this.app.vault.offref(ref);
    this.eventRefs.length = 0;
    this.unsubscribeSettings?.();
    this.unsubscribeSettings = null;
    this.listeners.clear();
  }

  private settings(): WorldSettings {
    return worldSettingsOf(SettingsService.forApp(this.app));
  }

  private async load(): Promise<void> {
    const settings = this.settings();
    const path = normalizePath(settings.calendarPath);
    this.loadedPath = path;
    this.loadedId = settings.calendarId;
    let parsed: unknown = null;
    this.problem = null;
    try {
      if (await this.app.vault.adapter.exists(path)) {
        parsed = JSON.parse(await this.app.vault.adapter.read(path));
      } else {
        this.problem = `No calendar file at ${path}; using the built-in Arcivalian calendar.`;
      }
    } catch (error) {
      this.problem = `The calendar file ${path} could not be read: ${error instanceof Error ? error.message : String(error)}`;
      console.warn('[Atlas world]', this.problem);
    }
    // A later load may have started while this one read the disk.
    if (this.loadedPath !== path) return;
    this.file = readCalendarFile(parsed);
    this.pick();
  }

  /** Takes the chosen calendar from the loaded file, with the year labels from the settings. */
  private pick(): void {
    const settings = this.settings();
    this.loadedLabels = labelsKey(settings);
    this.current = withYearLabels(pickCalendar(this.file, settings.calendarId || undefined), settings);
    this.revision++;
    for (const listener of this.listeners) listener();
  }
}

function labelsKey(settings: WorldSettings): string {
  return `${settings.yearLabel}
${settings.yearLabelBefore}`;
}
