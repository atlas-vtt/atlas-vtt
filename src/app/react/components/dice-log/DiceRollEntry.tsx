import React, { useState, useEffect } from 'react';
import { ChevronDown, RotateCw } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import type { DiceRollResult } from '../../../types/diceTypes';
import { TokenPortrait } from '../../../packages/components/shared/TokenPortrait';
import { useDiceAvatar } from '../dice/useDiceAvatar';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { dieLabel } from '../../../tools/diceLabels';
import { t } from '../../../i18n';

interface DiceRollEntryProps {
  result: DiceRollResult;
  isNew?: boolean;
  onRepeat: () => void;
}

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function DiceRollEntry({ result, isNew, onRepeat }: DiceRollEntryProps): React.ReactElement {
  const [relativeTime, setRelativeTime] = useState(() => formatRelativeTime(result.timestamp));
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRelativeTime(formatRelativeTime(result.timestamp));
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [result.timestamp]);

  const isCritSuccess = result.crit === 'high';
  const isCritFail = result.crit === 'low';

  const source = result.source;
  const sourceTokenName = source?.tokenName ?? t('dice.unknown');
  const avatar = useDiceAvatar(source);

  const hasSource = source?.type === 'statblock' && source.tokenName;

  return (
    <div
      className={cn(
        'dice-log-entry',
        hasSource && 'dice-log-entry--has-avatar',
        isNew && 'dice-log-entry--new',
        isCritSuccess && 'dice-log-entry--crit-success',
        isCritFail && 'dice-log-entry--crit-fail',
      )}
      onClick={() => setIsExpanded(prev => !prev)}
    >
      {/* Chat-style avatar */}
      {hasSource && (
        avatar ? (
          <TokenPortrait
            className="dice-log-entry__avatar"
            src={avatar.src}
            alt={sourceTokenName}
            showRing={avatar.showRing}
            ringColor={avatar.ringColor}
          />
        ) : (
          <div className="dice-log-entry__avatar dice-log-entry__avatar--fallback">
            {sourceTokenName.charAt(0).toUpperCase()}
          </div>
        )
      )}

      {/* Timestamp — top-right corner */}
      <span className="dice-log-entry__time">{relativeTime}</span>

      {/* Content column */}
      <div className="dice-log-entry__body">
        {hasSource && (
          <span className="dice-log-entry__token-name">{sourceTokenName}</span>
        )}
        {source?.abilityName && (
          <span className="dice-log-entry__ability-name">{source.abilityName}</span>
        )}

        {/* Summary: formula = total */}
        <div className="dice-log-entry__summary">
          <span className="dice-log-entry__formula">{result.formula}</span>
          <span className="dice-log-entry__eq">=</span>
          <span className="dice-log-entry__total">{result.total}</span>
        </div>

        {/* Footer: callout + reroll on same row */}
        <div className="dice-log-entry__footer">
          <div className={cn('dice-log-entry__callout', isExpanded && 'dice-log-entry__callout--open')}>
            <ChevronDown className={cn('dice-log-entry__chevron', isExpanded && 'dice-log-entry__chevron--open')} />
            <span className="dice-log-entry__callout-label">{t('dice.details')}</span>
          </div>
          <LabelTooltip label={t('dice.rollAgain')}>
            <button
              className="btn btn--ghost btn--icon dice-log-entry__repeat"
              onClick={(e) => { e.stopPropagation(); onRepeat(); }}
            >
              <RotateCw />
            </button>
          </LabelTooltip>
        </div>

        {/* Expanded dice detail */}
        {isExpanded && (
          <div className="dice-log-entry__details">
            {result.rolls.map((roll, i) => (
              <span
                key={i}
                className={cn(
                  'dice-log-entry__badge',
                  roll.value === roll.max && 'dice-log-entry__badge--max',
                  roll.value === 1 && 'dice-log-entry__badge--min',
                )}
              >
                {dieLabel(result.rolls, i)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
