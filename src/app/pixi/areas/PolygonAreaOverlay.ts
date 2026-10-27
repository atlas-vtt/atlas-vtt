import { Container, Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { Point } from '../../types/visionTypes';
import { canvasBadgeTheme, type CanvasBadgeTheme } from '../utils/canvasBadgeColors';
import { destroyTree } from '../utils/destroyTree';
import { AREA_CORNER_RADIUS, AREA_HANDLE_RADIUS, type AreaCorner, type PolygonArea } from './areaGeometry';

const LINE_WIDTH = 1.5;
const UNDER_WIDTH = 3.5;

/** What the overlay draws besides the areas themselves. */
export interface AreaOverlayState {
  /** The areas' corners and the area being drawn show only while they are edited; else the outlines and handles alone. */
  editing: boolean;
  /** The area whose popover is open. */
  selected: string | null;
  /** The corners placed for an area being drawn, and where the pointer is. */
  draft: readonly Point[];
  cursor: Point | null;
  /** The corner under the pointer or being dragged. */
  corner: AreaCorner | null;
}

/** The badge on an area's handle, of `AREA_HANDLE_RADIUS` screen pixels, which a look draws into. */
export interface AreaBadge {
  /** The badge's middle, in world pixels. */
  at: Point;
  /** A screen pixel in world pixels: the badge keeps its size on screen. */
  pixel: number;
  theme: CanvasBadgeTheme;
  /** How strongly the area shows: 1 while edited, else the look's `restingAlpha`. */
  alpha: number;
}

/** How one kind of area looks on the overlay. */
export interface AreaLook<Area extends PolygonArea> {
  label: string;
  zIndex: number;
  /** Where an area's handle sits, in world pixels. */
  handleOf: (area: Area) => Point;
  /** Draws what the handle shows of the area inside its badge (`AreaBadge`). */
  decorate: (g: Graphics, area: Area, badge: AreaBadge) => void;
  /** Draws marks inside the area, under its outline (`at` is the handle's place). */
  mark?: (g: Graphics, area: Area, badge: AreaBadge) => void;
  /** How strongly an area's outline shows while it is not edited; 0 shows nothing then. */
  restingAlpha: number;
}

/**
 * Areas the GM draws on the map corner by corner (light zones, stairs), as the GM edits them: each
 * area's outline with a handle on every corner and one badge inside it, the selected one in the
 * theme's accent, and the area being drawn. Lines and handles keep their size on screen. While the
 * areas are not edited, an outline and the badge show at `restingAlpha`.
 */
export class PolygonAreaOverlay<Area extends PolygonArea> {
  readonly view: Container;
  private readonly lines = new Graphics();
  private theme = canvasBadgeTheme();

  constructor(private readonly viewport: Viewport, private readonly look: AreaLook<Area>) {
    this.view = new Container({ label: look.label, zIndex: look.zIndex, eventMode: 'none', interactiveChildren: false });
    this.view.addChild(this.lines);
    viewport.addChild(this.view);
  }

  /** Reads the theme's colours again; they are not read on every draw, which follows the pointer. */
  retheme(): void {
    this.theme = canvasBadgeTheme();
  }

  draw(areas: readonly Area[], { editing, selected, draft, cursor, corner }: AreaOverlayState): void {
    const g = this.lines.clear();
    if (!this.view.visible || (!editing && this.look.restingAlpha === 0)) return;
    const pixel = 1 / this.viewport.scale.x;
    const { theme } = this;
    const alpha = editing ? 1 : this.look.restingAlpha;
    const outline = (points: readonly Point[], closed: boolean, color: number): void => {
      for (const [width, lineColor, lineAlpha] of [[UNDER_WIDTH, 0x000000, 0.45], [LINE_WIDTH, color, 1]] as const) {
        g.moveTo(points[0]!.x, points[0]!.y);
        for (const point of points.slice(1)) g.lineTo(point.x, point.y);
        if (closed) g.closePath();
        g.stroke({ width: width * pixel, color: lineColor, alpha: lineAlpha * alpha });
      }
    };
    const dot = (at: Point, radius: number, fill: number, ring: number): void => {
      g.circle(at.x, at.y, (radius + 1) * pixel).stroke({ width: pixel, color: 0x000000, alpha: 0.45 * alpha });
      g.circle(at.x, at.y, radius * pixel).fill({ color: fill, alpha });
      g.circle(at.x, at.y, (radius - 0.75) * pixel).stroke({ width: 1.5 * pixel, color: ring, alpha });
    };
    for (const area of areas) {
      const color = area.id === selected ? theme.accent : theme.stroke;
      const handle = this.look.handleOf(area);
      this.look.mark?.(g, area, { at: handle, pixel, theme, alpha });
      outline(area.polygon, true, color);
      if (editing) {
        area.polygon.forEach((point, index) => {
          const held = corner?.areaId === area.id && corner.index === index;
          dot(point, AREA_CORNER_RADIUS * (held ? 1.3 : 1), held ? color : theme.background, color);
        });
      }
      dot(handle, AREA_HANDLE_RADIUS, theme.background, color);
      this.look.decorate(g, area, { at: handle, pixel, theme, alpha });
    }
    if (editing && draft.length > 0) {
      outline(cursor ? [...draft, cursor] : draft, false, theme.accent);
      draft.forEach((point, index) => dot(point, AREA_CORNER_RADIUS * (index === 0 && draft.length >= 3 ? 1.5 : 1), theme.background, theme.accent));
    }
  }

  destroy(): void {
    destroyTree(this.view);
  }
}
