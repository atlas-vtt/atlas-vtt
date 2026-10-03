import { useCallback } from 'react'
import { useContextMenu } from '../../../../react/root/ContextMenuContext'
import type { ToolbarControlId } from '../../../../toolbar/toolbarCatalog'
import { useToolbarEdit, type ToolbarFocusTarget } from './toolbarEditContext'
import type { ToolbarEditPlace } from './toolbarEditMenus'

type OpenToolbarEditMenu = (id: ToolbarControlId, place: ToolbarEditPlace, at: { x: number; y: number }, then?: ToolbarFocusTarget) => void

/**
 * Opens the editor's menu for a control at a point in client coordinates;
 * `then` is where focus goes after its change. Only for parts mounted while editing.
 */
export function useToolbarEditMenu(): OpenToolbarEditMenu {
  const edit = useToolbarEdit()
  const { open } = useContextMenu()
  return useCallback((id, place, at, then) => {
    if (edit) open(edit.menuEntries(id, place, then), at)
  }, [edit, open])
}
