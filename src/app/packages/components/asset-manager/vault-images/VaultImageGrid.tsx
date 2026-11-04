import './vault-images.scss';
import React, { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { TFile } from 'obsidian';
import { ImageOff } from 'lucide-react';
import { RevealImage } from '../../primitives/RevealImage';
import { Skeleton } from '../../primitives/Skeleton';
import { useGridMetrics } from '../components/useGridMetrics';
import type { VaultImageThumbnails } from './vaultImageThumbnails';
import { t } from '../../../../i18n';

/** Name row, paddings and inner gap below the square artwork, until a row has been measured. */
const CARD_EXTRA_HEIGHT = 44;
const OVERSCAN_ROWS = 2;

/** A card's thumbnail, made once the card is mounted; its well breathes meanwhile. */
function Thumbnail({ file, thumbnails }: { file: TFile; thumbnails: VaultImageThumbnails }): React.JSX.Element {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let current = true;
    setUrl(undefined);
    void thumbnails.load(file).then((made) => { if (current) setUrl(made); });
    return () => { current = false; };
  }, [file, thumbnails]);
  if (url === undefined) return <Skeleton className="atlas-asset-card-art-skeleton" live />;
  return url
    ? <RevealImage src={url} alt="" className="atlas-vault-images__thumbnail" />
    : <div className="atlas-asset-placeholder-icon"><ImageOff /></div>;
}

/** Several images ticked to add (the creators), or one chosen at a click (the statblock's art). */
export type VaultImagePick =
  | {
    kind: 'many';
    selected: ReadonlySet<string>;
    /** Images already added to the creator. */
    queued: ReadonlySet<string>;
    onToggle: (path: string) => void;
  }
  | {
    kind: 'one';
    /** The image chosen now, shown selected. */
    chosen: string | null;
    onChoose: (file: TFile) => void;
  };

interface VaultImageGridProps {
  files: readonly TFile[];
  thumbnails: VaultImageThumbnails;
  pick: VaultImagePick;
  disabled: boolean;
  /** The element that scrolls the grid, passed as state since an ancestor's ref is set only after this grid's layout effects. */
  scrollElement: HTMLElement | null;
  /** The narrowest a card gets; the asset manager's by default. */
  minCardWidth?: number | undefined;
}

/** One image: a card with a checkbox to tick, or a button that chooses it. */
function VaultImageCard({ file, thumbnails, pick, disabled }: { file: TFile; thumbnails: VaultImageThumbnails; pick: VaultImagePick; disabled: boolean }): React.JSX.Element {
  const art = <Thumbnail file={file} thumbnails={thumbnails} />;
  const name = <span className="atlas-asset-card-name">{file.basename}</span>;
  if (pick.kind === 'one') {
    const chosen = pick.chosen === file.path;
    return (
      <button
        type="button"
        className={`atlas-asset-card atlas-vault-images__card ${chosen ? 'atlas-selected' : ''}`}
        aria-pressed={chosen}
        // Never `disabled` while a choice is written: a disabled button drops the focus out of its panel.
        aria-disabled={disabled || undefined}
        onClick={() => { if (!disabled) pick.onChoose(file); }}
      >
        <div className="atlas-asset-card-thumb">{art}</div>
        {name}
      </button>
    );
  }
  const isQueued = pick.queued.has(file.path);
  const isSelected = pick.selected.has(file.path) || isQueued;
  return (
    <label className={`atlas-asset-card atlas-vault-images__card ${isSelected ? 'atlas-selected' : ''}`} data-queued={isQueued || undefined}>
      <div className="atlas-asset-card-thumb">
        {art}
        <div className="atlas-asset-card-checkbox">
          <input type="checkbox" aria-label={t('vaultImages.select', { name: file.basename })} checked={isSelected} disabled={disabled || isQueued} onChange={() => pick.onToggle(file.path)} />
        </div>
        {isQueued && <span className="atlas-vault-images__added">{t('vaultImages.added')}</span>}
      </div>
      {name}
    </label>
  );
}

/**
 * The vault's images as cards in the asset manager's look. Only the rows in and
 * around the view are mounted, so only their thumbnails are made.
 */
export function VaultImageGrid({ files, thumbnails, pick, disabled, scrollElement, minCardWidth }: VaultImageGridProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const { columns, gap, cardWidth } = useGridMetrics(containerRef, minCardWidth);
  const virtualizer = useVirtualizer({
    count: Math.ceil(files.length / columns),
    getScrollElement: () => scrollElement,
    estimateSize: () => cardWidth + CARD_EXTRA_HEIGHT,
    overscan: OVERSCAN_ROWS,
    gap,
    scrollMargin: containerRef.current?.offsetTop ?? 0,
  });

  // Rows change height with the cards' width: drop the sizes measured before.
  useEffect(() => { virtualizer.measure(); }, [cardWidth, columns, virtualizer]);

  return (
    <div ref={containerRef} className="atlas-vault-images__grid" aria-label={t('vaultImages.list')} style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map(({ index, start }) => (
        <div
          key={index}
          ref={virtualizer.measureElement}
          data-index={index}
          className="atlas-vault-images__row"
          style={{ transform: `translateY(${start - virtualizer.options.scrollMargin}px)`, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {files.slice(index * columns, (index + 1) * columns).map((file) => (
            <VaultImageCard key={file.path} file={file} thumbnails={thumbnails} pick={pick} disabled={disabled} />
          ))}
        </div>
      ))}
    </div>
  );
}
