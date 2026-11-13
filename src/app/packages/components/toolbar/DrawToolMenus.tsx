import React, { useCallback, useMemo, useState } from "react"
import { CircleDashed, Trash2 } from "lucide-react"
import type { ClearScope } from "../../../annotations/annotationTypes"
import { t } from "../../../i18n"
import { DropdownMenu } from "../primitives/DropdownMenu"
import { DropdownMenuItem } from "../primitives/DropdownMenuItem"
import { DropdownSwatchGrid } from "../primitives/DropdownSwatchGrid"
import { ToolButton } from "../primitives/ToolButton"
import { MIXED, type Shown } from "./drawStyle"
import { CLEAR_SCOPES, DRAW_COLOR_SWATCHES, type DrawMenuChoice } from "./drawToolChoices"
import type { DrawIcon } from "./drawToolIcons"
import { TOOL_BAR_CHOICE_CLASS } from "./ToolOptionsBar"

interface BarMenuProps {
  /** The tool's name. */
  label: string
  /** What the tooltip adds: the choice made, or why the tool takes none now. */
  subtitle?: string | undefined
  /** The button's face. */
  icon: DrawIcon
  /** Why the tool takes no choice now, or null. */
  locked: string | null
  /** Whether the button has nothing to open (`subtitle` says why). */
  disabled?: boolean
  /** The menu's content; `close` shuts the menu after a pick. */
  children: (close: () => void) => React.ReactNode
}

/** A tool of a bar that opens its choices above its button, as the measure tool's look does. */
function BarMenu({ label, subtitle, icon, locked, disabled = false, children }: BarMenuProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const inert = disabled || locked !== null
  // The wrapper around the trigger takes the click, also where the button itself takes none.
  const toggle = useCallback((): void => setOpen((before) => !before && !inert), [inert])
  const close = useCallback((): void => setOpen(false), [])
  const shown = open && !inert
  return (
    <DropdownMenu
      isOpen={shown}
      onToggle={toggle}
      label={label}
      position="top"
      align="center"
      triggerButton={(
        <ToolButton icon={icon} label={label} {...(subtitle !== undefined && { subtitle })} isActive={false} disabled={inert} menuExpanded={shown}
          onClick={() => undefined} className={TOOL_BAR_CHOICE_CLASS} />
      )}
    >
      {children(close)}
    </DropdownMenu>
  )
}

interface ChoiceMenuProps<Value> {
  label: string
  choices: readonly DrawMenuChoice<Value>[]
  /** The choice made, or `MIXED` where the selected differ: then the button shows none. */
  value: Shown<Value>
  onChange: (value: Value) => void
  locked: string | null
}

/** A tool with three or four choices: a button whose face is the choice made, and a small menu of them above it. */
export function ChoiceMenu<Value>({ label, choices, value, onChange, locked }: ChoiceMenuProps<Value>): React.ReactElement {
  const chosen = choices.find((choice) => choice.value === value)
  return (
    <BarMenu label={label} subtitle={locked ?? chosen?.label} icon={chosen?.icon ?? CircleDashed} locked={locked}>
      {(close) => (
        <div className="atlas-dropdown-section">
          {choices.map((choice) => (
            <DropdownMenuItem
              key={choice.label}
              icon={choice.icon}
              label={choice.label}
              isActive={choice === chosen}
              onClick={() => {
                onChange(choice.value)
                close()
              }}
            />
          ))}
        </div>
      )}
    </BarMenu>
  )
}

interface ColourMenuProps {
  /** '#rrggbb', or `MIXED` where the selected differ. */
  value: Shown<string>
  onChange: (color: string) => void
  locked: string | null
}

/** The dot of the colour in hand, which opens the swatches above the bar; a pick closes them. */
export function ColourMenu({ value, onChange, locked }: ColourMenuProps): React.ReactElement {
  const Dot = useMemo<DrawIcon>(() => function ColourDot(): React.ReactElement {
    if (value === MIXED) return <span className="atlas-tool-bar__dot atlas-tool-bar__dot--mixed" />
    return <span className="atlas-tool-bar__dot" style={{ backgroundColor: value }} />
  }, [value])
  return (
    <BarMenu label={t('toolbar.colour')} subtitle={locked ?? undefined} icon={Dot} locked={locked}>
      {(close) => (
        <div className="atlas-dropdown-section">
          <DropdownSwatchGrid
            label={t('toolbar.colour')}
            labelHidden
            swatches={DRAW_COLOR_SWATCHES}
            value={value === MIXED ? '' : value}
            onChange={(color) => {
              onChange(color)
              close()
            }}
          />
        </div>
      )}
    </BarMenu>
  )
}

interface ClearMenuProps {
  /** Whether the scene has levels: then the rows name the level, else the map. */
  levelled: boolean
  /** Whether a scope has something to remove. */
  has: (scope: ClearScope) => boolean
  onClear: (scope: ClearScope) => void
  locked: string | null
}

/** Clear, as a menu since it destroys: what it can remove, each shown disabled while there is none of it. */
export function ClearMenu({ levelled, has, onClear, locked }: ClearMenuProps): React.ReactElement {
  const nothing = !has('level')
  const why = nothing ? (levelled ? t('draw.nothingDrawnOnLevel') : t('draw.nothingDrawn')) : undefined
  return (
    <BarMenu label={t('draw.clear')} subtitle={locked ?? why} icon={Trash2} locked={locked} disabled={nothing}>
      {(close) => (
        <div className="atlas-dropdown-section">
          {CLEAR_SCOPES.map(({ scope, label, labelOnLevel }) => (
            <DropdownMenuItem
              key={scope}
              destructive
              icon={Trash2}
              label={levelled ? labelOnLevel : label}
              disabled={!has(scope)}
              onClick={() => {
                onClear(scope)
                close()
              }}
            />
          ))}
        </div>
      )}
    </BarMenu>
  )
}
