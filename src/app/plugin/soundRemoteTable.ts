import type { App } from 'obsidian';
import type { AtlasView } from '../atlas-view';
import { defeatedOnMap } from '../initiative/defeatedOnMap';
import { rollInitiative } from '../initiative/rollInitiative';
import { handoutShown, takeBackHandout } from '../packages/components/player-window-bar/playerHandout';
import { mapInitiativeRules } from '../services/mapInitiativeRules';
import { presentTab } from '../services/PlayerWindowPresenter';
import { ImageDisplayService } from '../services/ImageDisplayService';
import { PlayerWindowService } from '../services/PlayerWindowService';
import { presentedSceneOf } from '../services/presentedScene';
import type { HoveredElement } from '../soundRemote/hoveredElement';
import { remoteMapView } from '../soundRemote/remoteMapView';
import type { TableMap, TablePlayerWindow, TableSource } from '../soundRemote/remoteTable';
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

/** The fight on the GM's map, the local player window and the image under the pointer, for the sound remote's keys. */
export function remoteTableOf(app: App, hovered: HoveredElement): TableSource {
  return {
    map: () => {
      const view = remoteMapView(app.workspace);
      return view ? tableMap(app, view) : null;
    },
    player: playerWindow(hovered),
  };
}
