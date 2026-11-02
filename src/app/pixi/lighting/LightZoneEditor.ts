import type { EventEmitter } from 'events';
import type { Viewport } from 'pixi-viewport';
import { MAX_LIGHT_ZONES, MAX_ZONE_CORNERS, lightZoneList } from '../../lighting/lightZones';
import { levelObjects } from '../../levels/levelObjects';
import type { ViewAtlasStore } from '../../storeFactory';
import type { WallToolSubMode } from '../../tools/WallTool';
import type { LightZone } from '../../types/lightingTypes';
import { areaHandlePoint } from '../../vision/polygonArea';
import { PolygonAreaEditor } from '../areas/PolygonAreaEditor';
import { lightZoneOverlay } from './LightZoneOverlay';
import { snapToWallEnd } from './wallEnds';

export interface LightZoneEditorDeps {
  viewport: Viewport;
  /** The map's canvas: a pointer cancelled on it, or its window losing focus, ends a drag that will get no release. */
  canvas: HTMLCanvasElement;
  store: ViewAtlasStore;
  eventBus: EventEmitter;
  /** The lighting tool entered or left its zone mode: whoever owns the layer's visibility shows or hides it. */
  onActiveChange: () => void;
  /** A zone was begun on a map that holds `MAX_LIGHT_ZONES`: none is begun, and the GM is told. */
  onFull: () => void;
}

/**
 * The lighting tool's zone mode (`PolygonAreaEditor`): light zones drawn corner by corner. Corners
 * snap to wall ends close by (Alt places freely), so a zone drawn along walls ends on them; a new
 * zone starts with the scene's ambient light and opens its popover. It takes input only in zone
 * mode and while its layer shows; the popover is open only then too.
 */
export class LightZoneEditor extends PolygonAreaEditor<LightZone> {
  private readonly onSubMode = (mode: WallToolSubMode): void => {
    if (this.setActive(mode === 'light-zone')) this.zoneDeps.onActiveChange();
  };

  constructor(private readonly zoneDeps: LightZoneEditorDeps) {
    const { viewport, canvas, store } = zoneDeps;
    const zones = (): LightZone[] => lightZoneList(levelObjects(store.getState()).lightZones);
    super({
      viewport,
      canvas,
      store,
      overlay: lightZoneOverlay(viewport),
      handleOf: (zone) => areaHandlePoint(zone.polygon),
      areas: {
        list: (state) => lightZoneList(levelObjects(state).lightZones),
        selected: (state) => state.lightZonePopover,
        changed: (state, previous) => levelObjects(state).lightZones !== levelObjects(previous).lightZones,
        select: (id) => (id ? store.getState().openLightZonePopover(id) : store.getState().closeLightZonePopover()),
        // The scene's own level, and its tint: closing a zone changes nothing on the map, and records nothing, until the GM sets its light.
        create: (polygon) => {
          const state = store.getState();
          state.openLightZonePopover(state.addLightZone({ polygon, ambient: Math.min(1, Math.max(0, state.lighting.ambient)) }));
        },
        reshape: (id, polygon) => store.getState().updateLightZone(id, { polygon }),
        remove: (id) => store.getState().deleteLightZone(id),
        mayBegin: () => {
          if (zones().length < MAX_LIGHT_ZONES) return true;
          zoneDeps.onFull();
          return false;
        },
        // The engine reads a zone's outline from a list of this length: the last corner closes it.
        maxCorners: MAX_ZONE_CORNERS,
        snap: (point, { altKey }) => (altKey ? point : snapToWallEnd(point, levelObjects(store.getState()).walls, viewport.scale.x)),
      },
    });
    zoneDeps.eventBus.on('wall-submode-changed', this.onSubMode);
  }

  override destroy(): void {
    this.zoneDeps.eventBus.off('wall-submode-changed', this.onSubMode);
    super.destroy();
  }
}
