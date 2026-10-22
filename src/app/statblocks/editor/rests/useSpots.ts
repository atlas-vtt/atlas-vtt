import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { observeResize } from '../../../utils/observeResize';
import type { Box } from './rulePlacement';

export interface Spots {
  /** Each spot's element, as its ref hands it over. */
  register: (spotId: string, element: HTMLElement | null) => void;
  element: (spotId: string) => HTMLElement | null;
  /** Focuses a spot once the card has drawn (a spot in a closed tab shows once its tab opens). */
  focus: (spotId: string) => void;
}

/**
 * The spots of the card by id, which the chrome's overlays hand over: what the keys move focus
 * to and what the rule card is placed by. Nothing is looked up in the document.
 */
export function useSpots(): Spots {
  const elements = useRef(new Map<string, HTMLElement>());
  const [request, setRequest] = useState<{ spotId: string } | null>(null);

  const register = useCallback((spotId: string, element: HTMLElement | null): void => {
    if (element) elements.current.set(spotId, element);
    else elements.current.delete(spotId);
  }, []);
  const element = useCallback((spotId: string): HTMLElement | null => elements.current.get(spotId) ?? null, []);
  const focus = useCallback((spotId: string): void => setRequest({ spotId }), []);

  useEffect(() => {
    if (!request) return;
    elements.current.get(request.spotId)?.focus({ preventScroll: false });
    setRequest(null);
  }, [request]);

  return { register, element, focus };
}

const sameBox = (a: Box | null, b: Box): boolean =>
  a !== null && a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom;

/** The box of `target` in px of `stage`'s padding box, kept up to date while either changes size; null without both. */
export function useBoxIn(stage: HTMLElement | null, target: HTMLElement | null): Box | null {
  const [box, setBox] = useState<Box | null>(null);

  useLayoutEffect(() => {
    if (!stage || !target) {
      setBox(null);
      return;
    }
    const measure = (): void => {
      // From the padding box, which absolutely placed children are placed in
      const frame = stage.getBoundingClientRect();
      const [x, y] = [frame.left + stage.clientLeft, frame.top + stage.clientTop];
      const rect = target.getBoundingClientRect();
      const next = { left: rect.left - x, top: rect.top - y, right: rect.right - x, bottom: rect.bottom - y };
      setBox((was) => (sameBox(was, next) ? was : next));
    };
    measure();
    const view = stage.ownerDocument.defaultView;
    view?.addEventListener('resize', measure);
    const stop = observeResize([stage, target], measure);
    return () => {
      stop();
      view?.removeEventListener('resize', measure);
    };
  }, [stage, target]);

  return box;
}
