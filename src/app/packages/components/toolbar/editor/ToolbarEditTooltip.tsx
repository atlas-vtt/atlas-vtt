import React, { useRef } from 'react'
import { motion } from 'framer-motion'
import { namesHotkey } from '../../../../keyboard/mapHotkeys'
import { useHotkeyLabels } from '../../../../keyboard/useMapHotkeys'
import { toolbarUnit } from '../../../../toolbar/toolbarCatalog'
import { useEditTooltip } from './useEditTooltip'

interface ToolbarEditTooltipProps {
  /** Edit mode is on and the editor is not on its way out. */
  active: boolean
}

/**
 * The toolbar editor's one card: what the tool under the pointer or keyboard
 * focus does, with its key and a screenshot of it at work. It hangs above the
 * tray for bar and tray tools alike, so it never covers a place to drop a
 * tool, and glides between tools. Screen readers hear the same sentence from
 * the tool's handle, so the card itself is hidden from them.
 */
export function ToolbarEditTooltip({ active }: ToolbarEditTooltipProps): React.ReactElement {
  const cardRef = useRef<HTMLDivElement>(null)
  const hotkeyLabel = useHotkeyLabels()
  const { content, image, motion: cardMotion } = useEditTooltip(cardRef, active)
  const control = content ? toolbarUnit(content.id) : null
  const hotkey = control ? hotkeyLabel(control.hotkey) : ''

  return (
    <motion.div
      ref={cardRef}
      className="atlas-toolbar-card"
      aria-hidden="true"
      hidden={!control}
      style={{ ...cardMotion, originY: 1 }}
    >
      {control && (
        <>
          {image && <img className="atlas-toolbar-card__image" src={image} alt="" draggable={false} />}
          <div className="atlas-toolbar-card__text">
            <div className="atlas-toolbar-card__heading">
              <span className="atlas-toolbar-card__label">{control.label}</span>
              {namesHotkey(hotkey) && <kbd className="tooltip-kbd">{hotkey}</kbd>}
            </div>
            <p className="atlas-toolbar-card__description">{control.description}</p>
          </div>
        </>
      )}
    </motion.div>
  )
}
