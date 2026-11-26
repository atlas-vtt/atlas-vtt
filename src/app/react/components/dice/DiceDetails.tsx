import React from 'react';
import { cn } from '../../../../utils/cn';
import type { DiceRollResult } from '../../../types/diceTypes';
import { dieLabel, dieStates, droppedAny } from '../../../tools/diceLabels';
import { modifierSteps } from '../../../tools/namedModifiers';
import { t } from '../../../i18n';

/** A die's highest face, then its lowest: the one it shows is marked. */
const EXTREMES = ['max', 'min'] as const;

/** `+3`, `−2`, `+2 Stealth`: a modifier as a chip writes it. */
function modifierChip(label: string, value: number): string {
  const signed = value < 0 ? `−${-value}` : `+${value}`;
  return label === '' ? signed : `${signed} ${label}`;
}

/**
 * A result card's Details: a chip per die (in brackets where it was dropped or rolled again; its
 * highest and lowest face marked by ▲ / ▼ as well as by colour), then a chip per modifier, so the
 * chips add up to the total.
 */
export function DiceDetails({ result, id }: { result: DiceRollResult; id: string }): React.ReactElement {
  const dropping = droppedAny(result.rolls);
  return (
    <div id={id} className="atlas-dice-toast__details">
      {result.rolls.map((roll, i) => {
        const states = dieStates(roll);
        const extreme = EXTREMES.find((state) => states.includes(state));
        return (
          <span
            key={i}
            className={cn(
              'atlas-dice-toast__die-badge',
              states.map((state) => `atlas-dice-toast__die-badge--${state}`),
              roll.colour && 'atlas-die-badge--coloured',
              dropping && !roll.dropped && !roll.rerolled && 'atlas-die-badge--kept',
            )}
            style={roll.colour ? { '--atlas-die-colour': roll.colour } as React.CSSProperties : undefined}
          >
            {dieLabel(result.rolls, i)}
            {extreme && (
              <>
                <span className="atlas-dice-toast__die-mark" aria-hidden="true">{extreme === 'max' ? '▲' : '▼'}</span>
                <span className="atlas-rolled-dice__hidden">{` (${extreme === 'max' ? t('diceRoll.highestFace') : t('diceRoll.lowestFace')})`}</span>
              </>
            )}
          </span>
        );
      })}
      {result.linear !== false && modifierSteps(result, '').map((step, i) => (
        <span key={`m${i}`} className="atlas-dice-toast__die-badge atlas-dice-toast__die-badge--modifier">
          {modifierChip(step.label, step.value)}
        </span>
      ))}
    </div>
  );
}
