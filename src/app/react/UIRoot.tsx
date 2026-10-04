import React, { useMemo, useState, useEffect } from 'react';
import { LightPopoverHost } from '../pixi/lighting/LightPopover';
import { LightZonePopoverHost } from '../pixi/lighting/LightZonePopover';
import { SceneLightingPanelHost } from '../pixi/lighting/SceneLightingPanel';
import { App } from 'obsidian';
import { Application } from 'pixi.js';
import { BackgroundSprite } from './BackgroundSprite';
import { MainToolbar } from '../packages/components/MainToolbar';
import { GridSettingsModal } from './components/GridSettingsModalSimple';
import { GridAlignmentOverlay } from './components/GridAlignmentOverlay';
import { ResponsiveWidgetBar } from './components/ResponsiveWidgetBar';
import { useViewStoreHook, useAtlasStore } from './ViewStoreContext';
import { ViewActionsMenu } from './components/ViewActionsMenu';
import { UndoRedoControls } from './components/UndoRedoControls';
import { BottomToolbarRow } from './components/BottomToolbarRow';
import DMScreen from './components/DMScreen';
import { AddonMapOverlays, AddonToolbarBars, hasAddonToolbarBars } from '../addons/AddonToolbarBars';
import { addonBackground } from '../addons/addonHost';
import { InitiativeTracker } from './components/InitiativeTracker';
import { DiceRollLog } from './components/dice-log/DiceRollLog';
import { DiceRollDisplay } from './components/dice/DiceRollDisplay';
import { LootRoller } from './components/loot/LootRollerPanel';
import { MapLoadingOverlay } from './components/MapLoadingOverlay';
import { SceneTabBar } from './components/SceneTabBar';
import { SceneSwitcher } from './components/scene-switcher/SceneSwitcher';
import { presentTabInPlayerWindow } from '../services/PlayerWindowPresenter';
import { canRunMapHotkeys, matchesMapHotkey } from '../keyboard/mapHotkeys';
import { SettingsService } from '../services/SettingsService';
import { HotkeyHelp } from '../keyboard/HotkeyHelp';


// Import the new context and hook
import { AtlasUIContext, AtlasUIContextValue } from './root/AtlasUIContext';
import { ContextMenuProvider } from './root/ContextMenuContext';
import { PanelBoundary } from './root/PanelBoundary';
import { useMapNavigationHotkeys } from './useMapNavigationHotkeys';
import { useExperimentalFeature } from './hooks/useExperimentalFeature';
import type { AtlasView } from '../atlas-view';
import { runInBackground } from '../utils/backgroundTask';

interface UIRootProps {
  app: App;
  view: AtlasView;
  pixiApp: Application | null;
}

/**
 * Root component for the Atlas VTT UI
 * Provides a context with core objects to all child components
 */
export const UIRoot: React.FC<UIRootProps> = ({ app, view, pixiApp }) => {
  const settings = SettingsService.forApp(app);
  const lightingOn = useExperimentalFeature('dynamicLighting', settings);
  const [hotkeyHelpOpen, setHotkeyHelpOpen] = useState(false);
  const [isSceneSwitcherOpen, setSceneSwitcherOpen] = useState(false);

  // Get the store directly from context
  const store = useViewStoreHook();

  // Per-view UI visibility — driven by the store, not local state
  const isGridSettingsOpen = useAtlasStore(s => s.isGridSettingsOpen);
  const setGridSettingsOpen = useAtlasStore(s => s.setGridSettingsOpen);
  const isDMScreenOpen = useAtlasStore(s => s.isDMScreenOpen);
  const setDMScreenOpen = useAtlasStore(s => s.setDMScreenOpen);
  const isGridAlignmentOpen = useAtlasStore(s => s.isGridAlignmentOpen);
  const setGridAlignmentOpen = useAtlasStore(s => s.setGridAlignmentOpen);
  const isDiceLogOpen = useAtlasStore(s => s.isDiceLogOpen);
  const setDiceLogOpen = useAtlasStore(s => s.setDiceLogOpen);

  useMapNavigationHotkeys(view, store, settings);

  const switchTab = (tabId: string): void => {
    if (view) runInBackground(view.switchToTab(tabId), 'Switching scene tab');
  };
  const presentTab = (tabId: string): void => {
    if (view) void presentTabInPlayerWindow(app, view, tabId);
  };

  // Context value with all required objects
  const contextValue: AtlasUIContextValue = useMemo(
    () => ({
      app,
      view,
      pixiApp,
      renderer: view?.renderer ?? null,
    }),
    [app, view, pixiApp]
  );

  // Check if this is a player view - use store state which is authoritative
  const storeIsPlayerView = useAtlasStore(state => state.isPlayerView);
  const isPlayerView = storeIsPlayerView || view?.getViewType?.() === 'atlas-vtt-player';
  // Get loading state from store
  const isMapLoading = useAtlasStore(state => state.isMapLoading);
  const mapLoadingProgress = useAtlasStore(state => state.mapLoadingProgress);
  const mapLoadingMessage = useAtlasStore(state => state.mapLoadingMessage);
  
  // Get background directly from store (for streamed maps)
  const storeBackground = useAtlasStore(state => state.background);
  // An add-on (e.g. a map variant valid at the world date) may replace the background
  const addonBackgroundImage = useAtlasStore(addonBackground);
  const backgroundImage = addonBackgroundImage ?? storeBackground;
  const mapPath = useAtlasStore(state => state.mapPath);

  // Get initiative state and actions for keyboard shortcuts
  const initiativeTrackerOpen = useAtlasStore(state => state.initiativeTrackerOpen);
  const initiativeIsActive = useAtlasStore(state => state.initiative?.isActive);
  const nextTurn = useAtlasStore(state => state.nextTurn);
  const previousTurn = useAtlasStore(state => state.previousTurn);

  // Handle keyboard shortcuts for DM view
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!canRunMapHotkeys(e, view?.viewId)) return;
      if (matchesMapHotkey(e, 'help', settings)) {
        e.preventDefault(); setHotkeyHelpOpen(true); return;
      }

      // Enter: Toggle Dice Roll Log (both DM and player views)
      if (matchesMapHotkey(e, 'diceLog', settings)) {
        e.preventDefault();
        store.getState().setDiceLogOpen(!store.getState().isDiceLogOpen);
        return;
      }

      // Tab: Toggle DM screen (DM view only)
      if (!isPlayerView && matchesMapHotkey(e, 'dashboard', settings)) {
        e.preventDefault();
        store.getState().setDMScreenOpen(!store.getState().isDMScreenOpen);
        return;
      }

      // Arrow Up/Down: Navigate initiative order (DM view, tracker open, combat active)
      if (!isPlayerView && initiativeTrackerOpen && initiativeIsActive) {
        if (matchesMapHotkey(e, 'previousTurn', settings)) {
          e.preventDefault();
          previousTurn();
          window.dispatchEvent(new CustomEvent('atlas-initiative-hotkey', { detail: 'prev' }));
          return;
        }
        if (matchesMapHotkey(e, 'nextTurn', settings)) {
          e.preventDefault();
          nextTurn();
          window.dispatchEvent(new CustomEvent('atlas-initiative-hotkey', { detail: 'next' }));
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlayerView, initiativeTrackerOpen, initiativeIsActive, nextTurn, previousTurn, store, view, settings]);

  return (
    <AtlasUIContext.Provider value={contextValue}>
      <ContextMenuProvider>
        {hotkeyHelpOpen && (
          <PanelBoundary name="the hotkey help">
            <HotkeyHelp settings={settings} isPlayerView={isPlayerView} onClose={() => setHotkeyHelpOpen(false)} />
          </PanelBoundary>
        )}
        <div className="atlas-ui" style={{ position: 'relative', width: '100%', height: '100%' }}>
          {backgroundImage && <PanelBoundary name="the map image"><BackgroundSprite imagePath={backgroundImage} sceneKey={mapPath} /></PanelBoundary>}
          {!isPlayerView && !isMapLoading && <PanelBoundary name="add-on overlays"><AddonMapOverlays /></PanelBoundary>}

          {/* Map chrome stays mounted while a scene loads; the loading overlay blocks input meanwhile */}
          {/* Top row — scene tabs (DM only) and widget bar share one flex row */}
          <div className="atlas-top-bar-row">
            {!isPlayerView && (
              <PanelBoundary name="the scene tabs">
                <SceneTabBar
                  onSwitchTab={switchTab}
                  onCloseTab={(tabId) => { if (view) runInBackground(view.closeTab(tabId), 'Closing scene tab'); }}
                  onAddTab={() => view?.openSceneBrowser()}
                  onPresentTab={presentTab}
                  onShowAllTabs={() => setSceneSwitcherOpen(true)}
                />
              </PanelBoundary>
            )}
            {/* Widgets and the DM's dice rolls share the right end; rolls hang below the widgets */}
            <div className="atlas-top-bar-end">
              <PanelBoundary name="the widgets">
                <ResponsiveWidgetBar isPlayerView={isPlayerView} store={store} viewId={view?.viewId} />
              </PanelBoundary>
              {!isPlayerView && <PanelBoundary name="the dice rolls"><DiceRollDisplay /></PanelBoundary>}
            </div>
          </div>

          {/* Bottom row — undo/redo docked left of the main toolbar, view actions (DM only) at the right edge */}
          <BottomToolbarRow
            above={!isPlayerView && !isMapLoading && hasAddonToolbarBars() && <PanelBoundary name="add-on bars"><AddonToolbarBars /></PanelBoundary>}
            start={!isPlayerView && <PanelBoundary name="undo and redo"><UndoRedoControls viewId={view?.viewId} /></PanelBoundary>}
            end={!isPlayerView && <PanelBoundary name="the view actions"><ViewActionsMenu app={app} filePath={view?.file?.path} /></PanelBoundary>}
          >
            <PanelBoundary name="the toolbar"><MainToolbar viewId={view?.viewId} /></PanelBoundary>
          </BottomToolbarRow>

          {!isPlayerView && !isMapLoading && (
            <PanelBoundary name="the scene switcher">
              <SceneSwitcher isOpen={isSceneSwitcherOpen} onOpenChange={setSceneSwitcherOpen} onSwitchTab={switchTab} onPresentTab={presentTab} />
            </PanelBoundary>
          )}
          
          {/* Grid Settings Modal - only render when needed */}
          {isGridSettingsOpen && (
            <PanelBoundary name="the grid settings">
              <GridSettingsModal isOpen={isGridSettingsOpen} onClose={() => setGridSettingsOpen(false)} view={view} />
            </PanelBoundary>
          )}

          {/* Grid Alignment Overlay - only render when needed */}
          {isGridAlignmentOpen && (
            <PanelBoundary name="the grid alignment"><GridAlignmentOverlay onClose={() => setGridAlignmentOpen(false)} /></PanelBoundary>
          )}

          {/* DM screen - only for DM view */}
          {!isPlayerView && (
            <PanelBoundary name="the DM screen">
              <DMScreen
                isOpen={isDMScreenOpen}
                onClose={() => {
                  // Give CodeMirror time to clean up before closing
                  window.setTimeout(() => setDMScreenOpen(false), 0);
                }}
              />
            </PanelBoundary>
          )}

          {/* Dice Roll Log - left side panel */}
          <PanelBoundary name="the dice log"><DiceRollLog isOpen={isDiceLogOpen} onClose={() => setDiceLogOpen(false)} /></PanelBoundary>

          {/* Initiative Tracker - only for DM view */}
          {!isPlayerView && <PanelBoundary name="the initiative tracker"><InitiativeTracker /></PanelBoundary>}

          {/* Loot Roller - floating window, DM only */}
          {!isPlayerView && <PanelBoundary name="the loot roller"><LootRoller /></PanelBoundary>}
          {!isPlayerView && lightingOn && <PanelBoundary name="the light settings"><LightPopoverHost /><LightZonePopoverHost /></PanelBoundary>}
          {!isPlayerView && lightingOn && <PanelBoundary name="the scene lighting"><SceneLightingPanelHost /></PanelBoundary>}

          {/* Player Character Sheet - REMOVED: Players should only edit via their character sheet file */}
          
          {/* Loading overlay - renders last to be on top of everything */}
          <PanelBoundary name="the loading overlay">
            <MapLoadingOverlay
              isLoading={isMapLoading}
              {...(mapLoadingProgress !== undefined ? { progress: mapLoadingProgress } : {})}
              {...(mapLoadingMessage !== undefined ? { message: mapLoadingMessage } : {})}
            />
          </PanelBoundary>

        </div>
      </ContextMenuProvider>
    </AtlasUIContext.Provider>
  );
};
