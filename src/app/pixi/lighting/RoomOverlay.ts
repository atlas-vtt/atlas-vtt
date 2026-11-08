import { AlphaFilter, Container, Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { strokePolygons } from '../../lighting/exploredEdits';
import { outlinesWithHoles, ringPoints, roomList, type RoomArea } from '../../lighting/rooms';
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
 * The rooms as the GM sees them with the lighting tool: the rock darkened, each room's outline
 * (the highlighted one in the accent colour, hidden ones faint) and the shape under way. A GM
 * overlay (`GmOverlays`); the players never see it.
 */
export class RoomOverlay {
  readonly view = new Container({ label: 'rooms', zIndex: ROOMS_Z_INDEX, eventMode: 'none', interactiveChildren: false });
  private readonly shade = new Container();
  private readonly rock = new Graphics();
  private readonly open = new Graphics();
  private readonly outlines = new Graphics();
  private readonly preview = new Graphics();
  private readonly cursor: FogCursorPreview;
  private readonly fade = new AlphaFilter({ alpha: ROCK_ALPHA, resolution: 'inherit' });

  constructor(private readonly viewport: Viewport, private readonly store: ViewAtlasStore, private readonly bounds: () => MapBounds | null) {
    this.cursor = new FogCursorPreview(viewport);
    this.open.blendMode = 'erase';
    this.shade.filters = [this.fade];
    this.shade.addChild(this.rock, this.open);
    this.view.addChild(this.shade, this.outlines, this.preview, this.cursor.getDisplayObject());
    this.view.visible = false;
    viewport.addChild(this.view);
  }

  /** Draws the rooms of the level shown; the rock also while the first is being carved (`carving`). */
  draw(carving: boolean, shape: RoomPreview | null): void {
    if (this.view.destroyed) return;
    for (const g of [this.rock, this.open, this.outlines, this.preview]) g.clear();
    this.cursor.hide();
    if (!this.view.visible) return;
    const state = this.store.getState();
    const rooms = roomList(levelObjects(state).rooms);
    const bounds = this.bounds();
    const line = 1 / this.viewport.scale.x;
    const { accent } = lightMarkerTheme();
    if (bounds && (rooms.length > 0 || carving)) {
      this.rock.rect(0, 0, bounds.width, bounds.height).fill({ color: 0x000000 });
      for (const room of rooms) if (!room.hidden) fillArea(this.open, room.area);
    }
    for (const room of rooms) {
      const current = room.id === state.activeRoomId;
      const style = { width: (current ? 3 : 1.5) * line, color: current ? accent : 0xffffff, alpha: room.hidden ? 0.3 : current ? 1 : 0.6 };
      for (const ring of room.area) this.outlines.poly(ringPoints(ring), true).stroke(style);
    }
    if (shape) this.drawShape(shape, state.roomSplit ? accent : shape.filling ? STROKE_COLORS.erase : STROKE_COLORS.paint, accent, line, state.roomTool);
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

/** PIXI cuts a hole only from the shape drawn just before it, so each outline is drawn with its own holes. */
function fillArea(g: Graphics, area: RoomArea): void {
  for (const { outline, holes } of outlinesWithHoles(area)) {
    g.poly(ringPoints(outline)).fill({ color: 0xffffff });
    for (const hole of holes) g.poly(ringPoints(hole)).cut();
  }
}
