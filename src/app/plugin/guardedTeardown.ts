import type { Component } from 'obsidian';

/**
 * Obsidian unloads a plugin in one loop without a catch: its children, then every cleanup it
 * registered, newest first. One that throws skips all the rest, the removal of the plugin's
 * stylesheet and its view, extension and code block registrations among them, so the next load
 * fails on `registerExtensions` and never loads the new styles. A guarded cleanup logs its
 * failure and lets the others run.
 */
export function guardedCleanup(cleanup: () => unknown): () => void {
  return () => {
    try {
      cleanup();
    } catch (error) {
      console.error('[Atlas] A cleanup failed while unloading:', error);
    }
  };
}

/** Lets a child of the plugin fail to unload without stopping the plugin's own cleanups. */
export function guardChildUnload(child: Component): void {
  // ponytail: Obsidian offers no hook around a child's unload, so the instance's method is wrapped.
  child.unload = guardedCleanup(child.unload.bind(child));
}
