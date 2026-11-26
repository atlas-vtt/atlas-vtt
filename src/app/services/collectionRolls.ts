import type { App } from 'obsidian';
import { diceSetOfCollection } from './diceSets/collectionDiceSets';
import { offlineDiceInputs } from './offlineDiceInputs';
import type { OffMapRolls } from './statblockRolls';
import { rollingRules } from '../gameSystems/diceSets';
import { rollDiceFormula, rollingWith } from '../tools/DiceTool';

/** What rolls while no map is open: a roll and the dice it is made with. */
export type CollectionRolls = Required<Pick<OffMapRolls, 'roll' | 'rollingDice'>>;

/**
 * Rolls made while no map is open, by the dice set of the collection `collectionId` names at each roll
 * (or a statblock template's set, where a roll asks for one), with this device's randomness.
 */
export function collectionRolls(app: App, collectionId: () => string | null): CollectionRolls {
  const collection = (): ReturnType<typeof diceSetOfCollection> => diceSetOfCollection(app, collectionId());
  return {
    roll: (formula, source, options) => {
      const { rules, shown } = rollingWith(collection(), options?.set);
      const result = rollDiceFormula(formula, rules, offlineDiceInputs(), shown, options?.advantage);
      return result && { ...result, source };
    },
    rollingDice: (set) => rollingRules(rollingWith(collection(), set).rules),
  };
}
