import React, { useRef } from "react"
import { motion } from "framer-motion"
import { useStore } from "zustand"
import { cn } from "src/utils/cn"
import { UNDO_BAR_ID } from "../../../toolbar/toolbarCatalog"
import { ToolbarEditContext, useToolbarEdit } from "./editor/toolbarEditContext"
import { ToolbarEditStoreContext, useToolbarEditState } from "./editor/toolbarEditStore"
import { ToolbarItemHandle } from "./editor/ToolbarItemHandle"
import { createToolbarRowBridge, useToolbarRowBridge } from "./editor/toolbarRowBridge"
import { stopMapShortcuts } from "./editor/useToolbarKeyboard"
import { useToolbarLayout } from "./useToolbarLayout"
import { useChangedSinceCommit, useSlotPresence } from "./useSlotPresence"

// An undo/redo bar outside a bottom row (tests) is never edited.
const LONE_BRIDGE = createToolbarRowBridge()

interface UndoBarSlotProps {
  /** The undo and redo buttons. */
  children: React.ReactNode
}

function UndoBar({ children }: UndoBarSlotProps): React.ReactElement {
  const slotRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const edit = useToolbarEdit()
  const editing = edit !== null
  const { layout: liveLayout } = useToolbarLayout()
  // During a drag the bar keeps the layout the drag began with, as the main toolbar does.
  const frozenLayout = useToolbarEditState(state => state.frozenLayout)
  const drag = useToolbarEditState(state => state.drag)
  const settle = useToolbarEditState(state => state.settle)
  const pressed = useToolbarEditState(state => state.pressed)
  const layout = frozenLayout ?? liveLayout
  const flight = edit?.flight ?? null
  const flying = flight?.id === UNDO_BAR_ID
  const animate = useChangedSinceCommit(layout) || flying || drag?.id === UNDO_BAR_ID || settle?.id === UNDO_BAR_ID
  const presence = useSlotPresence(slotRef, contentRef, !layout.hidden.has(UNDO_BAR_ID), { animate, delayMs: 0 })
  const landing = settle?.id === UNDO_BAR_ID && settle.to === "bar"

  return (
    <motion.div
      ref={slotRef}
      className="atlas-undo-bar"
      hidden={!presence.open}
      {...presence.attributes}
      {...(((landing && settle.travel) || (flying && flight.travel)) && { "data-settling": "" })}
      {...(drag?.id === UNDO_BAR_ID && { "data-lifted": "" })}
      {...(pressed === UNDO_BAR_ID && drag === null && { "data-pressed": "" })}
      {...(landing && !settle.travel && { "data-revealing": "" })}
      {...(editing && { onKeyDown: stopMapShortcuts })}
      style={presence.style}
    >
      {editing && presence.open && (
        <ToolbarItemHandle id={UNDO_BAR_ID} group="bar" tabIndex={edit.current.bar === UNDO_BAR_ID ? 0 : -1} />
      )}
      {/* Always this element, so the buttons are never remounted when edit mode starts or ends. */}
      <motion.div
        ref={contentRef}
        className={cn("atlas-vtt-toolbar atlas-undo-redo-controls pointer-events-auto", editing && "is-editing")}
        inert={editing}
        style={presence.contentStyle}
      >
        {children}
      </motion.div>
    </motion.div>
  )
}

/**
 * The undo/redo bar's place left of the main toolbar. The toolbar editor
 * hides and shows the bar as one unit (`UNDO_BAR_ID` in the stored layout's
 * hidden list): while it is hidden it stays mounted, so its hotkeys keep
 * working, and its place takes no room, which the main toolbar's fit gets.
 * While the editor is open the bar is inert under a handle, as the toolbar's
 * tools are: it can be hidden from its menu or with Delete, or dragged into
 * the tray. It works through the editor MainToolbar publishes on the bottom
 * row (`ToolbarRowBridge`); it never joins the main toolbar's order.
 */
export function UndoBarSlot({ children }: UndoBarSlotProps): React.ReactElement {
  const bridge = useToolbarRowBridge() ?? LONE_BRIDGE
  const edit = useStore(bridge.edit, state => state.api)
  return (
    <ToolbarEditContext.Provider value={edit}>
      <ToolbarEditStoreContext.Provider value={bridge.editStore}>
        <UndoBar>{children}</UndoBar>
      </ToolbarEditStoreContext.Provider>
    </ToolbarEditContext.Provider>
  )
}
