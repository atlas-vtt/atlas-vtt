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

/**
 * "More tools" while the toolbar editor is open: its rows open the editor's
 * menu instead of running the control. Focus goes back to the "More tools"
 * button once that menu closes or its change is drawn (Done once nothing is
 * left in it), since the row it came from is gone by then.
 */
export function ToolbarEditOverflowMenu({ items, dropTarget }: ToolbarEditOverflowMenuProps): React.ReactElement {
  const openMenu = useToolbarEditMenu()
  return (
    <ToolbarOverflowMenu
      items={items}
      editing
      dropTarget={dropTarget}
      onEditEntry={(id, at, trigger) => {
        if (isToolbarControlId(id)) openMenu(id, 'overflow', at, { then: 'overflow', back: trigger })
      }}
    />
  )
}
