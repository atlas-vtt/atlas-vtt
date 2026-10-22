/** The edge of the map the initiative lists stand at. */
export type InitiativeDock = 'left' | 'right';

/**
 * How the initiative lists are laid out. `fromTurn` and `dock` are the GM's choices, kept in
 * Atlas' settings and followed by the players' list; `collapsed` is this device's, since how much
 * room the tracker may take depends on the screen it is shown on.
 */
export interface InitiativeLayout {
  /** During a fight the lists start at the combatant whose turn it is and run on into the next round. */
  fromTurn: boolean;
  dock: InitiativeDock;
  /** The GM's tracker shows only the turn and the next combatants. */
  collapsed: boolean;
}

/** Combatants a collapsed tracker shows: the one whose turn it is and the next two. */
export const COLLAPSED_CARDS = 3;

/** The stored dock: the right edge unless the settings say `left`. */
export function readDock(value: unknown): InitiativeDock {
  return value === 'left' ? 'left' : 'right';
}

/** The layout before any choice: the turn on top, at the right edge, expanded. */
export const DEFAULT_INITIATIVE_LAYOUT: InitiativeLayout = { fromTurn: true, dock: 'right', collapsed: false };
