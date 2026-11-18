/**
 * The switches of the tools' menus that say what a key held during a press says on a desktop:
 * where a point lands (Snap), whether a shape keeps even sides (Constrain), whether a pin goes to
 * its cell. A finger has no key to hold, so each key has its switch; the key still works and turns
 * its switch around for as long as it is held (`snapOverride`). Per view, never saved.
 */

export type ToolSwitchId =
  /** Tokens: a dropped token lands on the grid, the turn handles step. */
  | 'selectSnap'
  /** Walls, zone corners and openings land on wall ends; a light's ranges and beam move in whole steps. Alt. */
  | 'lightingSnap'
  /** A room's corners land on the grid. Shift. */
  | 'roomSnap'
  /** A note pin goes to its cell: the hex it links on a hex grid, the square's centre on a square grid. Shift. */
  | 'pinCell'
  /** Stairs' corners land on wall ends. Alt. */
  | 'stairsSnap'
  /** Drawings land on the grid. Alt. */
  | 'drawSnap'
  /** Drawn shapes keep even sides, lines eighths of a turn. Shift. */
  | 'drawConstrain'
  /** Measurements land on the grid. Alt. */
  | 'measureSnap'
  /** Fog shapes land on the grid and on walls. Ctrl or Cmd. */
  | 'fogSnap'
  /** Fog rectangles are squares, a polygon's edges eighths of a turn. Shift. */
  | 'fogConstrain';

export type ToolSwitches = Readonly<Record<ToolSwitchId, boolean>>;

/** Each switch as a press without its key behaves on a desktop. */
export const DEFAULT_TOOL_SWITCHES: ToolSwitches = {
  selectSnap: true,
  lightingSnap: true,
  roomSnap: false,
  pinCell: false,
  stairsSnap: true,
  drawSnap: true,
  drawConstrain: false,
  measureSnap: true,
  fogSnap: true,
  fogConstrain: false,
};

/** A state that may hold the switches; one that holds none (a test's, an older caller's) reads as the defaults. */
export interface ToolSwitchState {
  readonly toolSwitches?: Partial<ToolSwitches> | undefined;
}

/** What a switch says now: as it is set, turned around while its key is held. */
export function snapOverride(on: boolean, held: boolean | undefined): boolean {
  return on !== (held === true);
}

/** The switch `id` as `state` holds it. */
export function toolSwitch(state: ToolSwitchState, id: ToolSwitchId): boolean {
  return state.toolSwitches?.[id] ?? DEFAULT_TOOL_SWITCHES[id];
}

/** Whether the switch `id` applies to a press during which its key is `held`. */
export function switchApplies(state: ToolSwitchState, id: ToolSwitchId, held: boolean | undefined): boolean {
  return snapOverride(toolSwitch(state, id), held);
}

/** Whether a press places freely: the Snap switch `id` is off, or its key turns it off for this press. */
export function placesFreely(state: ToolSwitchState, id: ToolSwitchId, held: boolean | undefined): boolean {
  return !switchApplies(state, id, held);
}
