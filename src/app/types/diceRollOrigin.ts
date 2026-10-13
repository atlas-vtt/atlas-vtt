/**
 * The map view, the scene it held and the tokens a statblock was opened for, taken
 * together when the statblock opened. It lives only as long as the open statblock and is
 * never saved with a token, an initiative entry or a roll.
 */
export interface TokenRollContext {
  readonly viewId: string;
  readonly mapPath: string;
  readonly tokenIds: readonly string[];
}

/**
 * The token a roll was made for, with the view and scene it stood in. It travels with
 * the roll's event only; a roll repeated from the log has none.
 */
export interface DiceRollOrigin {
  readonly viewId: string;
  readonly mapPath: string;
  readonly tokenId: string;
}
