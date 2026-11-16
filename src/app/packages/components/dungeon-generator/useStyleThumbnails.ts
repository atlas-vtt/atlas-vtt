import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { DungeonStyleId } from '../../../dungeons/styleCatalog';
import type { DungeonJob, DungeonRendered } from '../../../dungeons/worker/dungeonJob';
import { sampleStyleCardsFor } from './sampleStyleCards';

/** Draws thumbnails off the main thread: the dungeon worker, which drops a group of them on request. */
export interface ThumbnailRenderer {
  thumbnail: (job: DungeonJob, group?: string) => Promise<DungeonRendered | null>;
  dropThumbnails: (group?: string) => void;
}


/** A card's art, in device pixels, and the device pixels per CSS pixel. */
export interface ThumbnailSize {
  width: number;
  height: number;
  ratio: number;
}

const NONE: ReadonlyMap<DungeonStyleId, ImageBitmap> = new Map();

/**
 * The style gallery's cards: each style drawn on one sample dungeon (`sampleStyleCards.ts`), the
 * same in every wizard of the app and drawn once per card size, `first` (the chosen style) first.
 * None while `size` is null.
 */
export function useStyleThumbnails(renderer: ThumbnailRenderer, size: ThumbnailSize | null, first: DungeonStyleId): ReadonlyMap<DungeonStyleId, ImageBitmap> {
  const cards = sampleStyleCardsFor(renderer);
  useSyncExternalStore(cards.subscribe, () => cards.version);
  const firstRef = useRef(first);
  firstRef.current = first;
  useEffect(() => {
    if (size) cards.want(size, firstRef.current);
  }, [cards, size]);
  return size ? cards.shown(size) : NONE;
}
