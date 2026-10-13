import type { ViewAtlasStore } from '../storeFactory';
import type { WidgetRecord } from '../utils/collectionWidgets';
import { pausedTimers, timerAt } from '../utils/timerWidget';

/** What `TimerSessions` needs of the widget sync. */
export interface TimerSessionHost {
  readonly stores: ReadonlyMap<string, ViewAtlasStore>;
  collectionFor(mapPath: string): string | null;
  library(collectionId: string): WidgetRecord;
  setLibrary(collectionId: string, widgets: WidgetRecord): void;
  /** Changes a collection's library and shows it in the open scenes of the collection. */
  editLibrary(collectionId: string, edit: (widgets: WidgetRecord) => WidgetRecord): void;
  /** Writes a view's widgets without mirroring them to other views or making an undo step. */
  writeWidgets(store: ViewAtlasStore, widgets: WidgetRecord): void;
}

/** The collection a view left as it began to load another scene, and when. */
export interface LeftCollection {
  collectionId: string;
  at: number;
}

/**
 * A timer runs only while a view shows it, so it never burns down between
 * sessions: a scene stops its timers as it closes, at the time they have left,
 * and loads with them paused. Timers another open view shows run on there, and a
 * collection's timers run on while a view moves to another scene of the collection.
 */
export class TimerSessions {
  /** Views that are closing: they still sync, but no longer keep a timer running for others. */
  private readonly closing = new Set<string>();
  /** The collection each loading view left, until its next scene has loaded. */
  private readonly leaving = new Map<string, LeftCollection>();

  constructor(private readonly host: TimerSessionHost) {}

  /**
   * Stops the scene's own timers only this view shows before the view leaves its
   * scene. The collection's timers wait for the next scene (`collectionLoaded`).
   */
  leaveScene(viewId: string): void {
    const store = this.host.stores.get(viewId);
    if (!store || !showsScene(store)) return;
    const now = Date.now();
    const { mapPath, widgetSettings, setTimerState } = store.getState();
    if (!this.otherViewShowing(viewId, (path) => path === mapPath)) {
      for (const widget of Object.values(widgetSettings.widgets)) {
        if (widget.type === 'timer' && widget.scope !== 'collection' && widget.running) setTimerState(widget.id, timerAt(widget, now));
      }
    }
    const collectionId = mapPath ? this.host.collectionFor(mapPath) : null;
    if (collectionId) this.leaving.set(viewId, { collectionId, at: now });
  }

  /** Stops what only this view shows as it closes; until it is forgotten it keeps no timer running. */
  closeView(viewId: string): void {
    if (!this.host.stores.has(viewId)) return;
    this.leaveScene(viewId);
    this.closing.add(viewId);
    const left = this.takeLeft(viewId);
    if (left) this.stopCollection(viewId, left);
  }

  forget(viewId: string): void {
    this.closing.delete(viewId);
    this.leaving.delete(viewId);
  }

  /**
   * A scene loads with its timers paused (`pausedTimers` on reading the file);
   * where another open view shows the same scene, they take the time they run on
   * there. Returns the collection the view left, for `collectionLoaded`.
   */
  sceneLoaded(viewId: string, store: ViewAtlasStore): LeftCollection | undefined {
    const left = this.takeLeft(viewId);
    const { mapPath, widgetSettings } = store.getState();
    const other = mapPath ? this.otherViewShowing(viewId, (path) => path === mapPath) : undefined;
    if (!other) return left;
    const live = other.getState().widgetSettings.widgets;
    let widgets: WidgetRecord | undefined;
    for (const widget of Object.values(widgetSettings.widgets)) {
      const shown = live[widget.id];
      if (widget.type !== 'timer' || widget.scope === 'collection' || shown?.type !== 'timer' || !shown.running) continue;
      widgets ??= { ...widgetSettings.widgets };
      widgets[widget.id] = { ...widget, value: shown.value, running: shown.running };
    }
    if (widgets) this.host.writeWidgets(store, widgets);
    return left;
  }

  /**
   * Once the library is readable after a load: the collection the view left
   * stops its timers at the moment it left, unless the new scene belongs to it or
   * another view shows it, and a library no view showed is read with its timers paused.
   */
  collectionLoaded(viewId: string, store: ViewAtlasStore, left: LeftCollection | undefined): void {
    const { mapPath } = store.getState();
    const collectionId = showsScene(store) && mapPath ? this.host.collectionFor(mapPath) : null;
    if (left && left.collectionId !== collectionId) this.stopCollection(viewId, left);
    if (!collectionId || left?.collectionId === collectionId || this.otherViewHolds(viewId, collectionId)) return;
    this.host.setLibrary(collectionId, pausedTimers(this.host.library(collectionId)));
  }

  private takeLeft(viewId: string): LeftCollection | undefined {
    const left = this.leaving.get(viewId);
    this.leaving.delete(viewId);
    return left;
  }

  /** Pauses the collection's timers at the moment the view left, unless another view holds the collection. */
  private stopCollection(viewId: string, { collectionId, at }: LeftCollection): void {
    if (this.otherViewHolds(viewId, collectionId)) return;
    this.host.editLibrary(collectionId, (widgets) => pausedTimers(widgets, at));
  }

  /** True when another view that stays open shows the collection, or is loading a scene after one of it. */
  private otherViewHolds(viewId: string, collectionId: string): boolean {
    if (this.otherViewShowing(viewId, (path) => this.host.collectionFor(path) === collectionId)) return true;
    for (const [otherId, left] of this.leaving) {
      if (otherId !== viewId && !this.closing.has(otherId) && left.collectionId === collectionId) return true;
    }
    return false;
  }

  /** The first view besides `viewId` that stays open and shows a scene whose path matches. */
  private otherViewShowing(viewId: string, matches: (mapPath: string) => boolean): ViewAtlasStore | undefined {
    for (const [otherId, other] of this.host.stores) {
      if (otherId === viewId || this.closing.has(otherId) || !showsScene(other)) continue;
      const { mapPath } = other.getState();
      if (mapPath && matches(mapPath)) return other;
    }
    return undefined;
  }
}

/** True while the store shows its scene: loaded and not loading. */
function showsScene(store: ViewAtlasStore): boolean {
  const { mapLoaded, isMapLoading, mapPath } = store.getState();
  return mapLoaded && !isMapLoading && mapPath !== null;
}
