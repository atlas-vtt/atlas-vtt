import { Container, Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { zoneHandlePoint } from '../../lighting/lightZones';
import type { LightZone } from '../../types/lightingTypes';
import type { Point } from '../../types/visionTypes';
import { destroyTree } from '../utils/destroyTree';
import { lightMarkerTheme } from './lightMarker';
import { ZONE_CORNER_RADIUS, ZONE_HANDLE_RADIUS, zoneLightColor, type ZoneCorner } from './lightZoneGeometry';

/** Above the wall editor's lines, below the light markers (95). */
export const LIGHT_ZONES_Z_INDEX = 94;
const LINE_WIDTH = 1.5;
const UNDER_WIDTH = 3.5;

/** What the overlay draws besides the zones themselves. */
export interface ZoneOverlayState {
  /** The zone whose popover is open. */
  selected: string | null;
  /** The corners placed for a zone being drawn, and where the pointer is. */
  draft: readonly Point[];
  cursor: Point | null;
  /** The corner under the pointer or being dragged. */
  corner: ZoneCorner | null;
}

/**
 * The light zones as the GM edits them: each zone's outline with a handle on every corner and
 * one in its middle that shows its light, the selected zone in the theme's accent, and the zone
 * being drawn. Lines and handles keep their size on screen. A GM overlay (`GmOverlays`).
 */
export class LightZoneOverlay {
  readonly view = new Container({ label: 'light-zones', zIndex: LIGHT_ZONES_Z_INDEX, eventMode: 'none', interactiveChildren: false });
  private readonly lines = this.view.addChild(new Graphics());
  private theme = lightMarkerTheme();

  constructor(private readonly viewport: Viewport) {
    viewport.addChild(this.view);
  }

  /** Reads the theme's colours again; they are not read on every draw, which follows the pointer. */
  retheme(): void {
    this.theme = lightMarkerTheme();
  }

  draw(zones: readonly LightZone[], { selected, draft, cursor, corner }: ZoneOverlayState): void {
    const g = this.lines.clear();
    if (!this.view.visible) return;
    const pixel = 1 / this.viewport.scale.x;
    const { theme } = this;
    const outline = (points: readonly Point[], closed: boolean, color: number): void => {
      for (const [width, lineColor, alpha] of [[UNDER_WIDTH, 0x000000, 0.45], [LINE_WIDTH, color, 1]] as const) {
        g.moveTo(points[0]!.x, points[0]!.y);
        for (const point of points.slice(1)) g.lineTo(point.x, point.y);
        if (closed) g.closePath();
        g.stroke({ width: width * pixel, color: lineColor, alpha });
      }
    };
    const dot = (at: Point, radius: number, fill: number, ring: number): void => {
      g.circle(at.x, at.y, (radius + 1) * pixel).stroke({ width: pixel, color: 0x000000, alpha: 0.45 });
      g.circle(at.x, at.y, radius * pixel).fill({ color: fill });
      g.circle(at.x, at.y, (radius - 0.75) * pixel).stroke({ width: 1.5 * pixel, color: ring });
    };
    for (const zone of zones) {
      const color = zone.id === selected ? theme.accent : theme.stroke;
      outline(zone.polygon, true, color);
      zone.polygon.forEach((point, index) => {
        const held = corner?.zoneId === zone.id && corner.index === index;
        dot(point, ZONE_CORNER_RADIUS * (held ? 1.3 : 1), held ? color : theme.background, color);
      });
      // The handle: the theme's badge around a disc in the zone's own light.
      const handle = zoneHandlePoint(zone.polygon);
      dot(handle, ZONE_HANDLE_RADIUS, theme.background, color);
      g.circle(handle.x, handle.y, (ZONE_HANDLE_RADIUS - 4) * pixel).fill({ color: zoneLightColor(zone) }).stroke({ width: pixel, color: theme.stroke, alpha: 0.5 });
    }
    if (draft.length > 0) {
      outline(cursor ? [...draft, cursor] : draft, false, theme.accent);
      draft.forEach((point, index) => dot(point, ZONE_CORNER_RADIUS * (index === 0 && draft.length >= 3 ? 1.5 : 1), theme.background, theme.accent));
    }
  }

  destroy(): void {
    destroyTree(this.view);
  }
}
