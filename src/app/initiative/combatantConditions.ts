import type { TokenEntity } from '../types';
import type { ConditionDefinition } from '../types/collectionSettingsTypes';
import type { InitiativeEntry, InitiativeState } from '../types/initiativeTypes';
import { combatantConditions, resolveActiveConditions, type ActiveCondition } from '../utils/activeConditions';
import { removeCondition, setConditionValue, type TokenConditionState } from '../utils/conditionValues';
import { entryToken } from './party';
import { isOffMap } from '../tokens/offMap';

/**
 * Conditions the GM gives a combatant from the tracker. A combatant with a token keeps them on its token, as the
 * map's menu gives them, so the map shows them too; a player at the table or an enemy added by name keeps them on its
 * entry. They last until taken away.
 */

interface FightDraft {
  initiative: InitiativeState;
  objects: { tokens: Record<string, TokenEntity> };
}

/** What holds a combatant's conditions: its token, else its entry. */
export function conditionHolder(entry: InitiativeEntry, tokens: Record<string, TokenEntity>): TokenConditionState {
  return (entry.tokenId === undefined ? undefined : entryToken(tokens, entry)) ?? entry;
}

/** The conditions a combatant's card shows, in the order it gained them. */
export function entryConditions(
  entry: Pick<InitiativeEntry, 'tokenId' | 'conditions' | 'conditionValues'>,
  token: TokenEntity | undefined,
  definitions: readonly ConditionDefinition[],
): ActiveCondition[] {
  return token ? combatantConditions(token, definitions) : entry.tokenId === undefined ? resolveActiveConditions(entry, definitions) : [];
}

/** The most condition badges a card shows; past them the rest are a count. */
export const SHOWN_CARD_CONDITIONS = 3;

/**
 * Whether a combatant's card shows its conditions. Its token's badges show them on the map, so a card shows them only
 * where no token on the map does (a player at the table, an enemy added by name, a token kept beside the map) and,
 * while players see the TV at true scale (TrueScale), on every card: miniatures stand on the glass and cover the badges.
 */
export function cardShowsConditions(tokenOnMap: boolean, trueScale: boolean): boolean {
  return trueScale || !tokenOnMap;
}

/** The conditions a combatant's card in the GM's tracker shows (`cardShowsConditions`), else none. */
export function cardConditions(
  entry: Pick<InitiativeEntry, 'tokenId' | 'conditions' | 'conditionValues'>,
  token: TokenEntity | undefined,
  definitions: readonly ConditionDefinition[],
  trueScale: boolean,
): ActiveCondition[] {
  return cardShowsConditions(token !== undefined && !isOffMap(token), trueScale) ? entryConditions(entry, token, definitions) : [];
}

/** Gives a combatant a condition or takes it away. */
export function setCombatantCondition(draft: FightDraft, entryId: string, conditionId: string, on: boolean): void {
  const entry = draft.initiative.entries.find((candidate) => candidate.id === entryId);
  if (!entry) return;
  const holder = conditionHolder(entry, draft.objects.tokens);
  if (on) {
    if (!holder.conditions?.includes(conditionId)) setConditionValue(holder, conditionId, 1, false);
    return;
  }
  removeCondition(holder, conditionId);
}

/** Takes every combatant's conditions away (Reset initiative): its token's, or its entry's. */
export function clearCombatantConditions(draft: FightDraft): void {
  for (const entry of draft.initiative.entries) {
    const holder = conditionHolder(entry, draft.objects.tokens);
    for (const conditionId of [...(holder.conditions ?? [])]) removeCondition(holder, conditionId);
  }
}
