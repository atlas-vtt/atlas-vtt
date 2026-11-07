import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'framer-motion';
import { Skeleton, SkeletonGroup } from '../primitives/Skeleton';
import { observeResize } from '../../../utils/observeResize';
import { EASE_OUT_CONTROL_POINTS as EASE_OUT } from '../../../utils/motion';
import { cn } from '../../../../utils/cn';
import { t } from '../../../i18n';
import type { MapPicture } from './useMapPreview';

/** The longest side a preview is drawn at, in device pixels. */
const MAX_PREVIEW_SIDE = 2400;
/** How long a new picture takes to fade in over the last. */
const CROSSFADE_MS = 280;

export interface PreviewSize {
  width: number;
  height: number;
}

/** The device pixels a frame of this many CSS pixels holds, within `MAX_PREVIEW_SIDE`. */
function previewSizeOf(cssWidth: number, cssHeight: number, ratio: number): PreviewSize | null {
  if (cssWidth < 1 || cssHeight < 1) return null;
  const scale = Math.min(ratio, MAX_PREVIEW_SIDE / Math.max(cssWidth, cssHeight));
  return { width: Math.round(cssWidth * scale), height: Math.round(cssHeight * scale) };
}

/** Measures the frame the map is fitted into; null until it has a size. */
export function usePreviewSize(frame: HTMLElement | null): PreviewSize | null {
  const [size, setSize] = useState<PreviewSize | null>(null);
  useLayoutEffect(() => {
    if (!frame) return undefined;
    const measure = (): void => {
      const rect = frame.getBoundingClientRect();
      const next = previewSizeOf(rect.width, rect.height, frame.ownerDocument.defaultView?.devicePixelRatio || 1);
      setSize((old) => (old && next && old.width === next.width && old.height === next.height ? old : next));
    };
    measure();
    return observeResize([frame], measure);
  }, [frame]);
  return size;
}

interface PreviewCanvasProps {
  picture: MapPicture | null;
  drawing: boolean;
  failed: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  className?: string;
  /** Laid over the map, inside its edges (its tools, the floor switcher). */
  children?: React.ReactNode;
}

/** The CSS size of an element, kept up to date; null until it has one. */
function useCssSize(element: HTMLElement | null): PreviewSize | null {
  const [size, setSize] = useState<PreviewSize | null>(null);
  useLayoutEffect(() => {
    if (!element) return undefined;
    const measure = (): void => {
      const { width, height } = element.getBoundingClientRect();
      if (width < 1 || height < 1) {
        setSize(null);
        return;
      }
      setSize((old) => (old && old.width === width && old.height === height ? old : { width, height }));
    };
    measure();
    return observeResize([element], measure);
  }, [element]);
  return size;
}

/** The largest box of `aspect` (width over height) within `room`. */
export function containedIn(room: PreviewSize, aspect: number): PreviewSize {
  const width = Math.min(room.width, room.height * aspect);
  return { width: Math.round(width), height: Math.round(width / aspect) };
}

/**
 * A surface of the map's shape that fades in over the last and fades out at its own size, so none
 * ever changes shape. One fading out is no longer the map, and nobody reads it.
 */
function Surface({ box, children }: { box: PreviewSize | null; children: React.ReactNode }): React.JSX.Element {
  const reduced = useReducedMotion() ?? false;
  const present = useIsPresent();
  return (
    <motion.div
      className="atlas-dungeon-preview__map"
      style={box ?? {}}
      hidden={!box}
      aria-hidden={!present || undefined}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0 : CROSSFADE_MS / 1000, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}

/** One picture, drawn once when it comes; the newest is the one the map's hits read. */
function PictureCanvas({ bitmap, canvasRef, labelId }: { bitmap: ImageBitmap; canvasRef: React.RefObject<HTMLCanvasElement | null>; labelId: string }): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const node = canvas.current;
    if (!node) return;
    node.width = bitmap.width;
    node.height = bitmap.height;
    node.getContext('2d')?.drawImage(bitmap, 0, 0);
    canvasRef.current = node;
  }, [bitmap, canvasRef]);
  return <canvas ref={canvas} className="atlas-dungeon-preview__canvas" aria-labelledby={labelId} role="img" />;
}

/**
 * The drawn map, or its skeleton until the first picture arrived, on a surface exactly the map's
 * shape and as large as the room allows, so the map never reaches past it. A picture is held while
 * the next is drawn, so changing a setting never empties the pane; each new one fades in on a
 * surface of its own shape while the last fades out on its own (never one surface resizing under
 * pictures that swap). While a drawing takes a moment, the picture shown dims a little.
 */
export function PreviewCanvas({ picture, drawing, failed, canvasRef, className, children }: PreviewCanvasProps): React.JSX.Element {
  const [waiting, setWaiting] = useState(false);
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const room = useCssSize(stage);
  const labelId = useId();

  // Only a drawing that takes a moment dims the picture, so quick changes do not flicker.
  useEffect(() => {
    if (!drawing || !picture) {
      setWaiting(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setWaiting(true), 250);
    return () => window.clearTimeout(timer);
  }, [drawing, picture]);

  const box = room && picture ? containedIn(room, picture.bitmap.width / picture.bitmap.height) : room;

  return (
    <div ref={setStage} className={cn(className, waiting && 'atlas-dungeon-preview--drawing')}>
      <span id={labelId} hidden>{t('dungeon.preview.label')}</span>
      <AnimatePresence initial={false}>
        {picture ? (
          <Surface key={pictureKey(picture.bitmap)} box={box}>
            <PictureCanvas bitmap={picture.bitmap} canvasRef={canvasRef} labelId={labelId} />
          </Surface>
        ) : (
          <Surface key="skeleton" box={box}>
            <SkeletonGroup label={t('dungeon.preview.label')} className="atlas-dungeon-preview__skeleton">
              <Skeleton className="atlas-dungeon-preview__skeleton-map" />
            </SkeletonGroup>
          </Surface>
        )}
      </AnimatePresence>
      {/* One layer over the surface shown, kept across pictures, so its controls keep focus and menus. */}
      <div className="atlas-dungeon-preview__chrome" style={box ?? undefined} hidden={!box}>
        {children}
        {failed && <p className="atlas-dungeon-preview__failed" role="alert">{t('dungeon.preview.failed')}</p>}
      </div>
    </div>
  );
}

/** A key per picture, so each comes in on a surface of its own. */
const pictureKeys = new WeakMap<ImageBitmap, number>();
let lastPictureKey = 0;
function pictureKey(bitmap: ImageBitmap): number {
  let key = pictureKeys.get(bitmap);
  if (key === undefined) {
    key = ++lastPictureKey;
    pictureKeys.set(bitmap, key);
  }
  return key;
}
