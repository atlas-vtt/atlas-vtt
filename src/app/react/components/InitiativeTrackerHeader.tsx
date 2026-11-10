import React from 'react';
import { ChevronsDownUp, ChevronsUpDown, Dices, Ellipsis, Swords } from 'lucide-react';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { EndCombatIcon } from './EndCombatIcon';
import { t } from '../../i18n';

interface InitiativeTrackerHeaderProps {
  /** The combatants roll for their numbers (turn order); by sides or by cards nothing is rolled. */
  rolls: boolean;
  fightRuns: boolean;
  empty: boolean;
  rolling: boolean;
  collapsed: boolean;
  /** Combatants the collapsed tracker leaves out. */
  leftOut: number;
  /** The side tooltips open on: away from the edge the tracker stands at. */
  tooltipSide: 'left' | 'right';
  onRoll: () => void;
  onStart: () => void;
  onEnd: () => void;
  onOptions: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onToggleCollapsed: () => void;
}

/**
 * The tracker's head: the toggle that collapses it to the turn and the next combatants, then
 * Roll, Start or End combat and the options. Four buttons side by side do not fit the narrow
 * tracker, so the toggle has a row of its own.
 */
export function InitiativeTrackerHeader(props: InitiativeTrackerHeaderProps): React.ReactElement {
  const { rolls, fightRuns, empty, rolling, collapsed, leftOut, tooltipSide } = props;
  const toggleLabel = collapsed ? t('initiative.expand') : t('initiative.collapse');
  return (
    <>
      <LabelTooltip label={toggleLabel} side={tooltipSide}>
        <button
          className="clickable-icon atlas-initiative-tracker__collapse"
          onClick={props.onToggleCollapsed}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronsUpDown /> : <ChevronsDownUp />}
          {collapsed && leftOut > 0 && <span className="atlas-initiative-tracker__left-out">{t('initiative.leftOut', { count: leftOut })}</span>}
        </button>
      </LabelTooltip>

      <div className="atlas-initiative-tracker__controls">
        {rolls && (
          <LabelTooltip label={t('initiative.rollAll')}>
            <button className="clickable-icon atlas-initiative-tracker__btn" onClick={props.onRoll} disabled={empty || rolling}>
              <Dices />
            </button>
          </LabelTooltip>
        )}

        {!fightRuns ? (
          <LabelTooltip label={t('initiative.startCombat')}>
            <button className="clickable-icon atlas-initiative-tracker__btn" onClick={props.onStart} disabled={empty}>
              <Swords />
            </button>
          </LabelTooltip>
        ) : (
          <LabelTooltip label={t('initiative.endCombat')}>
            <button className="clickable-icon atlas-initiative-tracker__btn atlas-initiative-tracker__btn--end" onClick={props.onEnd}>
              <EndCombatIcon />
            </button>
          </LabelTooltip>
        )}

        <LabelTooltip label={t('initiative.options')}>
          <button className="clickable-icon atlas-initiative-tracker__btn" onClick={props.onOptions} aria-haspopup="menu">
            <Ellipsis />
          </button>
        </LabelTooltip>
      </div>
    </>
  );
}
