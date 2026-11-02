import type { Viewport } from 'pixi-viewport';
import type { LightZone } from '../../types/lightingTypes';
import { areaHandlePoint } from '../../vision/polygonArea';
import { AREA_HANDLE_RADIUS } from '../areas/areaGeometry';
import { PolygonAreaOverlay } from '../areas/PolygonAreaOverlay';
import { zoneLightColor } from './lightZoneGeometry';

/** Above the wall editor's lines, below the light markers (95). */
export const LIGHT_ZONES_Z_INDEX = 94;

/**
 * The light zones as the GM edits them (`PolygonAreaOverlay`), each zone's handle a disc in the
 * zone's own light. A GM overlay (`GmOverlays`), shown only in the lighting tool's zone mode.
 */
export function lightZoneOverlay(viewport: Viewport): PolygonAreaOverlay<LightZone> {
  return new PolygonAreaOverlay<LightZone>(viewport, {
    label: 'light-zones',
    zIndex: LIGHT_ZONES_Z_INDEX,
    restingAlpha: 0,
    handleOf: (zone) => areaHandlePoint(zone.polygon),
    decorate: (g, zone, { at, pixel, theme }) => {
      g.circle(at.x, at.y, (AREA_HANDLE_RADIUS - 4) * pixel).fill({ color: zoneLightColor(zone) }).stroke({ width: pixel, color: theme.stroke, alpha: 0.5 });
    },
  });
}
