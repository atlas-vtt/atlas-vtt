import React, { useState, useCallback, useRef, useMemo, forwardRef } from "react"
import { useAtlasStore, useViewStoreHook } from "src/app/react/ViewStoreContext"
import { Command, Dices, Eye, EyeOff, ImageIcon, MapPin, Volume2 } from "lucide-react"

import { TooltipProvider } from "./primitives/tooltip"
import { useHotkeyLabels } from "../../keyboard/useMapHotkeys"
import { useMapClipboardHotkeys } from "../../clipboard/useMapClipboardHotkeys"
import { CommandPalette } from "../../react/components/CommandPalette"
import AssetManager from "./asset-manager/AssetManager"
import { ToolButton } from "./primitives/ToolButton"
import { CoinIcon } from "../../react/components/CoinIcon"
import { useAtlasUI } from "src/app/react/root/AtlasUIContext"
import { Toggle } from "./primitives/Toggle"
import { DiceDropdownMenu } from "../../react/components/dice/DiceDropdownMenu"
import { AMBIENT_AUDIO_ENABLED } from "../../featureFlags"
import { isAtlasToolAvailable } from "../../tools/toolAvailability"
import { useExperimentalFeature } from "../../react/hooks/useExperimentalFeature"
import { ResponsiveToolbar } from "./toolbar/ResponsiveToolbar"
import { MoveToolGroup } from "./toolbar/MoveToolGroup"
import { FogToolGroup } from "./toolbar/FogToolGroup"
import { DrawToolGroup } from "./toolbar/DrawToolGroup"
import { TextToolGroup } from "./toolbar/TextToolGroup"
import { MeasureToolGroup } from "./toolbar/MeasureToolGroup"
import { LightingToolGroup } from "./toolbar/LightingToolGroup"
import { useSecretRollEffective } from "src/app/react/hooks/useSecretRollEffective"
import { useToolbarHotkeys } from "./toolbar/useToolbarHotkeys"
import {
  drawToolFace, fogToolFace, measureToolFace, moveToolFace, textToolFace, lightingToolFace,
  type Tool, type ToolFace,
} from "./toolbar/toolFaces"
import type { ToolGroupControls } from "./toolbar/ToolGroup"
import type { ResponsiveToolbarItem } from "./toolbar/toolbarTypes"

/** Tool groups whose options menu is open; only one at a time. */
type ToolMenu = 'move' | 'fog' | 'draw' | 'text' | 'measure' | 'wall'

/**
 * Which controls a narrow toolbar keeps longest (higher stays longer). The
 * tools a GM reaches for during play outrank setup and reference tools, which
 * also have hotkeys.
 */
/** Said on the Roll Dice button while tray rolls are hidden from players. */
const SECRET_ROLL_STATUS = "Secret roll on"

const PRIORITY = {
  move: 100,
  measure: 90,
  fog: 85,
  assets: 80,
  dice: 75,
  pin: 70,
  draw: 65,
  palette: 55,
  text: 50,
  loot: 45,
  wall: 40,
  audio: 35,
} as const

interface MainToolbarProps {
  viewId?: string;
}

export const MainToolbar = forwardRef<HTMLDivElement, MainToolbarProps>(({ viewId }, ref) => {
  const activeTool = useAtlasStore(state => state.activeTool)
  const setActiveTool = useAtlasStore(state => state.setActiveTool)
  const store = useViewStoreHook()
  const { app, view } = useAtlasUI()
  const isGMView = useAtlasStore(state => state.isGMView)
  const setGMView = useAtlasStore(state => state.setGMView)
  const hotkeyLabel = useHotkeyLabels()
  const lightingOn = useExperimentalFeature('dynamicLighting')

  const isActualPlayerView = view?.getViewType?.() === 'atlas-vtt-player'

  const diceTool = useMemo(() => view?.serviceManager?.getToolController?.()?.getDiceTool?.() ?? null, [view]);
  const secretRollOn = useSecretRollEffective(diceTool, app ?? undefined);

  // Per-view UI visibility — driven by the store, not local state
  const isCommandPaletteOpen = useAtlasStore(s => s.isCommandPaletteOpen)
  const setCommandPaletteOpen = useAtlasStore(s => s.setCommandPaletteOpen)
  const isAssetManagerOpen = useAtlasStore(s => s.isAssetManagerOpen)
  const assetManagerInitialTab = useAtlasStore(s => s.assetManagerInitialTab)
  const isDiceTrayOpen = useAtlasStore(s => s.isDiceTrayOpen)
  const setDiceTrayOpen = useAtlasStore(s => s.setDiceTrayOpen)
  const lootRollerOpen = useAtlasStore(s => s.lootRoller.open)
  const setLootRollerOpen = useAtlasStore(s => s.setLootRollerOpen)

  const [openMenu, setOpenMenu] = useState<ToolMenu | null>(null)
  const closeMenus = useCallback((): void => setOpenMenu(null), [])

  const toolbarRef = useRef<HTMLDivElement>(null)
  const diceButtonRef = useRef<HTMLDivElement>(null)

  const handleToolClick = useCallback((tool: Tool) => {
    if (!isAtlasToolAvailable(tool)) {
      return
    }
    setActiveTool(tool)
    setOpenMenu(null)
  }, [setActiveTool])

  // Opening the asset manager keeps the active tool
  const handleAssetManagerClick = useCallback(() => {
    store.getState().openAssetManager()
    view?.serviceManager?.getNotePreviewUIManager?.()?.suspendPreviews();
    setOpenMenu(null)
  }, [view, store])

  const handleCloseAssetManager = useCallback(() => {
    store.getState().closeAssetManager()
    view?.serviceManager?.getNotePreviewUIManager?.()?.resumePreviews();
  }, [view, store])

  const handleAssetManagerToggle = useCallback(() => {
    if (store.getState().isAssetManagerOpen) {
      handleCloseAssetManager()
    } else {
      handleAssetManagerClick()
    }
  }, [handleCloseAssetManager, handleAssetManagerClick, store])

  const toggleGMView = useCallback(() => {
    setGMView(!isGMView)
  }, [isGMView, setGMView])

  const toggleDiceTray = useCallback(() => {
    setDiceTrayOpen(!isDiceTrayOpen)
    setOpenMenu(null)
  }, [isDiceTrayOpen, setDiceTrayOpen])

  useMapClipboardHotkeys(store, view, viewId);
  useToolbarHotkeys(viewId, isActualPlayerView, {
    selectTool: handleToolClick,
    toggleAssetManager: handleAssetManagerToggle,
    closeAssetManager: handleCloseAssetManager,
    toggleGMView,
    closeMenus,
  })

  const groupControls = (menu: ToolMenu): ToolGroupControls => ({
    activeTool,
    selectTool: handleToolClick,
    menuOpen: openMenu === menu,
    toggleMenu: () => setOpenMenu(current => current === menu ? null : menu),
    closeMenu: closeMenus,
  })

  /** A tool group: pinned while its tool is active or its options are open. */
  const toolGroupItem = (menu: ToolMenu, face: ToolFace, shortcut: string, element: React.ReactNode): ResponsiveToolbarItem => ({
    id: menu,
    priority: PRIORITY[menu],
    pinned: face.isActive || openMenu === menu,
    element,
    menuEntry: { icon: face.icon, label: face.label, shortcut, isActive: face.isActive, onSelect: () => handleToolClick(face.tool) },
  })

  /**
   * A plain button for a tool or a panel. Tools pin while active; panels that
   * float on their own (loot roller, asset manager, palette) never pin.
   */
  const buttonItem = (
    id: keyof typeof PRIORITY,
    button: { icon: ToolFace["icon"]; label: string; shortcut: string; isActive: boolean; onClick: () => void },
    pinned: boolean,
  ): ResponsiveToolbarItem => ({
    id,
    priority: PRIORITY[id],
    pinned,
    element: <ToolButton {...button} />,
    menuEntry: { icon: button.icon, label: button.label, shortcut: button.shortcut, isActive: button.isActive, onSelect: button.onClick },
  })

  const toolButtonItem = (id: 'pin' | 'audio', tool: Tool, icon: ToolFace["icon"], label: string, shortcut: string): ResponsiveToolbarItem =>
    buttonItem(id, { icon, label, shortcut, isActive: activeTool === tool, onClick: () => handleToolClick(tool) }, activeTool === tool)

  const dm = !isActualPlayerView

  const items: ResponsiveToolbarItem[] = [
    toolGroupItem('move', moveToolFace(activeTool), hotkeyLabel('move'), <MoveToolGroup {...groupControls('move')} />),
    ...(dm ? [toolGroupItem('fog', fogToolFace(activeTool), hotkeyLabel('fog'), <FogToolGroup {...groupControls('fog')} />)] : []),
    ...(dm ? [toolGroupItem('draw', drawToolFace(activeTool), hotkeyLabel('draw'), <DrawToolGroup {...groupControls('draw')} />)] : []),
    ...(dm && isAtlasToolAvailable('text')
      ? [toolGroupItem('text', textToolFace(activeTool), hotkeyLabel('text'), <TextToolGroup {...groupControls('text')} />)]
      : []),
    toolGroupItem('measure', measureToolFace(activeTool), hotkeyLabel('measure'), <MeasureToolGroup {...groupControls('measure')} />),
    ...(dm && lightingOn
      ? [toolGroupItem('wall', lightingToolFace(activeTool), hotkeyLabel('wall'), <LightingToolGroup {...groupControls('wall')} />)]
      : []),
    ...(dm ? [toolButtonItem('pin', "note-pin", MapPin, "Note Pin Tool", hotkeyLabel('pin'))] : []),
    ...(dm && AMBIENT_AUDIO_ENABLED
      ? [toolButtonItem('audio', "audio", Volume2, "Ambient Sound", hotkeyLabel('audio'))]
      : []),
    {
      id: 'dice',
      priority: PRIORITY.dice,
      // The dice tray hangs from this button.
      pinned: isDiceTrayOpen,
      element: (
        <div ref={diceButtonRef} className="relative flex items-center">
          <ToolButton
            icon={Dices}
            label="Roll Dice"
            shortcut={hotkeyLabel('diceTray')}
            isActive={isDiceTrayOpen}
            onClick={toggleDiceTray}
            {...(secretRollOn && { status: SECRET_ROLL_STATUS })}
          />
          {diceTool && (
            <DiceDropdownMenu diceTool={diceTool} isOpen={isDiceTrayOpen} onToggle={toggleDiceTray} triggerRef={diceButtonRef} />
          )}
        </div>
      ),
      menuEntry: { icon: Dices, label: secretRollOn ? "Roll Dice (secret)" : "Roll Dice", shortcut: hotkeyLabel('diceTray'), isActive: isDiceTrayOpen, onSelect: toggleDiceTray },
    },
    ...(dm ? [
      buttonItem('loot', { icon: CoinIcon, label: "Loot Roller", shortcut: hotkeyLabel('lootRoller'), isActive: lootRollerOpen, onClick: () => setLootRollerOpen(!lootRollerOpen) }, false),
      buttonItem('assets', { icon: ImageIcon, label: "Asset Manager", shortcut: hotkeyLabel('assets'), isActive: isAssetManagerOpen, onClick: handleAssetManagerClick }, false),
      buttonItem('palette', { icon: Command, label: "Command Palette", shortcut: hotkeyLabel('palette'), isActive: isCommandPaletteOpen, onClick: () => setCommandPaletteOpen(!isCommandPaletteOpen) }, false),
    ] : []),
  ]

  return (
    <TooltipProvider delayDuration={300}>
      <ResponsiveToolbar
        ref={ref || toolbarRef}
        items={items}
        // The GM view switch keeps the bar's last place, after "More tools".
        end={dm && (
          <Toggle
            value={isGMView}
            onChange={toggleGMView}
            iconOn={Eye}
            iconOff={EyeOff}
            tooltipOn={`GM View (${hotkeyLabel('gmView')})`}
            tooltipOff={`Session View (${hotkeyLabel('gmView')})`}
          />
        )}
      />
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        toolbarRef={toolbarRef}
      />
      <AssetManager
        isOpen={isAssetManagerOpen}
        onClose={handleCloseAssetManager}
        {...(assetManagerInitialTab && { initialTab: assetManagerInitialTab })}
      />
      {isDiceTrayOpen && !diceTool && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'var(--background-primary)',
          padding: 'var(--atlas-spacing-xl)',
          border: '1px solid var(--background-modifier-border)',
          borderRadius: 'var(--atlas-radius-l)',
          zIndex: 1000
        }}>
          <p>Dice tool not initialized. Please try reloading the view.</p>
          <button onClick={() => setDiceTrayOpen(false)}>Close</button>
        </div>
      )}
    </TooltipProvider>
  );
});

MainToolbar.displayName = 'MainToolbar';
