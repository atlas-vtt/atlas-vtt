import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { LiveEntries, type ContextMenuEntries } from '../components/context-menu/AtlasContextMenu';
import { useAtlasStore } from '../ViewStoreContext';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { t } from '../../i18n';

// Re-export the entry type so consumers only import from this file
export type { ContextMenuEntries, ContextMenuEntry } from '../components/context-menu/AtlasContextMenu';

// ── Context + hook ──────────────────────────────────────────────────────────

export interface ContextMenuOptions {
  /**
   * Where focus goes when the menu closes and nothing else took it (a menu
   * opened from the keyboard, closed with Escape): the menu's own trigger is
   * a point and cannot hold focus.
   */
  returnFocus?: HTMLElement | null;
  /**
   * With entries given as a function: says when to read them again while the menu is open, so its own rows (not only a
   * submenu's) stay current; returns the unsubscribe. A rebuild that leaves nothing closes the menu.
   */
  subscribe?: (onChange: () => void) => () => void;
}

interface ContextMenuController {
  open: (entries: ContextMenuEntries, position: { x: number; y: number }, options?: ContextMenuOptions) => void;
  close: () => void;
}

const ContextMenuCtx = createContext<ContextMenuController | null>(null);

export const useContextMenu = (): ContextMenuController => {
  const ctx = useContext(ContextMenuCtx);
  if (!ctx) throw new Error('useContextMenu must be used inside <ContextMenuProvider>');
  return ctx;
};

// ── Global helpers (non-React callers like PIXI renderers) ──────────────────

/**
 * Every mounted provider registers here. The newest one serves callers outside
 * React, so a provider that unmounts never disables the ones still on screen.
 */
const controllers: ContextMenuController[] = [];

export function openContextMenuGlobal(
  entries: ContextMenuEntries,
  position: { x: number; y: number },
  options?: ContextMenuOptions,
): void {
  controllers[controllers.length - 1]?.open(entries, position, options);
}

export function closeContextMenuGlobal(): void {
  for (const controller of controllers) controller.close();
}

// ── Provider ────────────────────────────────────────────────────────────────

interface MenuState {
  entries: ContextMenuEntries;
  position: { x: number; y: number };
  returnFocus: HTMLElement | null;
  subscribe: ((onChange: () => void) => () => void) | undefined;
}

/** Focuses `element` where the menu left focus nowhere (on the body): a choice that moved focus keeps it there. */
function returnFocusTo(element: HTMLElement | null, event: Event): void {
  if (!element) return;
  event.preventDefault();
  const active = element.ownerDocument.activeElement;
  if (element.isConnected && (!active || active === element.ownerDocument.body)) element.focus();
}

export const ContextMenuProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [menuState, setMenuState] = useState<MenuState | null>(null);
  // The body of the document the provider renders in: a map in a popout opens its menus there.
  const [body, setBody] = useState<HTMLElement | null>(null);
  const anchor = useCallback((node: HTMLSpanElement | null): void => setBody(node?.ownerDocument.body ?? null), []);

  const close = useCallback((): void => setMenuState(null), []);

  const open = useCallback((entries: ContextMenuEntries, position: { x: number; y: number }, options?: ContextMenuOptions): void => {
    setMenuState({ entries, position, returnFocus: options?.returnFocus ?? null, subscribe: options?.subscribe });
  }, []);

  useEffect(() => {
    const controller: ContextMenuController = { open, close };
    controllers.push(controller);
    return () => {
      controllers.splice(controllers.indexOf(controller), 1);
    };
  }, [open, close]);

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
                side="bottom"
                align="start"
                sideOffset={4}
                avoidCollisions
                collisionPadding={8}
                onContextMenu={(e) => e.preventDefault()}
                onCloseAutoFocus={(e) => returnFocusTo(menuState.returnFocus, e)}
              >
                <LiveEntries entries={menuState.entries} subscribe={menuState.subscribe} onClose={close} closeWhenEmpty={typeof menuState.entries === 'function'} />
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
