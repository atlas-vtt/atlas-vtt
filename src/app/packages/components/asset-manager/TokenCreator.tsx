import { AssetRegistrationUncertainError } from '../../../services/assetRegistrationRecovery';
import { AssetService } from '../../../services/AssetService';
import { StatblockImportContent } from './statblock-import/StatblockImportContent';
import { VaultImageContent } from './vault-images/VaultImageContent';
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ImageIcon, Upload } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { useAtlasUI } from '../../../react/root/AtlasUIContext';
import { isShortcutScopeActive } from '../../../utils/activeLeafGuard';
import { CloseButton } from '../primitives/CloseButton';
import { dialogOverlayMotion, useDialogWindowVariants } from '../primitives/dialogMotion';
import { TokenCreatorFooter } from './token-creator/TokenCreatorFooter';
import { TokenCreatorRail } from './token-creator/TokenCreatorRail';
import { PreviewGrid } from './token-creator/PreviewGrid';
import { saveTokenPreviews } from './token-creator/saveTokenPreviews';
import { useAssetCatalog } from './token-creator/useAssetCatalog';
import { useAssetTags } from './token-creator/useAssetTags';
import { useTokenPreviews } from './token-creator/useTokenPreviews';
import { useStatblockRow } from './token-creator/useStatblockRow';
import type { SavedToken } from './token-creator/tokenStatblocks';
import { useFrameProgress } from '../primitives/useFrameProgress';
import { uvttFilesAmong, type ImportMaps } from './hooks/useUvttImport';
import type { CreatorMode, CreatorSource, EditTokenInput, PreviewImage } from './token-creator/types';
import { t } from '../../../i18n';

interface TokenCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  mode?: CreatorMode;
  selectedCollection?: string;
  editToken?: EditTokenInput | null;
  initialSource?: CreatorSource;
  /** New tokens are player characters: the creator was opened from the Player characters tab. */
  playerCharacters?: boolean;
  /** Given to the map creator: takes the Universal VTT files among the added files, which become scenes at once. */
  onImportMaps?: ImportMaps;
}

function hasFiles(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes('Files');
}

export function TokenCreator({ isOpen, onClose, mode = 'token', selectedCollection = AssetService.defaultCollectionId(), editToken, initialSource = 'images', onImportMaps, playerCharacters = false }: TokenCreatorProps): React.JSX.Element | null {
  const { app } = useAtlasUI();
  const { assetService, collections } = useAssetCatalog(app, isOpen);
  const previews = useTokenPreviews(mode, app);
  const [source, setSource] = useState<CreatorSource>(initialSource);
  const [importController, setImportController] = useState(() => new AbortController());
  const [importRunning, setImportRunning] = useState(false);
  useEffect(() => () => importController.abort(), [importController]);
  const usingStatblocks = mode === 'token' && !editToken && source === 'statblocks';
  const usingVault = !editToken && source === 'vault';
  // A source with a pane of its own shows it in place of the previews until its images are added.
  const choosingImages = usingStatblocks || usingVault;

  const [collection, setCollection] = useState(selectedCollection);
  const { tags: availableTags, createTag, isCreatingTag } = useAssetTags(assetService, isOpen, collection, mode === 'map' ? 'maps' : 'tokens');
  const statblockRow = useStatblockRow(app, collection, mode === 'token' && !editToken);
  const selectedPreviews = previews.previews.filter(p => p.isSelected);
  const selectedTags = selectedPreviews[0]?.tags?.filter(tag => selectedPreviews.every(p => p.tags?.includes(tag))) ?? [];
  const queuedPaths = useMemo(() => previews.previews.flatMap(p => p.statblockPath ? [p.statblockPath] : []), [previews.previews]);
  const queuedVaultPaths = useMemo(() => previews.previews.flatMap(p => p.vaultPath ? [p.vaultPath] : []), [previews.previews]);
  const [saveError, setSaveError] = useState('');
  const [saveBlocked, setSaveBlocked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Saving reports every preview; the footer shows it at most once a frame
  const { progress: saveProgress, report: reportSaveProgress, clear: clearSaveProgress } = useFrameProgress();
  const [isDragging, setIsDragging] = useState(false);
  const [previewPane, setPreviewPane] = useState<HTMLDivElement | null>(null);
  const dragDepthRef = useRef(0);
  const titleId = useId();
  const windowRef = useRef<HTMLDivElement>(null);
  const windowVariants = useDialogWindowVariants();

  const previewCountRef = useRef(0);
  previewCountRef.current = previews.previews.length;

  const { reset } = previews;
  const editTokenRef = useRef(editToken);
  editTokenRef.current = editToken;
  const editTokenId = editToken?.id;
  useEffect(() => {
    if (!isOpen) return;
    const token = editTokenRef.current;
    setCollection(selectedCollection);
    setIsSubmitting(false);
    clearSaveProgress();
    setImportController(new AbortController());
    setSaveError('');
    setSaveBlocked(false);
    reset(token);
    windowRef.current?.focus();
  }, [isOpen, editTokenId, selectedCollection, reset, clearSaveProgress]);

  useEffect(() => {
    const first = collections[0];
    if (first && !collections.some(c => c.id === collection)) setCollection(first.id);
  }, [collections, collection]);

  const handleFiles = useCallback((files: File[]): void => {
    if (editToken) {
      const file = files[0];
      if (!file) return;
      const current = previews.previews[0];
      const tags = current?.tags ?? editToken.tags;
      const showRing = current?.showRing ?? editToken.showRing ?? true;
      const size = current?.size ?? editToken.size;
      previews.reset(null);
      previews.addImages([{ file, tags, showRing, size }]);
      return;
    }
    const maps = onImportMaps ? uvttFilesAmong(files) : [];
    const images = files.filter(file => !maps.includes(file));
    // The imported scene opens and the creator closes, unless images wait here to be created by then
    if (maps.length > 0) void onImportMaps?.(maps, collection, () => previewCountRef.current > 0);
    if (images.length > 0) previews.addFiles(images);
  }, [editToken, previews, onImportMaps, collection]);

  const canSubmit = previews.previews.length > 0 && !isSubmitting && !saveBlocked && !isCreatingTag && assetService !== null;

  const handleSubmit = useCallback(async (): Promise<void> => {
    if (choosingImages || !canSubmit || !assetService || !app) return;
    const total = previews.previews.length;
    setIsSubmitting(true);
    setSaveError('');
    const savedTokens: SavedToken[] = [];
    try {
      const saved = await saveTokenPreviews({
        app,
        assetService,
        mode,
        previews: previews.previews,
        collection,
        tags: [],
        onSaved: previews.removeMany,
        signal: importController.signal,
        editToken: editToken ?? null,
        playerCharacters,
        waitForOptimized: previews.waitForOptimized,
        onProgress: reportSaveProgress,
        onTokensSaved: (tokens) => savedTokens.push(...tokens),
      });
      if (saved > 0) app.workspace.trigger('atlas-vtt:refresh-assets');
      if (saved === total) onClose();
      else if (saved > 0) setSaveError(`Saved ${saved} of ${total}. The others stay here so you can try again.`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t('creator.savePreviewsFailed'));
      if (error instanceof AssetRegistrationUncertainError) setSaveBlocked(true);
    } finally {
      // Tokens registered before a failure get their statblocks too.
      statblockRow.createFor(savedTokens);
      setIsSubmitting(false);
      clearSaveProgress();
    }
  }, [choosingImages, app, assetService, canSubmit, collection, editToken, mode, playerCharacters, onClose, previews, importController, reportSaveProgress, clearSaveProgress, statblockRow]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (!isShortcutScopeActive(windowRef.current)) return;
      // Let an open menu consume Escape before the importer handles it.
      if (e.key === 'Escape' && windowRef.current?.querySelector('[aria-haspopup="menu"][aria-expanded="true"]')) return;
      if (e.key === 'Escape' && !isSubmitting) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void handleSubmit();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose, handleSubmit, isSubmitting]);

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>): void => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDragging(true);
  };
  const handleDragLeave = (): void => {
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDragging(false);
    if (!choosingImages) handleFiles(Array.from(e.dataTransfer.files));
  };

  const addChosen = (images: PreviewImage[]): void => { previews.addImages(images); setSource('images'); };
  const closeChooser = (): void => { importController.abort(); setImportController(new AbortController()); setSource('images'); };

  if (!isOpen) return null;

  const count = previews.previews.length;
  const title = editToken ? t(`creator.${mode}.edit`) : t(`creator.${mode}.create`);

  return (
    <motion.div {...dialogOverlayMotion} className="atlas-vtt-plugin atlas-vtt-root atlas-token-creator" data-token-creator="true" onClick={() => { if (!isSubmitting) onClose(); }}>
      <motion.div
        ref={windowRef}
        className={cn('atlas-token-creator__window', isDragging && 'atlas-dragging')}
        variants={windowVariants}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <TokenCreatorRail
          source={source}
          onSourceChange={next => { if (next !== 'images') setImportController(new AbortController()); setSource(next); }}
          sourceDisabled={importRunning || isSubmitting}
          mode={mode}
          isEditing={Boolean(editToken)}
          isDragging={isDragging}
          previews={previews}
          onFiles={handleFiles}
          acceptsMapFiles={Boolean(onImportMaps)}
          collection={collection}
          collections={collections}
          onCollectionChange={setCollection}
          availableTags={availableTags}
          selectedTags={selectedTags}
          onCreateTag={createTag}
          tagsDisabled={!assetService || isSubmitting || selectedPreviews.length === 0}
          onToggleTag={previews.toggleTag}
          statblocks={statblockRow}
        />

        <header className="atlas-token-creator__header">
          <h2>
            <span id={titleId}>{title}</span>
            {!choosingImages && count > 0 && <span className="atlas-token-creator__subtitle">{t(`creator.${mode}.count`, { count })}</span>}
          </h2>
          <CloseButton onClick={() => { if (!isSubmitting) onClose(); }} />
        </header>

        {usingStatblocks ? (
          <StatblockImportContent app={app} queuedPaths={queuedPaths} onAdd={addChosen} onClose={closeChooser} controller={importController} onRunningChange={setImportRunning} />
        ) : usingVault ? (
          <VaultImageContent app={app} mode={mode} queuedPaths={queuedVaultPaths} onAdd={addChosen} onClose={closeChooser} controller={importController} onRunningChange={setImportRunning} />
        ) : <div ref={setPreviewPane} className={cn('atlas-token-creator__previews', count === 0 && 'atlas-empty')} inert={isSubmitting}>
          {count === 0 ? (
            <div className="atlas-token-creator__empty">
              <div className="atlas-token-creator__empty-icon"><ImageIcon /></div>
              <h3>{t(`creator.${mode}.none`)}</h3>
              <p>{t('creator.emptyHint')}</p>
            </div>
          ) : (
            <PreviewGrid
              previews={previews.previews}
              mode={mode}
              scrollElement={previewPane}
              onChange={previews.update}
              onToggleSelected={previews.toggleSelected}
              onRemove={previews.remove}
            />
          )}
        </div>}

        {!choosingImages && (
          <TokenCreatorFooter
            mode={mode}
            isEditing={Boolean(editToken)}
            count={count}
            saveError={saveError}
            optimization={previews.optimization}
            saving={isSubmitting ? saveProgress ?? { done: 0, total: previews.previews.length } : null}
            canSubmit={canSubmit}
            onCancel={onClose}
            onSubmit={() => { void handleSubmit(); }}
          />
        )}

        {isDragging && (
          <div className="atlas-token-creator__drop-overlay">
            <div className="atlas-token-creator__drop-overlay-icon"><Upload /></div>
            <span>{t(`creator.${mode}.drop`)}</span>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
