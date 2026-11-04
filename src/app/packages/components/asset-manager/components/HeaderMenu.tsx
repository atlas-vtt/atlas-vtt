import React, { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '../../primitives/button';
import { LabelTooltip } from '../../primitives/tooltip';
import { useDialogEscape } from '../../primitives/useDialogEscape';

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
}

/**
 * A toolbar button that opens a menu below it. Closes on selection, Escape or a
 * click elsewhere. The trigger carries `atlas-active` while the menu is open.
 */
export function HeaderMenu({
  label, className = '', triggerClassName, triggerVariant = 'ghost', iconTrigger = false,
  triggerContent, align = 'end', items,
}: HeaderMenuProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const hasChoices = items.some((item) => item.checked !== undefined);

  useDialogEscape(rootRef, isOpen ? () => setIsOpen(false) : undefined);

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

  return (
    <div className={`atlas-am-menu-root ${className}`} ref={rootRef}>
      <LabelTooltip label={label}>
        <Button
          variant={triggerVariant}
          size={iconTrigger ? 'icon' : 'default'}
          className={`${triggerClassName} ${isOpen ? 'atlas-active' : ''}`}
          onClick={() => setIsOpen(!isOpen)}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label={label}
        >
          {triggerContent}
        </Button>
      </LabelTooltip>

      {isOpen && (
        <div className={`atlas-am-menu atlas-am-menu--${align}`} role="menu" aria-label={label}>
          {items.map((item) => (
            <React.Fragment key={item.key}>
              {item.separated && <div className="atlas-am-menu-divider" role="separator" />}
              <button
                type="button"
                role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
                aria-checked={item.checked}
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
