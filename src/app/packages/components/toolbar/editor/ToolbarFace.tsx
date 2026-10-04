import React, { forwardRef } from 'react'
import { motion, type MotionStyle } from 'framer-motion'
import { cn } from 'src/utils/cn'
import { ToolButton } from '../../primitives/ToolButton'
import { ToolGroup } from '../ToolGroup'
import type { ResponsiveToolbarItem } from '../toolbarTypes'

function ignoreClick(): void {
  // A copy for the eye: its handle or the real control takes every press.
}

interface ToolbarFaceProps {
  item: Pick<ResponsiveToolbarItem, 'kind' | 'menuEntry'>
  /** `bar`: the control as the bar shows it (a tool group with its chevron); `tray`: icon only. */
  look: 'bar' | 'tray'
  style?: MotionStyle
}

/** An inert copy of a control's face (active while in use), for the tray and for a tool in flight. */
export const ToolbarFace = forwardRef<HTMLDivElement, ToolbarFaceProps>(({ item: { kind, menuEntry: entry }, look, style }, ref): React.ReactElement => (
  <motion.div ref={ref} className={cn('atlas-toolbar-face', `atlas-toolbar-face--${look}`)} inert aria-hidden="true" {...(style && { style })}>
    {look === 'bar' && kind === 'group' ? (
      // With its menu closed a tool group renders only its two buttons, exactly as in the bar.
      <ToolGroup face={entry} shortcut={entry.shortcut ?? ''} menuLabel={entry.label} menuOpen={false} onSelect={ignoreClick} onMenuToggle={ignoreClick}>
        {null}
      </ToolGroup>
    ) : (
      <ToolButton icon={entry.icon} label={entry.label} isActive={entry.isActive} onClick={ignoreClick} />
    )}
  </motion.div>
))

ToolbarFace.displayName = 'ToolbarFace'
