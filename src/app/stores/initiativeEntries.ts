import type { TokenEntity } from '../types';
import type { InitiativeEntry } from '../types/initiativeTypes';
import { t } from '../i18n';

/** An entry before the store gives it an id and a place in the order. */
export type NewInitiativeEntry = Omit<InitiativeEntry, 'id' | 'order' | 'isActive'>;

/** The entry of `token`. It holds no resources: the tracker reads those from the token itself. */
export function initiativeEntryForToken(token: TokenEntity): NewInitiativeEntry {
  const character = token.kind === 'character' ? token : null;
  return {
    tokenId: token.id,
    name: character ? character.name : t('initiative.token'),
    initiative: 0,
    initiativeModifier: 0,
    imagePath: token.imagePath,
    isNPC: true,
    ...(character?.statblockPath ? { statblockPath: character.statblockPath } : {}),
  };
}
