/**
 * What a dice set does, said in a few short facts for a picker's row: its
 * roll with the names of its dice, when it is critical, which dice explode
 * and what advantage does. Only what tells sets apart; the lab says the rest.
 */

import { groupNotation } from '../../../../gameSystems/diceSets';
import { highFaceNames } from '../../../../gameSystems/explodeRuleText';
import type { AdvantageRule, AdvantageSide, DiceSetDie, RollingDice } from '../../../../types/diceSetTypes';
import { t } from '../../../../i18n';

/** The set's dice as a roll, each named group with its name: `Sun d12 + Moon d12`, `2d10`. */
export function namedRollText(dice: readonly DiceSetDie[]): string {
  return dice.map((group) => (group.name ? `${group.name} ${groupNotation(group)}` : groupNotation(group))).join(' + ');
}

/** The sides every die of the set has, or null where they differ. */
function sharedSides(dice: readonly DiceSetDie[]): number | null {
  const [first] = dice;
  return first && dice.every((group) => group.sides === first.sides) ? first.sides : null;
}

/** When a roll of the set is critical: `crits on a natural 20`, `crits on doubles`, `crits on 19–20`. */
export function critFact(set: RollingDice): string {
  switch (set.crit) {
    case 'natural': {
      const sides = sharedSides(set.dice);
      return sides === null ? t('diceLab.factCritHighest') : t('diceLab.factCritNatural', { face: sides });
    }
    case 'roll-under':
      return t('diceLab.factCritRollUnder');
    case 'doubles':
      return t('diceLab.factCritDoubles');
    case 'high-total': {
      const most = set.dice.reduce((sum, group) => sum + group.count * group.sides, 0);
      return t('diceLab.factCritHighTotal', { low: most - 1, high: most });
    }
    case 'none':
      return t('diceLab.factCritNone');
  }
}

/** Which dice explode, where any do: `explodes on 10`, `every die explodes`. */
export function explodeFact(set: RollingDice): string | null {
  const rule = set.explode;
  if (!rule) return null;
  const sides = sharedSides(set.dice);
  if (rule.dice === 'all' || sides === null) return t('diceLab.factExplodeAll');
  return t('diceLab.factExplode', { faces: highFaceNames(sides, rule.highFaces) });
}

/** What one side's rule does, as short as a row can hold: `advantage keeps the best`, `advantage +d6`, `advantage +2`. */
function sideFact(side: AdvantageSide, rule: AdvantageRule): string {
  const advantage = side === 'advantage';
  switch (rule.kind) {
    case 'keep':
      if (rule.tensOnly) return advantage ? t('diceLab.factAdvantageTens') : t('diceLab.factDisadvantageTens');
      return advantage ? t('diceLab.factAdvantageKeep') : t('diceLab.factDisadvantageKeep');
    case 'die': {
      const die = rule.name ? `${rule.name} d${rule.sides}` : `d${rule.sides}`;
      return advantage ? t('diceLab.factAdvantageAdds', { what: die }) : t('diceLab.factDisadvantageTakes', { what: die });
    }
    case 'number':
      return advantage
        ? t('diceLab.factAdvantageAdds', { what: String(rule.value) })
        : t('diceLab.factDisadvantageTakes', { what: String(rule.value) });
  }
}

/** What advantage does, else disadvantage where only that side is set; null where the set rolls as any other. */
export function advantageFact(set: RollingDice): string | null {
  if (set.advantage) return sideFact('advantage', set.advantage);
  return set.disadvantage ? sideFact('disadvantage', set.disadvantage) : null;
}

/** Whether a set's name already says its roll: `d20 roll-under` says `d20`. */
function namesRoll(name: string, roll: string): boolean {
  // As whole words: `d100 roll-under` does not say `d10`.
  const words = (text: string): string => ` ${text.toLowerCase().replace(/\s+/g, ' ')} `;
  return words(name).includes(words(roll));
}

/**
 * The facts of a set for its row, in order: its roll where its name does not
 * say it, when it is critical, which dice explode, and what advantage does.
 */
export function diceSetFacts(set: RollingDice & { name: string }): string[] {
  const roll = namedRollText(set.dice);
  return [namesRoll(set.name, roll) ? null : roll, critFact(set), explodeFact(set), advantageFact(set)]
    .filter((fact): fact is string => fact !== null);
}
