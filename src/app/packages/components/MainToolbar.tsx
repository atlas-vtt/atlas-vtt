import React, { useState, useCallback, useEffect, useRef, useMemo, forwardRef } from "react"
import { useAtlasStore, useViewStoreHook } from "src/app/react/ViewStoreContext"
import { AnimatePresence, MotionConfig } from "framer-motion"
import { useStore } from "zustand"
import { Eye, EyeOff } from "lucide-react"

import { TooltipProvider } from "./primitives/tooltip"
import { useHotkeyLabels } from "../../keyboard/useMapHotkeys"
import { useMapClipboardHotkeys } from "../../clipboard/useMapClipboardHotkeys"
import { CommandPalette } from "../../react/components/CommandPalette"
import AssetManager from "./asset-manager/AssetManager"
import { useAtlasUI } from "src/app/react/root/AtlasUIContext"
import { Toggle } from "./primitives/Toggle"
import { isAtlasToolAvailable } from "../../tools/toolAvailability"
import { useExperimentalFeature } from "../../react/hooks/useExperimentalFeature"
import type { ExperimentalFeatureId } from "../../experimental/experimentalFeatures"
import { availableToolbarControls, DEFAULT_TOOLBAR_ORDER } from "../../toolbar/toolbarCatalog"
import { ResponsiveToolbar } from "./toolbar/ResponsiveToolbar"
import { useToolbarHotkeys } from "./toolbar/useToolbarHotkeys"
import { useToolbarLayout } from "./toolbar/useToolbarLayout"
import { TOOLBAR_CONTROL_ITEMS } from "./toolbar/toolbarControls"
import { ToolbarEditContext } from "./toolbar/editor/toolbarEditContext"
import { ToolbarEditor } from "./toolbar/editor/ToolbarEditor"
import { ToolbarLiveRegion } from "./toolbar/editor/ToolbarLiveRegion"
import { createToolbarEditStore, ToolbarEditStoreContext } from "./toolbar/editor/toolbarEditStore"
import { useToolbarEditor } from "./toolbar/editor/useToolbarEditor"
import type { Tool } from "./toolbar/toolFaces"
import type { ToolbarContext, ToolMenu } from "./toolbar/toolbarContext"
import type { ResponsiveToolbarItem } from "./toolbar/toolbarTypes"

interface MainToolbarProps {
  viewId?: string;
}

export const MainToolbar = forwardRef<HTMLDivElement, MainToolbarProps>(({ viewId }, ref) => {
  const activeTool = useAtlasStore(state => state.activeTool)
  const setActiveTool = useAtlasStore(state => state.setActiveTool)
  const store = useViewStoreHook()
  const { view } = useAtlasUI()
  const isGMView = useAtlasStore(state => state.isGMView)
  const setGMView = useAtlasStore(state => state.setGMView)
  const hotkeyLabel = useHotkeyLabels()
  const experimentalOn: Record<ExperimentalFeatureId, boolean> = {
    dynamicLighting: useExperimentalFeature('dynamicLighting'),
  }
  const liveLayout = useToolbarLayout()
  // During a drag the bar keeps the layout it began with; changes made elsewhere wait for the drop.
  const [editStore] = useState(createToolbarEditStore)
  const frozenLayout = useStore(editStore.state, s => s.frozenLayout)
  const layoutAccess = frozenLayout ? { ...liveLayout, layout: frozenLayout } : liveLayout
  const { layout } = layoutAccess

  const isActualPlayerView = view?.getViewType?.() === 'atlas-vtt-player'

  const diceTool = useMemo(() => view?.serviceManager?.getToolController?.()?.getDiceTool?.() ?? null, [view]);

  // Per-view UI visibility — driven by the store, not local state
  const isCommandPaletteOpen = useAtlasStore(s => s.isCommandPaletteOpen)
  const setCommandPaletteOpen = useAtlasStore(s => s.setCommandPaletteOpen)
  const isAssetManagerOpen = useAtlasStore(s => s.isAssetManagerOpen)
  const assetManagerInitialTab = useAtlasStore(s => s.assetManagerInitialTab)
  const isDiceTrayOpen = useAtlasStore(s => s.isDiceTrayOpen)
  const setDiceTrayOpen = useAtlasStore(s => s.setDiceTrayOpen)
  const lootRollerOpen = useAtlasStore(s => s.lootRoller.open)
  const setLootRollerOpen = useAtlasStore(s => s.setLootRollerOpen)
  const isToolbarEditing = useAtlasStore(s => s.isToolbarEditing)

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

  const dm = !isActualPlayerView
  const editing = dm && isToolbarEditing
  // Whether the palette action that started edit mode was chosen with the keyboard.
  const [editingByKeyboard, setEditingByKeyboard] = useState(false)

  const startEditing = useCallback((byKeyboard: boolean): void => {
    setEditingByKeyboard(byKeyboard)
    store.getState().setToolbarEditing(true)
  }, [store])
  const stopEditing = useCallback((): void => store.getState().setToolbarEditing(false), [store])

  // Tool menus hang where the editor's tray goes.
  useEffect(() => {
    if (editing) closeMenus()
  }, [editing, closeMenus])

  const ctx: ToolbarContext = {
    activeTool,
    selectTool: handleToolClick,
    hotkeyLabel,
    openMenu,
    groupControls: (menu) => ({
      activeTool,
      selectTool: handleToolClick,
      menuOpen: openMenu === menu,
      toggleMenu: () => setOpenMenu(current => current === menu ? null : menu),
      closeMenu: closeMenus,
    }),
    dice: { open: isDiceTrayOpen, toggle: toggleDiceTray, tool: diceTool, buttonRef: diceButtonRef },
    loot: { open: lootRollerOpen, setOpen: setLootRollerOpen },
    assets: { open: isAssetManagerOpen, toggle: handleAssetManagerToggle },
    palette: { open: isCommandPaletteOpen, setOpen: setCommandPaletteOpen },
  }

  // The player view's bar ignores the GM's layout.
  const available = availableToolbarControls(!dm, (feature) => experimentalOn[feature])
  const order = (dm ? layout.order : DEFAULT_TOOLBAR_ORDER).filter((id) => available.has(id))
  const items: ResponsiveToolbarItem[] = order.map((id) => ({ id, ...TOOLBAR_CONTROL_ITEMS[id](ctx) }))
  const editor = useToolbarEditor({ access: layoutAccess, store: editStore, items, available, hotkeyLabel, editing, stop: stopEditing })
  const hiddenIds: ReadonlySet<string> = layout.hidden

  return (
    <TooltipProvider delayDuration={300}>
      <ToolbarEditContext.Provider value={editing ? editor.api : null}>
        <ToolbarEditStoreContext.Provider value={editStore}>
          <MotionConfig reducedMotion="user">
            <ResponsiveToolbar
              ref={ref || toolbarRef}
              items={items}
              editing={editing}
              {...(dm && { hiddenIds, motion: editor.motion })}
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
            <AnimatePresence>
              {editing && (
                <ToolbarEditor
                  key="toolbar-editor"
                  items={items}
                  motion={editor.motion}
                  viewId={viewId}
                  focusOnEntry={editingByKeyboard}
                />
              )}
            </AnimatePresence>
          </MotionConfig>
        </ToolbarEditStoreContext.Provider>
      </ToolbarEditContext.Provider>
      {/* Always mounted, so the message that edit mode ended is still read once the tray is gone. */}
      {dm && <ToolbarLiveRegion announcement={editor.announcement} />}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        toolbarRef={toolbarRef}
        {...(dm && { onCustomizeToolbar: startEditing })}
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
