/**
 * Where the players' list stands: down the right edge, across the top or bottom one, or down the left edge, turned
 * around, as the right column's mirror for the far side of the table.
 */
export type PlayersListEdge = 'right' | 'left' | 'top' | 'bottom';
const PLAYERS_LIST_EDGES: readonly PlayersListEdge[] = ['right', 'left', 'top', 'bottom'];

/**
 * How the initiative lists are laid out. The players' list's edges are the GM's choice (What players see), kept in
 * Atlas' settings and followed by the players' list. The GM's tracker always stands at the right edge:
 * the left one holds the dice log and the map's other controls.
 */
export interface InitiativeLayout {
  /** During a fight the lists start at the combatant whose turn it is and run on into the next round: always, no longer a choice. */
  fromTurn: boolean;
  /** The edge the players' list stands at; across the top or bottom one it runs as a row. The first of `edges`. */
  dock: PlayersListEdge;
  /** Every edge the players' list stands at: one copy at each, for players around a table TV. Never empty. */
  edges: readonly PlayersListEdge[];
  /** Each copy turns to face the players at its edge: it runs as a row, read from that edge. */
  facesPlayers: boolean;
}

/** The two ways the GM lays the players' list out (Horizontal initiative): a column down the side, or a row across. */
export type PlayersListShape = 'vertical' | 'horizontal';

/**
 * The layout of a shape (Horizontal initiative), alone or mirrored for the far side of the table (Mirrored
 * initiative): a column at the right edge, mirrored by one at the left turned around; a row at the bottom, mirrored by
 * one at the top, each row read from its own side.
 */
export function playersListLayout(shape: PlayersListShape, mirrored: boolean): Pick<InitiativeLayout, 'edges' | 'facesPlayers'> {
  if (shape === 'horizontal') return { edges: mirrored ? ['top', 'bottom'] : ['bottom'], facesPlayers: true };
  return { edges: mirrored ? ['right', 'left'] : ['right'], facesPlayers: false };
}

/** The shape a layout reads as: a row wherever the list stands at the top or bottom. */
export function playersListShape({ edges }: Pick<InitiativeLayout, 'edges'>): PlayersListShape {
  return edges.some((edge) => edge === 'top' || edge === 'bottom') ? 'horizontal' : 'vertical';
}

/** Whether a layout has a copy of the list for the far side of the table too. */
export function playersListMirrored({ edges }: Pick<InitiativeLayout, 'edges'>): boolean {
  return edges.length > 1;
}

/**
 * The stored edge of the players' list: the right one unless the settings name another. A left edge alone (an older
 * version's tracker on the left) reads as right: the left column is only ever the right one's mirror.
 */
export function readListEdge(value: unknown): PlayersListEdge {
  return PLAYERS_LIST_EDGES.find((edge) => edge === value && edge !== 'left') ?? 'right';
}

/** The stored edges of the players' list, in order; where none are, `dock` alone. The left edge counts only beside the right. */
export function readListEdges(value: unknown, dock: PlayersListEdge): PlayersListEdge[] {
  const named = Array.isArray(value) ? PLAYERS_LIST_EDGES.filter((edge) => value.includes(edge)) : [];
  const stored = named.includes('right') ? named : named.filter((edge) => edge !== 'left');
  return stored.length > 0 ? stored : [dock];
}

/** The layout before any choice: the turn on top, at the right edge. */
export const DEFAULT_INITIATIVE_LAYOUT: InitiativeLayout = { fromTurn: true, dock: 'right', edges: ['right'], facesPlayers: false };
