import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion, useIsPresent } from 'framer-motion'
import { canRunMapHotkeys } from '../../../../keyboard/mapHotkeys'
import { useContextMenu } from '../../../../react/root/ContextMenuContext'
import { useAtlasUI } from '../../../../react/root/AtlasUIContext'
import { findAtlasLeafByViewId } from '../../../../utils/atlasLeafLookup'
import { observeResize } from '../../../../utils/observeResize'
import type { ResponsiveToolbarItem } from '../toolbarTypes'
import type { ToolbarMotion } from '../useLayoutMotion'
import { useToolbarEdit, type ToolbarEditApi } from './toolbarEditContext'
import { ToolbarDragGhost, ToolbarFlightGhost } from './ToolbarDragGhost'
import { useToolbarEditState, useToolbarEditStore } from './toolbarEditStore'
import { useTrayVariants } from './editorMotion'
import { doneButtonOf, focusTargetOf, groupHandles, mainToolbarOf } from './toolbarEditDom'
import { ToolbarEditTooltip } from './ToolbarEditTooltip'
import { ToolbarTray } from './ToolbarTray'

interface ToolbarEditorProps {
  /** Every control this view offers, in layout order: the tray shows the hidden ones, a flight any. */
  items: readonly ResponsiveToolbarItem[]
  motion: ToolbarMotion
  viewId?: string | undefined
  /** The palette action was chosen with the keyboard: focus starts on the bar's first tool. */
  focusOnEntry: boolean
}

/**
 * Edit mode's own parts, mounted while it lasts: the tray hanging above the
 * bar, and the ways out other than Done and the panels that end it (Escape no
 * control used, another tab coming to the front, the scene unloading). It
 * sits over the bar's cell of the bottom row without taking one, so the bar's
 * width and corners are those of any other moment; the layer that holds a
 * flying or dragged tool spans the whole row. While the tray sinks away after edit mode
 * ends, it shows what it last showed and takes no input.
 */
export function ToolbarEditor({ items, motion: layoutMotion, viewId, focusOnEntry }: ToolbarEditorProps): React.ReactElement | null {
  const edit = useToolbarEdit()
  const lastEdit = useRef<ToolbarEditApi | null>(edit)
  if (edit) lastEdit.current = edit
  const present = useIsPresent()
  const trayVariants = useTrayVariants()
  const { app, view } = useAtlasUI()
  const { close: closeContextMenu } = useContextMenu()
  const rootRef = useRef<HTMLDivElement>(null)
  const [barHeight, setBarHeight] = useState<number | null>(null)
  const editStore = useToolbarEditStore()
  const dragGhost = useToolbarEditState(state => state.ghost)
  const finish = edit?.finish

  useLayoutEffect(() => {
    const row = rootRef.current?.parentElement
    const bar = row ? mainToolbarOf(row) : null
    if (!bar) return undefined
    const measure = (): void => setBarHeight(bar.offsetHeight)
    measure()
    return observeResize([bar], measure)
  }, [])

  useLayoutEffect(() => {
    const row = rootRef.current?.parentElement
    if (focusOnEntry && row) groupHandles(row, 'bar')[0]?.focus()
  }, [focusOnEntry])

  // After a change is drawn, focus goes where the change asked; Done where that is gone.
  useLayoutEffect(() => {
    const target = edit?.takeFocusRequest()
    const row = rootRef.current?.parentElement
    if (!target || !row) return
    const element = focusTargetOf(row, target) ?? doneButtonOf(row)
    element?.focus()
  })

  // Escape that no control used (an open menu, a canvas gesture) ends edit mode, asked as the map's shortcuts ask.
  useEffect(() => {
    const root = rootRef.current
    if (!root || !finish) return undefined
    const doc = root.doc
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || !canRunMapHotkeys(event, viewId)) return
      event.preventDefault()
      finish(doc.activeElement)
    }
    doc.addEventListener('keydown', onKeyDown)
    return () => doc.removeEventListener('keydown', onKeyDown)
  }, [finish, viewId])

  useEffect(() => {
    if (!finish) return undefined
    const leafChange = app.workspace.on('active-leaf-change', (leaf) => {
      if (viewId && leaf !== findAtlasLeafByViewId(app.workspace, viewId)) finish()
    })
    const bus = view?.serviceManager?.getEventBus?.()
    const unloading = (): void => finish()
    bus?.on('map-unloading', unloading)
    return () => {
      app.workspace.offref(leafChange)
      bus?.off('map-unloading', unloading)
    }
  }, [app, view, viewId, finish])

  // The editor's menus close with it.
  useEffect(() => closeContextMenu, [closeContextMenu])

  const shown = edit ?? lastEdit.current
  if (!shown) return null
  const style = barHeight === null ? undefined : { '--atlas-toolbar-bar-height': `${barHeight}px` } as React.CSSProperties
  const flight = edit?.flight ?? null
  const flying = flight ? items.find(item => item.id === flight.id) : undefined
  const dragged = dragGhost ? items.find(item => item.id === dragGhost.id) : undefined
  return (
    <>
      <div ref={rootRef} className="atlas-toolbar-editor" style={style} inert={!present}>
        {/* The tray, and the card above it, rise out of the bar as the editor opens and sink back as it closes. */}
        <motion.div className="atlas-toolbar-editor__tray-row" variants={trayVariants} initial="hidden" animate="visible" exit="exit">
          <ToolbarTray edit={shown} items={items} motion={layoutMotion} />
          <ToolbarEditTooltip active={present && edit !== null} />
        </motion.div>
      </div>
      <div className="atlas-toolbar-ghost-layer">
        {flight && flying && <ToolbarFlightGhost key={`flight-${flight.serial}`} flight={flight} item={flying} onLanded={shown.landFlight} />}
        {dragGhost && dragged && <ToolbarDragGhost key={`drag-${dragGhost.serial}`} ticket={dragGhost} item={dragged} store={editStore} />}
      </div>
    </>
  )
}
