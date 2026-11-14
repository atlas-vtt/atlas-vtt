import { AssetService } from '../../../services/AssetService';
import { StatblockImportContent } from './statblock-import/StatblockImportContent';
import { VaultImageContent } from './vault-images/VaultImageContent';
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Upload } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { useAtlasUI } from '../../../react/root/AtlasUIContext';
import { CloseButton } from '../primitives/CloseButton';
import { dialogOverlayMotion, useDialogWindowVariants } from '../primitives/dialogMotion';
import { useFocusTrap } from '../primitives/useFocusTrap';
import { TokenCreatorFooter } from './token-creator/TokenCreatorFooter';
import { TokenCreatorRail } from './token-creator/TokenCreatorRail';
import { CreatorPreviewPane } from './token-creator/CreatorPreviewPane';
import { useAssetCatalog } from './token-creator/useAssetCatalog';
import { useAssetTags } from './token-creator/useAssetTags';
import { useTokenPreviews } from './token-creator/useTokenPreviews';
import { useStatblockRow } from './token-creator/useStatblockRow';
import { useCreatorSave } from './token-creator/useCreatorSave';
import { useCreatorKeys } from './token-creator/useCreatorKeys';
import { useFocusReturn } from './hooks/useFocusReturn';
import { isUvttFileName } from '../../../import/uvtt/uvttFileNames';
import type { ImportMaps } from './hooks/useUvttImport';
import { useFileDrop } from './token-creator/useFileDrop';
import { discardCreatorDraft, keepCreatorSettings, rememberedCollection } from './token-creator/creatorDraft';
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
  /** Given to the map creator: takes the map files among the added files, which are imported at once (Universal VTT maps become scenes, videos animated maps). */
  onImportMaps?: ImportMaps;
  /** Files the creator opens with, as if they had just been dropped on it. */
  initialFiles?: readonly File[];
}

export function TokenCreator({ isOpen, onClose, mode = 'token', selectedCollection = AssetService.defaultCollectionId(), editToken, initialSource = 'images', onImportMaps, initialFiles, playerCharacters = false }: TokenCreatorProps): React.JSX.Element | null {
  const { app } = useAtlasUI();
  const { assetService, collections } = useAssetCatalog(app, isOpen);
  // Creating keeps its work when the creator closes (decision #11); editing a token keeps nothing.
  const creating = !editToken;
  const previews = useTokenPreviews(mode, creating);
  const [source, setSource] = useState<CreatorSource>(initialSource);
  const [importController, setImportController] = useState(() => new AbortController());
  const [importRunning, setImportRunning] = useState(false);
  useEffect(() => () => importController.abort(), [importController]);
  const usingStatblocks = mode === 'token' && !editToken && source === 'statblocks';
  const usingVault = !editToken && source === 'vault';
  // A source with a pane of its own shows it in place of the previews until its images are added.
  const choosingImages = usingStatblocks || usingVault;

  const [collection, setCollection] = useState(() => (creating ? rememberedCollection(mode, selectedCollection) : selectedCollection));
  const { tags: availableTags, createTag, isCreatingTag } = useAssetTags(assetService, isOpen, collection, mode === 'map' ? 'maps' : 'tokens');
  const statblockRow = useStatblockRow(app, collection, mode === 'token' && creating, mode);
  const selectedPreviews = previews.previews.filter(p => p.isSelected);
  const selectedTags = selectedPreviews[0]?.tags?.filter(tag => selectedPreviews.every(p => p.tags?.includes(tag))) ?? [];
  const queuedPaths = useMemo(() => previews.previews.flatMap(p => p.statblockPath ? [p.statblockPath] : []), [previews.previews]);
  const queuedVaultPaths = useMemo(() => previews.previews.flatMap(p => p.vaultPath ? [p.vaultPath] : []), [previews.previews]);
  const titleId = useId();
  const windowRef = useRef<HTMLDivElement>(null);
  // Tab stays in the creator, as in every dialog; the asset manager's Tab (its tabs) waits behind it.
  useFocusTrap(windowRef, isOpen);
  const windowVariants = useDialogWindowVariants();

  const previewCountRef = useRef(0);
  previewCountRef.current = previews.previews.length;

  const save = useCreatorSave({
    app, assetService, mode, collection, editToken: editToken ?? null, playerCharacters, previews, statblockRow,
    signal: importController.signal, allowed: !choosingImages && !isCreatingTag, onSaved: onClose,
  });
  const { isSubmitting } = save;

  const { reset } = previews;
  const { clear: clearSave } = save;
  const editTokenRef = useRef(editToken);
  editTokenRef.current = editToken;
  const editTokenId = editToken?.id;
  useEffect(() => {
    if (!isOpen) return;
    const token = editTokenRef.current;
    setCollection(token ? selectedCollection : rememberedCollection(mode, selectedCollection));
    clearSave();
    setImportController(new AbortController());
    // Creating starts from the draft a closed creator left, which the previews took as they mounted.
    if (token) reset(token);
    windowRef.current?.focus();
  }, [isOpen, mode, editTokenId, selectedCollection, reset, clearSave]);

  useEffect(() => {
    if (creating) keepCreatorSettings(mode, { collection: { openedFor: selectedCollection, chosen: collection } });
  }, [creating, mode, selectedCollection, collection]);

  useEffect(() => {
    const first = collections[0];
    if (first && !collections.some(c => c.id === collection)) setCollection(first.id);
  }, [collections, collection]);

  // After the effect above, so files dropped to open the creator join the draft it opened with
  const { addImages } = previews;
  const filesToOpenWith = useRef(initialFiles);
  useEffect(() => {
    const files = filesToOpenWith.current;
    if (!isOpen || !files?.length) return;
    filesToOpenWith.current = undefined;
    addImages(files.map(file => ({ file })));
  }, [isOpen, addImages]);

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
    const maps = onImportMaps ? files.filter(file => isUvttFileName(file.name)) : [];
    const images = files.filter(file => !maps.includes(file));
    // The imported scene opens and the creator closes, unless images wait here to be created by then
    if (maps.length > 0) void onImportMaps?.(maps, collection, () => previewCountRef.current > 0);
    if (images.length > 0) previews.addFiles(images);
  }, [editToken, previews, onImportMaps, collection]);
  const drop = useFileDrop(handleFiles, !choosingImages);
  const { isDragging } = drop;

  const canSubmit = previews.previews.length > 0 && !isSubmitting && !save.saveBlocked && !isCreatingTag && assetService !== null;
  useCreatorKeys(windowRef, isOpen, isSubmitting, onClose, save.submit);
  // Closing gives focus back to what opened the creator.
  useFocusReturn(windowRef);

  const addChosen = (images: PreviewImage[]): void => { previews.addImages(images); setSource('images'); };
  // Closing keeps the draft; this is the one way to drop it.
  const discard = (): void => {
    if (isSubmitting) return;
    previews.reset(null);
    discardCreatorDraft(mode);
    onClose();
  };
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
        {...drop.handlers}
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

        {/* Not a <header>: inside a dialog it would be a second banner beside the asset manager's. */}
        <div className="atlas-token-creator__header">
          <h2>
            <span id={titleId}>{title}</span>
            {!choosingImages && count > 0 && <span className="atlas-token-creator__subtitle">{t(`creator.${mode}.count`, { count })}</span>}
          </h2>
          <CloseButton onClick={() => { if (!isSubmitting) onClose(); }} />
        </div>

        {usingStatblocks ? (
          <StatblockImportContent app={app} queuedPaths={queuedPaths} onAdd={addChosen} onClose={closeChooser} controller={importController} onRunningChange={setImportRunning} />
        ) : usingVault ? (
          <VaultImageContent app={app} mode={mode} queuedPaths={queuedVaultPaths} onAdd={addChosen} onClose={closeChooser} controller={importController} onRunningChange={setImportRunning} />
        ) : <CreatorPreviewPane mode={mode} previews={previews} inert={isSubmitting} />}

        {!choosingImages && (
          <TokenCreatorFooter
            mode={mode}
            isEditing={Boolean(editToken)}
            count={count}
            saveError={save.saveError}
            optimization={previews.optimization}
            saving={save.saving}
            canSubmit={canSubmit}
            discards={creating && count > 0}
            onCancel={creating && count > 0 ? discard : onClose}
            onSubmit={() => { void save.submit(); }}
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
