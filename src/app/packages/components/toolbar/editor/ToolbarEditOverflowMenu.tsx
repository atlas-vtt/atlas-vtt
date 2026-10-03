import React from 'react'
import { isToolbarControlId } from '../../../../toolbar/toolbarCatalog'
import { ToolbarOverflowMenu } from '../ToolbarOverflowMenu'
import type { ResponsiveToolbarItem } from '../toolbarTypes'
import { useToolbarEditMenu } from './useToolbarEditMenu'

/** "More tools" while the toolbar editor is open: its rows open the editor's menu instead of running the control. */
export function ToolbarEditOverflowMenu({ items }: { items: readonly ResponsiveToolbarItem[] }): React.ReactElement {
  const openMenu = useToolbarEditMenu()
  return (
    <ToolbarOverflowMenu
      items={items}
      editing
      onEditEntry={(id, at) => {
        if (isToolbarControlId(id)) openMenu(id, 'overflow', at)
      }}
    />
  )
}
