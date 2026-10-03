import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { renderEntries, type ContextMenuEntry } from '../components/context-menu/AtlasContextMenu';
import { useAtlasStore } from '../ViewStoreContext';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';

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
}

interface ContextMenuController {
  open: (entries: ContextMenuEntry[], position: { x: number; y: number }, options?: ContextMenuOptions) => void;
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
  entries: ContextMenuEntry[],
  position: { x: number; y: number },
): void {
  controllers[controllers.length - 1]?.open(entries, position);
}

export function closeContextMenuGlobal(): void {
  for (const controller of controllers) controller.close();
}

// ── Provider ────────────────────────────────────────────────────────────────

interface MenuState {
  entries: ContextMenuEntry[];
  position: { x: number; y: number };
  returnFocus: HTMLElement | null;
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

  const open = useCallback((entries: ContextMenuEntry[], position: { x: number; y: number }, options?: ContextMenuOptions): void => {
    setMenuState({ entries, position, returnFocus: options?.returnFocus ?? null });
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
                {renderEntries(menuState.entries, close)}
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
    { name: 'Blue', cssVar: '--color-blue', fallback: '#086ddd' },
    { name: 'Orange', cssVar: '--color-orange', fallback: '#ec7500' },
    { name: 'Red', cssVar: '--color-red', fallback: '#e93147' },
    { name: 'Yellow', cssVar: '--color-yellow', fallback: '#e0ac00' },
    { name: 'Brown', fallback: '#a97142' },
    { name: 'Purple', cssVar: '--color-purple', fallback: '#7852ee' },
    { name: 'Lime', fallback: '#72ff5b' },
    { name: 'Green', cssVar: '--color-green', fallback: '#08b94e' },
    { name: 'Pink', cssVar: '--color-pink', fallback: '#d53984' },
    { name: 'Cyan', cssVar: '--color-cyan', fallback: '#00bfbc' },
    { name: 'Gray', fallback: '#ababab' },
    { name: 'White', fallback: '#ffffff' },
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
          <LabelTooltip key={c.name} label={`Ring colour ${c.name}`}>
            <button
              type="button"
              className="atlas-ring-swatch"
              style={{ background: hex }}
              onClick={() => handleSelect(hex)}
            />
          </LabelTooltip>
        );
      })}
      <LabelTooltip label="Clear ring">
        <button
          type="button"
          className="atlas-ring-swatch atlas-none"
          onClick={() => handleSelect(null)}
        />
      </LabelTooltip>
    </div>
  );
}
