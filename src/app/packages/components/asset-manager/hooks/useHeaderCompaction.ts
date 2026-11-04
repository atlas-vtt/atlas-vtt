import { useEffect, useLayoutEffect, type RefObject } from 'react';
import { observeResize } from '../../../../utils/observeResize';

/**
 * What the header toolbar gives up for room, first to last (`data-compact` in
 * `_header.scss` and `_header-controls.scss`): the tabs fold into a menu, the
 * search into a button, and at last the groups wrap onto rows.
 */
export const HEADER_COMPACT_STEPS = ['tabs', 'search', 'wrap'] as const;

/** Layout rounds to fractions of a pixel. */
const SLACK = 0.5;

/**
 * Whether the toolbar's columns fit inside it. No column is narrower than its
 * content, so columns that are too wide leave the toolbar instead of sliding
 * over each other. A toolbar that is not a grid (wrapped, or not styled yet)
 * has nothing to fit.
 */
function columnsFit(toolbar: HTMLElement): boolean {
  const style = toolbar.win.getComputedStyle(toolbar);
  const columns = style.gridTemplateColumns.split(' ').map(parseFloat).filter(Number.isFinite);
  if (columns.length === 0) return true;
  const gaps = (parseFloat(style.columnGap) || 0) * (columns.length - 1);
  return columns.reduce((sum, column) => sum + column, gaps) <= parseFloat(style.width) + SLACK;
}

/**
 * Gives the toolbar the fewest compact steps with which its controls fit. The
 * last step wraps, so it always fits. Trying a step lays its controls out for
 * a moment that is never painted; `data-fitting` switches their transitions
 * off meanwhile, or a control would animate back from a form nobody saw.
 */
export function fitHeaderToolbar(toolbar: HTMLElement): void {
  toolbar.toggleAttribute('data-fitting', true);
  for (let steps = 0; steps <= HEADER_COMPACT_STEPS.length; steps++) {
    toolbar.dataset.compact = HEADER_COMPACT_STEPS.slice(0, steps).join(' ');
    // Reads the layout, which also settles the styles of this step before the transitions return.
    if (columnsFit(toolbar)) break;
  }
  toolbar.toggleAttribute('data-fitting', false);
}

/**
 * Keeps the header toolbar as roomy as its controls allow. The controls are
 * measured, not assumed: a selection, long counts or another font change what
 * fits, so no width is written down anywhere.
 */
export function useHeaderCompaction(toolbarRef: RefObject<HTMLElement | null>): void {
  // Before paint after every render: a control may have appeared or changed width.
  useLayoutEffect(() => {
    if (toolbarRef.current) fitHeaderToolbar(toolbarRef.current);
  });

  // The window, the sidebar and styles that never re-render (theme, zoom, fonts) reach the sizes.
  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return undefined;
    return observeResize([toolbar, ...Array.from(toolbar.children)], () => fitHeaderToolbar(toolbar));
  }, [toolbarRef]);
}
