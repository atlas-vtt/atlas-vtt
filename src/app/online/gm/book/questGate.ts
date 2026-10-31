import type { BookQuest, QuestImage } from '../../protocol/index.ts';
import type { HashedRef } from '../assets/assetUses.ts';
import { gateSlot } from './gateSlot.ts';

/** What a quest's asset is read from for the store: a whole text's bytes, or an image's vault path. */
export type QuestAsset = { readonly bytes: Uint8Array<ArrayBuffer> } | { readonly path: string };

/** An image of a quest's text before it is stored for players: by hash. */
export type HandedImage = Omit<QuestImage, 'image'> & { readonly image: HashedRef };

/** A quest as Atlas hands it on, its whole text and images by hash; the table's books store them and name them by id (`StoredQuests`). */
export type HandedQuest = Omit<BookQuest, 'text' | 'images'> & { readonly text?: HashedRef; readonly images?: readonly HandedImage[] };

/** Answers which quests players are sent, and says when they may have changed. */
export interface QuestGate {
  /** The quests of the campaign being played as players read them, in the order the book shows them. */
  quests(): Promise<readonly HandedQuest[]>;
  /** What the asset `hash` a quest last answered names is read from (its whole text, an image of it); undefined for any other. */
  asset(hash: string): QuestAsset | undefined;
  /** Calls `listener` whenever the quests may be others; returns what stops it. */
  onChange(listener: () => void): () => void;
}

const NONE: readonly HandedQuest[] = [];
const slot = gateSlot<readonly HandedQuest[]>(NONE);
let current: QuestGate | null = null;

/**
 * Names who decides which quests players read: Atlas answers from the quest notes of the campaign
 * being played. A quest's text is the GM's, read from the note; players never write it. Without
 * a gate players are sent no quests.
 */
export function setQuestGate(next: QuestGate | null): void {
  current = next;
  slot.set(next === null ? null : { read: () => next.quests(), onChange: (listener) => next.onChange(listener) });
}

/** The quests players are sent now. */
export const gatedQuests = (): Promise<readonly HandedQuest[]> => slot.read();

/** What a quest's asset is read from, by hash; undefined without a gate or for a hash no quest names. */
export const gatedQuestAsset = (hash: string): QuestAsset | undefined => current?.asset(hash);

/** Calls `listener` whenever the quests may be others, also when the gate itself changes. */
export const onQuestsChange = (listener: () => void): (() => void) => slot.onChange(listener);
