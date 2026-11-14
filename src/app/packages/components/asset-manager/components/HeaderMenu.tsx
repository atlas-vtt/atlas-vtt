import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '../../primitives/button';
import { LabelTooltip } from '../../primitives/tooltip';
import { useDialogEscape } from '../../primitives/useDialogEscape';
import { useMenuKeys } from '../hooks/useMenuKeys';
import type { ModShortcut } from '../utils/modShortcut';

export interface HeaderMenuItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  /** Muted text after the label, such as a count. */
  detail?: React.ReactNode;
  /** Set for choices; the chosen one shows a check. */
  checked?: boolean;
  /** Draws a divider above the item. */
  separated?: boolean;
  /** Shown but not offered, so the menu keeps its shape. */
  disabled?: boolean;
  onSelect: (() => void) | undefined;
}

/** Opens a header menu from outside it, as a shortcut does. */
export interface HeaderMenuHandle {
  /** Opens the menu with focus on its first item, as Down on its button does. */
  open: () => void;
}

export interface HeaderMenuProps {
  /** Tooltip and accessible name of the trigger. */
  label: string;
  className?: string;
  triggerClassName: string;
  triggerVariant?: 'ghost' | 'default';
  /** Square icon trigger instead of one sized by its content. */
  iconTrigger?: boolean;
  triggerContent: React.ReactNode;
  align?: 'start' | 'center' | 'end';
  items: HeaderMenuItem[];
  /** The key that opens the menu, shown in the button's tooltip; it is registered by whoever opens it through `handle`. */
  shortcut?: ModShortcut;
  handle?: React.Ref<HeaderMenuHandle> | undefined;
}

/**
 * A toolbar button that opens a menu below it. Closes on selection, Escape or a
 * click elsewhere. The trigger carries `atlas-active` while the menu is open.
 * From the keyboard it is a WAI-ARIA menu button: Down, Up, Enter or Space open
 * it on an item, the arrows move between items, Escape gives focus back.
 */
export function HeaderMenu({
  label, className = '', triggerClassName, triggerVariant = 'ghost', iconTrigger = false,
  triggerContent, align = 'end', items, shortcut, handle,
}: HeaderMenuProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hasChoices = items.some((item) => item.checked !== undefined);
  const keys = useMenuKeys(menuRef, isOpen, setIsOpen);
  useImperativeHandle(handle, () => ({ open: () => keys.openWith('first') }), [keys]);

  useDialogEscape(rootRef, isOpen ? () => {
    setIsOpen(false);
    if (menuRef.current?.contains(rootRef.current?.ownerDocument.activeElement ?? null)) triggerRef.current?.focus();
  } : undefined);

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    event.stopPropagation();
    keys.openWith(event.key === 'ArrowDown' ? 'first' : 'last');
  };

  useEffect(() => {
    if (!isOpen) return;
    const doc = rootRef.current?.ownerDocument ?? document;
    const onPointerDown = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    doc.addEventListener('pointerdown', onPointerDown);
    return () => doc.removeEventListener('pointerdown', onPointerDown);
  }, [isOpen]);

  const select = (item: HeaderMenuItem): void => {
    item.onSelect?.();
    setIsOpen(false);
  };

  // A click the keyboard made (Enter or Space: no pointer, `detail` 0) opens the menu on its first item.
  const toggle = (event: React.MouseEvent): void => {
    if (isOpen) setIsOpen(false);
    else if (event.detail === 0) keys.openWith('first');
    else setIsOpen(true);
  };

  return (
    <div className={`atlas-am-menu-root ${className}`} ref={rootRef}>
      <LabelTooltip label={label} {...(shortcut && { shortcut: shortcut.label })}>
        <Button
          ref={triggerRef}
          variant={triggerVariant}
          size={iconTrigger ? 'icon' : 'default'}
          className={`${triggerClassName} ${isOpen ? 'atlas-active' : ''}`}
          onClick={toggle}
          onKeyDown={handleTriggerKeyDown}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label={label}
          aria-keyshortcuts={shortcut?.aria}
        >
          {triggerContent}
        </Button>
      </LabelTooltip>

      {isOpen && (
        <div ref={menuRef} className={`atlas-am-menu atlas-am-menu--${align}`} role="menu" aria-label={label} onKeyDown={keys.onMenuKeyDown}>
          {items.map((item) => (
            <React.Fragment key={item.key}>
              {item.separated && <div className="atlas-am-menu-divider" role="separator" />}
              <button
                type="button"
                role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
                aria-checked={item.checked}
                tabIndex={-1}
                className={`atlas-am-menu-item ${item.checked ? 'atlas-checked' : ''}`}
                disabled={item.disabled}
                onClick={() => select(item)}
              >
                {hasChoices && <span className="atlas-am-menu-check">{item.checked && <Check />}</span>}
                {item.icon}
                <span className="atlas-am-menu-label">{item.label}</span>
                {item.detail !== undefined && <span className="atlas-am-menu-detail">{item.detail}</span>}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
