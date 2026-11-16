import { useEffect, type RefObject } from 'react';
import { Scope, type App } from 'obsidian';
import { tabs, type Tab } from '../types';
import { useStableCallback } from '../../../../react/hooks/useStableCallback';

const SEARCH_INPUT = '.atlas-asset-manager-search input';

/**
 * The asset manager's Cmd/Ctrl shortcuts (Ctrl off macOS): F focuses the search, 1 to 5 switch
 * to the tabs in their order, N opens the Create menu. Obsidian binds all of them (Search current
 * file, Go to tab #n, New note) and handles them before any listener of ours, so they sit in a key
 * scope, which Obsidian asks first; it is pushed only while the manager is open with no dialog of
 * its own over it. Their controls show them in their tooltips (`modShortcut`).
 */
export function useAssetManagerShortcuts(
  app: App,
  active: boolean,
  container: RefObject<HTMLElement | null>,
  changeTab: (tab: Tab) => void,
  openCreateMenu: () => void,
): void {
  const onTab = useStableCallback(changeTab);
  const onCreate = useStableCallback(openCreateMenu);

  useEffect(() => {
    if (!active) return undefined;
    const scope = new Scope(app.scope);
    scope.register(['Mod'], 'f', () => {
      const input = container.current?.querySelector<HTMLInputElement>(SEARCH_INPUT);
      input?.focus();
      input?.select();
      return false;
    });
    tabs.forEach((tab, index) => {
      scope.register(['Mod'], String(index + 1), () => {
        onTab(tab);
        return false;
      });
    });
    scope.register(['Mod'], 'n', () => {
      onCreate();
      return false;
    });
    app.keymap.pushScope(scope);
    return () => app.keymap.popScope(scope);
  }, [app, active, container, onTab, onCreate]);
}
