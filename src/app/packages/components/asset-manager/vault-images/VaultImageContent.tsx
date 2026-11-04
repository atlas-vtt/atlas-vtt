import '../statblock-import/statblock-import.scss';
import React, { useEffect, useMemo, useState } from 'react';
import { TFile, type App } from 'obsidian';
import { Search } from 'lucide-react';
import { Button } from '../../primitives/button';
import { ProgressStatus } from '../../primitives/ProgressStatus';
import { useFrameProgress } from '../../primitives/useFrameProgress';
import { vaultImageFile } from '../token-creator/vaultImageFile';
import type { CreatorMode, PreviewImage } from '../token-creator/types';
import { VaultImageGrid } from './VaultImageGrid';
import { VaultImageThumbnails } from './vaultImageThumbnails';
import { matchingVaultImages, vaultImages } from './vaultImageFiles';
import { t } from '../../../../i18n';

interface Props {
  app: App;
  mode: CreatorMode;
  /** Vault images already added to the creator. */
  queuedPaths: readonly string[];
  onAdd: (images: PreviewImage[]) => void;
  onClose: () => void;
  controller: AbortController;
  onRunningChange?: (running: boolean) => void;
}

/** Reads the chosen images into the creator's intake, as uploads; the vault's files stay as they are. */
async function readImages(app: App, paths: readonly string[], signal: AbortSignal, onProgress: (done: number, total: number) => void): Promise<PreviewImage[]> {
  const images: PreviewImage[] = [];
  for (const path of paths) {
    if (signal.aborted) return [];
    onProgress(images.length, paths.length);
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error(t('vaultImages.gone', { path }));
    images.push({ file: await vaultImageFile(app, file), vaultPath: path });
  }
  return signal.aborted ? [] : images;
}

/** The creators' "From vault" source: images already in the vault become tokens or maps. */
export function VaultImageContent({ app, mode, queuedPaths, onAdd, onClose, controller, onRunningChange }: Props): React.JSX.Element {
  const files = useMemo(() => vaultImages(app), [app]);
  const thumbnails = useMemo(() => new VaultImageThumbnails(app), [app]);
  useEffect(() => () => thumbnails.dispose(), [thumbnails]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const { progress: loaded, report: reportLoaded, clear: clearLoaded } = useFrameProgress();
  const queued = useMemo(() => new Set(queuedPaths), [queuedPaths]);
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);

  const filtered = useMemo(() => matchingVaultImages(files, query), [files, query]);
  const chosen = [...selected].filter((path) => !queued.has(path));
  const toggle = (path: string): void => {
    setSelected((current) => { const next = new Set(current); if (next.has(path)) next.delete(path); else next.add(path); return next; });
  };
  const add = async (): Promise<void> => {
    if (running || chosen.length === 0) return;
    setRunning(true);
    onRunningChange?.(true);
    setError('');
    clearLoaded();
    try {
      const images = await readImages(app, chosen, controller.signal, reportLoaded);
      if (!controller.signal.aborted) onAdd(images);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('vaultImages.loadFailed'));
    } finally { setRunning(false); onRunningChange?.(false); }
  };

  return (
    <>
      <div ref={setScrollElement} className="atlas-token-creator__previews atlas-statblock-import">
        <p className="atlas-statblock-import__intro">{t(`vaultImages.intro.${mode}`)}</p>
        {error && <p role="alert" className="atlas-statblock-import__error">{error}</p>}
        <div className="atlas-statblock-import__controls">
          <label className="atlas-statblock-import__search"><Search size={16} /><input type="search" aria-label={t('vaultImages.search')} placeholder={t('vaultImages.searchPlaceholder')} value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        </div>
        <div className="atlas-statblock-import__selection">
          <Button variant="ghost" size="sm" disabled={running || filtered.length === 0} onClick={() => setSelected((current) => new Set([...current, ...filtered.map((file) => file.path).filter((path) => !queued.has(path))]))}>{t('sbImport.selectShown')}</Button>
          <Button variant="ghost" size="sm" disabled={running || chosen.length === 0} onClick={() => setSelected(new Set())}>{t('dice.clearSelection')}</Button>
          <span>{t('vaultImages.selected', { count: chosen.length })}</span>
        </div>
        {filtered.length > 0
          ? <VaultImageGrid files={filtered} thumbnails={thumbnails} pick={{ kind: 'many', selected, queued, onToggle: toggle }} disabled={running} scrollElement={scrollElement} />
          : <p>{query ? t('vaultImages.noMatch') : t('vaultImages.noneFound')}</p>}
      </div>
      <footer className="atlas-token-creator__footer atlas-statblock-import__footer">
        <ProgressStatus task={running ? { label: t('sbImport.loadingImagesStatus'), done: loaded?.done ?? 0, total: loaded?.total ?? chosen.length } : null} />
        <div className="atlas-token-creator__actions">
          <Button variant="outline" onClick={onClose}>{t('sbImport.back')}</Button>
          <Button disabled={running || chosen.length === 0} onClick={() => { void add(); }}>{running ? t('sbImport.loadingImages') : t('sbImport.addN', { count: chosen.length })}</Button>
        </div>
      </footer>
    </>
  );
}
