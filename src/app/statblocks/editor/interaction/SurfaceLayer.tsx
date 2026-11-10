import React, { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';

export interface SurfaceLayerProps {
  /** A positioned element outside the card's scroller: the note panel's host, or the template editor's root. */
  host: HTMLElement | null;
  /** Rendered with the layer once it is in the document. */
  children: (layer: HTMLElement) => React.ReactNode;
}

/**
 * A layer over a surface for its floating chrome (spec §3.3): absolutely
 * positioned over `host`, outside the scroller, which would clip anything in
 * it, and taking the pointer only on its own controls. Leaves have
 * `contain: strict`, so nothing may be `position: fixed` against the window.
 */
export function SurfaceLayer({ host, children }: SurfaceLayerProps): React.ReactPortal | null {
  const [layer, setLayer] = useState<HTMLElement | null>(null);
  const ref = useCallback((node: HTMLDivElement | null) => setLayer(node), []);
  if (!host) return null;
  return createPortal(
    <div ref={ref} className="atlas-vtt-plugin atlas-sb-surface-layer">
      {layer && children(layer)}
    </div>,
    host,
  );
}
