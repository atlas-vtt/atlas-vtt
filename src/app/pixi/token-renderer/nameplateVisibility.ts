import type { BaseToken } from '../../types';

/**
 * A nameplate shows when the map shows every nameplate or the token opts in
 * on its own. `showNameplate` is the token's saved preference and only the
 * user changes it, so it survives reloads, statblock links and collection
 * export/import.
 */
export function isNameplateVisible(token: Pick<BaseToken, 'showNameplate'>, mapShowsNameplates: boolean): boolean {
  return mapShowsNameplates || token.showNameplate === true;
}

/**
 * Players see a token's name only while the player view's Show nameplates is on, and then only where
 * the GM's map shows it (`isNameplateVisible`): the switch never names a token the GM keeps unnamed.
 */
export function nameplateShownToPlayers(token: Pick<BaseToken, 'showNameplate'>, mapShowsNameplates: boolean, playersSeeNameplates: boolean): boolean {
  return playersSeeNameplates && isNameplateVisible(token, mapShowsNameplates);
}
