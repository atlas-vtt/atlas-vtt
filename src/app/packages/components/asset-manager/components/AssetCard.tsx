import React, { memo, useEffect, useId } from 'react';
import { Film, Map as MapIcon, ScrollText } from 'lucide-react';
import type { AnyAsset } from '../types';
import type { AssetCardHandlers } from '../hooks/useAssetCardHandlers';
import { TokenPortrait } from '../../shared/TokenPortrait';
import { LabelTooltip, Tooltip, TooltipContent, TooltipTrigger } from '../../primitives/tooltip';
import { AssetTagMenu } from './AssetTagMenu';
import { RevealImage } from '../../primitives/RevealImage';
import { Skeleton } from '../../primitives/Skeleton';
import { encounterPreviewStyle } from '../utils/encounterPreviewLayout';
import { t } from '../../../../i18n';

export interface AssetCardProps extends AssetCardHandlers {
  asset: AnyAsset;
  isSelected: boolean;
  isDragging: boolean;
  spawnCount: number;
}

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
        {overflow > 0 && <div className="atlas-encounter-preview-overflow">+{overflow}</div>}
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

/**
 * One tile of the asset grid. Memoized: the grid passes booleans and stable
 * handlers, so selecting or dragging one asset re-renders only the cards involved.
 */
export const AssetCard = memo(function AssetCard({
  asset, isSelected, isDragging, spawnCount,
  onSelect, onContextMenu, onOpen, onDragStart, onDragEnd, onSpawnCountChange, onOpenStatblock, onArtNeeded,
}: AssetCardProps): React.JSX.Element {
  const nameId = useId();
  const statblockPath = asset.type === 'tokens' ? asset.statblockPath : undefined;
  const awaitsArt = asset.thumbnailPending === true;

  // Cards are mounted only in and around the view, so this card's art is wanted now.
  useEffect(() => {
    if (awaitsArt) onArtNeeded(asset.id);
  }, [awaitsArt, asset.id, onArtNeeded]);

  const handleDoubleClick = (event: React.MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (!event.shiftKey && !event.ctrlKey && !event.metaKey) onOpen(asset, spawnCount);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`atlas-asset-card ${isSelected ? 'atlas-selected' : ''} ${isDragging ? 'atlas-dragging' : ''}`}
          data-type={asset.type}
          data-asset-id={asset.id}
          onClick={(event) => onSelect(asset.id, event)}
          onDoubleClick={handleDoubleClick}
          onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); onContextMenu(asset, event); }}
          role="button"
          tabIndex={0}
          aria-selected={isSelected}
          aria-labelledby={nameId}
          draggable
          onDragStart={(event) => onDragStart(asset.id, event)}
          onDragEnd={onDragEnd}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelect(asset.id, event); }}
        >
          <div className="atlas-asset-card-thumb">
            <Artwork asset={asset} />

            <div className="atlas-asset-card-checkbox" onClick={(event) => { event.stopPropagation(); onSelect(asset.id, event, true); }}>
              <LabelTooltip label={t('am.card.select', { name: asset.name })}>
                <input type="checkbox" checked={isSelected} onChange={() => {}} />
              </LabelTooltip>
            </div>

            <AssetTagMenu asset={asset} />

            {asset.type === 'maps' && asset.animated && (
              <LabelTooltip label={t('am.card.animated')}>
                <div className="atlas-asset-animated-indicator"><Film /></div>
              </LabelTooltip>
            )}

            {statblockPath && spawnCount <= 1 && (
              <LabelTooltip label={t('am.card.statblockLinked')}>
                <div
                  className="atlas-asset-statblock-indicator"
                  onClick={(event) => { event.stopPropagation(); onOpenStatblock(statblockPath); }}
                >
                  <ScrollText />
                </div>
              </LabelTooltip>
            )}

            {spawnCount > 1 && (
              <div className="atlas-asset-spawn-badge" onDoubleClick={(event) => event.stopPropagation()}>
                <LabelTooltip label={t('am.card.decrease')}>
                  <button
                    type="button"
                    className="atlas-spawn-btn"
                    onClick={(event) => { event.stopPropagation(); onSpawnCountChange(asset.id, spawnCount - 1); }}
                  >−</button>
                </LabelTooltip>
                <span className="atlas-spawn-count">×{spawnCount}</span>
                <LabelTooltip label={t('am.card.increase')}>
                  <button
                    type="button"
                    className="atlas-spawn-btn"
                    onClick={(event) => { event.stopPropagation(); onSpawnCountChange(asset.id, spawnCount + 1); }}
                  >+</button>
                </LabelTooltip>
                <LabelTooltip label={t('am.card.spawn', { count: spawnCount })}>
                  <button
                    type="button"
                    className="atlas-spawn-btn atlas-spawn-go"
                    onClick={(event) => { event.stopPropagation(); onOpen(asset, spawnCount); }}
                  >{t('am.card.go')}</button>
                </LabelTooltip>
              </div>
            )}
          </div>
          <span id={nameId} className="atlas-asset-card-name">{asset.name}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent className="atlas-asset-card-tooltip" side="top" sideOffset={10}>
        {asset.name}
      </TooltipContent>
    </Tooltip>
  );
});
