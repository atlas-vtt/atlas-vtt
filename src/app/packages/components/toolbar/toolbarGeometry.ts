/** What the fit needs to know about the rendered bar. */
export interface BarGeometry {
  /** Last measured width of every item that has been in the bar. */
  widths: Readonly<Record<string, number>>
  chrome: number
  gap: number
  overflowButtonWidth: number
}

export function sameGeometry(a: BarGeometry | null, b: BarGeometry): boolean {
  if (!a || a.chrome !== b.chrome || a.gap !== b.gap || a.overflowButtonWidth !== b.overflowButtonWidth) return false
  const ids = Object.keys(b.widths)
  return ids.length === Object.keys(a.widths).length && ids.every((id) => a.widths[id] === b.widths[id])
}

/**
 * Reads the bar's padding, border and gap, and the width of every item in it.
 * Items that are hidden (in the overflow menu, or hidden by the user) keep the
 * width they had when last shown, as long as the bar's style stays the same:
 * once it changes (the plugin's stylesheet arriving after the first render, a
 * theme switch), they are forgotten, so the fit shows them again to measure
 * them. An item in the middle of a transition (`data-animating`) keeps its
 * last width too, so a partial width never reaches the fit. The control fixed
 * at the end counts as chrome, with the gap before it. The overflow button is
 * a square icon button, so before it has ever shown, the bar's content height
 * stands in for its width.
 */
export function measureBar(bar: HTMLElement, previous: BarGeometry | null): BarGeometry {
  const style = bar.win.getComputedStyle(bar)
  const px = (value: string): number => parseFloat(value) || 0
  const overflowButton = bar.querySelector<HTMLElement>(":scope > .atlas-toolbar-overflow")
  const endControl = bar.querySelector<HTMLElement>(":scope > .atlas-toolbar-end")
  const contentHeight = bar.clientHeight - px(style.paddingTop) - px(style.paddingBottom)
  const gap = px(style.columnGap)
  const chrome = px(style.paddingLeft) + px(style.paddingRight) + px(style.borderLeftWidth) + px(style.borderRightWidth)
    + (endControl ? endControl.offsetWidth + gap : 0)
  const sameStyle = previous?.chrome === chrome && previous.gap === gap
  const widths: Record<string, number> = sameStyle ? { ...previous.widths } : {}
  for (const item of Array.from(bar.querySelectorAll<HTMLElement>(":scope > [data-toolbar-item]"))) {
    const id = item.dataset.toolbarItem
    if (id && !item.hidden && item.dataset.animating === undefined && item.offsetWidth > 0) widths[id] = item.offsetWidth
  }
  return {
    widths,
    chrome,
    gap,
    overflowButtonWidth: overflowButton?.offsetWidth || (sameStyle ? previous.overflowButtonWidth : 0) || contentHeight,
  }
}
