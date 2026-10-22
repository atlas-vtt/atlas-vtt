import React, { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { t } from '../../../i18n';
import './give-quantity.scss';

// ponytail: a book holds each copy as its own item (no stacks) and keeps its last 200, so a give stays small.
export const MAX_GIVE_QUANTITY = 20;

/** How many copies the open give menu hands over; the menu's rows read it when chosen. */
export interface GiveCount {
  value: number;
}

function clamped(value: number): number {
  return Math.min(MAX_GIVE_QUANTITY, Math.max(1, value));
}

/** The give menu's quantity: − and + beside the number, which can be clicked and typed over. */
export function GiveQuantity({ count }: { count: GiveCount }): React.ReactElement {
  const [text, setText] = useState(String(count.value));
  const value = count.value;
  const set = (next: number): void => {
    count.value = clamped(next);
    setText(String(count.value));
  };

  return (
    <div className="atlas-loot-give-quantity">
      <span className="atlas-loot-give-quantity__label">{t('loot.give.quantity')}</span>
      <LabelTooltip label={t('loot.give.fewer')}>
        <button type="button" className="atlas-loot-give-quantity__step" aria-label={t('loot.give.fewer')} disabled={value <= 1} onClick={() => set(value - 1)}>
          <Minus />
        </button>
      </LabelTooltip>
      <input
        className="atlas-loot-give-quantity__value"
        type="text"
        inputMode="numeric"
        aria-label={t('loot.give.quantity')}
        value={text}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          const digits = event.currentTarget.value.replace(/\D/g, '').slice(0, 3);
          setText(digits);
          if (digits) count.value = clamped(Number(digits));
        }}
        onBlur={() => set(count.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' || event.key === 'Tab') return;
          // The menu reads letters and arrows as its own; typed digits stay in the field.
          event.stopPropagation();
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
      <LabelTooltip label={t('loot.give.more')}>
        <button type="button" className="atlas-loot-give-quantity__step" aria-label={t('loot.give.more')} disabled={value >= MAX_GIVE_QUANTITY} onClick={() => set(value + 1)}>
          <Plus />
        </button>
      </LabelTooltip>
    </div>
  );
}
