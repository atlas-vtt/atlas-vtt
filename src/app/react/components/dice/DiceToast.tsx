import React, { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import type { DiceRollResult } from '../../../types/diceTypes';
import { TokenPortrait } from '../../../packages/components/shared/TokenPortrait';
import { CloseButton } from '../../../packages/components/primitives/CloseButton';
import type { RollAudience, RollSourcePresentation, UseDiceAvatar } from './diceSourcePresentation';
import { rollLine } from '../../../tools/diceLabels';
import { listsDice, RolledDiceLine } from './RolledDiceLine';
import { DiceDetails } from './DiceDetails';
import { RollAudienceMark } from './RollAudienceMark';
import { critText, rollName, shownFormula, withSide } from '../dice3d/diceRollText';
import { RollDigits } from '../dice3d/RollDigits';
import { ROLL_LINGER_MS, useLingerTimer } from '../dice3d/useLingerTimer';
import { t } from '../../../i18n';

export type ToastPhase = 'entering' | 'visible' | 'exiting';

interface DiceToastProps {
  result: DiceRollResult;
  /** Who the roll names; unset looks it up as the GM's window does. */
  presentation?: RollSourcePresentation | null | undefined;
  /** Whom the GM's roll was shown to; unset shows no mark. */
  audience?: RollAudience | undefined;
  phase: ToastPhase;
  onDismiss: () => void;
  /** Finds the portrait; called once per render. */
  useAvatar: UseDiceAvatar;
}

/**
 * A roll as a card, where 3D dice are off or cannot show it: on the same floating surface
 * as the dice panel, its formula in the tray's face, the total large beside it, its dice
 * one chip each behind Details (the dropped ones in brackets). The surface itself takes no
 * click: Details and the close button are the card's controls, and Escape dismisses every roll.
 */
export function DiceToast({ result, presentation, audience, phase, onDismiss, useAvatar }: DiceToastProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const detailsId = useId();
  // A pointer over the card holds the clock.
  useLingerTimer(phase === 'exiting' ? null : ROLL_LINGER_MS, onDismiss, hovered);

  const crit = result.crit;
  const critLabel = critText(crit);
  const source = result.source;
  const avatar = useAvatar(source, presentation);
  const presented = presentation !== undefined;
  // A presented roll shows exactly its name, or none: no placeholder, initial or alt text stands in.
  const sourceTokenName = presented ? presentation?.name ?? '' : source?.tokenName ?? t('dice.unknown');
  const hasSource = presented
    ? Boolean(avatar || presentation?.name)
    : source?.type === 'statblock' && Boolean(source.tokenName);
  const name = rollName(result);

  return (
    <div
      className={cn(
        'atlas-dice-toast',
        phase === 'entering' && 'atlas-dice-toast--entering',
        phase === 'exiting' && 'atlas-dice-toast--exiting',
        crit === 'high' && 'atlas-dice-toast--crit-success',
        crit === 'low' && 'atlas-dice-toast--crit-fail',
      )}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <CloseButton className="atlas-dice-toast__close" aria-label={t('diceRoll.dismiss')} onClick={onDismiss} />
      <div className="atlas-dice-toast__body">
        <div className="atlas-dice-toast__main">
          {hasSource && (avatar ? (
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
            {name && <span className="atlas-dice-toast__ability">{name}</span>}
            <span className="atlas-dice-toast__title">
              <span className="atlas-dice-toast__formula">{withSide(shownFormula(rollLine(result)), result)}</span>
              <RollAudienceMark audience={audience} />
            </span>
            {listsDice(result) && <RolledDiceLine result={result} className="atlas-dice-toast__dice" />}
            {critLabel && <span className={cn('atlas-roll-crit', `atlas-roll-crit--${crit}`)}>{critLabel}</span>}
          </div>
        </div>
        <button
          type="button"
          className="atlas-dice-toast__details-toggle"
          aria-expanded={isExpanded}
          aria-controls={isExpanded ? detailsId : undefined}
          onClick={() => setIsExpanded((open) => !open)}
        >
          <ChevronDown
            aria-hidden="true"
            className={cn('atlas-dice-toast__chevron', isExpanded && 'atlas-dice-toast__chevron--open')}
          />
          <span className="atlas-dice-toast__details-label">{t('dice.details')}</span>
        </button>
        {isExpanded && <DiceDetails result={result} id={detailsId} />}
      </div>
      <div className="atlas-dice-toast__result">
        <span className="atlas-dice-toast__total"><RollDigits value={result.total} /></span>
      </div>
    </div>
  );
}
