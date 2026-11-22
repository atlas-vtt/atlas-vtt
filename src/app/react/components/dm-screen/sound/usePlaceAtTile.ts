import { useLayoutEffect, useState, type RefObject } from 'react';
import { observeResize } from '../../../../utils/observeResize';
import { visibleViewport } from '../../../../host/visibleViewport';
import { placeUnderTile, type PopoverPlace } from './moodPopoverPlacement';

/**
 * Keeps the popover at its tile while the page scrolls, the window changes size or the popover's own content does
 * (one standing above its anchor must grow upwards), and closes it on a press elsewhere.
 */
export function usePlaceAtTile(ref: RefObject<HTMLDivElement | null>, anchor: HTMLElement, onClose: () => void): PopoverPlace | null {
  const [place, setPlace] = useState<PopoverPlace | null>(null);
  useLayoutEffect(() => {
    const doc = anchor.ownerDocument;
    const win = doc.defaultView ?? window;
    const measure = (): void => {
      const box = ref.current;
      if (!box) return;
      const tile = anchor.getBoundingClientRect();
      const seen = visibleViewport(win);
      setPlace(placeUnderTile(tile, { width: box.offsetWidth, height: box.offsetHeight }, { width: seen.right, height: seen.bottom }));
    };
    const press = (event: Event): void => {
      const target = event.target as Node | null;
      if (target && (ref.current?.contains(target) || anchor.contains(target))) return;
      onClose();
    };
    measure();
    const unobserve = ref.current ? observeResize([ref.current], measure) : () => undefined;
    win.addEventListener('resize', measure);
    doc.addEventListener('scroll', measure, true);
    doc.addEventListener('pointerdown', press, true);
    return () => {
      unobserve();
      win.removeEventListener('resize', measure);
      doc.removeEventListener('scroll', measure, true);
      doc.removeEventListener('pointerdown', press, true);
    };
  }, [anchor, onClose, ref]);
  return place;
}
