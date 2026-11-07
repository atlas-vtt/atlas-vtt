import type { LootDraw } from './lootRoller';

/** Someone at the table a rolled item can be handed to. */
export interface LootRecipient {
  id: string;
  name: string;
  /** The character they play; null while they play none, and then nothing can be handed to them. */
  character: string | null;
}

/** Whoever knows the people at the table: it lists them, hands an item over and says when the list changed. */
export interface LootRecipientSource {
  recipients(): LootRecipient[];
  /** False when the item could not be handed over (the recipient left, or plays no character). */
  give(recipientId: string, draw: LootDraw): boolean;
  subscribe(listener: () => void): () => void;
}

const NONE: readonly LootRecipient[] = [];
const listeners = new Set<() => void>();
let source: LootRecipientSource | null = null;
let stopListening: (() => void) | null = null;
let current: readonly LootRecipient[] = NONE;

function refresh(): void {
  current = source?.recipients() ?? NONE;
  for (const listener of [...listeners]) listener();
}

/** Names the source of recipients, or none: the loot roller then offers nobody. */
export function setLootRecipientSource(next: LootRecipientSource | null): void {
  stopListening?.();
  source = next;
  stopListening = next?.subscribe(refresh) ?? null;
  refresh();
}

/** The people an item can be handed to now; the same list while nothing changed. */
export function lootRecipients(): readonly LootRecipient[] {
  return current;
}

/** Hands `quantity` copies of the item over, each its own item in the book; says how many arrived. */
export function giveLoot(recipientId: string, draw: LootDraw, quantity = 1): number {
  let given = 0;
  while (given < quantity && source?.give(recipientId, draw)) given++;
  return given;
}

export function subscribeLootRecipients(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
