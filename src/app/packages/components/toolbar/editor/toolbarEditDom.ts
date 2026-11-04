import { UNDO_BAR_ID } from '../../../../toolbar/toolbarCatalog'
import type { ToolbarFocusTarget, ToolbarHandleGroup } from './toolbarEditContext'

/**
 * Where the editor's parts find each other in the document: the bar and the
 * editor (with its tray) are siblings in the bottom toolbar row, and the
 * undo/redo bar's slot is in the row's start slot. Children are walked rather
 * than matched with `:scope`, which jsdom resolves against the wrong element
 * once another query used it.
 */

// Not `instanceof`: an element of a popout window is none of this window's classes.
export function isHtmlElement(element: Element | undefined): element is HTMLElement {
  return element !== undefined && 'dataset' in element
}

function childWithClass(parent: Element | null | undefined, className: string): HTMLElement | null {
  const child = Array.from(parent?.children ?? []).find(element => element.classList.contains(className))
  return isHtmlElement(child) ? child : null
}

/** The element that holds the bar and the editor, found from any part of either or of the undo/redo bar. */
export function editorRowOf(element: Element | null | undefined): Element | null {
  const part = element?.closest('.atlas-main-toolbar, .atlas-toolbar-editor, .atlas-bottom-toolbar-row__start')
  return part?.parentElement ?? null
}

export function mainToolbarOf(row: Element): HTMLElement | null {
  return childWithClass(row, 'atlas-main-toolbar')
}

export function trayOf(row: Element): HTMLElement | null {
  return childWithClass(row, 'atlas-toolbar-editor')?.querySelector<HTMLElement>('.atlas-toolbar-tray') ?? null
}

/** The undo/redo bar's slot, laid out or not; none where the row has no undo/redo bar (the player view). */
export function undoSlotOf(row: Element): HTMLElement | null {
  return childWithClass(row, 'atlas-bottom-toolbar-row__start')?.querySelector<HTMLElement>('.atlas-undo-bar') ?? null
}

/** A slot that is shown and not on its way out. */
function isSettledSlot(item: Element, className: string): item is HTMLElement {
  return isHtmlElement(item) && item.classList.contains(className) && !item.hidden && item.dataset.collapsing === undefined
}

/**
 * A group's handles in order. Only tools shown in their group count: those in
 * "More tools", hidden or closing take no focus. The undo/redo bar, left of
 * the bar, comes first in the bar's group.
 */
export function groupHandles(row: Element, group: ToolbarHandleGroup): HTMLElement[] {
  const [parent, className] = group === 'tray' ? [trayOf(row), 'atlas-toolbar-tray__item'] : [mainToolbarOf(row), 'atlas-toolbar-item']
  const undo = group === 'bar' ? undoSlotOf(row) : null
  const items = [...(undo && isSettledSlot(undo, 'atlas-undo-bar') ? [undo] : []), ...Array.from(parent?.children ?? []).filter(item => isSettledSlot(item, className))]
  return items.flatMap(item => childWithClass(item, 'atlas-toolbar-handle') ?? [])
}

/** A control's slot in the bar (the undo/redo bar's own slot for it), laid out or not. */
export function barSlotOf(row: Element, id: string): HTMLElement | null {
  if (id === UNDO_BAR_ID) return undoSlotOf(row)
  const slot = Array.from(mainToolbarOf(row)?.children ?? []).find(item => isHtmlElement(item) && item.dataset.toolbarItem === id)
  return isHtmlElement(slot) ? slot : null
}

/** What a bar slot shows of its control (the handle lies under it while editing). */
export function slotContentOf(slot: Element): HTMLElement | null {
  return childWithClass(slot, 'atlas-toolbar-item__content')
}

/** A control's slot in the tray, laid out or not. */
export function traySlotOf(row: Element, id: string): HTMLElement | null {
  const slot = Array.from(trayOf(row)?.children ?? []).find(item => isHtmlElement(item) && item.dataset.trayItem === id)
  return isHtmlElement(slot) ? slot : null
}

/** The "More tools" button, where it shows. */
export function overflowButtonOf(row: Element): HTMLElement | null {
  return childWithClass(mainToolbarOf(row), 'atlas-toolbar-overflow')
}

export function handleOf(row: Element, group: ToolbarHandleGroup, id: string): HTMLElement | null {
  return groupHandles(row, group).find(handle => handle.dataset.control === id) ?? null
}

export function paletteButtonOf(row: Element): HTMLElement | null {
  return mainToolbarOf(row)?.querySelector<HTMLElement>('[data-toolbar-item="palette"] > .atlas-toolbar-item__content button') ?? null
}

export function doneButtonOf(row: Element): HTMLElement | null {
  return trayOf(row)?.querySelector<HTMLElement>('.atlas-toolbar-tray__done') ?? null
}

/** The element a focus target names, where it shows. */
export function focusTargetOf(row: Element, target: ToolbarFocusTarget): HTMLElement | null {
  if (target === 'done') return doneButtonOf(row)
  if (target === 'overflow') return overflowButtonOf(row)?.querySelector<HTMLElement>('button') ?? null
  return handleOf(row, target.group, target.id)
}

/** The handle among `candidates` nearest to `from` along the bar (Up and Down between bar and tray). */
export function nearestHandle(from: Element, candidates: readonly HTMLElement[]): HTMLElement | null {
  const centre = (element: Element): number => {
    const rect = element.getBoundingClientRect()
    return rect.left + rect.width / 2
  }
  const x = centre(from)
  let nearest: HTMLElement | null = null
  for (const candidate of candidates) {
    if (!nearest || Math.abs(centre(candidate) - x) < Math.abs(centre(nearest) - x)) nearest = candidate
  }
  return nearest
}
