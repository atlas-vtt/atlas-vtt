import type { EventEmitter } from 'events';
import type { Viewport } from 'pixi-viewport';
import { levelObjects } from '../../levels/levelObjects';
import { levelSurfaceList, MAX_LEVEL_SURFACES, MAX_SURFACE_CORNERS } from '../../levels/levelSurfaces';
import type { ViewAtlasStore } from '../../storeFactory';
import type { WallToolSubMode } from '../../tools/WallTool';
import type { LevelSurface } from '../../types/sceneLevelTypes';
import { areaHandlePoint } from '../../vision/polygonArea';
import { PolygonAreaEditor } from '../areas/PolygonAreaEditor';
import { snapToWallEnd } from '../lighting/wallEnds';
import { levelSurfaceOverlay } from './levelSurfaceOverlay';

export interface LevelSurfaceEditorDeps {
  viewport: Viewport;
  /** The map's canvas: a pointer cancelled on it, or its window losing focus, ends a drag that will get no release. */
  canvas: HTMLCanvasElement;
  store: ViewAtlasStore;
  eventBus: EventEmitter;
  /** The lighting tool entered or left its openings mode: whoever owns the layer's visibility shows or hides it. */
  onActiveChange: () => void;
  /** An opening was begun on a level that holds `MAX_LEVEL_SURFACES`: none is begun, and the GM is told. */
  onFull: () => void;
}

/**
 * The lighting tool's openings mode (`PolygonAreaEditor`): openings to the level below and floors
 * over them, drawn corner by corner on the level shown. Corners snap to wall ends close by (Alt
 * places freely), so an opening drawn along walls ends on them; a new area is an opening and opens
 * its popover, where it can become floor. It takes input only in this mode and while its layer
 * shows; the popover is open only then too.
 */
export class LevelSurfaceEditor extends PolygonAreaEditor<LevelSurface> {
  private readonly onSubMode = (mode: WallToolSubMode): void => {
    if (this.setActive(mode === 'level-surface')) this.surfaceDeps.onActiveChange();
  };

  constructor(private readonly surfaceDeps: LevelSurfaceEditorDeps) {
    const { viewport, canvas, store } = surfaceDeps;
    const surfaces = (): LevelSurface[] => levelSurfaceList(levelObjects(store.getState()).levelSurfaces);
    super({
      viewport,
      canvas,
      store,
      overlay: levelSurfaceOverlay(viewport),
      handleOf: (surface) => areaHandlePoint(surface.polygon),
      areas: {
        list: (state) => levelSurfaceList(levelObjects(state).levelSurfaces),
        selected: (state) => state.levelSurfacePopover,
        changed: (state, previous) => levelObjects(state).levelSurfaces !== levelObjects(previous).levelSurfaces,
        select: (id) => (id ? store.getState().openLevelSurfacePopover(id) : store.getState().closeLevelSurfacePopover()),
        create: (polygon) => {
          const state = store.getState();
          state.openLevelSurfacePopover(state.addLevelSurface({ polygon, open: true }));
        },
        reshape: (id, polygon) => store.getState().updateLevelSurface(id, { polygon }),
        remove: (id) => store.getState().deleteLevelSurface(id),
        mayBegin: () => {
          if (surfaces().length < MAX_LEVEL_SURFACES) return true;
          surfaceDeps.onFull();
          return false;
        },
        maxCorners: MAX_SURFACE_CORNERS,
        snap: (point, { altKey }) => (altKey ? point : snapToWallEnd(point, levelObjects(store.getState()).walls, viewport.scale.x)),
      },
    });
    surfaceDeps.eventBus.on('wall-submode-changed', this.onSubMode);
  }

  override destroy(): void {
    this.surfaceDeps.eventBus.off('wall-submode-changed', this.onSubMode);
    super.destroy();
  }
}
