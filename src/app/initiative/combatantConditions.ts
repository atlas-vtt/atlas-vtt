import type { TokenEntity } from '../types';
import type { ConditionDefinition } from '../types/collectionSettingsTypes';
import type { InitiativeEntry, InitiativeState } from '../types/initiativeTypes';
import { combatantConditions, resolveActiveConditions, type ActiveCondition } from '../utils/activeConditions';
import { removeCondition, setConditionValue, type TokenConditionState } from '../utils/conditionValues';
import type { CountedDown } from '../types/initiativeTypes';
import { entryToken } from './party';
import { currentTurn, turnEntries, turnKey } from './turnHolders';
import { t } from '../i18n';

/**
 * Conditions the GM gives a combatant from the tracker. A combatant with a token keeps them on its token, as the
 * map's menu gives them, so the map shows them too; a player at the table or an enemy added by name keeps them on its
 * entry. Either may last a number of the combatant's own turns (`InitiativeEntry.conditionTurns`), counted down as a
 * turn it held ends; at 0 the condition ends.
 */

interface FightDraft {
  initiative: InitiativeState;
  objects: { tokens: Record<string, TokenEntity> };
}

/** A condition with how many of the combatant's turns it still lasts, where it lasts a number of them. */
export type CombatantCondition = ActiveCondition & { turns?: number };

/** "Poisoned, 2 turns left" for a condition that lasts a number of turns, its name otherwise. */
export function turnsLabel(condition: CombatantCondition): string {
  return condition.turns === undefined ? condition.name : t('initiative.conditionTurnsLeft', { name: condition.name, count: condition.turns });
}

/** What holds a combatant's conditions: its token, else its entry. */
export function conditionHolder(entry: InitiativeEntry, tokens: Record<string, TokenEntity>): TokenConditionState {
  return (entry.tokenId === undefined ? undefined : entryToken(tokens, entry)) ?? entry;
}

/** The conditions a combatant's card shows, in the order it gained them, each with the turns it still lasts. */
export function entryConditions(
  entry: Pick<InitiativeEntry, 'tokenId' | 'conditions' | 'conditionValues' | 'conditionTurns'>,
  token: TokenEntity | undefined,
  definitions: readonly ConditionDefinition[],
): CombatantCondition[] {
  const active = token ? combatantConditions(token, definitions) : entry.tokenId === undefined ? resolveActiveConditions(entry, definitions) : [];
  return active.map((condition) => {
    const turns = entry.conditionTurns?.[condition.id];
    return turns === undefined ? condition : { ...condition, turns };
  });
}

function withoutTurns(entry: InitiativeEntry, conditionId: string): void {
  if (!entry.conditionTurns || !(conditionId in entry.conditionTurns)) return;
  const { [conditionId]: _gone, ...rest } = entry.conditionTurns;
  if (Object.keys(rest).length > 0) entry.conditionTurns = rest;
  else delete entry.conditionTurns;
}

/** Gives a combatant a condition or takes it away; taken away, it no longer counts turns. */
export function setCombatantCondition(draft: FightDraft, entryId: string, conditionId: string, on: boolean): void {
  const entry = draft.initiative.entries.find((candidate) => candidate.id === entryId);
  if (!entry) return;
  const holder = conditionHolder(entry, draft.objects.tokens);
  if (on) {
    if (!holder.conditions?.includes(conditionId)) setConditionValue(holder, conditionId, 1, false);
    return;
  }
  removeCondition(holder, conditionId);
  withoutTurns(entry, conditionId);
}

/** How many turns a condition lasts: a number gives the combatant the condition too, null makes it last until taken away. */
export function setCombatantConditionTurns(draft: FightDraft, entryId: string, conditionId: string, turns: number | null): void {
  const entry = draft.initiative.entries.find((candidate) => candidate.id === entryId);
  if (!entry) return;
  if (turns === null || turns <= 0) {
    withoutTurns(entry, conditionId);
    return;
  }
  setCombatantCondition(draft, entryId, conditionId, true);
  entry.conditionTurns = { ...entry.conditionTurns, [conditionId]: Math.round(turns) };
}

/** Takes every combatant's conditions away (Reset initiative): its token's, or its entry's, and the turns they had left. */
export function clearCombatantConditions(draft: FightDraft): void {
  for (const entry of draft.initiative.entries) {
    const holder = conditionHolder(entry, draft.objects.tokens);
    for (const conditionId of [...(holder.conditions ?? [])]) removeCondition(holder, conditionId);
    delete entry.conditionTurns;
  }
  delete draft.initiative.conditionCountdowns;
}

/**
 * Counts one turn off the conditions of `entryIds`, whose turn `turn` (its `turnKey`) has ended; those that reach 0
 * end. What it counted is kept under the turn, for `countBackConditions`.
 */
export function countDownConditions(draft: FightDraft, entryIds: readonly string[], turn: string | null): void {
  const counted: CountedDown[] = [];
  for (const entry of draft.initiative.entries) {
    if (!entry.conditionTurns || !entryIds.includes(entry.id)) continue;
    const holder = conditionHolder(entry, draft.objects.tokens);
    for (const [conditionId, turns] of Object.entries(entry.conditionTurns)) {
      // Taken away elsewhere (the map's menu): nothing is left to count, nor to give back
      if (!holder.conditions?.includes(conditionId)) {
        withoutTurns(entry, conditionId);
      } else if (turns <= 1) {
        const value = holder.conditionValues?.[conditionId];
        removeCondition(holder, conditionId);
        withoutTurns(entry, conditionId);
        counted.push({ entryId: entry.id, conditionId, ended: value === undefined ? {} : { value } });
      } else {
        entry.conditionTurns = { ...entry.conditionTurns, [conditionId]: turns - 1 };
        counted.push({ entryId: entry.id, conditionId });
      }
    }
  }
  if (turn !== null && counted.length > 0) draft.initiative.conditionCountdowns = { ...draft.initiative.conditionCountdowns, [turn]: counted };
}

/**
 * Gives back what the end of `turn` counted off (`countDownConditions`), as the turn comes back with a step back: a
 * turn back onto each count, and a condition that ended with it back with one turn left. A condition taken away since
 * stays away, and one given again since keeps what it was given.
 */
export function countBackConditions(draft: FightDraft, turn: string | null): void {
  const countdowns = draft.initiative.conditionCountdowns;
  const counted = turn === null ? undefined : countdowns?.[turn];
  if (!countdowns || turn === null || !counted) return;
  for (const { entryId, conditionId, ended } of counted) {
    const entry = draft.initiative.entries.find((candidate) => candidate.id === entryId);
    if (!entry) continue;
    const holder = conditionHolder(entry, draft.objects.tokens);
    if (ended) {
      if (holder.conditions?.includes(conditionId)) continue;
      setConditionValue(holder, conditionId, ended.value ?? 1, ended.value !== undefined);
      entry.conditionTurns = { ...entry.conditionTurns, [conditionId]: 1 };
      continue;
    }
    const turns = entry.conditionTurns?.[conditionId];
    if (turns !== undefined && holder.conditions?.includes(conditionId)) entry.conditionTurns = { ...entry.conditionTurns, [conditionId]: turns + 1 };
  }
  const { [turn]: _given, ...rest } = countdowns;
  if (Object.keys(rest).length > 0) draft.initiative.conditionCountdowns = rest;
  else delete draft.initiative.conditionCountdowns;
}

/** Who holds the turn now, as `countDownConditions` reads it after the turn moved on. */
export function turnHoldersNow(draft: FightDraft): { key: string | null; ids: string[] } {
  const turn = currentTurn(draft.initiative);
  return { key: turn ? turnKey(turn) : null, ids: turnEntries(turn, draft.initiative, draft.objects.tokens).map((entry) => entry.id) };
}
