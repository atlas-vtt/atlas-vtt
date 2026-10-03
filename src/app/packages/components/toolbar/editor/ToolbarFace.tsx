import React from 'react'
import { ToolButton } from '../../primitives/ToolButton'
import type { ToolbarMenuEntry } from '../toolbarTypes'

function ignoreClick(): void {
  // A copy for the eye: its handle takes every press.
}

/** An inert, icon-only copy of a control's face, as the tray shows a hidden tool (active while in use). */
export function ToolbarFace({ entry }: { entry: ToolbarMenuEntry }): React.ReactElement {
  return (
    <div className="atlas-toolbar-face" inert aria-hidden="true">
      <ToolButton icon={entry.icon} label={entry.label} isActive={entry.isActive} onClick={ignoreClick} />
    </div>
  )
}
