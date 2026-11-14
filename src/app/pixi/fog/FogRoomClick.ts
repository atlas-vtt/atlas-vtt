/**
 * The fog tool's Room shape: the room the walls enclose under the pointer (`fogRooms.ts`) is
 * outlined while the pointer rests in it, and a press released in place is a click in that room,
 * which the tool then hides or reveals. Fog that is remembered as that room already (an area) is
 * hidden or revealed as the piece it is, so a room never has two. Where the walls enclose
 * nothing, a notice says so.
 */
import type { Graphics } from 'pixi.js';
import type { StoreApi } from 'zustand';
import { areaIsHidden, areaOutline, fogAreaList, type FogArea } from '../../fog/fogAreas';
import { outlineRings } from '../../fog/fogKeyhole';
import { isAreaOfRoom } from '../../fog/fogRoomAreas';
import { roomAt, roomTexel, type RoomCorners } from '../../fog/fogRooms';
import type { MapRect } from '../../grid/cellNumbering';
import { t } from '../../i18n';
import { levelObjects } from '../../levels/levelObjects';
import type { ViewAtlasState } from '../../storeFactory';
import type { Point } from '../../types/visionTypes';
import { showNotice } from '../../ui/notice';
import { wallList } from '../../vision/wallList';
import { canvasBadgeTheme } from '../utils/canvasBadgeColors';
import { drawAreaOutlines } from './fogAreaOutlines';

/** Screen pixels the pointer may move from where it was pressed before the press is no click. */
const CLICK_SLOP = 4;

export interface FogRoomClickDeps {
  readonly store: Pick<StoreApi<ViewAtlasState>, 'getState'>;
  /** The map as the view draws it; null without one, where no room is found. */
  readonly mapRect: () => MapRect | null;
  /** Where the room under the pointer is outlined: the gesture's outline of what is under way, which it clears. */
  readonly outline: Graphics;
  /** Screen pixels per world pixel. */
  readonly zoom: () => number;
  /** Whether a click made now hides the room; else it reveals it. */
  readonly hides: () => boolean;
  /** Fills the room clicked in at the world point: its corners become the tool's shape. */
  readonly fill: (world: Point, room: Point[]) => void;
}

export class FogRoomClick {
  /** The room that is outlined, and the zoom its outline was drawn for. */
  private shown: RoomCorners | null = null;
  private shownZoom = 0;
  /** Where on the canvas the press under way was made. */
  private pressed: Point | null = null;

  constructor(private readonly deps: FogRoomClickDeps) {}

  /** The room around the world point on the level shown; null where the walls enclose none there. */
  at(world: Point): RoomCorners | null {
    const state = this.deps.store.getState();
    const mapRect = this.deps.mapRect();
    return mapRect ? roomAt(world, wallList(levelObjects(state).walls), mapRect, state.grid?.size ?? 0) : null;
  }

  /** A click at the world point. */
  click(world: Point): void {
    const room = this.at(world);
    if (!room) {
      showNotice(t('fog.roomNotEnclosed'));
      return;
    }
    const hides = this.deps.hides();
    const piece = this.areaOf(room);
    // The room is remembered already: that piece is hidden or revealed. One that is hidden stays so.
    if (piece && areaIsHidden(piece) !== hides) this.deps.store.getState().flipFogArea(piece.id);
    else if (!piece || !hides) this.deps.fill(world, room.map(({ x, y }) => ({ x, y })));
  }

  /** The pointer is at `world` (`screen` on the canvas): the room there is outlined, anew only for another room. A press that left its place is no click. */
  hover(world: Point, screen: Point): void {
    if (this.pressed && Math.hypot(screen.x - this.pressed.x, screen.y - this.pressed.y) >= CLICK_SLOP) this.pressed = null;
    this.show(this.at(world));
  }

  /** A press of the primary button at `screen` on the canvas. */
  press(screen: Point): void {
    this.pressed = screen;
  }

  /** The pointer was released at `world`: where its press never left its place, that is a click there. */
  release(world: Point): void {
    const clicked = this.pressed !== null;
    this.pressed = null;
    if (clicked) this.click(world);
  }

  /** The outline was cleared, or what is under way dropped: nothing is outlined and no press is under way. */
  forget(): void {
    this.shown = null;
    this.pressed = null;
  }

  /** The map was zoomed: the outline is drawn as wide on screen as before. */
  rescale(): void {
    if (this.shown) this.show(this.shown);
  }

  /** The area of the level shown that is `room` already, or null. */
  private areaOf(room: RoomCorners): FogArea | null {
    const state = this.deps.store.getState();
    const mapRect = this.deps.mapRect();
    if (!mapRect) return null;
    const reach = roomTexel(mapRect, state.grid?.size ?? 0);
    return fogAreaList(levelObjects(state).fog).find((area) => isAreaOfRoom(room, areaOutline(area), reach)) ?? null;
  }

  private show(room: RoomCorners | null): void {
    const zoom = this.deps.zoom();
    if (room === this.shown && (room === null || zoom === this.shownZoom)) return;
    this.shown = room;
    this.shownZoom = zoom;
    // A room round a room is outlined along its own walls and the inner room's, not along the slit between them.
    if (room) drawAreaOutlines(this.deps.outline, outlineRings(room).map((outline) => ({ outline, dashed: false })), zoom, canvasBadgeTheme().accent);
    else this.deps.outline.clear();
  }
}
