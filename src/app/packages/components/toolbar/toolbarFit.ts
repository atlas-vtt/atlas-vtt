/** One control of a responsive toolbar, as the fit sees it. */
export interface ToolbarFitItem {
  id: string;
  /** Border-box width in px; undefined until the item has rendered once. */
  width: number | undefined;
  /** Pinned items (the tool in use, an open panel's trigger) never overflow. */
  pinned: boolean;
}

/** The bar's own geometry, read from its computed style. */
export interface ToolbarFitLayout {
  /** Width the whole bar may take, border box. */
  available: number;
  /** Padding and border on both sides together. */
  chrome: number;
  /** Gap between neighbouring items. */
  gap: number;
  /** Width of the button that opens the overflow menu. */
  overflowButtonWidth: number;
}

const NOTHING_HIDDEN: ReadonlySet<string> = new Set();

/**
 * Picks the items that do not fit and go into the overflow menu. Items leave
 * from the right: the bar keeps a run of items from the left and stops at the
 * first that does not fit, so it never keeps a narrower item further right
 * over a wider one. The items that stay keep their order. Pinned items and
 * items not measured yet always stay, wherever they are; when they alone are
 * too wide, the bar overflows rather than hiding them.
 */
export function overflowingToolbarItems(items: readonly ToolbarFitItem[], layout: ToolbarFitLayout): ReadonlySet<string> {
  const { available, chrome, gap, overflowButtonWidth } = layout;
  if (!Number.isFinite(available)) return NOTHING_HIDDEN;

  const contentWidth = items.reduce((sum, item) => sum + (item.width ?? 0), 0);
  if (chrome + contentWidth + gap * Math.max(0, items.length - 1) <= available) return NOTHING_HIDDEN;

  // With the overflow button at the end, every item in the bar costs its width plus one gap.
  let used = chrome + overflowButtonWidth;
  const kept = new Set<string>();
  for (const item of items) {
    if (item.pinned || item.width === undefined) {
      kept.add(item.id);
      used += (item.width ?? 0) + gap;
    }
  }

  for (const item of items) {
    if (kept.has(item.id)) continue;
    const cost = (item.width ?? 0) + gap;
    if (used + cost > available) break;
    kept.add(item.id);
    used += cost;
  }

  return new Set(items.filter((item) => !kept.has(item.id)).map((item) => item.id));
}
