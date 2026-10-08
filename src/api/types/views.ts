import type { Disposer, ViewId } from './common';
import type {
  BackgroundState, DrawingStroke, FogOperation, GridState, InitiativeState, SceneLighting,
  TextElement, TokenEntity, WidgetSettings, WidgetValues,
} from './records';

/** The visible world area of a view: its centre and size in world units. */
export interface ViewCamera {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

/** A view as `views.list()`, `views.active()` and the `map-loaded` and `map-closed` events describe it; frozen. */
export interface ViewInfo {
  viewId: ViewId;
  kind: 'map' | 'remote';
  activeTabId: string | null;
  tabs: ReadonlyArray<{ tabId: string; mapPath: string; name: string }>;
  mapPath: string | null;
  /** The store holds `mapPath`'s scene completely: `mapLoaded && !isMapLoading`. */
  loaded: boolean;
}

/**
 * The scene in a view's store, frozen to its depth: records are the store's frozen data passed by reference, or a
 * frozen copy of data the store has not frozen yet (right after a map loads).
 */
export interface SceneSnapshot {
  readonly viewId: ViewId;
  readonly mapPath: string | null;
  readonly loaded: boolean;
  /**
   * Capability `scene-tabs`: the tab whose scene this is, set once `loaded`; null while loading and in remote views.
   * Null too while the view's `activeTabId` already names the next tab but the store still holds the previous one's
   * scene, so a snapshot whose `tabId` names a tab always holds that tab's scene. A snapshot with no tab is no tab's.
   */
  readonly tabId?: string | null;
  /**
   * The loaded background's size in world pixels; 0 × 0 without one.
   * Read when the snapshot is taken: the background may finish drawing after `loaded`; take a fresh snapshot when you need the size.
   */
  readonly mapSize: { readonly width: number; readonly height: number };
  readonly background: BackgroundState;
  readonly grid: GridState | null;
  readonly objects: {
    readonly tokens: Readonly<Record<string, TokenEntity>>;
    readonly texts: Readonly<Record<string, TextElement>>;
    readonly drawings: Readonly<Record<string, DrawingStroke>>;
    readonly fog: Readonly<Record<string, FogOperation>>;
  };
  readonly widgets: { readonly settings: WidgetSettings; readonly values: WidgetValues };
  readonly initiative: InitiativeState;
  readonly initiativeTrackerOpen: boolean;
  /** The GM's lighting settings: an extension should never send them to players, only decide by them (with `lighting.playerVisibility`). */
  readonly lighting: SceneLighting;
}

export interface ViewsApi {
  /** Every open map view and remote view, in no set order; `kind` tells them apart. */
  list(): ViewInfo[];
  /** The active Atlas map view; never a remote view. */
  active(): ViewInfo | null;
  /** The scene in the view's store now; null for a view that is not open. */
  snapshot(viewId: ViewId): SceneSnapshot | null;
  /** Called after each store change that replaced one of the snapshot's fields (by reference); also when `tabId` changes. */
  subscribe(viewId: ViewId, listener: (snapshot: SceneSnapshot) => void): Disposer;
  /** The view's visible world area now, frozen; null for a view that is not open, has no viewport yet or has no size. */
  camera(viewId: ViewId): ViewCamera | null;
  /** Called after every viewport frame (pixi-viewport `frame-end`), so gestures, moves and resizes alike. */
  watchCamera(viewId: ViewId, listener: (camera: ViewCamera) => void): Disposer;
  /**
   * Capability `scene-tabs`: makes a tab of a GM map view active without presenting it.
   * Answers true once that tab's map is loaded. Answers false for a closed, unknown or remote view,
   * an unknown tab, or when another switch overtook this one; also when the view closes before the tab has loaded, or
   * the switch and load take longer than 60 s. Never throws for these.
   * The presented scene holds while the view shows another tab, as on any switch, and resumes when the GM returns to it.
   */
  showTab?(viewId: ViewId, tabId: string): Promise<boolean>;
}
