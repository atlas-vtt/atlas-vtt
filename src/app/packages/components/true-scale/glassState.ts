import type { GlassLook, ScreenRect } from '../../../pixi/glassOutline';
import type { PlayerWindowService } from '../../../services/PlayerWindowService';
import { playerWindowStore } from '../../../stores/playerWindowStore';
import type { Size, WorldFrame } from '../../../types/playerFrame';

/** The glass as the GM's map shows it. */
export interface Glass {
  look: GlassLook;
  frame: WorldFrame;
}

/** Where the ghost stands when it is not being dragged: the middle of the GM's view, at the TV's size on this map. */
export interface GhostPlace {
  size(): Size | null;
  centre(): { x: number; y: number };
}

/**
 * The glass on the map of `tabId`: `live` where players see it (pinned or following), `ghost`
 * where the window shows another map, and none while the window is closed or players are held
 * on a frame of this very tab (another level, a scene still loading).
 */
export function readGlass(service: PlayerWindowService | null, tabId: string | null, ghost: GhostPlace): Glass | null {
  if (!service?.isWindowOpen() || !tabId) return null;
  const live = service.glassOf(tabId);
  if (live) return { look: 'live', frame: live };
  if (playerWindowStore.getState().shownTabId === tabId) return null;
  const size = ghost.size();
  if (!size) return null;
  const { x, y } = ghost.centre();
  return { look: 'ghost', frame: { centerX: x, centerY: y, ...size } };
}

/** The room the chip may stand in, within its pane, in the pane's pixels. */
export interface ChipRoom {
  /** The canvas's top-left corner in the pane. */
  canvasX: number;
  canvasY: number;
  width: number;
  height: number;
  /** What the bars at the pane's top and bottom take. */
  top: number;
  bottom: number;
}

/** Between a chip and the pane's edges or bars, and between a saved frame's chip and the frame's corner. */
const MARGIN = 8;

/**
 * The chip's top-left corner in the pane: centred on the glass's top edge (`rect`, on the canvas).
 * A pinned glass is a place on the map, so its chip stays on it and leaves the screen with it;
 * a following glass or a ghost is as large as the GM's view or larger, so its chip is kept
 * inside the pane clear of its bars (`inPane`), where the GM can reach it.
 */
export function chipPlace(rect: ScreenRect, chip: Size, room: ChipRoom, inPane = true): { x: number; y: number } {
  const x = room.canvasX + rect.x + rect.width / 2 - chip.width / 2;
  const y = room.canvasY + rect.y - chip.height / 2;
  return inPane ? inRoom(x, y, chip, room) : { x, y };
}

/** The top-left corner in the pane of a saved frame's chip: inside the frame's top-left corner (`rect`), going with the frame. */
export function savedChipPlace(rect: ScreenRect, chip: Size, room: ChipRoom): { x: number; y: number } {
  return { x: room.canvasX + rect.x + MARGIN, y: room.canvasY + rect.y + MARGIN };
}

function inRoom(x: number, y: number, chip: Size, room: ChipRoom): { x: number; y: number } {
  const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(Math.max(min, max), value));
  return {
    x: clamp(x, MARGIN, room.width - chip.width - MARGIN),
    y: clamp(y, room.top + MARGIN, room.height - room.bottom - chip.height - MARGIN),
  };
}
