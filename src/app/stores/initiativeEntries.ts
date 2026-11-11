import type { TokenEntity } from '../types';
import type { InitiativeEntry } from '../types/initiativeTypes';
import { t } from '../i18n';
import { sideOf } from '../initiative/sides';
import { ENEMY_COLOR } from '../initiative/tokenlessEnemies';

/** An entry before the store gives it an id and a place in the order. */
export type NewInitiativeEntry = Omit<InitiativeEntry, 'id' | 'order' | 'isActive'>;

/** Whether a token fights against the players: its own side where it names one, else no vision of its own (`sideOf`). */
function opposesPlayers(token: TokenEntity): boolean {
  return sideOf(token, token.side ? [token.side] : undefined) === 'opponents';
}

/** The entry of `token`. It holds no resources: the tracker reads those from the token itself. */
export function initiativeEntryForToken(token: TokenEntity): NewInitiativeEntry {
  const character = token.kind === 'character' ? token : null;
  return {
    tokenId: token.id,
    name: character ? character.name : t('initiative.token'),
    initiative: 0,
    awaitingInitiative: true,
    initiativeModifier: 0,
    imagePath: token.imagePath,
    isNPC: true,
    ...(character?.statblockPath ? { statblockPath: character.statblockPath } : {}),
    // An opponent starts in the enemies' red, as one added by name does; the card menu changes or clears it
    ...(opposesPlayers(token) ? { color: ENEMY_COLOR } : {}),
  };
}
