import './statblock-import.scss';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { App } from 'obsidian';
import { Search } from 'lucide-react';
import { ObsidianMenuDropdown } from '../../shared/ObsidianMenuDropdown';
import { Button } from '../../primitives/button';
import { ProgressStatus } from '../../primitives/ProgressStatus';
import { useFrameProgress } from '../../primitives/useFrameProgress';
import { StatblockTokenImportService } from '../../../../services/StatblockTokenImportService';
import { statblockPreviewImages } from '../token-creator/statblockPreviewImages';
import type { PreviewImage } from '../token-creator/types';
import type { StatblockImportCandidate } from '../../../../services/statblockImportCandidates';
import { StatblockList } from './StatblockList';
import { Skeleton, SkeletonGroup, skeletonTextWidth } from '../../primitives/Skeleton';
import { t } from '../../../../i18n';

const SCAN_SKELETON_ROWS = 6;

/** The list a scan will fill, as placeholder rows; the progress line above it says what is happening. */
function ScanSkeleton(): React.JSX.Element {
  return (
    <SkeletonGroup className="atlas-statblock-import__list">
      {Array.from({ length: SCAN_SKELETON_ROWS }, (_, index) => (
        <div key={index} className="atlas-statblock-import__pending-row">
          <Skeleton className="atlas-statblock-import__pending-check" />
          <Skeleton className="atlas-statblock-import__pending-portrait" />
          <span className="atlas-statblock-import__identity">
            <strong><Skeleton shape="text" width={skeletonTextWidth(index, 40)} /></strong>
            <span><Skeleton shape="text" width={skeletonTextWidth(index + 2, 60)} /></span>
          </span>
        </div>
      ))}
    </SkeletonGroup>
  );
}

interface Props {
  app: App;
  queuedPaths: readonly string[];
  onAdd: (images: PreviewImage[]) => void;
  onClose: () => void;
  controller: AbortController;
  onRunningChange?: (running: boolean) => void;
}
export function StatblockImportContent({ app, queuedPaths, onAdd, onClose, controller, onRunningChange }: Props): React.JSX.Element {
  const importer = useMemo(() => new StatblockTokenImportService(app), [app]);
  const [rows, setRows] = useState<StatblockImportCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [layout, setLayout] = useState('');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [scanVersion, setScanVersion] = useState(0);
  const { progress: scanned, report: reportScan, clear: clearScan } = useFrameProgress();
  const { progress: loadedImages, report: reportImages, clear: clearImages } = useFrameProgress();
  const layoutId = useId();
  const queued = useMemo(() => new Set(queuedPaths), [queuedPaths]);
  const queuedRef = useRef(queued);
  queuedRef.current = queued;
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError('');
    clearScan();
    void importer.scan(controller.signal, reportScan).then(next => {
      if (!mounted || controller.signal.aborted) return;
      setRows(next);
      setLayout('');
      setSelected(new Set(next.filter(row => row.status === 'ready' && !queuedRef.current.has(row.path)).map(row => row.path)));
    }).catch((reason: unknown) => {
      if (mounted) setError(reason instanceof Error ? reason.message : t('sbImport.scanFailed'));
    }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [app, importer, controller, scanVersion, clearScan, reportScan]);

  const scopedRows = rows.filter(row => !layout || (row.layoutName ?? t('sbImport.unspecified')) === layout);
  const selectedRows = scopedRows.filter(row => selected.has(row.path) && !queued.has(row.path));
  const filtered = scopedRows.filter(row => `${row.name} ${row.path}`.toLowerCase().includes(query.toLowerCase()));
  const ready = scopedRows.filter(row => row.status === 'ready');
  const disabled = loading || running;
  const toggle = (path: string): void => {
    setSelected(current => { const next = new Set(current); if (next.has(path)) next.delete(path); else next.add(path); return next; });
  };
  const startImport = async (): Promise<void> => {
    if (running || !selectedRows.length) return;
    setRunning(true);
    onRunningChange?.(true);
    setError('');
    clearImages();
    try {
      const images = await statblockPreviewImages(app, selectedRows, controller.signal, reportImages);
      if (!controller.signal.aborted) onAdd(images);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('sbImport.loadFailed'));
    } finally { setRunning(false); onRunningChange?.(false); }
  };

  return (
    <>
      <div ref={setScrollElement} className="atlas-token-creator__previews atlas-statblock-import">
        <p className="atlas-statblock-import__intro">{t('sbImport.intro')}</p>
        {error && <p role="alert" className="atlas-statblock-import__error">{error}</p>}
        {loading ? (
          <>
            <div className="atlas-statblock-import__scanning">
              <ProgressStatus task={{ label: t('sbImport.scanningNotes'), done: scanned?.done ?? 0, total: scanned?.total ?? 0 }} />
            </div>
            <ScanSkeleton />
          </>
        ) : (
          <>
            <div className="atlas-statblock-import__summary" role="status">
              <strong>{ready.length} ready</strong><span>{scopedRows.filter(r => r.status === 'imported').length} already imported</span><span>{scopedRows.length - ready.length - scopedRows.filter(r => r.status === 'imported').length} need attention</span>
            </div>
            <div className="atlas-statblock-import__controls">
              <label htmlFor={layoutId}>{t('sbImport.layout')}</label>
              <ObsidianMenuDropdown
                id={layoutId}
                value={layout}
                onChange={setLayout}
                disabled={disabled}
                placeholder={t('sbImport.allLayouts')}
                options={Object.fromEntries<string>([
                  ['', t('sbImport.allLayouts')] as const,
                  ...[...new Set(rows.map(row => row.layoutName ?? t('sbImport.unspecified')))].sort().map(name => [name, name] as const),
                ])}
              />
            </div>
            <div className="atlas-statblock-import__controls">
              <label className="atlas-statblock-import__search"><Search size={16} /><input type="search" aria-label={t('sbImport.search')} placeholder={t('sbImport.searchPlaceholder')} value={query} onChange={e => setQuery(e.target.value)} /></label>
            </div>
            <div className="atlas-statblock-import__selection">
              <Button variant="ghost" size="sm" disabled={disabled} onClick={() => setSelected(current => new Set([...current, ...filtered.filter(r => r.status === 'ready' && !queued.has(r.path)).map(r => r.path)]))}>{t('sbImport.selectShown')}</Button>
              <Button variant="ghost" size="sm" disabled={disabled || selectedRows.length === 0} onClick={() => setSelected(new Set())}>{t('dice.clearSelection')}</Button>
              <span>{selectedRows.length} selected</span>
            </div>
            {filtered.length > 0
              ? <StatblockList app={app} rows={filtered} selected={selected} queued={queued} disabled={disabled} scrollElement={scrollElement} onToggle={toggle} />
              : <p>{query ? t('sbImport.noMatch') : t('sbImport.noneFoundInVault')}</p>}
          </>
        )}
      </div>
      <footer className="atlas-token-creator__footer atlas-statblock-import__footer">
        <ProgressStatus task={running ? { label: t('sbImport.loadingImagesStatus'), done: loadedImages?.done ?? 0, total: loadedImages?.total ?? selectedRows.length } : null}>
          <Button variant="ghost" disabled={disabled} onClick={() => setScanVersion(v => v + 1)}>{t('sbImport.scanAgain')}</Button>
        </ProgressStatus>
        <div className="atlas-token-creator__actions">
          <Button variant="outline" onClick={onClose}>{t('sbImport.back')}</Button>
          <Button disabled={disabled || selectedRows.length === 0 || Boolean(error)} onClick={() => { void startImport(); }}>{running ? t('sbImport.loadingImages') : t('sbImport.addN', { count: selectedRows.length })}</Button>
        </div>
      </footer>
    </>
  );
}
