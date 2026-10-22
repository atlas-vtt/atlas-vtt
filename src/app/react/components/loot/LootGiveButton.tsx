import React, { useRef } from 'react';
import { Gift } from 'lucide-react';
import { ActionsMenuButton } from '../../../packages/components/shared/ActionsMenuButton';
import { MENU_SEPARATOR, type ContextMenuEntry } from '../context-menu/AtlasContextMenu';
import { giveLoot, type LootRecipient } from '../../../loot/lootRecipients';
import type { LootDraw } from '../../../loot/lootRoller';
import { showNotice } from '../../../ui/notice';
import { t } from '../../../i18n';
import { useLootRecipients } from './useLootRecipients';
import { GiveQuantity, type GiveCount } from './GiveQuantity';

/** The item as a notice names it: "Rope", or "3 × Rope". */
function itemLabel(draw: LootDraw, quantity: number): string {
  return quantity > 1 ? t('loot.give.copies', { count: quantity, item: draw.name }) : draw.name;
}

function give(recipient: LootRecipient, draw: LootDraw, quantity: number): void {
  const given = giveLoot(recipient.id, draw, quantity);
  const values = { item: itemLabel(draw, given || quantity), name: recipient.name };
  showNotice(given > 0 ? t('loot.give.done', values) : t('loot.give.failed', values));
}

/** Each player with a character gets the whole quantity. */
function giveAll(recipients: readonly LootRecipient[], draw: LootDraw, quantity: number): void {
  let reached = 0;
  for (const recipient of recipients) {
    if (recipient.character !== null && giveLoot(recipient.id, draw, quantity) > 0) reached++;
  }
  const item = itemLabel(draw, quantity);
  showNotice(reached > 0 ? t('loot.give.doneAll', { item, count: reached }) : t('loot.give.failedAll', { item }));
}

/**
 * The quantity, everyone at once, then one row per person: their name and the character the item
 * goes to. Without a character there is nobody to hand it to.
 */
function giveMenuEntries(recipients: readonly LootRecipient[], draw: LootDraw, count: GiveCount): ContextMenuEntry[] {
  const resetCount = (): void => { count.value = 1; };
  return [
    { type: 'custom', render: () => <GiveQuantity count={count} /> },
    {
      type: 'item',
      label: t('loot.give.all'),
      icon: 'users',
      disabled: recipients.every((recipient) => recipient.character === null),
      onClick: () => { giveAll(recipients, draw, count.value); resetCount(); },
    },
    MENU_SEPARATOR,
    ...recipients.map((recipient): ContextMenuEntry => ({
      type: 'item',
      label: recipient.name,
      detail: recipient.character ?? t('loot.give.noCharacter'),
      disabled: recipient.character === null,
      onClick: () => { give(recipient, draw, count.value); resetCount(); },
    })),
  ];
}

interface LootGiveButtonProps {
  draw: LootDraw;
  className?: string;
}

/** Hands an item to the people at the table, one or all, as many as chosen; there is no button while nobody is there. */
export function LootGiveButton({ draw, className = 'atlas-loot-card__action' }: LootGiveButtonProps): React.ReactElement | null {
  const recipients = useLootRecipients();
  const count = useRef<GiveCount>({ value: 1 }).current;
  if (recipients.length === 0) return null;
  return <ActionsMenuButton label={t('loot.give.label')} icon={Gift} className={className} entries={giveMenuEntries(recipients, draw, count)} />;
}
