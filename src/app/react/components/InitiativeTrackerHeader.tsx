import React from 'react';
import { Dices, Ellipsis, Swords } from 'lucide-react';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { Button } from '../../packages/components/primitives/button';
import { EndCombatIcon } from './EndCombatIcon';
import { t } from '../../i18n';

interface InitiativeTrackerHeaderProps {
  /** The combatants roll for their numbers (turn order); by sides or by cards nothing is rolled. */
  rolls: boolean;
  fightRuns: boolean;
  empty: boolean;
  rolling: boolean;
  onRoll: () => void;
  onStart: () => void;
  onEnd: () => void;
  onOptions: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

/**
 * The bar floating above the tracker: Roll, Start or End combat and the options. It shows while the
 * pointer is near the tracker (`initiative-tracker.scss`).
 */
export function InitiativeTrackerHeader(props: InitiativeTrackerHeaderProps): React.ReactElement {
  const { rolls, fightRuns, empty, rolling } = props;
  return (
    <div className="atlas-initiative-tracker__float atlas-initiative-tracker__float--top">
      {rolls && (
        <LabelTooltip label={t('initiative.rollAll')}>
          <Button variant="ghost" size="icon" className="atlas-initiative-tracker__btn" onClick={props.onRoll} disabled={empty || rolling}>
            <Dices />
          </Button>
        </LabelTooltip>
      )}

      {!fightRuns ? (
        <LabelTooltip label={t('initiative.startCombat')}>
          <Button variant="ghost" size="icon" className="atlas-initiative-tracker__btn" onClick={props.onStart} disabled={empty}>
            <Swords />
          </Button>
        </LabelTooltip>
      ) : (
        <LabelTooltip label={t('initiative.endCombat')}>
          <Button variant="ghost" size="icon" className="atlas-initiative-tracker__btn atlas-initiative-tracker__btn--end" onClick={props.onEnd}>
            <EndCombatIcon />
          </Button>
        </LabelTooltip>
      )}

      <LabelTooltip label={t('initiative.options')}>
        <Button variant="ghost" size="icon" className="atlas-initiative-tracker__btn" onClick={props.onOptions} aria-haspopup="menu">
          <Ellipsis />
        </Button>
      </LabelTooltip>
    </div>
  );
}
