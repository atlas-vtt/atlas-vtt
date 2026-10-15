import React, { useRef } from 'react';
import { AlertTriangle, MoreHorizontal } from 'lucide-react';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { useOptionalContextMenu, type ContextMenuEntry } from '../../root/ContextMenuContext';
import { t } from '../../../i18n';

interface SourceRowProps {
  name: string;
  /** The die or the number of entries, at the row's end. */
  fact: string;
  /** What is wrong with the source, one line each; the row carries a warning when any. */
  problems: readonly string[];
  selected: boolean;
  onSelect: () => void;
  /** What the row's menu offers (rename, open, remove). */
  menu: () => ContextMenuEntry[];
  /** The name is being typed in place of the row. */
  renaming?: boolean;
  /** The typed name, or null when renaming was cancelled. */
  onRenamed?: (name: string | null) => void;
}

/** A source to roll on, with its menu behind ⋯ and a right-click; renamed in place. */
export function SourceRow({ name, fact, problems, selected, onSelect, menu, renaming = false, onRenamed }: SourceRowProps): React.ReactElement {
  const contextMenu = useOptionalContextMenu();
  const entryRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  // Escape ends renaming before the input goes, and its blur must not save after all.
  const settled = useRef(false);
  const settle = (typed: string | null): void => {
    if (settled.current) return;
    settled.current = true;
    onRenamed?.(typed);
  };

  const openMenu = (at: { x: number; y: number }): void => {
    contextMenu?.open(menu(), at, { returnFocus: moreRef.current });
  };
  const openBelow = (element: HTMLElement): void => {
    const rect = element.getBoundingClientRect();
    openMenu({ x: rect.left, y: rect.bottom });
  };
  const onContextMenu = (event: React.MouseEvent): void => {
    event.preventDefault();
    // A menu opened from the keyboard has no point: it hangs from the row.
    if (event.clientX === 0 && event.clientY === 0 && entryRef.current) openBelow(entryRef.current);
    else openMenu({ x: event.clientX, y: event.clientY });
  };

  if (renaming) {
    return (
      <div className="atlas-tables-entry">
        <input
          className="atlas-tables-row atlas-tables-row--rename"
          defaultValue={name}
          aria-label={t('tables.renameField', { name })}
          autoFocus
          onFocus={(event) => {
            settled.current = false;
            event.target.select();
          }}
          onBlur={(event) => settle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            else if (event.key === 'Escape') settle(null);
            else return;
            event.preventDefault();
            event.stopPropagation();
          }}
        />
      </div>
    );
  }

  const row = (
    <button
      type="button"
      className={`atlas-tables-row${selected ? ' is-selected' : ''}`}
      aria-current={selected || undefined}
      onClick={onSelect}
    >
      <span className="atlas-tables-row__name">{name}</span>
      {problems.length > 0 && <AlertTriangle className="atlas-tables-row__problem" aria-hidden />}
      <span className="atlas-tables-row__fact">{fact}</span>
    </button>
  );
  return (
    <div className="atlas-tables-entry" ref={entryRef} onContextMenu={onContextMenu}>
      {problems.length > 0 ? <LabelTooltip describe multiline label={problems.join(' · ')}>{row}</LabelTooltip> : row}
      {contextMenu && (
        <LabelTooltip label={t('tables.options')}>
          <button ref={moreRef} type="button" className="atlas-tables-entry__more" onClick={(event) => openBelow(event.currentTarget)}>
            <MoreHorizontal />
          </button>
        </LabelTooltip>
      )}
    </div>
  );
}
