/**
 * What tokens have moved in the running turn of a fight, for rules that count movement per turn.
 * Each token's distance carries the turn it was moved in, so nothing has to be reset: once the
 * turn is another one, or the fight is over, a distance no longer counts.
 */

/** How far one token has moved, and in which turn. */
export interface TurnMove {
  /** The turn the distance was moved in: whatever tells one turn from every other, and one fight from the next. */
  readonly turn: string;
  /** Game units, added up over the turn's moves. */
  readonly distance: number;
}

/** What each token has moved, by token id. */
export type TurnMoves = Readonly<Record<string, TurnMove>>;

/**
 * A token's entry after it moved `distance` more in the turn `turn`: added to what it moved in
 * that turn already, or begun anew where its entry is another turn's. Null where nothing is
 * counted: outside a fight (`turn` is null), or for a distance that is no number above 0.
 */
export function turnMoveAfter(entry: TurnMove | undefined, turn: string | null, distance: number): TurnMove | null {
  if (turn === null || !(distance > 0) || !Number.isFinite(distance)) return null;
  return { turn, distance: (entry?.turn === turn ? entry.distance : 0) + distance };
}

/**
 * `moves` after each of `tokenIds` moved `distance` more in the turn `turn`. The same object
 * where nothing is counted; every other token's entry stays the object it was.
 */
export function withTurnMoves(moves: TurnMoves, turn: string | null, tokenIds: readonly string[], distance: number): TurnMoves {
  let next: Record<string, TurnMove> | null = null;
  for (const id of tokenIds) {
    const entry = turnMoveAfter((next ?? moves)[id], turn, distance);
    if (!entry) continue;
    next ??= { ...moves };
    next[id] = entry;
  }
  return next ?? moves;
}

/** How far `tokenId` has moved in the turn `turn`, game units: 0 outside a fight, and for an entry of another turn. */
export function movedInTurn(moves: TurnMoves | undefined, turn: string | null, tokenId: string): number {
  const entry = turn === null ? undefined : moves?.[tokenId];
  return entry !== undefined && entry.turn === turn && entry.distance > 0 && Number.isFinite(entry.distance) ? entry.distance : 0;
}
