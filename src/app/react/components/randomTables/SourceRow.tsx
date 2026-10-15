import React, { useEffect, useRef } from 'react';
import { AlertTriangle, MoreHorizontal } from 'lucide-react';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { useOptionalContextMenu, type ContextMenuEntry } from '../../root/ContextMenuContext';
import { MAX_TABLE_LABEL } from '../../../randomTables/tableSettings';
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
  const rowRef = useRef<HTMLButtonElement>(null);
  // Escape ends renaming before the input goes, and its blur must not save after all.
  const settled = useRef(false);
  // Renaming ended from the keyboard hands focus back to the row; a click elsewhere keeps it there.
  const refocus = useRef(false);
  const settle = (typed: string | null): void => {
    if (settled.current) return;
    settled.current = true;
    onRenamed?.(typed);
  };
  useEffect(() => {
    if (renaming) {
      settled.current = false;
      refocus.current = false;
      return;
    }
    if (!refocus.current) return;
    refocus.current = false;
    rowRef.current?.focus();
  }, [renaming]);

  const openMenu = (at: { x: number; y: number }, returnFocus: HTMLElement | null): void => {
    contextMenu?.open(menu(), at, { returnFocus });
  };
  const openBelow = (element: HTMLElement, returnFocus: HTMLElement | null): void => {
    const rect = element.getBoundingClientRect();
    openMenu({ x: rect.left, y: rect.bottom }, returnFocus);
  };
  const onContextMenu = (event: React.MouseEvent): void => {
    event.preventDefault();
    // A menu opened from the keyboard has no point: it hangs from the row.
    if (event.clientX === 0 && event.clientY === 0 && entryRef.current) openBelow(entryRef.current, rowRef.current);
    else openMenu({ x: event.clientX, y: event.clientY }, rowRef.current);
  };

  if (renaming) {
    return (
      <div className="atlas-tables-entry">
        <input
          className="atlas-tables-row atlas-tables-row--rename"
          defaultValue={name}
          maxLength={MAX_TABLE_LABEL}
          aria-label={t('tables.renameField', { name })}
          autoFocus
          onFocus={(event) => event.target.select()}
          onBlur={(event) => settle(event.target.value)}
          onKeyDown={(event) => {
            // Enter that ends an input method's composition is the composition's.
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Enter') {
              refocus.current = true;
              event.currentTarget.blur();
            } else if (event.key === 'Escape') {
              refocus.current = true;
              settle(null);
            } else return;
            event.preventDefault();
            event.stopPropagation();
          }}
        />
      </div>
    );
  }

  const row = (
    <button
      ref={rowRef}
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
          <button type="button" className="atlas-tables-entry__more" onClick={(event) => openBelow(event.currentTarget, event.currentTarget)}>
            <MoreHorizontal />
          </button>
        </LabelTooltip>
      )}
    </div>
  );
}
