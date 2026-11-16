import React, { memo, useEffect, useId, useRef, useState } from 'react';
import { Check, FileX, Film, Map as MapIcon } from 'lucide-react';
import type { AnyAsset } from '../types';
import type { AssetCardHandlers } from '../hooks/useAssetCardHandlers';
import { TokenPortrait } from '../../shared/TokenPortrait';
import { LabelTooltip, Tooltip, TooltipContent, TooltipTrigger } from '../../primitives/tooltip';
import { AssetTagMenu } from './AssetTagMenu';
import { ProcessingBadge } from './ProcessingBadge';
import { SpawnCountBadge } from './SpawnCountBadge';
import { RevealImage } from '../../primitives/RevealImage';
import { Skeleton } from '../../primitives/Skeleton';
import { encounterPreviewStyle } from '../utils/encounterPreviewLayout';
import { cardKeyAction } from '../utils/gridNavigation';
import { isQuietlyFocused } from '../utils/cardFocus';
import { isLayerOpenOver } from '../utils/layersOver';
import { anchorAtElement, anchorAtPointer, anchorUnder } from '../utils/menuAnchor';
import { cardActionHint } from '../utils/cardMainAction';
import { CardMoreButton } from './CardMoreButton';
import { SceneMarkers, sceneCardName, useSceneMarks } from './SceneMarkers';
import { isCut } from '../../../../react/components/dm-screen/sound/CutTooltip';
import { t } from '../../../../i18n';

export interface AssetCardProps extends AssetCardHandlers {
  asset: AnyAsset;
  isSelected: boolean;
  isDragging: boolean;
  spawnCount: number;
  /** The token's statblock note is gone from the vault. */
  statblockMissing?: boolean;
  /** The grid's one tab stop (roving focus): the card focus returns to. */
  tabbable?: boolean;
  /** 1-based place in the whole list, and its length, for assistive tech: the grid mounts only some cards. */
  position?: number;
  setSize?: number;
}

/** The controls on the art that show a tooltip of their own: over them the card's name tooltip stays shut. */
const OWN_TOOLTIP = '.atlas-asset-card-checkbox, .atlas-asset-card-tags, .atlas-asset-statblock-indicator, .atlas-asset-animated-indicator, .atlas-asset-spawn-badge, .atlas-asset-scene-marks';

function ArtFallback({ asset }: { asset: AnyAsset }): React.JSX.Element {
  return (
    <div className="atlas-asset-placeholder-icon">
      {asset.type === 'scenes' ? <MapIcon size={28} /> : asset.name.charAt(0).toUpperCase()}
    </div>
  );
}

/**
 * The card's art. Every image holds its place with a placeholder until it can
 * be painted; art whose thumbnail is still being made shows only the
 * placeholder, never the full image. Images load with their card: the grid
 * mounts rows ahead of the view, so their art is there when they scroll in.
 */
function Artwork({ asset }: { asset: AnyAsset }): React.JSX.Element {
  if (asset.type === 'encounters' && asset.tokenPreviews.length > 0) {
    const overflow = Math.max(0, asset.tokens.length - asset.tokenPreviews.length);
    return (
      <div className="atlas-encounter-preview">
        {asset.tokenPreviews.map((preview, index) => (
          <TokenPortrait
            key={`${asset.id}-encounter-preview-${index}`}
            style={encounterPreviewStyle(index, asset.tokenPreviews.length)}
            src={preview.url}
            alt={`${asset.name} token ${index + 1}`}
            showRing={preview.showRing}
            ringColor={preview.ringColor}
            reveal
          />
        ))}
        {/* Drawn from the attribute: the count is the card's description (`cardStatus`), not text inside its name. */}
        {overflow > 0 && <div className="atlas-encounter-preview-overflow" data-count={`+${overflow}`} />}
      </div>
    );
  }
  if (asset.thumbnailPending) {
    return asset.type === 'tokens'
      ? <TokenPortrait src="" alt={asset.name} showRing={asset.showRing} pending />
      : <Skeleton className="atlas-asset-card-art-skeleton" live />;
  }
  if (asset.thumbnailUrl) {
    return asset.type === 'tokens'
      ? <TokenPortrait src={asset.thumbnailUrl} alt={asset.name} showRing={asset.showRing} reveal />
      : <RevealImage src={asset.thumbnailUrl} alt={asset.name} fallback={<ArtFallback asset={asset} />} />;
  }
  return <ArtFallback asset={asset} />;
}

/** What the art well shows beside the name, said to assistive tech, which the well itself is hidden from. */
function cardStatus(asset: AnyAsset, spawnCount: number, statblockMissing: boolean): string {
  const parts: string[] = [];
  if (asset.type === 'encounters') parts.push(t('assetGrid.tokenCount', { count: asset.tokens.length }));
  if (statblockMissing) parts.push(t('assetGrid.statblockMissing'));
  if (asset.type === 'maps' && asset.animated) parts.push(t('am.card.animated'));
  if (spawnCount > 1) parts.push(t('am.card.spawn', { count: spawnCount }));
  return parts.join(', ');
}

/**
 * One option of the asset grid's listbox. Memoized: the grid passes booleans and stable
 * handlers, so selecting or dragging one asset re-renders only the cards involved.
 *
 * The option is the card's one control: its name is the asset's name, Enter runs the main
 * action, Space selects, Delete asks to delete, Shift+F10 opens the menu. The art well's
 * checkbox, tag button, statblock badge and spawn counter are for the pointer; they are
 * hidden from assistive tech and take no focus, and their actions are in the menu and keys.
 * The ⋯ button that opens the menu stands after the option, not in it (`CardMoreButton`).
 */
export const AssetCard = memo(function AssetCard({
  asset, isSelected, isDragging, spawnCount, statblockMissing = false, tabbable = false, position, setSize,
  onSelect, onContextMenu, onOpen, onDelete, onDragStart, onDragEnd, onSpawnCountChange, onOpenStatblock, onArtNeeded,
}: AssetCardProps): React.JSX.Element {
  const nameId = useId();
  const statusId = useId();
  const linkedToken = asset.type === 'tokens' && asset.statblockPath ? asset : null;
  const awaitsArt = asset.thumbnailPending === true;
  const sceneMarks = useSceneMarks(asset.type === 'scenes' ? asset.scenePath : undefined);
  const status = cardStatus(asset, spawnCount, statblockMissing);
  const markedName = sceneCardName(asset.name, sceneMarks);
  // One tooltip per pointer position: the card's waits while a control's own shows. It tells the main action, and the
  // name above it where the name's line cuts it.
  const nameRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [nameTipOpen, setNameTipOpen] = useState(false);
  const [nameCut, setNameCut] = useState(false);
  const openNameTip = (open: boolean): void => {
    // Focus code put here (a dialog closing, the card before this one moved away) is nobody pointing at the card, and
    // a card under a dialog or menu is not what the pointer is on.
    if (open && cardRef.current && (isQuietlyFocused(cardRef.current) || isLayerOpenOver(cardRef.current))) return;
    if (open) setNameCut(nameRef.current !== null && isCut(nameRef.current));
    setNameTipOpen(open);
  };
  const [overControl, setOverControl] = useState(false);
  const trackControl = (event: React.PointerEvent): void => {
    setOverControl((event.target as Partial<Element>).closest?.(OWN_TOOLTIP) != null);
  };

  // A dialog or menu that opens while the tooltip shows takes it away, however it opened: a pointer that left the card
  // in one jump (no move after the leave) or a window without focus (no focus events) leaves Radix nothing to close on.
  useEffect(() => {
    const card = cardRef.current;
    const body = card?.ownerDocument.body;
    if (!nameTipOpen || !card || !body) return undefined;
    const watch = new MutationObserver(() => {
      if (isLayerOpenOver(card)) setNameTipOpen(false);
    });
    watch.observe(body, { childList: true, subtree: true });
    return (): void => watch.disconnect();
  }, [nameTipOpen]);

  // Cards are mounted only in and around the view, so this card's art is wanted now.
  useEffect(() => {
    if (awaitsArt) onArtNeeded(asset.id);
  }, [awaitsArt, asset.id, onArtNeeded]);

  const handleDoubleClick = (event: React.MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (!event.shiftKey && !event.ctrlKey && !event.metaKey) onOpen(asset, spawnCount);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const action = cardKeyAction(event);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (action === 'open') onOpen(asset, spawnCount);
    else if (action === 'select') onSelect(asset.id, event);
    else if (action === 'delete') onDelete(asset);
    else onContextMenu(asset, anchorAtElement(event.currentTarget));
  };

  return (
    <>
      {/* Longer than the controls' tooltips to open: a pointer passing over the grid opens none. */}
      <Tooltip open={nameTipOpen && !overControl} onOpenChange={openNameTip} delayDuration={700}>
        <TooltipTrigger asChild>
          <div
            ref={cardRef}
            className={`atlas-asset-card ${isSelected ? 'atlas-selected' : ''} ${isDragging ? 'atlas-dragging' : ''}`}
            data-type={asset.type}
            data-asset-id={asset.id}
            onClick={(event) => onSelect(asset.id, event)}
            onDoubleClick={handleDoubleClick}
            onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); onContextMenu(asset, anchorAtPointer(event)); }}
            role="option"
            tabIndex={tabbable ? 0 : -1}
            aria-selected={isSelected}
            {...(markedName ? { 'aria-label': markedName } : { 'aria-labelledby': nameId })}
            {...(status && { 'aria-describedby': statusId })}
            {...(position !== undefined && { 'aria-posinset': position })}
            {...(setSize !== undefined && { 'aria-setsize': setSize })}
            draggable
            onDragStart={(event) => onDragStart(asset.id, event)}
            onDragEnd={onDragEnd}
            onKeyDown={handleKeyDown}
            onPointerOver={trackControl}
          >
            <div className="atlas-asset-card-thumb" aria-hidden="true">
              <Artwork asset={asset} />

              <span className="atlas-asset-card-checkbox" onClick={(event) => { event.stopPropagation(); onSelect(asset.id, event, true); }}>
                <LabelTooltip label={t('am.card.select', { name: asset.name })}>
                  <span className={`atlas-asset-card-check${isSelected ? ' atlas-checked' : ''}`}>
                    {isSelected && <Check />}
                  </span>
                </LabelTooltip>
              </span>

              <AssetTagMenu asset={asset} />

              {asset.type === 'maps' && asset.animated && (
                <LabelTooltip label={t('am.card.animated')}>
                  <div className="atlas-asset-animated-indicator"><Film /></div>
                </LabelTooltip>
              )}

              {(asset.type === 'maps' || asset.type === 'scenes') && <ProcessingBadge asset={asset} />}

              {/* A map and the scenes made from it share name and art: the map says what it is. Drawn from the attribute, so
                  the option's visible text stays its name (axe label-content-name-mismatch). */}
              {asset.type === 'maps' && <span className="atlas-asset-kind-badge" data-label={t('am.card.mapKind')} />}

              {/* Only a link that needs the GM is marked; a healthy one is in the menu. */}
              {linkedToken && statblockMissing && spawnCount <= 1 && (
                <LabelTooltip label={t('am.card.statblockMissing')}>
                  <div
                    className="atlas-asset-statblock-indicator atlas-asset-statblock-indicator--missing"
                    onClick={(event) => { event.stopPropagation(); onOpenStatblock(linkedToken); }}
                  >
                    <FileX />
                  </div>
                </LabelTooltip>
              )}

              {spawnCount > 1 && (
                <SpawnCountBadge
                  count={spawnCount}
                  onChange={(count) => onSpawnCountChange(asset.id, count)}
                  onSpawn={() => onOpen(asset, spawnCount)}
                />
              )}
            </div>
            {/* A scene's marks stand on their own line under its name, never on the art (decisions #44, #51). */}
            <span className="atlas-asset-card-caption">
              <span ref={nameRef} id={nameId} className="atlas-asset-card-name">{asset.name}</span>
              {asset.type === 'scenes' && <SceneMarkers marks={sceneMarks} />}
            </span>
            {status && <span id={statusId} hidden>{status}</span>}
          </div>
        </TooltipTrigger>
        <TooltipContent className="atlas-asset-card-tooltip" side="top" sideOffset={10}>
          {nameCut && <span className="atlas-asset-card-tooltip__name">{asset.name}</span>}
          <span className="tooltip-inner">
            <span className="atlas-asset-card-tooltip__hint">{cardActionHint(asset.type)}</span>
            <kbd className="tooltip-kbd">Enter</kbd>
          </span>
        </TooltipContent>
      </Tooltip>
      <CardMoreButton onOpen={(button) => onContextMenu(asset, anchorUnder(button, cardRef.current))} />
    </>
  );
});
