import React, { useLayoutEffect, useRef, useState } from 'react';
import { createToolbarRowBridge, ToolbarRowBridgeContext } from '../../packages/components/toolbar/editor/toolbarRowBridge';
import { ToolbarSpaceContext } from '../../packages/components/toolbar/toolbarSpace';
import { observeResize } from '../../utils/observeResize';

interface BottomToolbarRowProps {
  /** Docked to the left of the toolbar (undo/redo). */
  start?: React.ReactNode;
  /** At the right edge of the view (view actions). */
  end?: React.ReactNode;
  /** Centred above the row (the turn banner); it takes no room in the row. */
  above?: React.ReactNode;
  /** The main toolbar, centred on the view. */
  children: React.ReactNode;
}

/**
 * The row along the bottom of the map. The toolbar stays centred on the view
 * while the side controls leave it room; when they do not, it slides towards
 * the free side. The row tells the toolbar how wide it may get, so the toolbar
 * moves controls into its overflow menu instead of running under the side
 * controls or off the view. The toolbar editor's state is shared through the
 * row, since it arranges the undo/redo bar beside the toolbar too.
 */
export function BottomToolbarRow({ start, end, above, children }: BottomToolbarRowProps): React.ReactElement {
  const rowRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState<number | null>(null);
  const [bridge] = useState(createToolbarRowBridge);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const startSlot = startRef.current;
    const endSlot = endRef.current;
    if (!row || !startSlot || !endSlot) return undefined;

    const measure = (): void => {
      // A row that is not laid out (hidden leaf, tests) constrains nothing.
      if (row.clientWidth === 0) {
        setSpace(null);
        return;
      }
      const gap = parseFloat(row.win.getComputedStyle(row).columnGap) || 0;
      const next = Math.max(0, row.clientWidth - startSlot.offsetWidth - endSlot.offsetWidth - 2 * gap);
      setSpace(next);
    };
    measure();
    return observeResize([row, startSlot, endSlot], measure);
  }, []);

  return (
    <ToolbarRowBridgeContext.Provider value={bridge}>
      <div ref={rowRef} className="atlas-bottom-toolbar-row">
        <div ref={startRef} className="atlas-bottom-toolbar-row__start">{start}</div>
        <ToolbarSpaceContext.Provider value={space}>{children}</ToolbarSpaceContext.Provider>
        <div ref={endRef} className="atlas-bottom-toolbar-row__end">{end}</div>
        {above}
      </div>
    </ToolbarRowBridgeContext.Provider>
  );
}
