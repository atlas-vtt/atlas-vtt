import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { t } from '../../i18n';

interface InitiativeTurnControlsProps {
  fightRuns: boolean;
  round: number;
  tooltipSide: 'left' | 'right';
  onPrevious: () => void;
  onNext: () => void;
}

/** The tracker's foot: previous turn, the round, next turn. A turn hotkey presses its button for a moment. */
export function InitiativeTurnControls({ fightRuns, round, tooltipSide, onPrevious, onNext }: InitiativeTurnControlsProps): React.ReactElement {
  const [pressed, setPressed] = useState<'prev' | 'next' | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    const handleHotkey = (event: Event): void => {
      const { detail } = event as CustomEvent<unknown>;
      if (detail !== 'prev' && detail !== 'next') return;
      setPressed(detail);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setPressed(null), 150);
    };
    window.addEventListener('atlas-initiative-hotkey', handleHotkey);
    return () => {
      window.removeEventListener('atlas-initiative-hotkey', handleHotkey);
      window.clearTimeout(timer);
    };
  }, []);

  const button = (which: 'prev' | 'next'): React.ReactElement => (
    <LabelTooltip label={which === 'prev' ? t('initiative.previousTurn') : t('initiative.nextTurn')} side={tooltipSide}>
      <button
        className={`clickable-icon atlas-initiative-tracker__btn${pressed === which ? ' atlas-initiative-tracker__btn--pressed' : ''}`}
        onClick={which === 'prev' ? onPrevious : onNext}
        disabled={!fightRuns}
      >
        {which === 'prev' ? <ChevronUp /> : <ChevronDown />}
      </button>
    </LabelTooltip>
  );

  return (
    <div className="atlas-initiative-tracker__turn-controls">
      {button('prev')}
      <span className="atlas-initiative-tracker__round">{fightRuns ? t('initiative.roundShort', { round }) : '—'}</span>
      {button('next')}
    </div>
  );
}
