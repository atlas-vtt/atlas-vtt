/**
 * DefaultDiceInfo — The info mark beside a setting that speaks of default
 * dice. Its tooltip says what they are, with the collection's own roll.
 */

import React from 'react';
import { Info } from 'lucide-react';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { t } from '../../../i18n';
import { DEFAULT_DICE_RULES, isValidDefaultRoll } from '../../../gameSystems/diceRules';

interface DefaultDiceInfoProps {
  /** The collection's default roll as typed; the default stands in while it is not valid. */
  defaultRoll: string;
}

/** What default dice are, said with the roll they belong to. */
export function defaultDiceExplanation(defaultRoll: string): string {
  const roll = isValidDefaultRoll(defaultRoll) ? defaultRoll.trim() : DEFAULT_DICE_RULES.defaultRoll;
  return t('diceSettings.defaultDice', { roll });
}

export function DefaultDiceInfo({ defaultRoll }: DefaultDiceInfoProps): React.ReactElement {
  return (
    <LabelTooltip label={defaultDiceExplanation(defaultRoll)} multiline>
      {/* Focusable, so the explanation also opens from the keyboard. */}
      <span className="atlas-csm-info" role="img" tabIndex={0}>
        <Info size={14} aria-hidden="true" />
      </span>
    </LabelTooltip>
  );
}
