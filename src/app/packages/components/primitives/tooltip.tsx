"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "../../../../utils/cn"
import { noteTooltipDismissal } from "../../../keyboard/tooltipEscape"
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
  <TooltipPrimitive.Portal>
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
  /** Describes `children` instead of naming them, for controls whose visible text already names them. */
  describe?: boolean
  /** For a sentence or two of explanation: the label wraps instead of running on one line. */
  multiline?: boolean
  children: React.ReactElement
}

/**
 * Wraps `children` in the shared Atlas tooltip and names it for assistive tech.
 * The name is set through `aria-labelledby`, which takes precedence over an
 * `aria-label` on `children`. Never give `children` a `title`: it adds the browser's
 * tooltip. Obsidian's `aria-label` tooltip is off throughout Atlas (styles/_native-tooltips.scss).
 */
function LabelTooltip({ label, side = "top", describe = false, multiline = false, children }: LabelTooltipProps): React.ReactElement {
  const labelId = React.useId()
  const hasProvider = React.useContext(ProviderMounted)
  const tooltip = (
    <Tooltip>
      <TooltipTrigger asChild {...(describe ? { "aria-describedby": labelId } : { "aria-labelledby": labelId })}>{children}</TooltipTrigger>
      <span id={labelId} hidden>{label}</span>
      <TooltipContent side={side} sideOffset={10}>
        <div className="tooltip-inner">
          <span className={cn("tooltip-label", multiline && "tooltip-label--multiline")}>{label}</span>
        </div>
      </TooltipContent>
    </Tooltip>
  )
  return hasProvider ? tooltip : <TooltipProvider delayDuration={300}>{tooltip}</TooltipProvider>
}

export { LabelTooltip, Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
