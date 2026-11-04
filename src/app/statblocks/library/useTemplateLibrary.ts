import { useSyncExternalStore } from 'react';
import type { App } from 'obsidian';
import { TemplateLibrary, type TemplateLibrarySnapshot } from './TemplateLibrary';

const NO_SUBSCRIPTION = (): (() => void) => () => undefined;
const NO_SNAPSHOT = (): null => null;

/**
 * The app's statblock templates; re-renders whenever the library changes.
 * Without an app it follows nothing and returns null, so a caller that needs
 * no vault template never makes the library read the vault.
 */
export function useTemplateLibrary(app: App | null): TemplateLibrarySnapshot | null {
  const library = app ? TemplateLibrary.forApp(app) : null;
  return useSyncExternalStore(library?.subscribe ?? NO_SUBSCRIPTION, library?.getSnapshot ?? NO_SNAPSHOT);
}
