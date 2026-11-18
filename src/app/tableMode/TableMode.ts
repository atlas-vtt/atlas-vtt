import type { App } from 'obsidian';
import type { Viewport } from 'pixi-viewport';
import { showCamera, type ViewCamera } from '../pixi/viewCamera';
import type { PlayerOverlaySources } from '../services/playerOverlaySources';
import type { SettingsService } from '../services/SettingsService';
import type { ViewAtlasState, ViewAtlasStore } from '../storeFactory';
import { blockTableKeys } from './tableKeys';
import { keepScreenAwake } from './screenWake';
import { TableSurface } from './TableSurface';
import './table-mode.scss';

/** On the view's own element while it is in Table mode: everything of the GM's in it is hidden (`table-mode.scss`). */
export const TABLE_VIEW_CLASS = 'atlas-table-mode';
/** On the window's `body` meanwhile: Obsidian's chrome and Atlas' floating UI are hidden, so the map fills the window. */
export const TABLE_BODY_CLASS = 'atlas-table-mode-on';

/** On the panes and tab groups that hold the view, up to the workspace's root: every other pane is hidden meanwhile. */
export const TABLE_PATH_CLASS = 'atlas-table-mode-path';

/** Marks the panes and tab groups `root` stands in, so the stylesheet can leave them and hide their siblings. Returns what takes the marks off. */
function markPanesOf(root: HTMLElement): () => void {
  const marked: HTMLElement[] = [];
  for (let pane = root.parentElement; pane && !pane.hasClass('mod-root'); pane = pane.parentElement) {
    if (!pane.hasClass('workspace-tabs') && !pane.hasClass('workspace-split')) continue;
    pane.addClass(TABLE_PATH_CLASS);
    marked.push(pane);
  }
  return () => marked.forEach((pane) => pane.removeClass(TABLE_PATH_CLASS));
}

/** What Table mode needs of the view it runs in. */
export interface TableModeParts {
  app: App;
  /** The view's own element, which holds the map's canvas and its UI. */
  root: HTMLElement;
  store: ViewAtlasStore;
  settings: SettingsService;
  viewport: () => Viewport | null;
  /** What the players' overlays read of the scene the view shows now; null while it draws none. */
  overlaySources: () => PlayerOverlaySources | null;
  /** Calls `left` when another Obsidian tab comes to the front; returns what stops it. */
  onLeafLeft: (left: () => void) => () => void;
}

interface Running {
  surface: TableSurface;
  /** The GM's camera when Table mode began, and the scene it looked at. */
  camera: ViewCamera | null;
  mapPath: string | null;
  stop: () => void;
}

/** Whether the store holds a scene completely, as the players may see it. */
function sceneWhole(state: ViewAtlasState): boolean {
  return state.mapLoaded && !state.isMapLoading;
}

/**
 * Follows the view's `tableMode` (`tableModeSlice.ts`): while it is set, the view is the players'
 * picture and nothing else. The store's session view draws that picture on the canvas; this hides
 * the GM's UI and Obsidian's chrome around it, shows what the player window shows over the map,
 * keeps the screen on and the keyboard off the map, and puts the GM's camera back at the end.
 */
export class TableMode {
  private running: Running | null = null;
  private readonly unsubscribe: () => void;

  constructor(private readonly parts: TableModeParts) {
    this.unsubscribe = parts.store.subscribe((state, previous) => this.follow(state, previous));
    if (parts.store.getState().tableMode) this.begin();
  }

  destroy(): void {
    this.unsubscribe();
    this.end(false);
  }

  private follow(state: ViewAtlasState, previous: ViewAtlasState): void {
    if ((state.tableMode !== null) !== (previous.tableMode !== null)) {
      if (state.tableMode) this.begin();
      else this.end(true);
      return;
    }
    const running = this.running;
    if (!running) return;
    const whole = sceneWhole(state);
    if (whole === sceneWhole(previous) && state.mapPath === previous.mapPath) return;
    running.surface.setCovered(!whole);
    // Another scene is shown by its own tokens and rolls
    if (whole) running.surface.present(this.parts.store, this.parts.overlaySources());
  }

  private begin(): void {
    if (this.running) return;
    const { app, root, store, settings } = this.parts;
    const viewport = this.parts.viewport();
    const body = root.doc.body;
    const surface = new TableSurface(root, app, settings, () => store.getState().leaveTableMode());
    surface.setCovered(!sceneWhole(store.getState()));
    surface.present(store, this.parts.overlaySources());
    root.addClass(TABLE_VIEW_CLASS);
    body.addClass(TABLE_BODY_CLASS);
    const stops = [
      markPanesOf(root),
      keepScreenAwake(root.win),
      blockTableKeys(root.win),
      // Obsidian's chrome is hidden: a tab that comes to the front must not be left without it
      this.parts.onLeafLeft(() => store.getState().leaveTableMode()),
    ];
    this.running = {
      surface,
      camera: viewport ? { centerX: viewport.center.x, centerY: viewport.center.y, scale: viewport.scale.x } : null,
      mapPath: store.getState().mapPath ?? null,
      stop: () => {
        for (const stop of stops) stop();
        root.removeClass(TABLE_VIEW_CLASS);
        body.removeClass(TABLE_BODY_CLASS);
        surface.destroy();
      },
    };
  }

  /** Ends Table mode; `restore` puts the GM's camera back where the scene is still the one it looked at. */
  private end(restore: boolean): void {
    const running = this.running;
    if (!running) return;
    this.running = null;
    running.stop();
    const viewport = this.parts.viewport();
    if (!restore || !viewport || !running.camera || running.mapPath !== (this.parts.store.getState().mapPath ?? null)) return;
    showCamera(viewport, running.camera);
    viewport.emit('zoomed', { viewport, type: 'animate' });
    viewport.emit('moved', { viewport, type: 'animate' });
  }
}
