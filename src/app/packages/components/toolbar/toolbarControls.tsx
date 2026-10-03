import React from "react"
import { Command, Dices, ImageIcon, MapPin, Volume2 } from "lucide-react"
import { CoinIcon } from "../../../react/components/CoinIcon"
import { DiceDropdownMenu } from "../../../react/components/dice/DiceDropdownMenu"
import type { ToolbarControlId } from "../../../toolbar/toolbarCatalog"
import { ToolButton } from "../primitives/ToolButton"
import { DrawToolGroup } from "./DrawToolGroup"
import { FogToolGroup } from "./FogToolGroup"
import { LightingToolGroup } from "./LightingToolGroup"
import { MeasureToolGroup } from "./MeasureToolGroup"
import { MoveToolGroup } from "./MoveToolGroup"
import { TextToolGroup } from "./TextToolGroup"
import { drawToolFace, fogToolFace, lightingToolFace, measureToolFace, moveToolFace, textToolFace, type Tool, type ToolFace } from "./toolFaces"
import { buttonItem, toolGroupItem, type ToolbarItemBody } from "./toolbarItems"
import type { ToolbarContext } from "./toolbarContext"

/** A tool without family members: pinned while in use. */
function toolButtonItem(ctx: ToolbarContext, tool: Tool, icon: ToolFace["icon"], label: string, shortcut: string): ToolbarItemBody {
  const inUse = ctx.activeTool === tool
  return buttonItem({ icon, label, shortcut, isActive: inUse, pinned: inUse, onClick: () => ctx.selectTool(tool) })
}

/** How each control of the catalog (`toolbar/toolbarCatalog.ts`) renders in the bar and in "More tools". */
export const TOOLBAR_CONTROL_ITEMS = {
  move: ctx => toolGroupItem(ctx, 'move', moveToolFace(ctx.activeTool), <MoveToolGroup {...ctx.groupControls('move')} />),
  fog: ctx => toolGroupItem(ctx, 'fog', fogToolFace(ctx.activeTool), <FogToolGroup {...ctx.groupControls('fog')} />),
  draw: ctx => toolGroupItem(ctx, 'draw', drawToolFace(ctx.activeTool), <DrawToolGroup {...ctx.groupControls('draw')} />),
  text: ctx => toolGroupItem(ctx, 'text', textToolFace(ctx.activeTool), <TextToolGroup {...ctx.groupControls('text')} />),
  measure: ctx => toolGroupItem(ctx, 'measure', measureToolFace(ctx.activeTool), <MeasureToolGroup {...ctx.groupControls('measure')} />),
  wall: ctx => toolGroupItem(ctx, 'wall', lightingToolFace(ctx.activeTool), <LightingToolGroup {...ctx.groupControls('wall')} />),
  pin: ctx => toolButtonItem(ctx, "note-pin", MapPin, "Note Pin Tool", ctx.hotkeyLabel('pin')),
  audio: ctx => toolButtonItem(ctx, "audio", Volume2, "Ambient Sound", ctx.hotkeyLabel('audio')),
  dice: ({ dice, hotkeyLabel }) => ({
    kind: 'button',
    // The dice tray hangs from this button.
    pinned: dice.open,
    active: dice.open,
    element: (
      <div ref={dice.buttonRef} className="relative flex items-center">
        <ToolButton icon={Dices} label="Roll Dice" shortcut={hotkeyLabel('diceTray')} isActive={dice.open} onClick={dice.toggle} />
        {dice.tool && (
          <DiceDropdownMenu diceTool={dice.tool} isOpen={dice.open} onToggle={dice.toggle} triggerRef={dice.buttonRef} />
        )}
      </div>
    ),
    menuEntry: { icon: Dices, label: "Roll Dice", shortcut: hotkeyLabel('diceTray'), isActive: dice.open, onSelect: dice.toggle },
  }),
  // Windows that float on their own do not pin.
  loot: ({ loot, hotkeyLabel }) => buttonItem({
    icon: CoinIcon, label: "Loot Roller", shortcut: hotkeyLabel('lootRoller'),
    isActive: loot.open, pinned: false, onClick: () => loot.setOpen(!loot.open),
  }),
  assets: ({ assets, hotkeyLabel }) => buttonItem({
    icon: ImageIcon, label: "Asset Manager", shortcut: hotkeyLabel('assets'),
    isActive: assets.open, pinned: false, onClick: assets.toggle,
  }),
  // The way into the toolbar editor: always pinned, so it never moves into "More tools".
  palette: ({ palette, hotkeyLabel }) => buttonItem({
    icon: Command, label: "Command Palette", shortcut: hotkeyLabel('palette'),
    isActive: palette.open, pinned: true, onClick: () => palette.setOpen(!palette.open),
  }),
} satisfies Record<ToolbarControlId, (ctx: ToolbarContext) => ToolbarItemBody>
