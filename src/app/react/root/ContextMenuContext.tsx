import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { renderEntries, type ContextMenuEntry } from '../components/context-menu/AtlasContextMenu';
import { useAtlasStore } from '../ViewStoreContext';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { t } from '../../i18n';
import { observeResize } from '../../utils/observeResize';

// Re-export the entry type so consumers only import from this file
export type { ContextMenuEntry } from '../components/context-menu/AtlasContextMenu';

// ── Context + hook ──────────────────────────────────────────────────────────

export interface ContextMenuOptions {
  /**
   * Where focus goes when the menu closes and nothing else took it (a menu
   * opened from the keyboard, closed with Escape): the menu's own trigger is
   * a point and cannot hold focus.
   */
  returnFocus?: HTMLElement | null;
  /** Called once the menu closes, however it closed. */
  onClose?: (() => void) | undefined;
}

export interface ContextMenuController {
  open: (entries: ContextMenuEntry[], position: { x: number; y: number }, options?: ContextMenuOptions) => void;
  close: () => void;
}

const ContextMenuCtx = createContext<ContextMenuController | null>(null);

export const useContextMenu = (): ContextMenuController => {
  const ctx = useContext(ContextMenuCtx);
  if (!ctx) throw new Error('useContextMenu must be used inside <ContextMenuProvider>');
  return ctx;
};

/** The nearest provider's controller, or null outside every provider (a part rendered on its own in a test). */
export const useOptionalContextMenu = (): ContextMenuController | null => useContext(ContextMenuCtx);

// ── Global helpers (non-React callers like PIXI renderers) ──────────────────

/**
 * Every mounted provider registers here. The newest one serves callers outside
 * React, so a provider that unmounts never disables the ones still on screen.
 */
interface RegisteredController extends ContextMenuController {
  /** The document the provider opens its menus in, once it is rendered. */
  doc: () => Document | null;
}

const controllers: RegisteredController[] = [];

export interface GlobalContextMenuOptions extends ContextMenuOptions {
  /** Opens the menu in this document (a popout's), served by the newest provider rendered there. */
  doc?: Document | undefined;
}

export function openContextMenuGlobal(
  entries: ContextMenuEntry[],
  position: { x: number; y: number },
  options?: GlobalContextMenuOptions,
): void {
  const inDoc = options?.doc === undefined ? controllers : controllers.filter((controller) => controller.doc() === options.doc);
  inDoc[inDoc.length - 1]?.open(entries, position, options);
}

export function closeContextMenuGlobal(): void {
  for (const controller of controllers) controller.close();
}

// ── Provider ────────────────────────────────────────────────────────────────

interface MenuState {
  entries: ContextMenuEntry[];
  position: { x: number; y: number };
  returnFocus: HTMLElement | null;
  collisionBoundary: Element | null;
}

/** The provider's own pane, only where the point lies in it: a menu opened over a body-level overlay belongs to no pane. */
function leafHolding(anchor: Element | null, point: { x: number; y: number }): Element | null {
  const leaf = anchor?.closest('.workspace-leaf');
  if (!leaf) return null;
  const rect = leaf.getBoundingClientRect();
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom ? leaf : null;
}

/** Focuses `element` where the menu left focus nowhere (on the body): a choice that moved focus keeps it there. */
function returnFocusTo(element: HTMLElement | null, event: Event): void {
  // The virtual trigger is only a point; restore keyboard focus explicitly without scrolling.
  event.preventDefault();
  if (!element) return;
  const active = element.ownerDocument.activeElement;
  if (element.isConnected && (!active || active === element.ownerDocument.body)) element.focus({ preventScroll: true });
}

interface ContextMenuProviderProps {
  children: React.ReactNode;
  /**
   * Marks the open menu's content with `data-atlas-owner`, so the surface
   * that opened it (a statblock panel) knows focus in it is still its own.
   */
  ownerId?: string | undefined;
  /** Serves only the components inside it, never `openContextMenuGlobal`: a surface whose menus belong to it alone. */
  local?: boolean | undefined;
}

export const ContextMenuProvider: React.FC<ContextMenuProviderProps> = ({ children, ownerId, local = false }) => {
  const [menuState, setMenuState] = useState<MenuState | null>(null);
  // The body of the document the provider renders in: a map in a popout opens its menus there.
  const [body, setBody] = useState<HTMLElement | null>(null);
  const anchorElement = useRef<HTMLSpanElement | null>(null);
  const anchor = useCallback((node: HTMLSpanElement | null): void => {
    anchorElement.current = node;
    setBody(node?.ownerDocument.body ?? null);
  }, []);
  const bodyRef = useRef<HTMLElement | null>(null);
  bodyRef.current = body;

  // The open menu's `onClose`, called once whether it closes or another menu takes its place.
  const closing = useRef<(() => void) | undefined>(undefined);
  const told = useCallback((): void => {
    const onClose = closing.current;
    closing.current = undefined;
    onClose?.();
  }, []);

  const close = useCallback((): void => {
    told();
    setMenuState(null);
  }, [told]);

  const open = useCallback((entries: ContextMenuEntry[], position: { x: number; y: number }, options?: ContextMenuOptions): void => {
    told();
    closing.current = options?.onClose;
    const doc = bodyRef.current?.ownerDocument;
    // Global callers may be served by a provider in another leaf: use the clicked view.
    const collisionBoundary = options?.returnFocus?.closest('.workspace-leaf')
      ?? doc?.elementFromPoint?.(position.x, position.y)?.closest('.workspace-leaf')
      ?? leafHolding(anchorElement.current, position);
    setMenuState({ entries, position, returnFocus: options?.returnFocus ?? null, collisionBoundary });
  }, [told]);

  useEffect(() => {
    if (local) return undefined;
    const controller: RegisteredController = { open, close, doc: () => bodyRef.current?.ownerDocument ?? null };
    controllers.push(controller);
    return () => {
      controllers.splice(controllers.indexOf(controller), 1);
    };
  }, [open, close, local]);

  useLayoutEffect(() => {
    const win = body?.ownerDocument.defaultView;
    if (!menuState || !win) return undefined;
    win.addEventListener('resize', close);
    const boundary = menuState.collisionBoundary;
    const initial = boundary?.getBoundingClientRect();
    const stopObserving = boundary && initial ? observeResize([boundary], () => {
      const { width, height } = boundary.getBoundingClientRect();
      // ResizeObserver also reports the initial size; opening alone must not dismiss the menu.
      if (width !== initial.width || height !== initial.height) close();
    }) : () => undefined;
    return () => {
      win.removeEventListener('resize', close);
      stopObserving();
    };
  }, [body, menuState, close]);

  const pos = menuState?.position ?? { x: 0, y: 0 };

  return (
    <ContextMenuCtx.Provider value={{ open, close }}>
      {children}
      <span ref={anchor} hidden />
      {body && createPortal(
        <DropdownMenu.Root
          open={!!menuState}
          onOpenChange={(isOpen) => { if (!isOpen) close(); }}
        >
          {/* Virtual trigger: zero-size element at click coordinates */}
          <DropdownMenu.Trigger asChild>
            <div
              style={{
                position: 'fixed',
                top: pos.y,
                left: pos.x,
                width: 0,
                height: 0,
                pointerEvents: 'none',
              }}
            />
          </DropdownMenu.Trigger>

          {menuState && (
            <DropdownMenu.Portal container={body}>
              <DropdownMenu.Content
                className="atlas-ctx-menu"
                data-atlas-owner={ownerId}
                side="bottom"
                align="start"
                sideOffset={4}
                avoidCollisions
                collisionBoundary={menuState.collisionBoundary ?? []}
                collisionPadding={8}
                onContextMenu={(e) => e.preventDefault()}
                onCloseAutoFocus={(e) => returnFocusTo(menuState.returnFocus, e)}
              >
                {renderEntries(menuState.entries, close, { collisionBoundary: menuState.collisionBoundary, container: body })}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          )}
        </DropdownMenu.Root>,
        body,
      )}
    </ContextMenuCtx.Provider>
  );
};

// ── RingColorGrid (reusable custom menu entry) ──────────────────────────────

export function RingColorGrid({ tokenId, closeMenu }: { tokenId: string; closeMenu: () => void }): React.ReactElement {
  const setTokenRing = useAtlasStore((state) => state.setTokenRing);

  // Theme colours are read from Obsidian's hex variables; colours Obsidian does
  // not define fall back to fixed values.
  const colors: Array<{ name: string; cssVar?: string; fallback: string }> = [
    { name: t('menu.ring.blue'), cssVar: '--color-blue', fallback: '#086ddd' },
    { name: t('menu.ring.orange'), cssVar: '--color-orange', fallback: '#ec7500' },
    { name: t('menu.ring.red'), cssVar: '--color-red', fallback: '#e93147' },
    { name: t('menu.ring.yellow'), cssVar: '--color-yellow', fallback: '#e0ac00' },
    { name: t('menu.ring.brown'), fallback: '#a97142' },
    { name: t('menu.ring.purple'), cssVar: '--color-purple', fallback: '#7852ee' },
    { name: t('menu.ring.lime'), fallback: '#72ff5b' },
    { name: t('menu.ring.green'), cssVar: '--color-green', fallback: '#08b94e' },
    { name: t('menu.ring.pink'), cssVar: '--color-pink', fallback: '#d53984' },
    { name: t('menu.ring.cyan'), cssVar: '--color-cyan', fallback: '#00bfbc' },
    { name: t('menu.ring.gray'), fallback: '#ababab' },
    { name: t('menu.ring.white'), fallback: '#ffffff' },
  ];

  const resolveHex = (cssVar: string | undefined, fallback: string): string => {
    if (!cssVar) return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
    return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  };

  const handleSelect = (hex: string | null): void => {
    setTokenRing(tokenId, hex);
    closeMenu();
  };

  return (
    <div className="atlas-ring-grid">
      {colors.map((c) => {
        const hex = resolveHex(c.cssVar, c.fallback);
        return (
          <LabelTooltip key={c.name} label={t('menu.ringColour', { name: c.name })}>
            <button
              type="button"
              className="atlas-ring-swatch"
              style={{ background: hex }}
              onClick={() => handleSelect(hex)}
            />
          </LabelTooltip>
        );
      })}
      <LabelTooltip label={t('menu.clearRing')}>
        <button
          type="button"
          className="atlas-ring-swatch atlas-none"
          onClick={() => handleSelect(null)}
        />
      </LabelTooltip>
    </div>
  );
}
