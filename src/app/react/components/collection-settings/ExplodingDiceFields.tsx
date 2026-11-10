/**
 * ExplodingDiceFields — Which dice of a set roll again on a high or low face,
 * and how, as compact rows: a choice, two switches, and the number of faces,
 * which few games change, folded away. What each does to the set's own die
 * is said in the info mark beside it.
 */

import React, { useId, useState } from 'react';
import { ObsidianMenuDropdown } from '../ObsidianMenuDropdown';
import {
  MAX_EXPLODING_FACES,
  isFaceCount,
  parseExplodeRule,
  withExplodeScope,
  type ExplodeChoice,
} from '../../../gameSystems/diceRules';
import { describeExplodeRule, highFaceNames, lowFaceNames } from '../../../gameSystems/explodeRuleText';
import { parseRollGroups } from '../../../gameSystems/diceSets';
import type { DiceRules, ExplodeRule } from '../../../types/diceRulesTypes';
import { t } from '../../../i18n';
import { defaultDiceExplanation } from './DefaultDiceInfo';
import { InfoMark } from './InfoMark';
import { SwitchRow } from './SwitchRow';

interface ExplodingDiceFieldsProps {
  /** The set's rules; its default roll names its dice, the first of which the texts speak of. */
  dice: DiceRules;
  onChange: (dice: DiceRules) => void;
  /** A set that cannot be changed (built-in, or from a newer Atlas). */
  disabled?: boolean;
}

const SCOPE_OPTIONS: Record<ExplodeChoice, string> = {
  off: t('diceLab.explodeOff'),
  default: t('diceLab.explodeDefault'),
  all: t('diceLab.explodeAll'),
};

const SCOPE_DESCRIPTIONS: Record<ExplodeChoice, string> = {
  off: t('diceLab.explodeOffHint'),
  default: t('diceLab.explodeDefaultHint'),
  all: t('diceLab.explodeAllHint'),
};

/** The die the settings speak of where the default roll is not valid yet. */
const FALLBACK_SIDES = 20;

/** A count as the texts read it while its field is empty or holds no face count: 1, the least it allows. */
function readableFaceCount(count: number | undefined): number {
  return isFaceCount(count, 1) ? count : 1;
}

interface FaceCountFieldProps {
  label: string;
  /** What was typed: any number, or NaN for an empty field. The rule is not saved until it is a face count. */
  count: number;
  /** The faces of the set's die a valid count means, e.g. `9 or 10`. */
  faces: string;
  sides: number;
  disabled: boolean;
  onChange: (count: number) => void;
}

/**
 * A number of faces, kept as typed: the field can be emptied and typed anew,
 * and says what it wants while what it holds is no face count.
 */
function FaceCountField({ label, count, faces, sides, disabled, onChange }: FaceCountFieldProps): React.ReactElement {
  const id = useId();
  const valid = isFaceCount(count, 1);
  return (
    <div className="atlas-dice-lab__option-group">
      <div className="atlas-dice-lab__option">
        <span className="atlas-dice-lab__option-label">
          <label htmlFor={id}>{label}</label>
          {valid && <InfoMark label={t('diceLab.facesOn', { sides, faces: faces || t('common.none') })} />}
        </span>
        <input
          id={id}
          type="number"
          className="atlas-csm-input atlas-dice-lab__number"
          min={1}
          max={MAX_EXPLODING_FACES}
          step={1}
          disabled={disabled}
          aria-invalid={!valid || undefined}
          value={Number.isNaN(count) ? '' : count}
          onChange={(e) => {
            const typed = e.target.value.trim();
            onChange(typed === '' ? NaN : Number(typed));
          }}
        />
      </div>
      {!valid && (
        <p className="atlas-csm-hint atlas-csm-hint--error" role="alert">{t('diceLab.facesInvalid', { most: MAX_EXPLODING_FACES })}</p>
      )}
    </div>
  );
}

export function ExplodingDiceFields({ dice, onChange, disabled = false }: ExplodingDiceFieldsProps): React.ReactElement {
  const labelId = useId();
  const rule = dice.explode;
  const sides = parseRollGroups(dice.defaultRoll)?.[0]?.sides ?? FALLBACK_SIDES;
  const update = (change: Partial<ExplodeRule>): void => {
    if (rule) onChange({ ...dice, explode: { ...rule, ...change } });
  };
  // The face counts unfold by themselves where a rule counts more than one face, so nothing set stays
  // hidden, and then stay open: stepping a count back to 1 must not fold away the field being edited.
  const [facesShown, setFacesShown] = useState(false);
  if (rule && (rule.highFaces > 1 || rule.lowFaces > 1) && !facesShown) setFacesShown(true);

  const highFaces = readableFaceCount(rule?.highFaces);
  const lowFaces = readableFaceCount(rule?.lowFaces);
  // 0 alone means off: an emptied field is still switched on.
  const subtracts = rule !== undefined && rule.lowFaces !== 0;
  const complete = rule !== undefined && parseExplodeRule(rule) !== null;
  const meaning = !rule ? t('diceLab.explodeOffHint') : complete ? describeExplodeRule(rule, sides) : '';

  return (
    <>
      <div className="atlas-dice-lab__option">
        <span className="atlas-dice-lab__option-label">
          <span id={labelId}>{t('diceLab.exploding')}</span>
          <InfoMark label={`${meaning} ${defaultDiceExplanation(dice.defaultRoll)}`.trim()} />
        </span>
        <ObsidianMenuDropdown
          className="atlas-setting-dropdown atlas-dice-lab__select"
          labelledBy={labelId}
          value={rule?.dice ?? 'off'}
          options={SCOPE_OPTIONS}
          descriptions={SCOPE_DESCRIPTIONS}
          disabled={disabled}
          onChange={(value) => onChange(withExplodeScope(dice, value as ExplodeChoice))}
        />
      </div>

      {rule && (
        <>
          <SwitchRow
            label={t('diceLab.explodeRepeats')}
            hint={t('diceLab.explodeRepeatsHint')}
            checked={rule.repeats}
            disabled={disabled}
            onChange={(repeats) => update({ repeats })}
          />
          <SwitchRow
            label={t('diceLab.explodeSubtracts')}
            hint={t('diceLab.explodeSubtractsHint', { sides, faces: lowFaceNames(sides, lowFaces, highFaces) || '1' })}
            checked={subtracts}
            disabled={disabled}
            onChange={(on) => update({ lowFaces: on ? 1 : 0 })}
          />

          <details className="atlas-dice-lab__more" open={facesShown} onToggle={(e) => setFacesShown(e.currentTarget.open)}>
            <summary>{t('diceLab.explodeMoreFaces')}</summary>
            <FaceCountField
              label={t('diceLab.explodeHighFaces')}
              count={rule.highFaces}
              faces={highFaceNames(sides, highFaces)}
              sides={sides}
              disabled={disabled}
              onChange={(count) => update({ highFaces: count })}
            />
            {subtracts && (
              <FaceCountField
                label={t('diceLab.explodeLowFaces')}
                count={rule.lowFaces}
                faces={lowFaceNames(sides, lowFaces, highFaces)}
                sides={sides}
                disabled={disabled}
                onChange={(count) => update({ lowFaces: count })}
              />
            )}
          </details>
        </>
      )}
    </>
  );
}
