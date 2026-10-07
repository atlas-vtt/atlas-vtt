/**
 * What a scene tab's eye button does. While a presentation target is active (an audience
 * besides the player window) it presents the tab to that audience only, and its context
 * menu opens the player window; without one it opens the player window. Extensions add
 * sections to the eye's menu (`ui.addSceneTabMenuSection`).
 */
import type { App } from 'obsidian';
import type { AtlasView } from '../atlas-view';
import type { SceneTabMenuContext } from '../../api/types/ui';
import { sceneTabMenuEntries } from '../extensions/menuEntries';
import { sceneTabMenuSlot } from '../extensions/slots';
import { presentTabInPlayerWindow } from '../services/PlayerWindowPresenter';
import { presentedScene, presentedTabIdIn } from '../services/PresentedScene';
import { activePresentationTarget, subscribePresentationTargets } from '../services/presentationTargets';
import { presentTabToPlayers } from '../services/presentToPlayers';
import { openContextMenuGlobal, type ContextMenuEntry } from './root/ContextMenuContext';
import { t } from '../i18n';

const anyTargetActive = (): boolean => activePresentationTarget() !== null;

export function presentTab(app: App, view: AtlasView, tabId: string): void {
  if (anyTargetActive()) void presentTabToPlayers(view, tabId);
  else void presentTabInPlayerWindow(app, view, tabId);
}

/** What a section is told about the tab, as it is now; null once the tab is closed. */
function menuContext(view: AtlasView, tabId: string): SceneTabMenuContext | null {
  const { tabs, activeTabId } = view.tabMetaStore.getState();
  const tab = tabs.find((entry) => entry.id === tabId);
  if (!tab) return null;
  return Object.freeze({
    viewId: view.viewId, tabId, mapPath: tab.filePath, name: tab.displayName,
    active: activeTabId === tabId, presented: presentedTabIdIn(presentedScene.current(), view.tabMetaStore) === tabId,
  });
}

/** The eye menu's rows now: Atlas's own while a target is active, then each extension section after a separator. */
function sceneTabMenu(app: App, view: AtlasView, tabId: string): ContextMenuEntry[] {
  const ctx = menuContext(view, tabId);
  if (!ctx) return [];
  const entries: ContextMenuEntry[] = anyTargetActive()
    ? [{ type: 'item', label: t('present.openPlayerWindow'), icon: 'monitor-up', onClick: () => { void presentTabInPlayerWindow(app, view, tabId).catch((error: unknown) => console.error('[Atlas] Opening the player window failed:', error)); } }]
    : [];
  const sections = sceneTabMenuEntries(ctx);
  // A section's separator sets it off from what is above it; at the top there is nothing to set it off from.
  return entries.length === 0 ? sections.slice(1) : [...entries, ...sections];
}

/** Everything the open menu's rows depend on: the sections (and `ui.invalidate()`), the targets, the view's tabs and the presented scene. */
function watchSceneTabMenu(view: AtlasView): (onChange: () => void) => () => void {
  return (onChange) => {
    const stops = [
      sceneTabMenuSlot.subscribe(onChange),
      subscribePresentationTargets(onChange),
      view.tabMetaStore.subscribe(onChange),
      presentedScene.subscribe({ presented: onChange, held: onChange, cleared: onChange }),
    ];
    return () => { for (const stop of stops) stop(); };
  };
}

/**
 * Opens the eye's context menu when it has something to show (Atlas's own entry while a target is active, or an
 * extension's section) and returns true; otherwise it does nothing and returns false. The open menu reads its rows
 * again whenever what they depend on changes, so checkmarks follow and it stays open while its tab becomes active.
 */
export function openSceneTabMenu(
  app: App,
  view: AtlasView,
  tabId: string,
  position: { x: number; y: number },
  returnFocus: HTMLElement | null = null,
): boolean {
  if (sceneTabMenu(app, view, tabId).length === 0) return false;
  openContextMenuGlobal(() => sceneTabMenu(app, view, tabId), position, { returnFocus, subscribe: watchSceneTabMenu(view) });
  return true;
}
