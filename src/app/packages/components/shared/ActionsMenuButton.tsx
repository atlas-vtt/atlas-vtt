import React, { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { renderEntries, type ContextMenuEntry } from '../../../react/components/context-menu/AtlasContextMenu';
import { Button } from '../primitives/button';
import { LabelTooltip } from '../primitives/tooltip';
import { useExclusiveDropdown } from '../primitives/useExclusiveDropdown';

interface ActionsMenuButtonProps {
  /** Tooltip and accessible name of the trigger. */
  label: string;
  entries: ContextMenuEntry[];
  className?: string;
  /** The trigger's glyph; the "more actions" dots unless the menu is about one thing. */
  icon?: React.ComponentType;
}

/** An icon button that opens its entries in an Atlas menu below it; a "more actions" button unless given an icon. */
export function ActionsMenuButton({ label, entries, className, icon: Icon = MoreHorizontal }: ActionsMenuButtonProps): React.ReactElement {
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const { isOpen, setIsOpen, onCloseAutoFocus } = useExclusiveDropdown();

  return (
    <DropdownMenu.Root open={isOpen} onOpenChange={setIsOpen} modal={false}>
      <LabelTooltip label={label}>
        <DropdownMenu.Trigger asChild>
          <Button ref={setTrigger} variant="ghost" size="icon" className={className}>
            <Icon />
          </Button>
        </DropdownMenu.Trigger>
      </LabelTooltip>
      <DropdownMenu.Portal container={trigger?.closest<HTMLElement>('[role="dialog"], .modal') ?? trigger?.ownerDocument.body}>
        <DropdownMenu.Content
          className="atlas-ctx-menu atlas-ctx-menu--dropdown"
          side="bottom"
          align="end"
          sideOffset={4}
          collisionPadding={8}
          onCloseAutoFocus={(event) => {
            onCloseAutoFocus(event);
            // An entry that moved focus on (an input it opened) keeps it; the trigger takes it back only from nowhere.
            const focused = trigger?.ownerDocument.activeElement;
            if (focused && focused !== focused.ownerDocument.body && focused !== trigger && !focused.closest('[role="menu"]')) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => event.stopPropagation()}
        >
          {renderEntries(entries, () => setIsOpen(false))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
