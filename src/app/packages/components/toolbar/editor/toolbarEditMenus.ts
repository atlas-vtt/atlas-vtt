import { t } from '../../../../i18n'
import type { ContextMenuEntry } from '../../../../react/root/ContextMenuContext'
import { isHideableToolbarControl, type ToolbarUnitId } from '../../../../toolbar/toolbarCatalog'

/** Where the editor's menu opens: a tool on the bar (or the undo/redo bar), one in the tray, or a row of "More tools". */
export type ToolbarEditPlace = 'bar' | 'tray' | 'overflow'

interface ToolbarEditMenuActions {
  hide: (id: ToolbarUnitId) => void
  show: (id: ToolbarUnitId) => void
}

/**
 * The editor's menu for a control. Hide stays in the menu where it cannot
 * apply (the Command palette), disabled, so the menu keeps its shape.
 */
export function toolbarEditMenu(id: ToolbarUnitId, place: ToolbarEditPlace, { hide, show }: ToolbarEditMenuActions): ContextMenuEntry[] {
  if (place === 'tray') return [{ type: 'item', label: t('toolbarEdit.showOnToolbar'), onClick: () => show(id) }]
  return [{ type: 'item', label: t('token.hide'), disabled: !isHideableToolbarControl(id), onClick: () => hide(id) }]
}
