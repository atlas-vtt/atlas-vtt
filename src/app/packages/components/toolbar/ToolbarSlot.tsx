import React, { useLayoutEffect, useRef } from "react"
import { motion, type Transition } from "framer-motion"
import type { SlotDrag } from "./editor/useBarDragView"
import type { SlotChange } from "./useLayoutMotion"
import { useSlotPresence } from "./useSlotPresence"
import type { ResponsiveToolbarItem } from "./toolbarTypes"

interface ToolbarSlotProps {
  item: ResponsiveToolbarItem
  /** In the bar now: placed there or visiting, and not in "More tools". */
  shown: boolean
  change: SlotChange
  /** The layout's revision (see `useLayoutMotion`): only a new one lets the slot glide to a new place. */
  revision: number
  layoutTransition: Transition
  /** Its part in a drag of the toolbar editor; `settling` also while a tool flies here. */
  drag: SlotDrag
  /** While the toolbar editor is open: the content is inert and the handle takes its place for pointer and keys. */
  inert: boolean
  handle: React.ReactNode
  /** The slot came to rest after moving its width. */
  onSettle: () => void
}

/**
 * The revision a slot hands Motion as its layout dependency. Motion measures a
 * slot again only when this changes, and a slot that was not laid out in the
 * last render (hidden, or appearing now) has no box to glide from, so it
 * keeps the value it last had while laid out.
 */
function useGlideDependency(laidOut: boolean, revision: number): number {
  const committed = useRef({ laidOut, dependency: revision })
  const dependency = committed.current.laidOut && laidOut ? revision : committed.current.dependency
  useLayoutEffect(() => {
    committed.current = { laidOut, dependency }
  })
  return dependency
}

/**
 * One control of the main toolbar. It glides to a new place only when the
 * layout changes (`layout="position"`, never a size morph), opens and closes
 * its width as it comes and goes (`useSlotPresence`), and stays mounted while
 * hidden or in "More tools", so the tool keeps its options. A control a drop
 * puts in place never glides there: the ghost carries it.
 */
export function ToolbarSlot({ item, shown, change, revision, layoutTransition, drag, inert, handle, onSettle }: ToolbarSlotProps): React.ReactElement {
  const slotRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const presence = useSlotPresence(slotRef, contentRef, shown, change, onSettle)
  const dependency = useGlideDependency(presence.open && !drag.instant, revision)

  return (
    <motion.div
      ref={slotRef}
      className="atlas-toolbar-item"
      data-toolbar-item={item.id}
      hidden={!presence.open}
      {...presence.attributes}
      {...(drag.settling && { "data-settling": "" })}
      {...(drag.lifted && { "data-lifted": "" })}
      {...(drag.pressed && { "data-pressed": "" })}
      {...(drag.revealing && { "data-revealing": "" })}
      layout="position"
      layoutDependency={dependency}
      transition={layoutTransition}
      style={presence.style}
    >
      {handle}
      {/* Always this wrapper, so a control is never remounted when edit mode starts or ends. */}
      <motion.div ref={contentRef} className="atlas-toolbar-item__content" inert={inert} style={presence.contentStyle}>
        {item.element}
      </motion.div>
    </motion.div>
  )
}
