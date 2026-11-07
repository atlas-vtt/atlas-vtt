/**
 * A fight by sides: the sides in the order they act (the players, the opponents and any the
 * collection names), and whether the sides roll for their order every round.
 */

import React from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { isValidDefaultRoll } from '../../../gameSystems/diceRules';
import { MAX_SIDES, areSidesValid, firstBuiltInSide, isBuiltInSide, newSideId, sidesOfRules } from '../../../gameSystems/initiativeSideRules';
import { sideName } from '../../../initiative/sides';
import type { InitiativeRules, SideRef } from '../../../types/initiativeRulesTypes';
import { t } from '../../../i18n';
import { SwitchRow } from './SwitchRow';
import './initiative-fields.scss';

interface InitiativeSideFieldsProps {
  initiative: InitiativeRules;
  onChange: (initiative: InitiativeRules) => void;
}

/** What a side rolls where the GM switches the rolled order on: one die of six, as most games with rolled sides use. */
const SIDE_ROLL = '1d6';

function IconButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }): React.ReactElement {
  return (
    <LabelTooltip label={label}>
      <Button variant="ghost" size="icon" aria-label={label} disabled={disabled} onClick={onClick}>{children}</Button>
    </LabelTooltip>
  );
}

export function InitiativeSideFields({ initiative, onChange }: InitiativeSideFieldsProps): React.ReactElement {
  const sides = sidesOfRules(initiative);
  const rolled = initiative.sideRoll !== undefined;
  const sideRoll = initiative.sideRoll ?? SIDE_ROLL;
  const rollValid = !rolled || isValidDefaultRoll(sideRoll);

  const write = (next: SideRef[]): void => onChange({ ...initiative, firstSide: firstBuiltInSide(next), sides: next });
  const move = (index: number, by: number): void => {
    const next = [...sides];
    const [side] = next.splice(index, 1);
    if (side) next.splice(index + by, 0, side);
    write(next);
  };
  const rename = (index: number, name: string): void => write(sides.map((side, at) => (at === index ? { ...side, name } : side)));
  const add = (): void => write([...sides, { id: newSideId(sides.map((side) => side.id)), name: '' }]);
  const setRolled = (on: boolean): void => {
    const { sideRoll: _roll, ...rest } = initiative;
    onChange(on ? { ...rest, sideRoll: SIDE_ROLL } : rest);
  };

  return (
    <div className="atlas-csm-field">
      <label className="atlas-csm-label">{t('initiative.rules.sides')}</label>
      <p className="atlas-csm-hint">{t('initRules.sidesOrder')} {t('initiative.rules.sidesOfTokens')}</p>
      <div className="atlas-csm-condition-list">
        {sides.map((side, index) => (
          <div key={side.id} className="atlas-csm-condition-row atlas-csm-side">
            {isBuiltInSide(side.id) ? (
              <span className="atlas-csm-side__name">{sideName(side)}</span>
            ) : (
              <input
                type="text"
                className="atlas-csm-input"
                placeholder={t('initRules.sideName')}
                aria-label={t('initRules.sideName')}
                aria-invalid={(side.name ?? '').trim() === '' || undefined}
                value={side.name ?? ''}
                onChange={(e) => rename(index, e.target.value)}
              />
            )}
            <IconButton label={t('initRules.actEarlier')} disabled={rolled || index === 0} onClick={() => move(index, -1)}><ArrowUp /></IconButton>
            <IconButton label={t('initRules.actLater')} disabled={rolled || index === sides.length - 1} onClick={() => move(index, 1)}><ArrowDown /></IconButton>
            <IconButton label={t('initRules.removeSide')} disabled={isBuiltInSide(side.id)} onClick={() => write(sides.filter((_, at) => at !== index))}><X /></IconButton>
          </div>
        ))}
      </div>
      {!areSidesValid(sides) && <p className="atlas-csm-hint atlas-csm-hint--error" role="alert">{t('initRules.sideNameError')}</p>}
      <Button variant="ghost" className="atlas-csm-add-btn" disabled={sides.length >= MAX_SIDES} onClick={add}>
        <Plus />
        {t('initRules.addSide')}
      </Button>
      <SwitchRow label={t('initRules.rollOrder')} hint={t('initRules.rollOrderHint')} checked={rolled} disabled={false} onChange={setRolled} />
      <label className="atlas-csm-label" htmlFor="atlas-csm-initiative-side-roll">{t('initRules.sideRoll')}</label>
      <input
        id="atlas-csm-initiative-side-roll"
        type="text"
        className="atlas-csm-input"
        placeholder={SIDE_ROLL}
        spellCheck={false}
        disabled={!rolled}
        aria-invalid={!rollValid || undefined}
        value={sideRoll}
        onChange={(e) => onChange({ ...initiative, sideRoll: e.target.value })}
      />
      {!rollValid && <p className="atlas-csm-hint atlas-csm-hint--error" role="alert">{t('initiative.rules.rollError')}</p>}
    </div>
  );
}
