import React, { useId, useRef } from 'react'
import { RotateCcw, Undo2 } from 'lucide-react'
import { cn } from 'src/utils/cn'
import { isToolbarControlId } from '../../../../toolbar/toolbarCatalog'
import { Button } from '../../primitives/button'
import { ToolButton } from '../../primitives/ToolButton'
import { useKeepInView } from '../../primitives/useKeepInView'
import type { ResponsiveToolbarItem } from '../toolbarTypes'
import type { ToolbarEditApi } from './toolbarEditContext'
import { ToolbarFace } from './ToolbarFace'
import { ToolbarItemHandle } from './ToolbarItemHandle'
import { stopMapShortcuts } from './useToolbarKeyboard'

interface ToolbarTrayProps {
  edit: ToolbarEditApi
  /** The hidden controls this view offers, in their remembered order. */
  items: readonly ResponsiveToolbarItem[]
}

/**
 * The slim capsule above the bar while the toolbar editor is open: the tools
 * that are not on the bar, then Reset (Undo reset right after one) and Done.
 * It is no dialog, so hidden tools keep their hotkeys meanwhile.
 */
export function ToolbarTray({ edit, items }: ToolbarTrayProps): React.ReactElement {
  const trayRef = useRef<HTMLDivElement>(null)
  const labelId = useId()
  const keepInView = useKeepInView(trayRef, true, 'top')
  const tabStop = items.some(item => item.id === edit.current.tray) ? edit.current.tray : items[0]?.id

  return (
    <div
      ref={trayRef}
      className={cn('atlas-toolbar-tray', keepInView.capped && 'atlas-keep-in-view--capped')}
      style={keepInView.style}
      role="toolbar"
      aria-labelledby={labelId}
      onKeyDown={stopMapShortcuts}
    >
      <span id={labelId} hidden>Hidden tools</span>
      {items.map(({ id, menuEntry }) => isToolbarControlId(id) && (
        <div key={id} className="atlas-toolbar-tray__item" data-tray-item={id}>
          <ToolbarItemHandle id={id} group="tray" tabIndex={id === tabStop ? 0 : -1} />
          <ToolbarFace entry={menuEntry} />
        </div>
      ))}
      {items.length > 0
        ? <div className="atlas-toolbar-tray__divider" />
        : <span className="atlas-toolbar-tray__hint">Drag a tool here to hide it</span>}
      {edit.canUndoReset
        ? <ToolButton icon={Undo2} label="Undo reset" isActive={false} onClick={edit.undoReset} />
        : <ToolButton icon={RotateCcw} label="Reset toolbar" isActive={false} disabled={!edit.canReset} onClick={edit.reset} />}
      <Button variant="default" className="atlas-toolbar-tray__done" onClick={(event) => edit.finish(event.currentTarget)}>
        Done
      </Button>
    </div>
  )
}
