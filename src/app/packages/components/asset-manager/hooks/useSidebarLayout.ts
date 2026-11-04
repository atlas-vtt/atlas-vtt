import type * as React from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSidebarHover } from './useSidebarHover';
import { t } from '../../../../i18n';

/** Below this window width the sidebar floats over the content instead of taking a column. */
const DOCK_MIN_WIDTH = 1000;

/** Why the floating sidebar is shown: the pointer near the edge (`hover`) or opened on purpose (`pinned`). */
type Peek = 'closed' | 'hover' | 'pinned';

export interface SidebarLayout {
  /** Floating over the content (hidden until peeked) rather than docked in its own column. */
  isFloating: boolean;
  /** Whether the floating sidebar is shown. Always false while docked. */
  isPeeking: boolean;
  /** The pointer rests near the window's left edge while the floating sidebar is hidden. */
  isNearEdge: boolean;
  toggleLabel: string;
  toggle: () => void;
  panelRef: React.RefObject<HTMLElement | null>;
}

function useIsNarrow(containerRef: React.RefObject<HTMLElement | null>, isOpen: boolean): boolean {
  const [isNarrow, setIsNarrow] = useState(false);
  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!isOpen || !element) return;
    const update = (): void => {
      // A hidden window (a sub-dialog is open) measures 0; keep the last layout.
      if (element.offsetWidth > 0) setIsNarrow(element.offsetWidth < DOCK_MIN_WIDTH);
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [containerRef, isOpen]);
  return isNarrow;
}

/**
 * Whether the asset manager's sidebar is docked or floats, and when the floating
 * one shows. It floats when the user hid it or the window is too narrow to dock it.
 * Hovering the window's left edge peeks it (see `useSidebarHover`). The toggle
 * button docks and undocks it on wide windows and pins it open on narrow ones.
 * Escape or a click elsewhere closes a floating sidebar.
 */
export function useSidebarLayout(containerRef: React.RefObject<HTMLElement | null>, isOpen: boolean): SidebarLayout {
  const [isHidden, setIsHidden] = useState(false);
  const [peek, setPeek] = useState<Peek>('closed');
  const isNarrow = useIsNarrow(containerRef, isOpen);
  const isFloating = isHidden || isNarrow;
  const isPeeking = isFloating && peek !== 'closed';
  const panelRef = useRef<HTMLElement | null>(null);

  const close = useCallback((): void => setPeek('closed'), []);
  const openHover = useCallback((): void => setPeek((current) => (current === 'closed' ? 'hover' : current)), []);
  const closeHover = useCallback((): void => setPeek((current) => (current === 'hover' ? 'closed' : current)), []);

  const isNearEdge = useSidebarHover({
    enabled: isOpen && isFloating,
    isHoverPeek: peek === 'hover',
    isShown: isPeeking,
    containerRef,
    panelRef,
    open: openHover,
    close: closeHover,
  });

  // Docking, or the manager closing, drops any peek.
  useEffect(() => {
    if (!isFloating || !isOpen) close();
  }, [isFloating, isOpen, close]);

  // Captured, so Escape closes the sidebar before it could close the whole asset manager.
  useEffect(() => {
    if (!isPeeking) return;
    const doc = panelRef.current?.ownerDocument ?? document;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Element | null;
      if (!target || panelRef.current?.contains(target)) return;
      // The toggle button handles its own clicks.
      if (target.closest('.atlas-sidebar-toggle-btn')) return;
      close();
    };
    doc.addEventListener('keydown', onKeyDown, true);
    doc.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      doc.removeEventListener('keydown', onKeyDown, true);
      doc.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [isPeeking, close]);

  const toggle = useCallback((): void => {
    if (isNarrow) {
      setPeek((current) => (current === 'closed' ? 'pinned' : 'closed'));
      return;
    }
    setPeek('closed');
    setIsHidden((hidden) => !hidden);
  }, [isNarrow]);

  const isShown = isNarrow ? isPeeking : !isHidden;
  const toggleLabel = isShown ? t('am.hideSidebar') : t('am.showSidebar');

  return { isFloating, isPeeking, isNearEdge, toggleLabel, toggle, panelRef };
}
