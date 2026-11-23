import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { Button } from '../../packages/components/primitives/button';
import { t } from '../../i18n';

interface InitiativeTurnControlsProps {
  tooltipSide: 'left' | 'right';
  onPrevious: () => void;
  onNext: () => void;
}

/**
 * The bar floating below the tracker during a fight: previous and next turn. It shows while the pointer is near the
 * tracker, and for a moment when a turn hotkey presses its button.
 */
export function InitiativeTurnControls({ tooltipSide, onPrevious, onNext }: InitiativeTurnControlsProps): React.ReactElement {
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
      <Button
        variant="ghost"
        size="icon"
        className={`atlas-initiative-tracker__btn${pressed === which ? ' atlas-initiative-tracker__btn--pressed' : ''}`}
        onClick={which === 'prev' ? onPrevious : onNext}
      >
        {which === 'prev' ? <ChevronUp /> : <ChevronDown />}
      </Button>
    </LabelTooltip>
  );

  return (
    <div className="atlas-initiative-tracker__float atlas-initiative-tracker__float--bottom">
      {button('prev')}
      {button('next')}
    </div>
  );
}
