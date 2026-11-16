import React, { useEffect, useMemo, useRef, useState } from "react"
import { Stamp } from "lucide-react"
import { portalHost } from "../../../host/portalHost"
import { t } from "../../../i18n"
import { isStampIcon, stampIconName } from "../../../pixi/mapIcons"
import { createPinPlaceFlyout, type PinPlaceFlyout } from "../../../tools/pinPlaceFlyout"
import { PIN_ICON_GROUPS, PIN_ICON_PATHS, type PinIconId } from "../../../types/pinIcons"
import { WIDGET_ICON_VIEW_BOX } from "../../../types/widgetIcons"
import { ToolButton } from "../primitives/ToolButton"
import { MIXED, type Shown } from "./drawStyle"
import type { DrawIcon } from "./drawToolIcons"
import { TOOL_BAR_CHOICE_CLASS } from "./ToolOptionsBar"

/** How far above its bar the flyout opens, pixels. */
const BAR_GAP = 8

/** A pin icon as a button's face. */
function glyphIcon(id: PinIconId): DrawIcon {
  return function StampGlyphIcon({ className }): React.ReactElement {
    return <svg viewBox={WIDGET_ICON_VIEW_BOX} width={24} height={24} fill="currentColor" stroke="none" className={className} aria-hidden="true"><path d={PIN_ICON_PATHS[id]} /></svg>
  }
}

interface StampSymbolToolProps {
  /** The symbol's id, or `MIXED` where the selected stamps differ. */
  value: Shown<string>
  onChange: (icon: PinIconId) => void
  /** Why the tool takes no choice now, or null. */
  locked: string | null
}

/**
 * The symbol the Stamp mode places: its button opens the pin tool's icon flyout above the bar,
 * with every pin icon in its groups and a search by name. The icons show without their pin tones,
 * since a stamp takes the tool's colour. A stamp made with one of the twelve older symbols shows
 * the tool's own face and its name; the flyout marks none then.
 */
export function StampSymbolTool({ value, onChange, locked }: StampSymbolToolProps): React.ReactElement {
  const holder = useRef<HTMLSpanElement>(null)
  const flyout = useRef<PinPlaceFlyout | null>(null)
  const [open, setOpen] = useState(false)
  const chosen = value !== MIXED && isStampIcon(value) ? value : null
  const says = locked ?? (value === MIXED ? null : stampIconName(value))
  const Face = useMemo(() => (chosen ? glyphIcon(chosen) : Stamp), [chosen])
  // What the flyout calls is what the last render handed in: it is made once.
  const latest = useRef({ chosen, onChange })
  latest.current = { chosen, onChange }

  useEffect(() => {
    const anchor = holder.current?.querySelector('button')
    if (!anchor) return undefined
    const host = portalHost(anchor.ownerDocument).createDiv({ cls: 'atlas-stamp-symbols' })
    const made = createPinPlaceFlyout(host, {
      anchor,
      selected: latest.current.chosen,
      onSelect: (id) => latest.current.onChange(id),
      groups: PIN_ICON_GROUPS,
      label: t('draw.symbol'),
      tones: false,
      hover: false,
      // Above its bar, as far from it as the bar's own menus open.
      gap: () => BAR_GAP + anchor.getBoundingClientRect().top - (anchor.closest('.atlas-tool-bar') ?? anchor).getBoundingClientRect().top,
      search: { label: t('draw.symbolSearch'), empty: t('draw.symbolNone') },
      onOpenChange: setOpen,
    })
    flyout.current = made
    return (): void => {
      flyout.current = null
      made.destroy()
      host.remove()
    }
  }, [])

  useEffect(() => flyout.current?.setSelected(chosen), [chosen])
  useEffect(() => {
    if (locked !== null) flyout.current?.close()
  }, [locked])

  return (
    <span ref={holder} className="atlas-tool-bar__holder">
      <ToolButton icon={Face} label={t('draw.symbol')} {...(says !== null && { subtitle: says })} isActive={false} disabled={locked !== null} menuExpanded={open}
        onClick={() => flyout.current?.toggle()} className={TOOL_BAR_CHOICE_CLASS} />
    </span>
  )
}
