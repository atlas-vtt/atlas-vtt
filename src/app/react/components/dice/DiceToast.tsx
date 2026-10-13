import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import type { DiceRollResult } from '../../../types/diceTypes';
import { TokenPortrait } from '../../../packages/components/shared/TokenPortrait';
import type { RollSourcePresentation, UseDiceAvatar } from './diceSourcePresentation';
import { DICE_TOAST_KNOT_SYMBOL_ID } from './diceToastOrnament';
import { dieLabel } from '../../../tools/diceLabels';
import { t } from '../../../i18n';

export type ToastPhase = 'entering' | 'visible' | 'exiting';

const CORNERS = ['tl', 'tr', 'bl', 'br'] as const;

interface DiceToastProps {
  result: DiceRollResult;
  /** Who the roll names; unset looks it up as the GM's window does. */
  presentation?: RollSourcePresentation | null | undefined;
  phase: ToastPhase;
  onDismiss: () => void;
  /** Finds the portrait; called once per render. */
  useAvatar: UseDiceAvatar;
}

export function DiceToast({ result, presentation, phase, onDismiss, useAvatar }: DiceToastProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);

  const crit = result.crit;
  const source = result.source;
  const avatar = useAvatar(source, presentation);
  const presented = presentation !== undefined;
  // A presented roll shows exactly its name, or none: no placeholder, initial or alt text stands in.
  const sourceTokenName = presented ? presentation?.name ?? '' : source?.tokenName ?? t('dice.unknown');
  const hasSource = presented
    ? Boolean(avatar || presentation?.name)
    : source?.type === 'statblock' && Boolean(source.tokenName);

  const handleToggleDetails = (e: React.MouseEvent): void => {
    e.stopPropagation();
    setIsExpanded((prev) => !prev);
  };

  return (
    <div
      className={cn(
        'atlas-dice-toast',
        phase === 'entering' && 'atlas-dice-toast--entering',
        phase === 'exiting' && 'atlas-dice-toast--exiting',
        crit === 'high' && 'atlas-dice-toast--crit-success',
        crit === 'low' && 'atlas-dice-toast--crit-fail',
      )}
      onClick={onDismiss}
    >
      {CORNERS.map((corner) => (
        <svg
          key={corner}
          className={cn('atlas-dice-toast__corner', `atlas-dice-toast__corner--${corner}`)}
          viewBox="188 0 260 260"
          aria-hidden="true"
        >
          <use href={`#${DICE_TOAST_KNOT_SYMBOL_ID}`} />
        </svg>
      ))}
      <div className="atlas-dice-toast__body">
        <div className="atlas-dice-toast__main">
          {hasSource &&
          (avatar ? (
            <TokenPortrait
              className="atlas-dice-toast__avatar"
              src={avatar.src}
              alt={sourceTokenName}
              showRing={avatar.showRing}
              ringColor={avatar.ringColor}
            />
          ) : (
            <div className="atlas-dice-toast__avatar atlas-dice-toast__avatar--fallback">
              {sourceTokenName.charAt(0).toUpperCase()}
            </div>
          ))}
        <div className="atlas-dice-toast__content">
          {hasSource && sourceTokenName && <span className="atlas-dice-toast__name">{sourceTokenName}</span>}
          {source?.abilityName && (
            <span className="atlas-dice-toast__ability">{source.abilityName}</span>
          )}
          <span className="atlas-dice-toast__formula">{result.formula}</span>
        </div>
        </div>
        <div className="atlas-dice-toast__details-toggle" onClick={handleToggleDetails}>
        <ChevronDown
          className={cn('atlas-dice-toast__chevron', isExpanded && 'atlas-dice-toast__chevron--open')}
        />
        <span className="atlas-dice-toast__details-label">{t('dice.details')}</span>
      </div>
        {isExpanded && (
          <div className="atlas-dice-toast__details">
            {result.rolls.map((roll, i) => (
              <span
                key={i}
                className={cn(
                  'atlas-dice-toast__die-badge',
                  roll.value === roll.max && 'atlas-dice-toast__die-badge--max',
                  roll.value === 1 && 'atlas-dice-toast__die-badge--min',
                )}
              >
                {dieLabel(result.rolls, i)}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="atlas-dice-toast__result">
        <span className="atlas-dice-toast__total">{result.total}</span>
      </div>
    </div>
  );
}
