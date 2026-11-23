import type { TokenEntity } from '../types';
import type { ConditionDefinition } from '../types/collectionSettingsTypes';
import type { InitiativeEntry, InitiativeState } from '../types/initiativeTypes';
import { combatantConditions, resolveActiveConditions, type ActiveCondition } from '../utils/activeConditions';
import { removeCondition, setConditionValue, type TokenConditionState } from '../utils/conditionValues';
import { entryToken } from './party';

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
