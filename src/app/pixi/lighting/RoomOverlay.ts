import { AlphaFilter, Container, Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { strokePolygons } from '../../lighting/exploredEdits';
import { outlinesWithHoles, ringPoints, type RoomArea } from '../../lighting/rooms';
import { wallSpaces } from '../../lighting/wallSpaces';
import { levelObjects } from '../../levels/levelObjects';
import type { ViewAtlasStore } from '../../storeFactory';
import { type ShapeStroke, STROKE_COLORS } from '../../tools/shapeStroke';
import type { Point } from '../../types/visionTypes';
import type { MapBounds } from '../../vision/visibility';
import { FogCursorPreview } from '../fog/FogCursorPreview';
import { destroyTree } from '../utils/destroyTree';
import { drawStrokeArea } from '../utils/strokePreview';
import { lightMarkerTheme } from './lightMarker';

/** Above the lighting (90) and the explored memory's overlay (91), below the light zones (94) and every marker. */
export const ROOMS_Z_INDEX = 92;
/** How dark the rock shows to the GM: the map stays readable through it. */
const ROCK_ALPHA = 0.45;

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
 * What the rooms mode shows the GM over the map: the rock darkened, so the rooms stand out as the
 * floor that walls close in (`wallSpaces`), and the shape under way (the stroke, the corners
 * placed, a door being dragged, the brush). The rooms themselves are walls, which the wall editor
 * draws. A GM overlay (`GmOverlays`); the players never see it.
 */
export class RoomOverlay {
  readonly view = new Container({ label: 'rooms', zIndex: ROOMS_Z_INDEX, eventMode: 'none', interactiveChildren: false });
  private readonly shade = new Container();
  private readonly rock = new Graphics();
  private readonly floor = new Graphics();
  private readonly preview = new Graphics();
  private readonly cursor: FogCursorPreview;
  private readonly fade = new AlphaFilter({ alpha: ROCK_ALPHA, resolution: 'inherit' });
  /** What the shade was last drawn for: the rooms and the map's size; null while it shows nothing. */
  private shaded: { spaces: readonly RoomArea[]; width: number; height: number } | null = null;

  constructor(private readonly viewport: Viewport, private readonly store: ViewAtlasStore, private readonly bounds: () => MapBounds | null) {
    this.cursor = new FogCursorPreview(viewport);
    this.floor.blendMode = 'erase';
    this.shade.filters = [this.fade];
    this.shade.addChild(this.rock, this.floor);
    this.view.addChild(this.shade, this.preview, this.cursor.getDisplayObject());
    this.view.visible = false;
    viewport.addChild(this.view);
  }

  /**
   * Darkens the rock: the whole map but the floor of its rooms. Drawn anew only when the rooms or
   * the map's size changed, so a pointer's move redraws nothing of it.
   */
  drawShade(): void {
    if (this.view.destroyed) return;
    const bounds = this.view.visible ? this.bounds() : null;
    if (!bounds) {
      if (this.shaded) {
        this.rock.clear();
        this.floor.clear();
        this.shaded = null;
      }
      return;
    }
    const spaces = wallSpaces(levelObjects(this.store.getState()).walls);
    if (this.shaded && this.shaded.spaces === spaces && this.shaded.width === bounds.width && this.shaded.height === bounds.height) return;
    this.shaded = { spaces, width: bounds.width, height: bounds.height };
    this.rock.clear().rect(0, 0, bounds.width, bounds.height).fill({ color: 0x000000 });
    this.floor.clear();
    // PIXI cuts a hole only from the shape drawn just before it, so each outline is drawn with its own holes.
    for (const space of spaces) {
      for (const { outline, holes } of outlinesWithHoles(space)) {
        this.floor.poly(ringPoints(outline)).fill({ color: 0xffffff });
        for (const hole of holes) this.floor.poly(ringPoints(hole)).cut();
      }
    }
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
    this.shade.filters = null;
    this.fade.destroy();
    this.cursor.destroy();
    destroyTree(this.view);
  }
}
