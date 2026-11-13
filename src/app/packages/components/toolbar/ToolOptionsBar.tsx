import React from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { MOTION_FAST_MS, PANEL_ENTER_MS, easeOut } from "../../../utils/motion"
import { ToolButton } from "../primitives/ToolButton"

/** One button of a tool's bar: its icon, its name, and what its tooltip adds (the keys that turn it around). */
export interface ToolChoice<Value extends string> {
  value: Value
  icon: React.ComponentType<{ className?: string }>
  label: string
  tip?: string
}

/** The class of a button within a mode's bar: tinted where a mode is filled, so the two bars never read as one. */
export const TOOL_BAR_CHOICE_CLASS = "atlas-tool-bar__choice"

interface ChoiceButtonsProps<Value extends string> {
  choices: readonly ToolChoice<Value>[]
  value: Value
  onChange: (value: Value) => void
  /** Why a choice cannot be made now (its tooltip says so), or null. */
  unavailable?: (value: Value) => string | null
  /** Why none of them can be made now, or null. */
  locked: string | null
  /** A mode is the tool's own choice and shows like a tool; the choices within a mode show lighter. */
  kind: 'mode' | 'choice'
}

/** One of a set of choices as a row of buttons, the chosen one pressed. */
export function ChoiceButtons<Value extends string>({ choices, value, onChange, unavailable, locked, kind }: ChoiceButtonsProps<Value>): React.ReactElement {
  return (
    <>
      {choices.map((choice) => {
        const why = locked ?? unavailable?.(choice.value) ?? null
        return (
          <ToolButton
            key={choice.value}
            icon={choice.icon}
            label={choice.label}
            {...((why ?? choice.tip) !== undefined && { subtitle: why ?? choice.tip })}
            isActive={choice.value === value}
            pressed={choice.value === value}
            disabled={why !== null}
            onClick={() => onChange(choice.value)}
            {...(kind === 'choice' && { className: TOOL_BAR_CHOICE_CLASS })}
          />
        )
      })}
    </>
  )
}

/** Where the buttons of one group end and the next group's begin: a wider gap, no line. */
export function GroupBreak(): React.ReactElement {
  return <span className="atlas-tool-bar__break" aria-hidden="true" />
}

interface ToolOptionsBarsProps {
  /** While the tool is chosen and its bars may show. */
  shown: boolean
  /** The bars (`.atlas-tool-bar`), the modes first. */
  children: React.ReactNode
}

/**
 * A tool's own bars above the main toolbar (`BottomToolbarRow`'s `options` slot), with the
 * toolbar's corners and smaller buttons: they rise into place when the tool is chosen and start
 * at the toolbar's left edge, the modes first, so no bar moves when a choice changes.
 */
export function ToolOptionsBars({ shown, children }: ToolOptionsBarsProps): React.ReactElement {
  const reduced = useReducedMotion()
  const rise = reduced ? 0 : 8
  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          key="tool-bars"
          className="atlas-tool-bars"
          initial={{ opacity: 0, y: rise }}
          animate={{ opacity: 1, y: 0, transition: { duration: PANEL_ENTER_MS / 1000, ease: easeOut } }}
          exit={{ opacity: 0, y: rise / 2, transition: { duration: MOTION_FAST_MS / 1000, ease: easeOut } }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
