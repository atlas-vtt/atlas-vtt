import type { FederatedPointerEvent } from 'pixi.js';
import { isFogTool } from '../../fog/fogToolChoices';
import { isPrimaryPress } from '../utils/pointerButtons';
import type { AttachedLayers, HoverClaim, LayerId, MenuClaim, PointerAt, PointerContext, PressResult } from './mapLayers';

interface WorldPoint {
  readonly x: number;
  readonly y: number;
}

export type RowLayer = LayerId | 'emptyMap';

/** One place of a layer in the map's order, and what the layer answers there. */
export interface PointerRow {
  readonly layer: RowLayer;
  /** A press that is no secondary click. */
  press?(layers: AttachedLayers, at: PointerAt, context: PointerContext): PressResult;
  /** A secondary click: the layer's menu here, or null to leave it to the rows beneath. */
  menu?(layers: AttachedLayers, at: WorldPoint, context: PointerContext): MenuClaim | null;
  /** Whether a tap here acts on something whose press stays the empty map's; null to ask the rows beneath. */
  tap?(layers: AttachedLayers, at: WorldPoint, context: PointerContext): boolean | null;
  /** Whether a primary press here acts at once, which a lost pointer does not take back; null to ask the rows beneath. */
  pressActs?(layers: AttachedLayers, at: WorldPoint, context: PointerContext): boolean | null;
  /** A move: what the layer shows, given the layer above that covers it (null where none does). */
  hover?(layers: AttachedLayers, at: PointerAt, context: PointerContext, above: RowLayer | null): HoverClaim | null;
}

const primary = (at: PointerAt): boolean => isPrimaryPress(at.event);
const claimed = (took: boolean | undefined): PressResult => (took ? 'claimed' : null);
const covering = (cursor: string | null | undefined): HoverClaim | null => (cursor ? { cursor, covers: true } : null);
const onRelease = (opens: boolean, open: (up: FederatedPointerEvent) => void): MenuClaim => ({ on: 'release', opens, open });

/**
 * The layers on the map that take the pointer, top to bottom. Every gesture walks this one list:
 * a press, a secondary click (and `menuAt`, which asks what it would open), a tap, whether a press
 * acts at once, and a move with its cursor. A layer appears twice where it lies at two heights:
 * the handles of the selected drawings above the tokens and the drawings below them, and the menus
 * of the lighting tool and of door badges above what takes the press there.
 */
export const MAP_POINTER_ROWS: readonly PointerRow[] = [
  {
    // The lighting tool's menu opens beside the walls too, for the selection: with that tool it takes every right-click (#834)
    layer: 'walls',
    menu: ({ walls }, at, c) => (c.tool === 'wall' && walls
      ? onRelease(walls.menuAt(at.x, at.y), (up) => walls.openMenu(at.x, at.y, up.clientX, up.clientY))
      : null),
  },
  {
    // A door's badge is drawn above the pins: its menu comes before theirs, its press after (#834)
    layer: 'doors',
    menu: ({ doors }, at) => {
      const doorId = doors?.menuHitTest(at.x, at.y);
      return doors && doorId ? onRelease(true, (up) => doors.openMenu(doorId, up.clientX, up.clientY)) : null;
    },
  },
  {
    // The handles of kept measurements: the smallest marks and the topmost, with any tool
    layer: 'measureHandles',
    press: ({ measureHandles }, at) => claimed(primary(at) && measureHandles?.pointerDown(at.x, at.y, at.event)),
    hover: ({ measureHandles }, at) => covering(measureHandles?.cursorAt(at.x, at.y)),
  },
  {
    // Pins, with any tool: dragged and opened by a press, so a finger's press waits for no tap
    layer: 'pins',
    press: ({ pins }, at) => {
      const pinId = primary(at) ? pins?.hitTest(at.x, at.y) : null;
      if (!pins || !pinId) return null;
      pins.press(pinId, at.event);
      return 'claimed';
    },
    menu: ({ pins }, at) => {
      const pinId = pins?.hitTest(at.x, at.y);
      return pins && pinId ? { on: 'press', opens: true, press: (event) => pins.press(pinId, event) } : null;
    },
    pressActs: ({ pins }, at) => (pins?.hitTest(at.x, at.y) ? false : null),
    hover: ({ pins }, at, _c, above) => {
      const pinId = above ? null : pins?.hitTest(at.x, at.y) ?? null;
      pins?.hover(pinId, at.event);
      return covering(pinId && 'pointer');
    },
  },
  {
    // Door badges open and close their doors with any tool but the lighting tool, whose walls are placed around them
    layer: 'doors',
    press: ({ doors }, at, c) => claimed(primary(at) && c.tool !== 'wall' && doors?.click(at.x, at.y)),
    pressActs: ({ doors }, at, c) => (doors?.pressActsAt(at.x, at.y, c.tool === 'wall') ? true : null),
  },
  {
    // Light markers and range rings: a light's popover and its drags, with any tool
    layer: 'lights',
    press: ({ lights }, at) => claimed(primary(at) && lights?.pointerDown(at.x, at.y, at.event)),
    hover: ({ lights }, at, _c, above) => {
      if (above) {
        lights?.leave();
        return null;
      }
      return covering(lights?.cursorAt(at.x, at.y));
    },
  },
  {
    // The handles of the selected drawings and texts, above everything they frame. Their hover also marks a
    // drawing a press would take, which leaves a token beneath it to the tools that take tokens
    layer: 'annotations',
    press: ({ annotations }, at) => claimed(primary(at) && annotations?.gripDown(at.x, at.y, at.event)),
    hover: ({ annotations, tokens }, at, _c, above) => {
      if (above) {
        annotations?.leave();
        return null;
      }
      return covering(annotations?.cursorAt(at.x, at.y, () => (tokens?.hitTest(at.x, at.y) ?? null) !== null, at.event.altKey === true));
    },
  },
  {
    layer: 'stairs',
    press: ({ stairs }, at, c) => claimed(c.tool === 'stairs' && primary(at) && stairs?.pointerDown({ x: at.x, y: at.y }, at.event)),
    hover: ({ stairs }, at, c, above) => {
      // A pin under the pointer takes the move from the tool (#833)
      if (c.tool !== 'stairs' || !stairs || above === 'pins') return null;
      stairs.pointerMove({ x: at.x, y: at.y }, at.event);
      return covering(stairs.cursorAt({ x: at.x, y: at.y }));
    },
  },
  {
    layer: 'walls',
    press: ({ walls }, at, c) => claimed(c.tool === 'wall' && primary(at) && walls?.pointerDown(at.x, at.y, at.event)),
    hover: ({ walls }, at, c, above) => {
      // As with the stairs tool, a pin under the pointer takes the move (#833)
      if (c.tool !== 'wall' || !walls || above === 'pins') return null;
      walls.pointerMove(at.x, at.y, at.event);
      return covering(walls.cursorAt(at.x, at.y));
    },
  },
  {
    layer: 'sounds',
    press: ({ sounds }, at, c) => claimed(c.tool === 'audio' && primary(at) && sounds?.pointerDown(at.x, at.y)),
    hover: ({ sounds }, _at, c) => covering(c.tool === 'audio' && sounds ? 'crosshair' : null),
  },
  {
    // Tokens and a selection's bars, with the select and move tools. Every button presses a token
    layer: 'tokens',
    press: ({ tokens, annotations }, at, c) => {
      if (!c.tokenTool || !tokens) return null;
      const { event } = at;
      // The bars of a selection stand above every token: one change for all of it. Shift passes over them
      const bar = primary(at) && !event.shiftKey ? tokens.barAt(at.x, at.y) : null;
      if (bar && tokens.pressBar(bar, event)) return 'claimed';
      const tokenId = tokens.hitTest(at.x, at.y);
      if (!tokenId) return null;
      tokens.press(tokenId, event);
      // Drawings and texts selected alongside the token follow its drag; a token from outside the selection
      // moves alone. A Shift-drag turns the tokens and moves nothing
      if (primary(at) && !event.shiftKey && c.selectedIds().includes(tokenId)) annotations?.dragAlong(event);
      return 'claimed';
    },
    menu: ({ tokens }, at, c) => {
      const tokenId = c.tokenTool ? tokens?.hitTest(at.x, at.y) : null;
      return tokens && tokenId ? { on: 'press', opens: tokens.offersMenu(), press: (event) => tokens.press(tokenId, event) } : null;
    },
    pressActs: ({ tokens }, at, c) => (c.tokenTool && tokens?.barAt(at.x, at.y) ? true : null),
    hover: ({ tokens }, at, c, above) => {
      if (!tokens) return null;
      if (!c.tokenTool) {
        // Other tools leave tokens alone, but the statblock preview (Ctrl/Cmd held) answers with every one; a pin has its own
        tokens.preview(above === 'pins' ? null : tokens.hitTest(at.x, at.y), at.event);
        return null;
      }
      const tokenId = above ? null : tokens.hitTest(at.x, at.y);
      const bar = above ? null : tokens.barAt(at.x, at.y);
      tokens.hover(tokenId, at.event);
      tokens.hoverBar(bar);
      if (tokenId) return { cursor: 'pointer', covers: true };
      return bar ? { cursor: 'pointer', covers: false } : null;
    },
  },
  {
    // The frame around a selection of two or more drags all of it, tokens, drawings and texts; Shift picks instead
    layer: 'groupFrame',
    press: ({ groupFrame, tokens, annotations }, at, c) => {
      const { event } = at;
      if (!c.tokenTool || !primary(at) || event.shiftKey || !groupFrame?.contains(at.x, at.y)) return null;
      event.stopPropagation();
      tokens?.dragSelected(event);
      annotations?.dragAlong(event);
      return 'claimed';
    },
  },
  {
    // Drawings and texts, for the tools that take them; one on the map leaves a linked hex its press. A fill and a
    // selection's frame cover whole stretches of the map: a right-click's press stays the viewport's, so it pans
    layer: 'annotations',
    press: ({ annotations }, at, c) => claimed((c.tokenTool || c.tool === 'draw') && primary(at) && annotations?.pointerDown(at.x, at.y, at.event)),
    menu: ({ annotations }, at) => (annotations?.menuAt(at.x, at.y) ? onRelease(true, (up) => annotations.openMenu(at.x, at.y, up)) : null),
  },
  {
    // Linked hexes cover whole stretches of the map: a click opens the note and leaves the press to pan or select
    layer: 'hexLinks',
    press: ({ hexLinks }, at, c) => {
      const hexLinkId = c.tokenTool && primary(at) ? hexLinks?.hitTest(at.x, at.y) : null;
      if (!hexLinks || !hexLinkId) return null;
      hexLinks.press(hexLinkId, at.event);
      return 'through';
    },
    menu: ({ hexLinks }, at, c) => {
      const hexLinkId = c.tokenTool ? hexLinks?.hitTest(at.x, at.y) : null;
      return hexLinks && hexLinkId ? onRelease(true, (up) => hexLinks.openContextMenu(hexLinkId, up)) : null;
    },
    tap: ({ hexLinks }, at, c) => (c.tokenTool && hexLinks?.hitTest(at.x, at.y) ? true : null),
    hover: ({ hexLinks }, at, c, above) => {
      const hexLinkId = c.tokenTool && !above ? hexLinks?.hitTest(at.x, at.y) ?? null : null;
      hexLinks?.hover(hexLinkId, at.event);
      return covering(hexLinkId && 'pointer');
    },
  },
  {
    // Map features are the GM's, with the select and move tools. Their label shows a door badge's over a token or a
    // linked hex too, a feature's only where nothing covers it
    layer: 'mapFeatures',
    menu: ({ mapFeatures }, at, c) => {
      const featureId = c.tokenTool && c.gmView() ? mapFeatures?.hitTest(at.x, at.y) : null;
      return mapFeatures && featureId ? onRelease(true, (up) => mapFeatures.openContextMenu(featureId, up.clientX, up.clientY)) : null;
    },
    hover: ({ mapFeatures, doors }, at, c, above) => {
      if (!mapFeatures) return null;
      const labels = c.tokenTool && c.gmView();
      const doorId = labels ? doors?.menuHitTest(at.x, at.y) ?? null : null;
      const shown = above === null || ((above === 'tokens' || above === 'hexLinks') && doorId !== null);
      if (labels && shown) mapFeatures.hover({ x: at.x, y: at.y }, doorId, at.event);
      else mapFeatures.leave();
      return null;
    },
  },
  {
    // Fog covers whole stretches of the map too. Its menu is the GM's, with the tools that take tokens and with the fog tools
    layer: 'fog',
    menu: ({ fog }, at, c) => ((c.tokenTool || isFogTool(c.tool)) && c.gmView() && fog?.menuAt(at.x, at.y)
      ? onRelease(true, (up) => fog.openMenu(at.x, at.y, up.clientX, up.clientY))
      : null),
  },
  {
    // The move tool lets go of the selection on the empty map. Shift keeps it, and a finger there may be about to
    // pan: its tap clears it, as the empty marquee it ends
    layer: 'emptyMap',
    press: (_layers, at, c) => {
      if (c.tool === 'move' && primary(at) && !at.event.shiftKey && at.event.pointerType !== 'touch' && c.selectedIds().length > 0) c.clearSelection();
      return null;
    },
  },
];
