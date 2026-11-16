import React, { useId, useLayoutEffect, useMemo, useState, type CSSProperties } from 'react';
import { observeResize } from '../../../utils/observeResize';

/** Where a map's rolls stand, and the mark in the map's top bar that places them. */
export interface MapRollLayer {
  /** Rendered where the rolls stood in the map's UI: the point their top right corner is placed at. */
  anchor: React.ReactElement;
  /** Ties the rolls to `anchor`. */
  style: CSSProperties;
  /** Whether the map's view is on screen; behind another tab its rolls are not either. */
  shown: boolean;
}

/**
 * A map's rolls stand in front of everything Atlas shows, since each is the answer to the user's own click: the
 * asset manager and its blurred backdrop, statblock previews and dialogs included (`.atlas-dice-rolls--front`).
 * So they render into the portal host under `<body>` (`portalHost`), not into the map's view, whose leaf is a
 * stacking context nothing in it can leave. CSS anchor positioning keeps them at the view's top right, where the
 * mark (`anchor`) stands, as the view moves and resizes. The mark has a size, so a ResizeObserver hears it vanish
 * with its view.
 */
export function useMapRollLayer(): MapRollLayer {
  const name = `--atlas-dice-rolls-${useId().replace(/[^\w-]/g, '')}`;
  const [mark, setMark] = useState<HTMLElement | null>(null);
  const [shown, setShown] = useState(true);

  useLayoutEffect(() => {
    if (!mark) return;
    const check = (): void => setShown(mark.checkVisibility());
    check();
    return observeResize([mark], check);
  }, [mark]);

  const anchor = useMemo(
    () => <span ref={setMark} className="atlas-dice-rolls-anchor" style={{ anchorName: name }} aria-hidden="true" />,
    [name],
  );
  const style = useMemo((): CSSProperties => ({ positionAnchor: name }), [name]);
  return { anchor, style, shown };
}
