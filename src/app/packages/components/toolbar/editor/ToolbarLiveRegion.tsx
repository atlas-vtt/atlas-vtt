import React from 'react'

/** A message of the toolbar editor; the serial tells a repeated message from the one before it. */
export interface ToolbarAnnouncement {
  text: string
  serial: number
}

/**
 * The toolbar editor's polite live region. Each message is a new node, so
 * screen readers read a repeated one again. It is always mounted, so the
 * message that edit mode ended is still read once the tray is gone.
 */
export function ToolbarLiveRegion({ announcement }: { announcement: ToolbarAnnouncement }): React.ReactElement {
  return (
    <span className="atlas-toolbar-live-region" role="status" aria-live="polite" aria-atomic="true">
      {announcement.text && <span key={announcement.serial}>{announcement.text}</span>}
    </span>
  )
}
