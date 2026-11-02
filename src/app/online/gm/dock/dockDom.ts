/**
 * Where the control lives in Atlas's map view: the bottom toolbar row and its start slot. Atlas
 * needs no change: the control is a positioned child of the row, and a spacer at the front of the
 * start slot, as wide as the collapsed control and a gap (dock.scss), makes the row leave it room.
 * Nothing here uses `instanceof`, since an element of a popout window is none of the main window's
 * classes.
 */

export const ROW_CLASS = 'atlas-bottom-toolbar-row';
export const START_CLASS = 'atlas-bottom-toolbar-row__start';
/** Atlas's gap between bars: the open control keeps it below the scene tabs. */
export const BAR_GAP = 8;

/** An element made in `parent`'s document (a popout's own), standing nowhere yet. */
export function detachedEl<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, info?: DomElementInfo): HTMLElementTagNameMap[K] {
  const el = parent.createEl(tag, info);
  el.remove();
  return el;
}

/** A div made in `parent`'s document, standing nowhere yet. */
export const detached = (parent: HTMLElement, info: DomElementInfo): HTMLDivElement => detachedEl(parent, 'div', info);

/** The bottom toolbar row of a map view, or null while it has none (loading, or Atlas changed its markup). */
export function rowOf(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>(`.${ROW_CLASS}`);
}

function startOf(row: HTMLElement): HTMLElement | null {
  return Array.from(row.children).find((child): child is HTMLElement => child.classList.contains(START_CLASS)) ?? null;
}

/** Whether both nodes stand where they belong: the control in the row, the spacer first in its start slot. */
export function isPlaced(row: HTMLElement, control: HTMLElement, spacer: HTMLElement): boolean {
  const start = startOf(row);
  return control.parentElement === row && start !== null && start.firstElementChild === spacer;
}

/** Puts both nodes into the row; false when the row has no start slot. */
export function place(row: HTMLElement, control: HTMLElement, spacer: HTMLElement): boolean {
  const start = startOf(row);
  if (start === null) return false;
  if (control.parentElement !== row) row.appendChild(control);
  if (start.firstElementChild !== spacer) start.prepend(spacer);
  return true;
}

/** Whether `node` lies inside `root`, or in one of Atlas' menus (which the control opens in the body). */
export function isInsideControl(root: HTMLElement, node: EventTarget | null): boolean {
  if (node === null || !('nodeType' in node)) return false;
  const element = node as Node;
  if (root.contains(element)) return true;
  const el = element.nodeType === 1 ? (element as Element) : element.parentElement;
  return (el?.closest('.atlas-ctx-menu') ?? null) !== null;
}

/**
 * The room from the row's bottom up to the scene tabs, a gap below them and below what hangs from
 * them (the table log's unread tab): the open control's tallest height.
 */
export function roomAbove(container: HTMLElement, row: HTMLElement, gap: number): number {
  const rowBottom = row.getBoundingClientRect().bottom;
  const tabs = container.querySelector('.atlas-top-bar-row');
  const below = container.querySelector('.atlas-top-bar-start__below')?.getBoundingClientRect();
  const tabsBottom = tabs === null ? container.getBoundingClientRect().top : tabs.getBoundingClientRect().bottom;
  const top = below === undefined || below.height === 0 ? tabsBottom : Math.max(tabsBottom, below.bottom);
  return Math.max(0, rowBottom - top - gap);
}

/**
 * How far above the control's top edge `el` ends (the open surface, or the QR card level with it).
 * Read from its CSS `bottom`, which counts from the bottom of the control's padding box, so the
 * opening motion's transform does not count.
 */
export function surfaceRise(root: HTMLElement, el: HTMLElement): number {
  const borderTop = parseFloat(root.win.getComputedStyle(root).borderTopWidth) || 0;
  return (parseFloat(root.win.getComputedStyle(el).bottom) || 0) - root.clientHeight - borderTop;
}

/** Copies text from the window `el` lives in: another window's clipboard refuses while a popout has focus. */
export async function copyText(el: HTMLElement, text: string): Promise<boolean> {
  try {
    await el.win.navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** The constructors of a window that the control takes from the window an element lives in: a popout has its own. */
export type OwnWindow = Window & { readonly ClipboardItem: typeof ClipboardItem; readonly Path2D: typeof Path2D };

/**
 * Copies a PNG from the window `el` lives in. The picture may still be on its way: the clipboard is
 * asked within the press, as it demands, and takes the picture when it is there. False where the
 * clipboard refused or the picture failed; nothing is copied then.
 */
export async function copyImage(el: HTMLElement, png: Promise<Blob>): Promise<boolean> {
  const win = el.win as OwnWindow;
  try {
    await win.navigator.clipboard.write([new win.ClipboardItem({ 'image/png': png })]);
    return true;
  } catch {
    // A picture nobody took must not fail unheard.
    png.catch(() => undefined);
    return false;
  }
}
