import { useSyncExternalStore } from 'react';
import { lootRecipients, subscribeLootRecipients, type LootRecipient } from '../../../loot/lootRecipients';

/** The people at the table a rolled item can be handed to, kept up to date; none while nobody is connected. */
export function useLootRecipients(): readonly LootRecipient[] {
  return useSyncExternalStore(subscribeLootRecipients, lootRecipients, lootRecipients);
}
