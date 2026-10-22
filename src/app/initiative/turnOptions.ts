/**
 * The GM's choices for what a turn change does, kept in Atlas' settings (`data.json`) and so the
 * same on every device: a banner names the turn (on unless switched off), the GM's view follows
 * the turn (off unless switched on), and online players move their tokens only on their turn
 * (off unless switched on).
 */
export interface InitiativeTurnOptions {
  banner: boolean;
  followTurn: boolean;
  movesOnTurn: boolean;
}

/** The options before any choice. */
export const DEFAULT_TURN_OPTIONS: InitiativeTurnOptions = { banner: true, followTurn: false, movesOnTurn: false };
