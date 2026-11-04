import React, { useCallback, useMemo } from 'react';
import { ContextMenuProvider, useOptionalContextMenu } from '../../../react/root/ContextMenuContext';
import { toMenuEntries, type SurfaceAction } from './surfaceActions';

export interface SurfaceMenuOptions {
  /** Where focus goes when the menu closes with nothing chosen that moved it (a menu opened from the keyboard). */
  returnFocus?: HTMLElement | null | undefined;
  onClose?: (() => void) | undefined;
}

export interface SurfaceMenu {
  /** Opens at a client point: where a right-click was. */
  openAt: (actions: readonly SurfaceAction[], point: { x: number; y: number }, options?: SurfaceMenuOptions) => void;
  /** Opens hanging from an element: a handle, the toolbar's More, the focused block for Shift+F10. */
  openFrom: (actions: readonly SurfaceAction[], element: Element, options?: SurfaceMenuOptions) => void;
  close: () => void;
}

/**
 * One context menu per surface root (spec §5.1): menus open in the
 * surface's own document (a popout's included), never through the global
 * provider the map uses, and carry the surface's id, so its key scope knows
 * focus in them is still its own.
 */
export function SurfaceMenuProvider({ ownerId, children }: { ownerId: string; children: React.ReactNode }): React.JSX.Element {
  return <ContextMenuProvider ownerId={ownerId} local>{children}</ContextMenuProvider>;
}

/** The surface's menu; null outside a `SurfaceMenuProvider` (a part rendered on its own), where nothing opens. */
export function useSurfaceMenu(): SurfaceMenu | null {
  const controller = useOptionalContextMenu();
  const openAt = useCallback((actions: readonly SurfaceAction[], point: { x: number; y: number }, options?: SurfaceMenuOptions): void => {
    controller?.open(toMenuEntries(actions), point, { returnFocus: options?.returnFocus ?? null, onClose: options?.onClose });
  }, [controller]);
  const openFrom = useCallback((actions: readonly SurfaceAction[], element: Element, options?: SurfaceMenuOptions): void => {
    const box = element.getBoundingClientRect();
    openAt(actions, { x: box.left, y: box.bottom }, options);
  }, [openAt]);
  return useMemo(() => (controller ? { openAt, openFrom, close: controller.close } : null), [controller, openAt, openFrom]);
}
