import { useCallback } from 'react'
import { useContextMenu } from '../../../../react/root/ContextMenuContext'
import type { ToolbarUnitId } from '../../../../toolbar/toolbarCatalog'
import { useToolbarEdit, type ToolbarFocusTarget } from './toolbarEditContext'
import type { ToolbarEditPlace } from './toolbarEditMenus'

/** Where focus goes from a menu the keyboard opened: `then` after its change, `back` when it closes without one. */
export interface ToolbarEditMenuFocus {
  then: ToolbarFocusTarget
  back: HTMLElement | null
}

type OpenToolbarEditMenu = (id: ToolbarUnitId, place: ToolbarEditPlace, at: { x: number; y: number }, focus?: ToolbarEditMenuFocus) => void

/** Opens the editor's menu for a control at a point in client coordinates. Only for parts mounted while editing. */
export function useToolbarEditMenu(): OpenToolbarEditMenu {
  const edit = useToolbarEdit()
  const { open } = useContextMenu()
  return useCallback((id, place, at, focus) => {
    if (edit) open(edit.menuEntries(id, place, focus?.then), at, { returnFocus: focus?.back ?? null })
  }, [edit, open])
}
