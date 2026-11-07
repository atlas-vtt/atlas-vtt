/**
 * An exploding rule in words, for the settings. A rule counts faces from the
 * top and the bottom of a die, which nobody thinks in: people think "a 10
 * rolls again". So the settings say what the rule does to a die they know.
 */

import { t } from '../i18n';
import { explodingFaces } from '../tools/diceExplosion';
import type { ExplodeRule } from '../types/diceRulesTypes';

/** A run of faces as it is spoken: `10`, `9 or 10`, `96 to 100`; nothing for none. */
function faceRun(first: number, last: number): string {
  if (last < first) return '';
  if (last === first) return String(last);
  const run = { first: String(first), last: String(last) };
  return last === first + 1 ? t('diceSettings.faces.pair', run) : t('diceSettings.faces.run', run);
}

/** The faces of a die of `sides` that explode when its `highFaces` highest do. */
export function highFaceNames(sides: number, highFaces: number): string {
  const { high } = explodingFaces(sides, highFaces, 0);
  return faceRun(sides - high + 1, sides);
}

/** The faces of a die of `sides` that roll again and subtract; `highFaces` are taken first. */
export function lowFaceNames(sides: number, lowFaces: number, highFaces: number): string {
  return faceRun(1, explodingFaces(sides, highFaces, lowFaces).low);
}

/** A second die to show beside the default die that "every die" means more than one size. */
function otherDie(sides: number): number {
  return sides === 6 ? 20 : 6;
}

/** What the rule does, said with a die of `sides`: the die of the collection's default roll. */
export function describeExplodeRule(rule: ExplodeRule, sides: number): string {
  const { highFaces, lowFaces } = rule;
  const sentences: string[] = [];

  if (rule.dice === 'default') {
    sentences.push(t('diceSettings.rule.defaultHigh', { sides: String(sides), faces: highFaceNames(sides, highFaces) }));
    const low = lowFaceNames(sides, lowFaces, highFaces);
    if (low) sentences.push(t('diceSettings.rule.low', { faces: low }));
  } else {
    const other = otherDie(sides);
    const dice = {
      sides: String(sides), faces: highFaceNames(sides, highFaces),
      other: String(other), otherFaces: highFaceNames(other, highFaces),
    };
    sentences.push(highFaces === 1
      ? t('diceSettings.rule.allHighest', dice)
      : t('diceSettings.rule.allHighFaces', { ...dice, number: String(highFaces) }));
    if (lowFaces === 1) sentences.push(t('diceSettings.rule.lowest'));
    else if (lowFaces > 0) sentences.push(t('diceSettings.rule.lowFaces', { number: String(lowFaces) }));
  }

  sentences.push(t(rule.repeats ? 'diceSettings.rule.repeats' : 'diceSettings.rule.once'));
  return sentences.join(' ');
}
