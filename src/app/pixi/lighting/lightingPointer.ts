import type { Point } from '../../types/visionTypes';
import type { TokenRenderer } from '../TokenRenderer';
import type { DoorIcons } from './DoorIcons';
import type { LightInteraction } from './LightInteraction';
import type { LightingModes } from './LightingModes';
import type { WallEditor } from './WallEditor';

export interface LightingPointerTargets {
  lights: LightInteraction;
  editor: WallEditor;
  modes: LightingModes;
  doors: DoorIcons;
  /** Opens the wall menu at a world point, given also as a screen point. */
  wallMenu: (x: number, y: number, screenX: number, screenY: number) => void;
  /** Whether the wall menu has something to open at a world point. */
  wallMenuAt: (x: number, y: number) => boolean;
  /** Opens a door's menu at a screen point. */
  doorMenu: (doorId: string, screenX: number, screenY: number) => void;
}

/**
 * Routes the pointer from the token renderer's dispatch: lights and door badges (a click opens
 * or closes the door, also on a badge the players' view shows; a right-click opens its menu, in
 * GM view only) with any tool; with the lighting tool the walls, or in its zone and
 * explored-memory modes those (`LightingModes`), which then take every press (a zone is drawn,
 * and memory brushed, across lights and walls alike). In the rooms mode the walls and doors stay
 * in reach as in the walls mode (a press, a drag of a wall's end, the wall menu), except while a
 * room's shape is under way or with Shift, which snaps the room's corners to the grid.
 */
export function wireLightingPointer(tokens: TokenRenderer, { lights, editor, modes, doors, wallMenu, wallMenuAt, doorMenu }: LightingPointerTargets): void {
  tokens.setLightHandlers({
    // With the lighting tool, a wall handle is grabbed before the marker beneath it, and Shift draws past lights.
    pointerDown: (x, y, e) => {
      if (modes.active && editor.shown) return false;
      return lights.pointerDown({ x, y }, e, editor.handleAt({ x, y }) || (editor.shown && e.shiftKey && !e.ctrlKey && !e.metaKey));
    },
    cursorAt: (x, y) => (modes.active && editor.shown ? null : lights.cursorAt({ x, y }, editor.handleAt({ x, y }))),
    leave: () => {
      lights.clearHover();
      modes.pointerLeft();
    },
  });
  const roomsAtRest = (): boolean => modes.rooms.active && !modes.rooms.busy;
  const wallsInRooms = (point: Point): boolean => roomsAtRest() && editor.takesPress(point);
  const doorClick = (x: number, y: number): boolean => {
    const doorId = doors.hitTest(x, y);
    if (doorId) doors.toggle(doorId);
    return !!doorId;
  };
  tokens.setWallPointerDownHandler((x, y, e) => {
    // The players' view hides the editor: the lighting tool then opens doors from the badges that view shows, as every other tool does.
    if (!editor.shown) return doorClick(x, y);
    const ctrl = e.ctrlKey || e.metaKey;
    // A press that closed a light's popover only closes it and lets go of the selection: it places no light and draws no wall.
    if (lights.takeDismissal()) {
      if (!ctrl) editor.walls.clearSelection();
      return true;
    }
    // In rooms mode a door's badge still opens and closes it: the doors are placed there.
    if (modes.rooms.active && doorClick(x, y)) return true;
    if (wallsInRooms({ x, y }) && !e.shiftKey) return editor.pointerDown({ x, y }, false, ctrl, e.altKey);
    // A press beside the walls lets go of the walls selected, as in the walls mode.
    if (roomsAtRest() && !ctrl) editor.walls.clearSelection();
    return modes.active ? modes.pointerDown({ x, y }, e) : editor.pointerDown({ x, y }, e.shiftKey, ctrl, e.altKey);
  });
  tokens.setWallPointerMoveHandler((x, y, e) => {
    if (modes.active && !(modes.rooms.active && editor.busy)) modes.pointerMove({ x, y }, e);
    else editor.pointerMove({ x, y }, e.altKey);
  });
  tokens.setWallPointerUpHandler(() => {
    modes.pointerUp();
    editor.pointerUp();
  }, () => editor.pointerCancel());
  tokens.setWallDoubleClickHandler(() => (modes.active ? modes.doubleClick() : editor.doubleClick()));
  const menuShown = (): boolean => editor.shown && (!modes.active || roomsAtRest());
  tokens.setWallContextMenuHandler((x, y, screenX, screenY) => {
    if (menuShown()) wallMenu(x, y, screenX, screenY);
  }, (x, y) => menuShown() && wallMenuAt(x, y));
  tokens.setWallCursorProvider((x, y) => {
    if (!modes.active || editor.busy || wallsInRooms({ x, y })) return editor.cursorAt({ x, y });
    return modes.cursorAt({ x, y });
  });
  tokens.setDoorMenuHandlers({ hitTest: (x, y) => doors.gmHitTest(x, y), open: doorMenu });
  // With the lighting tool a badge is pressed only where the walls' editor leaves it the press: in rooms mode, and in the players' view.
  tokens.setDoorClickHandler(doorClick, (x, y, lightingTool) => (!lightingTool || !editor.shown || modes.rooms.active) && doors.hitTest(x, y) !== null);
}
