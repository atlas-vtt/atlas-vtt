import { describe, expect, it } from 'vitest';
import { sceneFromRolls } from '../../../src/app/dice3d/diceScene';
import { diceSceneToShow } from '../../../src/app/dice3d/rollPresentation';
import { hasBreakdown, rollBreakdown } from '../../../src/app/react/components/dice3d/diceRollText';
import { rollTestFormula } from '../../../src/app/tools/__tests__/rollTestFormula';
import type { DiceRollResult } from '../../../src/app/types/diceTypes';

function showing(sides: number, ...faces: number[]): () => number {
  let i = 0;
  return (): number => (faces[i++ % faces.length]! - 0.5) / sides;
}

/** `formula` rolled as the dice tool records it. */
function rolled(formula: string, random: () => number): DiceRollResult {
  const { rolls, modifiers, total, linear } = rollTestFormula(formula, random);
  return { id: formula, timestamp: 0, formula, rolls, modifiers, total, ...(!linear && { linear: false as const }) };
}

/** The breakdown line, checked to show exactly when the panel left room for it. */
function breakdown(result: DiceRollResult): string | null {
  const scene = sceneFromRolls(result.rolls)!;
  const line = rollBreakdown(result, scene);
  expect(hasBreakdown(result, scene)).toBe(line !== null);
  return line;
}

describe('3D dice for the full notation', () => {
  it('shows Fate dice as a result card: they have no body', () => {
    const result = rolled('4dF', showing(3, 1, 2, 3, 3));
    expect(sceneFromRolls(result.rolls)).toBeNull();
    expect(diceSceneToShow(result, 'full')).toBeNull();
  });

  it('throws d% as tens and units', () => {
    const result = rolled('d%', showing(100, 37));
    expect(sceneFromRolls(result.rolls)?.plan.map((die) => die.role)).toEqual(['tens', 'units']);
    expect(breakdown(result)).toBe('Tens 30, units 7');
  });

  it('throws dropped dice and names them in the breakdown', () => {
    const result = rolled('4d6kh3', showing(6, 3, 1, 6, 4));
    expect(sceneFromRolls(result.rolls)?.faces).toEqual([3, 1, 6, 4]);
    expect(result.total).toBe(13);
    expect(breakdown(result)).toBe('3 + (1) + 6 + 4');
  });

  it('throws the die that took the place of a rerolled one, and says what it replaced', () => {
    const result = rolled('1d20r1', showing(20, 1, 12));
    expect(sceneFromRolls(result.rolls)?.faces).toEqual([12]);
    expect(breakdown(result)).toBe('1→12');
    const percentile = rolled('1d100r1', showing(100, 1, 57));
    expect(sceneFromRolls(percentile.rolls)?.faces).toEqual([5, 7]);
  });

  it('chains explosions past a rerolled die', () => {
    const scene = sceneFromRolls(rolled('1d6r1!', showing(6, 1, 6, 3)).rolls)!;
    expect(scene.plan.map((die) => die.follows)).toEqual([undefined, 0]);
    expect(scene.faces).toEqual([6, 3]);
  });

  it('lists the dice of a formula that is no plain sum', () => {
    expect(breakdown(rolled('1d6*2', showing(6, 4)))).toBe('4');
    expect(breakdown(rolled('3d10cs>=8', showing(10, 9, 2, 8)))).toBe('9✓, 2, 8✓');
    expect(breakdown(rolled('8d10>=8', showing(10, 9)))).toBe('8 dice');
  });
});
