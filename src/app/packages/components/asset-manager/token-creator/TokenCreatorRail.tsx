import { TokenRingToggle } from './TokenRingToggle';
import { TokenSizeSelect } from './TokenSizeSelect';
import React, { useId, useState } from 'react';
import { Check, FolderOpen, Minus, MoveHorizontal, Plus, ScrollText, Trash2, Upload, X } from 'lucide-react';
import { Button } from '../../primitives/button';
import { Slider } from '../../primitives/slider';
import { LabelTooltip } from '../../primitives/tooltip';
import { CollectionSelect } from './CollectionSelect';
import { StatblockRoleSelect } from './StatblockRoleSelect';
import type { StatblockRow } from './useStatblockRow';
import { TagPicker } from './TagPicker';
import { UploadDropzone } from './UploadDropzone';
import { cropReset } from './cropMath';
import { clampZoom, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from './types';
import type { CollectionMetadata } from '../../../../services/AssetService';
import type { CreatorMode, CreatorSource } from './types';
import type { TokenPreviewsApi } from './useTokenPreviews';
import { t } from '../../../../i18n';

interface TokenCreatorRailProps {
  mode: CreatorMode;
  source: CreatorSource;
  onSourceChange: (source: CreatorSource) => void;
  sourceDisabled: boolean;
  isEditing: boolean;
  isDragging: boolean;
  previews: TokenPreviewsApi;
  onFiles: (files: File[]) => void;
  /** The picker also offers Universal VTT map files. */
  acceptsMapFiles: boolean;
  collection: string;
  collections: CollectionMetadata[];
  onCollectionChange: (collection: string) => void;
  availableTags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onCreateTag: (tag: string) => Promise<string>;
  tagsDisabled: boolean;
  /** The Statblocks row; offered only while creating tokens with the statblock editor on. */
  statblocks?: StatblockRow | undefined;
}

/** Left column of the creator: intake, selection, metadata and batch tools. */
export function TokenCreatorRail(props: TokenCreatorRailProps): React.JSX.Element {
  const { mode, isEditing, isDragging, previews, onFiles, collection, collections, onCollectionChange, availableTags, selectedTags, onToggleTag } = props;
  const [batchScale, setBatchScale] = useState(1);
  const [batchSize, setBatchSize] = useState<number | undefined>(undefined);
  // "Choose files…" opens the file picker once the upload's drop zone is there (it is not while another source shows).
  const [pickFiles, setPickFiles] = useState(false);
  const zoomLabelId = useId();

  const count = previews.previews.length;
  // Another source than images shows its list in the main pane and only a hint here, in place of the drop zone.
  const sourceHint = isEditing ? null
    : props.source === 'statblocks' && mode === 'token' ? t('creator.statblocksHint')
    : props.source === 'vault' ? t('vaultImages.hint') : null;
  const selectedCount = previews.selectedIds.length;

  const applyBatchScale = (scale: number): void => {
    const next = clampZoom(scale);
    setBatchScale(next);
    previews.updateSelected({ imageScale: next });
  };

  const applyBatchSize = (size: number): void => {
    setBatchSize(size);
    previews.updateSelected({ size });
  };

  return (
    // A plain group, not a landmark: the window behind already has the page's one sidebar (axe landmark-unique).
    <div className="atlas-token-creator__rail" inert={props.sourceDisabled}>
      {/* One group for where the images come from: the sources, then the drop zone or the chosen source's hint. */}
      <section className="atlas-token-creator__section">
        <div className="atlas-token-creator__section-title">{isEditing ? t('creator.replaceImage') : t('creator.imageSource')}</div>
        {/* Actions, one verb each: every one does what it says at once (opens the file picker or the source's list). */}
        {!isEditing && <>
          <Button variant="outline" className="atlas-token-creator__source" disabled={props.sourceDisabled} onClick={() => { props.onSourceChange('images'); setPickFiles(true); }}>
            <Upload />
            <span>{t('creator.fromComputer')}</span>
          </Button>
          {mode === 'token' && (
            <Button variant="outline" className="atlas-token-creator__source" disabled={props.sourceDisabled} onClick={() => props.onSourceChange('statblocks')}>
              <ScrollText />
              <span>{t('creator.statblockNotes')}</span>
            </Button>
          )}
          <Button variant="outline" className="atlas-token-creator__source" disabled={props.sourceDisabled} onClick={() => props.onSourceChange('vault')}>
            <FolderOpen />
            <span>{t('vaultImages.source')}</span>
          </Button>
        </>}
        {sourceHint ? <p className="atlas-token-creator__empty-note">{sourceHint}</p> : (
          <UploadDropzone
            title={isEditing ? t('creator.chooseNew') : t('creator.dropAnywhere')}
            hint={isEditing ? t('creator.willReplace') : t(`creator.${mode}.browse`)}
            multiple={!isEditing}
            acceptsMapFiles={props.acceptsMapFiles && !isEditing}
            isDragging={isDragging}
            onFiles={onFiles}
            openNow={pickFiles}
            onOpened={() => setPickFiles(false)}
          />
        )}
      </section>
      {!sourceHint && <>
      {mode === 'token' && <TokenRingToggle label={t('creator.toggleAllRings')} mixed={previews.previews.some(p => p.showRing !== false) && previews.previews.some(p => p.showRing === false)} value={count ? previews.previews.every(p => p.showRing !== false) : previews.defaultRing} onChange={previews.setAllRings} />}

      {count > 0 && !isEditing && (
        <section className="atlas-token-creator__section">
          <div className="atlas-token-creator__section-title">
            <span>{t('creator.selection')} <span className="atlas-token-creator__count">{t('creator.countOf', { count: selectedCount, total: count })}</span></span>
          </div>
          <div className="atlas-token-creator__row">
            <Button variant="outline" size="sm" onClick={previews.selectAll} disabled={selectedCount === count}>
              <Check />
              <span>{t('creator.all')}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={previews.deselectAll} disabled={selectedCount === 0}>
              <X />
              <span>{t('creator.none')}</span>
            </Button>
            <LabelTooltip label={t('creator.removeSelected')}>
              <Button variant="outline" size="sm" className="atlas-token-creator__danger" onClick={previews.removeSelected} disabled={selectedCount === 0}>
                <Trash2 />
                <span>{t('common.remove')}</span>
              </Button>
            </LabelTooltip>
          </div>
        </section>
      )}

      <section className="atlas-token-creator__section">
        <div className="atlas-token-creator__section-title">{t('creator.collection')}</div>
        <CollectionSelect value={collection} options={collections} onChange={onCollectionChange} />
      </section>

      {props.statblocks?.offered && <StatblockRoleSelect row={props.statblocks} />}

      <TagPicker hint={t('creator.tagsApply', { count: selectedCount })} available={availableTags} selected={selectedTags} onToggle={onToggleTag} onCreate={props.onCreateTag} disabled={props.tagsDisabled} />

      {mode === 'token' && selectedCount > 0 && (
        <section className="atlas-token-creator__section">
          <div className="atlas-token-creator__section-title">
            <span>{t('creator.batch')} <span className="atlas-token-creator__count">{t('creator.selected', { count: selectedCount })}</span></span>
          </div>
          <div className="atlas-token-creator__label-row">
            <span id={zoomLabelId}>{t('creator.zoom')}</span>
            <span>{Math.round(batchScale * 100)}%</span>
          </div>
          <div className="atlas-token-creator__slider-row">
            <LabelTooltip label={t('creator.zoomOutSelected')}>
              <Button variant="ghost" size="icon" className="atlas-collection-header-btn" onClick={() => applyBatchScale(batchScale - ZOOM_STEP)} disabled={batchScale <= ZOOM_MIN}>
                <Minus />
              </Button>
            </LabelTooltip>
            <Slider
              value={[batchScale]}
              min={ZOOM_MIN}
              max={ZOOM_MAX}
              step={0.01}
              onValueChange={(v) => applyBatchScale(v[0] ?? batchScale)}
              aria-labelledby={zoomLabelId}
            />
            <LabelTooltip label={t('creator.zoomInSelected')}>
              <Button variant="ghost" size="icon" className="atlas-collection-header-btn" onClick={() => applyBatchScale(batchScale + ZOOM_STEP)} disabled={batchScale >= ZOOM_MAX}>
                <Plus />
              </Button>
            </LabelTooltip>
          </div>
          <Button variant="outline" size="sm" onClick={() => previews.previews.filter(p => p.isSelected).forEach(p => previews.update(p.id, cropReset(p)))}>
            <MoveHorizontal />
            <span>{t('creator.resetCrop')}</span>
          </Button>
          <div className="atlas-token-creator__label-row"><span>{t('creator.size')}</span></div>
          <TokenSizeSelect className="atlas-setting-dropdown" value={batchSize} onChange={applyBatchSize} />
        </section>
      )}
      </>}
    </div>
  );
}
