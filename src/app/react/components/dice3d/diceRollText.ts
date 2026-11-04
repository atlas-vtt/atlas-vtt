import type { DiceScene } from '../../../dice3d/diceScene';
import { diceList, diceSum, keptRolls, namedDiceLine } from '../../../tools/diceLabels';
import { modifiersText } from '../../../tools/namedModifiers';
import type { DiceRollResult } from '../../../types/diceTypes';
import { t } from '../../../i18n';

/**
 * What was rolled, e.g. "Scimitar"; a roll without an action is just a roll.
 * Never who rolled it: the creature's portrait beside the label says that.
 */
export function rollLabel(result: DiceRollResult): string {
  return result.source?.abilityName || t('diceRoll.label');
}

/** "Advantage" or "Disadvantage", where the roll was made with it. */
export function advantageText(result: Pick<DiceRollResult, 'advantage'>): string | null {
  if (!result.advantage) return null;
  return result.advantage === 'advantage' ? t('dice.advantage') : t('dice.disadvantage');
}

/** The line under the total, after the side of advantage the roll was made with: `Advantage · 17 + 5`. */
export function rollBreakdown(result: DiceRollResult, scene: DiceScene): string | null {
  const side = advantageText(result);
  const dice = diceBreakdown(result, scene);
  if (side === null) return dice;
  return dice === null ? side : `${side} · ${dice}`;
}

/**
 * The dice under the total, with the names a dice set gave them (`Sun 9 · Moon 4 + 3`).
 * Dice a written keep or drop left out are named in brackets (`3 + (1) + 6`); the die
 * advantage dropped only fades on the stage, since the side named before the line says
 * why. A die stood in for another (a d2 on a d6) explains itself, since a 6 on the stage
 * next to a total of 2 looks like an error. More than six dice are summed rather than
 * listed: the chain would wrap, the panel holds one line, and the pips lie on the stage
 * anyway. A formula that is no plain sum (`2d6*2`, `8d10cs>=8`) lists its dice instead
 * of adding them up.
 */
function diceBreakdown(result: DiceRollResult, scene: DiceScene): string | null {
  const thrown = result.rolls.filter((roll) => !roll.rerolled).length;
  if (result.linear === false) return thrown > 6 ? `${thrown} dice` : diceList(result.rolls);

  const suffix = modifiersText(result);
  const kept = keptRolls(result.rolls);
  const shown = result.advantage ? kept : result.rolls;
  const diceTotal = result.total - result.modifiers;
  const plain = result.rolls.every((roll) => !roll.rerolled && !roll.dropped);

  if (scene.plan[0]?.role === 'tens') {
    const value = kept[0]?.value ?? 0;
    return t('diceRoll.tensUnits', { tens: String(Math.floor((value % 100) / 10) * 10), units: String(value % 10) }) + suffix;
  }
  const named = namedDiceLine(result.rolls, result);
  if (named !== null && kept.length <= 6) return named;
  if (thrown > 6) return t('diceRoll.manyDice', { number: String(thrown), total: String(diceTotal) }) + suffix;
  if (scene.plan.some((die) => die.fold !== undefined) && (plain || result.advantage)) {
    const faces = scene.faces.filter((_, i) => !scene.plan[i]?.dropped);
    return t('diceRoll.folded', { faces: faces.join(' + '), sides: String(scene.plan[0]!.sides), values: kept.map((roll) => roll.value).join(' + ') }) + suffix;
  }
  return shown.length > 1 || suffix !== '' ? `${diceSum(shown)}${suffix}` : null;
}

/** Whether a breakdown line will show, known before landing so the panel never grows. */
export function hasBreakdown(result: DiceRollResult, scene: DiceScene): boolean {
  return result.advantage !== undefined
    || scene.plan[0]?.role === 'tens'
    || scene.plan.some((die) => die.fold !== undefined)
    || result.rolls.length > 1
    || modifiersText(result) !== ''
    || result.linear === false;
}
