import React from 'react';
import { TokenPortrait } from '../../../packages/components/shared/TokenPortrait';
import type { DiceRollResult } from '../../../types/diceTypes';
import { cn } from '../../../../utils/cn';
import type { RollAudience, RollSourcePresentation, UseDiceAvatar } from '../dice/diceSourcePresentation';
import { RollAudienceMark } from '../dice/RollAudienceMark';

interface DiceRollHeaderProps {
  result: DiceRollResult;
  /** Who the roll names; unset looks it up as the GM's window does. */
  presentation?: RollSourcePresentation | null | undefined;
  label: string;
  /** The label is the roll's formula, set in the dice's face, not an action's name in capitals. */
  formula: boolean;
  /** Whom the GM's roll was shown to; unset shows no mark. */
  audience: RollAudience | undefined;
  /** Finds the portrait; called once per render. */
  useAvatar: UseDiceAvatar;
}

/**
 * The portrait of the token that rolled, when it has one, what it rolled and, on the GM's
 * own display, whether the players saw it. The creature's name is not written out; it
 * names the portrait for screen readers.
 */
export function DiceRollHeader({ result, presentation, label, formula, audience, useAvatar }: DiceRollHeaderProps): React.ReactElement {
  const avatar = useAvatar(result.source, presentation);
  const name = presentation === undefined ? result.source?.tokenName : presentation?.name;
  return (
    <span className="atlas-dice-roll__who">
      {avatar && (
        <TokenPortrait
          className="atlas-dice-roll__avatar"
          src={avatar.src}
          alt={name ?? ''}
          showRing={avatar.showRing}
          ringColor={avatar.ringColor}
        />
      )}
      <span className={cn('atlas-dice-roll__label', formula && 'atlas-dice-roll__label--formula')}>{label}</span>
      <RollAudienceMark audience={audience} className="atlas-dice-roll__audience" />
    </span>
  );
}
