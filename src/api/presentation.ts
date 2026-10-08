import { presentedScene, type PresentedSceneInfo as InternalScene } from '../app/services/PresentedScene';
import { presentTabToPlayers, stopPresenting } from '../app/services/presentToPlayers';
import { addPresentationTarget, presentationTargetSlot, type PresentationTargetEntry } from '../app/services/presentationTargets';
import type { DisposerSet } from './disposers';
import { isRemoteView } from './viewInfo';
import type { ViewTracker } from './viewTracker';
import type { Disposer, ViewId } from './types/common';
import type { PresentationApi, PresentationListener, PresentationTarget, PresentedSceneInfo } from './types/presentation';

function info(scene: InternalScene, held: boolean): PresentedSceneInfo {
  const tab = scene.view.tabMetaStore.getState().tabs.find((entry) => entry.id === scene.tabId);
  return Object.freeze({ presentationId: scene.presentationId, viewId: scene.view.viewId, tabId: scene.tabId, mapPath: tab?.filePath ?? '', held });
}

/** `withTabs`: a target's `tabBadge` (`scene-tabs`) is read. */
export function presentationApi(tracker: ViewTracker, disposers: DisposerSet, owner: string, withTabs = false): PresentationApi {
  /** Atlas's entry for each target object added, so adding the same object again changes nothing. */
  const kept = new WeakMap<object, PresentationTargetEntry>();
  return Object.freeze({
    current: (): PresentedSceneInfo | null => {
      const scene = presentedScene.current();
      return scene ? info(scene, presentedScene.isHeld()) : null;
    },
    present: async (viewId: ViewId, tabId?: string): Promise<boolean> => {
      const view = tracker.view(viewId);
      const target = tabId ?? view?.tabMetaStore.getState().activeTabId ?? null;
      // A remote view shows a scene fed from outside, never one of this vault's maps.
      if (!view || !target || isRemoteView(view)) return false;
      try {
        await presentTabToPlayers(view, target);
      } catch (error) {
        console.error('[Atlas API] Presenting a scene failed:', error);
        return false;
      }
      const scene = presentedScene.current();
      // A held scene is not on screen: its map did not load, or the GM moved on meanwhile.
      return Boolean(scene && scene.view === view && scene.tabId === target && !presentedScene.isHeld());
    },
    stop: (): void => stopPresenting(),
    // The presented scene's own listeners run guarded (`PresentedScene.emit`).
    subscribe: (listener: PresentationListener): Disposer => {
      if (typeof listener !== 'object' || listener === null) {
        console.error('[Atlas API] presentation.subscribe: the listener must be an object of callbacks; nothing was registered.');
        return () => undefined;
      }
      return disposers.add(presentedScene.subscribe({
        presented: (scene, resumed) => listener.presented?.(info(scene, false), resumed),
        held: (scene) => listener.held?.(info(scene, true)),
        cleared: (previous, wasHeld) => listener.cleared?.(info(previous, wasHeld)),
      }));
    },
    addTarget: (target: PresentationTarget): Disposer => {
      const known = target && typeof target === 'object' ? kept.get(target) : undefined;
      if (known) return disposers.add(addPresentationTarget(known, owner));
      // Each field read once into Atlas's own entry, so the tab bar never reads the extension's object (a throwing getter).
      const { id, label, isActive, tabBadge } = (target ?? {}) as Partial<PresentationTarget>;
      if (typeof id !== 'string' || id === '' || typeof label !== 'string' || typeof isActive !== 'function') {
        throw new Error('[Atlas API] presentation.addTarget: the target must be { id: non-empty string, label: string, isActive(): boolean }.');
      }
      if (withTabs && tabBadge !== undefined && typeof tabBadge !== 'function') {
        throw new Error('[Atlas API] presentation.addTarget: "tabBadge" must be a function when given.');
      }
      if (presentationTargetSlot.list().some((entry) => entry.owner === owner && entry.item.id === id)) {
        throw new Error(`[Atlas API] presentation.addTarget: "${id}" is already added by this extension.`);
      }
      const badge = withTabs && tabBadge ? { tabBadge: (tab: { viewId: ViewId; tabId: string }): string | null => tabBadge.call(target, tab) } : {};
      const entry: PresentationTargetEntry = Object.freeze({ id, label, isActive: (): boolean => isActive.call(target), ...badge });
      kept.set(target, entry);
      return disposers.add(addPresentationTarget(entry, owner));
    },
  });
}
