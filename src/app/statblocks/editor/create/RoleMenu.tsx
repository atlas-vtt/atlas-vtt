import React, { useEffect, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { FilePlus } from 'lucide-react';
import { renderEntries, type ContextMenuEntry } from '../../../react/components/context-menu/AtlasContextMenu';
import { Button } from '../../../packages/components/primitives/button';
import { useExclusiveDropdown } from '../../../packages/components/primitives/useExclusiveDropdown';
import { cn } from '../../../../utils/cn';
import type { RoleChoice } from './roleChoices';
import { t } from '../../../i18n';
import './create-statblock.scss';

export const CREATE_STATBLOCK_LABEL = t('statblockEditor.createStatblock');
/** Obsidian's icon for the entries that make a statblock. */
const CREATE_ICON = 'file-plus';

/** The template beside a role's name; none where it would only repeat the name ("Creature", "Creature"). */
function templateHint(choice: RoleChoice): string | null {
  const hint = choice.templateName.trim();
  return hint && hint.toLowerCase() !== choice.name.trim().toLowerCase() ? hint : null;
}

/** The rows of a role menu (§7.3): context-menu geometry, the role's name with its template muted at the row's end. */
export function roleMenuEntries(choices: readonly RoleChoice[], onChoose: (roleId: string) => void): ContextMenuEntry[] {
  return choices.map((choice): ContextMenuEntry => {
    const hint = templateHint(choice);
    return { type: 'item', label: choice.name, ...(hint ? { detail: hint } : {}), onClick: () => onChoose(choice.roleId) };
  });
}

/** "Create statblock" in a context menu: the role menu opens from it, and with one role it creates at once. */
export function createStatblockMenuEntry(choices: readonly RoleChoice[], onChoose: (roleId: string) => void): ContextMenuEntry {
  const [only] = choices;
  if (choices.length === 1 && only) {
    return { type: 'item', label: CREATE_STATBLOCK_LABEL, icon: CREATE_ICON, onClick: () => onChoose(only.roleId) };
  }
  return { type: 'submenu', label: CREATE_STATBLOCK_LABEL, icon: CREATE_ICON, children: roleMenuEntries(choices, onChoose) };
}

/** The menu's collection, at its top: switching it lists the roles of the collection chosen, and the menu stays open. */
export interface NewStatblockButtonProps {
  choices: readonly RoleChoice[];
  onChoose: (roleId: string) => void;
  /** Told when the role menu opens and closes, so a dialog leaves Escape to it meanwhile. */
  onMenuOpenChange?: ((open: boolean) => void) | undefined;
  className?: string | undefined;
}

/**
 * "New statblock…" in a dialog's footer: the role menu opens from it above
 * the button; with one role the button creates at once.
 */
export function NewStatblockButton({ choices, onChoose, onMenuOpenChange, className }: NewStatblockButtonProps): React.JSX.Element {
  const { isOpen, setIsOpen, onCloseAutoFocus } = useExclusiveDropdown();
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  useEffect(() => { onMenuOpenChange?.(isOpen); }, [isOpen, onMenuOpenChange]);
  const [only] = choices;
  const classes = cn('atlas-sb-new-statblock', className);

  if (choices.length === 1 && only) {
    return (
      <Button type="button" variant="ghost" size="sm" className={classes} onClick={() => onChoose(only.roleId)}>
        <FilePlus aria-hidden />
        {t('statblockEditor.newStatblock')}
      </Button>
    );
  }
  return (
    <DropdownMenu.Root open={isOpen} onOpenChange={setIsOpen} modal={false}>
      <DropdownMenu.Trigger asChild>
        <Button ref={setTrigger} type="button" variant="ghost" size="sm" className={classes}>
          <FilePlus aria-hidden />
          {t('statblockEditor.newStatblockMenu')}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal container={trigger?.ownerDocument.body}>
        <DropdownMenu.Content
          className="atlas-ctx-menu"
          side="top"
          align="start"
          sideOffset={4}
          collisionPadding={8}
          onCloseAutoFocus={onCloseAutoFocus}
          onEscapeKeyDown={(event) => event.stopPropagation()}
        >
          {renderEntries(roleMenuEntries(choices, onChoose), () => setIsOpen(false))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
