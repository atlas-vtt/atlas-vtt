import { TokenRingToggle } from './TokenRingToggle';
import { TokenSizeSelect } from './TokenSizeSelect';
import tokenRingImageUrl from '../../../../assets/token-ring.webp';
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '../../../../../utils/cn';
import { Button } from '../../primitives/button';
import { Slider } from '../../primitives/slider';
import { LabelTooltip } from '../../primitives/tooltip';
import { Skeleton } from '../../primitives/Skeleton';
import { clampImagePosition, cropReset, renderedImageRect } from './cropMath';
import type { ImageAspect } from './cropMath';
import { clampZoom, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from './types';
import type { CreatorMode, ImagePosition, TokenPreview, TokenPreviewPatch } from './types';
import { t } from '../../../../i18n';

interface TokenPreviewCardProps {
  preview: TokenPreview;
  mode: CreatorMode;
  /** The card's place in the stagger of cards entering together, or null to show it without the enter animation. */
  enterIndex?: number | null;
  /** Stable callbacks that take the preview's id, so an unchanged card never renders again. */
  onChange: (id: string, patch: TokenPreviewPatch) => void;
  onToggleSelected: (id: string) => void;
  onRemove: (id: string) => void;
}

const WHEEL_ZOOM_SENSITIVITY = 0.0025;
const ENTER_STAGGER_CAP = 12;

/** Natural size of the image behind a URL, for aspect-aware drag limits. */
function useImageAspect(url: string): ImageAspect | null {
  const [aspect, setAspect] = useState<ImageAspect | null>(null);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => { if (!cancelled) setAspect({ width: image.naturalWidth, height: image.naturalHeight }); };
    image.src = url;
    return () => { cancelled = true; };
  }, [url]);
  return aspect;
}

/**
 * Tracks the rendered width of the art well so fractional offsets map to pixels.
 * Takes the element itself: toggling the ring remounts the well, and an observer
 * left on the detached one would report 0 and pin the image in place.
 */
function useWellSize(element: HTMLDivElement | null): number {
  const [size, setSize] = useState(0);
  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setSize(entry.contentRect.width); });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return size;
}

function pixels(size: { width: number; height: number }): string {
  return `${size.width} × ${size.height}`;
}

/**
 * What the conversion did to the upload. A map that lost pixels says so with
 * its new size, since small labels may no longer be readable; token art always
 * shrinks to token size, so there the saved file size is the news.
 */
function ConversionBadge({ preview, mode }: Pick<TokenPreviewCardProps, 'preview' | 'mode'>): React.JSX.Element | null {
  const { scaledDown, compressionRatio } = preview;
  if (mode === 'map' && scaledDown) {
    return (
      <LabelTooltip label={t('creator.scaledDown', { from: pixels(scaledDown.from) })}>
        <div className="atlas-token-card__badge atlas-token-card__badge--scaled">{pixels(scaledDown.to)} px</div>
      </LabelTooltip>
    );
  }
  if (compressionRatio === undefined || compressionRatio <= 0) return null;
  return (
    <LabelTooltip label={t('creator.reduction')}>
      <div className="atlas-token-card__badge">−{compressionRatio}%</div>
    </LabelTooltip>
  );
}

/**
 * One preview in the grid. Tokens get a crop editor (drag to reposition, wheel
 * or slider to zoom, double-click to reset) with the image beyond the circle
 * dimmed rather than hidden; maps show whole. Positions are fractions of the
 * well so the export can reproduce the preview exactly. Memoized: a large
 * import changes a few cards at a time, and rendering every card for each
 * change made thousands of previews crawl.
 */
export const TokenPreviewCard = React.memo(function TokenPreviewCard({ preview, mode, enterIndex = 0, onChange: onChangePreview, onToggleSelected, onRemove }: TokenPreviewCardProps): React.JSX.Element {
  const onChange = (patch: TokenPreviewPatch): void => onChangePreview(preview.id, patch);
  // Decided once, at mount: switching it later would cut the enter animation short
  const [entrance] = useState(enterIndex);
  const nameLabelId = useId();
  const [artElement, setArtElement] = useState<HTMLDivElement | null>(null);
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const isCropEditable = mode === 'token';
  const framed = isCropEditable && preview.showRing !== false;
  const aspect = useImageAspect(preview.previewUrl);
  const wellSize = useWellSize(artElement);

  const clampPosition = useCallback(
    (position: ImagePosition, scale: number): ImagePosition => clampImagePosition(position, scale, aspect, framed ? undefined : 'contain'),
    [aspect, framed],
  );

  useEffect(() => {
    if (!isCropEditable) return;
    const { imagePosition, imageScale } = previewRef.current;
    const clamped = clampPosition(imagePosition, imageScale);
    if (clamped.x !== imagePosition.x || clamped.y !== imagePosition.y) onChangeRef.current({ imagePosition: clamped });
  }, [isCropEditable, preview.imageScale, clampPosition]);

  useEffect(() => {
    if (!artElement || !isCropEditable) return;
    const handleWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const next = previewRef.current.imageScale * Math.exp(-e.deltaY * WHEEL_ZOOM_SENSITIVITY);
      onChangeRef.current({ imageScale: clampZoom(next) });
    };
    artElement.addEventListener('wheel', handleWheel, { passive: false });
    return () => artElement.removeEventListener('wheel', handleWheel);
  }, [artElement, isCropEditable]);

  const setScale = (scale: number): void => onChange({ imageScale: clampZoom(scale) });
  const initialCrop = cropReset(preview);
  const resetCrop = (): void => onChange(initialCrop);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const target = e.currentTarget;
    const startPosition = preview.imagePosition;
    const size = target.getBoundingClientRect().width || 1;
    target.setPointerCapture(e.pointerId);
    target.classList.add('atlas-dragging');

    const handleMove = (move: PointerEvent): void => {
      const next = {
        x: startPosition.x + (move.clientX - e.clientX) / size,
        y: startPosition.y + (move.clientY - e.clientY) / size,
      };
      onChange({ imagePosition: clampPosition(next, previewRef.current.imageScale) });
    };
    const handleUp = (): void => {
      target.classList.remove('atlas-dragging');
      target.removeEventListener('pointermove', handleMove);
      target.removeEventListener('pointerup', handleUp);
      target.removeEventListener('pointercancel', handleUp);
    };
    target.addEventListener('pointermove', handleMove);
    target.addEventListener('pointerup', handleUp);
    target.addEventListener('pointercancel', handleUp);
  };

  const placement: React.CSSProperties = isCropEditable
    ? {
        backgroundSize: !framed && !aspect ? 'contain' : `${renderedImageRect(preview.imageScale, preview.imagePosition, aspect, framed ? undefined : 'contain').width * 100}%`,
        backgroundPosition: `calc(50% + ${preview.imagePosition.x * wellSize}px) calc(50% + ${preview.imagePosition.y * wellSize}px)`,
      }
    : { backgroundSize: 'contain', backgroundPosition: 'center' };
  const imageStyle: React.CSSProperties = preview.previewUrl ? { backgroundImage: `url(${preview.previewUrl})`, ...placement } : {};

  const zoomPercent = Math.round(preview.imageScale * 100);

  const art = (
    <div
      ref={setArtElement}
      className="atlas-token-card__art"
      onDoubleClick={isCropEditable ? resetCrop : undefined}
    >
      <div
        className="atlas-token-card__image"
        style={imageStyle}
        onPointerDown={isCropEditable ? handlePointerDown : undefined}
      />
      {/* The card never shows the upload itself: its place is held until the converted image is there. */}
      {preview.isOptimizing && <Skeleton className="atlas-token-card__pending" live />}
      {framed && <><div className="atlas-token-card__mask" /><img className="atlas-token-card__ring" src={tokenRingImageUrl} alt="" /></>}

      <LabelTooltip label={t('creator.select', { name: preview.name })}>
        <button
          type="button"
          className={cn('atlas-token-card__check', preview.isSelected && 'atlas-checked')}
          role="checkbox"
          aria-checked={preview.isSelected}
          onClick={(e) => { e.stopPropagation(); onToggleSelected(preview.id); }}
        >
          <Check />
        </button>
      </LabelTooltip>
      <LabelTooltip label={t('common.remove')}>
        <Button
          variant="ghost"
          size="icon"
          className="atlas-token-card__remove"
          onClick={(e) => { e.stopPropagation(); onRemove(preview.id); }}
        >
          <Trash2 />
        </Button>
      </LabelTooltip>

      <ConversionBadge preview={preview} mode={mode} />
    </div>
  );

  return (
    <div
      className={cn('atlas-token-card', `atlas-token-card--${mode}`, preview.isSelected && 'atlas-selected', !framed && 'atlas-token-card--unframed', entrance === null && 'atlas-token-card--settled')}
      style={{ '--atlas-enter-index': Math.min(entrance ?? 0, ENTER_STAGGER_CAP) } as React.CSSProperties}
    >
      {isCropEditable ? <LabelTooltip label={t('creator.cropHint')}>{art}</LabelTooltip> : art}

      <span id={nameLabelId} hidden>{t(`creator.${mode}.name`)}</span>
      <input
        type="text"
        value={preview.name}
        onChange={(e) => onChange({ name: e.target.value })}
        className="atlas-token-card__name"
        placeholder={t(`creator.${mode}.name`)}
        spellCheck={false}
        aria-labelledby={nameLabelId}
      />

      {preview.tags && preview.tags.length > 0 && <div className="atlas-token-card__tags">{preview.tags.join(' · ')}</div>}
      {mode === 'token' && <>
        <TokenRingToggle label={t('creator.toggleRingFor', { name: preview.name })} value={preview.showRing !== false} onChange={showRing => onChange({ showRing })} />
        <TokenSizeSelect className="atlas-setting-dropdown" value={preview.size} onChange={size => onChange({ size })} />
      </>}
      {isCropEditable && (
        <div className="atlas-token-card__zoom">
          <LabelTooltip label={t('creator.zoomOut')}>
            <Button variant="ghost" size="icon" className="atlas-token-card__zoom-btn" onClick={() => setScale(preview.imageScale - ZOOM_STEP)} disabled={preview.imageScale <= ZOOM_MIN}>
              <ZoomOut />
            </Button>
          </LabelTooltip>
          <LabelTooltip label={t('creator.zoom')}>
            <Slider
              value={[preview.imageScale]}
              min={ZOOM_MIN}
              max={ZOOM_MAX}
              step={0.01}
              onValueChange={(v) => setScale(v[0] ?? preview.imageScale)}
            />
          </LabelTooltip>
          <LabelTooltip label={t('creator.zoomIn')}>
            <Button variant="ghost" size="icon" className="atlas-token-card__zoom-btn" onClick={() => setScale(preview.imageScale + ZOOM_STEP)} disabled={preview.imageScale >= ZOOM_MAX}>
              <ZoomIn />
            </Button>
          </LabelTooltip>
          <LabelTooltip label={t('creator.resetZoom', { percent: Math.round(initialCrop.imageScale * 100) })}>
            <button
              type="button"
              className="atlas-token-card__zoom-value"
              onClick={() => setScale(initialCrop.imageScale)}
            >
              {zoomPercent}%
            </button>
          </LabelTooltip>
        </div>
      )}
    </div>
  );
});
