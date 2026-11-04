import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../../../../utils/cn';
import { useScrollActivity } from './useScrollActivity';
import './overlay-scroll.scss';

/** Shortest thumb, so a long list still leaves something to grab. */
const MIN_THUMB_PX = 24;

export interface ThumbGeometry {
  /** Offset of the thumb from the top of its track. */
  top: number;
  height: number;
}

/** Where the thumb lies in a track of `trackHeight`, or null when nothing scrolls. */
export function thumbGeometry(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  trackHeight: number,
): ThumbGeometry | null {
  const range = scrollHeight - clientHeight;
  if (range < 1 || trackHeight <= 0) return null;
  const height = Math.min(trackHeight, Math.max(MIN_THUMB_PX, (trackHeight * clientHeight) / scrollHeight));
  const progress = Math.min(1, Math.max(0, scrollTop / range));
  return { top: (trackHeight - height) * progress, height };
}

interface OverlayScrollProps extends React.HTMLAttributes<HTMLDivElement> {
  ref?: React.Ref<HTMLDivElement>;
  /** Class of the frame that holds the scroll area and its scrollbar. */
  frameClassName?: string;
}

/**
 * A vertical scroll area whose scrollbar is drawn over its inline-end padding
 * instead of taking room of its own, so the padding stays equal on both sides.
 * Chromium no longer has overlay scrollbars (`overflow: overlay`), so the native
 * one is hidden and a thumb is placed on scroll, resize and content changes,
 * written to the DOM directly so scrolling never re-renders.
 */
export function OverlayScroll({
  ref,
  frameClassName,
  className,
  children,
  ...props
}: OverlayScrollProps): React.JSX.Element {
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  useScrollActivity(scroller);

  const setRefs = useCallback((element: HTMLDivElement | null): void => {
    setScroller(element);
    if (typeof ref === 'function') ref(element);
    else if (ref) ref.current = element;
  }, [ref]);

  const place = useCallback((): void => {
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!scroller || !track || !thumb) return;
    const geometry = thumbGeometry(scroller.scrollTop, scroller.scrollHeight, scroller.clientHeight, track.clientHeight);
    track.toggleAttribute('data-scrollable', geometry !== null);
    if (!geometry) return;
    thumb.style.height = `${geometry.height}px`;
    thumb.style.transform = `translateY(${geometry.top}px)`;
  }, [scroller]);

  useEffect(() => {
    if (!scroller) return undefined;
    place();
    scroller.addEventListener('scroll', place, { passive: true });
    if (typeof ResizeObserver === 'undefined') {
      return (): void => scroller.removeEventListener('scroll', place);
    }
    // The content's height changes as the list filters and as panels swap in.
    const resizes = new ResizeObserver(place);
    const observeChildren = (): void => {
      resizes.disconnect();
      resizes.observe(scroller);
      for (const child of Array.from(scroller.children)) resizes.observe(child);
      place();
    };
    observeChildren();
    const mutations = new MutationObserver(observeChildren);
    mutations.observe(scroller, { childList: true });
    return (): void => {
      scroller.removeEventListener('scroll', place);
      resizes.disconnect();
      mutations.disconnect();
    };
  }, [scroller, place]);

  const startDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (event.button !== 0 || !scroller || !track || !thumb) return;
    event.preventDefault();
    const startY = event.clientY;
    const startTop = scroller.scrollTop;
    const travel = track.clientHeight - thumb.offsetHeight;
    const ratio = travel > 0 ? (scroller.scrollHeight - scroller.clientHeight) / travel : 0;
    thumb.setPointerCapture(event.pointerId);
    track.setAttribute('data-dragging', '');
    const move = (e: PointerEvent): void => {
      scroller.scrollTop = startTop + (e.clientY - startY) * ratio;
    };
    const end = (): void => {
      track.removeAttribute('data-dragging');
      thumb.removeEventListener('pointermove', move);
      thumb.removeEventListener('pointerup', end);
      thumb.removeEventListener('pointercancel', end);
    };
    thumb.addEventListener('pointermove', move);
    thumb.addEventListener('pointerup', end);
    thumb.addEventListener('pointercancel', end);
  };

  // The thumb lies outside the scroll area, so a wheel over it would scroll nothing.
  const forwardWheel = (event: React.WheelEvent<HTMLDivElement>): void => {
    scroller?.scrollBy({ top: event.deltaY });
  };

  return (
    <div className={cn('atlas-overlay-scroll', frameClassName)}>
      <div ref={setRefs} className={cn('atlas-overlay-scroll__area', className)} {...props}>
        {children}
      </div>
      <div ref={trackRef} className="atlas-overlay-scroll__track" aria-hidden="true">
        <div
          ref={thumbRef}
          className="atlas-overlay-scroll__thumb"
          onPointerDown={startDrag}
          onWheel={forwardWheel}
        />
      </div>
    </div>
  );
}
