/** Where the players' list stands: down the right edge, or across the top or bottom one. */
export type PlayersListEdge = 'right' | 'top' | 'bottom';
const PLAYERS_LIST_EDGES: readonly PlayersListEdge[] = ['right', 'top', 'bottom'];

/**
 * How the initiative lists are laid out. `fromTurn` and the players' list's edges are the GM's choices, kept in
 * Atlas' settings and followed by the players' list; `collapsed` is this device's, since how much
 * room the tracker may take depends on the screen it is shown on. The GM's tracker always stands at the right edge:
 * the left one holds the dice log and the map's other controls.
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
  /** The GM's tracker shows only the turn and the next combatants. */
  collapsed: boolean;
}

/** Combatants a collapsed tracker shows: the one whose turn it is and the next two. */
export const COLLAPSED_CARDS = 3;

/** The two ways the GM lays the players' list out: a column down the right edge, or a row on each side of a table TV. */
export type PlayersListShape = 'vertical' | 'horizontal';

/** The layout of each shape: the horizontal one is a row at the top and one at the bottom, each read from its own side. */
export const PLAYERS_LIST_SHAPES: Readonly<Record<PlayersListShape, Pick<InitiativeLayout, 'edges' | 'facesPlayers'>>> = {
  vertical: { edges: ['right'], facesPlayers: false },
  horizontal: { edges: ['top', 'bottom'], facesPlayers: true },
};

/** The shape a layout reads as: a row wherever the list stands at the top or bottom. */
export function playersListShape({ edges }: Pick<InitiativeLayout, 'edges'>): PlayersListShape {
  return edges.some((edge) => edge !== 'right') ? 'horizontal' : 'vertical';
}

/** The stored edge of the players' list: the right one unless the settings name another (an older left edge reads as right). */
export function readListEdge(value: unknown): PlayersListEdge {
  return PLAYERS_LIST_EDGES.find((edge) => edge === value) ?? 'right';
}

/** The stored edges of the players' list, in order; where none are, `dock` alone. */
export function readListEdges(value: unknown, dock: PlayersListEdge): PlayersListEdge[] {
  const stored = Array.isArray(value) ? PLAYERS_LIST_EDGES.filter((edge) => value.includes(edge)) : [];
  return stored.length > 0 ? stored : [dock];
}

/** The layout before any choice: the turn on top, at the right edge, expanded. */
export const DEFAULT_INITIATIVE_LAYOUT: InitiativeLayout = { fromTurn: true, dock: 'right', edges: ['right'], facesPlayers: false, collapsed: false };
