import React from 'react'
import { isToolbarControlId } from '../../../../toolbar/toolbarCatalog'
import { ToolbarOverflowMenu } from '../ToolbarOverflowMenu'
import type { ResponsiveToolbarItem } from '../toolbarTypes'
import { useToolbarEditMenu } from './useToolbarEditMenu'

interface ToolbarEditOverflowMenuProps {
  items: readonly ResponsiveToolbarItem[]
  /** A dragged tool would land in "More tools". */
  dropTarget: boolean
}

/** "More tools" while the toolbar editor is open: its rows open the editor's menu instead of running the control. */
export function ToolbarEditOverflowMenu({ items, dropTarget }: ToolbarEditOverflowMenuProps): React.ReactElement {
  const openMenu = useToolbarEditMenu()
  return (
    <ToolbarOverflowMenu
      items={items}
      editing
      dropTarget={dropTarget}
      onEditEntry={(id, at) => {
        if (isToolbarControlId(id)) openMenu(id, 'overflow', at)
      }}
    />
  )
}
