import React from "react"
import { Command, Dices, ImageIcon, Volume2 } from "lucide-react"
import { CoinIcon } from "../../../react/components/CoinIcon"
import { DiceDropdownMenu } from "../../../react/components/dice/DiceDropdownMenu"
import type { ToolbarControlId } from "../../../toolbar/toolbarCatalog"
import { ToolButton } from "../primitives/ToolButton"
import { LightingToolGroup } from "./LightingToolGroup"
import { MeasureToolGroup } from "./MeasureToolGroup"
import { MoveToolGroup } from "./MoveToolGroup"
import { PinToolGroup } from "./PinToolGroup"
import { drawToolFace, fogToolFace, lightingToolFace, measureToolFace, moveToolFace, pinToolFace, singleToolFace, type ToolFace } from "./toolFaces"
import { buttonItem, toolGroupItem, type ToolbarItemBody } from "./toolbarItems"
import type { ToolbarContext } from "./toolbarContext"
import { t } from "../../../i18n"

/** A tool without a menu: pinned while in use. */
function toolButtonItem(ctx: ToolbarContext, face: ToolFace, shortcut: string): ToolbarItemBody {
  return buttonItem({ icon: face.icon, label: face.label, shortcut, isActive: face.isActive, pinned: face.isActive, onClick: () => ctx.selectTool(face.tool) })
}

/** How each control of the catalog (`toolbar/toolbarCatalog.ts`) renders in the bar and in "More tools". */
export const TOOLBAR_CONTROL_ITEMS = {
  move: ctx => toolGroupItem(ctx, 'move', moveToolFace(ctx.activeTool), <MoveToolGroup {...ctx.groupControls('move')} />),
  // The fog tool has no menu: its bars above the toolbar hold all of it.
  fog: ctx => toolButtonItem(ctx, fogToolFace(ctx.activeTool), ctx.hotkeyLabel('fog')),
  // The Draw tool has no menu: its bars above the toolbar hold all of it.
  draw: ctx => toolButtonItem(ctx, drawToolFace(ctx.activeTool, ctx.drawMode), ctx.hotkeyLabel('draw')),
  measure: ctx => toolGroupItem(ctx, 'measure', measureToolFace(ctx.activeTool, ctx.measureMode), <MeasureToolGroup {...ctx.groupControls('measure')} />),
  wall: ctx => toolGroupItem(ctx, 'wall', lightingToolFace(ctx.activeTool), <LightingToolGroup {...ctx.groupControls('wall')} />),
  pin: ctx => toolGroupItem(ctx, 'pin', pinToolFace(ctx.activeTool), <PinToolGroup {...ctx.groupControls('pin')} />),
  audio: ctx => toolButtonItem(ctx, singleToolFace("audio", Volume2, t('toolbar.ambientSound'), ctx.activeTool), ctx.hotkeyLabel('audio')),
  dice: ({ dice, hotkeyLabel }) => ({
    kind: 'button',
    // The dice tray hangs from this button.
    pinned: dice.open,
    active: dice.open,
    element: (
      <div ref={dice.buttonRef} className="relative flex items-center">
        <ToolButton icon={Dices} label={t('toolbar.rollDice')} shortcut={hotkeyLabel('diceTray')} isActive={dice.open} onClick={dice.toggle} />
        {dice.tool && (
          <DiceDropdownMenu diceTool={dice.tool} isOpen={dice.open} onToggle={dice.toggle} triggerRef={dice.buttonRef} />
        )}
      </div>
    ),
    menuEntry: { icon: Dices, label: t('toolbar.rollDice'), shortcut: hotkeyLabel('diceTray'), isActive: dice.open, onSelect: dice.toggle },
  }),
  // Windows that float on their own do not pin.
  loot: ({ loot, hotkeyLabel }) => buttonItem({
    icon: CoinIcon, label: t('toolbar.lootRoller'), shortcut: hotkeyLabel('lootRoller'),
    isActive: loot.open, pinned: false, onClick: () => loot.setOpen(!loot.open),
  }),
  assets: ({ assets, hotkeyLabel }) => buttonItem({
    icon: ImageIcon, label: t('toolbar.assetManager'), shortcut: hotkeyLabel('assets'),
    isActive: assets.open, pinned: false, onClick: assets.toggle,
  }),
  // The way into the toolbar editor: always pinned, so it never moves into "More tools".
  palette: ({ palette, hotkeyLabel }) => buttonItem({
    icon: Command, label: t('toolbar.commandPalette'), shortcut: hotkeyLabel('palette'),
    isActive: palette.open, pinned: true, onClick: () => palette.setOpen(!palette.open),
  }),
} satisfies Record<ToolbarControlId, (ctx: ToolbarContext) => ToolbarItemBody>
