import type { ContextMenuEntry } from '../../../../react/root/ContextMenuContext'
import { isHideableToolbarControl, type ToolbarControlId } from '../../../../toolbar/toolbarCatalog'

/** Where the editor's menu opens: a tool on the bar, one in the tray, or a row of "More tools". */
export type ToolbarEditPlace = 'bar' | 'tray' | 'overflow'

interface ToolbarEditMenuActions {
  hide: (id: ToolbarControlId) => void
  show: (id: ToolbarControlId) => void
}

/**
 * The editor's menu for a control. Hide stays in the menu where it cannot
 * apply (the Command palette), disabled, so the menu keeps its shape.
 */
export function toolbarEditMenu(id: ToolbarControlId, place: ToolbarEditPlace, { hide, show }: ToolbarEditMenuActions): ContextMenuEntry[] {
  if (place === 'tray') return [{ type: 'item', label: 'Show on toolbar', onClick: () => show(id) }]
  return [{ type: 'item', label: 'Hide', disabled: !isHideableToolbarControl(id), onClick: () => hide(id) }]
}
