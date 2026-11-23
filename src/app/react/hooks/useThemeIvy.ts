import { useLayoutEffect } from 'react';
import type { App } from 'obsidian';
import { lendThemeIvy } from '../../services/themeIvy';

/**
 * Lends `element`, which wears the Atlas VTT theme's corner ivy (`atlas-theme-ivy-corners`), the theme's drawings when
 * it mounts and again when the theme changes, so they come and go with the theme.
 */
export function useThemeIvy(app: App | undefined, element: HTMLElement | null): void {
  useLayoutEffect(() => {
    if (!element) return;
    lendThemeIvy(element);
    const workspace = app?.workspace;
    if (!workspace) return;
    const ref = workspace.on('css-change', () => lendThemeIvy(element));
    return () => workspace.offref(ref);
  }, [element, app]);
}
