import { Container, Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { strokePolygons } from '../../lighting/exploredEdits';
import type { ViewAtlasStore } from '../../storeFactory';
import { type ShapeStroke, STROKE_COLORS } from '../../tools/shapeStroke';
import type { Point } from '../../types/visionTypes';
import { FogCursorPreview } from '../fog/FogCursorPreview';
import { destroyTree } from '../utils/destroyTree';
import { drawStrokeArea } from '../utils/strokePreview';
import { lightMarkerTheme } from './lightMarker';

/** Above the lighting (90) and the explored memory's overlay (91), below the light zones (94) and every marker. */
export const ROOMS_Z_INDEX = 92;

/** What the rooms mode is drawing now. */
export interface RoomPreview {
  stroke: ShapeStroke;
  /** Corners of a polygon being placed. */
  draft: readonly Point[];
  pointer: Point | null;
  /** Where a door being dragged starts. */
  door: Point | null;
  filling: boolean;
}

/**
 * The shape the rooms mode has under way, over the map: the stroke, the corners placed, a door
 * being dragged and the brush. The rooms themselves are walls, which the wall editor draws. A GM
 * overlay (`GmOverlays`); the players never see it.
 */
export class RoomOverlay {
  readonly view = new Container({ label: 'rooms', zIndex: ROOMS_Z_INDEX, eventMode: 'none', interactiveChildren: false });
  private readonly preview = new Graphics();
  private readonly cursor: FogCursorPreview;

  constructor(private readonly viewport: Viewport, private readonly store: ViewAtlasStore) {
    this.cursor = new FogCursorPreview(viewport);
    this.view.addChild(this.preview, this.cursor.getDisplayObject());
    this.view.visible = false;
    viewport.addChild(this.view);
  }

  /** Draws the shape under way, or clears it. */
  draw(shape: RoomPreview | null): void {
    if (this.view.destroyed) return;
    this.preview.clear();
    this.cursor.hide();
    if (!this.view.visible || !shape) return;
    const line = 1 / this.viewport.scale.x;
    const { accent } = lightMarkerTheme();
    this.drawShape(shape, shape.filling ? STROKE_COLORS.erase : STROKE_COLORS.paint, accent, line, this.store.getState().roomTool);
  }

  private drawShape({ stroke, draft, pointer, door, filling }: RoomPreview, color: number, accent: number, line: number, tool: { shape: string; brushSize: number }): void {
    if (door && pointer) this.preview.moveTo(door.x, door.y).lineTo(pointer.x, pointer.y).stroke({ width: 4 * line, color: accent });
    if (draft.length > 0) {
      const points = pointer ? [...draft, pointer] : draft;
      this.preview.poly(points.flatMap((p) => [p.x, p.y]), false).stroke({ width: 2 * line, color });
      for (const p of draft) this.preview.circle(p.x, p.y, 4 * line).fill({ color });
    }
    if (stroke.active) {
      const drawn = stroke.shape();
      if (drawn?.type === 'brush') for (const polygon of strokePolygons(drawn)) this.preview.poly(polygon.flatMap((p) => [p.x, p.y])).fill({ color, alpha: 0.3 });
      else drawStrokeArea(this.preview, stroke, color, 2 * line);
    }
    if (tool.shape === 'brush' && pointer && !door) {
      this.cursor.setBrushRadius(tool.brushSize);
      this.cursor.updatePosition(pointer.x, pointer.y);
      this.cursor.show(filling);
    }
  }

  destroy(): void {
    this.cursor.destroy();
    destroyTree(this.view);
  }
}
