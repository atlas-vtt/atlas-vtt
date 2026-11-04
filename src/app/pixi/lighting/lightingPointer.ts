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
  /** Opens a door's menu at a screen point. */
  doorMenu: (doorId: string, screenX: number, screenY: number) => void;
}

/**
 * Routes the pointer from the token renderer's dispatch: lights and door badges (a click opens
 * or closes the door, also on a badge the players' view shows; a right-click opens its menu, in
 * GM view only) with any tool; with the lighting tool the walls, or in its zone and
 * explored-memory modes those (`LightingModes`), which then take every press (a zone is drawn,
 * and memory brushed, across lights and walls alike).
 */
export function wireLightingPointer(tokens: TokenRenderer, { lights, editor, modes, doors, wallMenu, doorMenu }: LightingPointerTargets): void {
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
  const doorClick = (x: number, y: number): boolean => {
    const doorId = doors.hitTest(x, y);
    if (doorId) doors.toggle(doorId);
    return !!doorId;
  };
  tokens.setWallPointerDownHandler((x, y, e) => {
    // The players' view hides the editor: the lighting tool then opens doors from the badges that view shows, as every other tool does.
    if (!editor.shown) return doorClick(x, y);
    return modes.active ? modes.pointerDown({ x, y }, e) : editor.pointerDown({ x, y }, e.shiftKey, e.ctrlKey || e.metaKey, e.altKey);
  });
  tokens.setWallPointerMoveHandler((x, y, e) => (modes.active ? modes.pointerMove({ x, y }, e) : editor.pointerMove({ x, y }, e.altKey)));
  tokens.setWallPointerUpHandler(() => {
    modes.pointerUp();
    editor.pointerUp();
  });
  tokens.setWallDoubleClickHandler(() => (modes.active ? modes.doubleClick() : editor.doubleClick()));
  tokens.setWallContextMenuHandler((x, y, screenX, screenY) => {
    if (editor.shown && !modes.active) wallMenu(x, y, screenX, screenY);
  });
  tokens.setWallCursorProvider((x, y) => (modes.active ? modes.cursorAt({ x, y }) : editor.cursorAt({ x, y })));
  tokens.setDoorMenuHandlers({ hitTest: (x, y) => doors.gmHitTest(x, y), open: doorMenu });
  tokens.setDoorClickHandler(doorClick);
}
