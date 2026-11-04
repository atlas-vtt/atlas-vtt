import React from 'react';
import { Dices, FilePlus, Lock, LockOpen } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import type { TableResult } from '../../../loot/lootHistory';
import { t } from '../../../i18n';

/** What a generator's result card can do beside showing it. */
export interface GeneratorCardHandlers {
  /** Whether the result can be rolled again here: in Latest, while its generator is listed as it was. */
  canReroll: (result: TableResult) => boolean;
  onRerollPart: (result: TableResult, row: number) => void;
  onRerollUnlocked: (result: TableResult, locked: ReadonlySet<number>) => void;
  /** Whether its generator has a save folder. */
  canSave: (result: TableResult) => boolean;
  onSave: (result: TableResult) => void;
}

interface PartControlsProps {
  label: string;
  /** The part's row in its generator. */
  row: number;
  locked: boolean;
  onLock: (row: number) => void;
  onReroll: (row: number) => void;
}

/** A part's lock, which keeps it through Reroll unlocked, and its own reroll. */
export function PartControls({ label, row, locked, onLock, onReroll }: PartControlsProps): React.ReactElement {
  // One name, pressed or not: the button says whether the part is locked.
  const lockLabel = t('tables.generator.lock', { part: label });
  const rerollLabel = t('tables.generator.rerollPart', { part: label });
  return (
    <span className="atlas-table-card__part-controls">
      <LabelTooltip label={lockLabel}>
        <Button
          variant="ghost"
          size="icon"
          className={`atlas-table-card__part-action${locked ? ' is-locked' : ''}`}
          aria-label={lockLabel}
          aria-pressed={locked}
          onClick={() => onLock(row)}
        >
          {locked ? <Lock /> : <LockOpen />}
        </Button>
      </LabelTooltip>
      <LabelTooltip label={rerollLabel}>
        <Button variant="ghost" size="icon" className="atlas-table-card__part-action" aria-label={rerollLabel} onClick={() => onReroll(row)}>
          <Dices />
        </Button>
      </LabelTooltip>
    </span>
  );
}

/** Writes the result as a note into its generator's save folder. */
export function SaveAsNoteButton({ onSave }: { onSave: () => void }): React.ReactElement {
  return (
    <LabelTooltip label={t('tables.generator.save')}>
      <Button variant="ghost" size="icon" className="atlas-loot-card__action" aria-label={t('tables.generator.save')} onClick={onSave}>
        <FilePlus />
      </Button>
    </LabelTooltip>
  );
}

/** Rolls every part again but the locked ones, and the name. */
export function RerollUnlockedButton({ onReroll }: { onReroll: () => void }): React.ReactElement {
  return (
    <button type="button" className="atlas-loot-text-button atlas-table-card__reroll" onClick={onReroll}>
      <Dices />
      <span>{t('tables.generator.rerollUnlocked')}</span>
    </button>
  );
}

/** `locked` with `row` switched. */
export function toggledLock(locked: ReadonlySet<number>, row: number): ReadonlySet<number> {
  const next = new Set(locked);
  if (!next.delete(row)) next.add(row);
  return next;
}
