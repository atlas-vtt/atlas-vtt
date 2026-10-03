import React, { useId } from 'react'
import { toolbarControl, type ToolbarControlId } from '../../../../toolbar/toolbarCatalog'
import { useToolbarEdit, type ToolbarHandleGroup } from './toolbarEditContext'
import { useToolbarEditMenu } from './useToolbarEditMenu'
import { useToolbarKeyboard } from './useToolbarKeyboard'

const KEY_HINTS: Record<ToolbarHandleGroup, string> = {
  bar: 'Alt with the arrow keys moves it, Delete hides it.',
  tray: 'Enter puts it back on the toolbar.',
}

interface ToolbarItemHandleProps {
  id: ToolbarControlId
  group: ToolbarHandleGroup
  /** 0 for the handle that holds its group's Tab stop, else -1. */
  tabIndex: number
}

/**
 * What the pointer and the keyboard reach of a tool while the toolbar editor
 * is open: a button laid under the tool's inert content, named after the
 * catalog. Right-click opens the editor's menu; a plain click does nothing.
 */
export function ToolbarItemHandle({ id, group, tabIndex }: ToolbarItemHandleProps): React.ReactElement {
  const edit = useToolbarEdit()
  const openMenu = useToolbarEditMenu()
  const onKeyDown = useToolbarKeyboard(id, group)
  const labelId = useId()
  const descriptionId = useId()
  const control = toolbarControl(id)

  return (
    <button
      type="button"
      className="atlas-toolbar-handle"
      data-control={id}
      tabIndex={tabIndex}
      aria-labelledby={labelId}
      aria-describedby={descriptionId}
      onKeyDown={onKeyDown}
      onFocus={() => edit?.setCurrent(group, id)}
      onContextMenu={(event) => {
        event.preventDefault()
        openMenu(id, group, { x: event.clientX, y: event.clientY })
      }}
    >
      <span id={labelId} hidden>{control.label}</span>
      <span id={descriptionId} hidden>{`${control.description} ${KEY_HINTS[group]}`}</span>
    </button>
  )
}
