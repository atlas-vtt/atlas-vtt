import React, { useEffect, useRef } from 'react';
import { Check, Download } from 'lucide-react';
import { Button } from '../../primitives/button';
import { useDialogEscape } from '../../primitives/useDialogEscape';
import { useKeepInView } from '../../primitives/useKeepInView';
import { t } from '../../../../i18n';
import type { StatblockSet } from '../../../../services/stockPacks/starterStatblocks';
import { STATBLOCK_COUNTS } from '../../../../services/stockPacks/starterStatblocks';
import { cn } from '../../../../../utils/cn';

export type StarterChoice = StatblockSet | 'none';

const OPTIONS: readonly { value: StarterChoice; label: string; hint: string }[] = [
  { value: 'none', label: t('am.bestiary.optionNone'), hint: t('am.bestiary.optionNoneHint') },
  { value: '5e', label: t('am.bestiary.optionFiveE'), hint: t('am.bestiary.optionFiveEHint', { count: STATBLOCK_COUNTS['5e'] }) },
  { value: 'cairn', label: t('am.bestiary.optionCairn'), hint: t('am.bestiary.optionCairnHint', { count: STATBLOCK_COUNTS.cairn }) },
];

interface StarterTokensChoiceProps {
  choice: StarterChoice;
  onChoose: (choice: StarterChoice) => void;
  onDownload: () => void;
  onClose: () => void;
  /** Below the button in the empty Tokens tab, above it at the sidebar's foot. */
  placement: 'top' | 'bottom';
  /** The download's size in MB, for the button to say. */
  size: number;
  /** Opened from the keyboard: focus goes to the chosen option. A press leaves it, or the option shows a ring. */
  focusChoice: boolean;
}

/**
 * The popover the download button opens: which statblocks the starter tokens come with, then
 * Download. Arrow keys move through the choices; Escape closes it before the asset manager hears it.
 */
export function StarterTokensChoice({ choice, onChoose, onDownload, onClose, placement, size, focusChoice }: StarterTokensChoiceProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const keepInView = useKeepInView(ref, true, placement);
  useDialogEscape(ref, onClose);

  useEffect(() => {
    if (focusChoice) ref.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }, [focusChoice]);

  const step = (event: React.KeyboardEvent): void => {
    const by = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (by === 0) return;
    event.preventDefault();
    const at = OPTIONS.findIndex((option) => option.value === choice);
    const next = OPTIONS[(at + by + OPTIONS.length) % OPTIONS.length];
    if (!next) return;
    onChoose(next.value);
    ref.current?.querySelector<HTMLElement>(`[data-choice="${next.value}"]`)?.focus();
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={t('am.bestiary.statblocks')}
      className={cn('atlas-dropdown-content', `atlas-dropdown-content--${placement}`, 'atlas-dropdown-content--center', 'atlas-starter-choice', keepInView.capped && 'atlas-keep-in-view--capped')}
      style={keepInView.style}
    >
      <div role="radiogroup" aria-label={t('am.bestiary.statblocks')} onKeyDown={step}>
        {OPTIONS.map((option) => {
          const chosen = option.value === choice;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={chosen}
              tabIndex={chosen ? 0 : -1}
              data-choice={option.value}
              className={cn('atlas-dropdown-item', 'atlas-starter-choice__option', chosen && 'atlas-active')}
              onClick={() => onChoose(option.value)}
            >
              <span className="atlas-starter-choice__text">
                <span>{option.label}</span>
                <small>{option.hint}</small>
              </span>
              {chosen && <Check className="atlas-starter-choice__tick" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <Button variant="default" className="atlas-starter-choice__download" onClick={onDownload}>
        <Download />
        <span>{t('am.bestiary.confirm', { size })}</span>
      </Button>
    </div>
  );
}
