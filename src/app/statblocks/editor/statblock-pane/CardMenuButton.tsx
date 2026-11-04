import React, { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { renderEntries, type ContextMenuEntry } from '../../../react/components/context-menu/AtlasContextMenu';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { useExclusiveDropdown } from '../../../packages/components/primitives/useExclusiveDropdown';

interface CardMenuButtonProps {
  /** What the button shows. */
  children: React.ReactNode;
  className: string;
  /** Names the button in a tooltip (and for assistive technology) where its text does not say what it opens. */
  label?: string | undefined;
  disabled?: boolean | undefined;
  /** The menu's rows; read on every render, so rows with steppers stay current. */
  entries: () => ContextMenuEntry[];
  /** Called as the menu opens, before its rows are read, and as it closes. */
  onOpenChange?: ((open: boolean) => void) | undefined;
}

/** A button on the statblock card that opens an Atlas menu below it, its start under the button's start. */
export function CardMenuButton({ children, className, label, disabled, entries, onOpenChange }: CardMenuButtonProps): React.JSX.Element {
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const { isOpen, setIsOpen, onCloseAutoFocus } = useExclusiveDropdown();
  const open = (next: boolean): void => {
    onOpenChange?.(next);
    setIsOpen(next);
  };

  const triggerButton = (
    <DropdownMenu.Trigger asChild disabled={disabled}>
      <button ref={setTrigger} type="button" className={className}>
        {children}
      </button>
    </DropdownMenu.Trigger>
  );

  return (
    <DropdownMenu.Root open={isOpen} onOpenChange={open} modal={false}>
      {label === undefined ? triggerButton : <LabelTooltip label={label}>{triggerButton}</LabelTooltip>}
      <DropdownMenu.Portal container={trigger?.ownerDocument.body}>
        <DropdownMenu.Content
          className="atlas-ctx-menu atlas-ctx-menu--dropdown"
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={8}
          onCloseAutoFocus={onCloseAutoFocus}
          onEscapeKeyDown={(event) => event.stopPropagation()}
        >
          {isOpen && renderEntries(entries(), () => open(false))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
