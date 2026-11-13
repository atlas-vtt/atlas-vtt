import React, { useEffect, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { FilePlus } from 'lucide-react';
import { MENU_SEPARATOR, renderEntries, type ContextMenuEntry } from '../../../react/components/context-menu/AtlasContextMenu';
import { Button } from '../../../packages/components/primitives/button';
import { useExclusiveDropdown } from '../../../packages/components/primitives/useExclusiveDropdown';
import { cn } from '../../../../utils/cn';
import type { TemplateOffer } from './templateOffers';
import { t } from '../../../i18n';
import './create-statblock.scss';
import { portalHost } from '../../../host/portalHost';

export const CREATE_STATBLOCK_LABEL = t('statblockEditor.createStatblock');
/** Obsidian's icon for the entries that make a statblock. */
const CREATE_ICON = 'file-plus';

/** What stands muted beside an offer's name; nothing where it would only repeat the name ("Creature", "Creature"). */
function offerHint(offer: TemplateOffer): string | null {
  const hint = offer.detail.trim();
  return hint && hint.toLowerCase() !== offer.label.trim().toLowerCase() ? hint : null;
}

/**
 * The rows of a role menu (§7.3): context-menu geometry, each role's name with its template muted at the row's end,
 * then, under a line, the templates no role starts from.
 */
export function roleMenuEntries(offers: readonly TemplateOffer[], onChoose: (offer: TemplateOffer) => void): ContextMenuEntry[] {
  const row = (offer: TemplateOffer): ContextMenuEntry => {
    const hint = offerHint(offer);
    return { type: 'item', label: offer.label, ...(hint ? { detail: hint } : {}), onClick: () => onChoose(offer) };
  };
  const roles = offers.filter((offer) => offer.roleId !== undefined).map(row);
  const templates = offers.filter((offer) => offer.roleId === undefined).map(row);
  return roles.length > 0 && templates.length > 0 ? [...roles, MENU_SEPARATOR, ...templates] : [...roles, ...templates];
}

/** "Create statblock" in a context menu: the role menu opens from it, and with one choice it creates at once. */
export function createStatblockMenuEntry(offers: readonly TemplateOffer[], onChoose: (offer: TemplateOffer) => void): ContextMenuEntry {
  const [only] = offers;
  if (offers.length === 1 && only) {
    return { type: 'item', label: CREATE_STATBLOCK_LABEL, icon: CREATE_ICON, onClick: () => onChoose(only) };
  }
  return { type: 'submenu', label: CREATE_STATBLOCK_LABEL, icon: CREATE_ICON, children: roleMenuEntries(offers, onChoose) };
}

/** The menu's collection, at its top: switching it lists the roles of the collection chosen, and the menu stays open. */
export interface NewStatblockButtonProps {
  choices: readonly TemplateOffer[];
  onChoose: (offer: TemplateOffer) => void;
  /** Told when the role menu opens and closes, so a dialog leaves Escape to it meanwhile. */
  onMenuOpenChange?: ((open: boolean) => void) | undefined;
  className?: string | undefined;
}

/**
 * "New statblock…" in a dialog's footer: the role menu opens from it above
 * the button; with one choice the button creates at once.
 */
export function NewStatblockButton({ choices, onChoose, onMenuOpenChange, className }: NewStatblockButtonProps): React.JSX.Element {
  const { isOpen, setIsOpen, onCloseAutoFocus } = useExclusiveDropdown();
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  useEffect(() => { onMenuOpenChange?.(isOpen); }, [isOpen, onMenuOpenChange]);
  const [only] = choices;
  const classes = cn('atlas-sb-new-statblock', className);

  if (choices.length === 1 && only) {
    return (
      <Button type="button" variant="ghost" size="sm" className={classes} onClick={() => onChoose(only)}>
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
      <DropdownMenu.Portal container={portalHost(trigger?.ownerDocument)}>
        <DropdownMenu.Content
          className="atlas-ctx-menu atlas-sb-role-menu"
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
