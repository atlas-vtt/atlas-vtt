import React from 'react';
import { cn } from '../../../../utils/cn';
import { explodes } from '../../../tools/diceExplosion';
import type { RolledDie } from '../../../tools/diceFormula';
import { keptModifiersText } from '../../../tools/namedModifiers';
import type { DiceRollResult } from '../../../types/diceTypes';
import { t } from '../../../i18n';

/** A space a line never breaks at: a die's name stays with its number. */
const KEEP = '\u00a0';

/** A die and the dice its explosion rolled, as one entry of the line. */
interface Chunk {
  text: string;
  dropped: boolean;
}

/** A die's number, `6!` where it exploded. */
const valueAt = (rolls: readonly RolledDie[], index: number): string => `${rolls[index]!.value}${explodes(rolls, index) ? '!' : ''}`;

function chunksOf(rolls: readonly RolledDie[]): Chunk[] {
  const chunks: Chunk[] = [];
  rolls.forEach((roll, i) => {
    const value = valueAt(rolls, i);
    const last = chunks.at(-1);
    if (roll.exploded && last) {
      last.text += `${KEEP}${roll.negative ? '−' : '+'}${KEEP}${value}`;
      return;
    }
    const signed = roll.negative ? `−${value}` : value;
    chunks.push({ text: roll.name ? `${roll.name}${KEEP}${signed}` : signed, dropped: roll.dropped === true || roll.rerolled === true });
  });
  return chunks;
}

/**
 * Whether a roll's line lists its dice: it dropped some, or advantage changed
 * it. A formula that is no plain sum (`2d6kh1*2`) shows its formula instead,
 * since its dice and modifier do not add up to its total.
 */
export function listsDice(result: Pick<DiceRollResult, 'rolls' | 'advantage' | 'linear'>): boolean {
  if (result.linear === false) return false;
  return result.advantage !== undefined || result.rolls.some((roll) => roll.dropped);
}

/**
 * A roll that kept some of its dice, or that advantage changed, as its dice:
 * each by its name and number, the kept in bold and the dropped (or rolled
 * again) struck through, then the modifier: `17 · 4 + 5`.
 */
export function RolledDiceLine({ result, className }: { result: Pick<DiceRollResult, 'rolls' | 'modifiers' | 'namedModifiers' | 'diceSet'>; className?: string }): React.ReactElement {
  const chunks = chunksOf(result.rolls);
  return (
    <span className={cn('atlas-rolled-dice', className)}>
      {result.diceSet && <span>{`${result.diceSet.name} · `}</span>}
      {chunks.map((chunk, i) => (
        <React.Fragment key={i}>
          {i > 0 && ' · '}
          {chunk.dropped ? (
            <s className="atlas-rolled-dice__die atlas-rolled-dice__die--dropped">
              {chunk.text}
              <span className="atlas-rolled-dice__hidden">{` (${t('dice.droppedDie')})`}</span>
            </s>
          ) : (
            <span className="atlas-rolled-dice__die atlas-rolled-dice__die--kept">{chunk.text}</span>
          )}
        </React.Fragment>
      ))}
      {keptModifiersText(result)}
    </span>
  );
}

/** "Advantage" or "Disadvantage" beside a roll made with it. */
export function AdvantageTag({ side, className }: { side: DiceRollResult['advantage']; className?: string }): React.ReactElement | null {
  if (!side) return null;
  return (
    <span className={cn('atlas-roll-advantage', `atlas-roll-advantage--${side}`, className)}>
      {side === 'advantage' ? t('dice.advantage') : t('dice.disadvantage')}
    </span>
  );
}
