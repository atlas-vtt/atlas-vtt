import React from 'react';
import { restingAspect } from '../../../../dice3d/diceScene';
import type { DieImageRequest } from '../../../../dice3d/dieImages';
import type { DiceSet } from '../../../../types/diceSetTypes';
import { DieStill } from './DieStill';
import { placeStack, stackOfDice } from './diceStack';
import type { DieImageState } from './useDieImages';

/** The most dice a stack shows; the others are counted. */
const MOST_SHOWN = 4;
/** The stack's column and the height a die is shown at, in CSS pixels (`$dice-stack-width` in dice-set-picker.scss). */
const STACK_WIDTH = 80;
const DIE_HEIGHT = 48;

/** The dice whose images a set's stack shows. */
export function setDiceRequests(set: DiceSet): DieImageRequest[] {
  return stackOfDice(set.dice, MOST_SHOWN).dice;
}

/**
 * A set's dice as they roll, drawn at rest and overlapping like dice in a
 * hand, a few at most, with how many more there are. Decorative: the row's
 * text says the roll.
 */
export function SetDice({ set, image }: { set: DiceSet; image: (die: DieImageRequest) => DieImageState }): React.ReactElement {
  const { dice, more } = stackOfDice(set.dice, MOST_SHOWN);
  const shown = dice.map((die) => ({ die, image: image(die) }));
  const places = placeStack(shown.map(({ die, image: drawn }) => drawn?.aspect ?? restingAspect(die.sides)), STACK_WIDTH, DIE_HEIGHT);
  return (
    <span className="atlas-dice-picker__dice" aria-hidden="true">
      {shown.map(({ die, image: drawn }, i) => (
        <DieStill key={i} sides={die.sides} colour={die.colour} image={drawn} height={places.height}
          className="atlas-dice-picker__die" style={{ left: places.lefts[i] }} />
      ))}
      {more > 0 && <span className="atlas-dice-picker__more">+{more}</span>}
    </span>
  );
}
