import React from 'react';
import { cn } from '../../../../utils/cn';
import { describeSystemRules } from '../../../gameSystems/systemRules';
import type { SystemRules } from '../../../types/systemPresetTypes';
import { ConditionBadgeStack } from './ConditionBadgeStack';
import { t } from '../../../i18n';

interface SystemPresetRowProps {
  name: string;
  /** Shown as the summary and the condition badges; choices without rules pass a `summary`. */
  rules?: SystemRules;
  summary?: string;
  isActive: boolean;
  /** Active, but the collection's rules have been changed since the preset was applied. */
  isEdited?: boolean;
  isBuiltIn?: boolean;
  /** Applies the preset; rows without it only show the collection's rules. */
  onSelect?: () => void;
  actions?: React.ReactNode;
  /** Shown instead of the row's content, e.g. a rename field. */
  replacement?: React.ReactNode;
}

/** One game system in the list: a radio with its name, a summary of its rules and its condition badges. */
export function SystemPresetRow({
  name, rules, summary, isActive, isEdited = false, isBuiltIn = false, onSelect, actions, replacement,
}: SystemPresetRowProps): React.ReactElement {
  return (
    <div className={cn('atlas-csm-preset', isActive && 'atlas-active')}>
      {replacement ?? (
        <>
          <button
            type="button"
            role="radio"
            aria-checked={isActive}
            className="atlas-csm-preset__select"
            disabled={!onSelect}
            onClick={onSelect}
          >
            <span className="atlas-csm-preset__indicator" aria-hidden="true" />
            <span className="atlas-csm-preset__text">
              <span className="atlas-csm-preset__title">
                <span className="atlas-csm-preset__name">{name}</span>
                {isBuiltIn && <span className="atlas-csm-tag">{t('csm.system.builtIn')}</span>}
                {isEdited && <span className="atlas-csm-tag atlas-csm-tag--accent">{t('csm.system.edited')}</span>}
              </span>
              <span className="atlas-csm-preset__summary">{summary ?? (rules ? describeSystemRules(rules) : '')}</span>
            </span>
            {rules && <ConditionBadgeStack conditions={rules.conditions} />}
          </button>
          {actions && <div className="atlas-csm-preset__actions">{actions}</div>}
        </>
      )}
    </div>
  );
}
