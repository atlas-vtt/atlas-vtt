import React, { useRef } from "react"
import { motion } from "framer-motion"
import { useStore } from "zustand"
import { cn } from "src/utils/cn"
import type { SideBarId } from "../../../toolbar/toolbarCatalog"
import { ToolbarEditContext, useToolbarEdit } from "./editor/toolbarEditContext"
import { ToolbarEditStoreContext, useToolbarEditState } from "./editor/toolbarEditStore"
import { ToolbarItemHandle } from "./editor/ToolbarItemHandle"
import { createToolbarRowBridge, useToolbarRowBridge } from "./editor/toolbarRowBridge"
import { stopMapShortcuts } from "./editor/useToolbarKeyboard"
import { useToolbarLayout } from "./useToolbarLayout"
import { useChangedSinceCommit, useSlotPresence } from "./useSlotPresence"

// A side bar outside a bottom row (tests) is never edited.
const LONE_BRIDGE = createToolbarRowBridge()

interface SideBarSlotProps {
  id: SideBarId
  /** The classes of the bar's own element, which holds its buttons. */
  contentClassName: string
  children: React.ReactNode
}

function SideBar({ id, contentClassName, children }: SideBarSlotProps): React.ReactElement {
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
  const flying = flight?.id === id
  const animate = useChangedSinceCommit(layout) || flying || drag?.id === id || settle?.id === id
  const presence = useSlotPresence(slotRef, contentRef, !layout.hidden.has(id), { animate, delayMs: 0 })
  const landing = settle?.id === id && settle.to === "bar"

  return (
    <motion.div
      ref={slotRef}
      className="atlas-side-bar"
      data-side-bar={id}
      hidden={!presence.open}
      {...presence.attributes}
      {...(((landing && settle.travel) || (flying && flight.travel)) && { "data-settling": "" })}
      {...(drag?.id === id && { "data-lifted": "" })}
      {...(pressed === id && drag === null && { "data-pressed": "" })}
      {...(landing && !settle.travel && { "data-revealing": "" })}
      {...(editing && { onKeyDown: stopMapShortcuts })}
      style={presence.style}
    >
      {editing && presence.open && (
        <ToolbarItemHandle id={id} group="bar" tabIndex={edit.current.bar === id ? 0 : -1} />
      )}
      {/* Always this element, so the bar's content is never remounted when edit mode starts or ends. */}
      <motion.div
        ref={contentRef}
        className={cn("atlas-side-bar__content pointer-events-auto", contentClassName, editing && "is-editing")}
        inert={editing}
        style={presence.contentStyle}
      >
        {children}
      </motion.div>
    </motion.div>
  )
}

/**
 * The place of a bar beside the main toolbar (the undo/redo bar, the keyboard
 * shortcuts button, online play's button). The toolbar editor hides and shows
 * each as one unit (its id in the stored layout's hidden list): while hidden it
 * stays mounted, so its hotkeys keep working, and its place takes no room,
 * which the main toolbar's fit gets. While the editor is open the bar is inert
 * under a handle, as the toolbar's tools are: it can be hidden from its menu or
 * with Delete, or dragged into the tray. It works through the editor MainToolbar
 * publishes on the bottom row (`ToolbarRowBridge`); it never joins the main
 * toolbar's order.
 */
export function SideBarSlot(props: SideBarSlotProps): React.ReactElement {
  const bridge = useToolbarRowBridge() ?? LONE_BRIDGE
  const edit = useStore(bridge.edit, state => state.api)
  return (
    <ToolbarEditContext.Provider value={edit}>
      <ToolbarEditStoreContext.Provider value={bridge.editStore}>
        <SideBar {...props} />
      </ToolbarEditStoreContext.Provider>
    </ToolbarEditContext.Provider>
  )
}
