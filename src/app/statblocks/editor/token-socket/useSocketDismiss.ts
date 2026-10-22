import { useEffect } from 'react';
import type React from 'react';
import type { App } from 'obsidian';
import { handledByAnotherControl } from '../../../keyboard/tooltipEscape';

/**
 * Closes a panel that hangs from the card (`useSocketPlacement`) the way every such panel closes:
 * a press outside its anchor and the panel closes it; Escape inside either closes it and gives
 * focus back to the anchor (`close(true)`), unless a control in there used the key (a select's
 * open list); and it goes with its anchor when another tab hides the note.
 */
export function useSocketDismiss(
  app: App, open: boolean, anchor: HTMLElement | null, panel: React.RefObject<HTMLElement | null>, close: (refocus: boolean) => void,
): void {
  useEffect(() => {
    const doc = anchor?.doc;
    if (!open || !doc) return undefined;
    // Paths, not `instanceof`: a popout window's nodes are not this window's `Node`s.
    const within = (event: Event): boolean => event.composedPath().some((target) => target === anchor || target === panel.current);
    const onPointerDown = (event: PointerEvent): void => {
      if (!within(event)) close(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || !within(event) || handledByAnotherControl(event)) return;
      // Obsidian's own Escape would move focus on to the note's editor.
      event.preventDefault();
      event.stopPropagation();
      close(true);
    };
    // The panel hangs in the window's body: it goes with its anchor when another tab hides the note.
    const { workspace } = app;
    const onLayout = (): void => {
      if (!anchor.isShown()) close(false);
    };
    const refs = [workspace.on('active-leaf-change', onLayout), workspace.on('layout-change', onLayout)];
    doc.addEventListener('pointerdown', onPointerDown, true);
    doc.addEventListener('keydown', onKeyDown);
    return () => {
      for (const ref of refs) workspace.offref(ref);
      doc.removeEventListener('pointerdown', onPointerDown, true);
      doc.removeEventListener('keydown', onKeyDown);
    };
  }, [app, open, anchor, panel, close]);
}
