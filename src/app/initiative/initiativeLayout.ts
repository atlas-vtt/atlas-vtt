/** The edge of the map the initiative lists stand at. */
export type InitiativeDock = 'left' | 'right';

/** Where the players' list stands: down the left or right edge, or across the top or bottom one. */
export type PlayersListEdge = InitiativeDock | 'top' | 'bottom';
export const PLAYERS_LIST_EDGES: readonly PlayersListEdge[] = ['left', 'right', 'top', 'bottom'];

/**
 * How the initiative lists are laid out. `fromTurn` and `dock` are the GM's choices, kept in
 * Atlas' settings and followed by the players' list; `collapsed` is this device's, since how much
 * room the tracker may take depends on the screen it is shown on.
 */
export interface InitiativeLayout {
  /** During a fight the lists start at the combatant whose turn it is and run on into the next round. */
  fromTurn: boolean;
  /** The edge the players' list stands at; across the top or bottom one it runs as a row. The first of `edges`. */
  dock: PlayersListEdge;
  /** Every edge the players' list stands at: one copy at each, for players around a table TV. Never empty. */
  edges: readonly PlayersListEdge[];
  /** Each copy turns to face the players at its edge: it runs as a row, read from that edge. */
  facesPlayers: boolean;
  /** The edge the GM's tracker stands at: the players' list's unless the GM chose another. */
  gmDock: InitiativeDock;
  /** The GM's tracker shows only the turn and the next combatants. */
  collapsed: boolean;
}

/** Combatants a collapsed tracker shows: the one whose turn it is and the next two. */
export const COLLAPSED_CARDS = 3;

/** The stored dock: the right edge unless the settings say `left`. */
export function readDock(value: unknown): InitiativeDock {
  return value === 'left' ? 'left' : 'right';
}

/** The stored edge of the players' list: the right one unless the settings name another. */
export function readListEdge(value: unknown): PlayersListEdge {
  return PLAYERS_LIST_EDGES.find((edge) => edge === value) ?? 'right';
}

/** The stored edges of the players' list, in the menu's order; where none are, `dock` alone. */
export function readListEdges(value: unknown, dock: PlayersListEdge): PlayersListEdge[] {
  const stored = Array.isArray(value) ? PLAYERS_LIST_EDGES.filter((edge) => value.includes(edge)) : [];
  return stored.length > 0 ? stored : [dock];
}

/** The edges after the GM switched one: an edge on or off, never the last one off. */
export function toggledEdge(edges: readonly PlayersListEdge[], edge: PlayersListEdge): PlayersListEdge[] {
  const next = edges.includes(edge) ? edges.filter((one) => one !== edge) : [...edges, edge];
  return next.length === 0 ? [...edges] : PLAYERS_LIST_EDGES.filter((one) => next.includes(one));
}

/** The layout before any choice: the turn on top, at the right edge, expanded. */
export const DEFAULT_INITIATIVE_LAYOUT: InitiativeLayout = { fromTurn: true, dock: 'right', edges: ['right'], facesPlayers: false, gmDock: 'right', collapsed: false };
