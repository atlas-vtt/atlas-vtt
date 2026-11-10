/**
 * AdvantageRuleField — What advantage (or disadvantage) does to a roll of the
 * set's dice, as one row: the kind of rule, each explained in its option's
 * tooltip; a number to add, or for a d100 whether only a tens die is added,
 * in a row under it. A die of its own is set up on the tray.
 */

import React, { useId } from 'react';
import { ObsidianMenuDropdown } from '../../ObsidianMenuDropdown';
import { groupNotation } from '../../../../gameSystems/diceSets';
import { MAX_ADVANTAGE_NUMBER } from '../../../../gameSystems/diceSetValidation';
import type { AdvantageKind, AdvantageRule, AdvantageSide, DiceSetDie } from '../../../../types/diceSetTypes';
import { t } from '../../../../i18n';
import { InfoMark } from '../InfoMark';
import { SwitchRow } from '../SwitchRow';

type Choice = AdvantageKind | 'none';

/** The rule a kind starts with when it is picked: a d6, a 2. */
const STARTS: Record<AdvantageKind, AdvantageRule> = {
  keep: { kind: 'keep' },
  die: { kind: 'die', sides: 6 },
  number: { kind: 'number', value: 2 },
};

const isNumber = (value: number): boolean => Number.isInteger(value) && value >= 1 && value <= MAX_ADVANTAGE_NUMBER;

function labels(side: AdvantageSide): Record<Choice, string> {
  const advantage = side === 'advantage';
  return {
    none: t('diceLab.edgeNone'),
    keep: advantage ? t('diceLab.edgeKeepBest') : t('diceLab.edgeKeepWorst'),
    die: advantage ? t('diceLab.edgeAddDie') : t('diceLab.edgeSubtractDie'),
    number: advantage ? t('diceLab.edgeAddNumber') : t('diceLab.edgeSubtractNumber'),
  };
}

/** What each kind does to the set's own dice: `Rolls 2d20 instead of d20 and keeps the best die`. */
function descriptions(side: AdvantageSide, dice: readonly DiceSetDie[]): Record<Choice, string> {
  const advantage = side === 'advantage';
  const first = dice[0] ?? { count: 1, sides: 20 };
  const keep = { roll: groupNotation(first), rolled: groupNotation({ ...first, count: first.count + 1 }), count: first.count };
  return {
    none: advantage ? t('diceLab.edgeNoneAdvantageHint') : t('diceLab.edgeNoneDisadvantageHint'),
    keep: advantage ? t('diceLab.edgeKeepBestHint', keep) : t('diceLab.edgeKeepWorstHint', keep),
    die: advantage ? t('diceLab.edgeAddDieHint') : t('diceLab.edgeSubtractDieHint'),
    number: advantage ? t('diceLab.edgeAddNumberHint') : t('diceLab.edgeSubtractNumberHint'),
  };
}

interface AdvantageRuleFieldProps {
  side: AdvantageSide;
  /** As the draft holds it: a number may be half typed (NaN). */
  rule: AdvantageRule | undefined;
  /** The set's dice: the texts speak of its first die, and a d100 may add a tens die alone. */
  dice: readonly DiceSetDie[];
  disabled: boolean;
  /** A choice is written at once, a number once typing rests. */
  onChange: (rule: AdvantageRule | undefined, pace: 'now' | 'typing') => void;
}

export function AdvantageRuleField({ side, rule, dice, disabled, onChange }: AdvantageRuleFieldProps): React.ReactElement {
  const labelId = useId();
  const numberId = useId();
  const choice: Choice = rule?.kind ?? 'none';
  const texts = descriptions(side, dice);
  const percentile = dice[0]?.sides === 100;

  return (
    <div className="atlas-dice-lab__option-group" data-advantage={side}>
      <div className="atlas-dice-lab__option">
        <span className="atlas-dice-lab__option-label">
          <span id={labelId}>{side === 'advantage' ? t('diceLab.advantage') : t('diceLab.disadvantage')}</span>
          <InfoMark label={`${texts[choice]} ${t('diceLab.edgeOnlySetDice')}`} />
        </span>
        <ObsidianMenuDropdown
          className="atlas-setting-dropdown atlas-dice-lab__select atlas-dice-lab__select--wide"
          labelledBy={labelId}
          value={choice}
          options={labels(side)}
          descriptions={texts}
          disabled={disabled}
          onChange={(value) => onChange(value === 'none' ? undefined : STARTS[value as AdvantageKind], 'now')}
        />
      </div>

      {rule?.kind === 'keep' && percentile && (
        <SwitchRow
          label={t('diceLab.edgeTensOnly')}
          hint={t('diceLab.edgeTensOnlyHint')}
          checked={rule.tensOnly === true}
          disabled={disabled}
          onChange={(on) => onChange(on ? { kind: 'keep', tensOnly: true } : { kind: 'keep' }, 'now')}
        />
      )}

      {rule?.kind === 'number' && (
        <>
          <div className="atlas-dice-lab__option">
            <label className="atlas-dice-lab__option-label" htmlFor={numberId}>{t('diceLab.edgeNumber')}</label>
            <input
              id={numberId}
              type="number"
              className="atlas-csm-input atlas-dice-lab__number"
              min={1}
              max={MAX_ADVANTAGE_NUMBER}
              step={1}
              disabled={disabled}
              aria-invalid={!isNumber(rule.value) || undefined}
              value={Number.isNaN(rule.value) ? '' : rule.value}
              onChange={(event) => {
                const typed = event.target.value.trim();
                onChange({ kind: 'number', value: typed === '' ? NaN : Number(typed) }, 'typing');
              }}
            />
          </div>
          {!isNumber(rule.value) && (
            <p className="atlas-csm-hint atlas-csm-hint--error" role="alert">{t('diceLab.facesInvalid', { most: MAX_ADVANTAGE_NUMBER })}</p>
          )}
        </>
      )}
    </div>
  );
}
