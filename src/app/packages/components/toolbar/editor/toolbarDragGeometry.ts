import { isToolbarControlId, type ToolbarControlId } from '../../../../toolbar/toolbarCatalog'
import { dropThresholds, type ClientBox, type FrozenZones } from './toolbarDropIndex'
import type { FrozenBar } from './toolbarEditStore'
import { groupHandles, isHtmlElement, mainToolbarOf, trayOf } from './toolbarEditDom'

/**
 * What a drag reads of the bar and the tray in the document: their boxes
 * when it begins, and where the bar's controls come to rest once every slot
 * and the well have finished opening or closing.
 */

function clientBox(element: Element): ClientBox {
  const { left, top, right, bottom } = element.getBoundingClientRect()
  return { left, top, right, bottom }
}

export function zonesOf(row: Element): FrozenZones | null {
  const bar = mainToolbarOf(row)
  const tray = trayOf(row)
  return bar ? { bar: clientBox(bar), tray: tray ? clientBox(tray) : null } : null
}

/** The bar's controls a drop can follow: shown and not closing, in order. */
export function shownBarIds(row: Element): ToolbarControlId[] {
  return groupHandles(row, 'bar').flatMap(({ dataset: { control } }) => (control && isToolbarControlId(control) ? [control] : []))
}

function px(value: string): number {
  return parseFloat(value) || 0
}

/** The width and end margin a moving child of the bar has once it is at rest. */
function restingSize(child: HTMLElement, wellWidth: number, gap: number): { width: number; margin: number } {
  if (child.dataset.collapsing !== undefined) return { width: 0, margin: -gap }
  if (child.classList.contains('atlas-toolbar-spacer')) return { width: wellWidth, margin: 0 }
  const content = Array.from(child.children).find(element => element.classList.contains('atlas-toolbar-item__content'))
  return { width: isHtmlElement(content) ? content.offsetWidth : child.offsetWidth, margin: 0 }
}

/**
 * The bar's thresholds (`dropThresholds`) as they will be once the bar is at
 * rest. Slots and wells move their real width, and the bar is centred in its
 * row or pushed aside by its neighbours, so where its controls end up is
 * read, not worked out: each moving child gets its resting size for one
 * synchronous layout, then its own again. With `wellToCome` the bar has no
 * well yet (a drag entering it): it will grow by the well and a gap, half on
 * either side while it stays centred, which is the best guess until the well
 * is there to be read.
 */
export function settledBar(bar: HTMLElement, draggedId: string, wellWidth: number, wellToCome = false): FrozenBar {
  const style = bar.win.getComputedStyle(bar)
  const gap = px(style.columnGap)
  const moving = Array.from(bar.children).filter((child): child is HTMLElement =>
    isHtmlElement(child) && !child.hidden && child.dataset.animating !== undefined)
  const saved = moving.map(child => ({ child, width: child.style.width, margin: child.style.marginInlineEnd }))
  for (const child of moving) {
    const rest = restingSize(child, wellWidth, gap)
    child.style.width = `${rest.width}px`
    child.style.marginInlineEnd = `${rest.margin}px`
  }

  const growth = wellToCome ? (wellWidth + gap) / 2 : 0
  const contentLeft = bar.getBoundingClientRect().left + bar.clientLeft + px(style.paddingLeft) - growth
  const ids: ToolbarControlId[] = []
  const widths: number[] = []
  for (const child of Array.from(bar.children)) {
    if (!isHtmlElement(child) || child.hidden || child.dataset.collapsing !== undefined) continue
    const id = child.dataset.toolbarItem
    if (!id || id === draggedId || !isToolbarControlId(id)) continue
    ids.push(id)
    widths.push(child.offsetWidth)
  }

  for (const { child, width, margin } of saved) {
    child.style.width = width
    child.style.marginInlineEnd = margin
  }
  return { thresholds: dropThresholds(contentLeft, widths, gap, wellWidth), ids }
}
