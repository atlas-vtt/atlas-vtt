import type { GlassLook, ScreenRect } from '../../../pixi/glassOutline';
import type { PlayerWindowService } from '../../../services/PlayerWindowService';
import { playerWindowStore } from '../../../stores/playerWindowStore';
import type { Size, WorldFrame } from '../../../types/playerFrame';

/** The glass as the GM's map shows it. */
export interface Glass {
  look: GlassLook;
  frame: WorldFrame;
  /** On a glass the GM staged on the map players see: where they are now, until it is shown to them. */
  players?: WorldFrame;
}

/** Where the ghost stands: where the GM placed it, else the middle of the GM's view, at the TV's size on this map. */
export interface GhostPlace {
  size(): Size | null;
  centre(): { x: number; y: number };
}

/**
 * The glass on the map of `tabId`: `live` where players see it (pinned or following), `ghost`
 * where the window shows another map, and none while the window is closed or players are held
 * on a frame of this very tab (another level, a scene still loading). Where the GM `staged` a
 * frame on the map players see, the glass stands there as a ghost and remembers where they are.
 */
export function readGlass(service: PlayerWindowService | null, tabId: string | null, ghost: GhostPlace, staged: { x: number; y: number } | null = null): Glass | null {
  if (!service?.isWindowOpen() || !tabId) return null;
  const live = service.glassOf(tabId);
  if (live && staged) return { look: 'ghost', frame: { ...live, centerX: staged.x, centerY: staged.y }, players: live };
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
  /** What the bars at the top of the pane's start take: the scene tabs and the player window bar below them. */
  topStart: number;
  bottom: number;
}

/** The bars of the map view the chip keeps clear of: scene tabs above, the toolbars below. */
const TOP_BARS = '.atlas-scene-tab-bar';
const TOP_START_BARS = `${TOP_BARS}, .atlas-player-window-bar`;
const BOTTOM_BARS = '.atlas-bottom-toolbar-row .atlas-vtt-toolbar';

/** The room in `pane` as it stands now, around `canvas` and the bars that show. */
export function measureChipRoom(pane: Element, canvas: Element): ChipRoom {
  const area = pane.getBoundingClientRect();
  const map = canvas.getBoundingClientRect();
  const edges = (selector: string): DOMRect[] => [...pane.querySelectorAll(selector)].map((bar) => bar.getBoundingClientRect()).filter((rect) => rect.height > 0);
  return {
    canvasX: map.left - area.left,
    canvasY: map.top - area.top,
    width: area.width,
    height: area.height,
    top: Math.max(0, ...edges(TOP_BARS).map((rect) => rect.bottom - area.top)),
    topStart: Math.max(0, ...edges(TOP_START_BARS).map((rect) => rect.bottom - area.top)),
    bottom: Math.max(0, ...edges(BOTTOM_BARS).map((rect) => area.bottom - rect.top)),
  };
}

/** How far a saved frame's chip starts from the frame's corner, past the number that lies on it. */
const PAST_NUMBER = 14;

/** Between a chip and the pane's edges or bars. */
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

/**
 * The top-left corner in the pane of a saved frame's chip: on the frame's top edge (`rect`) beside
 * its number, so it covers little of what the frame shows, going with the frame. Where that corner lies under a bar or past the pane's edge (a
 * frame saved while players follow the GM is larger than the view) it stands in the corner of the
 * part of the frame that shows, so a chip that came up can be reached; it never leaves its frame
 * for the GM's view, and goes off the pane with a frame that left it.
 */
export function savedChipPlace(rect: ScreenRect, chip: Size, room: ChipRoom): { x: number; y: number } {
  const left = room.canvasX + rect.x;
  const top = room.canvasY + rect.y;
  const right = left + rect.width;
  const bottom = top + rect.height;
  const paneBottom = room.height - room.bottom;
  const x = left + PAST_NUMBER;
  const y = top - chip.height / 2;
  if (right <= 0 || left >= room.width || bottom <= room.topStart || top >= paneBottom) return { x, y };
  return {
    x: clamp(x, MARGIN, Math.min(right, room.width) - chip.width - MARGIN),
    y: clamp(y, room.topStart + MARGIN, Math.min(bottom, paneBottom) - chip.height - MARGIN),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(Math.max(min, max), value));
}

function inRoom(x: number, y: number, chip: Size, room: ChipRoom): { x: number; y: number } {
  return {
    x: clamp(x, MARGIN, room.width - chip.width - MARGIN),
    y: clamp(y, room.top + MARGIN, room.height - room.bottom - chip.height - MARGIN),
  };
}
