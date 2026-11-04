import React, { useId } from 'react';
import { Copy, Lock } from 'lucide-react';
import { setRoll, setRollText } from '../../../../gameSystems/diceSets';
import { MAX_DICE_NAME_LENGTH } from '../../../../gameSystems/diceSetValidation';
import { Button } from '../../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../../packages/components/primitives/tooltip';
import type { DiceSetService } from '../../../../services/diceSets/DiceSetService';
import type { DiceSet } from '../../../../types/diceSetTypes';
import { t } from '../../../../i18n';
import { CritRuleField } from '../CritRuleField';
import { ExplodingDiceFields } from '../ExplodingDiceFields';
import { ADVANTAGE_SIDES } from '../../../../tools/diceAdvantage';
import { AdvantageRuleField } from './AdvantageRuleField';
import { DiceTray } from './DiceTray';
import { edgeDiceOf, edgeRuleWith, groupsOfDice } from './labDice';
import { useLabSet, type NewSetStart } from './useLabSet';

interface LabWorkspaceProps {
  service: DiceSetService | null;
  /** The set open in the lab; null for a new set, made once it has a die. */
  set: DiceSet | null;
  start: NewSetStart;
  onCreated: (set: DiceSet) => void;
  onDuplicate: (set: DiceSet) => void;
}

/**
 * The open set: its options in the sidebar under the list of sets (name,
 * critical rule, exploding dice, advantage and disadvantage), and its dice on
 * the tray beside it, the dice advantage rolls among them. Both are
 * cells of the lab's grid, so the list of sets stays as it is while the lab
 * moves from set to set.
 */
export function LabWorkspace({ service, set, start, onCreated, onDuplicate }: LabWorkspaceProps): React.ReactElement {
  const { draft, edit, nameError, editable } = useLabSet(service, set, start, onCreated);
  const nameId = useId();
  const titleId = useId();
  const groups = groupsOfDice(draft.dice);
  const locked = set?.builtIn === true || set?.readOnly === true;
  const edgeDice = edgeDiceOf(draft);

  return (
    <>
      <div className="atlas-dice-lab__options">
        <div className="atlas-dice-lab__name">
          <label className="atlas-dice-lab__option-label" htmlFor={nameId}>{t('diceLab.name')}</label>
          <input
            id={nameId}
            type="text"
            className="atlas-csm-input"
            spellCheck={false}
            maxLength={MAX_DICE_NAME_LENGTH}
            disabled={!editable}
            aria-invalid={nameError !== null || undefined}
            value={draft.name}
            onChange={(event) => edit({ name: event.target.value }, 'typing')}
          />
          {nameError && <p className="atlas-csm-hint atlas-csm-hint--error" role="alert">{nameError}</p>}
        </div>
        <CritRuleField crit={draft.crit} disabled={!editable} onChange={(crit) => edit({ crit }, 'now')} />
        <ExplodingDiceFields
          dice={{ defaultRoll: groups.length > 0 ? setRoll(groups) : '', crit: draft.crit, ...(draft.explode && { explode: draft.explode }) }}
          disabled={!editable}
          // A switch or choice is written at once, a face count once typing rests
          onChange={(next) => edit({ explode: next.explode }, next.explode?.dice === draft.explode?.dice ? 'typing' : 'now')}
        />
        {ADVANTAGE_SIDES.map((side) => (
          <AdvantageRuleField
            key={side}
            side={side}
            rule={draft[side]}
            dice={groups}
            disabled={!editable}
            onChange={(rule, pace) => edit({ [side]: rule }, pace)}
          />
        ))}
      </div>

      <section className="atlas-dice-lab__stage" aria-labelledby={titleId}>
        <div className="atlas-dice-lab__stage-head">
          <div className="atlas-dice-lab__stage-title">
            <h3 id={titleId}>{draft.name.trim() || t('diceLab.newSetName')}</h3>
            <span className="atlas-dice-lab__roll">{groups.length > 0 ? setRollText(groups) : t('diceLab.noDiceYet')}</span>
          </div>
          {editable && draft.dice.length > 0 && <span className="atlas-dice-lab__stage-hint">{t('diceLab.hint')}</span>}
          {locked && set && (
            <div className="atlas-dice-lab__locked">
              <LabelTooltip label={set.builtIn ? t('diceLab.readOnlyBuiltIn') : t('diceLab.readOnlyNewer')} multiline>
                <span className="atlas-dice-lab__badge" tabIndex={0}>
                  <Lock aria-hidden="true" />
                  {set.builtIn ? t('diceLab.builtIn') : t('diceLab.newer')}
                </span>
              </LabelTooltip>
              {service && (
                <Button variant="outline" size="sm" onClick={() => onDuplicate(set)}>
                  <Copy aria-hidden="true" />
                  {t('diceLab.duplicateToEdit')}
                </Button>
              )}
            </div>
          )}
        </div>
        <DiceTray
          dice={draft.dice}
          editable={editable}
          setName={draft.name}
          onDice={(dice, pace) => edit({ dice }, pace)}
          edgeDice={edgeDice}
          onEdgeDie={(side, change, pace) => {
            const edge = edgeDice.find((entry) => entry.side === side);
            edit({ [side]: change && edge ? edgeRuleWith(edge.die, change) : undefined }, pace);
          }}
        />
      </section>
    </>
  );
}
