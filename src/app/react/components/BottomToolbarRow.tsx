import React, { useLayoutEffect, useRef, useState } from 'react';
import { ToolbarSpaceContext } from '../../packages/components/toolbar/toolbarSpace';
import { observeResize } from '../../utils/observeResize';

interface BottomToolbarRowProps {
  /** Docked to the left of the toolbar (undo/redo). */
  start?: React.ReactNode;
  /** At the right edge of the view (view actions). */
  end?: React.ReactNode;
  /** The main toolbar, centred on the view. */
  children: React.ReactNode;
  /** Bars centred above the toolbar (add-ons). */
  above?: React.ReactNode;
}

/**
 * The row along the bottom of the map. The toolbar stays centred on the view
 * while the side controls leave it room; when they do not, it slides towards
 * the free side. The row tells the toolbar how wide it may get, so the toolbar
 * moves controls into its overflow menu instead of running under the side
 * controls or off the view.
 */
export function BottomToolbarRow({ start, end, children, above }: BottomToolbarRowProps): React.ReactElement {
  const rowRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState<number | null>(null);

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
    <div ref={rowRef} className="atlas-bottom-toolbar-row">
      {above && <div className="atlas-bottom-toolbar-row__above">{above}</div>}
      <div ref={startRef} className="atlas-bottom-toolbar-row__start">{start}</div>
      <ToolbarSpaceContext.Provider value={space}>{children}</ToolbarSpaceContext.Provider>
      <div ref={endRef} className="atlas-bottom-toolbar-row__end">{end}</div>
    </div>
  );
}
