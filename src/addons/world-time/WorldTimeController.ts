import type { App } from 'obsidian';
import type { ViewAtlasState, ViewAtlasStore } from 'src/app/storeFactory';
import { SettingsService } from 'src/app/services/SettingsService';
import { CalendarService } from './calendar/CalendarService';
import { viewingSpan } from './dating/dateRange';
import { computeTimeMask, sameTimeMask } from './dating/timeMask';
import { WorldNoteIndex } from './notes/WorldNoteIndex';
import { pickBackground, type BackgroundCandidate } from './sceneWorldTime';
import { worldSettingsOf, type WorldSettings } from './worldSettings';
import { bindWorldApp } from './worldApp';

/** Key of world time's contribution to the store's object mask. */
export const WORLD_TIME_MASK_SOURCE = 'world-time';

/** The date a scene shows: its own viewing date, else the global default; null = no filtering. */
export function effectiveViewingDate(worldTime: ViewAtlasState['worldTime'], settings: Pick<WorldSettings, 'defaultViewingDate'>): string | null {
  return worldTime.viewingDate ?? (settings.defaultViewingDate || null);
}

/**
 * Keeps a view's derived world-time state current: which objects the viewing
 * date hides or ghosts (`worldTimeMask`) and which map variant is the
 * background (`worldBackground`). Recomputes when the objects, the scene's
 * world time, the calendar, the settings or a note's dates change. Renderers
 * read only the derived state, so the player window, which mirrors the GM
 * canvas, follows the GM's date without extra wiring.
 */
export class WorldTimeController {
  private readonly unsubscribers: Array<() => void> = [];
  private readonly calendars: CalendarService;
  private readonly notes: WorldNoteIndex;
  private scheduled = false;
  /** Per-object mask states; valid while `memoKey` (date, ghosts, calendar, notes) is unchanged. */
  private memo = new WeakMap<object, 'visible' | 'ghost' | 'hidden'>();
  private memoKey = '';
  private destroyed = false;

  constructor(private readonly app: App, private readonly store: ViewAtlasStore) {
    bindWorldApp(store, app);
    this.calendars = CalendarService.forApp(app);
    this.notes = WorldNoteIndex.forApp(app);
    this.unsubscribers.push(
      store.subscribe((state) => state.objects, () => this.schedule()),
      store.subscribe((state) => state.worldTime, () => this.schedule()),
      store.subscribe((state) => state.mapPath, () => this.schedule()),
      store.subscribe((state) => state.isGMView, () => this.schedule()),
      this.calendars.subscribe(() => this.schedule()),
      this.notes.subscribe(() => this.schedule()),
    );
    const settings = SettingsService.forApp(app);
    if (settings) this.unsubscribers.push(settings.onChange(() => this.schedule()));
    this.update();
  }

  destroy(): void {
    this.destroyed = true;
    this.store.getState().setObjectMask(WORLD_TIME_MASK_SOURCE, null);
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers.length = 0;
  }

  /** Several changes in one task (a scene load) are applied together. */
  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      if (!this.destroyed) this.update();
    });
  }

  private settings(): WorldSettings {
    return worldSettingsOf(SettingsService.forApp(this.app));
  }

  private update(): void {
    const state = this.store.getState();
    const settings = this.settings();
    const calendar = this.calendars.calendar();
    const viewing = viewingSpan(calendar, effectiveViewingDate(state.worldTime, settings));

    // Ghosts are a GM aid; the player perspective never shows them.
    const showGhosted = settings.showGhosted && !state.isPlayerView && state.isGMView;
    const key = `${viewing?.start}:${viewing?.end}:${showGhosted}:${this.calendars.getRevision()}:${this.notes.getRevision()}`;
    if (key !== this.memoKey) {
      this.memoKey = key;
      this.memo = new WeakMap();
    }
    const mask = computeTimeMask({
      memo: this.memo,
      calendar,
      objects: state.objects,
      viewing,
      showGhosted,
      noteDates: (path) => this.notes.noteDates(path),
    });
    if (!sameTimeMask(mask, state.worldTimeMask)) {
      state.setWorldTimeMask(mask);
      // Core renderers read the shared object mask
      state.setObjectMask(WORLD_TIME_MASK_SOURCE, mask);
      const visibleSelection = state.selectedIds.filter((id) => !mask.hidden[id]);
      if (visibleSelection.length !== state.selectedIds.length) state.setSelection(visibleSelection);
    }

    const candidates: BackgroundCandidate[] = [...(state.worldTime.variants ?? [])];
    if (state.mapPath) {
      for (const note of this.notes.mapVariantsFor(state.mapPath)) {
        candidates.push({ background: note.map, ...(note.from ? { from: note.from } : {}), ...(note.to ? { to: note.to } : {}) });
      }
    }
    const picked = pickBackground(calendar, state.background, candidates, viewing);
    const variantBackground = picked !== state.background ? picked : null;
    if (variantBackground !== state.worldBackground) state.setWorldBackground(variantBackground);
  }
}
