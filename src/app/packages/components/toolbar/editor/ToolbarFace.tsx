import React, { forwardRef } from 'react'
import { motion, type MotionStyle } from 'framer-motion'
import { Redo2, Undo2 } from 'lucide-react'
import { cn } from 'src/utils/cn'
import { t } from '../../../../i18n'
import { useUndoRedo } from '../../../../react/hooks/useUndoRedo'
import { UNDO_BAR } from '../../../../toolbar/toolbarCatalog'
import { ToolButton } from '../../primitives/ToolButton'
import { ToolGroup } from '../ToolGroup'
import type { ResponsiveToolbarItem, ToolbarMenuEntry } from '../toolbarTypes'

function ignoreClick(): void {
  // A copy for the eye: its handle or the real control takes every press.
}

/** What a face copies: a control of the bar, or the undo/redo bar (`undo-bar`). */
export interface ToolbarFaceItem {
  kind: ResponsiveToolbarItem['kind'] | 'undo-bar'
  menuEntry: ToolbarMenuEntry
}

/** The undo/redo bar's face: in the tray its Undo icon alone, as a bar both its buttons. */
export const UNDO_BAR_FACE: ToolbarFaceItem = {
  kind: 'undo-bar',
  menuEntry: { icon: Undo2, label: UNDO_BAR.label, isActive: false, onSelect: ignoreClick },
}

/** The face of a control of this view, or of the undo/redo bar. */
export function faceItemOf(id: string, items: readonly ResponsiveToolbarItem[]): ToolbarFaceItem | undefined {
  return id === UNDO_BAR.id ? UNDO_BAR_FACE : items.find(item => item.id === id)
}

interface ToolbarFaceProps {
  item: ToolbarFaceItem
  /** `bar`: the control as the bar shows it (a tool group with its chevron, the undo/redo bar's two buttons); `tray`: icon only. */
  look: 'bar' | 'tray'
  style?: MotionStyle
}

/** The undo/redo bar's two buttons, laid out as the bar lays them out (so the ghost is exactly its size) and dimmed as they are there. */
function UndoBarFace(): React.ReactElement {
  const { canUndo, canRedo } = useUndoRedo()
  return (
    <div className="atlas-toolbar-face__undo-bar">
      <ToolButton icon={Undo2} label={t('history.undo')} isActive={false} disabled={!canUndo} onClick={ignoreClick} />
      <ToolButton icon={Redo2} label={t('history.redo')} isActive={false} disabled={!canRedo} onClick={ignoreClick} />
    </div>
  )
}

function BarFace({ item: { kind, menuEntry: entry } }: { item: ToolbarFaceItem }): React.ReactElement {
  if (kind === 'undo-bar') return <UndoBarFace />
  if (kind === 'group') {
    // With its menu closed a tool group renders only its two buttons, exactly as in the bar.
    return (
      <ToolGroup face={entry} shortcut={entry.shortcut ?? ''} menuLabel={entry.label} menuOpen={false} onSelect={ignoreClick} onMenuToggle={ignoreClick}>
        {null}
      </ToolGroup>
    )
  }
  return <ToolButton icon={entry.icon} label={entry.label} isActive={entry.isActive} onClick={ignoreClick} />
}

/** An inert copy of a control's face (active while in use), for the tray and for a tool in flight. */
export const ToolbarFace = forwardRef<HTMLDivElement, ToolbarFaceProps>(({ item, look, style }, ref): React.ReactElement => (
  <motion.div ref={ref} className={cn('atlas-toolbar-face', `atlas-toolbar-face--${look}`)} inert aria-hidden="true" {...(style && { style })}>
    {look === 'bar'
      ? <BarFace item={item} />
      : <ToolButton icon={item.menuEntry.icon} label={item.menuEntry.label} isActive={item.menuEntry.isActive} onClick={ignoreClick} />}
  </motion.div>
))

ToolbarFace.displayName = 'ToolbarFace'
