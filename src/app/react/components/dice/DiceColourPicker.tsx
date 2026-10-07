import React from 'react';
import { cn } from '../../../../utils/cn';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import type { DieTag } from '../../../tools/diceTags';
import { t } from '../../../i18n';

interface DiceColourPickerProps {
  colours: readonly DieTag[];
  /** The colour the next dice are added in; null for none. */
  value: DieTag | null;
  onChange: (tag: DieTag | null) => void;
}

const same = (a: DieTag | null, b: DieTag | null): boolean => a?.color === b?.color && a?.colorName === b?.colorName;

/**
 * The colours the tray's next dice are added in (`dice.registerColours`): "No colour" first, then
 * a swatch per colour, named in text for screen readers so colour is never the only sign.
 */
export function DiceColourPicker({ colours, value, onChange }: DiceColourPickerProps): React.ReactElement {
  return (
    <div className="atlas-dice-tray__colours" role="group" aria-label={t('dice.colour.label')}>
      <button
        type="button"
        className={cn('atlas-dice-tray__colour atlas-dice-tray__colour--none', value === null && 'is-chosen')}
        aria-pressed={value === null}
        onClick={() => onChange(null)}
      >
        {t('dice.colour.none')}
      </button>
      {colours.map((tag) => (
        <LabelTooltip key={`${tag.color}|${tag.colorName}`} label={tag.colorName}>
          <button
            type="button"
            className={cn('atlas-dice-tray__colour', same(value, tag) && 'is-chosen')}
            aria-pressed={same(value, tag)}
            aria-label={tag.colorName}
            style={{ '--atlas-die-tag-colour': tag.color } as React.CSSProperties}
            onClick={() => onChange(tag)}
          />
        </LabelTooltip>
      ))}
    </div>
  );
}
