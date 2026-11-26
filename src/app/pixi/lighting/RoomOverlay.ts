import { Container, Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { outlinesWithHoles, ringPoints, type RoomArea } from '../../lighting/rooms';
import { BrushOutline } from '../../lighting/brushOutline';
import { wallSpaces } from '../../lighting/wallSpaces';
import { levelObjects } from '../../levels/levelObjects';
import type { ViewAtlasStore } from '../../storeFactory';
import { roomSizesOf, type RoomSizes, type RoomToolOptions } from '../../stores/roomsSlice';
import { type ShapeStroke, STROKE_COLORS } from '../../tools/shapeStroke';
import type { Point } from '../../types/visionTypes';
import type { MapBounds } from '../../vision/visibility';
import { FogCursorPreview } from '../fog/FogCursorPreview';
import { destroyTree } from '../utils/destroyTree';
import { fillWithHoles } from '../utils/fillWithHoles';
import { drawStrokeArea } from '../utils/strokePreview';
import { lightMarkerTheme } from './lightMarker';

/** Above the lighting (90) and the explored memory's overlay (91), below the light zones (94) and every marker. */
export const ROOMS_Z_INDEX = 92;
/** How long the walls must rest before their rooms are found anew (the rock darkened), in milliseconds. */
export const ROOMS_REST_MS = 120;
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
  /** A bucket that pours on release (not one Alt turned into its brush alone). */
  pours: boolean;
  /** The pointer while a stabilized stroke trails behind it: the rope runs from here to the brush. */
  lead: Point | null;
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
  private readonly brushOutline = new BrushOutline();
  /** What the shade was last drawn for: the rooms and the map's size; null while it shows nothing. */
  private shaded: { spaces: readonly RoomArea[]; width: number; height: number } | null = null;
  /** The wait before the rock is darkened anew after the walls changed, or null. */
  private shadeTimer: number | null = null;

  constructor(private readonly viewport: Viewport, private readonly store: ViewAtlasStore, private readonly bounds: () => MapBounds | null, private readonly win: Window | null) {
    this.cursor = new FogCursorPreview(viewport);
    // The floor is cut out of the rock by a stencil (no filter: a filter's pass over the whole screen on every pointer move made the brush's ring lag).
    this.rock.setMask({ mask: this.floor, inverse: true });
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
    this.cancelShade();
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
    this.rock.clear().rect(0, 0, bounds.width, bounds.height).fill({ color: 0x000000, alpha: ROCK_ALPHA });
    this.floor.clear();
    for (const space of spaces) {
      for (const { outline, holes } of outlinesWithHoles(space)) fillWithHoles(this.floor, ringPoints(outline), holes.map(ringPoints), { color: 0xffffff });
    }
  }

  /** Darkens the rock anew once the walls have rested `ROOMS_REST_MS`: finding the rooms of a large map takes tens of milliseconds. */
  shadeSoon(): void {
    if (!this.view.visible || this.shadeTimer !== null || !this.win) return;
    this.shadeTimer = this.win.setTimeout(() => this.drawShade(), ROOMS_REST_MS);
  }

  private cancelShade(): void {
    if (this.shadeTimer !== null) this.win?.clearTimeout(this.shadeTimer);
    this.shadeTimer = null;
  }

  /** Draws the shape under way, or clears it. */
  draw(shape: RoomPreview | null): void {
    if (this.view.destroyed) return;
    this.preview.clear();
    this.cursor.hide();
    if (!this.view.visible || !shape) return;
    const line = 1 / this.viewport.scale.x;
    const { accent } = lightMarkerTheme();
    this.drawShape(shape, shape.filling ? STROKE_COLORS.erase : STROKE_COLORS.paint, accent, line, this.store.getState().roomTool, roomSizesOf(this.store.getState()));
  }

  private drawShape({ stroke, draft, pointer, door, filling, pours, lead }: RoomPreview, color: number, accent: number, line: number, tool: RoomToolOptions, sizes: RoomSizes): void {
    if (door && pointer) this.preview.moveTo(door.x, door.y).lineTo(pointer.x, pointer.y).stroke({ width: 4 * line, color: accent });
    if (draft.length > 0) {
      const points = pointer ? [...draft, pointer] : draft;
      this.preview.poly(points.flatMap((p) => [p.x, p.y]), false).stroke({ width: 2 * line, color });
      for (const p of draft) this.preview.circle(p.x, p.y, 4 * line).fill({ color });
    }
    if (stroke.active) {
      const drawn = stroke.shape();
      // The brush's stamps as one outline: translucent stamps darkened where they overlapped
      if (drawn?.type === 'brush') for (const ring of this.brushOutline.of(drawn)) this.preview.poly(ringPoints(ring), true).stroke({ width: 2 * line, color });
      else drawStrokeArea(this.preview, stroke, color, 2 * line);
    }
    // The brush's ring, or the reach of the bucket about to be poured.
    if ((tool.shape === 'brush' || tool.shape === 'bucket') && pointer && !door) {
      this.cursor.setBrushRadius(pours ? sizes.bucketRadius : sizes.brushSize);
      this.cursor.updatePosition(pointer.x, pointer.y);
      this.cursor.show(filling);
      if (lead) this.preview.moveTo(lead.x, lead.y).lineTo(pointer.x, pointer.y).stroke({ width: line, color, alpha: 0.8 });
      // The bucket's inner ring: what is carved whatever the art shows.
      if (pours) this.preview.circle(pointer.x, pointer.y, sizes.brushSize).stroke({ width: 2 * line, color });
    }
  }

  destroy(): void {
    this.cancelShade();
    this.rock.setMask({ mask: null, inverse: false });
    this.cursor.destroy();
    destroyTree(this.view);
  }
}
