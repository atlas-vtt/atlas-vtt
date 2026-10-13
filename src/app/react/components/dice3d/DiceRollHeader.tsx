import React from 'react';
import { TokenPortrait } from '../../../packages/components/shared/TokenPortrait';
import type { DiceRollResult } from '../../../types/diceTypes';
import type { RollSourcePresentation, UseDiceAvatar } from '../dice/diceSourcePresentation';

interface DiceRollHeaderProps {
  result: DiceRollResult;
  /** Who the roll names; unset looks it up as the GM's window does. */
  presentation?: RollSourcePresentation | null | undefined;
  label: string;
  /** Finds the portrait; called once per render. */
  useAvatar: UseDiceAvatar;
}

/**
 * The portrait of the token that rolled, when it has one, and what it rolled.
 * The creature's name is not written out; it names the portrait for screen readers.
 */
export function DiceRollHeader({ result, presentation, label, useAvatar }: DiceRollHeaderProps): React.ReactElement {
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
      <span className="atlas-dice-roll__label">{label}</span>
    </span>
  );
}
