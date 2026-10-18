import type { LootRecipient } from '../../../loot/lootRecipients';

/** Who listens for the people an item can be handed to, told only when that list reads otherwise. */
export class RecipientListeners {
  private readonly listeners = new Set<() => void>();
  private told = '[]';

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  /** The recipients as they are now: every listener is told when they changed since last told. */
  tell(recipients: readonly LootRecipient[]): void {
    const told = JSON.stringify(recipients);
    if (told === this.told) return;
    this.told = told;
    for (const listener of [...this.listeners]) listener();
  }
}
