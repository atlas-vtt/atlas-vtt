import React from 'react';
import { diceLinkProps } from '../../../services/statblockDiceLinks';
import { bonusLink } from '../../values/valueRolls';

interface BonusLinkProps {
  /** The text the value shows. */
  text: string;
  /** Whether its block rolls a whole number as a bonus ("Roll as a bonus"). */
  rollable: boolean | undefined;
  children: React.ReactNode;
}

/**
 * A value's drawing, made a roll link where its block is rollable and it shows
 * a whole number its text does not link itself (`2` rolls `+2`); as it is otherwise.
 */
export function BonusLink({ text, rollable, children }: BonusLinkProps): React.JSX.Element {
  const bonus = bonusLink(text, rollable);
  return bonus === null ? <>{children}</> : <span {...diceLinkProps(bonus)}>{children}</span>;
}
