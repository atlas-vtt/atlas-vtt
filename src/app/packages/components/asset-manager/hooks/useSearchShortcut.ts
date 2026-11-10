import { useEffect, type RefObject } from 'react';
import { Scope, type App } from 'obsidian';

/**
 * Cmd+F (Ctrl+F off macOS) focuses the search while it is mounted. Obsidian
 * binds that key to "Search current file" and handles it before any listener
 * of ours, so the shortcut sits in a key scope, which Obsidian asks first.
 * `enabled` false registers nothing.
 */
export function useSearchShortcut(app: App, inputRef: RefObject<HTMLInputElement | null>, enabled = true): void {
  useEffect(() => {
    if (!enabled) return undefined;
    const scope = new Scope(app.scope);
    scope.register(['Mod'], 'f', () => {
      inputRef.current?.focus();
      inputRef.current?.select();
      return false;
    });
    app.keymap.pushScope(scope);
    return () => app.keymap.popScope(scope);
  }, [app, inputRef, enabled]);
}
