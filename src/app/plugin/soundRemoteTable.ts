import type { App } from 'obsidian';
import { t } from '../i18n';
import { showNotice } from '../ui/notice';
import type { AtlasView } from '../atlas-view';
import { defeatedOnMap } from '../initiative/defeatedOnMap';
import { rollInitiative } from '../initiative/rollInitiative';
import { handoutShown, takeBackHandout } from '../packages/components/player-window-bar/playerHandout';
import { collectionDiceShelf } from '../react/components/dice/useDiceShelf';
import { rollSavedRoll } from '../react/components/dice/rollSavedRoll';
import { AssetService } from '../services/AssetService';
import { mapInitiativeRules } from '../services/mapInitiativeRules';
import { SettingsService } from '../services/SettingsService';
import { presentTab } from '../services/PlayerWindowPresenter';
import { ImageDisplayService } from '../services/ImageDisplayService';
import { PlayerWindowService } from '../services/PlayerWindowService';
import { presentedSceneOf } from '../services/presentedScene';
import type { HoveredElement } from '../soundRemote/hoveredElement';
import { remoteMapView } from '../soundRemote/remoteMapView';
import type { TableMap, TablePlayerWindow, TableShareRolls, TableSource } from '../soundRemote/remoteTable';
import { playerWindowStore } from '../stores/playerWindowStore';
import type { InitiativeRules } from '../types/initiativeRulesTypes';

/** The map a remote acts on, with the tracker's and the scene tab's own functions bound to it. */
function tableMap(app: App, view: AtlasView): TableMap {
  const store = view.getStore();
  const rules = (): InitiativeRules => mapInitiativeRules(app, store.getState().mapPath);
  const activeTab = (): string | null => view.tabMetaStore.getState().activeTabId;
  return {
    state: () => store.getState(),
    rules,
    defeated: () => defeatedOnMap(app, store.getState()),
    roll: () => { void rollInitiative(app, store, rules()); },
    presented: () => activeTab() !== null && presentedSceneOf(app).get()?.tabId === activeTab(),
    present: (): void => {
      const tabId = activeTab();
      if (tabId) void presentTab(app, view, tabId, { openWindow: true });
    },
    savedRolls: () => {
      const { mapPath } = store.getState();
      return collectionDiceShelf(app, mapPath ? AssetService.getInstance(app).getCollectionForMap(mapPath) : null).presets;
    },
    // The view's own dice tool: the 3D dice, the player window, online players and the table log follow as from the tray
    rollSaved: (preset) => rollSavedRoll(view.serviceManager.getToolController().getDiceTool(), preset),
  };
}

/** "Show my rolls to players": the player view setting the dice tray's switch reads and writes (`useShareRolls`). */
function shareRolls(app: App): TableShareRolls {
  return {
    shown: () => SettingsService.forApp(app)?.getLocalPlayerViewSettings().showDiceRolls ?? false,
    setShown: (shown) => {
      SettingsService.forApp(app)?.setLocalPlayerViewSettings({ showDiceRolls: shown });
      // The key is pressed away from Obsidian, whose switch the GM may not see: say what changed
      showNotice(t(shown ? 'remote.rollsShown' : 'remote.rollsHidden'));
    },
  };
}

/** The player window as its bar reads it (`PlayerWindowBar`) and presses it, and the image menus' "Display on player view". */
function playerWindow(hovered: HoveredElement): TablePlayerWindow {
  return {
    isOpen: () => PlayerWindowService.getInstance()?.isWindowOpen() ?? false,
    isFrozen: () => playerWindowStore.getState().isFrozen,
    isTrueScale: () => PlayerWindowService.getInstance()?.isTrueScale() ?? false,
    isCurtained: () => PlayerWindowService.getInstance()?.isCurtained() ?? false,
    handoutShown,
    toggleFreeze: () => { PlayerWindowService.getInstance()?.toggleCameraFreeze(); },
    setCurtain: (down) => PlayerWindowService.getInstance()?.setCurtain(down),
    takeBackHandout,
    showHoveredImage: () => {
      const images = ImageDisplayService.getInstance();
      const element = hovered.element();
      if (!images || !element) return false;
      const file = images.imageFileAt(element);
      if (!file) return false;
      // Through the service, so an online table that stands in front of it shows its players too
      void images.displayImageOnPlayerView(file);
      return true;
    },
  };
}

/** The fight and saved rolls of the GM's map, the local player window, the image under the pointer and the share-rolls switch, for the sound remote's keys. */
export function remoteTableOf(app: App, hovered: HoveredElement): TableSource {
  return {
    map: () => {
      const view = remoteMapView(app.workspace);
      return view ? tableMap(app, view) : null;
    },
    player: playerWindow(hovered),
    shareRolls: shareRolls(app),
  };
}
