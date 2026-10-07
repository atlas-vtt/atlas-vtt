import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import type { DiceRollResult } from '../../../types/diceTypes';
import { TokenPortrait } from '../../../packages/components/shared/TokenPortrait';
import type { RollSourcePresentation, UseDiceAvatar } from './diceSourcePresentation';
import { DICE_TOAST_KNOT_SYMBOL_ID } from './diceToastOrnament';
import { DiceBadges, type DiceBadgeClasses } from './DiceBadges';
import { t } from '../../../i18n';

export type ToastPhase = 'entering' | 'visible' | 'exiting';

const CORNERS = ['tl', 'tr', 'bl', 'br'] as const;
const TOAST_BADGES: DiceBadgeClasses = { badge: 'atlas-dice-toast__die-badge', group: 'atlas-dice-toast__tag-group', tag: 'atlas-dice-toast__tag' };

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
  // Someone other than the GM is named as who rolled it; otherwise the token, as shown.
  const name = result.rolledBy || (hasSource ? sourceTokenName : '');

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
          {name && <span className="atlas-dice-toast__name">{name}</span>}
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
            <DiceBadges result={result} classes={TOAST_BADGES} />
          </div>
        )}
      </div>
      <div className="atlas-dice-toast__result">
        <span className="atlas-dice-toast__total">{result.total}</span>
      </div>
    </div>
  );
}
