import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Skeleton } from '../primitives/Skeleton';
import { DUNGEON_STYLES, type DungeonStyleId } from '../../../dungeons/styleCatalog';
import type { MessageKey } from '../../../i18n/types';
import { observeResize } from '../../../utils/observeResize';
import { cn } from '../../../../utils/cn';
import { t } from '../../../i18n';
import type { ThumbnailSize } from './useStyleThumbnails';

/** How far each arrow key moves the choice in a radio group of cards. */
export const ARROW_STEPS: Readonly<Record<string, 1 | -1>> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/** The name a style is shown by. */
export function styleName(id: DungeonStyleId): string {
  return t(`dungeon.style.${id}` as MessageKey);
}

/** Measures a card's art in device pixels; null until it has a size. */
export function useThumbnailSize(art: HTMLElement | null): ThumbnailSize | null {
  const [size, setSize] = useState<ThumbnailSize | null>(null);
  useLayoutEffect(() => {
    if (!art) return undefined;
    const measure = (): void => {
      const rect = art.getBoundingClientRect();
      const ratio = art.ownerDocument.defaultView?.devicePixelRatio || 1;
      const next = rect.width >= 1 && rect.height >= 1 ? { width: Math.round(rect.width * ratio), height: Math.round(rect.height * ratio), ratio } : null;
      setSize(old => (old && next && old.width === next.width && old.height === next.height && old.ratio === next.ratio ? old : next));
    };
    measure();
    return observeResize([art], measure);
  }, [art]);
  return size;
}

/** Draws each new bitmap on the canvas and keeps it there until the next; `shown` once the first is drawn. */
export function useHeldPicture(bitmap: ImageBitmap | undefined): { canvas: React.RefObject<HTMLCanvasElement | null>; shown: boolean } {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawn = useRef<ImageBitmap | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const target = canvas.current;
    if (!target || !bitmap || drawn.current === bitmap) return;
    target.width = bitmap.width;
    target.height = bitmap.height;
    target.getContext('2d')?.drawImage(bitmap, 0, 0);
    drawn.current = bitmap;
    setShown(true);
  }, [bitmap]);

  return { canvas, shown };
}

interface StyleCardProps {
  id: DungeonStyleId;
  thumbnail: ImageBitmap | undefined;
  selected: boolean;
  tabbable: boolean;
  onArt?: ((art: HTMLSpanElement | null) => void) | undefined;
  onSelect: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  buttonRef: (button: HTMLButtonElement | null) => void;
}

/**
 * One style: a window of the dungeon drawn in it, its name on the picture. The picture drawn last
 * stays until the next arrives, so a new dungeon or view never empties a card; until the first,
 * the card's art breathes as a skeleton.
 */
function StyleCard({ id, thumbnail, selected, tabbable, onArt, onSelect, onKeyDown, buttonRef }: StyleCardProps): React.JSX.Element {
  const { canvas, shown } = useHeldPicture(thumbnail);

  return (
    <button
      ref={buttonRef}
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={tabbable ? 0 : -1}
      className={cn('atlas-dungeon-style-card', selected && 'atlas-active')}
      onClick={onSelect}
      onKeyDown={onKeyDown}
    >
      <span ref={onArt} className="atlas-dungeon-style-card__art">
        <canvas ref={canvas} className="atlas-dungeon-style-card__picture" hidden={!shown} aria-hidden="true" />
        {!shown && <Skeleton live className="atlas-dungeon-style-card__skeleton" />}
        <span className="atlas-dungeon-card-name">{styleName(id)}</span>
      </span>
    </button>
  );
}

interface StyleGalleryProps {
  value: DungeonStyleId;
  thumbnails: ReadonlyMap<DungeonStyleId, ImageBitmap>;
  onChange: (id: DungeonStyleId) => void;
  /** The first card's art, measured for the size thumbnails are drawn at. */
  onArt: (art: HTMLSpanElement | null) => void;
}

/**
 * Every look a dungeon can be drawn in, each shown on the dungeon itself, as one radio group: Tab
 * reaches the chosen card, the arrows (and Home, End) choose another.
 */
export function StyleGallery({ value, thumbnails, onChange, onArt }: StyleGalleryProps): React.JSX.Element {
  const buttons = useRef(new Map<DungeonStyleId, HTMLButtonElement>());

  const onKeyDown = (index: number) => (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    const step = ARROW_STEPS[event.key];
    if (step === undefined && event.key !== 'Home' && event.key !== 'End') return;
    const count = DUNGEON_STYLES.length;
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : (index + (step ?? 0) + count) % count;
    const next = DUNGEON_STYLES[target]!.id;
    event.preventDefault();
    onChange(next);
    buttons.current.get(next)?.focus();
  };

  return (
    <div className="atlas-dungeon-style-gallery" role="radiogroup" aria-label={t('dungeon.style')}>
      {DUNGEON_STYLES.map(({ id }, index) => (
        <StyleCard
          key={id}
          id={id}
          thumbnail={thumbnails.get(id)}
          selected={id === value}
          tabbable={id === value}
          onArt={index === 0 ? onArt : undefined}
          onSelect={() => onChange(id)}
          onKeyDown={onKeyDown(index)}
          buttonRef={(button) => {
            if (button) buttons.current.set(id, button);
            else buttons.current.delete(id);
          }}
        />
      ))}
    </div>
  );
}
