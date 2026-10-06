import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../../../utils/cn';
import { t } from '../../../i18n';

interface DiceRollChipProps {
  amount: number;
  /** The counter has clicked this amount in. */
  applied: boolean;
  reduced: boolean;
}

function signed(amount: number): string {
  return amount < 0 ? `−${Math.abs(amount)}` : `+${amount}`;
}

/**
 * Where the modifier comes from, as a chip under the panel. It is there from
 * the start, fully visible: the bonus is not half true while the dice fly.
 * When it clicks in, the chip lifts and settles, in time with the counter and
 * the ratchet.
 */
export function DiceRollChip({ amount, applied, reduced }: DiceRollChipProps): React.ReactElement {
  return (
    <motion.span
      className={cn('atlas-dice-roll__chip', applied && 'atlas-dice-roll__chip--applied')}
      aria-hidden="true"
      animate={!reduced && applied ? { scale: [1, 1.1, 1], y: [0, -3, 0] } : {}}
      transition={{ duration: 0.36, ease: [0.22, 0.61, 0.36, 1] }}
    >
      <span className="atlas-dice-roll__chip-label">{t('diceRoll.modifier')}</span>
      <span className="atlas-dice-roll__chip-amount">{signed(amount)}</span>
    </motion.span>
  );
}
