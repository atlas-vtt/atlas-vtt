"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "../../../../utils/cn"
import { noteTooltipDismissal } from "../../../keyboard/tooltipEscape"
import { portalHost } from "../../../host/portalHost"
import { lastInputWasTouch } from "./lastInput"
import { placeTooltip, type TooltipPlacement } from "./tooltipPlacement"
import "./tooltip.scss"

const ProviderMounted = React.createContext(false)

function TooltipProvider(props: React.ComponentProps<typeof TooltipPrimitive.Provider>): React.ReactElement {
  return (
    <ProviderMounted.Provider value={true}>
      <TooltipPrimitive.Provider {...props} />
    </ProviderMounted.Provider>
  )
}

interface OpenStore {
  get: () => boolean
  set: (open: boolean) => void
  subscribe: (listener: () => void) => () => void
}

function openStore(initial: boolean): OpenStore {
  let open = initial
  const listeners = new Set<() => void>()
  return {
    get: () => open,
    set: (next) => {
      if (next === open) return
      open = next
      listeners.forEach((listener) => listener())
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/**
 * Radix's tooltip, with whether it is open held here where the caller does not hold it. Left to hold it itself, Radix
 * announces an opening only after it has rendered it, and a tooltip that still fades out hears its own announcement as
 * another tooltip's: a pointer that slipped off an icon and came back within the fade got a tooltip that closed itself
 * and stayed shut until the pointer left and came back. Asked through `onOpenChange`, Radix announces before anything is
 * rendered, when the fading tooltip's own close asks for nothing new.
 *
 * Radix compares each request with the `open` it was last rendered with, so a change must be rendered before the next
 * event: a store read with `useSyncExternalStore` is, while state set from a pointer move or a timer waits for a task of
 * its own, and a request arriving before that task (the pointer leaving as the delay ends) would be dropped.
 *
 * A finger gets no tooltip: Radix opens none for a touch that moves, but it opens one for focus, which a button is given
 * back when the menu or dialog it opened closes, and that tooltip would stand until the next tap elsewhere. So a request
 * to open that follows a touch is not heard; a mouse or a pen that hovers, and the keyboard, get theirs on any device.
 */
function Tooltip({ open, defaultOpen = false, onOpenChange, ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>): React.ReactElement {
  const [held] = React.useState(() => openStore(defaultOpen))
  const heldOpen = React.useSyncExternalStore(held.subscribe, held.get)
  return (
    <TooltipPrimitive.Root
      {...props}
      open={open ?? heldOpen}
      onOpenChange={(next) => {
        if (next && lastInputWasTouch()) return
        if (open === undefined) held.set(next)
        onOpenChange?.(next)
      }}
    />
  )
}

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, onEscapeKeyDown, ...props }, ref) => (
  <TooltipPrimitive.Portal container={portalHost()}>
    <TooltipPrimitive.Content
      ref={(content) => {
        // The wrapper Radix places the tooltip with takes no pointer either (tooltip.scss).
        content?.parentElement?.classList.add("atlas-tooltip-wrapper")
        if (typeof ref === "function") ref(content)
        else if (ref) ref.current = content
      }}
      sideOffset={sideOffset}
      className={cn("tooltip-content", className)}
      {...props}
      // The tooltip closes on Escape and prevents the key's default; whoever else listens must not take that for a control that used the key.
      onEscapeKeyDown={(event) => {
        noteTooltipDismissal(event)
        onEscapeKeyDown?.(event)
      }}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

interface LabelTooltipProps {
  label: string
  side?: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>["side"]
  /** Where along its side the tooltip lines up with `children`; centred unless told. */
  align?: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>["align"]
  /** Describes `children` instead of naming them, for controls whose visible text already names them. */
  describe?: boolean
  /** For a sentence or two of explanation: the label wraps instead of running on one line. */
  multiline?: boolean
  /** Keeps the tooltip shut whatever the pointer does, as while its control is being dragged. */
  suppressed?: boolean
  /** The key that does the same, shown as a keycap beside the label (as on `ToolButton`). */
  shortcut?: string
  /**
   * A quieter second line under the label (how to use the control), so the label stays a short name with its
   * keycap beside it, and the tooltip as wide as its words. Read with the label.
   */
  hint?: string
  /** Asked each time the tooltip would open; it opens only when this says so (a name shown whole only while it is cut). */
  opensWhen?: () => boolean
  /**
   * A selector of the surface `children` stand in (`.atlas-dice-panel`): the tooltip then stands `sideOffset` from
   * `children`, on `side` where it can, and never over another control of the surface or its words
   * (`tooltipPlacement.ts`); where no such place is near, it stays shut.
   */
  outside?: string
  /** How far from `children` the tooltip stands on `side` (10 px unless told). */
  sideOffset?: number
  /** A tighter tooltip, for a gap a full one would overflow onto a neighbouring control. */
  compact?: boolean
  children: React.ReactElement
}

const TOOLTIP_GAP = 10

/**
 * Wraps `children` in the shared Atlas tooltip and names it for assistive tech.
 * The name is set through `aria-labelledby`, which takes precedence over an
 * `aria-label` on `children`. Never give `children` a `title`: it adds the browser's
 * tooltip. Obsidian's `aria-label` tooltip is off throughout Atlas (styles/_native-tooltips.scss).
 */
function LabelTooltip({ label, side = "top", align = "center", describe = false, multiline = false, suppressed = false, shortcut, hint, opensWhen, outside, sideOffset = TOOLTIP_GAP, compact = false, children }: LabelTooltipProps): React.ReactElement {
  const labelId = React.useId()
  // Typed as the button Radix declares; asChild hands it whatever element `children` is.
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const hasProvider = React.useContext(ProviderMounted)
  const [gatedOpen, setGatedOpen] = React.useState(false)
  // Worked out as it opens, before its content renders: the trigger may have moved, the window shrunk.
  const [placement, setPlacement] = React.useState<TooltipPlacement | null>(null)
  // Held here only where a gate or a surface decides: Radix asks to open, the answer comes from here (a tooltip
  // that finds no place beside its control that covers no other one stays shut); every other tooltip stays Radix's own.
  const decides = opensWhen !== undefined || outside !== undefined
  const gated = decides
    ? {
        open: gatedOpen,
        onOpenChange: (open: boolean) => {
          if (!open || (opensWhen && !opensWhen())) return setGatedOpen(false)
          if (!outside) return setGatedOpen(true)
          const found = triggerRef.current ? placeTooltip(triggerRef.current, outside, side, label, shortcut, sideOffset) : null
          setPlacement(found)
          setGatedOpen(found !== null)
        },
      }
    : {}
  const tooltip = (
    // Not hoverable: the content takes no pointer (tooltip.scss), and Radix's grace area towards it throws
    // ("unreachable") where the trigger changed size while it showed (a tag whose words change), leaving it open.
    <Tooltip disableHoverableContent {...gated} {...(suppressed ? { open: false } : {})}>
      <TooltipTrigger ref={triggerRef} asChild {...(describe ? { "aria-describedby": labelId } : { "aria-labelledby": labelId })}>{children}</TooltipTrigger>
      <span id={labelId} hidden>{hint ? `${label}. ${hint}` : label}</span>
      <TooltipContent
        side={placement?.side ?? side}
        align={placement?.align ?? align}
        sideOffset={placement?.offset ?? sideOffset}
        {...(placement && { alignOffset: placement.alignOffset })}
        // A placed tooltip was checked to fit: Radix must not flip it to the surface's far side.
        {...(placement && { avoidCollisions: false })}
        {...((compact || placement?.compact) && { className: "tooltip-content--compact" })}
        {...(placement?.maxWidth !== undefined && { style: { maxWidth: placement.maxWidth } })}
      >
        <div className={cn("tooltip-inner", hint && "tooltip-inner--hint")}>
          <span className={cn("tooltip-label", (multiline || placement?.maxWidth !== undefined) && "tooltip-label--multiline")}>{label}</span>
          {shortcut && <kbd className="tooltip-kbd">{shortcut}</kbd>}
          {hint && <span className="tooltip-hint">{hint}</span>}
        </div>
      </TooltipContent>
    </Tooltip>
  )
  return hasProvider ? tooltip : <TooltipProvider delayDuration={300}>{tooltip}</TooltipProvider>
}

export { LabelTooltip, Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
