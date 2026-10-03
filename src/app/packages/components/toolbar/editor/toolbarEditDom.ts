import type { ToolbarHandleGroup } from './toolbarEditContext'

/**
 * Where the editor's parts find each other in the document: the bar and the
 * editor (with its tray) are siblings in the bottom toolbar row. Children are
 * walked rather than matched with `:scope`, which jsdom resolves against the
 * wrong element once another query used it.
 */

// Not `instanceof`: an element of a popout window is none of this window's classes.
function isHtmlElement(element: Element | undefined): element is HTMLElement {
  return element !== undefined && 'dataset' in element
}

function childWithClass(parent: Element | null | undefined, className: string): HTMLElement | null {
  const child = Array.from(parent?.children ?? []).find(element => element.classList.contains(className))
  return isHtmlElement(child) ? child : null
}

/** The element that holds the bar and the editor, found from any part of either. */
export function editorRowOf(element: Element | null | undefined): Element | null {
  return element?.closest('.atlas-main-toolbar, .atlas-toolbar-editor')?.parentElement ?? null
}

export function mainToolbarOf(row: Element): HTMLElement | null {
  return childWithClass(row, 'atlas-main-toolbar')
}

/** A group's handles in order. Only controls shown in the bar count: those in "More tools" or hidden take no focus. */
export function groupHandles(row: Element, group: ToolbarHandleGroup): HTMLElement[] {
  if (group === 'tray') {
    return Array.from(childWithClass(row, 'atlas-toolbar-editor')?.querySelectorAll<HTMLElement>('.atlas-toolbar-tray .atlas-toolbar-handle') ?? [])
  }
  const items = Array.from(mainToolbarOf(row)?.children ?? [])
    .filter((item): item is HTMLElement => isHtmlElement(item) && item.classList.contains('atlas-toolbar-item') && !item.hidden)
  return items.flatMap(item => childWithClass(item, 'atlas-toolbar-handle') ?? [])
}

export function handleOf(row: Element, group: ToolbarHandleGroup, id: string): HTMLElement | null {
  return groupHandles(row, group).find(handle => handle.dataset.control === id) ?? null
}

export function paletteButtonOf(row: Element): HTMLElement | null {
  return mainToolbarOf(row)?.querySelector<HTMLElement>('[data-toolbar-item="palette"] > .atlas-toolbar-item__content button') ?? null
}

export function doneButtonOf(row: Element): HTMLElement | null {
  return childWithClass(row, 'atlas-toolbar-editor')?.querySelector<HTMLElement>('.atlas-toolbar-tray__done') ?? null
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
