import { useLayoutEffect, useState } from 'react';
import type { App } from 'obsidian';
import { lendThemeIvy } from '../../services/themeIvy';

/**
 * A ref for an element that wears the Atlas VTT theme's corner ivy (`atlas-theme-ivy-corners`): the theme's drawings
 * are lent to it when it mounts and again when the theme changes, so they come and go with the theme.
 */
export function useThemeIvy(app: App | undefined): (element: HTMLElement | null) => void {
  const [element, setElement] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!element) return;
    lendThemeIvy(element);
    const workspace = app?.workspace;
    if (!workspace) return;
    const ref = workspace.on('css-change', () => lendThemeIvy(element));
    return () => workspace.offref(ref);
  }, [element, app]);
  return setElement;
}
