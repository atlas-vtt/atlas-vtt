import type { CollectionSettings } from '../types/collectionSettingsTypes';
import type { InitiativeEntry } from '../types/initiativeTypes';
import { t } from '../i18n';

/** The colour an enemy added by name starts with: the palette's red (`RESOURCE_COLORS`), which the card menu changes or takes away. */
export const ENEMY_COLOR = '#dc2626';

/** A new entry for `addToInitiative`. */
type NewEntry = Omit<InitiativeEntry, 'id' | 'order' | 'isActive'>;

/**
 * Whether `entry` is an enemy the GM added by name alone: no token on the map and no party
 * member. Like a player at the table it has no token; it fights on the opponents' side (`sideOf`
 * without a token), the GM rolls or types its number, and players always see it.
 */
export function isTokenlessEnemy(entry: Pick<InitiativeEntry, 'tokenId' | 'partyMemberId'>): boolean {
  return entry.tokenId === undefined && entry.partyMemberId === undefined;
}

/** The picture the collection gives enemies added by name; empty for none. */
export function collectionEnemyImage(settings: Pick<CollectionSettings, 'enemyImagePath'> | null | undefined): string {
  const image: unknown = settings?.enemyImagePath;
  return typeof image === 'string' ? image : '';
}

/** An enemy without a token, named "Enemy 1", "Enemy 2", … with the first number no entry is named by yet, in red, with the picture the GM set up (`collectionEnemyImage`). */
export function nextTokenlessEnemy(entries: readonly Pick<InitiativeEntry, 'name'>[], imagePath = ''): NewEntry {
  const taken = new Set(entries.map((entry) => entry.name));
  let number = 1;
  while (taken.has(t('initiative.enemyName', { number }))) number++;
  return { name: t('initiative.enemyName', { number }), color: ENEMY_COLOR, imagePath, initiative: 0, awaitingInitiative: true, initiativeModifier: 0, isNPC: true };
}
