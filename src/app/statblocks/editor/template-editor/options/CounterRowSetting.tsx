import React, { useId } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { t } from '../../../../i18n';
import { ToolButton } from '../../../../packages/components/primitives/ToolButton';
import type { CounterPreset } from '../../../model/templateTypes';
import { isRegainFormula } from '../../../values/counterRegain';
import { useGestureText } from '../inspector/useGestureText';
import type { EditorSession } from '../sessionTypes';

/** The row regaining the formula typed (all of its uses for nothing typed); unchanged for text that is no formula Atlas rolls. */
function withRegain(row: CounterPreset, text: string): CounterPreset {
  const formula = text.trim();
  const { regain: _regain, ...rest } = row;
  if (formula === '') return rest;
  return isRegainFormula(formula) ? { ...rest, regain: formula } : row;
}

/** Typed uses as a whole number of 0 or more, or null for anything else (kept as typed until the field is left). */
function usesOf(text: string): number | null {
  return /^\s*\d+\s*$/.test(text) ? Number.parseInt(text, 10) : null;
}

export interface CounterRowSettingProps {
  row: CounterPreset;
  index: number;
  count: number;
  session: EditorSession;
  disabled: boolean;
  /** Changes the row as the template holds it now, one undo step. */
  onEdit: (change: (row: CounterPreset) => CounterPreset) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
}

/** One row a Counters field starts with: its name and uses, how many come back when it is restored, and Move and Remove. */
export function CounterRowSetting({ row, index, count, session, disabled, onEdit, onMove, onRemove }: CounterRowSettingProps): React.JSX.Element {
  const nameId = useId();
  const usesId = useId();
  const regainId = useId();
  const name = useGestureText({ value: row.name, session, onText: (text) => { if (text.trim()) onEdit((current) => ({ ...current, name: text })); } });
  const uses = useGestureText({
    value: String(row.max),
    session,
    onText: (text) => {
      const max = usesOf(text);
      if (max !== null) onEdit((current) => ({ ...current, max }));
    },
  });
  const regain = useGestureText({ value: row.regain ?? '', session, onText: (text) => onEdit((current) => withRegain(current, text)) });
  const named = row.name.trim() || t('statblock.counterRow', { n: index + 1 });
  return (
    <div className="atlas-te-counter-row">
      <span id={nameId} hidden>{t('statblock.counterRow', { n: index + 1 })}</span>
      <span id={usesId} hidden>{t('statblock.counterUses', { name: named })}</span>
      <span id={regainId} hidden>{t('statblock.counterRegain', { name: named })}</span>
      <div className="atlas-te-setting__inline">
        <input {...name} type="text" className="atlas-te-input" aria-labelledby={nameId} disabled={disabled} spellCheck={false} />
        <input {...uses} type="text" inputMode="numeric" className="atlas-te-input atlas-te-input--count" aria-labelledby={usesId} disabled={disabled} />
        <ToolButton icon={X} label={t('statblock.counterRemove', { name: named })} isActive={false} disabled={disabled} onClick={onRemove} />
      </div>
      <div className="atlas-te-setting__inline">
        <input {...regain} type="text" className="atlas-te-input atlas-te-input--regain" aria-labelledby={regainId}
          placeholder={t('statblock.counterRegainAll')} disabled={disabled} spellCheck={false} />
        <ToolButton icon={ArrowUp} label={t('statblock.counterMoveUp', { name: named })} isActive={false} disabled={disabled || index === 0} onClick={() => onMove(index - 1)} />
        <ToolButton icon={ArrowDown} label={t('statblock.counterMoveDown', { name: named })} isActive={false} disabled={disabled || index === count - 1} onClick={() => onMove(index + 1)} />
      </div>
    </div>
  );
}
