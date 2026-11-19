import React, { useLayoutEffect } from 'react';
import { useScrollCut } from './useScrollCut';
import { t } from '../../../i18n';

interface DiceTrayFormulaProps {
  ref: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (text: string) => void;
  /** Enter in the field. */
  onEnter: () => void;
  invalid: boolean;
  /** The line under the field that says what to do or what is wrong. */
  describedBy: string;
}

/**
 * The formula field, one line high at every length, so the dice above never move. A formula longer than
 * the field shows its end, where clicks write, unless the GM is typing in it; an end that lies out of view
 * fades out into the field, so cut text always shows that there is more.
 */
export function DiceTrayFormula({ ref, value, onChange, onEnter, invalid, describedBy }: DiceTrayFormulaProps): React.ReactElement {
  useLayoutEffect(() => {
    const field = ref.current;
    if (field && field.ownerDocument.activeElement !== field) field.scrollLeft = field.scrollWidth;
  });
  const cut = useScrollCut(ref);

  return (
    // Only typed text is cut: a placeholder that does not fit says nothing more lies beyond it.
    <div className="atlas-dice-tray__formula-box" data-cut-start={(value !== '' && cut.start) || undefined} data-cut-end={(value !== '' && cut.end) || undefined}>
      <input
        ref={ref}
        type="text"
        className="atlas-dice-tray__formula"
        aria-label={t('diceRoll.formula')}
        aria-describedby={describedBy}
        aria-keyshortcuts="/"
        aria-invalid={invalid || undefined}
        placeholder={t('diceRoll.formulaPlaceholder')}
        spellCheck={false}
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          onEnter();
        }}
      />
    </div>
  );
}
