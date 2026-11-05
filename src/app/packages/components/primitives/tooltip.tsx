"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "../../../../utils/cn"
import { noteTooltipDismissal } from "../../../keyboard/tooltipEscape"
import { portalHost } from "../../../host/portalHost"
import "./tooltip.css"

const ProviderMounted = React.createContext(false)

function TooltipProvider(props: React.ComponentProps<typeof TooltipPrimitive.Provider>): React.ReactElement {
  return (
    <ProviderMounted.Provider value={true}>
      <TooltipPrimitive.Provider {...props} />
    </ProviderMounted.Provider>
  )
}

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, onEscapeKeyDown, ...props }, ref) => (
  <TooltipPrimitive.Portal container={portalHost()}>
    <TooltipPrimitive.Content
      ref={ref}
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
  /** Asked each time the tooltip would open; it opens only when this says so (a name shown whole only while it is cut). */
  opensWhen?: () => boolean
  children: React.ReactElement
}

/**
 * Wraps `children` in the shared Atlas tooltip and names it for assistive tech.
 * The name is set through `aria-labelledby`, which takes precedence over an
 * `aria-label` on `children`. Never give `children` a `title`: it adds the browser's
 * tooltip. Obsidian's `aria-label` tooltip is off throughout Atlas (styles/_native-tooltips.scss).
 */
function LabelTooltip({ label, side = "top", align = "center", describe = false, multiline = false, suppressed = false, shortcut, opensWhen, children }: LabelTooltipProps): React.ReactElement {
  const labelId = React.useId()
  const hasProvider = React.useContext(ProviderMounted)
  const [gatedOpen, setGatedOpen] = React.useState(false)
  // Held here only where a gate decides: Radix asks to open, the gate answers; every other tooltip stays Radix's own.
  const gated = opensWhen ? { open: gatedOpen, onOpenChange: (open: boolean) => setGatedOpen(open && opensWhen()) } : {}
  const tooltip = (
    // Not hoverable: the content takes no pointer (tooltip.css), and Radix's grace area towards it throws
    // ("unreachable") where the trigger changed size while it showed (a tag whose words change), leaving it open.
    <Tooltip disableHoverableContent {...gated} {...(suppressed ? { open: false } : {})}>
      <TooltipTrigger asChild {...(describe ? { "aria-describedby": labelId } : { "aria-labelledby": labelId })}>{children}</TooltipTrigger>
      <span id={labelId} hidden>{label}</span>
      <TooltipContent side={side} align={align} sideOffset={10}>
        <div className="tooltip-inner">
          <span className={cn("tooltip-label", multiline && "tooltip-label--multiline")}>{label}</span>
          {shortcut && <kbd className="tooltip-kbd">{shortcut}</kbd>}
        </div>
      </TooltipContent>
    </Tooltip>
  )
  return hasProvider ? tooltip : <TooltipProvider delayDuration={300}>{tooltip}</TooltipProvider>
}

export { LabelTooltip, Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
