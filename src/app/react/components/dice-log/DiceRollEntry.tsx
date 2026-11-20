import React, { useState, useEffect } from 'react';
import { ChevronDown, RotateCw } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import type { DiceRollResult } from '../../../types/diceTypes';
import { TokenPortrait } from '../../../packages/components/shared/TokenPortrait';
import { useDiceAvatar } from '../dice/useDiceAvatar';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { dieLabel, dieStates, droppedAny, rollLine } from '../../../tools/diceLabels';
import { AdvantageTag, listsDice, RolledDiceLine } from '../dice/RolledDiceLine';
import { t } from '../../../i18n';
import { useRollLanded } from '../../../dice3d/rollsInFlight';
import { withoutConstantLabels } from '../../../tools/namedModifiers';
import { rollName } from '../dice3d/diceRollText';

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

  // While its dice are in the air the entry tells nothing the throw has not shown: no total, crit or dice.
  const landed = useRollLanded(result.id);
  const dropping = droppedAny(result.rolls);
  const isCritSuccess = landed && result.crit === 'high';
  const isCritFail = landed && result.crit === 'low';

  const source = result.source;
  const sourceTokenName = source?.tokenName ?? t('dice.unknown');
  const avatar = useDiceAvatar(source);

  const hasSource = source?.type === 'statblock' && source.tokenName;
  const name = rollName(result);

  return (
    <div
      className={cn(
        'dice-log-entry',
        hasSource && 'dice-log-entry--has-avatar',
        isNew && 'dice-log-entry--new',
        isCritSuccess && 'dice-log-entry--crit-success',
        isCritFail && 'dice-log-entry--crit-fail',
      )}
      onClick={() => { if (landed) setIsExpanded(prev => !prev); }}
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
        {name && <span className="dice-log-entry__ability-name">{name}</span>}
        <AdvantageTag side={result.advantage} />

        {/* Summary: formula = total */}
        <div className="dice-log-entry__summary">
          {landed && listsDice(result)
            ? <RolledDiceLine result={result} className="dice-log-entry__formula" />
            : <span className="dice-log-entry__formula">{landed ? rollLine(result) : withoutConstantLabels(result.formula)}</span>}
          <span className="dice-log-entry__eq">=</span>
          <span className="dice-log-entry__total">{landed ? result.total : '…'}</span>
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
        {landed && isExpanded && (
          <div className="dice-log-entry__details">
            {result.rolls.map((roll, i) => (
              <span
                key={i}
                className={cn(
                  'dice-log-entry__badge',
                  dieStates(roll).map((state) => `dice-log-entry__badge--${state}`),
                  roll.colour && 'atlas-die-badge--coloured',
                  dropping && !roll.dropped && !roll.rerolled && 'atlas-die-badge--kept',
                )}
                style={roll.colour ? { '--atlas-die-colour': roll.colour } as React.CSSProperties : undefined}
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
