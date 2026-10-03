import React, { useId, useRef } from 'react'
import { motion } from 'framer-motion'
import { RotateCcw, Undo2 } from 'lucide-react'
import { cn } from 'src/utils/cn'
import { isToolbarControlId, type ToolbarControlId } from '../../../../toolbar/toolbarCatalog'
import { Button } from '../../primitives/button'
import { ToolButton } from '../../primitives/ToolButton'
import { useKeepInView } from '../../primitives/useKeepInView'
import type { ResponsiveToolbarItem } from '../toolbarTypes'
import { slotChange, type SlotChange, type ToolbarMotion } from '../useLayoutMotion'
import { useChangedSinceCommit, useSlotPresence } from '../useSlotPresence'
import type { ToolbarEditApi } from './toolbarEditContext'
import { ToolbarFace } from './ToolbarFace'
import { ToolbarItemHandle } from './ToolbarItemHandle'
import { stopMapShortcuts } from './useToolbarKeyboard'

interface ToolbarTraySlotProps {
  id: ToolbarControlId
  item: ResponsiveToolbarItem
  shown: boolean
  change: SlotChange
  settling: boolean
  tabIndex: number
}

/** A tool's place in the tray: it opens and closes like a slot of the bar as the tool is hidden and shown. */
function ToolbarTraySlot({ id, item, shown, change, settling, tabIndex }: ToolbarTraySlotProps): React.ReactElement {
  const slotRef = useRef<HTMLDivElement>(null)
  const faceRef = useRef<HTMLDivElement>(null)
  const presence = useSlotPresence(slotRef, faceRef, shown, change)
  return (
    <motion.div
      ref={slotRef}
      className="atlas-toolbar-tray__item"
      data-tray-item={id}
      hidden={!presence.open}
      {...presence.attributes}
      {...(settling && { 'data-settling': '' })}
      style={presence.style}
    >
      {presence.open && <ToolbarItemHandle id={id} group="tray" tabIndex={tabIndex} />}
      <ToolbarFace ref={faceRef} item={item} look="tray" style={presence.contentStyle} />
    </motion.div>
  )
}

interface ToolbarTrayProps {
  edit: ToolbarEditApi
  /** Every control this view offers, in layout order; those in `edit.trayIds` are in the tray. */
  items: readonly ResponsiveToolbarItem[]
  motion: ToolbarMotion
}

/**
 * The slim capsule above the bar while the toolbar editor is open: the tools
 * that are not on the bar, then Reset (Undo reset right after one) and Done.
 * It is no dialog, so hidden tools keep their hotkeys meanwhile.
 */
export function ToolbarTray({ edit, items, motion: layoutMotion }: ToolbarTrayProps): React.ReactElement {
  const trayRef = useRef<HTMLDivElement>(null)
  const labelId = useId()
  const keepInView = useKeepInView(trayRef, true, 'top')
  const animateChanges = useChangedSinceCommit(layoutMotion.revision) || edit.flight !== null
  const inTray = new Set<string>(edit.trayIds)
  const tabStop = edit.current.tray && inTray.has(edit.current.tray) ? edit.current.tray : edit.trayIds[0]

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
      {items.map(item => isToolbarControlId(item.id) && (
        <ToolbarTraySlot
          key={item.id}
          id={item.id}
          item={item}
          shown={inTray.has(item.id)}
          change={slotChange(layoutMotion, item.id, animateChanges)}
          settling={edit.flight?.travel === true && edit.flight.id === item.id}
          tabIndex={item.id === tabStop ? 0 : -1}
        />
      ))}
      {inTray.size > 0
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
