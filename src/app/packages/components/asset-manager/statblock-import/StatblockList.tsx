import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { TFile, type App } from 'obsidian';
import { ImageOff } from 'lucide-react';
import { TokenPortrait } from '../../shared/TokenPortrait';
import { LabelTooltip } from '../../primitives/tooltip';
import type { StatblockImportCandidate, StatblockImportStatus } from '../../../../services/statblockImportCandidates';
import { t } from '../../../../i18n';

/** A row's height until measured: the 48px portrait, its padding and the border between rows. */
const ROW_HEIGHT = 73;
const OVERSCAN_ROWS = 8;

const statusLabels: Record<StatblockImportStatus, string> = {
  ready: t('sbImport.status.ready'), imported: t('sbImport.status.imported'), 'missing-image': t('sbImport.status.missingImage'), 'remote-image': t('sbImport.status.remoteImage'), conflict: t('sbImport.status.conflict'),
};

function thumbnail(app: App, row: StatblockImportCandidate): string | undefined {
  const file = row.imagePath ? app.vault.getAbstractFileByPath(row.imagePath) : null;
  return file instanceof TFile ? app.vault.getResourcePath(file) : undefined;
}

interface StatblockListProps {
  app: App;
  rows: readonly StatblockImportCandidate[];
  selected: ReadonlySet<string>;
  /** Notes already added to the import. */
  queued: ReadonlySet<string>;
  disabled: boolean;
  /** The element that scrolls the list, passed as state since an ancestor's ref is set only after this list's layout effects. */
  scrollElement: HTMLElement | null;
  onToggle: (path: string) => void;
}

/**
 * The statblock notes found by a scan. Only the rows in and around the view are
 * mounted, so a bestiary of thousands of creatures loads just the portraits
 * that are on screen.
 */
export function StatblockList({ app, rows, selected, queued, disabled, scrollElement, onToggle }: StatblockListProps): React.JSX.Element {
  const listRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN_ROWS,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });

  return (
    <div ref={listRef} className="atlas-statblock-import__list" aria-label={t('sbImport.list')} style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map(({ index, start }) => {
        const row = rows[index]!;
        const url = thumbnail(app, row);
        const isQueued = queued.has(row.path);
        const status = <span className={`atlas-statblock-import__status atlas-statblock-import__status--${row.status}`}>{isQueued ? t('sbImport.added') : statusLabels[row.status]}</span>;
        return (
          <div
            key={row.path}
            ref={virtualizer.measureElement}
            data-index={index}
            className="atlas-statblock-import__row"
            style={{ transform: `translateY(${start - virtualizer.options.scrollMargin}px)` }}
          >
            <input type="checkbox" aria-label={`Select ${row.name}`} checked={selected.has(row.path)} disabled={disabled || row.status !== 'ready' || isQueued} onChange={() => onToggle(row.path)} />
            <span className="atlas-statblock-import__portrait">{url ? <TokenPortrait src={url} alt="" showRing={false} reveal /> : <ImageOff size={20} />}</span>
            <span className="atlas-statblock-import__identity"><strong>{row.name}</strong><span>{row.path}</span></span>
            {row.status === 'ready' ? status : <LabelTooltip label={row.detail} describe>{status}</LabelTooltip>}
          </div>
        );
      })}
    </div>
  );
}
