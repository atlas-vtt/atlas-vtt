/**
 * ExplodingDiceFields — Which dice of the collection roll again on a high or
 * low face, and how. The settings are switches and one sentence that says what
 * they do to the collection's own die; the number of faces, which few games
 * change, is folded away.
 */

import React, { useState } from 'react';
import { t } from '../../../i18n';
import { ObsidianMenuDropdown } from '../ObsidianMenuDropdown';
import {
  MAX_EXPLODING_FACES,
  isFaceCount,
  parseDefaultRoll,
  parseExplodeRule,
  withExplodeScope,
  type ExplodeChoice,
} from '../../../gameSystems/diceRules';
import { describeExplodeRule, highFaceNames, lowFaceNames } from '../../../gameSystems/explodeRuleText';
import type { DiceRules, ExplodeRule } from '../../../types/diceRulesTypes';
import { DefaultDiceInfo } from './DefaultDiceInfo';

interface ExplodingDiceFieldsProps {
  dice: DiceRules;
  onChange: (dice: DiceRules) => void;
}

const SCOPE_OPTIONS: Record<ExplodeChoice, string> = {
  off: t('diceSettings.explode.off'),
  default: t('diceSettings.explode.default'),
  all: t('diceSettings.explode.all'),
};

const OFF_HINT = t('diceSettings.explode.offHint');

/** The die the settings speak of where the default roll is not valid yet. */
const FALLBACK_SIDES = 20;

/** A count as the texts read it while its field is empty or holds no face count: 1, the least it allows. */
function readableFaceCount(count: number | undefined): number {
  return isFaceCount(count, 1) ? count : 1;
}

interface SwitchRowProps {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function SwitchRow({ label, hint, checked, onChange }: SwitchRowProps): React.ReactElement {
  return (
    <div className="atlas-csm-toggle-row">
      <div>
        <div className="atlas-csm-toggle-label">{label}</div>
        <div className="atlas-csm-hint">{hint}</div>
      </div>
      <label className="atlas-csm-switch">
        <input type="checkbox" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="atlas-csm-switch-track" />
      </label>
    </div>
  );
}

interface FaceCountFieldProps {
  id: string;
  label: string;
  /** What was typed: any number, or NaN for an empty field. Save stays disabled until it is a face count. */
  count: number;
  /** The faces of the collection's die a valid count means, e.g. `9 or 10`. */
  faces: string;
  sides: number;
  onChange: (count: number) => void;
}

/**
 * A number of faces, kept as typed: the field can be emptied and typed anew,
 * and says what it wants while what it holds is no face count.
 */
function FaceCountField({ id, label, count, faces, sides, onChange }: FaceCountFieldProps): React.ReactElement {
  const valid = isFaceCount(count, 1);
  return (
    <div className="atlas-csm-field">
      <label className="atlas-csm-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        className="atlas-csm-input atlas-csm-input--number"
        min={1}
        max={MAX_EXPLODING_FACES}
        step={1}
        aria-invalid={!valid || undefined}
        value={Number.isNaN(count) ? '' : count}
        onChange={(e) => {
          const typed = e.target.value.trim();
          onChange(typed === '' ? NaN : Number(typed));
        }}
      />
      {valid ? (
        <p className="atlas-csm-hint">
          {faces ? t('diceSettings.explode.onDie', { sides: String(sides), faces }) : t('diceSettings.explode.onDieNone', { sides: String(sides) })}
        </p>
      ) : (
        <p className="atlas-csm-hint atlas-csm-hint--error" role="alert">
          {t('diceSettings.explode.faceCountError', { max: MAX_EXPLODING_FACES })}
        </p>
      )}
    </div>
  );
}

export function ExplodingDiceFields({ dice, onChange }: ExplodingDiceFieldsProps): React.ReactElement {
  const rule = dice.explode;
  const sides = parseDefaultRoll(dice.defaultRoll)?.sides ?? FALLBACK_SIDES;
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

  return (
    <>
      <div className="atlas-csm-field">
        <div className="atlas-csm-label-row">
          <label className="atlas-csm-label">{t('diceSettings.explode')}</label>
          <DefaultDiceInfo defaultRoll={dice.defaultRoll} />
        </div>
        <ObsidianMenuDropdown
          className="atlas-setting-dropdown atlas-csm-dropdown"
          value={rule?.dice ?? 'off'}
          options={SCOPE_OPTIONS}
          onChange={(value) => onChange(withExplodeScope(dice, value as ExplodeChoice))}
        />
        {!rule && <p className="atlas-csm-hint">{OFF_HINT}</p>}
        {rule && complete && <p className="atlas-csm-hint">{describeExplodeRule(rule, sides)}</p>}
      </div>

      {rule && (
        <>
          <SwitchRow
            label={t('diceSettings.explode.repeats')}
            hint={t('diceSettings.explode.repeatsHint')}
            checked={rule.repeats}
            onChange={(repeats) => update({ repeats })}
          />
          <SwitchRow
            label={t('diceSettings.explode.subtracts')}
            hint={t('diceSettings.explode.subtractsHint', { sides: String(sides), faces: lowFaceNames(sides, lowFaces, highFaces) || '1' })}
            checked={subtracts}
            onChange={(on) => update({ lowFaces: on ? 1 : 0 })}
          />

          <details className="atlas-csm-details" open={facesShown} onToggle={(e) => setFacesShown(e.currentTarget.open)}>
            <summary>{t('diceSettings.explode.moreFaces')}</summary>
            <FaceCountField
              id="atlas-csm-explode-high"
              label={t('diceSettings.explode.highFaces')}
              count={rule.highFaces}
              faces={highFaceNames(sides, highFaces)}
              sides={sides}
              onChange={(count) => update({ highFaces: count })}
            />
            {subtracts && (
              <FaceCountField
                id="atlas-csm-explode-low"
                label={t('diceSettings.explode.lowFaces')}
                count={rule.lowFaces}
                faces={lowFaceNames(sides, lowFaces, highFaces)}
                sides={sides}
                onChange={(count) => update({ lowFaces: count })}
              />
            )}
          </details>
        </>
      )}
    </>
  );
}
